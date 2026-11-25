/**
 * CPCB National Air Quality Index (NAQI) — PM2.5 and PM10 sub-indices.
 *
 * Source: CPCB, "National Air Quality Index", CUPS/82/2014-15 (Oct 2014).
 * Breakpoints are defined on 24-hour average concentrations (µg/m³), and a
 * 24-hour average needs at least 16 hours of data.
 *
 * This module only does arithmetic on published numbers. It never makes up a
 * breakpoint. For the Severe band CPCB publishes only a lower bound (PM2.5
 * 250+, PM10 430+), so no number above 401 is produced: we return 401 and
 * flag it as a floor.
 */

import type { ConcentrationUnit, NaqiCategory, Pollutant } from "../types";

interface Band {
  readonly category: NaqiCategory;
  /** Concentration range, µg/m³. `hi: null` = no published upper bound. */
  readonly lo: number;
  readonly hi: number | null;
  readonly indexLo: number;
  readonly indexHi: number;
}

/**
 * CPCB publishes integer ranges (0–30, 31–60, …). To keep the scale
 * continuous for non-integer averages, each band here starts where the
 * previous one ends: a value above 30 and up to 60 is Satisfactory.
 */
const BREAKPOINTS: Readonly<Record<Pollutant, readonly Band[]>> = {
  pm25: [
    { category: "good", lo: 0, hi: 30, indexLo: 0, indexHi: 50 },
    { category: "satisfactory", lo: 30, hi: 60, indexLo: 51, indexHi: 100 },
    { category: "moderate", lo: 60, hi: 90, indexLo: 101, indexHi: 200 },
    { category: "poor", lo: 90, hi: 120, indexLo: 201, indexHi: 300 },
    { category: "very-poor", lo: 120, hi: 250, indexLo: 301, indexHi: 400 },
    { category: "severe", lo: 250, hi: null, indexLo: 401, indexHi: 500 },
  ],
  pm10: [
    { category: "good", lo: 0, hi: 50, indexLo: 0, indexHi: 50 },
    { category: "satisfactory", lo: 50, hi: 100, indexLo: 51, indexHi: 100 },
    { category: "moderate", lo: 100, hi: 250, indexLo: 101, indexHi: 200 },
    { category: "poor", lo: 250, hi: 350, indexLo: 201, indexHi: 300 },
    { category: "very-poor", lo: 350, hi: 430, indexLo: 301, indexHi: 400 },
    { category: "severe", lo: 430, hi: null, indexLo: 401, indexHi: 500 },
  ],
};

/** CPCB: minimum hourly values needed to form a valid 24-hour average. */
export const NAQI_MIN_HOURS_24H = 16;

export const NAQI_UNIT: ConcentrationUnit = "µg/m³";

function bandFor(pollutant: Pollutant, concentration: number): Band {
  const bands = BREAKPOINTS[pollutant];
  for (const band of bands) {
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
 * Linear interpolation within the band:
 *   I = (I_hi − I_lo) / (BP_hi − BP_lo) × (C − BP_lo) + I_lo
 * Valid only for a 24-hour average. Callers must check that first.
 */
export function naqiSubIndex(
  pollutant: Pollutant,
  average24h: number,
): { readonly subIndex: number; readonly isFloor: boolean; readonly category: NaqiCategory } {
  assertConcentration(average24h);
  const band = bandFor(pollutant, average24h);
  if (band.hi === null) {
    return { subIndex: band.indexLo, isFloor: true, category: band.category };
  }
  const raw = ((band.indexHi - band.indexLo) / (band.hi - band.lo)) * (average24h - band.lo) + band.indexLo;
  return { subIndex: Math.round(raw), isFloor: false, category: band.category };
}

function assertConcentration(c: number): void {
  if (!Number.isFinite(c) || c < 0) throw new RangeError(`invalid concentration: ${c}`);
}

/** Exposed for tests and for rendering the scale legend with its source. */
export const NAQI_BREAKPOINTS = BREAKPOINTS;
