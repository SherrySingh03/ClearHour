import { describe, expect, it } from "vitest";
import { makeForecastPoint, type ForecastSeries } from "@/lib/grounding/types";
import { bestWindow, compare, type Stretch } from "@/lib/plan/window";

/**
 * Builds today's forecast (25 Nov 2026, IST) from a function of the local
 * hour. Points fall on UTC hours, i.e. :30 past in IST, exactly as
 * Open-Meteo returns them.
 */
function series(pm25At: (localHour: number) => number | null): ForecastSeries {
  const points = [];
  // 2026-11-24T19:00Z = 00:30 IST on the 25th … through 23:30 IST.
  for (let i = 0; i < 24; i++) {
    const t = Date.parse("2026-11-24T19:00:00Z") + i * 3_600_000;
    const localHour = 0.5 + i;
    points.push(makeForecastPoint({ timeUtc: new Date(t).toISOString(), pm25: pm25At(localHour), pm10: null }));
  }
  return {
    kind: "forecast",
    unit: "µg/m³",
    points,
    provenance: {
      kind: "forecast",
      source: "open-meteo",
      model: "cams_global",
      gridCell: { latitude: 28.6, longitude: 77.2 },
      gridResolutionDeg: 0.4,
      nativeTimeStepHours: 3,
      hourlyIsInterpolated: true,
      retrievedAt: "2026-11-24T23:00:00.000Z",
      citations: ["open-meteo-air-quality", "cams-global"],
    },
  };
}

/** 04:00 IST on the 25th. */
const EARLY = new Date("2026-11-24T22:30:00Z");
const istLabel = (s: Stretch) =>
  `${new Date(Date.parse(s.startUtc) + 19_800_000).toISOString().slice(11, 16)}–${new Date(Date.parse(s.endUtc) + 19_800_000).toISOString().slice(11, 16)}`;

describe("best outdoor window", () => {
  it("is always a 3-hour stretch on the forecast's own half-hour grid, never a single hour", () => {
    const r = bestWindow({ forecast: series((h) => (h >= 6 && h < 9 ? 120 : 300)), now: EARLY, departureHour: 15 });
    expect(r.verdict).toBe("cleaner-than-routine");
    if (r.verdict !== "cleaner-than-routine") return;
    expect(Date.parse(r.best.endUtc) - Date.parse(r.best.startUtc)).toBe(3 * 3_600_000);
    expect(istLabel(r.best)).toBe("06:30–09:30");
    expect(r.best.basis).toBe("forecast-3h-mean");
  });

  describe("materially cleaner = category improvement OR (≥30 µg/m³ AND ≥25%)", () => {
    it("Severe all day: a 110 µg/m³ / 27% drop counts even though the category doesn't change", () => {
      // departs 09:00 → routine stretch 08:30–11:30 at 400; 05:30–08:30 at 290; both Severe
      const r = bestWindow({ forecast: series((h) => (h < 8 ? 290 : 400)), now: EARLY, departureHour: 9 });
      expect(r.verdict).toBe("cleaner-than-routine");
      if (r.verdict !== "cleaner-than-routine") return;
      expect(r.best.indicativeCategory).toBe("severe");
      expect(r.routine.indicativeCategory).toBe("severe");
      expect(r.comparison).toMatchObject({ categoryImproved: false, material: true, dropUgm3: 110 });
    });

    it("Severe all day: an 80 µg/m³ drop that is only 20% does NOT count", () => {
      const r = bestWindow({ forecast: series((h) => (h < 8 ? 320 : 400)), now: EARLY, departureHour: 9 });
      expect(r.verdict).toBe("routine-is-fine");
      if (r.verdict !== "routine-is-fine") return;
      expect(r.comparison).toMatchObject({ categoryImproved: false, material: false, dropUgm3: 80 });
    });

    it("a small drop that crosses into a better category counts", () => {
      // 95 (Poor) → 85 (Moderate): only 10 µg/m³, but the category improves
      const r = bestWindow({ forecast: series((h) => (h < 8 ? 85 : 95)), now: EARLY, departureHour: 9 });
      expect(r.verdict).toBe("cleaner-than-routine");
      if (r.verdict === "cleaner-than-routine") expect(r.comparison).toMatchObject({ categoryImproved: true, material: true });
    });

    it("a ≥25% drop under 30 µg/m³ within one category does not count", () => {
      // Poor band (90–120): 91 vs 119 is a 28 µg/m³ / 23.5% drop → neither condition met
      expect(compare(stretch(91), stretch(119)).material).toBe(false);
      // Severe band: 251 vs 280 is 29 µg/m³ → under 30, not material
      expect(compare(stretch(251), stretch(280)).material).toBe(false);
    });
  });

  it("without a departure time: a complete best-stretch result with no commute fields at all", () => {
    const r = bestWindow({ forecast: series((h) => (h >= 6 && h < 9 ? 70 : 200)), now: EARLY });
    expect(r).toMatchObject({ verdict: "clear-best", routinePassed: false });
    expect(r).not.toHaveProperty("routine");
    if (r.verdict !== "clear-best") return;
    expect(istLabel(r.best)).toBe("06:30–09:30");
    expect(r.best.meanPm25).toBe(70);
    expect(r.baseline.meanPm25).toBe(200);
    expect(r.comparison.material).toBe(true);
  });

  it("names no winner when nothing clears the bar (no routine): flat day", () => {
    const r = bestWindow({ forecast: series(() => 180), now: EARLY });
    expect(r.verdict).toBe("no-clear-best");
  });

  it("without a routine, compares the cleanest stretch against the day's median", () => {
    const r = bestWindow({ forecast: series((h) => (h >= 13 && h < 16 ? 60 : 140)), now: EARLY });
    expect(r.verdict).toBe("clear-best");
    if (r.verdict === "clear-best") {
      expect(istLabel(r.best)).toBe("13:30–16:30");
      expect(r.baseline.meanPm25).toBe(140);
      expect(r.routinePassed).toBe(false);
    }
  });

  it("never fills a forecast gap: stretches touching a null are skipped", () => {
    // The cleanest values sit next to a null hour, so no stretch can include it.
    const r = bestWindow({ forecast: series((h) => (h === 7.5 ? null : h >= 6 && h < 9 ? 50 : 200)), now: EARLY });
    if (r.verdict === "clear-best" || r.verdict === "no-clear-best") {
      const best = r.verdict === "clear-best" ? r.best : r.cleanest;
      const start = Date.parse(best.startUtc);
      const nullAt = Date.parse("2026-11-25T02:00:00Z"); // 07:30 IST
      expect(nullAt < start || nullAt >= Date.parse(best.endUtc)).toBe(true);
    } else {
      throw new Error(`unexpected verdict ${r.verdict}`);
    }
  });

  it("when the commute has already passed, says so and falls back to the rest of the day", () => {
    const afternoon = new Date("2026-11-25T08:00:00Z"); // 13:30 IST
    const r = bestWindow({ forecast: series((h) => (h >= 17 && h < 20 ? 60 : 150)), now: afternoon, departureHour: 8 });
    expect(r.verdict).toBe("clear-best");
    if (r.verdict === "clear-best") expect(r.routinePassed).toBe(true);
  });

  it("keeps suggestions inside outdoor hours (05:00–22:00)", () => {
    // Cleanest air is 01:00–04:00, outside outdoor hours; it must not be suggested.
    const r = bestWindow({ forecast: series((h) => (h < 4 ? 20 : 150)), now: new Date("2026-11-24T19:00:00Z") });
    expect(r.verdict).toBe("no-clear-best");
  });

  it("reports a missing forecast instead of guessing", () => {
    expect(bestWindow({ forecast: null, now: EARLY })).toEqual({ verdict: "no-forecast" });
    expect(bestWindow({ forecast: series(() => null), now: EARLY })).toEqual({ verdict: "insufficient-forecast" });
  });
});

function stretch(meanPm25: number): Stretch {
  return {
    kind: "forecast-stretch",
    startUtc: "2026-11-25T00:00:00.000Z",
    endUtc: "2026-11-25T03:00:00.000Z",
    meanPm25,
    indicativeCategory: meanPm25 > 250 ? "severe" : meanPm25 > 120 ? "very-poor" : "poor",
    basis: "forecast-3h-mean",
  };
}
