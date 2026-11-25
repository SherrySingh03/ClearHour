import type { OpenAqClient, OpenAqLatest, OpenAqLocation, OpenAqResult } from "@/lib/grounding/clients/openaq";
import type { OpenAqHour } from "@/lib/grounding/clients/openaq";

export const NOW = new Date("2026-11-25T06:30:00Z");
export const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

export const CONNAUGHT_PLACE = { latitude: 28.6315, longitude: 77.2167 };

export function loc(overrides: Partial<OpenAqLocation> & { id: number }): OpenAqLocation {
  return {
    name: `Station ${overrides.id}`,
    locality: "Delhi",
    timezone: "Asia/Kolkata",
    country: { code: "IN" },
    provider: { id: 168, name: "CPCB" },
    isMobile: false,
    isMonitor: true,
    sensors: [
      { id: overrides.id * 10 + 2, parameter: { id: 2, name: "pm25", units: "µg/m³" } },
      { id: overrides.id * 10 + 1, parameter: { id: 1, name: "pm10", units: "µg/m³" } },
    ],
    coordinates: { latitude: 28.63, longitude: 77.22 },
    datetimeLast: { utc: hoursAgo(1), local: "" },
    ...overrides,
  };
}

export function latest(sensorsId: number, value: number, utc = hoursAgo(1)): OpenAqLatest {
  return { datetime: { utc, local: `${utc} (local)` }, value, sensorsId, locationsId: Math.floor(sensorsId / 10) };
}

/** Hourly means ending at each of the last `n` hours. */
export function hours(n: number, value: number): OpenAqHour[] {
  return Array.from({ length: n }, (_, i) => ({ value, fromUtc: hoursAgo(i + 1), toUtc: hoursAgo(i) }));
}

type Handlers = {
  search?: () => OpenAqResult<OpenAqLocation[]>;
  latest?: (id: number) => OpenAqResult<OpenAqLatest[]>;
  hours?: (sensorId: number) => OpenAqResult<OpenAqHour[]>;
};

export function fakeOpenAq(h: Handlers): OpenAqClient {
  return {
    searchLocations: async () => (h.search ?? (() => ({ ok: true, data: [] })))(),
    getLatest: async (id) => (h.latest ?? (() => ({ ok: true, data: [] })))(id),
    getSensorHours: async (id) => (h.hours ?? (() => ({ ok: true, data: [] })))(id),
  };
}
