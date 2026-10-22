// tests/bookingSummary.test.js
import { describe, it, expect } from "vitest";
import { buildBookingSummary } from "../core/bookingSummary.js";

const now = new Date("2026-10-22T12:00:00Z");
const fresh = "2026-10-22T11:55:00Z";
const old = "2026-10-22T10:00:00Z";

function route(segs) {
  return {
    ticketCount: segs.length,
    totalFare: segs.reduce((n, s) => n + s.fare, 0),
    segments: segs,
  };
}

describe("buildBookingSummary", () => {
  it("lists every segment with fare and total", () => {
    const r = route([
      { from: "A", to: "C", fare: 100, seats: 5 },
      { from: "C", to: "E", fare: 120, seats: 1 },
    ]);
    const map = {
      "A|C": { checkedAt: fresh },
      "C|E": { checkedAt: fresh },
    };
    const s = buildBookingSummary(r, map, { now });
    expect(s.segments).toHaveLength(2);
    expect(s.totalFare).toBe(220);
    expect(s.bookingOrder).toEqual([2, 1]);
  });

  it("warns about split tickets and low seats", () => {
    const r = route([
      { from: "A", to: "C", fare: 100, seats: 5 },
      { from: "C", to: "E", fare: 120, seats: 1 },
    ]);
    const s = buildBookingSummary(r, {}, { now });
    expect(s.warnings.join(" ")).toContain("separate tickets");
    expect(s.warnings.join(" ")).toContain("very few seats");
  });

  it("flags simulated and stale data", () => {
    const r = route([{ from: "A", to: "E", fare: 200, seats: 9 }]);
    const map = { "A|E": { simulated: true, checkedAt: old } };
    const s = buildBookingSummary(r, map, { now });
    expect(s.simulated).toBe(true);
    expect(s.warnings.join(" ")).toContain("SIMULATED");
    expect(s.warnings.join(" ")).toContain("older than");
  });

  it("never says a ticket is booked", () => {
    const r = route([{ from: "A", to: "E", fare: 200, seats: 9 }]);
    const s = buildBookingSummary(r, {}, { now });
    expect(s.warnings.join(" ")).toContain("Nothing is booked");
  });
});