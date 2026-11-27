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
import { categorySignal, selectGuidance } from "../sourced/guidance";
import { swapsFor } from "../sourced/swaps";
import { bestWindow, dayOutlook } from "./window";
import { describeSaving, describeWindow, swapTarget } from "../view/describe";
import { numberTokens } from "./numbers";
import type { GapCode, NumberBinding, OutlookLine, PlanAllowance, RefDetail } from "./types";

export interface PlanInput {
  readonly snapshot: GroundingSnapshot;
  readonly profile: HouseholdProfile;
  readonly locale: Locale;
  readonly now: Date;
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
    if (pm25) bindings.push({ value: numberTokens(f.number(pm25.value))[0]!.value, unit: "ugm3", role: "latest-reading" });
    if (aqi.ok) bindings.push({ value: numberTokens(f.number(aqi.data.subIndex))[0]!.value, unit: null, role: "aqi-24h" });
    // Key names carry the timeframe, so the model sees what each value is.
    measured = {
      available: true,
      station: snapshot.coverage.station.name,
      distanceFromCityCentre: t.common.km({ km: f.number(snapshot.coverage.distanceKm, 1) }),
      latestSingleHourReading: pm25
        ? {
            pm25: `${f.number(pm25.value)} ${t.common.unitUgm3}`,
            // The time, not the age: a plan is reused for a few hours and an age would go stale.
            readingTime: f.time(pm25.provenance.observedAt.utc),
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
  let outlook: OutlookLine[] = [];
  if (!snapshot.forecast.ok) {
    gaps.push(`forecast:${snapshot.forecast.reason}`);
    forecast = { available: false, gap: `forecast:${snapshot.forecast.reason}` };
  } else {
    const departureHour = profile.commute.mode === "none" ? undefined : profile.commute.departureHour;
    const result = bestWindow({ forecast: snapshot.forecast.data, now, ...(departureHour === undefined ? {} : { departureHour }) });
    const view = describeWindow(result, t, f);
    windowAvailable = view.showCaveat;
    outlook = dayOutlook(snapshot.forecast.data, now).map((o) => ({ part: t.window.dayParts[o.part], category: t.categories[o.indicativeCategory] }));
    forecast = { available: true, isModelPrediction: true, verdict: result.verdict, statement: view.headline, details: view.details, outlookByPartOfDay: outlook, caveat: windowAvailable ? t.window.caveat : null };
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

  // Sourced guidance and computed swaps. Amounts (savings, forecast differences)
  // are deliberately left out of the packet: the UI shows them with their
  // conditions, and a number the model never saw fails the unknown-number check.
  const signal = categorySignal(snapshot);
  const guidance = selectGuidance(profile, signal);
  const { swaps } = swapsFor(profile, signal);
  const refs: Record<string, RefDetail> = {};
  if (windowAvailable) refs.window = { kind: "window" };
  for (const g of guidance) refs[g.item.id] = { kind: "guidance", text: g.item.text[locale], sources: g.item.sources };
  for (const s of swaps) {
    refs[s.id] = {
      kind: "swap",
      action: t.swaps.targets[swapTarget(s.id)],
      saving: describeSaving(s, t, f),
      onlyIfAvailable: s.conditional,
      why: s.why,
      co2Only: s.co2Only,
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
      text: (g.item.writerText ?? g.item.text)[locale],
      appliesBecause: g.triggeredBy === null ? "every-day" : g.triggeredBy.basis === "unknown" ? "on-poor-days-category-unknown" : `today-${g.triggeredBy.basis}`,
    })),
    swaps: swaps.map((s) => ({ id: s.id, action: t.swaps.targets[swapTarget(s.id)], lowersCO2: true, onlyIfAvailable: s.conditional })),
    gaps,
  };

  const names = snapshot.coverage.status === "station" ? [snapshot.coverage.station.name] : [];
  const tokens = new Set<string>();
  const known = new Set<string>();
  const collect = (x: unknown): void => {
    if (typeof x === "string") {
      for (const n of numberTokens(x, names)) {
        known.add(n.value);
        // "8:30" also makes "8" and "30" known (as misused, not invented).
        n.value.split(":").forEach((part) => known.add(part));
        if (n.kind !== "bare") tokens.add(`${n.kind}:${n.value}`);
      }
    }
    else if (Array.isArray(x)) x.forEach(collect);
    else if (x && typeof x === "object") Object.values(x).forEach(collect);
  };
  collect(packet);
  // The only unitless quantity a plan may write is the AQI itself.
  for (const b of bindings) if (b.unit === null) tokens.add(`bare:${b.value}`);

  const allowance: PlanAllowance = {
    locale,
    tokens,
    known,
    names,
    departureHour: commuting ? (profile.commute.departureHour ?? null) : null,
    bindings,
    guidanceIds: new Set(guidance.map((g) => g.item.id)),
    swapIds: new Set(swaps.map((s) => s.id)),
    windowAvailable,
    gaps,
  };
  return { packet, allowance, refs, outlook };
}
