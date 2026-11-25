import { describe, expect, it } from "vitest";
import { getFormatters, getUiStrings, LOCALES } from "@/lib/i18n";
import { makeForecastPoint, type ForecastSeries } from "@/lib/grounding/types";
import { bestWindow } from "@/lib/plan/window";
import { parseProfile } from "@/lib/profile/storage";
import { describeAge, describeWindow } from "@/lib/view/describe";

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
    expect(describeWindow({ verdict: "no-forecast" }, t, f)).toEqual({ headline: t.window.unavailable, details: [], showCaveat: false });
  });

  it("every UI string is non-empty", () => {
    const walk = (x: unknown): void => {
      if (typeof x === "string") expect(x.trim().length).toBeGreaterThan(0);
      else if (x && typeof x === "object") Object.values(x).forEach(walk);
    };
    walk({ ...t, healthStatementIsTranslation: t.healthStatementIsTranslation ?? "n/a" });
  });
});

describe("relative age", () => {
  const t = getUiStrings("en");
  const now = new Date("2026-11-25T08:00:00Z");
  it.each([
    ["2026-11-25T07:59:30Z", "just now"],
    ["2026-11-25T07:35:00Z", "25 min ago"],
    ["2026-11-25T05:00:00Z", "3 hours ago"],
    ["2026-11-25T07:00:00Z", "1 hour ago"],
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
