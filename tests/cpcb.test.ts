import { describe, expect, it } from "vitest";
import { naqiCategory, naqiSubIndex } from "@/lib/grounding/aqi/cpcb";
import { naqiFromHours } from "@/lib/grounding/snapshot";
import { hours, hoursAgo, NOW } from "./helpers";

describe("CPCB NAQI breakpoints", () => {
  it.each([
    [0, "good"],
    [30, "good"],
    [30.4, "satisfactory"],
    [60, "satisfactory"],
    [90, "moderate"],
    [120, "poor"],
    [250, "very-poor"],
    [251, "severe"],
  ] as const)("PM2.5 %s µg/m³ → %s", (c, cat) => expect(naqiCategory("pm25", c)).toBe(cat));

  it.each([
    [50, "good"],
    [100, "satisfactory"],
    [250, "moderate"],
    [350, "poor"],
    [430, "very-poor"],
    [431, "severe"],
  ] as const)("PM10 %s µg/m³ → %s", (c, cat) => expect(naqiCategory("pm10", c)).toBe(cat));

  it("reproduces the worked example stored in CPCB's AQI-Calculator.xls", () => {
    // Cell C8 = 121 (PM10) → D8 = 114; cell C10 = 34 (PM2.5) → D10 = 56.67
    expect(naqiSubIndex("pm10", 121).subIndex).toBe(114);
    expect(naqiSubIndex("pm25", 34).subIndex).toBe(57);
  });

  it("follows the calculator formula inside each band", () => {
    // 50 + (45−30)·50/30 = 75
    expect(naqiSubIndex("pm25", 45)).toEqual({ subIndex: 75, cappedAtScaleMax: false, category: "satisfactory" });
    // 100 + (200−100)·100/150 = 166.7 → 167
    expect(naqiSubIndex("pm10", 200)).toEqual({ subIndex: 167, cappedAtScaleMax: false, category: "moderate" });
    // band edges are continuous: 30 → 50, 60 → 100, 250 → 400
    expect(naqiSubIndex("pm25", 30).subIndex).toBe(50);
    expect(naqiSubIndex("pm25", 60).subIndex).toBe(100);
    expect(naqiSubIndex("pm25", 250).subIndex).toBe(400);
  });

  it("continues the Very Poor slope into Severe, as the calculator does", () => {
    // 400 + (300−250)·100/130 = 438.5 → 438
    expect(naqiSubIndex("pm25", 300)).toEqual({ subIndex: 438, cappedAtScaleMax: false, category: "severe" });
  });

  it("caps at the 0–500 scale defined in the NAQI report", () => {
    expect(naqiSubIndex("pm25", 600)).toEqual({ subIndex: 500, cappedAtScaleMax: true, category: "severe" });
  });

  it("rejects invalid concentrations instead of coercing them", () => {
    expect(() => naqiSubIndex("pm25", -1)).toThrow(RangeError);
    expect(() => naqiSubIndex("pm25", Number.NaN)).toThrow(RangeError);
  });
});

describe("24-hour average from measured hours", () => {
  const from = hoursAgo(24);
  const to = NOW.toISOString();

  it("computes the sub-index when ≥16 hours are present", () => {
    const r = naqiFromHours("pm25", 1, hours(20, 150), from, to);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({ average24h: 150, hoursObserved: 20, category: "very-poor", basis: "measured-24h-average" });
      expect(r.data.citations).toContain("cpcb-naqi-2014");
    }
  });

  it("fails closed below the CPCB 16-hour minimum", () => {
    expect(naqiFromHours("pm25", 1, hours(15, 150), from, to)).toEqual({
      ok: false,
      reason: "insufficient-hours",
      detail: "15/16",
    });
  });

  it("ignores hours outside the window and implausible values", () => {
    const data = [...hours(16, 100), { value: 5000, fromUtc: hoursAgo(30), toUtc: hoursAgo(29) }];
    const outlier = { value: 9999, fromUtc: hoursAgo(18), toUtc: hoursAgo(17) };
    const r = naqiFromHours("pm25", 1, [...data, outlier], from, to);
    expect(r.ok && r.data.average24h).toBe(100);
  });
});
