/**
 * English UI strings. This object defines the shape (UiStrings) every other
 * language must match exactly. Reason-code maps are typed Records over the
 * data layer's code unions, so a new code fails to compile until every
 * language has a message for it.
 *
 * Wording rule: every string that describes a number says what that number
 * is: which timeframe (latest single hour, 24-hour average, prediction), what
 * it is compared against, and where it was measured from.
 */

import type { AssumptionId } from "../../assumptions";
import type { CommuteMode, CookingFuel } from "../../profile/types";
import type { DayPart } from "../../plan/window";
import type { FactorId, FactorUnit } from "../../sourced/emissionFactors";
import type { WithheldReason } from "../../sourced/swaps";
import type {
  ForecastMissingReason,
  MeasuredMissingReason,
  NaqiCategory,
  NaqiMissingReason,
} from "../../grounding/types";

type Fn<P> = (p: P) => string;

/** The assumptions that can sit behind a swap figure. */
export type SwapAssumptionId = Extract<AssumptionId, "vehicle-representative-category" | "private-vehicle-solo" | "commute-round-trip" | "equal-stove-efficiency">;

export interface UiStrings {
  readonly app: { readonly name: string; readonly tagline: string };
  readonly common: {
    readonly unitUgm3: string;
    readonly pm25: string;
    readonly yes: string;
    readonly no: string;
    readonly loading: string;
    readonly retry: string;
    readonly language: string;
    readonly km: Fn<{ km: string }>;
    readonly kmUnit: string;
    readonly minutesAgo: Fn<{ n: number }>;
    readonly hoursAgo: Fn<{ n: number }>;
    readonly justNow: string;
  };
  /** The measured/forecast visual split, explained in plain words. */
  readonly key: { readonly measured: string; readonly forecast: string };
  readonly header: { readonly editAnswers: string; readonly cityLabel: string };
  readonly onboarding: {
    readonly title: string;
    readonly intro: string;
    readonly privacy: string;
    readonly progress: Fn<{ n: number; total: number }>;
    readonly back: string;
    readonly next: string;
    readonly finish: string;
    readonly city: { readonly question: string; readonly why: string; readonly placeholder: string };
    readonly commute: {
      readonly question: string;
      readonly why: string;
      readonly modes: Readonly<Record<CommuteMode, string>>;
      readonly distance: string;
      readonly distanceHint: string;
      readonly departure: string;
      readonly departureHint: string;
      readonly departureUnset: string;
    };
    readonly cooking: { readonly question: string; readonly why: string; readonly fuels: Readonly<Record<CookingFuel, string>> };
    readonly household: { readonly question: string; readonly why: string };
    readonly purifier: { readonly question: string; readonly why: string };
  };
  readonly measured: {
    readonly badge: string;
    /** Headline: the 24-hour CPCB category in plain words. */
    readonly verdict: Readonly<Record<NaqiCategory, Fn<{ city: string }>>>;
    readonly verdictBasis: Fn<{ km: string }>;
    readonly scalePosition: Fn<{ category: string; n: string; total: string }>;
    /** Attribution line under CPCB's verbatim statement. */
    readonly cpcbAttribution: Fn<{ category: string }>;
    readonly aqiLabel: string;
    readonly aqiScope: string;
    readonly aqiCapped: string;
    readonly latestLabel: string;
    readonly observed: Fn<{ time: string; ago: string }>;
    readonly aqiVsLatest: string;
    readonly detailsTitle: string;
    readonly station: Fn<{ name: string; km: string }>;
    readonly network: string;
    readonly lagNote: string;
    readonly aqiBasis: Fn<{ hours: number }>;
    readonly pm25Only: string;
    /** Label for the 24-hour value wherever it is quoted (also given to the plan writer). */
    readonly aqiTitle: string;
    readonly noAqiTitle: string;
    readonly noPm25Now: string;
    readonly reasons: Readonly<Record<MeasuredMissingReason, string>>;
    readonly naqiReasons: Readonly<Record<NaqiMissingReason, string>>;
    readonly forecastOnlyTitle: string;
    readonly forecastOnlyBody: string;
    readonly unknownTitle: string;
  };
  readonly categories: Readonly<Record<NaqiCategory, string>>;
  /** CPCB's published health statements. English is verbatim; other languages are marked translations. */
  readonly healthStatements: Readonly<Record<NaqiCategory, string>>;
  readonly healthStatementIsTranslation: string | null;
  readonly window: {
    readonly badge: string;
    readonly dayParts: Readonly<Record<DayPart, string>>;
    readonly cleanerThanRoutine: Fn<{ best: string; routine: string }>;
    readonly routineIsFine: Fn<{ routine: string }>;
    readonly clearBest: Fn<{ best: string }>;
    readonly noClearBest: string;
    readonly noClearBestDetail: string;
    /** Forecast exists, but no full stretch is left in today's outdoor hours. */
    readonly tooLate: string;
    readonly tooLateDetail: Fn<{ from: string; to: string }>;
    readonly routinePassed: string;
    readonly unavailable: string;
    readonly dropVsRoutine: Fn<{ drop: string; pct: string }>;
    readonly dropVsTypical: Fn<{ drop: string; pct: string }>;
    readonly categoryShift: Fn<{ from: string; to: string }>;
    /** Short form of the 3-hour-block caveat, always visible next to a window. */
    readonly approxNote: string;
    readonly caveat: string;
    readonly detailsTitle: string;
    readonly barTitle: string;
    readonly barBody: string;
  };
  readonly chart: {
    readonly title: string;
    readonly legendForecast: string;
    readonly legendBest: string;
    readonly legendRoutine: string;
    readonly now: string;
    readonly summary: Fn<{ min: string; max: string; minAt: string; maxAt: string }>;
  };
  readonly forecastReasons: Readonly<Record<ForecastMissingReason, string>>;
  readonly sources: {
    readonly title: string;
    readonly neverMixed: string;
    readonly openaq: string;
    readonly cpcb: string;
    readonly openMeteo: string;
    readonly cams: string;
  };
  readonly swaps: {
    readonly targets: Readonly<Record<"bus" | "suburban-rail" | "metro" | "walk-cycle" | "png" | "lpg", string>>;
    /** A lower bound, with the condition it holds under. */
    readonly atLeastKgPerDay: Fn<{ kg: string }>;
    /** As above; the source's hybrid row is lower, so petrol-car owners get that condition too. */
    readonly atLeastKgPerDayPetrolCar: Fn<{ kg: string }>;
    readonly percentLess: Fn<{ pct: string }>;
    readonly ifAvailable: string;
  };
  readonly indoor: {
    readonly title: string;
    readonly intro: string;
    readonly anyDay: string;
    readonly becauseMeasured: Fn<{ category: string }>;
    readonly categoryUnknown: string;
    readonly leftOut: Fn<{ category: string }>;
    readonly evidence: string;
    readonly originalWording: string;
    /** Set for languages whose advice text is Clearhour's own translation. */
    readonly translationNote: string | null;
  };
  readonly swapsSection: {
    readonly title: string;
    readonly intro: string;
    readonly none: string;
    readonly evidence: string;
    readonly sumKg: Fn<{ from: string; to: string; km: string; result: string }>;
    readonly sumPercent: Fn<{ from: string; to: string; result: string }>;
    readonly factorsTitle: string;
    readonly factorLabels: Readonly<Record<FactorId | "none", string>>;
    readonly factorUnits: Readonly<Record<FactorUnit, string>>;
    readonly factorLine: Fn<{ label: string; value: string; unit: string }>;
    readonly sourceRow: string;
    readonly assumedTitle: string;
    readonly assumed: Readonly<Record<SwapAssumptionId, string>>;
    readonly noHybrids: string;
    readonly dataAge: string;
    readonly busScope: string;
    readonly whyTitle: string;
    readonly aboutTitle: string;
    readonly co2OnlyNotes: Readonly<Record<"fuels" | "walking", string>>;
    readonly gatedTitle: string;
    readonly gatedPoor: Fn<{ category: string }>;
    readonly gatedUnknown: string;
    readonly withheldTitle: string;
    readonly withheld: Readonly<Record<WithheldReason, string>>;
  };
  readonly plan: {
    readonly title: string;
    readonly byline: string;
    readonly get: string;
    readonly loading: string;
    /** Any plan failure. Says what on the page still works, given what is actually there. */
    readonly unavailable: Fn<{ reading: boolean; forecast: boolean }>;
    /** A plan is reused for up to three hours, so it says when it was generated and from what. */
    readonly preparedAt: Fn<{ time: string; ago: string; reading: string | null }>;
    readonly outlookUsed: Fn<{ items: readonly { part: string; category: string }[] }>;
    readonly sourceSays: string;
    /** A reused plan suggests something the page no longer offers. */
    readonly outdated: string;
    readonly retry: string;
    readonly gapsIntro: string;
    readonly seeForecast: string;
    readonly source: Fn<{ title: string }>;
  };
  readonly errors: { readonly unavailable: string; readonly busy: string };
}

export const en: UiStrings = {
  app: { name: "Clearhour", tagline: "How the air is today, the cleanest time to go out, and what helps at home" },
  common: {
    unitUgm3: "µg/m³",
    pm25: "PM2.5",
    yes: "Yes",
    no: "No",
    loading: "Loading today's air…",
    retry: "Try again",
    language: "Language",
    km: ({ km }) => `${km} km`,
    kmUnit: "km",
    minutesAgo: ({ n }) => `${n} min ago`,
    hoursAgo: ({ n }) => (n === 1 ? "about 1 hour ago" : `about ${n} hours ago`),
    justNow: "just now",
  },
  key: {
    measured: "Solid boxes are readings from a real air monitor.",
    forecast: "Hazy boxes are a computer prediction.",
  },
  header: { editAnswers: "Change answers", cityLabel: "City" },
  onboarding: {
    title: "A few quick questions",
    intro: "Five questions, about twenty seconds. They let us fit today's advice to your home.",
    privacy: "Your answers stay on this device. No account needed.",
    progress: ({ n, total }) => `${n} of ${total}`,
    back: "Back",
    next: "Next",
    finish: "Show my day",
    city: {
      question: "Which city do you live in?",
      why: "So we can find the nearest government air monitor. We look from the city centre and use the closest one with a recent reading.",
      placeholder: "Choose your city",
    },
    commute: {
      question: "How do you usually get to work or school?",
      why: "So we can compare the time you leave with the cleanest air, and show ways to travel with less CO₂.",
      modes: {
        "car-petrol": "Car (petrol)",
        "car-diesel": "Car (diesel)",
        "car-cng": "Car (CNG)",
        "two-wheeler": "Scooter or motorbike",
        "auto-rickshaw": "Auto-rickshaw",
        bus: "Bus",
        metro: "Metro",
        "suburban-rail": "Local train",
        "walk-cycle": "Walk or cycle",
        none: "I don't travel to work or school",
      },
      distance: "About how far is it, one way?",
      distanceHint: "A rough guess is fine.",
      departure: "What time do you usually leave?",
      departureHint: "Optional. We'll compare it with the cleanest time of day.",
      departureUnset: "It varies",
    },
    cooking: {
      question: "What do you usually cook on?",
      why: "So we can include kitchen advice that fits your stove.",
      fuels: {
        lpg: "LPG cylinder",
        png: "Piped gas (PNG)",
        electric: "Electric or induction",
        biomass: "Wood, dung or crop waste",
        kerosene: "Kerosene",
      },
    },
    household: { question: "Do children or older people live with you?", why: "Some government advice is just for them." },
    purifier: { question: "Do you have an air purifier at home?", why: "So we can include advice on using one, or choosing one." },
  },
  measured: {
    badge: "Real monitor reading",
    verdict: {
      good: ({ city }) => `Good air in ${city} over the last 24 hours`,
      satisfactory: ({ city }) => `Satisfactory air in ${city} over the last 24 hours`,
      moderate: ({ city }) => `Moderate air pollution in ${city} over the last 24 hours`,
      poor: ({ city }) => `Poor air in ${city} over the last 24 hours`,
      "very-poor": ({ city }) => `Very poor air in ${city} over the last 24 hours`,
      severe: ({ city }) => `Severe air pollution in ${city} over the last 24 hours`,
    },
    verdictBasis: ({ km }) => `From fine dust (PM2.5) at one government monitor, ${km} from the city centre.`,
    scalePosition: ({ category, n, total }) => `${category} is level ${n} of ${total} on CPCB's scale, from Good to Severe.`,
    cpcbAttribution: ({ category }) => `CPCB on ${category} air, National Air Quality Index (2014)`,
    aqiLabel: "24-hour air level (AQI)",
    aqiScope: "Out of 500, based on the last 24 hours",
    aqiCapped: "At the top of the scale",
    latestLabel: "Latest fine-dust reading (PM2.5)",
    observed: ({ time, ago }) => `For ${time}, ${ago}`,
    aqiVsLatest: "The AQI covers 24 hours. The latest reading is a single hour, so the two can differ.",
    detailsTitle: "About these readings",
    station: ({ name, km }) => `Monitor: ${name}, ${km} from the city centre`,
    network: "A CPCB monitoring station. Readings come to us through OpenAQ.",
    lagNote: "Readings usually reach us a few hours after they are taken.",
    aqiBasis: ({ hours }) => `The 24-hour level is worked out from ${hours} hourly readings at this monitor in the last 24 hours, using CPCB's formula.`,
    pm25Only: "It counts fine dust (PM2.5) only. CPCB's official AQI also counts other pollutants, so the official figure can be higher.",
    aqiTitle: "24-hour air level (AQI) from fine dust (PM2.5), averaged over the last 24 hours",
    noAqiTitle: "No 24-hour air level right now",
    noPm25Now: "No recent fine-dust (PM2.5) reading from this monitor.",
    reasons: {
      "no-station-in-radius": "No government air monitor within 25 km of the city centre has sent a reading in the last 6 hours.",
      "openaq-key-missing": "Monitor readings aren't set up on this server.",
      "openaq-unavailable": "Monitor readings couldn't be reached. Try again in a few minutes.",
      "openaq-schema-mismatch": "Monitor readings arrived in an unexpected format, so they aren't shown.",
    },
    naqiReasons: {
      "insufficient-hours": "Not enough hourly readings in the last 24 hours to work out a 24-hour air level (CPCB needs at least 16).",
      "no-sensor": "This monitor doesn't measure fine dust (PM2.5).",
      "no-live-sensor": "This monitor has no recent fine-dust (PM2.5) reading.",
      "openaq-unavailable": "This monitor's recent hours couldn't be reached.",
      "openaq-schema-mismatch": "This monitor's recent hours arrived in an unexpected format, so they aren't shown.",
    },
    forecastOnlyTitle: "No air monitor close enough",
    forecastOnlyBody:
      "No government air monitor within 25 km of the city centre has sent a reading in the last 6 hours, so there's nothing measured to show. The prediction below is all there is.",
    unknownTitle: "Monitor readings aren't available right now",
  },
  categories: {
    good: "Good",
    satisfactory: "Satisfactory",
    moderate: "Moderate",
    poor: "Poor",
    "very-poor": "Very poor",
    severe: "Severe",
  },
  healthStatements: {
    good: "Minimal Impact",
    satisfactory: "Minor breathing discomfort to sensitive people",
    moderate: "Breathing discomfort to the people with lung, heart disease, children and older adults",
    poor: "Breathing discomfort to people on prolonged exposure",
    "very-poor": "Respiratory illness to the people on prolonged exposure",
    severe: "Respiratory effects even on healthy people",
  },
  healthStatementIsTranslation: null,
  window: {
    badge: "Prediction for today",
    dayParts: { morning: "morning", afternoon: "afternoon", evening: "evening" },
    cleanerThanRoutine: ({ best, routine }) => `Around ${best} looks clearly cleaner than when you usually leave (${routine})`,
    routineIsFine: ({ routine }) => `No other time today looks clearly cleaner than when you usually leave (${routine})`,
    clearBest: ({ best }) => `Cleanest time to be outside today: around ${best}`,
    noClearBest: "No part of today is clearly cleaner than the rest",
    noClearBestDetail: "The cleanest stretch left today isn't clearly better than a typical one, so there's no better time to pick.",
    tooLate: "Too little of today is left to pick a cleaner time",
    tooLateDetail: ({ from, to }) => `We only pick 3-hour stretches between ${from} and ${to}. Check again tomorrow morning.`,
    routinePassed: "The time you usually leave has already passed today.",
    unavailable: "The prediction isn't available right now",
    dropVsRoutine: ({ drop, pct }) => `About ${drop} µg/m³ less fine dust predicted than when you usually leave (${pct}% less).`,
    dropVsTypical: ({ drop, pct }) => `About ${drop} µg/m³ less fine dust predicted than a typical 3-hour stretch for the rest of today (${pct}% less).`,
    categoryShift: ({ from, to }) => `Roughly ${to} instead of ${from} on CPCB's scale.`,
    approxNote: "Times are approximate: the model works in 3-hour blocks.",
    caveat: "This is a prediction from a computer model, not a reading. The model works in 3-hour blocks, so treat these times as approximate.",
    detailsTitle: "How this prediction works",
    barTitle: "What counts as clearly cleaner",
    barBody:
      "Either a better level on CPCB's scale, or at least 30 µg/m³ and 25% less fine dust (PM2.5). The levels here are only a rough guide: CPCB sets them for 24-hour averages, and these are 3-hour predictions.",
  },
  chart: {
    title: "Predicted fine dust (PM2.5) today",
    legendForecast: "Prediction",
    legendBest: "Cleanest stretch",
    legendRoutine: "When you usually leave",
    now: "Now",
    summary: ({ min, max, minAt, maxAt }) => `Predicted fine dust today goes from about ${min} µg/m³ around ${minAt} to ${max} µg/m³ around ${maxAt}.`,
  },
  forecastReasons: {
    "open-meteo-unavailable": "The prediction couldn't be reached. Try again in a few minutes.",
    "open-meteo-schema-mismatch": "The prediction arrived in an unexpected format, so it isn't shown.",
    "forecast-empty": "The prediction has no values for this place.",
  },
  sources: {
    title: "Where this comes from",
    neverMixed: "Readings and predictions are never mixed into one number.",
    openaq: "Monitor readings: OpenAQ (CPCB stations)",
    cpcb: "24-hour air level formula and CPCB statements: CPCB National Air Quality Index (2014)",
    openMeteo: "Prediction: Open-Meteo (CC BY 4.0)",
    cams: "Generated using Copernicus Atmosphere Monitoring Service information",
  },
  swaps: {
    targets: {
      bus: "Take the bus when you can",
      "suburban-rail": "Take the local train when you can",
      metro: "Take the metro when you can",
      "walk-cycle": "Walk or cycle when you can",
      png: "Switch to piped gas (PNG)",
      lpg: "Switch to LPG",
    },
    atLeastKgPerDay: ({ kg }) => `At least ${kg} kg less CO₂ per working day (there and back), if you travel alone`,
    atLeastKgPerDayPetrolCar: ({ kg }) => `At least ${kg} kg less CO₂ per working day (there and back), if you travel alone and your car isn't a hybrid`,
    percentLess: ({ pct }) => `About ${pct}% less CO₂ for the same cooking heat, assuming both stoves are equally efficient`,
    ifAvailable: "If it's available where you live or on your route.",
  },
  indoor: {
    title: "Inside your home",
    intro: "Advice from official sources, picked using your answers.",
    anyDay: "Applies any day.",
    becauseMeasured: ({ category }) => `Shown because fine dust over the last 24 hours was at the ${category} level.`,
    categoryUnknown: "Meant for poor-air days. There's no 24-hour air level right now to check against.",
    leftOut: ({ category }) =>
      `Advice meant only for poor-air days is left out: fine dust over the last 24 hours was at the ${category} level. CPCB's official AQI also counts other pollutants and can be higher.`,
    evidence: "Where this advice comes from",
    originalWording: "Original wording",
    translationNote: null,
  },
  swapsSection: {
    title: "Ways to cut CO₂",
    intro: "Based on your travel and cooking. These figures count CO₂ only.",
    none: "We have no CO₂ swap to suggest for the travel and cooking you described.",
    evidence: "How we worked this out",
    sumKg: ({ from, to, km, result }) => `(${from} − ${to}) × ${km} km there and back = ${result} kg of CO₂`,
    sumPercent: ({ from, to, result }) => `(${from} − ${to}) ÷ ${from} = ${result}% less`,
    factorsTitle: "The published figures used",
    factorLabels: {
      "car-petrol": "Small petrol car (under 800 cc)",
      "car-diesel": "Diesel hatchback (under 1000 cc)",
      "car-cng": "Small CNG car (under 800 cc)",
      "two-wheeler": "Motorcycle (under 125 cc)",
      "bus-intracity": "City bus, per passenger",
      "rail-suburban": "Suburban train, per passenger",
      "lpg-combustion": "Burning LPG",
      "natural-gas-combustion": "Burning natural gas",
      "kerosene-combustion": "Burning kerosene",
      none: "Walking or cycling (no fuel burned)",
    },
    factorUnits: {
      "kgCO2/vehicle-km": "kg of CO₂ per km driven",
      "kgCO2/passenger-km": "kg of CO₂ per passenger per km",
      "kgCO2/TJ": "kg of CO₂ per terajoule of fuel energy",
    },
    factorLine: ({ label, value, unit }) => `${label}: ${value} ${unit}`,
    sourceRow: "As printed in the source",
    assumedTitle: "What we assumed",
    assumed: {
      "vehicle-representative-category": "We counted the lowest-emitting non-hybrid vehicle of your type in the source table. Others would save more.",
      "private-vehicle-solo": "You travel alone. Sharing a vehicle means each person saves less.",
      "commute-round-trip": "You travel your distance there and back on a working day.",
      "equal-stove-efficiency": "Both stoves turn the same share of their fuel into useful heat.",
    },
    noHybrids: "Hybrid cars are not covered: the source's hybrid figure is lower than the one used here.",
    dataAge: "The transport figures date from 2015, the latest India-specific set we found. A newer vehicle may differ.",
    busScope: "The bus figure is for ordinary city buses, not bus rapid transit or intercity buses.",
    whyTitle: "Why this is suggested",
    aboutTitle: "What the source says about this",
    co2OnlyNotes: {
      fuels: "This swap rests on the CO₂ figure alone. The source counts both LPG and natural gas as clean fuels.",
      walking:
        "This swap rests on the CO₂ figure alone. The health ministry advises against outdoor walks and exercise on poor-to-severe days, so it isn't suggested then.",
    },
    gatedTitle: "Walking or cycling: not suggested today",
    gatedPoor: ({ category }) =>
      `Fine dust over the last 24 hours was at the ${category} level. The health ministry advises against outdoor walks and exercise on poor-to-severe days.`,
    gatedUnknown:
      "There's no 24-hour air level to check right now. The health ministry advises against outdoor walks and exercise on poor-to-severe days.",
    withheldTitle: "No figure for these",
    withheld: {
      "no-verified-metro-factor": "We haven't found a verified per-passenger figure for the metro, so we don't show a number.",
      "no-per-passenger-auto-factor": "The source gives auto-rickshaw CO₂ per vehicle, not per passenger, so there's no fair comparison to show.",
      "biomass-co2-not-comparable":
        "CO₂ from wood, dung and crop waste is counted differently in international rules, and we have no sourced stove-efficiency figures to compare with. The sources suggest cleaner fuel because of the air inside the home.",
    },
  },
  plan: {
    title: "Your plan for today",
    byline: "Optional. A short summary written by Google's Gemini AI from this page and your answers, then checked before it's shown.",
    get: "Get today's plan",
    loading: "Preparing your plan…",
    unavailable: ({ reading, forecast }) => {
      const base = "The plan is temporarily unavailable.";
      if (reading && forecast) return `${base} The readings and forecast above are live and don't depend on it.`;
      if (forecast) return `${base} The forecast above is live and doesn't depend on it.`;
      if (reading) return `${base} The readings above are live and don't depend on it.`;
      return base;
    },
    preparedAt: ({ time, ago, reading }) => {
      const from = reading === null ? "" : `, from the reading for ${reading}`;
      return `Plan generated at ${time} (${ago})${from}. The readings above may be newer, and the best time may have changed.`;
    },
    outlookUsed: ({ items }) => `Forecast it used (rough guide): ${items.map((i) => `${i.part} ${i.category}`).join(", ")}.`,
    retry: "Try again",
    gapsIntro: "This plan is missing:",
    seeForecast: "See the prediction above",
    sourceSays: "What the source says",
    outdated: "This plan was written before today's air level changed, so it isn't shown. The readings and advice on this page are up to date.",
    source: ({ title }) => `Source: ${title}`,
  },
  errors: {
    unavailable: "Today's air is temporarily unavailable. Try again in a minute.",
    busy: "Too many requests in a short time. Wait a minute, then try again.",
  },
};
