/**
 * OpenAQ v3 client — the ONLY source of measured air quality in Clearhour.
 *
 * Every response is checked against a zod schema. If OpenAQ changes shape,
 * we return `schema-mismatch` and the UI says "measurement unavailable".
 * We never guess.
 *
 * Server-only: needs OPENAQ_API_KEY (sent in the X-API-Key header).
 */

import { z } from "zod";
import type { IsoUtc, LatLon, Pollutant } from "../types";
import { describeHttpFailure, getJson, type FetchLike } from "./http";

const BASE = "https://api.openaq.org/v3";

/** OpenAQ caps `radius` at 25,000 m. */
export const OPENAQ_MAX_RADIUS_M = 25_000;

/** OpenAQ parameter ids (from the v3 docs). */
export const OPENAQ_PARAMETER_ID: Readonly<Record<Pollutant, number>> = { pm25: 2, pm10: 1 };

export type OpenAqError =
  | { readonly code: "key-missing" }
  | { readonly code: "unavailable"; readonly detail: string }
  | { readonly code: "schema-mismatch"; readonly detail: string };

export type OpenAqResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: OpenAqError };

export interface OpenAqClientOptions {
  readonly apiKey: string | undefined;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Schemas (only the fields we use; fields the docs mark nullable are nullable)
// ---------------------------------------------------------------------------

const DateTimePair = z.object({ utc: z.string(), local: z.string() });

const SensorSchema = z.object({
  id: z.number().int(),
  parameter: z.object({
    id: z.number().int(),
    name: z.string(),
    units: z.string(),
  }),
});

const LocationSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  locality: z.string().nullable(),
  timezone: z.string(),
  country: z.object({ code: z.string().nullable() }).nullable(),
  provider: z.object({ id: z.number().int(), name: z.string() }),
  isMobile: z.boolean(),
  isMonitor: z.boolean(),
  sensors: z.array(SensorSchema),
  coordinates: z.object({ latitude: z.number().nullable(), longitude: z.number().nullable() }).nullable(),
  datetimeLast: DateTimePair.nullable(),
});

const LatestSchema = z.object({
  datetime: DateTimePair,
  value: z.number(),
  sensorsId: z.number().int(),
  locationsId: z.number().int(),
});

const HourSchema = z.object({
  value: z.number().nullable(),
  parameter: z.object({ id: z.number().int(), units: z.string() }),
  period: z
    .object({
      datetimeFrom: DateTimePair,
      datetimeTo: DateTimePair,
    })
    .nullable(),
});

const page = <T extends z.ZodType>(item: T) => z.object({ results: z.array(item) });

export type OpenAqLocation = z.infer<typeof LocationSchema>;
export type OpenAqLatest = z.infer<typeof LatestSchema>;

export interface OpenAqHour {
  readonly value: number;
  readonly fromUtc: IsoUtc;
  readonly toUtc: IsoUtc;
}

/** OpenAQ and other sources write "µg/m³" with either MICRO SIGN or GREEK MU. */
export function isMicrogramsPerCubicMetre(units: string): boolean {
  return /^[µμ]g\/m(³|3)$/i.test(units.trim());
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export function createOpenAqClient(opts: OpenAqClientOptions) {
  async function call<T>(path: string, schema: z.ZodType<{ results: T[] }>): Promise<OpenAqResult<T[]>> {
    if (!opts.apiKey) return { ok: false, error: { code: "key-missing" } };
    const res = await getJson(`${BASE}${path}`, {
      headers: { "X-API-Key": opts.apiKey },
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    });
    if (!res.ok) return { ok: false, error: { code: "unavailable", detail: describeHttpFailure(res.error) } };
    const parsed = schema.safeParse(res.json);
    if (!parsed.success) {
      return { ok: false, error: { code: "schema-mismatch", detail: z.prettifyError(parsed.error) } };
    }
    return { ok: true, data: parsed.data.results };
  }

  return {
    /** Fixed (non-mobile) reference monitors within `radiusM` of `center`. */
    searchLocations(center: LatLon, radiusM: number): Promise<OpenAqResult<OpenAqLocation[]>> {
      const radius = Math.min(Math.max(1, Math.round(radiusM)), OPENAQ_MAX_RADIUS_M);
      const q = new URLSearchParams({
        coordinates: `${center.latitude.toFixed(4)},${center.longitude.toFixed(4)}`,
        radius: String(radius),
        monitor: "true",
        mobile: "false",
        limit: "100",
      });
      return call(`/locations?${q}`, page(LocationSchema));
    },

    /** Most recent value of every sensor at a location. */
    getLatest(locationId: number): Promise<OpenAqResult<OpenAqLatest[]>> {
      return call(`/locations/${locationId}/latest`, page(LatestSchema));
    },

    /**
     * Hourly mean values for a sensor in [fromUtc, toUtc]. Hours with a null
     * value or no period are dropped. They are never filled in.
     */
    async getSensorHours(sensorId: number, fromUtc: IsoUtc, toUtc: IsoUtc): Promise<OpenAqResult<OpenAqHour[]>> {
      const q = new URLSearchParams({ datetime_from: fromUtc, datetime_to: toUtc, limit: "100" });
      const res = await call(`/sensors/${sensorId}/hours?${q}`, page(HourSchema));
      if (!res.ok) return res;
      const hours: OpenAqHour[] = [];
      for (const h of res.data) {
        if (h.value === null || h.period === null) continue;
        if (!isMicrogramsPerCubicMetre(h.parameter.units)) {
          return { ok: false, error: { code: "schema-mismatch", detail: `unexpected units ${h.parameter.units}` } };
        }
        hours.push({ value: h.value, fromUtc: h.period.datetimeFrom.utc, toUtc: h.period.datetimeTo.utc });
      }
      return { ok: true, data: hours };
    },
  };
}

export type OpenAqClient = ReturnType<typeof createOpenAqClient>;
