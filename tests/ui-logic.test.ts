import { describe, expect, it } from "vitest";
import { getFormatters, getUiStrings, LOCALES } from "@/lib/i18n";
import { makeForecastPoint, type ForecastSeries } from "@/lib/grounding/types";
import { bestWindow } from "@/lib/plan/window";
import { parseProfile } from "@/lib/profile/storage";
import { swapsFor } from "@/lib/sourced/swaps";
import { describeAge, describeSaving, describeWindow, floorTo2Significant, uniqueCitations } from "@/lib/view/describe";

const EARLY = new Date("2026-11-24T22:30:00Z"); // 04:00 IST

function series(pm25At: (localHour: number) => number | null): ForecastSeries {
  const points = Array.from({ length: 24 }, (_, i) =>
    makeForecastPoint({ timeUtc: new Date(Date.parse("2026-11-24T19:00:00Z") + i * 3_600_000).toISOString(), pm25: pm25At(0.5 + i), pm10: null }),
  );
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
      retrievedAt: "2026-11-24T22:00:00.000Z",
      citations: ["open-meteo-air-quality", "cams-global"],
    },
  };
}

describe.each(LOCALES)("window sentences (%s)", (locale) => {
  const t = getUiStrings(locale);
  const f = getFormatters(locale);

  it("no departure time: a complete 'cleanest stretch' sentence, no commute wording, caveat on", () => {
    const v = describeWindow(bestWindow({ forecast: series((h) => (h >= 6 && h < 9 ? 70 : 200)), now: EARLY }), t, f);
    const range = f.timeRange("2026-11-25T01:00:00.000Z", "2026-11-25T04:00:00.000Z"); // 06:30–09:30 IST
    expect(v.headline).toBe(t.window.clearBest({ best: range }));
    expect(v.headline).not.toMatch(/undefined|NaN|\{|\}/);
    expect(v.details.join(" ")).not.toContain(t.window.routinePassed);
    expect(v.showCaveat).toBe(true);
  });

  it("with a departure time and a materially cleaner stretch: names both ranges", () => {
    const v = describeWindow(bestWindow({ forecast: series((h) => (h < 8 ? 290 : 400)), now: EARLY, departureHour: 9 }), t, f);
    expect(v.headline).toBe(
      t.window.cleanerThanRoutine({
        best: f.timeRange("2026-11-25T00:00:00.000Z", "2026-11-25T03:00:00.000Z"),
        routine: f.timeRange("2026-11-25T03:00:00.000Z", "2026-11-25T06:00:00.000Z"),
      }),
    );
    expect(v.showCaveat).toBe(true);
  });

  it("flat day: says no time stands out, and still shows the caveat", () => {
    const v = describeWindow(bestWindow({ forecast: series(() => 150), now: EARLY }), t, f);
    expect(v.headline).toBe(t.window.noClearBest);
    expect(v.showCaveat).toBe(true);
  });

  it("no forecast: an explicit message, no caveat (no window is presented)", () => {
    expect(describeWindow({ verdict: "no-forecast" }, t, f)).toEqual({ headline: t.window.unavailable, drop: null, details: [], showCaveat: false });
  });

  it("late evening (forecast present, no full stretch left): says it's too late today, never 'no forecast'", () => {
    const late = new Date("2026-11-25T14:38:00Z"); // 20:08 IST, the live case that showed the bug
    const r = bestWindow({ forecast: series(() => 150), now: late });
    expect(r.verdict).toBe("insufficient-forecast");
    const v = describeWindow(r, t, f);
    expect(v.headline).toBe(t.window.tooLate);
    expect(v.headline).not.toBe(t.window.unavailable);
    expect(v.details).toEqual([t.window.tooLateDetail({ from: f.clockHour(5), to: f.clockHour(22) })]);
    expect(v.showCaveat).toBe(false);
  });

  it("drop lines name what they are compared with: the usual departure, or a typical stretch", () => {
    const vsRoutine = describeWindow(bestWindow({ forecast: series((h) => (h < 8 ? 290 : 400)), now: EARLY, departureHour: 9 }), t, f);
    expect(vsRoutine.drop).toBe(t.window.dropVsRoutine({ drop: f.number(110), pct: f.number(27.5) }));
    const vsTypical = describeWindow(bestWindow({ forecast: series((h) => (h >= 6 && h < 9 ? 70 : 200)), now: EARLY }), t, f);
    expect(vsTypical.drop).toBe(t.window.dropVsTypical({ drop: f.number(130), pct: f.number(65) }));
  });

  it("every UI string is non-empty", () => {
    const walk = (x: unknown): void => {
      if (typeof x === "string") expect(x.trim().length).toBeGreaterThan(0);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk({ ...t, healthStatementIsTranslation: t.healthStatementIsTranslation ?? "n/a" });
  });
});

describe("time formatting", () => {
  it("Hindi uses day-period words (सुबह/दोपहर/शाम) on a 12-hour clock; English keeps am/pm", () => {
    const hi = getFormatters("hi");
    expect(hi.timeRange("2026-11-25T00:00:00.000Z", "2026-11-25T03:00:00.000Z")).toBe("सुबह 5:30–8:30");
    expect(hi.time("2026-11-25T08:00:00.000Z")).toBe("दोपहर 1:30");
    expect(hi.time("2026-11-25T11:00:00.000Z")).toBe("शाम 4:30");
    expect(getFormatters("en").time("2026-11-25T01:00:00.000Z")).toBe("6:30 am");
  });
});

describe("relative age", () => {
  const t = getUiStrings("en");
  const now = new Date("2026-11-25T08:00:00Z");
  it.each([
    ["2026-11-25T07:59:30Z", "just now"],
    ["2026-11-25T07:35:00Z", "25 min ago"],
    ["2026-11-25T05:00:00Z", "about 3 hours ago"],
    ["2026-11-25T07:00:00Z", "about 1 hour ago"],
    ["2026-11-25T04:10:00Z", "about 4 hours ago"], // 3 h 50 min: rounded, never understated as "3 hours"
  ])("%s → %s", (iso, want) => expect(describeAge(iso, now, t)).toBe(want));
});

describe("profile storage validation", () => {
  const good = {
    cityId: "delhi",
    commute: { mode: "car-petrol", oneWayKm: 12, departureHour: 9 },
    cookingFuel: "lpg",
    hasChildrenOrElderly: true,
    hasAirPurifier: false,
  };
  it("accepts a valid profile, with or without departure time", () => {
    expect(parseProfile(good)).toEqual(good);
    const noDep = { ...good, commute: { mode: "bus", oneWayKm: 5 } };
    expect(parseProfile(noDep)).toEqual(noDep);
  });
  it.each([
    ["unknown city", { ...good, cityId: "atlantis" }],
    ["unknown mode", { ...good, commute: { ...good.commute, mode: "jetpack" } }],
    ["negative distance", { ...good, commute: { ...good.commute, oneWayKm: -1 } }],
    ["bad hour", { ...good, commute: { ...good.commute, departureHour: 25 } }],
    ["missing field", { ...good, hasAirPurifier: undefined }],
    ["garbage", "not a profile"],
  ])("rejects %s (back to onboarding, no crash)", (_, raw) => expect(parseProfile(raw)).toBeNull());
});

describe("plan source links", () => {
  it("one link per document, even when several locators or factors cite it", () => {
    expect(uniqueCitations(["mohfw-air-advisory-2025", "mohfw-air-advisory-2025", null, "ighgp-road-2015", "ighgp-road-2015"])).toEqual([
      "mohfw-air-advisory-2025",
      "ighgp-road-2015",
    ]);
  });
});

describe.each(LOCALES)("swap figures (%s)", (locale) => {
  const t = getUiStrings(locale);
  const f = getFormatters(locale);
  const profileWith = (mode: "two-wheeler" | "car-petrol" | "car-diesel", oneWayKm: number) => ({
    cityId: "delhi",
    commute: { mode, oneWayKm },
    cookingFuel: "lpg" as const,
    hasChildrenOrElderly: false,
    hasAirPurifier: false,
  });
  const bus = (mode: "two-wheeler" | "car-petrol" | "car-diesel", km: number) => swapsFor(profileWith(mode, km)).swaps.find((s) => s.id === `commute:${mode}->bus`)!;

  it("'at least' never exceeds the computed saving (0.268 kg shows as 0.26, not 0.3)", () => {
    const swap = bus("two-wheeler", 8);
    expect(swap.saving.value).toBeCloseTo(0.268, 3);
    expect(describeSaving(swap, t, f)).toBe(t.swaps.atLeastKgPerDay({ kg: "0.26" }));
  });

  it("petrol cars carry the not-a-hybrid condition; other vehicles don't", () => {
    expect(describeSaving(bus("car-petrol", 12), t, f)).toBe(t.swaps.atLeastKgPerDayPetrolCar({ kg: "2.3" }));
    expect(describeSaving(bus("car-diesel", 12), t, f)).toBe(t.swaps.atLeastKgPerDay({ kg: "2.3" }));
  });

  it("the stove figure states its assumption", () => {
    const png = swapsFor(profileWith("car-diesel", 1)).swaps.find((s) => s.id === "cooking:lpg->png")!;
    expect(describeSaving(png, t, f)).toBe(t.swaps.percentLess({ pct: "11" }));
  });
});

describe("rounding down", () => {
  it.each([
    [0.2678, 0.26],
    [2.300136, 2.3],
    [0.0167, 0.016],
    [0.3, 0.3],
    [12.99, 12],
    [123.4, 120],
    [0, 0],
  ])("%d → %d", (x, want) => {
    expect(floorTo2Significant(x)).toBe(want);
    expect(floorTo2Significant(x)).toBeLessThanOrEqual(x);
  });
});
