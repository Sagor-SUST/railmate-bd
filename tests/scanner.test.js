// tests/scanner.test.js
import { describe, it, expect, vi } from "vitest";
import { createScanner, toAvailabilityMap } from "../core/scanner.js";
import * as mockProvider from "../extension/providers/mockProvider.js";
import { findRoutes } from "../core/routeFinder.js";

const stops = ["Alpha", "Bravo", "Charlie", "Delta"];

describe("scanner", () => {
  it("scans every forward pair exactly once", async () => {
    const provider = {
      getAvailability: vi.fn(async () => ({ status: "available", seats: 5, fare: 100 })),
    };
    const scanner = createScanner({
      provider, train: "T1", date: "2026-11-01", seatClass: "SNIGDHA", stops, delayMs: 0,
    });
    const res = await scanner.start();
    // 4 stops -> 6 pairs
    expect(scanner.totalPairs).toBe(6);
    expect(provider.getAvailability).toHaveBeenCalledTimes(6);
    expect(res.completed).toBe(true);
  });

  it("does not repeat successful requests on rescan", async () => {
    const provider = {
      getAvailability: vi.fn(async () => ({ status: "available", seats: 5, fare: 100 })),
    };
    const scanner = createScanner({
      provider, train: "T1", date: "2026-11-01", seatClass: "SNIGDHA", stops, delayMs: 0,
    });
    await scanner.start();
    await scanner.start();
    expect(provider.getAvailability).toHaveBeenCalledTimes(6);
  });

  it("retries failed requests on rescan and never treats them as zero", async () => {
    let calls = 0;
    const provider = {
      getAvailability: vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error("network down");
        return { status: "available", seats: 3, fare: 50 };
      }),
    };
    const scanner = createScanner({
      provider, train: "T1", date: "2026-11-01", seatClass: "SNIGDHA", stops, delayMs: 0,
    });
    await scanner.start();
    const firstKey = "T1|2026-11-01|SNIGDHA|Alpha|Bravo";
    expect(scanner.getResults().get(firstKey).status).toBe("failed");
    await scanner.start();
    expect(scanner.getResults().get(firstKey).status).toBe("available");
  });

  it("stops when stop() is called", async () => {
    const provider = {
      getAvailability: vi.fn(async () => ({ status: "available", seats: 1, fare: 10 })),
    };
    const scanner = createScanner({
      provider, train: "T1", date: "2026-11-01", seatClass: "SNIGDHA", stops, delayMs: 0,
      onProgress: (done) => { if (done === 2) scanner.stop(); },
    });
    const res = await scanner.start();
    expect(res.completed).toBe(false);
    expect(provider.getAvailability).toHaveBeenCalledTimes(2);
  });

  it("works end to end with the simulated provider", async () => {
    const { stops: mockStops } = await mockProvider.getStops("demo");
    const scanner = createScanner({
      provider: mockProvider, train: "000", date: "2026-11-01", seatClass: "SNIGDHA",
      stops: mockStops, delayMs: 0,
    });
    await scanner.start();
    const map = toAvailabilityMap(scanner.getResults(), "000", "2026-11-01", "SNIGDHA");
    const res = findRoutes(mockStops, map, mockStops[0], mockStops[mockStops.length - 1]);
    expect(res.ok).toBe(true);
    // Every cell must be flagged as simulated.
    for (const cell of Object.values(map)) {
      expect(cell.simulated).toBe(true);
    }
  });
});

