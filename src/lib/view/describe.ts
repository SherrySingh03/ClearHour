/**
 * Turns data-layer results into display text. This is the only place where
 * reason codes and verdicts become words, always via UiStrings, at render
 * time. The data layer never holds UI text.
 */

import type { Formatters, UiStrings } from "../i18n";
import type { ForecastPoint, ForecastSeries } from "../grounding/types";
import type { Comparison, WindowResult } from "../plan/window";

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
  return t.common.hoursAgo({ n: Math.floor(minutes / 60) });
}

export interface WindowView {
  readonly headline: string;
  readonly details: readonly string[];
  /** Always true when a window is presented: the 3-hour caveat travels with it. */
  readonly showCaveat: boolean;
}

function comparisonLines(c: Comparison, fromCat: string, toCat: string, t: UiStrings, f: Formatters): string[] {
  const lines = [t.window.drop({ drop: f.number(c.dropUgm3), pct: f.number(c.dropFraction * 100) })];
  if (c.categoryImproved) lines.push(t.window.categoryShift({ from: fromCat, to: toCat }));
  return lines;
}

export function describeWindow(r: WindowResult, t: UiStrings, f: Formatters): WindowView {
  const range = (s: { startUtc: string; endUtc: string }) => f.timeRange(s.startUtc, s.endUtc);
  switch (r.verdict) {
    case "no-forecast":
    case "insufficient-forecast":
      return { headline: t.window.unavailable, details: [], showCaveat: false };
    case "cleaner-than-routine":
      return {
        headline: t.window.cleanerThanRoutine({ best: range(r.best), routine: range(r.routine) }),
        details: comparisonLines(r.comparison, t.categories[r.routine.indicativeCategory], t.categories[r.best.indicativeCategory], t, f),
        showCaveat: true,
      };
    case "routine-is-fine":
      return { headline: t.window.routineIsFine({ routine: range(r.routine) }), details: [], showCaveat: true };
    case "clear-best":
      return {
        headline: t.window.clearBest({ best: range(r.best) }),
        details: [
          ...(r.routinePassed ? [t.window.routinePassed] : []),
          ...comparisonLines(r.comparison, t.categories[r.baseline.indicativeCategory], t.categories[r.best.indicativeCategory], t, f),
        ],
        showCaveat: true,
      };
    case "no-clear-best":
      return {
        headline: t.window.noClearBest,
        details: [...(r.routinePassed ? [t.window.routinePassed] : []), t.window.noClearBestDetail],
        showCaveat: true,
      };
  }
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
