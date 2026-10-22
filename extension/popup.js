import { buildBookingSummary } from "./core/bookingSummary.js";
import { buildPrompt, extractJson, validateTrip, matchStation } from "./core/tripParser.js";
import { createScanner, toAvailabilityMap } from "./core/scanner.js";
import { findRoutes } from "./core/routeFinder.js";
import { rankRoutes } from "./core/ranking.js";
import * as provider from "./providers/mockProvider.js";

const $ = (id) => document.getElementById(id);
let scanner = null;

const WEIGHTS = {
  balanced: undefined,
  cheapest: { fare: 70, tickets: 15, seats: 10, extra: 5 },
  fewest_tickets: { tickets: 70, fare: 15, seats: 10, extra: 5 },
};

function getStops() {
  return $("stops").value.split("\n").map((s) => s.trim()).filter(Boolean);
}

function fillSelects() {
  const stops = getStops();
  const prevFrom = $("origin").value;
  const prevTo = $("destination").value;
  for (const id of ["origin", "destination"]) {
    $(id).innerHTML = "";
    for (const s of stops) {
      const opt = document.createElement("option");
      opt.value = opt.textContent = s;
      $(id).appendChild(opt);
    }
  }
  $("origin").value = stops.includes(prevFrom) ? prevFrom : stops[0];
  $("destination").value = stops.includes(prevTo) ? prevTo : stops[stops.length - 1];
}

function drawMatrix(map) {
  const stops = getStops();
  const from = $("origin").value;
  const to = $("destination").value;
  const table = $("matrix");
  table.innerHTML = "";

  const head = table.insertRow();
  head.insertCell().textContent = "";
  for (const s of stops) {
    const th = document.createElement("th");
    th.textContent = s.slice(0, 5);
    th.title = s;
    head.appendChild(th);
  }

  stops.forEach((rowStop, i) => {
    const tr = table.insertRow();
    const th = document.createElement("th");
    th.textContent = rowStop.slice(0, 5);
    th.title = rowStop;
    tr.appendChild(th);

    stops.forEach((colStop, j) => {
      const td = tr.insertCell();
      if (j <= i) { td.textContent = "-"; td.className = "unknown"; return; }
      const cell = map[`${rowStop}|${colStop}`];
      if (!cell) { td.textContent = "?"; td.className = "unknown"; }
      else if (cell.status === "available") {
        td.textContent = cell.seats; td.className = "available";
        td.title = `Fare ${cell.fare} | checked ${cell.checkedAt} | SIMULATED`;
      } else if (cell.status === "zero") {
        td.textContent = "0"; td.className = "zero";
      } else {
        td.textContent = "!"; td.className = "failed";
        td.title = cell.error || "Query failed";
      }
      if (rowStop === from && colStop === to) td.classList.add("intended");
    });
  });
}

function drawRoutes(map) {
  const box = $("routes");
  box.innerHTML = "";
  const res = findRoutes(getStops(), map, $("origin").value, $("destination").value);
  if (!res.ok) { box.textContent = res.error; return; }
  const ranked = rankRoutes(res.routes, WEIGHTS[$("preference").value]);
  if (ranked.length === 0) {
    box.textContent = "No complete route found with the data checked so far.";
    return;
  }
  ranked.slice(0, 5).forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    const h = document.createElement("h3");
    h.textContent = `#${idx + 1}: ${r.ticketCount} ticket(s), total fare ${r.totalFare} (score ${r.score})`;
    card.appendChild(h);
    const ul = document.createElement("ul");
    r.segments.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.from} to ${s.to}: fare ${s.fare}, ${s.seats} seats`;
      ul.appendChild(li);
    });
    card.appendChild(ul);
    const why = document.createElement("div");
    why.className = "why";
    why.textContent = r.reasons.join(" ");
    card.appendChild(why);
    const sim = document.createElement("div");
    sim.className = "sim";
    sim.textContent = "SIMULATED data. Not live availability. Nothing is booked.";
    card.appendChild(sim);
    const pick = document.createElement("button");
    pick.textContent = "Show booking summary";
    pick.addEventListener("click", () => showSummary(r, map));
    card.appendChild(pick);
    box.appendChild(card);
  });
}

function setRunning(running) {
  $("scan").disabled = running;
  $("pause").disabled = !running;
  $("stop").disabled = !running;
}

async function runScan() {
  const stops = getStops();
  const check = findRoutes(stops, {}, $("origin").value, $("destination").value);
  if (!check.ok) { $("status").textContent = check.error; return; }

  const train = $("train").value.trim();
  const date = $("date").value;
  const seatClass = $("seatClass").value;

  scanner = createScanner({
    provider, train, date, seatClass, stops, delayMs: 150,
    onProgress: (done, total) => {
      $("progress").max = total;
      $("progress").value = done;
      $("status").textContent = `Scanned ${done} of ${total} pairs...`;
      const map = toAvailabilityMap(scanner.getResults(), train, date, seatClass);
      drawMatrix(map);
    },
  });

  setRunning(true);
  const res = await scanner.start();
  setRunning(false);
  const map = toAvailabilityMap(scanner.getResults(), train, date, seatClass);
  drawMatrix(map);
  drawRoutes(map);
  $("status").textContent = res.completed ? "Scan complete (simulated data)." : "Scan stopped.";
}

$("scan").addEventListener("click", runScan);
$("pause").addEventListener("click", () => {
  if ($("pause").textContent === "Pause") {
    scanner.pause(); $("pause").textContent = "Resume"; $("status").textContent = "Paused.";
  } else {
    scanner.resume(); $("pause").textContent = "Pause";
  }
});
$("stop").addEventListener("click", () => { scanner?.stop(); $("pause").textContent = "Pause"; });
$("stops").addEventListener("change", () => { fillSelects(); drawMatrix({}); });
$("origin").addEventListener("change", () => drawMatrix({}));
$("destination").addEventListener("change", () => drawMatrix({}));

async function init() {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  $("date").value = tomorrow;
  const info = await provider.getStops($("train").value);
  $("stops").value = info.stops.join("\n");
  fillSelects();
  drawMatrix({});
}
init();

// ---------- AI trip parsing ----------
function todayLocal() {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
}

function askBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp || { ok: false, error: "No response." });
    });
  });
}

function applyTrip(trip, warnings) {
  const stops = getStops();
  const lines = [];
  if (trip.train) { $("train").value = trip.train; lines.push(`Train: ${trip.train}`); }
  const from = matchStation(trip.origin, stops);
  const to = matchStation(trip.destination, stops);
  if (from) { $("origin").value = from; lines.push(`From: ${from}`); }
  else if (trip.origin) warnings.push(`"${trip.origin}" is not in the stop list. Edit the stops or pick a station.`);
  if (to) { $("destination").value = to; lines.push(`To: ${to}`); }
  else if (trip.destination) warnings.push(`"${trip.destination}" is not in the stop list. Edit the stops or pick a station.`);
  if (trip.date) { $("date").value = trip.date; lines.push(`Date: ${trip.date}`); }
  if (trip.seatClass) { $("seatClass").value = trip.seatClass; lines.push(`Class: ${trip.seatClass}`); }
  $("preference").value = trip.preference;
  lines.push(`Priority: ${trip.preference}`);
  drawMatrix({});
  $("aiReview").textContent = [
    "Interpreted request. Please check before scanning:",
    ...lines,
    ...warnings.map((w) => `Warning: ${w}`),
  ].join("\n");
}

async function understandTrip() {
  const text = $("nl").value.trim();
  if (!text) { $("aiStatus").textContent = "Type a trip request first."; return; }
  $("understand").disabled = true;
  $("aiReview").textContent = "";
  $("aiStatus").textContent = "Asking Gemini...";
  const resp = await askBackground({ type: "parseTrip", prompt: buildPrompt(text, todayLocal()) });
  $("understand").disabled = false;
  if (!resp.ok) {
    $("aiStatus").textContent = `AI unavailable: ${resp.error} You can fill the form by hand.`;
    return;
  }
  const result = validateTrip(extractJson(resp.text), todayLocal());
  if (!result.ok) {
    $("aiStatus").textContent = `Could not understand the request. ${result.warnings.join(" ")} Please fill the form by hand.`;
    return;
  }
  $("aiStatus").textContent = "Done. Review the fields below, then press Scan.";
  applyTrip(result.trip, [...result.warnings]);
}

$("understand").addEventListener("click", understandTrip);
$("saveKey").addEventListener("click", async () => {
  const v = $("geminiKey").value.trim();
  if (!v) { $("keyStatus").textContent = "Paste a key first."; return; }
  await chrome.storage.local.set({ geminiKey: v });
  $("geminiKey").value = "";
  $("keyStatus").textContent = "Key saved.";
});
$("removeKey").addEventListener("click", async () => {
  await chrome.storage.local.remove("geminiKey");
  $("keyStatus").textContent = "Key removed.";
});
chrome.storage.local.get("geminiKey").then(({ geminiKey }) => {
  if (geminiKey) $("keyStatus").textContent = "A key is saved.";
});

function showSummary(route, map) {
  const s = buildBookingSummary(route, map);
  const box = $("summary");
  box.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "summary";
  const table = document.createElement("table");
  const head = table.insertRow();
  for (const h of ["#", "From", "To", "Fare", "Seats", "Checked"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  }
  for (const seg of s.segments) {
    const tr = table.insertRow();
    const vals = [
      seg.ticketNumber, seg.from, seg.to, seg.fare, seg.seats,
      seg.checkedAt ? new Date(seg.checkedAt).toLocaleTimeString() : "unknown",
    ];
    for (const v of vals) tr.insertCell().textContent = v;
  }
  wrap.appendChild(table);
  const total = document.createElement("div");
  total.className = "total";
  total.textContent = `Estimated total: ${s.totalFare}`;
  wrap.appendChild(total);
  if (s.ticketCount > 1) {
    const order = document.createElement("div");
    order.className = "warn";
    order.textContent = `Suggested booking order (scarcest first): ticket ${s.bookingOrder.join(", then ")}.`;
    wrap.appendChild(order);
  }
  for (const w of s.warnings) {
    const p = document.createElement("div");
    p.className = "warn";
    p.textContent = w;
    wrap.appendChild(p);
  }
  const link = document.createElement("a");
  link.href = "https://eticket.railway.gov.bd/";
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Continue on the official booking website (you pay there yourself)";
  wrap.appendChild(link);
  box.appendChild(wrap);
}

// ---------- Cloud reminders ----------
async function workerCall(path, options = {}) {
  const { workerUrl, workerToken } = await chrome.storage.local.get(["workerUrl", "workerToken"]);
  if (!workerUrl || !workerToken) throw new Error("Save the Worker URL and API token under Reminder settings first.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(workerUrl.replace(/\/$/, "") + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Worker returned HTTP ${r.status}`);
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("The Worker did not respond in time.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

$("saveWorker").addEventListener("click", async () => {
  const url = $("workerUrl").value.trim();
  const token = $("workerToken").value.trim();
  if (!/^https:\/\//.test(url) || !token) {
    $("workerStatus").textContent = "Enter an https:// URL and a token.";
    return;
  }
  await chrome.storage.local.set({ workerUrl: url, workerToken: token });
  $("workerToken").value = "";
  $("workerStatus").textContent = "Settings saved.";
});

chrome.storage.local.get("workerUrl").then(({ workerUrl }) => {
  if (workerUrl) $("workerUrl").value = workerUrl;
});

async function loadReminders() {
  const box = $("reminderList");
  try {
    const { journeys } = await workerCall("/journeys");
    box.innerHTML = "";
    if (!journeys.length) { box.textContent = "No saved reminders."; return; }
    for (const j of journeys) {
      const card = document.createElement("div");
      card.className = "card";
      const h = document.createElement("h3");
      h.textContent = `${j.origin} to ${j.destination} on ${j.travel_date}`;
      card.appendChild(h);
      const info = document.createElement("div");
      info.className = "why";
      const est = j.release_is_estimate ? " (estimate)" : "";
      info.textContent =
        `Status: ${j.status}. Notify at ${new Date(j.notify_at).toLocaleString()}${est}. ` +
        `Attempts: ${j.attempts}.` +
        (j.sent_at ? ` Sent ${new Date(j.sent_at).toLocaleString()}.` : "") +
        (j.last_error ? ` Last error: ${j.last_error}` : "");
      card.appendChild(info);
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        try { await workerCall(`/journeys/${encodeURIComponent(j.id)}`, { method: "DELETE" }); }
        catch (err) { $("reminderStatus").textContent = err.message; }
        loadReminders();
      });
      card.appendChild(del);
      box.appendChild(card);
    }
  } catch (err) {
    box.textContent = "";
    $("reminderStatus").textContent = `Could not load reminders: ${err.message}`;
  }
}

$("refreshReminders").addEventListener("click", loadReminders);

$("saveReminder").addEventListener("click", async () => {
  const releaseLocal = $("releaseAt").value;
  if (!releaseLocal) { $("reminderStatus").textContent = "Choose the expected release time."; return; }
  const lead = parseInt($("leadMinutes").value, 10);
  if (!Number.isInteger(lead) || lead < 0 || lead > 1440) {
    $("reminderStatus").textContent = "Lead time must be 0 to 1440 minutes.";
    return;
  }
  $("reminderStatus").textContent = "Saving...";
  try {
    const res = await workerCall("/journeys", {
      method: "POST",
      body: JSON.stringify({
        origin: $("origin").value,
        destination: $("destination").value,
        travel_date: $("date").value,
        train: $("train").value.trim() || null,
        seat_class: $("seatClass").value,
        release_at: new Date(releaseLocal).toISOString(),
        release_is_estimate: $("releaseEstimate").checked,
        lead_minutes: lead,
      }),
    });
    $("reminderStatus").textContent = res.duplicate
      ? "This reminder already exists."
      : `Saved. You will be notified at ${new Date(res.notify_at).toLocaleString()}.`;
    loadReminders();
  } catch (err) {
    $("reminderStatus").textContent = `Could not save: ${err.message}`;
  }
});