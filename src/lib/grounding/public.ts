/**
 * What is allowed to leave the server.
 *
 * Upstream error text (`detail`) is for server logs only. It can include
 * network error messages and schema paths, so the public snapshot carries
 * reason codes alone.
 */

import type {
  ForecastMissingReason,
  Grounded,
  GroundingSnapshot,
  LatLon,
  MeasuredBlock,
  MeasuredMissingReason,
  NaqiMissingReason,
  Pollutant,
} from "./types";
import { ok, POLLUTANTS } from "./types";

function stripDetail<T, R extends string>(g: Grounded<T, R>): Grounded<T, R> {
  return g.ok ? g : { ok: false, reason: g.reason };
}

export function toPublicSnapshot(s: GroundingSnapshot): GroundingSnapshot {
  let measured: GroundingSnapshot["measured"];
  if (s.measured.ok) {
    const { latest, naqi24h } = s.measured.data;
    const publicNaqi: MeasuredBlock["naqi24h"] = { pm25: stripDetail(naqi24h.pm25), pm10: stripDetail(naqi24h.pm10) };
    measured = ok({ latest, naqi24h: publicNaqi });
  } else {
    measured = stripDetail(s.measured);
  }
  return { ...s, measured, forecast: stripDetail(s.forecast) };
}

type AnyMissingReason = MeasuredMissingReason | ForecastMissingReason | NaqiMissingReason;

/**
 * true = transient outage or upstream fault: retry soon, never cache for long.
 * false = a real answer about the world (no station, too few hours) that can
 * be cached like any other result.
 * A Record, so adding a new reason code fails to compile until it is classified here.
 */
const IS_OUTAGE: Readonly<Record<AnyMissingReason, boolean>> = {
  "no-station-in-radius": false,
  "openaq-key-missing": true,
  "openaq-unavailable": true,
  "openaq-schema-mismatch": true,
  "insufficient-hours": false,
  "no-sensor": false,
  "no-live-sensor": false,
  "open-meteo-unavailable": true,
  "open-meteo-schema-mismatch": true,
  "forecast-empty": true,
};

export interface FailureNote {
  readonly where: "measured" | "forecast" | `naqi24h.${Pollutant}`;
  readonly reason: AnyMissingReason;
  readonly detail?: string;
}

/** Every failure with its detail, for server-side logging. */
export function failureNotes(s: GroundingSnapshot): FailureNote[] {
  const notes: FailureNote[] = [];
  const add = (where: FailureNote["where"], g: Grounded<unknown, AnyMissingReason>) => {
    if (!g.ok) notes.push(g.detail === undefined ? { where, reason: g.reason } : { where, reason: g.reason, detail: g.detail });
  };
  add("measured", s.measured);
  add("forecast", s.forecast);
  if (s.measured.ok) for (const p of POLLUTANTS) add(`naqi24h.${p}`, s.measured.data.naqi24h[p]);
  return notes;
}

/**
 * Worth caching for the normal lifetime only when no part of the snapshot
 * (including the per-pollutant 24 h AQI) failed because of an outage.
 * "No station in radius" is a real answer and can be cached; "OpenAQ
 * unreachable" anywhere should be retried soon.
 */
export function isCacheable(s: GroundingSnapshot): boolean {
  return !failureNotes(s).some((n) => IS_OUTAGE[n.reason]);
}

/**
 * Rounds to 0.01° (~1.1 km). Far finer than the 25 km station search or the
 * ~45 km forecast grid, yet it bounds the set of distinct lookups callers can
 * trigger, and the server never handles an exact home location.
 */
/* JUDGMENT CALL — assumptions.ts#coordinate-rounding */
export function quantize(p: LatLon): LatLon {
  const r = (x: number) => Math.round(x * 100) / 100;
  return { latitude: r(p.latitude), longitude: r(p.longitude) };
}
