/**
 * Builds the GroundingSnapshot for a location: coverage, measured, forecast.
 *
 * Measured and forecast are fetched independently and returned in separate
 * fields. If one fails, the other is still returned, and the failed one is
 * reported as missing with a reason. Neither ever fills in for the other.
 */

import { NAQI_MIN_HOURS_24H, naqiSubIndex } from "./aqi/cpcb";
import type { OpenAqClient, OpenAqError } from "./clients/openaq";
import { OPENAQ_MAX_RADIUS_M } from "./clients/openaq";
import { fetchForecast as defaultFetchForecast, type OpenMeteoResult } from "./clients/openMeteo";
import { DEFAULT_POLICY, isFresh, resolveStations, type RankedStation, type ResolutionPolicy } from "./stations";
import {
  makeMeasured,
  missing,
  ok,
  POLLUTANTS,
  type ComputedNaqiSubIndex,
  type Coverage,
  type ForecastMissingReason,
  type ForecastSeries,
  type Grounded,
  type GroundingSnapshot,
  type LatLon,
  type MeasuredBlock,
  type MeasuredMissingReason,
  type MeasuredValue,
  type NaqiMissingReason,
  type Pollutant,
  type RejectedStation,
  type Station,
} from "./types";

/**
 * JUDGMENT CALL (not a standard) — assumptions.ts#pm-plausibility-ceiling.
 * Data-QA ceiling, not a health threshold: hourly PM values above this are
 * treated as instrument faults and ignored. They are never clamped.
 */
export const MAX_PLAUSIBLE_PM_UGM3 = 1500;

/** JUDGMENT CALL — assumptions.ts#station-attempts. How many nearest eligible stations to try for a fresh reading. */
const MAX_STATION_ATTEMPTS = 3;

export interface SnapshotDeps {
  readonly openaq: OpenAqClient;
  readonly fetchForecast?: (p: LatLon) => Promise<OpenMeteoResult>;
  readonly now?: () => Date;
  readonly policy?: ResolutionPolicy;
}

export async function getGroundingSnapshot(query: LatLon, deps: SnapshotDeps): Promise<GroundingSnapshot> {
  const now = (deps.now ?? (() => new Date()))();
  const policy = deps.policy ?? DEFAULT_POLICY;
  const forecastFn = deps.fetchForecast ?? ((p: LatLon) => defaultFetchForecast(p));

  const [measuredSide, forecast] = await Promise.all([
    measure(query, deps.openaq, now, policy),
    forecastFn(query).then(toForecastGrounded),
  ]);

  return {
    generatedAt: now.toISOString(),
    query,
    coverage: measuredSide.coverage,
    measured: measuredSide.measured,
    forecast,
  };
}

// ---------------------------------------------------------------------------
// Forecast side
// ---------------------------------------------------------------------------

function toForecastGrounded(r: OpenMeteoResult): Grounded<ForecastSeries, ForecastMissingReason> {
  if (r.ok) return ok(r.data);
  switch (r.error.code) {
    case "unavailable":
      return missing("open-meteo-unavailable", r.error.detail);
    case "schema-mismatch":
      return missing("open-meteo-schema-mismatch", r.error.detail);
    case "empty":
      return missing("forecast-empty");
  }
}

// ---------------------------------------------------------------------------
// Measured side
// ---------------------------------------------------------------------------

interface MeasuredSide {
  readonly coverage: Coverage;
  readonly measured: Grounded<MeasuredBlock, MeasuredMissingReason>;
}

function openAqReason(e: OpenAqError): MeasuredMissingReason {
  switch (e.code) {
    case "key-missing":
      return "openaq-key-missing";
    case "unavailable":
      return "openaq-unavailable";
    case "schema-mismatch":
      return "openaq-schema-mismatch";
  }
}

async function measure(query: LatLon, client: OpenAqClient, now: Date, policy: ResolutionPolicy): Promise<MeasuredSide> {
  const radiusKm = Math.min(policy.radiusKm, OPENAQ_MAX_RADIUS_M / 1000);

  const search = await client.searchLocations(query, radiusKm * 1000);
  if (!search.ok) {
    const reason = openAqReason(search.error);
    const detail = "detail" in search.error ? search.error.detail : undefined;
    return { coverage: { status: "unknown", reason }, measured: missing(reason, detail) };
  }

  const { ranked, rejected: metaRejected } = resolveStations(query, search.data, now, { ...policy, radiusKm });
  const rejected: RejectedStation[] = [...metaRejected];

  for (const candidate of ranked.slice(0, MAX_STATION_ATTEMPTS)) {
    const latest = await readLatest(candidate, client, now, policy);
    if (!latest.ok) {
      // A failed call is an outage, not evidence that no station exists.
      return { coverage: { status: "unknown", reason: latest.reason }, measured: latest };
    }
    if (Object.keys(latest.data).length === 0) {
      rejected.push({
        id: candidate.station.id,
        name: candidate.station.name,
        distanceKm: candidate.distanceKm,
        reason: "no-fresh-reading",
      });
      continue;
    }

    const naqi24h = await computeNaqi(candidate.station, latest.data, client, now);
    return {
      coverage: {
        status: "station",
        station: candidate.station,
        distanceKm: candidate.distanceKm,
        searchRadiusKm: radiusKm,
        rejected,
      },
      measured: ok({ latest: latest.data, naqi24h }),
    };
  }

  return {
    coverage: { status: "no-station", searchRadiusKm: radiusKm, rejected },
    measured: missing("no-station-in-radius"),
  };
}

async function readLatest(
  candidate: RankedStation,
  client: OpenAqClient,
  now: Date,
  policy: ResolutionPolicy,
): Promise<Grounded<Partial<Record<Pollutant, MeasuredValue>>, MeasuredMissingReason>> {
  const res = await client.getLatest(candidate.station.id);
  if (!res.ok) {
    return missing(openAqReason(res.error), "detail" in res.error ? res.error.detail : undefined);
  }
  const { station } = candidate;
  const retrievedAt = now.toISOString();
  const out: Partial<Record<Pollutant, MeasuredValue>> = {};

  for (const p of POLLUTANTS) {
    const candidates = station.sensors[p] ?? [];
    // Among this pollutant's sensors, use the newest fresh, plausible reading.
    // Retired sensors (last value years ago) drop out here.
    const row = res.data
      .filter((r) => candidates.includes(r.sensorsId))
      .filter((r) => isFresh(r.datetime.utc, now, policy.maxStalenessHours) && isPlausiblePm(r.value))
      .sort((a, b) => Date.parse(b.datetime.utc) - Date.parse(a.datetime.utc))[0];
    if (!row) continue;
    const sensorId = row.sensorsId;
    out[p] = makeMeasured({
      pollutant: p,
      unit: "µg/m³",
      value: row.value,
      provenance: {
        kind: "measured",
        source: "openaq",
        station: {
          id: station.id,
          name: station.name,
          locality: station.locality,
          provider: station.provider,
          coordinates: station.coordinates,
        },
        sensorId,
        observedAt: { utc: row.datetime.utc, local: row.datetime.local },
        retrievedAt,
        citations: ["cpcb-caaqms", "openaq-v3"],
      },
    });
  }
  return ok(out);
}

export function isPlausiblePm(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= MAX_PLAUSIBLE_PM_UGM3;
}

/**
 * 24-hour sub-index per pollutant, computed from the same live sensor that
 * produced the latest reading, so the two numbers always come from one instrument.
 */
async function computeNaqi(
  station: Station,
  latest: Partial<Record<Pollutant, MeasuredValue>>,
  client: OpenAqClient,
  now: Date,
): Promise<Record<Pollutant, Grounded<ComputedNaqiSubIndex, NaqiMissingReason>>> {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 24 * 3_600_000).toISOString();

  const entries = await Promise.all(
    POLLUTANTS.map(async (p): Promise<[Pollutant, Grounded<ComputedNaqiSubIndex, NaqiMissingReason>]> => {
      if (!station.sensors[p]?.length) return [p, missing("no-sensor")];
      const sensorId = latest[p]?.provenance.sensorId;
      if (sensorId === undefined) return [p, missing("no-live-sensor")];
      const res = await client.getSensorHours(sensorId, from, to);
      if (!res.ok) {
        const reason: NaqiMissingReason =
          res.error.code === "schema-mismatch" ? "openaq-schema-mismatch" : "openaq-unavailable";
        return [p, missing(reason)];
      }
      return [p, naqiFromHours(p, station.id, res.data, from, to)];
    }),
  );
  return Object.fromEntries(entries) as Record<Pollutant, Grounded<ComputedNaqiSubIndex, NaqiMissingReason>>;
}

/**
 * Pure: average the distinct, plausible hourly means whose period ends in
 * (from, to], then apply CPCB breakpoints. Needs at least 16 hours (CPCB rule),
 * otherwise reports `insufficient-hours`.
 */
export function naqiFromHours(
  pollutant: Pollutant,
  stationId: number,
  hours: readonly { value: number; fromUtc: string; toUtc: string }[],
  fromUtc: string,
  toUtc: string,
): Grounded<ComputedNaqiSubIndex, NaqiMissingReason> {
  const lo = Date.parse(fromUtc);
  const hi = Date.parse(toUtc);
  const byHour = new Map<string, number>();
  for (const h of hours) {
    const end = Date.parse(h.toUtc);
    if (Number.isNaN(end) || end <= lo || end > hi) continue;
    if (!isPlausiblePm(h.value)) continue;
    byHour.set(h.fromUtc, h.value);
  }
  const values = [...byHour.values()];
  if (values.length < NAQI_MIN_HOURS_24H) {
    return missing("insufficient-hours", `${values.length}/${NAQI_MIN_HOURS_24H}`);
  }
  const average24h = values.reduce((a, b) => a + b, 0) / values.length;
  const { subIndex, cappedAtScaleMax, category } = naqiSubIndex(pollutant, average24h);
  return ok({
    kind: "computed",
    basis: "measured-24h-average",
    pollutant,
    average24h: Math.round(average24h * 10) / 10,
    unit: "µg/m³",
    hoursObserved: values.length,
    hoursRequired: NAQI_MIN_HOURS_24H,
    windowUtc: { from: fromUtc, to: toUtc },
    subIndex,
    cappedAtScaleMax,
    category,
    stationId,
    citations: ["cpcb-naqi-2014", "cpcb-aqi-calculator", "cpcb-caaqms", "openaq-v3"],
  });
}
