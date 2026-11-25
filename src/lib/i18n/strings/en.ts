/**
 * English UI strings. This object defines the shape (UiStrings) every other
 * language must match exactly. Reason-code maps are typed Records over the
 * data layer's code unions, so a new code fails to compile until every
 * language has a message for it.
 */

import type { CommuteMode, CookingFuel } from "../../profile/types";
import type {
  ForecastMissingReason,
  MeasuredMissingReason,
  NaqiCategory,
  NaqiMissingReason,
} from "../../grounding/types";

type Fn<P> = (p: P) => string;

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
  readonly key: { readonly measured: string; readonly forecast: string; readonly explainer: string };
  readonly header: { readonly editAnswers: string; readonly cityLabel: string };
  readonly onboarding: {
    readonly title: string;
    readonly privacy: string;
    readonly progress: Fn<{ n: number; total: number }>;
    readonly back: string;
    readonly next: string;
    readonly finish: string;
    readonly city: { readonly question: string; readonly hint: string; readonly placeholder: string };
    readonly commute: {
      readonly question: string;
      readonly modes: Readonly<Record<CommuteMode, string>>;
      readonly distance: string;
      readonly distanceHint: string;
      readonly departure: string;
      readonly departureHint: string;
      readonly departureUnset: string;
    };
    readonly cooking: { readonly question: string; readonly fuels: Readonly<Record<CookingFuel, string>> };
    readonly household: { readonly question: string; readonly hint: string };
    readonly purifier: { readonly question: string };
  };
  readonly measured: {
    readonly badge: string;
    readonly title: string;
    readonly station: Fn<{ name: string; km: string }>;
    readonly network: string;
    readonly observed: Fn<{ time: string; ago: string }>;
    readonly lagNote: string;
    readonly aqiTitle: string;
    readonly aqiBasis: Fn<{ hours: number }>;
    readonly aqiCapped: string;
    readonly healthSource: string;
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
    readonly cleanerThanRoutine: Fn<{ best: string; routine: string }>;
    readonly routineIsFine: Fn<{ routine: string }>;
    readonly clearBest: Fn<{ best: string }>;
    readonly noClearBest: string;
    readonly noClearBestDetail: string;
    readonly routinePassed: string;
    readonly unavailable: string;
    readonly drop: Fn<{ drop: string; pct: string }>;
    readonly categoryShift: Fn<{ from: string; to: string }>;
    readonly caveat: string;
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
    readonly openaq: string;
    readonly cpcb: string;
    readonly openMeteo: string;
    readonly cams: string;
  };
  readonly errors: { readonly network: string };
}

export const en: UiStrings = {
  app: { name: "Clearhour", tagline: "When the air is cleanest today, and what helps at home" },
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
    hoursAgo: ({ n }) => (n === 1 ? "1 hour ago" : `${n} hours ago`),
    justNow: "just now",
  },
  key: {
    measured: "Measured at a station",
    forecast: "Forecast from a model",
    explainer: "Solid means measured. Dashed and hazy means forecast. The two are never combined.",
  },
  header: { editAnswers: "Edit answers", cityLabel: "City" },
  onboarding: {
    title: "Set up Clearhour",
    privacy: "Your answers stay on this device. There's no account.",
    progress: ({ n, total }) => `Question ${n} of ${total}`,
    back: "Back",
    next: "Next",
    finish: "Show today's plan",
    city: {
      question: "Which city are you in?",
      hint: "We use the nearest CPCB monitoring station to the city centre.",
      placeholder: "Choose a city",
    },
    commute: {
      question: "How do you usually commute?",
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
        none: "I don't commute",
      },
      distance: "Distance, one way",
      distanceHint: "A rough guess is fine.",
      departure: "Usual time you leave",
      departureHint: "Optional. Lets us compare your commute with the cleanest time.",
      departureUnset: "It varies",
    },
    cooking: {
      question: "What do you cook with?",
      fuels: {
        lpg: "LPG cylinder",
        png: "Piped gas (PNG)",
        electric: "Electric or induction",
        biomass: "Wood, dung or crop waste",
        kerosene: "Kerosene",
      },
    },
    household: { question: "Do children or elderly people live with you?", hint: "Some official advice is specific to them." },
    purifier: { question: "Do you have an air purifier at home?" },
  },
  measured: {
    badge: "Measured",
    title: "Latest station reading",
    station: ({ name, km }) => `${name}, ${km} away`,
    network: "CPCB monitoring station, via OpenAQ",
    observed: ({ time, ago }) => `Reading for ${time}, ${ago}`,
    lagNote: "Station readings usually reach us a few hours after they are taken.",
    aqiTitle: "24-hour CPCB AQI from PM2.5",
    aqiBasis: ({ hours }) => `Calculated from ${hours} hourly readings at this station, using CPCB's formula.`,
    aqiCapped: "At the top of the 0–500 scale",
    healthSource: "CPCB health statement for this category",
    noPm25Now: "No recent PM2.5 reading from this station.",
    reasons: {
      "no-station-in-radius": "No CPCB station within 25 km has reported in the last 6 hours.",
      "openaq-key-missing": "Station data isn't set up on this server.",
      "openaq-unavailable": "Station data couldn't be reached. Try again in a few minutes.",
      "openaq-schema-mismatch": "Station data arrived in an unexpected format, so it isn't shown.",
    },
    naqiReasons: {
      "insufficient-hours": "Not enough hourly readings in the last 24 hours to calculate the CPCB AQI (CPCB requires 16).",
      "no-sensor": "This station doesn't measure PM2.5.",
      "no-live-sensor": "This station has no recent PM2.5 reading.",
      "openaq-unavailable": "The station's recent hours couldn't be reached.",
      "openaq-schema-mismatch": "The station's recent hours arrived in an unexpected format.",
    },
    forecastOnlyTitle: "Forecast only",
    forecastOnlyBody: "No CPCB station within 25 km has reported recently, so there is no measurement to show. Everything below is modeled.",
    unknownTitle: "Measurement unavailable",
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
    badge: "Forecast",
    cleanerThanRoutine: ({ best, routine }) => `${best} looks clearly cleaner than your commute time, ${routine}`,
    routineIsFine: ({ routine }) => `No time today looks clearly cleaner than your commute, ${routine}`,
    clearBest: ({ best }) => `The cleanest stretch looks like ${best}`,
    noClearBest: "No time today stands out as clearly cleaner",
    noClearBestDetail: "The forecast has no stretch that is clearly cleaner than the rest of the day.",
    routinePassed: "Your usual departure time has already passed today.",
    unavailable: "There's no forecast right now, so there's no best time to show.",
    drop: ({ drop, pct }) => `Forecast PM2.5 about ${drop} µg/m³ lower, ${pct}% less`,
    categoryShift: ({ from, to }) => `Indicative CPCB category ${to} instead of ${from}`,
    caveat: "This comes from a forecast model, not a measurement. The model works in 3-hour blocks, so treat these times as approximate.",
    barTitle: "What counts as clearly cleaner",
    barBody:
      "A better CPCB category, or PM2.5 at least 30 µg/m³ and 25% lower. Categories here are indicative: CPCB defines them for 24-hour averages, and these are 3-hour forecasts.",
  },
  chart: {
    title: "Today's PM2.5 forecast",
    legendForecast: "Forecast PM2.5",
    legendBest: "Cleanest stretch",
    legendRoutine: "Your commute",
    now: "Now",
    summary: ({ min, max, minAt, maxAt }) => `Forecast PM2.5 today ranges from ${min} µg/m³ around ${minAt} to ${max} µg/m³ around ${maxAt}.`,
  },
  forecastReasons: {
    "open-meteo-unavailable": "The forecast couldn't be reached. Try again in a few minutes.",
    "open-meteo-schema-mismatch": "The forecast arrived in an unexpected format, so it isn't shown.",
    "forecast-empty": "The forecast has no values for this location.",
  },
  sources: {
    title: "Where this comes from",
    openaq: "Station readings: OpenAQ (CPCB stations)",
    cpcb: "AQI formula and health statements: CPCB National Air Quality Index (2014)",
    openMeteo: "Forecast: Open-Meteo (CC BY 4.0)",
    cams: "Generated using Copernicus Atmosphere Monitoring Service information",
  },
  errors: { network: "Couldn't load today's air. Check your connection and try again." },
};
