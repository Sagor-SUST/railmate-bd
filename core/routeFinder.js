// core/routeFinder.js
// Pure algorithm: no browser or Chrome APIs. Works in Node and in the extension.

/**
 * Validate the ordered stop list.
 * Returns { ok: true } or { ok: false, error: "..." }.
 */
export function validateStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2) {
    return { ok: false, error: "At least 2 stops are required." };
  }
  const seen = new Set();
  for (const s of stops) {
    if (typeof s !== "string" || s.trim() === "") {
      return { ok: false, error: "Stop names must be non-empty strings." };
    }
    const key = s.trim().toLowerCase();
    if (seen.has(key)) {
      return { ok: false, error: `Duplicate stop: ${s}` };
    }
    seen.add(key);
  }
  return { ok: true };
}

/**
 * Build the availability key for a station pair.
 */
export function pairKey(from, to) {
  return `${from}|${to}`;
}

/**
 * Find all valid ticket combinations covering origin -> destination.
 *
 * @param {string[]} stops  Ordered stops of the train, e.g. ["A","B","C","D"].
 * @param {Object}   availability  Map of "from|to" -> {
 *        status: "available" | "zero" | "unknown" | "failed",
 *        seats: number, fare: number }
 * @param {string}   origin       User's origin (must be in stops).
 * @param {string}   destination  User's destination (must be in stops).
 * @param {Object}   [options]
 * @param {number}   [options.maxTickets=4]  Max segments in a combination.
 * @param {number}   [options.minSeats=1]    Min seats needed on every segment.
 * @returns {{ ok: boolean, error?: string, routes: Array }}
 */
export function findRoutes(
  stops,
  availability,
  origin,
  destination,
  options = {},
) {
  const { maxTickets = 4, minSeats = 1 } = options;

  const check = validateStops(stops);
  if (!check.ok) return { ok: false, error: check.error, routes: [] };

  const from = stops.indexOf(origin);
  const to = stops.indexOf(destination);

  if (from === -1)
    return { ok: false, error: `Origin not on route: ${origin}`, routes: [] };
  if (to === -1)
    return {
      ok: false,
      error: `Destination not on route: ${destination}`,
      routes: [],
    };
  if (from >= to) {
    return {
      ok: false,
      error: "Origin must come before destination on this train's route.",
      routes: [],
    };
  }

  const routes = [];

  // Depth-first search over stop indices. Each step is one ticket i -> j with i < j.
  function dfs(current, path) {
    if (current === to) {
      routes.push(path.map((seg) => ({ ...seg })));
      return;
    }
    if (path.length >= maxTickets) return;

    for (let next = current + 1; next <= to; next++) {
      const key = pairKey(stops[current], stops[next]);
      const cell = availability[key];

      // Only verified, available segments count. Failed/unknown is never treated as available.
      if (!cell || cell.status !== "available" || cell.seats < minSeats)
        continue;

      path.push({
        from: stops[current],
        to: stops[next],
        fromIndex: current,
        toIndex: next,
        fare: cell.fare,
        seats: cell.seats,
      });
      dfs(next, path);
      path.pop();
    }
  }

  dfs(from, []);

  const result = routes.map((segments) => ({
    segments,
    ticketCount: segments.length,
    totalFare: segments.reduce((sum, s) => sum + (s.fare ?? 0), 0),
    minSeats: Math.min(...segments.map((s) => s.seats)),
  }));

  return { ok: true, routes: result };
}
