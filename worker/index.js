// worker/index.js
// Cloudflare Worker: stores journeys in D1, sends reminders via ntfy on a cron schedule.
// It does NOT query the railway website.

const MAX_ATTEMPTS = 3;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function authorized(request, env) {
  const h = request.headers.get("Authorization") || "";
  return env.API_TOKEN && h === `Bearer ${env.API_TOKEN}`;
}

function isIso(s) {
  return typeof s === "string" && !Number.isNaN(new Date(s).getTime());
}

function cleanText(v, max = 80) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && t.length <= max ? t : null;
}

/** Validate and normalise a journey from the request body. */
export function validateJourney(b) {
  const origin = cleanText(b.origin);
  const destination = cleanText(b.destination);
  const travel_date = /^\d{4}-\d{2}-\d{2}$/.test(b.travel_date ?? "") ? b.travel_date : null;
  const train = b.train == null ? null : cleanText(b.train);
  const seat_class = b.seat_class == null ? null : cleanText(b.seat_class, 30);
  const lead = Number.isInteger(b.lead_minutes) ? b.lead_minutes : 30;

  if (!origin || !destination) return { error: "origin and destination are required" };
  if (!travel_date) return { error: "travel_date must be YYYY-MM-DD" };
  if (!isIso(b.release_at)) return { error: "release_at must be an ISO date-time" };
  if (lead < 0 || lead > 1440) return { error: "lead_minutes must be 0 to 1440" };

  const release = new Date(b.release_at);
  const notify = new Date(release.getTime() - lead * 60000);

  return {
    value: {
      origin, destination, travel_date, train, seat_class,
      release_at: release.toISOString(),
      release_is_estimate: b.release_is_estimate === false ? 0 : 1, // default: estimate
      lead_minutes: lead,
      notify_at: notify.toISOString(),
    },
  };
}

async function createJourney(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const v = validateJourney(body);
  if (v.error) return json({ error: v.error }, 400);
  const j = v.value;

  // Duplicate prevention: same trip and same notify time returns the existing job.
  const dup = await env.DB.prepare(
    `SELECT id FROM journeys
     WHERE origin = ? AND destination = ? AND travel_date = ?
       AND IFNULL(train,'') = IFNULL(?,'') AND IFNULL(seat_class,'') = IFNULL(?,'')
       AND notify_at = ? AND status IN ('pending','retrying')`
  ).bind(j.origin, j.destination, j.travel_date, j.train, j.seat_class, j.notify_at).first();
  if (dup) return json({ id: dup.id, duplicate: true });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO journeys
     (id, origin, destination, travel_date, train, seat_class, release_at,
      release_is_estimate, lead_minutes, notify_at, status, attempts, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', 0, ?)`
  ).bind(
    id, j.origin, j.destination, j.travel_date, j.train, j.seat_class, j.release_at,
    j.release_is_estimate, j.lead_minutes, j.notify_at, new Date().toISOString()
  ).run();

  return json({ id, notify_at: j.notify_at }, 201);
}

async function listJourneys(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, origin, destination, travel_date, train, seat_class, release_at,
            release_is_estimate, notify_at, status, attempts, last_attempt_at, last_error, sent_at
     FROM journeys ORDER BY notify_at DESC LIMIT 100`
  ).all();
  return json({ journeys: results });
}

async function deleteJourney(id, env) {
  const r = await env.DB.prepare(`DELETE FROM journeys WHERE id = ?`).bind(id).run();
  return json({ deleted: r.meta.changes > 0 });
}

function messageFor(j) {
  const est = j.release_is_estimate ? " (release time is an ESTIMATE, check the official site)" : "";
  const parts = [
    `${j.origin} to ${j.destination} on ${j.travel_date}`,
    j.train ? `Train: ${j.train}` : null,
    j.seat_class ? `Class: ${j.seat_class}` : null,
    `Tickets are expected to open at ${j.release_at}${est}.`,
    "This is only a reminder. Nothing has been booked.",
  ].filter(Boolean);
  return parts.join("\n");
}

async function sendNtfy(j, env) {
  const base = env.NTFY_SERVER || "https://ntfy.sh";
  const res = await fetch(`${base}/${encodeURIComponent(env.NTFY_TOPIC)}`, {
    method: "POST",
    headers: { Title: "RailMate reminder", Priority: "high", Click: "https://eticket.railway.gov.bd/" },
    body: messageFor(j),
  });
  if (!res.ok) throw new Error(`ntfy returned HTTP ${res.status}`);
}

/** Runs on the cron schedule. */
export async function runDueReminders(env, now = new Date()) {
  const nowIso = now.toISOString();
  const { results } = await env.DB.prepare(
    `SELECT * FROM journeys
     WHERE status IN ('pending','retrying') AND notify_at <= ?
     ORDER BY notify_at LIMIT 20`
  ).bind(nowIso).all();

  for (const j of results) {
    // Claim the job first so two overlapping runs can't both send it.
    const claim = await env.DB.prepare(
      `UPDATE journeys SET status = 'sending', attempts = attempts + 1, last_attempt_at = ?
       WHERE id = ? AND status IN ('pending','retrying')`
    ).bind(nowIso, j.id).run();
    if (claim.meta.changes === 0) continue;

    try {
      await sendNtfy(j, env);
      await env.DB.prepare(
        `UPDATE journeys SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?`
      ).bind(new Date().toISOString(), j.id).run();
    } catch (err) {
      const attempts = j.attempts + 1;
      const next = attempts >= MAX_ATTEMPTS ? "failed" : "retrying";
      await env.DB.prepare(
        `UPDATE journeys SET status = ?, last_error = ? WHERE id = ?`
      ).bind(next, String(err.message || err).slice(0, 200), j.id).run();
    }
  }
}

export default {
  async fetch(request, env) {
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);

    if (url.pathname === "/journeys" && request.method === "POST") return createJourney(request, env);
    if (url.pathname === "/journeys" && request.method === "GET") return listJourneys(env);
    if (url.pathname.startsWith("/journeys/") && request.method === "DELETE") {
      return deleteJourney(url.pathname.slice("/journeys/".length), env);
    }
    return json({ error: "Not found" }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDueReminders(env));
  },
};

