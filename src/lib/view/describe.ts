/**
 * Turns data-layer results into display text. This is the only place where
 * reason codes and verdicts become words, always via UiStrings, at render
 * time. The data layer never holds UI text.
 */

import type { Formatters, UiStrings } from "../i18n";
import { CITATIONS, type CitationId } from "../grounding/citations";
import type { Swap, SwapId } from "../sourced/swaps";
import type { ForecastPoint, ForecastSeries } from "../grounding/types";
import { OUTDOOR_END_HOUR, OUTDOOR_START_HOUR, type Comparison, type WindowResult } from "../plan/window";

const IST_OFFSET_MS = 5.5 * 3_600_000;
export const istDayKey = (utcMs: number) => new Date(utcMs + IST_OFFSET_MS).toISOString().slice(0, 10);
/** Local (IST) time of day in fractional hours. */
export const istHour = (utcMs: number) => {
  const d = new Date(utcMs + IST_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

export function describeAge(observedUtc: string, now: Date, t: UiStrings): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(observedUtc)) / 60_000));
  if (minutes < 2) return t.common.justNow;
  if (minutes < 60) return t.common.minutesAgo({ n: minutes });
  // Rounded, and worded "about N hours", so a 3 h 50 min old reading never reads as "3 hours".
  return t.common.hoursAgo({ n: Math.round(minutes / 60) });
}

export interface WindowView {
  readonly headline: string;
  /** The predicted difference, with what it is measured from. Shown by the UI only, never given to the plan writer. */
  readonly drop: string | null;
  /** The best stretch's indicative category against the other. UI only: the writer must not apply it to a longer period. */
  readonly shift: string | null;
  /** Everything else; contains no pollution amounts or categories. */
  readonly details: readonly string[];
  /** Always true when a window is presented: the 3-hour caveat travels with it. */
  readonly showCaveat: boolean;
}

/** `against` names what the drop is measured from, so the sentence says it. */
function dropLine(c: Comparison, against: "routine" | "typical", t: UiStrings, f: Formatters): string {
  const p = { drop: f.number(c.dropUgm3), pct: f.number(c.dropFraction * 100) };
  return against === "routine" ? t.window.dropVsRoutine(p) : t.window.dropVsTypical(p);
}

function categoryShift(c: Comparison, fromCat: string, toCat: string, t: UiStrings): string | null {
  return c.categoryImproved ? t.window.categoryShift({ from: fromCat, to: toCat }) : null;
}

export function describeWindow(r: WindowResult, t: UiStrings, f: Formatters): WindowView {
  const range = (s: { startUtc: string; endUtc: string }) => f.timeRange(s.startUtc, s.endUtc);
  switch (r.verdict) {
    case "no-forecast":
      return { headline: t.window.unavailable, drop: null, shift: null, details: [], showCaveat: false };
    case "insufficient-forecast":
      // The forecast exists (the curve is drawn); there is just no full stretch left in today's outdoor hours.
      return {
        headline: t.window.tooLate,
        drop: null,
        shift: null,
        details: [t.window.tooLateDetail({ from: f.clockHour(OUTDOOR_START_HOUR), to: f.clockHour(OUTDOOR_END_HOUR) })],
        showCaveat: false,
      };
    case "cleaner-than-routine":
      return {
        headline: t.window.cleanerThanRoutine({ best: range(r.best), routine: range(r.routine) }),
        drop: dropLine(r.comparison, "routine", t, f),
        shift: categoryShift(r.comparison, t.categories[r.routine.indicativeCategory], t.categories[r.best.indicativeCategory], t),
        details: [],
        showCaveat: true,
      };
    case "routine-is-fine":
      return { headline: t.window.routineIsFine({ routine: range(r.routine) }), drop: null, shift: null, details: [], showCaveat: true };
    case "clear-best":
      return {
        headline: t.window.clearBest({ best: range(r.best) }),
        drop: dropLine(r.comparison, "typical", t, f),
        shift: categoryShift(r.comparison, t.categories[r.baseline.indicativeCategory], t.categories[r.best.indicativeCategory], t),
        details: r.routinePassed ? [t.window.routinePassed] : [],
        showCaveat: true,
      };
    case "no-clear-best":
      return {
        headline: t.window.noClearBest,
        drop: null,
        shift: null,
        details: [...(r.routinePassed ? [t.window.routinePassed] : []), t.window.noClearBestDetail],
        showCaveat: true,
      };
  }
}

/** Missing-data code (from the plan's acknowledged gaps) → message, translated at render. */
export function describeGap(code: string, t: UiStrings): string | null {
  const [scope, reason] = code.split(":") as [string, string];
  if (scope === "measured" && reason in t.measured.reasons) return t.measured.reasons[reason as keyof UiStrings["measured"]["reasons"]];
  if (scope === "aqi" && reason in t.measured.naqiReasons) return t.measured.naqiReasons[reason as keyof UiStrings["measured"]["naqiReasons"]];
  if (scope === "forecast" && reason in t.forecastReasons) return t.forecastReasons[reason as keyof UiStrings["forecastReasons"]];
  return null;
}

/** Today's forecast points (IST calendar day). */
export function todaysPoints(series: ForecastSeries, now: Date): ForecastPoint[] {
  const today = istDayKey(now.getTime());
  return series.points.filter((p) => istDayKey(Date.parse(p.timeUtc)) === today);
}

export function describeForecastRange(points: readonly ForecastPoint[], t: UiStrings, f: Formatters): string | null {
  const valid = points.filter((p): p is ForecastPoint & { pm25: number } => p.pm25 !== null);
  if (valid.length === 0) return null;
  const min = valid.reduce((a, b) => (b.pm25 < a.pm25 ? b : a));
  const max = valid.reduce((a, b) => (b.pm25 > a.pm25 ? b : a));
  return t.chart.summary({ min: f.number(min.pm25), max: f.number(max.pm25), minAt: f.time(min.timeUtc), maxAt: f.time(max.timeUtc) });
}

/**
 * Link text for a source: who published it and when. Not the registry title,
 * which describes what we first used the document for; the page locator shown
 * with each quote or factor says where in it to look.
 */
export function citationLabel(id: CitationId): string {
  const c = CITATIONS[id];
  return `${c.publisher}, ${c.year}`;
}

/** One link per source document, however many items or factors in a plan step cite it. */
export function uniqueCitations(ids: readonly (CitationId | null)[]): CitationId[] {
  return [...new Set(ids.filter((id): id is CitationId => id !== null))];
}

export type SwapTarget = keyof UiStrings["swaps"]["targets"];

export function swapTarget(id: SwapId): SwapTarget {
  if (id === "cooking:lpg->png") return "png";
  if (id === "cooking:kerosene->lpg" || id === "cooking:biomass->lpg") return "lpg";
  return id.split("->")[1] as SwapTarget;
}

/**
 * Rounds DOWN to two significant figures: a value shown as "at least X" must
 * never exceed the computed one.
 */
export function floorTo2Significant(x: number): number {
  if (!(x > 0)) return 0;
  const exponent = Math.floor(Math.log10(x)) - 1;
  const step = 10 ** exponent;
  return Number((Math.floor(x / step + 1e-9) * step).toFixed(Math.max(0, -exponent)));
}

/** The saving, always with the conditions it holds under. */
export function describeSaving(s: Swap, t: UiStrings, f: Formatters): string {
  if (s.saving.quantity !== "kgCO2-per-working-day") return t.swaps.percentLess({ pct: f.number(s.saving.value) });
  const p = { kg: f.number(floorTo2Significant(s.saving.value), 4) };
  // A hybrid row in the source is lower than the petrol factor used, so the bound excludes hybrids.
  return s.saving.from.factorId === "car-petrol" ? t.swaps.atLeastKgPerDayPetrolCar(p) : t.swaps.atLeastKgPerDay(p);
}
