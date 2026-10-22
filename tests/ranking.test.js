// tests/ranking.test.js
import { describe, it, expect } from "vitest";
import { rankRoutes } from "../core/ranking.js";

const single = { ticketCount: 1, totalFare: 500, minSeats: 4, segments: [] };
const splitCheap = {
  ticketCount: 2,
  totalFare: 420,
  minSeats: 6,
  segments: [],
};
const splitMany = { ticketCount: 4, totalFare: 400, minSeats: 2, segments: [] };

describe("rankRoutes", () => {
  it("returns an empty list for no routes", () => {
    expect(rankRoutes([])).toEqual([]);
  });

  it("ranks the four-ticket option last by default", () => {
    const ranked = rankRoutes([splitMany, splitCheap, single]);
    expect(ranked[0].ticketCount).toBe(2);
    expect(ranked[ranked.length - 1].ticketCount).toBe(4);
  });

  it("prefers a single ticket when ticket count is weighted heavily", () => {
    const ranked = rankRoutes([splitMany, splitCheap, single], {
      tickets: 80,
      fare: 10,
      seats: 5,
      extra: 5,
    });
    expect(ranked[0].ticketCount).toBe(1);
  });

  it("can prefer the cheapest route when fare weight is high", () => {
    const ranked = rankRoutes([single, splitCheap, splitMany], {
      fare: 90,
      tickets: 5,
      seats: 5,
      extra: 0,
    });
    expect(ranked[0].totalFare).toBe(400);
  });

  it("adds readable reasons to every route", () => {
    const ranked = rankRoutes([single, splitCheap]);
    expect(ranked[0].reasons.length).toBeGreaterThan(0);
    expect(typeof ranked[0].score).toBe("number");
  });

  it("handles a single route without dividing by zero", () => {
    const ranked = rankRoutes([single]);
    expect(ranked).toHaveLength(1);
    expect(Number.isFinite(ranked[0].score)).toBe(true);
  });
});
