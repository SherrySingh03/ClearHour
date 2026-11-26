/**
 * Best outdoor window — derived from the FORECAST only.
 *
 * The result is a 3-hour stretch, never a single hour: CAMS global resolves
 * time in 3-hour steps and Open-Meteo interpolates between them
 * (provenance.nativeTimeStepHours / hourlyIsInterpolated). Each stretch's
 * CPCB category is "indicative": breakpoints are 24-hour, the stretch is a
 * 3-hour modeled mean.
 *
 * "Materially cleaner" (assumptions.ts#window-materially-cleaner):
 *   better indicative CPCB category
 *   OR (PM2.5 drop ≥ 30 µg/m³ AND drop ≥ 25%)
 * If nothing clears the bar the verdict says so and names no winner.
 *
 * Measured data is never an input here. Forecast and measured stay separate.
 */

import { categoryRank, naqiCategory } from "../grounding/aqi/cpcb";
import type { ForecastPoint, ForecastSeries, IsoUtc, NaqiCategory } from "../grounding/types";

/** assumptions.ts#window-stretch-length */
export const STRETCH_POINTS = 3;
/** assumptions.ts#window-outdoor-hours: local clock, [start, end] */
export const OUTDOOR_START_HOUR = 5;
export const OUTDOOR_END_HOUR = 22;
/** assumptions.ts#window-materially-cleaner */
export const MATERIAL_DROP_UGM3 = 30;
export const MATERIAL_DROP_FRACTION = 0.25;

/** India uses a single fixed offset (IST, UTC+5:30, no daylight saving). */
const IST_OFFSET_MS = 5.5 * 3_600_000;

export interface Stretch {
  readonly kind: "forecast-stretch";
  readonly startUtc: IsoUtc;
  /** Exclusive end: last point + 1 h. */
  readonly endUtc: IsoUtc;
  readonly meanPm25: number;
  readonly indicativeCategory: NaqiCategory;
  readonly basis: "forecast-3h-mean";
}

export interface Comparison {
  readonly dropUgm3: number;
  readonly dropFraction: number;
  readonly categoryImproved: boolean;
  readonly material: boolean;
}

export type WindowResult =
  | { readonly verdict: "no-forecast" }
  /** Fewer than one complete stretch left today (gaps are never filled). */
  | { readonly verdict: "insufficient-forecast" }
  /** Routine given: a different stretch is materially cleaner than it. */
  | { readonly verdict: "cleaner-than-routine"; readonly best: Stretch; readonly routine: Stretch; readonly comparison: Comparison }
  /** Routine given: nothing today clears the bar against it. */
  | { readonly verdict: "routine-is-fine"; readonly routine: Stretch; readonly cleanest: Stretch; readonly comparison: Comparison }
  /** No routine (or it already passed): best stretch clears the bar against the day's median stretch. */
  | { readonly verdict: "clear-best"; readonly best: Stretch; readonly baseline: Stretch; readonly comparison: Comparison; readonly routinePassed: boolean }
  /** No routine: no stretch stands out from the day's median. */
  | { readonly verdict: "no-clear-best"; readonly cleanest: Stretch; readonly baseline: Stretch; readonly comparison: Comparison; readonly routinePassed: boolean };

export interface WindowInput {
  readonly forecast: ForecastSeries | null;
  readonly now: Date;
  /** Local clock hour of departure, 0–23. */
  readonly departureHour?: number;
}

export function compare(candidate: Stretch, reference: Stretch): Comparison {
  const dropUgm3 = reference.meanPm25 - candidate.meanPm25;
  const dropFraction = reference.meanPm25 > 0 ? dropUgm3 / reference.meanPm25 : 0;
  const categoryImproved = categoryRank(candidate.indicativeCategory) < categoryRank(reference.indicativeCategory);
  const material = categoryImproved || (dropUgm3 >= MATERIAL_DROP_UGM3 && dropFraction >= MATERIAL_DROP_FRACTION);
  return { dropUgm3, dropFraction, categoryImproved, material };
}

/** Local (IST) time of day in fractional hours, e.g. 06:30 → 6.5. */
const localHour = (utcMs: number) => {
  const d = new Date(utcMs + IST_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};
const localDayKey = (utcMs: number) => new Date(utcMs + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Every complete stretch of STRETCH_POINTS consecutive hourly points with PM2.5 present. */
function buildStretches(points: readonly ForecastPoint[]): Stretch[] {
  const out: Stretch[] = [];
  for (let i = 0; i + STRETCH_POINTS <= points.length; i++) {
    const window = points.slice(i, i + STRETCH_POINTS);
    const times = window.map((p) => Date.parse(p.timeUtc));
    const consecutive = times.every((t, k) => k === 0 || t - times[k - 1]! === 3_600_000);
    const values = window.map((p) => p.pm25);
    if (!consecutive || values.some((v) => v === null)) continue; // never fill a gap
    const meanPm25 = (values as number[]).reduce((a, b) => a + b, 0) / STRETCH_POINTS;
    out.push({
      kind: "forecast-stretch",
      startUtc: window[0]!.timeUtc,
      endUtc: new Date(times[STRETCH_POINTS - 1]! + 3_600_000).toISOString(),
      meanPm25,
      indicativeCategory: naqiCategory("pm25", meanPm25),
      basis: "forecast-3h-mean",
    });
  }
  return out;
}

/** Starts today (local) at or after OUTDOOR_START_HOUR and ends by OUTDOOR_END_HOUR. */
function isOutdoorToday(s: Stretch, now: Date): boolean {
  const start = Date.parse(s.startUtc);
  const end = Date.parse(s.endUtc);
  const today = localDayKey(now.getTime());
  if (localDayKey(start) !== today || localDayKey(end - 1) !== today) return false;
  return localHour(start) >= OUTDOOR_START_HOUR && localHour(end) <= OUTDOOR_END_HOUR;
}

function cleanest(stretches: readonly Stretch[]): Stretch {
  // Lowest mean; ties go to the earliest stretch.
  return stretches.reduce((best, s) => (s.meanPm25 < best.meanPm25 ? s : best));
}

function median(stretches: readonly Stretch[]): Stretch {
  const sorted = [...stretches].sort((a, b) => a.meanPm25 - b.meanPm25 || Date.parse(a.startUtc) - Date.parse(b.startUtc));
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/** assumptions.ts#window-routine-stretch */
function routineStretch(all: readonly Stretch[], now: Date, departureHour: number): Stretch | null {
  const today = localDayKey(now.getTime());
  const departureUtc = Date.parse(`${today}T00:00:00Z`) - IST_OFFSET_MS + departureHour * 3_600_000;
  let pick: Stretch | null = null;
  for (const s of all) {
    const start = Date.parse(s.startUtc);
    if (start <= departureUtc && (!pick || start > Date.parse(pick.startUtc))) pick = s;
  }
  // Must actually cover the departure time.
  return pick && Date.parse(pick.endUtc) > departureUtc ? pick : null;
}

export function bestWindow(input: WindowInput): WindowResult {
  if (!input.forecast) return { verdict: "no-forecast" };
  const all = buildStretches(input.forecast.points);
  const nowMs = input.now.getTime();
  // Candidates: today's outdoor-hours stretches that haven't started yet.
  const upcoming = all.filter((s) => isOutdoorToday(s, input.now) && Date.parse(s.startUtc) >= nowMs - 30 * 60_000);
  if (upcoming.length === 0) return { verdict: "insufficient-forecast" };

  const best = cleanest(upcoming);

  if (input.departureHour !== undefined) {
    const routine = routineStretch(all, input.now, input.departureHour);
    const routineUpcoming = routine && Date.parse(routine.endUtc) > nowMs;
    if (routine && routineUpcoming) {
      const comparison = compare(best, routine);
      if (best.startUtc !== routine.startUtc && comparison.material) {
        return { verdict: "cleaner-than-routine", best, routine, comparison };
      }
      return { verdict: "routine-is-fine", routine, cleanest: best, comparison };
    }
    return againstBaseline(upcoming, best, true);
  }
  return againstBaseline(upcoming, best, false);
}

function againstBaseline(upcoming: readonly Stretch[], best: Stretch, routinePassed: boolean): WindowResult {
  const baseline = median(upcoming);
  const comparison = compare(best, baseline);
  return comparison.material && best.startUtc !== baseline.startUtc
    ? { verdict: "clear-best", best, baseline, comparison, routinePassed }
    : { verdict: "no-clear-best", cleanest: best, baseline, comparison, routinePassed };
}

/** assumptions.ts#forecast-day-parts: local clock hours, [start, end) */
export const DAY_PARTS = [
  { part: "morning", from: OUTDOOR_START_HOUR, to: 12 },
  { part: "afternoon", from: 12, to: 17 },
  { part: "evening", from: 17, to: OUTDOOR_END_HOUR },
] as const;
export type DayPart = (typeof DAY_PARTS)[number]["part"];

export interface PartOutlook {
  readonly part: DayPart;
  /** Indicative: a CPCB category applied to a few hours of forecast mean. */
  readonly indicativeCategory: NaqiCategory;
}

/**
 * How each part of today that is still ahead looks in the FORECAST, as a
 * category word. A part with fewer than STRETCH_POINTS upcoming points is
 * left out rather than guessed.
 */
export function dayOutlook(forecast: ForecastSeries, now: Date): PartOutlook[] {
  const today = localDayKey(now.getTime());
  const upcoming = forecast.points.filter((p) => {
    const t = Date.parse(p.timeUtc);
    return localDayKey(t) === today && t >= now.getTime() - 30 * 60_000;
  });
  return DAY_PARTS.flatMap(({ part, from, to }) => {
    const values = upcoming.flatMap((p) => {
      const h = localHour(Date.parse(p.timeUtc));
      return h >= from && h < to && p.pm25 !== null ? [p.pm25] : [];
    });
    if (values.length < STRETCH_POINTS) return [];
    return [{ part, indicativeCategory: naqiCategory("pm25", values.reduce((a, b) => a + b, 0) / values.length) }];
  });
}
