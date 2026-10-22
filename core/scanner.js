// core/scanner.js
// Scans all forward station pairs using any provider. No Chrome APIs.

export function pairKey(train, date, seatClass, from, to) {
  return `${train}|${date}|${seatClass}|${from}|${to}`;
}

/**
 * Create a scanner. Call scanner.start(), pause(), resume(), stop().
 *
 * @param {Object} config
 * @param {Object} config.provider  Must have getAvailability(train,date,class,from,to)
 * @param {string} config.train
 * @param {string} config.date
 * @param {string} config.seatClass
 * @param {string[]} config.stops
 * @param {Function} [config.onProgress]  Called after each pair with (done, total, pair, result)
 * @param {number} [config.delayMs=300]   Pause between requests (be polite to servers)
 */
export function createScanner(config) {
  const { provider, train, date, seatClass, stops, onProgress, delayMs = 300 } = config;

  const cache = new Map();
  let paused = false;
  let stopped = false;

  const pairs = [];
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      pairs.push([stops[i], stops[j]]);
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function start() {
    stopped = false;
    let done = 0;

    for (const [from, to] of pairs) {
      if (stopped) break;
      while (paused && !stopped) await sleep(100);
      if (stopped) break;

      const key = pairKey(train, date, seatClass, from, to);
      let result = cache.get(key);

      // Only reuse successful results. Failed queries get retried on rescan.
      if (!result || result.status === "failed") {
        try {
          result = await provider.getAvailability(train, date, seatClass, from, to);
        } catch (err) {
          result = { status: "failed", error: String(err), checkedAt: new Date().toISOString() };
        }
        cache.set(key, result);
        if (delayMs > 0) await sleep(delayMs);
      }

      done++;
      if (onProgress) onProgress(done, pairs.length, [from, to], result);
    }

    return { completed: !stopped, total: pairs.length, cache };
  }

  return {
    start,
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    stop: () => { stopped = true; paused = false; },
    getResults: () => cache,
    totalPairs: pairs.length,
  };
}

/**
 * Convert scanner cache into the availability map that findRoutes() expects:
 * { "from|to": { status, seats, fare } }
 */
export function toAvailabilityMap(cache, train, date, seatClass) {
  const prefix = `${train}|${date}|${seatClass}|`;
  const map = {};
  for (const [key, value] of cache.entries()) {
    if (key.startsWith(prefix)) {
      map[key.slice(prefix.length)] = value;
    }
  }
  return map;
}
