/**
 * Clearhour's own judgment calls. These are NOT published standards.
 *
 * Every threshold or modelling choice that is ours rather than a source's is
 * listed here with its value, the reason for it, and the code that uses it.
 * Same discipline as `hourlyIsInterpolated`: the README's "Assumptions"
 * section mirrors this list, and a test fails if the README is missing an id.
 */

export interface Assumption {
  readonly id: AssumptionId;
  readonly value: string;
  readonly rationale: string;
  readonly usedIn: readonly string[];
}

export type AssumptionId =
  | "station-radius"
  | "station-freshness"
  | "pm-plausibility-ceiling"
  | "station-attempts"
  | "coordinate-rounding"
  | "snapshot-cache"
  | "naqi-display-rounding"
  | "naqi-cap-500"
  | "vehicle-representative-category"
  | "private-vehicle-solo"
  | "commute-round-trip"
  | "walk-cycle-max-distance"
  | "equal-stove-efficiency"
  | "window-stretch-length"
  | "window-outdoor-hours"
  | "window-indicative-category"
  | "window-materially-cleaner"
  | "window-routine-stretch"
  | "plan-time-bucket"
  | "plan-concurrency"
  | "plan-model-budget"
  | "distance-rounding"
  | "plan-health-vocabulary"
  | "plan-timeframe-binding";

export const ASSUMPTIONS: Readonly<Record<AssumptionId, Assumption>> = {
  "station-radius": {
    id: "station-radius",
    value: "25 km",
    rationale:
      "Largest radius the OpenAQ v3 API accepts. Beyond it a station says little about the user's air, so we report 'no station' instead of reaching further.",
    usedIn: ["src/lib/grounding/stations.ts"],
  },
  "station-freshness": {
    id: "station-freshness",
    value: "6 hours",
    rationale:
      "First set at 3 h, then widened after a live check on 2026-11-25: all 48 live CPCB stations near Delhi had a newest OpenAQ reading 2.8–4.3 h old, an ingestion lag rather than outages. 6 h accepts that lag but drops stations that have actually stopped. The reading's own timestamp is always shown.",
    usedIn: ["src/lib/grounding/stations.ts", "src/lib/grounding/snapshot.ts"],
  },
  "pm-plausibility-ceiling": {
    id: "pm-plausibility-ceiling",
    value: "1500 µg/m³ (hourly PM2.5 or PM10)",
    rationale:
      "Data-quality filter for instrument faults, not a health threshold. Hourly values above it are dropped, never clamped. Set well above extreme winter readings in Delhi so that real smog is never discarded.",
    usedIn: ["src/lib/grounding/snapshot.ts"],
  },
  "station-attempts": {
    id: "station-attempts",
    value: "3 nearest eligible stations",
    rationale: "If the nearest station has no fresh reading, try the next two before reporting no coverage. Bounds OpenAQ calls per lookup.",
    usedIn: ["src/lib/grounding/snapshot.ts"],
  },
  "coordinate-rounding": {
    id: "coordinate-rounding",
    value: "0.01° (~1.1 km)",
    rationale:
      "Much finer than the 25 km station search or the ~45 km forecast grid, so results don't change. It bounds the number of distinct upstream lookups and means the server never handles an exact home location.",
    usedIn: ["src/lib/grounding/public.ts", "src/app/api/grounding/route.ts"],
  },
  "snapshot-cache": {
    id: "snapshot-cache",
    value: "10 minutes; outages use Next's 'seconds' profile",
    rationale: "CPCB data reaches OpenAQ every 15–60 min, so 10 min loses nothing. Outage results are retried quickly instead of being served for 10 min.",
    usedIn: ["src/lib/grounding/server.ts"],
  },
  "naqi-display-rounding": {
    id: "naqi-display-rounding",
    value: "Nearest integer",
    rationale: "CPCB's calculator shows unrounded sub-indices; CPCB bulletins report whole numbers. We follow the bulletins.",
    usedIn: ["src/lib/grounding/aqi/cpcb.ts"],
  },
  "naqi-cap-500": {
    id: "naqi-cap-500",
    value: "Sub-index capped at 500",
    rationale:
      "CPCB's calculator continues the Very Poor slope with no upper limit; the NAQI report defines the scale as 0–500 (Table 3.11). Values above 500 are shown as 500 and flagged.",
    usedIn: ["src/lib/grounding/aqi/cpcb.ts"],
  },
  "vehicle-representative-category": {
    id: "vehicle-representative-category",
    value: "Lowest-emitting common category per vehicle type",
    rationale:
      "Onboarding does not ask engine size. We use the lowest factor in the India GHG Program table for the user's vehicle type (petrol car: Small <800 cc; diesel car: Hatchback <1000 cc; CNG car: Small <800 cc; two-wheeler: Motorcycle <125 cc). Avoided emissions are then a lower bound, never an overstatement.",
    usedIn: ["src/lib/sourced/emissionFactors.ts"],
  },
  "private-vehicle-solo": {
    id: "private-vehicle-solo",
    value: "One person per car or two-wheeler trip",
    rationale: "Car and two-wheeler factors are per vehicle-km. Without occupancy we attribute the whole vehicle's emissions to the commuter. Stated next to every such swap.",
    usedIn: ["src/lib/sourced/swaps.ts"],
  },
  "commute-round-trip": {
    id: "commute-round-trip",
    value: "2 × one-way distance, per working day",
    rationale: "Onboarding asks for a one-way distance; swaps are reported per working day for both legs.",
    usedIn: ["src/lib/sourced/swaps.ts"],
  },
  "walk-cycle-max-distance": {
    id: "walk-cycle-max-distance",
    value: "Offered only for one-way trips ≤ 3 km",
    rationale: "Walking or cycling is suggested only where it is plausibly practical. Below this distance it is offered alongside bus and rail, never instead of them.",
    usedIn: ["src/lib/sourced/swaps.ts"],
  },
  "equal-stove-efficiency": {
    id: "equal-stove-efficiency",
    value: "Same useful heat per unit of fuel energy across gas/kerosene stoves",
    rationale:
      "Cooking-fuel comparisons use IPCC CO2 per TJ of fuel energy and assume equal stove efficiency, since we have no sourced efficiency figures. Biomass is excluded: its CO2 is biogenic under IPCC and its stoves differ too much in efficiency for this assumption.",
    usedIn: ["src/lib/sourced/swaps.ts"],
  },
  "window-stretch-length": {
    id: "window-stretch-length",
    value: "3 consecutive hourly forecast points",
    rationale:
      "CAMS global steps every 3 hours; Open-Meteo interpolates the hours between. A best window is always a 3-hour stretch, never one hour the model can't resolve.",
    usedIn: ["src/lib/plan/window.ts"],
  },
  "window-outdoor-hours": {
    id: "window-outdoor-hours",
    value: "Stretches between 05:00 and 22:00 local time",
    rationale: "Best-time suggestions are limited to hours when people realistically go out.",
    usedIn: ["src/lib/plan/window.ts"],
  },
  "window-indicative-category": {
    id: "window-indicative-category",
    value: "CPCB category of a 3-hour forecast mean is 'indicative'",
    rationale:
      "CPCB breakpoints are defined on 24-hour averages. Applying them to a 3-hour modeled mean is a comparison aid only, labelled as such and never shown as an AQI.",
    usedIn: ["src/lib/plan/window.ts"],
  },
  "window-materially-cleaner": {
    id: "window-materially-cleaner",
    value: "Better indicative CPCB category, OR a PM2.5 drop of ≥ 30 µg/m³ AND ≥ 25%",
    rationale:
      "Product rule set by the project owner. The OR keeps large drops visible during all-day Severe smog, when categories don't change. The absolute + relative pair handles both ends of the scale. If nothing clears the bar, no winner is named.",
    usedIn: ["src/lib/plan/window.ts"],
  },
  "distance-rounding": {
    id: "distance-rounding",
    value: "Nearest 0.5 km",
    rationale: "Commute distance is a rough guess, so 0.5 km precision loses nothing. It also bounds how many distinct profiles, and so distinct cached Gemini plans, a caller can create.",
    usedIn: ["src/lib/profile/storage.ts", "src/components/Onboarding.tsx"],
  },
  "plan-concurrency": {
    id: "plan-concurrency",
    value: "4 plan generations at once per server instance",
    rationale: "Bounds Gemini spend and open connections. When full, the route turns requests away immediately with its generic 502; the UI offers a retry. Cache hits release their slot within milliseconds.",
    usedIn: ["src/lib/plan/limiter.ts", "src/app/api/plan/route.ts"],
  },
  "plan-model-budget": {
    id: "plan-model-budget",
    value: "50 s total per plan; fallback model only on 5xx/timeout with ≥ 15 s left",
    rationale: "Live plans took 5–18 s. One shared deadline stops primary + fallback from doubling the time a request can hold. No fallback on 429 (quota), which a second model would only spend faster.",
    usedIn: ["src/lib/plan/gemini.ts"],
  },
  "plan-time-bucket": {
    id: "plan-time-bucket",
    value: "15 minutes",
    rationale: "Plans are cached per (city, language, profile, 15-minute bucket). The best window depends on the time of day, so a plan is never reused across buckets; inside one it is identical, which bounds Gemini calls.",
    usedIn: ["src/lib/plan/request.ts", "src/lib/plan/server.ts"],
  },
  "plan-health-vocabulary": {
    id: "plan-health-vocabulary",
    value: "Broad English + Hindi health/medical/safety/exposure word list",
    rationale: "Any match rejects the whole plan. Deliberately over-inclusive: a false positive costs a retry, a false negative would put an unsourced health claim on screen. The CPCB statement is shown by the UI, never by the plan.",
    usedIn: ["src/lib/plan/validate.ts"],
  },
  "plan-timeframe-binding": {
    id: "plan-timeframe-binding",
    value: "Per sentence: 24-hour AQI needs '24 hours' and no 'now'; latest reading no 'now'/forecast; forecast numbers need 'forecast'",
    rationale:
      "Units alone let a real number be quoted as the wrong thing (the 24-hour AQI written as 'current air quality'). Each measured or predicted number carries its role, and the sentence quoting it must fit that role. Word lists are broad on purpose: a false positive costs a retry, a false negative misstates a number.",
    usedIn: ["src/lib/plan/validate.ts", "src/lib/plan/packet.ts"],
  },
  "window-routine-stretch": {
    id: "window-routine-stretch",
    value: "The 3-hour stretch starting at the last forecast point at or before departure",
    rationale: "Forecast points fall on the half hour in IST. This stretch always covers the departure time and the following two hours.",
    usedIn: ["src/lib/plan/window.ts"],
  },
};
