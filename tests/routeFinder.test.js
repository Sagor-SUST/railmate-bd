// tests/routeFinder.test.js
import { describe, it, expect } from "vitest";
import { findRoutes, validateStops, pairKey } from "../core/routeFinder.js";

// Fictional stations
const stops = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

function cell(seats, fare) {
  return { status: seats > 0 ? "available" : "zero", seats, fare };
}

describe("validateStops", () => {
  it("accepts a normal list", () => {
    expect(validateStops(stops).ok).toBe(true);
  });
  it("rejects fewer than 2 stops", () => {
    expect(validateStops(["Alpha"]).ok).toBe(false);
  });
  it("rejects duplicate stops", () => {
    expect(validateStops(["Alpha", "Bravo", "alpha"]).ok).toBe(false);
  });
});

describe("findRoutes", () => {
  it("finds the full-route ticket when available", () => {
    const availability = {
      [pairKey("Alpha", "Echo")]: cell(10, 500),
    };
    const res = findRoutes(stops, availability, "Alpha", "Echo");
    expect(res.ok).toBe(true);
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].ticketCount).toBe(1);
    expect(res.routes[0].totalFare).toBe(500);
  });

  it("finds a split-ticket combination when the full route is sold out", () => {
    const availability = {
      [pairKey("Alpha", "Echo")]: cell(0, 500),
      [pairKey("Alpha", "Charlie")]: cell(5, 250),
      [pairKey("Charlie", "Echo")]: cell(3, 260),
    };
    const res = findRoutes(stops, availability, "Alpha", "Echo");
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].ticketCount).toBe(2);
    expect(res.routes[0].totalFare).toBe(510);
    expect(res.routes[0].segments.map((s) => s.to)).toEqual([
      "Charlie",
      "Echo",
    ]);
  });

  it("returns no routes when a segment in the middle is unavailable", () => {
    const availability = {
      [pairKey("Alpha", "Bravo")]: cell(5, 100),
      [pairKey("Bravo", "Charlie")]: cell(0, 100),
      [pairKey("Charlie", "Echo")]: cell(5, 200),
    };
    const res = findRoutes(stops, availability, "Alpha", "Echo");
    expect(res.ok).toBe(true);
    expect(res.routes).toHaveLength(0);
  });

  it("never treats failed or unknown queries as available", () => {
    const availability = {
      [pairKey("Alpha", "Echo")]: { status: "failed", seats: 99, fare: 500 },
      [pairKey("Alpha", "Charlie")]: {
        status: "unknown",
        seats: 99,
        fare: 250,
      },
    };
    const res = findRoutes(stops, availability, "Alpha", "Echo");
    expect(res.routes).toHaveLength(0);
  });

  it("rejects an origin that comes after the destination", () => {
    const res = findRoutes(stops, {}, "Echo", "Alpha");
    expect(res.ok).toBe(false);
  });

  it("rejects stations that are not on the route", () => {
    const res = findRoutes(stops, {}, "Alpha", "Nowhere");
    expect(res.ok).toBe(false);
  });

  it("rejects a route with duplicate stops", () => {
    const res = findRoutes(["Alpha", "Bravo", "Alpha"], {}, "Alpha", "Bravo");
    expect(res.ok).toBe(false);
  });

  it("works for a sub-journey inside the train's route", () => {
    const availability = {
      [pairKey("Bravo", "Delta")]: cell(4, 300),
    };
    const res = findRoutes(stops, availability, "Bravo", "Delta");
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].segments[0].from).toBe("Bravo");
  });

  it("respects the maxTickets limit", () => {
    const availability = {
      [pairKey("Alpha", "Bravo")]: cell(5, 10),
      [pairKey("Bravo", "Charlie")]: cell(5, 10),
      [pairKey("Charlie", "Delta")]: cell(5, 10),
      [pairKey("Delta", "Echo")]: cell(5, 10),
    };
    const res = findRoutes(stops, availability, "Alpha", "Echo", {
      maxTickets: 3,
    });
    expect(res.routes).toHaveLength(0);
  });
});
