import { makeForecastPoint, makeMeasured, type GroundingSnapshot } from "@/lib/grounding/types";
import type { HouseholdProfile } from "@/lib/profile/types";

export const NOW = new Date("2026-11-24T22:30:00Z"); // 04:00 IST, 25 Nov

export const forecastPoints = Array.from({ length: 24 }, (_, i) => {
  const localHour = 0.5 + i;
  return makeForecastPoint({
    timeUtc: new Date(Date.parse("2026-11-24T19:00:00Z") + i * 3_600_000).toISOString(),
    pm25: localHour >= 5 && localHour < 9 ? 150 : 290,
    pm10: null,
  });
});

export const station = { id: 6358, name: "Mandir Marg, New Delhi - DPCC", locality: "Delhi", provider: "CPCB", coordinates: { latitude: 28.636, longitude: 77.201 } };

export const snapshotWithStation: GroundingSnapshot = {
  generatedAt: NOW.toISOString(),
  query: { latitude: 28.6139, longitude: 77.209 },
  coverage: { status: "station", station: { ...station, timezone: "Asia/Kolkata", sensors: { pm25: [12234778] }, lastReportedUtc: "2026-11-24T21:00:00Z" }, distanceKm: 2.6, searchRadiusKm: 25, rejected: [] },
  measured: {
    ok: true,
    data: {
      latest: {
        pm25: makeMeasured({
          pollutant: "pm25",
          unit: "µg/m³",
          value: 45,
          provenance: { kind: "measured", source: "openaq", station, sensorId: 12234778, observedAt: { utc: "2026-11-24T21:00:00Z", local: "" }, retrievedAt: NOW.toISOString(), citations: ["cpcb-caaqms", "openaq-v3"] },
        }),
      },
      naqi24h: {
        pm25: {
          ok: true,
          data: { kind: "computed", basis: "measured-24h-average", pollutant: "pm25", average24h: 96, unit: "µg/m³", hoursObserved: 21, hoursRequired: 16, windowUtc: { from: "", to: "" }, subIndex: 220, cappedAtScaleMax: false, category: "poor", stationId: 6358, citations: ["cpcb-naqi-2014"] },
        },
        pm10: { ok: false, reason: "no-sensor" },
      },
    },
  },
  forecast: {
    ok: true,
    data: {
      kind: "forecast",
      unit: "µg/m³",
      points: forecastPoints,
      provenance: { kind: "forecast", source: "open-meteo", model: "cams_global", gridCell: { latitude: 28.6, longitude: 77.2 }, gridResolutionDeg: 0.4, nativeTimeStepHours: 3, hourlyIsInterpolated: true, retrievedAt: NOW.toISOString(), citations: ["open-meteo-air-quality", "cams-global"] },
    },
  },
};

export const snapshotNoStation: GroundingSnapshot = {
  ...snapshotWithStation,
  coverage: { status: "no-station", searchRadiusKm: 25, rejected: [] },
  measured: { ok: false, reason: "no-station-in-radius" },
};

export const profile: HouseholdProfile = {
  cityId: "delhi",
  commute: { mode: "car-petrol", oneWayKm: 12, departureHour: 9 },
  cookingFuel: "lpg",
  hasChildrenOrElderly: true,
  hasAirPurifier: false,
};

export const input = { snapshot: snapshotWithStation, profile, locale: "en" as const, now: NOW };

/** A plan that passes every check; tests break exactly one thing in it. */
export const validPlan = {
  headline: "Go out early today: the forecast is clearly cleaner before your commute.",
  steps: [
    { kind: "window", refId: "window", note: "The forecast shows 5:30 – 8:30 am as cleaner than 8:30 – 11:30 am, so leave earlier if you can." },
    { kind: "guidance", refId: "ventilate-midday", note: "Today is a Poor day at the nearest station, so keep windows shut in the morning." },
    { kind: "swap", refId: "commute:car-petrol->bus", note: "Taking the bus would avoid about 2.3 kg of CO₂ on a working day." },
  ],
  acknowledgedGaps: [],
};

