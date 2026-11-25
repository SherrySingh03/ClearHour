import { describe, expect, it } from "vitest";
import { buildOpenMeteoUrl, parseOpenMeteo } from "@/lib/grounding/clients/openMeteo";
import { NOW } from "./helpers";

/** Same shape as a live response captured 2026-11-25 for Delhi. */
const payload = (over: Record<string, unknown> = {}) => ({
  latitude: 28.599998,
  longitude: 77.20001,
  generationtime_ms: 0.29,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 214,
  hourly_units: { time: "unixtime", pm2_5: "μg/m³", pm10: "μg/m³" },
  hourly: { time: [1795564800, 1795568400, 1795572000], pm2_5: [109.9, null, 136.9], pm10: [112.9, 121.1, -3] },
  ...over,
});

describe("Open-Meteo forecast parsing", () => {
  it("produces forecast-branded points with model provenance", () => {
    const r = parseOpenMeteo(payload(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.kind).toBe("forecast");
    expect(r.data.points.every((p) => p.kind === "forecast")).toBe(true);
    expect(r.data.points[0]).toMatchObject({ timeUtc: "2026-11-25T00:00:00.000Z", pm25: 109.9, pm10: 112.9 });
    expect(r.data.provenance).toMatchObject({
      kind: "forecast",
      model: "cams_global",
      nativeTimeStepHours: 3,
      hourlyIsInterpolated: true,
      gridCell: { latitude: 28.599998, longitude: 77.20001 },
    });
  });

  it("keeps model gaps as null and treats negative values as missing (never filled)", () => {
    const r = parseOpenMeteo(payload(), NOW);
    expect(r.ok && r.data.points[1]?.pm25).toBeNull();
    expect(r.ok && r.data.points[2]?.pm10).toBeNull();
  });

  it("fails closed on schema drift", () => {
    expect(parseOpenMeteo({ nope: true }, NOW)).toMatchObject({ ok: false, error: { code: "schema-mismatch" } });
    const ragged = payload({ hourly: { time: [1, 2], pm2_5: [1], pm10: [1, 2] } });
    expect(parseOpenMeteo(ragged, NOW)).toMatchObject({ ok: false, error: { code: "schema-mismatch" } });
    expect(parseOpenMeteo(payload({ utc_offset_seconds: 19800 }), NOW)).toMatchObject({ ok: false });
    const badUnits = payload({ hourly_units: { time: "unixtime", pm2_5: "ppm", pm10: "μg/m³" } });
    expect(parseOpenMeteo(badUnits, NOW)).toMatchObject({ ok: false, error: { code: "schema-mismatch" } });
  });

  it("reports an all-null forecast as empty", () => {
    const empty = payload({ hourly: { time: [1, 2], pm2_5: [null, null], pm10: [null, null] } });
    expect(parseOpenMeteo(empty, NOW)).toEqual({ ok: false, error: { code: "empty" } });
  });

  it("pins the model and uses unambiguous UTC timestamps", () => {
    const url = new URL(buildOpenMeteoUrl({ latitude: 28.6139, longitude: 77.209 }));
    expect(url.searchParams.get("domains")).toBe("cams_global");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("timezone")).toBe("GMT");
  });
});
