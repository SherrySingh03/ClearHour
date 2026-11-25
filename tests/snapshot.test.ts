import { describe, expect, it } from "vitest";
import { parseOpenMeteo, type OpenMeteoResult } from "@/lib/grounding/clients/openMeteo";
import { getGroundingSnapshot } from "@/lib/grounding/snapshot";
import { CONNAUGHT_PLACE, fakeOpenAq, hours, hoursAgo, latest, loc, NOW } from "./helpers";

const forecastOk = async (): Promise<OpenMeteoResult> =>
  parseOpenMeteo(
    {
      latitude: 28.6,
      longitude: 77.2,
      utc_offset_seconds: 0,
      hourly_units: { time: "unixtime", pm2_5: "μg/m³", pm10: "μg/m³" },
      hourly: { time: [1795564800], pm2_5: [110], pm10: [115] },
    },
    NOW,
  );
const forecastDown = async (): Promise<OpenMeteoResult> => ({ ok: false, error: { code: "unavailable", detail: "HTTP 503" } });

const run = (openaq: ReturnType<typeof fakeOpenAq>, fetchForecast = forecastOk) =>
  getGroundingSnapshot(CONNAUGHT_PLACE, { openaq, fetchForecast, now: () => NOW });

describe("grounding snapshot", () => {
  it("returns a measured reading with station + timestamp, and the forecast separately", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 7 })] }),
        latest: () => ({ ok: true, data: [latest(72, 182.4), latest(71, 240)] }),
        hours: () => ({ ok: true, data: hours(24, 180) }),
      }),
    );
    expect(s.coverage).toMatchObject({ status: "station", station: { id: 7, provider: "CPCB" } });
    expect(s.measured.ok).toBe(true);
    if (!s.measured.ok) return;
    const pm25 = s.measured.data.latest.pm25;
    expect(pm25).toMatchObject({ kind: "measured", value: 182.4, provenance: { station: { name: "Station 7" } } });
    expect(pm25?.provenance.observedAt.utc).toBe(hoursAgo(1));
    expect(s.measured.data.naqi24h.pm25).toMatchObject({ ok: true, data: { category: "very-poor" } });
    expect(s.forecast).toMatchObject({ ok: true, data: { kind: "forecast" } });
  });

  it("without an API key: coverage unknown, measured missing, forecast still served", async () => {
    const s = await run(fakeOpenAq({ search: () => ({ ok: false, error: { code: "key-missing" } }) }));
    expect(s.coverage).toEqual({ status: "unknown", reason: "openaq-key-missing" });
    expect(s.measured).toEqual({ ok: false, reason: "openaq-key-missing" });
    expect(s.forecast.ok).toBe(true);
  });

  it("no station in radius: says so, and does not fill measured from the forecast", async () => {
    const s = await run(fakeOpenAq({ search: () => ({ ok: true, data: [loc({ id: 8, isMonitor: false })] }) }));
    expect(s.coverage).toMatchObject({ status: "no-station", rejected: [{ reason: "not-reference-monitor" }] });
    expect(s.measured).toEqual({ ok: false, reason: "no-station-in-radius" });
    expect(s.forecast.ok).toBe(true);
  });

  it("skips a station whose latest reading is stale and uses the next nearest", async () => {
    const near = loc({ id: 1, coordinates: { latitude: 28.6316, longitude: 77.2168 } });
    const next = loc({ id: 2, coordinates: { latitude: 28.64, longitude: 77.23 } });
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [near, next] }),
        latest: (id) => ({ ok: true, data: id === 1 ? [latest(12, 150, hoursAgo(9))] : [latest(22, 160)] }),
        hours: () => ({ ok: true, data: hours(20, 160) }),
      }),
    );
    expect(s.coverage).toMatchObject({ status: "station", station: { id: 2 } });
    if (s.coverage.status === "station") {
      expect(s.coverage.rejected).toContainEqual(expect.objectContaining({ id: 1, reason: "no-fresh-reading" }));
    }
  });

  it("uses the live sensor when a station also lists a retired one for the same pollutant", async () => {
    // Real layout seen at Mandir Marg (OpenAQ location 6358) on 2026-11-25:
    // pm25 sensor 17770 last reported 2022-10-31, sensor 12234778 is live.
    const station = loc({
      id: 9,
      sensors: [
        { id: 17770, parameter: { id: 2, name: "pm25", units: "µg/m³" } },
        { id: 12234778, parameter: { id: 2, name: "pm25", units: "µg/m³" } },
      ],
    });
    const requestedHoursFor: number[] = [];
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [station] }),
        latest: () => ({
          ok: true,
          data: [latest(17770, 60, "2022-10-31T00:45:00Z"), latest(12234778, 86, hoursAgo(3))],
        }),
        hours: (sensorId) => {
          requestedHoursFor.push(sensorId);
          return { ok: true, data: hours(20, 80) };
        },
      }),
    );
    expect(s.measured.ok && s.measured.data.latest.pm25).toMatchObject({ value: 86, provenance: { sensorId: 12234778 } });
    expect(requestedHoursFor).toEqual([12234778]);
    expect(s.measured.ok && s.measured.data.naqi24h.pm10).toEqual({ ok: false, reason: "no-sensor" });
  });

  it("accepts CPCB's routine ~3–4 h reporting lag", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 10, datetimeLast: { utc: hoursAgo(4.3), local: "" } })] }),
        latest: () => ({ ok: true, data: [latest(102, 140, hoursAgo(4.3))] }),
      }),
    );
    expect(s.coverage.status).toBe("station");
  });

  it("an OpenAQ outage is 'unknown', never 'no station'", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 3 })] }),
        latest: () => ({ ok: false, error: { code: "unavailable", detail: "HTTP 502" } }),
      }),
    );
    expect(s.coverage).toEqual({ status: "unknown", reason: "openaq-unavailable" });
    expect(s.measured).toMatchObject({ ok: false, reason: "openaq-unavailable" });
  });

  it("a forecast outage leaves the measured side intact", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 4 })] }),
        latest: () => ({ ok: true, data: [latest(42, 99)] }),
        hours: () => ({ ok: true, data: hours(10, 99) }),
      }),
      forecastDown,
    );
    expect(s.forecast).toEqual({ ok: false, reason: "open-meteo-unavailable", detail: "HTTP 503" });
    expect(s.measured.ok && s.measured.data.latest.pm25?.value).toBe(99);
    expect(s.measured.ok && s.measured.data.naqi24h.pm25).toMatchObject({ ok: false, reason: "insufficient-hours" });
  });

  it("drops implausible readings instead of showing them", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 5 })] }),
        latest: () => ({ ok: true, data: [latest(52, 9999), latest(51, 210)] }),
      }),
    );
    expect(s.measured.ok && s.measured.data.latest.pm25).toBeUndefined();
    expect(s.measured.ok && s.measured.data.latest.pm10?.value).toBe(210);
    expect(s.measured.ok && s.measured.data.naqi24h.pm25).toEqual({ ok: false, reason: "no-live-sensor" });
  });

  it("never puts a measured value under forecast, or a forecast value under measured", async () => {
    const s = await run(
      fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 6 })] }),
        latest: () => ({ ok: true, data: [latest(62, 120), latest(61, 150)] }),
        hours: () => ({ ok: true, data: hours(24, 120) }),
      }),
    );
    const kinds = (x: unknown, acc: string[] = []): string[] => {
      if (x && typeof x === "object") {
        const k = (x as { kind?: unknown }).kind;
        if (typeof k === "string") acc.push(k);
        for (const v of Object.values(x)) kinds(v, acc);
      }
      return acc;
    };
    expect(new Set(kinds(s.forecast))).toEqual(new Set(["forecast"]));
    expect(new Set(kinds(s.measured.ok ? s.measured.data.latest : null))).toEqual(new Set(["measured"]));
    expect(new Set(kinds(s.measured.ok ? s.measured.data.naqi24h : null))).toEqual(new Set(["computed"]));
  });
});
