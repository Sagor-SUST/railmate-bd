// extension/providers/mockProvider.js
// SIMULATED DATA ONLY. Never present this as live seat availability.

export const PROVIDER_NAME = "mock";
export const IS_SIMULATED = true;

// Fictional train used for development.
export const MOCK_TRAIN = {
  name: "Demo Express (SIMULATED)",
  number: "000",
  stops: ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"],
};

// Small deterministic hash so the same query always gives the same fake result.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Get stops for a train. A live provider would fetch these from a verified source.
 */
export async function getStops(trainQuery) {
  return {
    ok: true,
    simulated: IS_SIMULATED,
    train: MOCK_TRAIN.name,
    stops: [...MOCK_TRAIN.stops],
  };
}

/**
 * Get availability and fare for one station pair.
 * Returns status: "available" | "zero" | "failed".
 * Some pairs deliberately fail so the UI can show failures separately from zero seats.
 */
export async function getAvailability(train, date, seatClass, from, to) {
  const key = `${train}|${date}|${seatClass}|${from}|${to}`;
  const h = hash(key);
  const checkedAt = new Date().toISOString();

  // About 1 in 12 queries "fails" to simulate network or rate-limit errors.
  if (h % 12 === 0) {
    return {
      status: "failed",
      simulated: IS_SIMULATED,
      error: "Simulated network error",
      checkedAt,
    };
  }

  // About 1 in 3 pairs are sold out.
  const seats = h % 3 === 0 ? 0 : (h % 20) + 1;

  // Fare grows with distance between stops (a simple fake formula).
  const stops = MOCK_TRAIN.stops;
  const distance = Math.abs(stops.indexOf(to) - stops.indexOf(from));
  const fare = distance * 120 + (h % 50);

  return {
    status: seats > 0 ? "available" : "zero",
    seats,
    fare,
    simulated: IS_SIMULATED,
    checkedAt,
  };
}
