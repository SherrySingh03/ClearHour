/**
 * CPCB National Air Quality Index (NAQI) — PM2.5 and PM10 sub-indices.
 *
 * Primary sources (both fetched from cpcb.gov.in on 2026-11-25):
 *  - CPCB, "National Air Quality Index" (CUPS/82/2014-15), Table 3.11
 *    (breakpoints, AQI scale 0–500) and §3.7 ("a minimum of 16 hours' data
 *    is considered necessary for calculating subindex").
 *  - CPCB AQI-Calculator.xls, cells D8 (PM10) and D10 (PM2.5). The formulas
 *    below are transcribed from those cells, so results match CPCB's own
 *    calculator exactly.
 *
 * Breakpoints are defined on 24-hour average concentrations (µg/m³).
 */

import type { ConcentrationUnit, NaqiCategory, Pollutant } from "../types";

interface Band {
  readonly category: NaqiCategory;
  /** Concentration range (µg/m³), lower-exclusive except for the first band. */
  readonly lo: number;
  /** `null` = open-ended (Severe). */
  readonly hi: number | null;
  /** Sub-index at `lo`, and the slope (index points per µg/m³) across the band. */
  readonly indexAtLo: number;
  readonly slope: number;
}

/**
 * Transcribed from AQI-Calculator.xls. For example, PM2.5 cell D10:
 *   C<=30: C*50/30 | 30<C<=60: 50+(C-30)*50/30 | 60<C<=90: 100+(C-60)*100/30
 *   90<C<=120: 200+(C-90)*100/30 | 120<C<=250: 300+(C-120)*100/130
 *   C>250: 400+(C-250)*100/130
 * The Severe band continues the Very Poor slope, exactly as the calculator does.
 */
const BREAKPOINTS: Readonly<Record<Pollutant, readonly Band[]>> = {
  pm25: [
    { category: "good", lo: 0, hi: 30, indexAtLo: 0, slope: 50 / 30 },
    { category: "satisfactory", lo: 30, hi: 60, indexAtLo: 50, slope: 50 / 30 },
    { category: "moderate", lo: 60, hi: 90, indexAtLo: 100, slope: 100 / 30 },
    { category: "poor", lo: 90, hi: 120, indexAtLo: 200, slope: 100 / 30 },
    { category: "very-poor", lo: 120, hi: 250, indexAtLo: 300, slope: 100 / 130 },
    { category: "severe", lo: 250, hi: null, indexAtLo: 400, slope: 100 / 130 },
  ],
  // PM10 cell D8: C<=50: C | 50<C<=100: C | 100<C<=250: 100+(C-100)*100/150
  //   250<C<=350: 200+(C-250) | 350<C<=430: 300+(C-350)*100/80 | C>430: 400+(C-430)*100/80
  pm10: [
    { category: "good", lo: 0, hi: 50, indexAtLo: 0, slope: 1 },
    { category: "satisfactory", lo: 50, hi: 100, indexAtLo: 50, slope: 1 },
    { category: "moderate", lo: 100, hi: 250, indexAtLo: 100, slope: 100 / 150 },
    { category: "poor", lo: 250, hi: 350, indexAtLo: 200, slope: 1 },
    { category: "very-poor", lo: 350, hi: 430, indexAtLo: 300, slope: 100 / 80 },
    { category: "severe", lo: 430, hi: null, indexAtLo: 400, slope: 100 / 80 },
  ],
};

/** CPCB NAQI report §3.7: minimum hourly values for a valid 24-hour sub-index. */
export const NAQI_MIN_HOURS_24H = 16;

/** CPCB NAQI report Table 3.11: "Breakpoints for AQI Scale 0-500". */
export const NAQI_SCALE_MAX = 500;

export const NAQI_UNIT: ConcentrationUnit = "µg/m³";

/** Category order, worst last. Used to compare categories. */
export const NAQI_CATEGORY_ORDER: readonly NaqiCategory[] = [
  "good",
  "satisfactory",
  "moderate",
  "poor",
  "very-poor",
  "severe",
];

export const categoryRank = (c: NaqiCategory): number => NAQI_CATEGORY_ORDER.indexOf(c);

/**
 * CPCB's published health statement for each category, verbatim from the
 * legend of AQI-Calculator.xls (cells B23–F28). The longer wording is in
 * Table 3.12 of the NAQI report. The UI quotes these as-is (translations
 * marked as translations) and adds nothing.
 */
export const NAQI_HEALTH_STATEMENTS: Readonly<Record<NaqiCategory, string>> = {
  good: "Minimal Impact",
  satisfactory: "Minor breathing discomfort to sensitive people",
  moderate: "Breathing discomfort to the people with lung, heart disease, children and older adults",
  poor: "Breathing discomfort to people on prolonged exposure",
  "very-poor": "Respiratory illness to the people on prolonged exposure",
  severe: "Respiratory effects even on healthy people",
};

function bandFor(pollutant: Pollutant, concentration: number): Band {
  for (const band of BREAKPOINTS[pollutant]) {
    if (band.hi === null || concentration <= band.hi) return band;
  }
  // Unreachable: the last band is open-ended.
  throw new Error(`no NAQI band for ${pollutant}=${concentration}`);
}

/** CPCB category for a concentration. Throws on negative or non-finite input. */
export function naqiCategory(pollutant: Pollutant, concentration: number): NaqiCategory {
  assertConcentration(concentration);
  return bandFor(pollutant, concentration).category;
}

/**
 * Sub-index, using the CPCB calculator formula. Valid only for a 24-hour
 * average; callers must check that first.
 *
 * Rounded to the nearest integer for display (CPCB bulletins report whole
 * numbers; the calculator shows unrounded values). Results above 500 are
 * capped at 500 with `cappedAtScaleMax`, because the report defines the
 * scale as 0–500.
 */
export function naqiSubIndex(
  pollutant: Pollutant,
  average24h: number,
): { readonly subIndex: number; readonly cappedAtScaleMax: boolean; readonly category: NaqiCategory } {
  assertConcentration(average24h);
  const band = bandFor(pollutant, average24h);
  const raw = band.indexAtLo + (average24h - band.lo) * band.slope;
  // JUDGMENT CALLS — assumptions.ts#naqi-cap-500 and #naqi-display-rounding
  const capped = raw > NAQI_SCALE_MAX;
  return {
    subIndex: capped ? NAQI_SCALE_MAX : Math.round(raw),
    cappedAtScaleMax: capped,
    category: band.category,
  };
}

function assertConcentration(c: number): void {
  if (!Number.isFinite(c) || c < 0) throw new RangeError(`invalid concentration: ${c}`);
}

/** Exposed for tests and for rendering the scale legend with its source. */
export const NAQI_BREAKPOINTS = BREAKPOINTS;
