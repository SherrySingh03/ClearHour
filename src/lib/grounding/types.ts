/**
 * Grounding types — the contract that keeps MEASURED, FORECAST and COMPUTED
 * data from ever being confused with one another.
 *
 * Rules encoded here:
 *  1. Every value carries its provenance. There is no "bare" pollution number.
 *  2. Measured and forecast values are nominally distinct (unique-symbol
 *     brands + `kind` discriminant). A ForecastValue cannot be passed where a
 *     MeasuredValue is expected, and vice-versa — tsc rejects it.
 *  3. No type in this module combines a measured and a forecast value into a
 *     single number. The snapshot holds them in separate, independently
 *     fallible fields.
 *  4. Missing data is a first-class result (`{ ok: false, reason }`), never a
 *     default, a zero, or a substitute from the other source. Fail closed.
 *  5. Reasons are machine codes, not English, so the UI can localise them.
 */

import type { CitationId } from "./citations";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Pollutants Clearhour grounds. Both are reported by CPCB in µg/m³. */
export type Pollutant = "pm25" | "pm10";
export const POLLUTANTS: readonly Pollutant[] = ["pm25", "pm10"] as const;

export type ConcentrationUnit = "µg/m³";

/** ISO-8601 UTC timestamp, e.g. "2026-11-25T06:00:00Z". */
export type IsoUtc = string;

export interface LatLon {
  readonly latitude: number;
  readonly longitude: number;
}

/** Fail-closed result. `R` is a closed set of machine-readable reason codes. */
export type Grounded<T, R extends string> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly reason: R; readonly detail?: string };

export const ok = <T>(data: T): { readonly ok: true; readonly data: T } => ({ ok: true, data });
export const missing = <R extends string>(
  reason: R,
  detail?: string,
): { readonly ok: false; readonly reason: R; readonly detail?: string } =>
  detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export interface Station {
  /** OpenAQ location id. */
  readonly id: number;
  readonly name: string;
  readonly locality: string | null;
  /** Network/provider as reported by OpenAQ, e.g. "CPCB". */
  readonly provider: string;
  readonly coordinates: LatLon;
  readonly timezone: string;
  /**
   * Candidate sensor ids per pollutant. OpenAQ often lists several for one
   * pollutant at a CPCB site: retired ones whose last value is years old,
   * plus the live one. The live sensor is picked later from /latest.
   */
  readonly sensors: Readonly<Partial<Record<Pollutant, readonly number[]>>>;
  readonly lastReportedUtc: IsoUtc | null;
}

/** Why a candidate station was not used. Codes, not prose. */
export type StationRejection =
  | "missing-coordinates"
  | "mobile"
  | "not-reference-monitor"
  | "provider-not-allowed"
  | "no-pm-sensor"
  | "out-of-radius"
  | "stale"
  | "no-fresh-reading";

export interface RejectedStation {
  readonly id: number;
  readonly name: string;
  readonly distanceKm: number | null;
  readonly reason: StationRejection;
}

/**
 * Coverage is decided once, up front, and drives everything downstream.
 * `no-station` is an honest, terminal state: the UI shows forecast-only,
 * labelled as such. It is never "filled" with modeled data.
 */
export type Coverage =
  | {
      readonly status: "station";
      readonly station: Station;
      readonly distanceKm: number;
      readonly searchRadiusKm: number;
      readonly rejected: readonly RejectedStation[];
    }
  | {
      readonly status: "no-station";
      readonly searchRadiusKm: number;
      readonly rejected: readonly RejectedStation[];
    }
  | {
      /** OpenAQ could not be queried. We do NOT claim there is no station. */
      readonly status: "unknown";
      readonly reason: MeasuredMissingReason;
    };

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface MeasuredProvenance {
  readonly kind: "measured";
  readonly source: "openaq";
  readonly station: Pick<Station, "id" | "name" | "locality" | "provider" | "coordinates">;
  readonly sensorId: number;
  /** When the station observed this value (end of averaging period). */
  readonly observedAt: { readonly utc: IsoUtc; readonly local: string };
  /** When Clearhour fetched it. */
  readonly retrievedAt: IsoUtc;
  readonly citations: readonly CitationId[];
}

export interface ForecastProvenance {
  readonly kind: "forecast";
  readonly source: "open-meteo";
  readonly model: "cams_global";
  /** Centre of the model grid cell Open-Meteo resolved the query to. */
  readonly gridCell: LatLon;
  /** CAMS global native grid spacing and time step (Open-Meteo docs). */
  readonly gridResolutionDeg: 0.4;
  readonly nativeTimeStepHours: 3;
  /** Open-Meteo interpolates the 3-hourly model output to hourly. */
  readonly hourlyIsInterpolated: true;
  readonly retrievedAt: IsoUtc;
  readonly citations: readonly CitationId[];
}

// ---------------------------------------------------------------------------
// Values — branded so measured and forecast can never be interchanged
// ---------------------------------------------------------------------------

declare const MeasuredBrand: unique symbol;
declare const ForecastBrand: unique symbol;

/** A single reading from a CPCB ground station, via OpenAQ. */
export interface MeasuredValue {
  readonly [MeasuredBrand]: true;
  readonly kind: "measured";
  readonly pollutant: Pollutant;
  readonly unit: ConcentrationUnit;
  readonly value: number;
  readonly provenance: MeasuredProvenance;
}

/** One modeled hour from the CAMS forecast. `null` = model gave no value. */
export interface ForecastPoint {
  readonly [ForecastBrand]: true;
  readonly kind: "forecast";
  readonly timeUtc: IsoUtc;
  readonly pm25: number | null;
  readonly pm10: number | null;
}

export interface ForecastSeries {
  readonly kind: "forecast";
  readonly unit: ConcentrationUnit;
  readonly points: readonly ForecastPoint[];
  readonly provenance: ForecastProvenance;
}

/**
 * Constructors. Only the API clients should call these; they are the single
 * place where the brand is applied after the upstream payload is validated.
 */
export function makeMeasured(v: Omit<MeasuredValue, typeof MeasuredBrand | "kind">): MeasuredValue {
  return { ...v, kind: "measured" } as MeasuredValue;
}

export function makeForecastPoint(p: Omit<ForecastPoint, typeof ForecastBrand | "kind">): ForecastPoint {
  return { ...p, kind: "forecast" } as ForecastPoint;
}

// ---------------------------------------------------------------------------
// Computed (from measured inputs only)
// ---------------------------------------------------------------------------

export type NaqiCategory =
  | "good"
  | "satisfactory"
  | "moderate"
  | "poor"
  | "very-poor"
  | "severe";

/**
 * CPCB NAQI sub-index computed from a station's measured 24-hour average.
 * This is arithmetic on measured data with published breakpoints — it is
 * labelled `computed`, and carries its inputs so the UI can show its work.
 */
export interface ComputedNaqiSubIndex {
  readonly kind: "computed";
  readonly basis: "measured-24h-average";
  readonly pollutant: Pollutant;
  readonly average24h: number;
  readonly unit: ConcentrationUnit;
  readonly hoursObserved: number;
  readonly hoursRequired: number;
  readonly windowUtc: { readonly from: IsoUtc; readonly to: IsoUtc };
  /** Integer sub-index. For the Severe band CPCB publishes no upper breakpoint, so this is 401 and `isFloor` is true. */
  readonly subIndex: number;
  readonly isFloor: boolean;
  readonly category: NaqiCategory;
  readonly stationId: number;
  readonly citations: readonly CitationId[];
}

// ---------------------------------------------------------------------------
// Snapshot — measured and forecast live side-by-side, never merged
// ---------------------------------------------------------------------------

export type MeasuredMissingReason =
  | "no-station-in-radius"
  | "openaq-key-missing"
  | "openaq-unavailable"
  | "openaq-schema-mismatch";

export type NaqiMissingReason =
  | "insufficient-hours"
  | "no-sensor"
  | "no-live-sensor"
  | "openaq-unavailable"
  | "openaq-schema-mismatch";

export type ForecastMissingReason =
  | "open-meteo-unavailable"
  | "open-meteo-schema-mismatch"
  | "forecast-empty";

export interface MeasuredBlock {
  readonly latest: Readonly<Partial<Record<Pollutant, MeasuredValue>>>;
  readonly naqi24h: Readonly<Record<Pollutant, Grounded<ComputedNaqiSubIndex, NaqiMissingReason>>>;
}

export interface GroundingSnapshot {
  readonly generatedAt: IsoUtc;
  readonly query: LatLon;
  readonly coverage: Coverage;
  readonly measured: Grounded<MeasuredBlock, MeasuredMissingReason>;
  readonly forecast: Grounded<ForecastSeries, ForecastMissingReason>;
}
