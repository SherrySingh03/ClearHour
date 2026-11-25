/**
 * Open-Meteo Air Quality client (keyless). The ONLY source of forecast data.
 *
 * Everything this returns is MODELED (CAMS global). It is wrapped in
 * ForecastSeries / ForecastPoint, and the type system keeps it from being
 * used as a measurement.
 *
 * Request shape:
 *   - domains=cams_global : pin the model so provenance is exact
 *   - timeformat=unixtime, timezone=GMT : clear timestamps, no local-time guessing
 *   - past_days=1, forecast_days=2 : the UI can draw all of "today" in IST
 */

import { z } from "zod";
import { makeForecastPoint, type ForecastPoint, type ForecastSeries, type LatLon } from "../types";
import { describeHttpFailure, getJson, type FetchLike } from "./http";
import { isMicrogramsPerCubicMetre } from "./openaq";

const BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";

export type OpenMeteoError =
  | { readonly code: "unavailable"; readonly detail: string }
  | { readonly code: "schema-mismatch"; readonly detail: string }
  | { readonly code: "empty" };

export type OpenMeteoResult =
  | { readonly ok: true; readonly data: ForecastSeries }
  | { readonly ok: false; readonly error: OpenMeteoError };

export interface OpenMeteoOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  /** Injected clock for deterministic tests. */
  readonly now?: () => Date;
}

const nullableNumbers = z.array(z.number().nullable());

const ResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.literal(0),
  hourly_units: z.object({ time: z.literal("unixtime"), pm2_5: z.string(), pm10: z.string() }),
  hourly: z.object({
    time: z.array(z.number().int()),
    pm2_5: nullableNumbers,
    pm10: nullableNumbers,
  }),
});

export function buildOpenMeteoUrl(p: LatLon): string {
  const q = new URLSearchParams({
    latitude: p.latitude.toFixed(4),
    longitude: p.longitude.toFixed(4),
    hourly: "pm2_5,pm10",
    domains: "cams_global",
    timeformat: "unixtime",
    timezone: "GMT",
    past_days: "1",
    forecast_days: "2",
  });
  return `${BASE}?${q}`;
}

/** Turns an already-fetched payload into a ForecastSeries. Pure; exported for tests. */
export function parseOpenMeteo(json: unknown, retrievedAt: Date): OpenMeteoResult {
  const parsed = ResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: { code: "schema-mismatch", detail: z.prettifyError(parsed.error) } };
  }
  const { hourly, hourly_units: units } = parsed.data;
  if (!isMicrogramsPerCubicMetre(units.pm2_5) || !isMicrogramsPerCubicMetre(units.pm10)) {
    return { ok: false, error: { code: "schema-mismatch", detail: `unexpected units ${units.pm2_5}/${units.pm10}` } };
  }
  const n = hourly.time.length;
  if (hourly.pm2_5.length !== n || hourly.pm10.length !== n) {
    return { ok: false, error: { code: "schema-mismatch", detail: "hourly arrays differ in length" } };
  }

  const points: ForecastPoint[] = hourly.time.map((t, i) =>
    makeForecastPoint({
      timeUtc: new Date(t * 1000).toISOString(),
      pm25: sanitize(hourly.pm2_5[i]),
      pm10: sanitize(hourly.pm10[i]),
    }),
  );
  if (points.every((p) => p.pm25 === null && p.pm10 === null)) return { ok: false, error: { code: "empty" } };

  return {
    ok: true,
    data: {
      kind: "forecast",
      unit: "µg/m³",
      points,
      provenance: {
        kind: "forecast",
        source: "open-meteo",
        model: "cams_global",
        gridCell: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
        gridResolutionDeg: 0.4,
        nativeTimeStepHours: 3,
        hourlyIsInterpolated: true,
        retrievedAt: retrievedAt.toISOString(),
        citations: ["open-meteo-air-quality", "cams-global"],
      },
    },
  };
}

/** Negative or non-finite model output is treated as missing, not clamped. */
function sanitize(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export async function fetchForecast(p: LatLon, opts: OpenMeteoOptions = {}): Promise<OpenMeteoResult> {
  const res = await getJson(buildOpenMeteoUrl(p), {
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  });
  if (!res.ok) return { ok: false, error: { code: "unavailable", detail: describeHttpFailure(res.error) } };
  return parseOpenMeteo(res.json, (opts.now ?? (() => new Date()))());
}
