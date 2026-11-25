/**
 * Builds the input Gemini sees (the "packet") and, from the same data, the
 * allowance the validator checks against. Pure: no network, no clock.
 *
 * Every number in the packet is a display string produced by the same
 * formatters the UI uses, so whatever Gemini may quote is exactly what the
 * page shows. Gemini receives no CPCB health statement: the UI shows it
 * verbatim, and the plan may not restate health effects.
 */

import { getFormatters, getUiStrings, LOCALE_META, type Locale } from "../i18n";
import { findCity } from "../grounding/cities";
import { EMISSION_FACTORS } from "../sourced/emissionFactors";
import type { GroundingSnapshot } from "../grounding/types";
import type { HouseholdProfile } from "../profile/types";
import { selectGuidance, type CategorySignal } from "../sourced/guidance";
import { swapsFor, type Swap, type SwapId } from "../sourced/swaps";
import { bestWindow } from "./window";
import { describeAge, describeWindow } from "../view/describe";
import { extractNumbers, extractUnitNumbers } from "./numbers";
import type { GapCode, NumberBinding, PlanAllowance, RefDetail } from "./types";
import type { Formatters, UiStrings } from "../i18n";

export interface PlanInput {
  readonly snapshot: GroundingSnapshot;
  readonly profile: HouseholdProfile;
  readonly locale: Locale;
  readonly now: Date;
}

export type SwapTarget = keyof UiStrings["swaps"]["targets"];

export function swapTarget(id: SwapId): SwapTarget {
  if (id === "cooking:lpg->png") return "png";
  if (id === "cooking:kerosene->lpg" || id === "cooking:biomass->lpg") return "lpg";
  return id.split("->")[1] as SwapTarget;
}

export function describeSaving(s: Swap, t: UiStrings, f: Formatters): string {
  return s.saving.quantity === "kgCO2-per-working-day"
    ? t.swaps.kgPerDay({ kg: f.number(s.saving.value, 1) })
    : t.swaps.percentLess({ pct: f.number(s.saving.value) });
}

function categorySignal(snapshot: GroundingSnapshot): CategorySignal {
  if (snapshot.measured.ok && snapshot.measured.data.naqi24h.pm25.ok) {
    return { basis: "measured-24h", category: snapshot.measured.data.naqi24h.pm25.data.category };
  }
  return { basis: "unknown" };
}

export function buildPlanInput({ snapshot, profile, locale, now }: PlanInput) {
  const t = getUiStrings(locale);
  const f = getFormatters(locale);
  const gaps: GapCode[] = [];
  const bindings: NumberBinding[] = [];

  // Measured
  let measured: Record<string, unknown>;
  if (!snapshot.measured.ok || snapshot.coverage.status !== "station") {
    const code: GapCode = snapshot.measured.ok ? "measured:no-station-in-radius" : `measured:${snapshot.measured.reason}`;
    gaps.push(code);
    measured = { available: false, gap: code };
  } else {
    const pm25 = snapshot.measured.data.latest.pm25;
    const aqi = snapshot.measured.data.naqi24h.pm25;
    if (!aqi.ok) gaps.push(`aqi:${aqi.reason}`);
    if (pm25) bindings.push({ value: extractNumbers(f.number(pm25.value))[0]!, unit: "ugm3", role: "latest-reading" });
    if (aqi.ok) bindings.push({ value: extractNumbers(f.number(aqi.data.subIndex))[0]!, unit: null, role: "aqi-24h" });
    // Key names carry the timeframe, so the model sees what each value is.
    measured = {
      available: true,
      station: snapshot.coverage.station.name,
      distanceFromCityCentre: t.common.km({ km: f.number(snapshot.coverage.distanceKm, 1) }),
      latestSingleHourReading: pm25
        ? {
            pm25: `${f.number(pm25.value)} ${t.common.unitUgm3}`,
            readingTime: f.time(pm25.provenance.observedAt.utc),
            readingAge: describeAge(pm25.provenance.observedAt.utc, now, t),
          }
        : null,
      aqi24hAverage: aqi.ok
        ? { label: t.measured.aqiTitle, value: f.number(aqi.data.subIndex), category: t.categories[aqi.data.category] }
        : { available: false, gap: `aqi:${aqi.reason}` },
    };
  }

  // Forecast and best window
  let forecast: Record<string, unknown>;
  let windowAvailable = false;
  if (!snapshot.forecast.ok) {
    gaps.push(`forecast:${snapshot.forecast.reason}`);
    forecast = { available: false, gap: `forecast:${snapshot.forecast.reason}` };
  } else {
    const departureHour = profile.commute.mode === "none" ? undefined : profile.commute.departureHour;
    const result = bestWindow({ forecast: snapshot.forecast.data, now, ...(departureHour === undefined ? {} : { departureHour }) });
    const view = describeWindow(result, t, f);
    windowAvailable = view.showCaveat;
    // Forecast drops (µg/m³ and %) are predictions, and must be quoted as such.
    for (const line of view.details) {
      const u = extractUnitNumbers(line);
      u.ugm3.forEach((value) => bindings.push({ value, unit: "ugm3", role: "forecast" }));
      u.pct.forEach((value) => bindings.push({ value, unit: "pct", role: "forecast" }));
    }
    forecast = { available: true, isModelPrediction: true, verdict: result.verdict, statement: view.headline, details: view.details, caveat: windowAvailable ? t.window.caveat : null };
  }

  // Household
  const commuting = profile.commute.mode !== "none";
  const household = {
    commute: t.onboarding.commute.modes[profile.commute.mode],
    oneWayDistance: commuting ? t.common.km({ km: f.number(profile.commute.oneWayKm, 1) }) : null,
    usualDeparture: commuting && profile.commute.departureHour !== undefined ? f.clockHour(profile.commute.departureHour) : null,
    cooking: t.onboarding.cooking.fuels[profile.cookingFuel],
    childrenOrElderlyAtHome: profile.hasChildrenOrElderly,
    hasAirPurifier: profile.hasAirPurifier,
  };

  // Sourced guidance and computed swaps
  const guidance = selectGuidance(profile, categorySignal(snapshot));
  const { swaps } = swapsFor(profile);
  const refs: Record<string, RefDetail> = {};
  if (windowAvailable) refs.window = { kind: "window" };
  for (const g of guidance) refs[g.item.id] = { kind: "guidance", text: g.item.text[locale], sources: g.item.sources };
  for (const s of swaps) {
    refs[s.id] = {
      kind: "swap",
      action: t.swaps.targets[swapTarget(s.id)],
      saving: describeSaving(s, t, f),
      onlyIfAvailable: s.conditional,
      factors: [s.saving.from, s.saving.to].map((term) => ({
        factorId: term.factorId,
        value: term.value,
        unit: term.unit,
        citation: term.factorId === "none" ? null : EMISSION_FACTORS[term.factorId].citation,
      })),
    };
  }

  const packet = {
    language: LOCALE_META[locale].nativeName,
    city: findCity(profile.cityId)?.names[locale] ?? null,
    measured,
    forecast,
    household,
    guidance: guidance.map((g) => ({
      id: g.item.id,
      text: g.item.text[locale],
      appliesBecause: g.triggeredBy === null ? "every-day" : g.triggeredBy.basis === "unknown" ? "on-poor-days-category-unknown" : `today-${g.triggeredBy.basis}`,
    })),
    swaps: swaps.map((s) => ({ id: s.id, action: t.swaps.targets[swapTarget(s.id)], saving: describeSaving(s, t, f), onlyIfAvailable: s.conditional })),
    gaps,
  };

  const numbers = new Set<string>();
  const unitNumbers = { ugm3: new Set<string>(), kg: new Set<string>(), pct: new Set<string>() };
  const collect = (x: unknown): void => {
    if (typeof x === "string") {
      extractNumbers(x).forEach((n) => numbers.add(n));
      const u = extractUnitNumbers(x);
      for (const k of ["ugm3", "kg", "pct"] as const) u[k].forEach((n) => unitNumbers[k].add(n));
    }
    else if (Array.isArray(x)) x.forEach(collect);
    else if (x && typeof x === "object") Object.values(x).forEach(collect);
  };
  collect(packet);

  const allowance: PlanAllowance = {
    locale,
    numbers,
    unitNumbers,
    bindings,
    guidanceIds: new Set(guidance.map((g) => g.item.id)),
    swapIds: new Set(swaps.map((s) => s.id)),
    windowAvailable,
    gaps,
  };
  return { packet, allowance, refs };
}
