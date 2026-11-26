/**
 * The plan inputs of the README's "Sample inputs" A, B and C, exactly as the
 * app sends them. `npm run prewarm` requests these, and a test checks they are
 * already in the app's canonical form (otherwise they would warm a different
 * cache entry from the one an evaluator hits).
 */
/** Must match PLAN_TTL_SECONDS in src/lib/plan/clock.ts (a test checks it). */
export const PLAN_TTL_HOURS = 3;

export const SAMPLES = [
  {
    id: "A",
    label: "Delhi, English",
    locale: "en",
    profile: { cityId: "delhi", commute: { mode: "car-petrol", oneWayKm: 12, departureHour: 9 }, cookingFuel: "lpg", hasChildrenOrElderly: true, hasAirPurifier: false },
  },
  {
    id: "B",
    label: "Lucknow, Hindi",
    locale: "hi",
    profile: { cityId: "lucknow", commute: { mode: "auto-rickshaw", oneWayKm: 2, departureHour: 8 }, cookingFuel: "biomass", hasChildrenOrElderly: true, hasAirPurifier: true },
  },
  {
    id: "C",
    label: "Kolkata, English, no departure time",
    locale: "en",
    profile: { cityId: "kolkata", commute: { mode: "two-wheeler", oneWayKm: 8 }, cookingFuel: "png", hasChildrenOrElderly: false, hasAirPurifier: false },
  },
];
