import { describe, expect, it } from "vitest";
import { parseOpenMeteo } from "@/lib/grounding/clients/openMeteo";
import { failureNotes, isCacheable, quantize, toPublicSnapshot } from "@/lib/grounding/public";
import { getGroundingSnapshot } from "@/lib/grounding/snapshot";
import { CONNAUGHT_PLACE, fakeOpenAq, hours, latest, loc, NOW } from "./helpers";

const forecastDown = async () =>
  ({ ok: false, error: { code: "unavailable", detail: "network: getaddrinfo ENOTFOUND internal-proxy.local" } }) as const;

describe("public snapshot", () => {
  it("strips upstream error text but keeps reason codes, and logs the detail instead", async () => {
    const s = await getGroundingSnapshot(CONNAUGHT_PLACE, {
      openaq: fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 1 })] }),
        latest: () => ({ ok: true, data: [latest(12, 120)] }),
        hours: () => ({ ok: true, data: hours(5, 120) }),
      }),
      fetchForecast: forecastDown,
      now: () => NOW,
    });

    const pub = toPublicSnapshot(s);
    expect(JSON.stringify(pub)).not.toContain("ENOTFOUND");
    expect(JSON.stringify(pub)).not.toContain('"detail"');
    expect(pub.forecast).toEqual({ ok: false, reason: "open-meteo-unavailable" });
    expect(pub.measured.ok && pub.measured.data.naqi24h.pm25).toEqual({ ok: false, reason: "insufficient-hours" });
    expect(pub.measured.ok && pub.measured.data.latest.pm25?.value).toBe(120);

    expect(failureNotes(s)).toContainEqual({
      where: "forecast",
      reason: "open-meteo-unavailable",
      detail: "network: getaddrinfo ENOTFOUND internal-proxy.local",
    });
    expect(isCacheable(s)).toBe(false);
  });

  it("caches a genuine 'no station' answer but not an outage", async () => {
    const forecastOk = async () =>
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
    const noStation = await getGroundingSnapshot(CONNAUGHT_PLACE, {
      openaq: fakeOpenAq({}),
      fetchForecast: forecastOk,
      now: () => NOW,
    });
    expect(noStation.coverage.status).toBe("no-station");
    expect(isCacheable(noStation)).toBe(true);

    const outage = await getGroundingSnapshot(CONNAUGHT_PLACE, {
      openaq: fakeOpenAq({ search: () => ({ ok: false, error: { code: "unavailable", detail: "HTTP 502" } }) }),
      fetchForecast: forecastOk,
      now: () => NOW,
    });
    expect(isCacheable(outage)).toBe(false);
  });

  it("does not cache when only the 24 h AQI step hit an outage", async () => {
    const forecastOk = async () =>
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
    const s = await getGroundingSnapshot(CONNAUGHT_PLACE, {
      openaq: fakeOpenAq({
        search: () => ({ ok: true, data: [loc({ id: 2 })] }),
        latest: () => ({ ok: true, data: [latest(22, 120), latest(21, 160)] }),
        hours: () => ({ ok: false, error: { code: "unavailable", detail: "HTTP 503" } }),
      }),
      fetchForecast: forecastOk,
      now: () => NOW,
    });
    expect(s.coverage.status).toBe("station");
    expect(s.forecast.ok).toBe(true);
    expect(s.measured.ok && s.measured.data.naqi24h.pm25).toMatchObject({ ok: false, reason: "openaq-unavailable" });
    expect(isCacheable(s)).toBe(false);
  });

  it("rounds coordinates to 0.01°", () => {
    expect(quantize({ latitude: 28.613912, longitude: 77.209047 })).toEqual({ latitude: 28.61, longitude: 77.21 });
  });
});
