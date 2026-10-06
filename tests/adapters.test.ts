import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizePredictions } from "../src/services/coops";
import { normalizeHour } from "../src/services/weatherService";
import { parseObservation } from "../src/services/ndbc";
import {
  feet,
  fahrenheit,
  knots,
  nearby,
  tideNow,
  timeLabel,
  timezone,
  numeric,
  calendarDays,
} from "../src/utils";
import { cached } from "../src/services/cache";
import tideFixture from "./fixtures/tides.json";
import weatherFixture from "./fixtures/weather.json";
import buoyFixture from "./fixtures/buoy.txt?raw";
const station = { id: "51202", name: "Mokapu Point", lat: 21.4, lon: -157.7 };
describe("government response adapters", () => {
  it("normalizes real CO-OPS GMT timestamps and feet", () => {
    const p = normalizePredictions(tideFixture);
    expect(p[0]).toEqual({
      time: Date.parse("2026-10-05T00:00:00Z"),
      height: 1.838,
    });
  });
  it("extracts high/low events and rejects missing heights", () => {
    expect(
      normalizePredictions({
        predictions: [
          { t: "2026-10-05 00:00", v: "1.2", type: "H" },
          { t: "2026-10-05 02:00", v: "", type: "L" },
        ],
      }),
    ).toEqual([
      { time: Date.parse("2026-10-05T00:00Z"), height: 1.2, kind: "High" },
    ]);
    expect(() =>
      normalizePredictions({ error: { message: "Invalid station" } }),
    ).toThrow("Invalid station");
  });
  it("normalizes real hourly forecast and missing rain", () => {
    expect(normalizeHour(weatherFixture[0]).time).toBe(
      Date.parse(weatherFixture[0].startTime),
    );
    expect(
      normalizeHour({
        ...weatherFixture[0],
        temperature: null,
        probabilityOfPrecipitation: { value: null },
      }),
    ).toMatchObject({ temperature: null, rain: null });
  });
  it("parses real NDBC text, preserving missing sensors", () => {
    const p = parseObservation(buoyFixture, station);
    expect(p.waveFeet).toBeCloseTo(feet(1.2));
    expect(p.waterF).toBeCloseTo(80.6);
    expect(p.windKnots).toBeNull();
    expect(p.time).toBe(Date.parse("2026-10-06T18:56Z"));
  });
  it("skips malformed rows and handles all-missing readings", () => {
    expect(() =>
      parseObservation("#YY MM DD hh mm WVHT\n2026 13 99 00 00 1", station),
    ).toThrow();
    expect(
      parseObservation(
        "#YY MM DD hh mm WVHT\nbad\n2026 10 06 18 00 MM",
        station,
      ).waveFeet,
    ).toBeNull();
  });
});
describe("coastal calculations", () => {
  it("sorts stations by great-circle distance and filters inland points", () => {
    expect(
      nearby(
        [
          { ...station, id: "far", lat: 22 },
          { ...station, id: "near" },
        ],
        station,
      ).map((s) => s.id),
    ).toEqual(["near", "far"]);
    expect(nearby([station], { lat: 40, lon: -110 })).toEqual([]);
  });
  it("interpolates only bracketed samples and determines direction", () => {
    expect(
      tideNow(
        [
          { time: 0, height: 1 },
          { time: 1000, height: 2 },
        ],
        500,
      ),
    ).toEqual({ height: 1.5, trend: "Rising" });
    expect(
      tideNow(
        [
          { time: 0, height: 2 },
          { time: 1000, height: 1 },
        ],
        500,
      )?.trend,
    ).toBe("Falling");
    expect(tideNow([{ time: 0, height: 1 }], 500)).toBeNull();
  });
  it("converts units without converting missing values to zero", () => {
    expect(feet(1)).toBeCloseTo(3.28084);
    expect(fahrenheit(0)).toBe(32);
    expect(knots(1)).toBeCloseTo(1.94384);
    expect(numeric(null)).toBeNull();
    expect(numeric("")).toBeNull();
    expect(numeric("MM")).toBeNull();
    expect(numeric(0)).toBe(0);
  });
  it("advances calendar dates across daylight-saving fallback", () => {
    expect(
      calendarDays(Date.parse("2026-11-01T04:30Z"), "America/New_York", 3),
    ).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
  it("uses location timezones including daylight saving", () => {
    expect(timezone(21.393, -157.715)).toBe("Pacific/Honolulu");
    expect(timeLabel(Date.parse("2026-10-06T20:00Z"), "Pacific/Honolulu")).toBe(
      "10:00 AM",
    );
    expect(timeLabel(Date.parse("2026-07-06T20:00Z"), "America/New_York")).toBe(
      "4:00 PM",
    );
  });
});
describe("device-local offline cache", () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => map.set(k, v),
    });
  });
  it("returns last successful data on failure, marked stale", async () => {
    await cached("x", 1000, async () => ({ height: 2 }));
    const result = await cached(
      "x",
      1000,
      async () => {
        throw Error("offline");
      },
      true,
    );
    expect(result.data).toEqual({ height: 2 });
    expect(result.stale).toBe(true);
  });
  it("does not share cache entries between stations", async () => {
    await cached("a", 1000, async () => 1);
    await expect(
      cached("b", 1000, async () => {
        throw Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
