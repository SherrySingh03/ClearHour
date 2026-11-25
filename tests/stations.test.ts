import { describe, expect, it } from "vitest";
import { resolveStations } from "@/lib/grounding/stations";
import type { OpenAqLocation } from "@/lib/grounding/clients/openaq";
import type { StationRejection } from "@/lib/grounding/types";
import { CONNAUGHT_PLACE, hoursAgo, loc, NOW } from "./helpers";

const cases: [StationRejection, Partial<OpenAqLocation>][] = [
    ["missing-coordinates", { coordinates: { latitude: null, longitude: null } }],
    ["mobile", { isMobile: true }],
    ["not-reference-monitor", { isMonitor: false }],
    ["provider-not-allowed", { provider: { id: 9, name: "PurpleAir" } }],
    ["no-pm-sensor", { sensors: [{ id: 5, parameter: { id: 7, name: "no2", units: "ppm" } }] }],
    ["out-of-radius", { coordinates: { latitude: 28.98, longitude: 77.7 } }],
    ["stale", { datetimeLast: { utc: hoursAgo(8), local: "" } }],
    ["stale", { datetimeLast: null }],
];

describe("station resolution", () => {
  it("ranks eligible CPCB stations nearest first", () => {
    const far = loc({ id: 1, coordinates: { latitude: 28.7, longitude: 77.1 } });
    const near = loc({ id: 2, coordinates: { latitude: 28.632, longitude: 77.217 } });
    const { ranked } = resolveStations(CONNAUGHT_PLACE, [far, near], NOW);
    expect(ranked.map((r) => r.station.id)).toEqual([2, 1]);
    expect(ranked[0]?.distanceKm).toBeLessThan(0.2);
    expect(ranked[0]?.station.sensors).toEqual({ pm25: [22], pm10: [21] });
  });

  it.each(cases)("rejects with %s", (reason, overrides) => {
    const { ranked, rejected } = resolveStations(CONNAUGHT_PLACE, [loc({ id: 3, ...overrides })], NOW);
    expect(ranked).toHaveLength(0);
    expect(rejected).toEqual([expect.objectContaining({ id: 3, reason })]);
  });

  it("treats a PM sensor in unexpected units as absent", () => {
    const odd = loc({ id: 4, sensors: [{ id: 41, parameter: { id: 2, name: "pm25", units: "ppm" } }] });
    expect(resolveStations(CONNAUGHT_PLACE, [odd], NOW).rejected[0]?.reason).toBe("no-pm-sensor");
  });

  it("accepts both spellings of µg/m³", () => {
    const greekMu = loc({ id: 5, sensors: [{ id: 52, parameter: { id: 2, name: "pm25", units: "μg/m³" } }] });
    expect(resolveStations(CONNAUGHT_PLACE, [greekMu], NOW).ranked).toHaveLength(1);
  });

  it("matches the provider by id, so a lookalike name does not pass", () => {
    const lookalike = loc({ id: 6, provider: { id: 999, name: "CPCB" } });
    expect(resolveStations(CONNAUGHT_PLACE, [lookalike], NOW).rejected[0]?.reason).toBe("provider-not-allowed");
    const legacy = loc({ id: 7, provider: { id: 163, name: "caaqm" } });
    expect(resolveStations(CONNAUGHT_PLACE, [legacy], NOW).rejected[0]?.reason).toBe("provider-not-allowed");
  });
});
