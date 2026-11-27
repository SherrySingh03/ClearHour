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
  | "plan-lifetime"
  | "plan-forecast-label"
  | "walk-cycle-poor-day-gate"
  | "forecast-day-parts"
  | "plan-concurrency"
  | "plan-model-budget"
  | "plan-model-chain"
  | "distance-rounding"
  | "plan-health-vocabulary"
  | "plan-timeframe-binding"
  | "saving-lower-bound";

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
      "Onboarding does not ask engine size. We use the lowest non-hybrid factor in the India GHG Program table for the user's vehicle type (petrol car: Small <800 cc; diesel car: Hatchback <1000 cc; CNG car: Small <800 cc; two-wheeler: Motorcycle <125 cc). For a solo traveller, avoided emissions are then a lower bound; a petrol hybrid (0.103 in the same table) is the exception, so petrol-car figures say so.",
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
    value: "50 s total per plan; at most 20 s per model; no new attempt with under 8 s left",
    rationale: "Flash-Lite plans took 2–5 s in testing. One shared deadline stops the chain from multiplying the time a request can hold; the per-model cap leaves room to try the next.",
    usedIn: ["src/lib/plan/model-chain.ts"],
  },
  "plan-model-chain": {
    id: "plan-model-chain",
    value: "gemini-3.5-flash-lite → 3.1-flash-lite → 3.8-flash → 3.6-flash; next model on quota, overload, timeout, retired model or an answer that is not JSON",
    rationale:
      "Free-tier quota is counted per model. Order set by the project owner from live runs (3.5 Flash-Lite about 1.3 s; 3.1 Flash-Lite timed out three times). The two Flash models showed a limit of 20 requests a day in their quota errors; the Lite limits are not published and were not confirmed. An unreadable answer moves to the next model; a plan the validator rejects does not.",
    usedIn: ["src/lib/plan/model-chain.ts", "src/lib/plan/gemini.ts"],
  },
  "plan-lifetime": {
    id: "plan-lifetime",
    value: "One plan per city, language, answers and Indian day, reused for 3 hours; its generation time is shown",
    rationale:
      "The free tier allows few model calls and testing time is unknown, so identical requests share one plan for three hours (set by the project owner). The staleness is disclosed beside the plan. The day is in the key because a plan talks about today. The forecast box on the page stays live.",
    usedIn: ["src/lib/plan/clock.ts", "src/lib/plan/server.ts", "src/components/PlanPanel.tsx"],
  },
  "plan-forecast-label": {
    id: "plan-forecast-label",
    value: "In the headline and best-time step, each sentence naming a clock time or part of day must say 'forecast' or 'predicted' (पूर्वानुमान)",
    rationale:
      "An unlabelled forecast time reads like a measurement. Looser words ('expected', 'model') don't tell a reader that. Cited advice steps are exempt (their hours are the source's), as is the household's own departure time.",
    usedIn: ["src/lib/plan/validate.ts", "src/lib/plan/lexicon.ts"],
  },
  "walk-cycle-poor-day-gate": {
    id: "walk-cycle-poor-day-gate",
    value: "No walking or cycling suggestion when the 24-hour PM2.5 level is Poor or worse, or unavailable",
    rationale:
      "MoHFW advises against outdoor walks and exercise on poor-to-severe days (Annexure I item 1; Annexure II item 4(a)-(b)). With no level to check, it is not suggested. The level is the PM2.5 sub-index from one monitor, so a day that is Poor only because of another pollutant is not caught.",
    usedIn: ["src/lib/sourced/swaps.ts", "src/components/SwapsPanel.tsx", "src/components/PlanPanel.tsx"],
  },
  "forecast-day-parts": {
    id: "forecast-day-parts",
    value: "Morning 05–12, afternoon 12–17, evening 17–22; indicative CPCB category of the mean of at least 3 upcoming forecast points",
    rationale:
      "Lets the plan speak about parts of the day from computed forecast data instead of guessing. Breakpoints are 24-hour, so these are a rough guide, and the plan card shows the same words it was given.",
    usedIn: ["src/lib/plan/window.ts", "src/lib/plan/packet.ts"],
  },
  "plan-health-vocabulary": {
    id: "plan-health-vocabulary",
    value: "One concept table (health, medical, safety, exposure, risk, caution) with words for every UI language",
    rationale: "Any match rejects the whole plan. Deliberately over-inclusive: a false positive costs a retry, a false negative would put an unsourced health claim on screen. The CPCB statement is shown by the UI, never by the plan.",
    usedIn: ["src/lib/plan/validate.ts"],
  },
  "saving-lower-bound": {
    id: "saving-lower-bound",
    value: "Commute savings shown as 'at least', rounded down to 2 significant figures, with their conditions",
    rationale:
      "The figure is a floor only for a solo traveller in a vehicle emitting at least as much as the one assumed (and, for petrol cars, not a hybrid, whose source row is lower). Rounding to nearest could push 'at least' above the computed value, so it rounds down. It rests on 2015 factors, which the evidence panel says.",
    usedIn: ["src/lib/view/describe.ts", "src/components/SwapsPanel.tsx"],
  },
  "plan-timeframe-binding": {
    id: "plan-timeframe-binding",
    value: "Per sentence: 24-hour AQI needs '24 hours' and no 'now'; latest reading no 'now'/forecast. Savings and forecast differences are never given to the model",
    rationale:
      "Units alone let a real number be quoted as the wrong thing (the 24-hour AQI written as 'current air quality'), so each measured number carries its role. Reductions are different: free text can reverse them ('saves 0.4 kg less') in too many ways to check by wording, so the model never receives them and only the UI states them. Word lists are broad on purpose: a false positive costs a retry, a false negative misstates a number.",
    usedIn: ["src/lib/plan/validate.ts", "src/lib/plan/packet.ts"],
  },
  "window-routine-stretch": {
    id: "window-routine-stretch",
    value: "The 3-hour stretch starting at the last forecast point at or before departure",
    rationale: "Forecast points fall on the half hour in IST. This stretch always covers the departure time and the following two hours.",
    usedIn: ["src/lib/plan/window.ts"],
  },
};
