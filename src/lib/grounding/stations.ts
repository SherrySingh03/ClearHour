/**
 * Station resolution — pure. Given OpenAQ candidates and a user location,
 * rank the eligible CPCB ground stations nearest-first and say why every
 * other candidate was rejected.
 *
 * "Eligible" means all of the following:
 *   - fixed site (not mobile) with known coordinates
 *   - a reference-grade monitor (OpenAQ isMonitor), so low-cost sensors are out
 *   - run by an allowed network (CPCB by default)
 *   - has a PM2.5 or PM10 sensor reporting in µg/m³
 *   - within the search radius
 *   - reported within the freshness window
 *
 * Whether the chosen station has a fresh *reading* is checked later,
 * against /latest, in snapshot.ts.
 */

import type { OpenAqLocation } from "./clients/openaq";
import { isMicrogramsPerCubicMetre, OPENAQ_PARAMETER_ID } from "./clients/openaq";
import { distanceKm } from "./geo";
import type { LatLon, Pollutant, RejectedStation, Station, StationRejection } from "./types";
import { POLLUTANTS } from "./types";

export interface ResolutionPolicy {
  /** Max distance from the user to the station. OpenAQ's search cap is 25 km. */
  readonly radiusKm: number;
  /** Station counts as offline if its last report is older than this. */
  readonly maxStalenessHours: number;
  /**
   * OpenAQ provider ids accepted as CPCB-network ground stations. Matched by
   * numeric id, not by name, so a provider whose name merely contains "CPCB"
   * cannot pass.
   */
  readonly allowedProviderIds: ReadonlySet<number>;
}

export const DEFAULT_POLICY: ResolutionPolicy = {
  /** JUDGMENT CALL (not a standard) — assumptions.ts#station-radius. */
  radiusKm: 25,
  /**
   * JUDGMENT CALL (not a standard) — assumptions.ts#station-freshness.
   * CPCB data reaches OpenAQ late. On 2026-11-25, all 48 live CPCB stations
   * within 25 km of Delhi had a newest reading 2.8–4.3 h old. 6 h accepts that
   * routine lag but still drops stations that have actually gone quiet. The
   * reading's own timestamp is always shown, so the age is never hidden.
   */
  maxStalenessHours: 6,
  /**
   * Checked live on 2026-11-25: provider 168 is named "CPCB" and covers the
   * CAAQMS network, including stations run by state boards (DPCC, UPPCB,
   * Kerala PCB, …). Provider 163 ("caaqm") is a legacy feed whose newest
   * reading is from 2022-10-31, so it is excluded.
   */
  allowedProviderIds: new Set([168]),
};

export interface RankedStation {
  readonly station: Station;
  readonly distanceKm: number;
}

export interface Resolution {
  /** Eligible stations, nearest first. Empty = no coverage. */
  readonly ranked: readonly RankedStation[];
  readonly rejected: readonly RejectedStation[];
}

export function resolveStations(
  user: LatLon,
  candidates: readonly OpenAqLocation[],
  now: Date,
  policy: ResolutionPolicy = DEFAULT_POLICY,
): Resolution {
  const ranked: RankedStation[] = [];
  const rejected: RejectedStation[] = [];

  for (const loc of candidates) {
    const name = loc.name ?? `#${loc.id}`;
    const coords =
      loc.coordinates && loc.coordinates.latitude !== null && loc.coordinates.longitude !== null
        ? { latitude: loc.coordinates.latitude, longitude: loc.coordinates.longitude }
        : null;
    const d = coords ? distanceKm(user, coords) : null;
    const reject = (reason: StationRejection) => rejected.push({ id: loc.id, name, distanceKm: d, reason });

    if (!coords || d === null) {
      reject("missing-coordinates");
      continue;
    }
    if (loc.isMobile) {
      reject("mobile");
      continue;
    }
    if (!loc.isMonitor) {
      reject("not-reference-monitor");
      continue;
    }
    if (!policy.allowedProviderIds.has(loc.provider.id)) {
      reject("provider-not-allowed");
      continue;
    }
    const sensors = pmSensors(loc);
    if (Object.keys(sensors).length === 0) {
      reject("no-pm-sensor");
      continue;
    }
    if (d > policy.radiusKm) {
      reject("out-of-radius");
      continue;
    }
    if (!isFresh(loc.datetimeLast?.utc ?? null, now, policy.maxStalenessHours)) {
      reject("stale");
      continue;
    }

    ranked.push({
      distanceKm: d,
      station: {
        id: loc.id,
        name,
        locality: loc.locality,
        provider: loc.provider.name,
        coordinates: coords,
        timezone: loc.timezone,
        sensors,
        lastReportedUtc: loc.datetimeLast?.utc ?? null,
      },
    });
  }

  ranked.sort((a, b) => a.distanceKm - b.distanceKm || a.station.id - b.station.id);
  rejected.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  return { ranked, rejected };
}

function pmSensors(loc: OpenAqLocation): Partial<Record<Pollutant, readonly number[]>> {
  const out: Partial<Record<Pollutant, readonly number[]>> = {};
  for (const p of POLLUTANTS) {
    const ids = loc.sensors
      .filter((x) => x.parameter.id === OPENAQ_PARAMETER_ID[p] && isMicrogramsPerCubicMetre(x.parameter.units))
      .map((x) => x.id);
    if (ids.length > 0) out[p] = ids;
  }
  return out;
}

export function isFresh(utc: string | null, now: Date, maxHours: number): boolean {
  if (!utc) return false;
  const t = Date.parse(utc);
  if (Number.isNaN(t)) return false;
  const ageMs = now.getTime() - t;
  // A small future skew (clock drift) is OK; a far-future timestamp is not.
  return ageMs <= maxHours * 3_600_000 && ageMs >= -15 * 60_000;
}
