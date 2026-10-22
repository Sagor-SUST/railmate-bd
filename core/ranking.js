// core/ranking.js
// Ranks routes returned by findRoutes(). Pure logic, no browser APIs.

export const DEFAULT_WEIGHTS = {
  tickets: 40, // fewer separate tickets is better
  fare: 30, // lower total fare is better
  seats: 20, // more seats left on the tightest segment is better
  extra: 10, // less travel beyond the requested journey is better
};

/**
 * Scale a value to 0..1 where the lowest value in the list gets 1 (best).
 * If all values are equal, everything gets 1.
 */
function lowerIsBetter(value, min, max) {
  if (max === min) return 1;
  return 1 - (value - min) / (max - min);
}

function higherIsBetter(value, min, max) {
  if (max === min) return 1;
  return (value - min) / (max - min);
}

/**
 * @param {Array} routes   Output of findRoutes().routes
 * @param {Object} [weights]  Override DEFAULT_WEIGHTS, e.g. { fare: 60, tickets: 20 }
 * @returns {Array} routes sorted best-first, each with score and reasons[]
 */
export function rankRoutes(routes, weights = {}) {
  if (!routes || routes.length === 0) return [];

  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const tickets = routes.map((r) => r.ticketCount);
  const fares = routes.map((r) => r.totalFare);
  const seats = routes.map((r) => r.minSeats);
  const extras = routes.map((r) => r.extraStops ?? 0);

  const range = (arr) => [Math.min(...arr), Math.max(...arr)];
  const [tMin, tMax] = range(tickets);
  const [fMin, fMax] = range(fares);
  const [sMin, sMax] = range(seats);
  const [eMin, eMax] = range(extras);

  const scored = routes.map((r) => {
    const parts = {
      tickets: lowerIsBetter(r.ticketCount, tMin, tMax) * w.tickets,
      fare: lowerIsBetter(r.totalFare, fMin, fMax) * w.fare,
      seats: higherIsBetter(r.minSeats, sMin, sMax) * w.seats,
      extra: lowerIsBetter(r.extraStops ?? 0, eMin, eMax) * w.extra,
    };
    const score = parts.tickets + parts.fare + parts.seats + parts.extra;

    const reasons = [];
    reasons.push(
      r.ticketCount === 1
        ? "Single ticket for the whole journey."
        : `${r.ticketCount} separate tickets needed.`,
    );
    reasons.push(`Total fare: ${r.totalFare}.`);
    reasons.push(`Fewest seats left on any segment: ${r.minSeats}.`);
    if (r.ticketCount === tMin)
      reasons.push("Fewest tickets among all options.");
    if (r.totalFare === fMin)
      reasons.push("Lowest total fare among all options.");
    if (r.minSeats === sMax)
      reasons.push("Best seat availability among all options.");

    return { ...r, score: Math.round(score * 10) / 10, reasons };
  });

  // Higher score first. Ties: fewer tickets, then lower fare.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.ticketCount - b.ticketCount ||
      a.totalFare - b.totalFare,
  );

  return scored;
}
