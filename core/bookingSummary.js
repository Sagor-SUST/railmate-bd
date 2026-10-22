// core/bookingSummary.js
// Turns a ranked route into a plain summary for the user. No Chrome APIs.

/**
 * @param {Object} route  One item from rankRoutes()
 * @param {Object} map    Availability map ("from|to" -> cell)
 * @param {Object} [opts] { now: Date, staleMinutes: 15 }
 */
export function buildBookingSummary(route, map, opts = {}) {
  const now = opts.now ?? new Date();
  const staleMinutes = opts.staleMinutes ?? 15;

  let simulated = false;
  let oldest = null;
  let stale = false;

  const segments = route.segments.map((s, i) => {
    const cell = map[`${s.from}|${s.to}`] ?? {};
    if (cell.simulated) simulated = true;
    const checkedAt = cell.checkedAt ?? null;
    if (checkedAt) {
      const t = new Date(checkedAt);
      if (!oldest || t < oldest) oldest = t;
      if ((now - t) / 60000 > staleMinutes) stale = true;
    }
    return {
      ticketNumber: i + 1,
      from: s.from,
      to: s.to,
      fare: s.fare,
      seats: s.seats,
      checkedAt,
    };
  });

  const warnings = [];
  if (simulated) {
    warnings.push("SIMULATED data. These are not real seats or fares.");
  }
  if (route.ticketCount > 1) {
    warnings.push(
      "You would hold separate tickets. Seats are not guaranteed to be the same seat or coach, and you may need to change seats at the station where one ticket ends."
    );
    warnings.push(
      "If one ticket sells out while you book another, the journey will have a gap. Book the scarcest segment first."
    );
  }
  if (stale) {
    warnings.push(`Some checks are older than ${staleMinutes} minutes. Availability may have changed.`);
  }
  if (route.segments.some((s) => s.seats <= 2)) {
    warnings.push("At least one segment has very few seats left.");
  }
  warnings.push("Availability is not a reservation. Nothing is booked until the official site confirms it.");

  return {
    segments,
    ticketCount: route.ticketCount,
    totalFare: route.totalFare,
    oldestCheck: oldest ? oldest.toISOString() : null,
    simulated,
    warnings,
    // Book the segment with the fewest seats first.
    bookingOrder: [...segments].sort((a, b) => a.seats - b.seats).map((s) => s.ticketNumber),
  };
}