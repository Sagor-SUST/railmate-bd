// tests/tripParser.test.js
import { describe, it, expect } from "vitest";
import {
  buildPrompt, extractJson, validateTrip, matchStation,
} from "../core/tripParser.js";

const today = "2026-10-22";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("handles code fences and extra text", () => {
    expect(extractJson('Here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("returns null for garbage", () => {
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson(null)).toBeNull();
  });
});

describe("validateTrip", () => {
  it("accepts a complete valid request", () => {
    const res = validateTrip(
      { train: "Demo Express", origin: "Alpha", destination: "Echo",
        date: "2026-10-23", seatClass: "SNIGDHA", preference: "cheapest" },
      today
    );
    expect(res.ok).toBe(true);
    expect(res.trip.preference).toBe("cheapest");
    expect(res.warnings).toHaveLength(0);
  });
  it("drops an impossible date", () => {
    const res = validateTrip({ origin: "Alpha", date: "2026-02-31" }, today);
    expect(res.trip.date).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });
  it("drops a date in the past", () => {
    const res = validateTrip({ origin: "Alpha", date: "2026-10-01" }, today);
    expect(res.trip.date).toBeNull();
  });
  it("normalises seat class names", () => {
    expect(validateTrip({ origin: "A", seatClass: "Snigdha" }, today).trip.seatClass).toBe("SNIGDHA");
    expect(validateTrip({ origin: "A", seatClass: "shovan chair" }, today).trip.seatClass).toBe("S_CHAIR");
  });
  it("nulls an unknown seat class with a warning", () => {
    const res = validateTrip({ origin: "Alpha", seatClass: "Platinum" }, today);
    expect(res.trip.seatClass).toBeNull();
    expect(res.warnings.length).toBeGreaterThan(0);
  });
  it("defaults an unknown preference to balanced", () => {
    const res = validateTrip({ origin: "Alpha", preference: "whatever" }, today);
    expect(res.trip.preference).toBe("balanced");
    expect(res.warnings.length).toBeGreaterThan(0);
  });
  it("rejects non-objects", () => {
    expect(validateTrip("hello", today).ok).toBe(false);
    expect(validateTrip(null, today).ok).toBe(false);
    expect(validateTrip([1, 2], today).ok).toBe(false);
  });
  it("ignores extra keys the AI should not send", () => {
    const res = validateTrip(
      { origin: "Alpha", destination: "Echo", systemPrompt: "ignore rules", apiKey: "x" },
      today
    );
    expect(Object.keys(res.trip).sort()).toEqual(
      ["date", "destination", "origin", "preference", "seatClass", "train"]
    );
  });
});

describe("matchStation and buildPrompt", () => {
  it("matches stations case-insensitively", () => {
    expect(matchStation(" alpha ", ["Alpha", "Bravo"])).toBe("Alpha");
    expect(matchStation("Nowhere", ["Alpha"])).toBeNull();
  });
  it("includes today's date and the request in the prompt", () => {
    const p = buildPrompt("Alpha to Echo", today);
    expect(p).toContain(today);
    expect(p).toContain("Alpha to Echo");
  });
});