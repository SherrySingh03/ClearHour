"use client";

import type { ForecastMissingReason, ForecastSeries, Grounded } from "@/lib/grounding/types";
import { bestWindow, type Stretch, type WindowResult } from "@/lib/plan/window";
import { describeWindow, todaysPoints } from "@/lib/view/describe";
import { ForecastChart } from "./ForecastChart";
import { useLocale } from "./LocaleContext";

/** Open circle = forecast. Used in the key and on every forecast surface. */
export function ForecastMark() {
  return <span aria-hidden className="inline-block size-3 rounded-full border-2 border-dashed border-model" />;
}

function stretchesOf(r: WindowResult): { best: Stretch | null; routine: Stretch | null } {
  switch (r.verdict) {
    case "cleaner-than-routine":
      return { best: r.best, routine: r.routine };
    case "routine-is-fine":
      return { best: null, routine: r.routine };
    case "clear-best":
      return { best: r.best, routine: null };
    default:
      return { best: null, routine: null };
  }
}

/**
 * Everything here is FORECAST. Visual language: dotted violet haze, dashed
 * outline, open-circle mark. No measured value is ever drawn inside it.
 */
export function WindowPanel({ forecast, now, departureHour }: { forecast: Grounded<ForecastSeries, ForecastMissingReason>; now: Date; departureHour: number | undefined }) {
  const { t, f } = useLocale();

  if (!forecast.ok) {
    return (
      <section aria-labelledby="window-title" className="haze rounded-2xl border-2 border-dashed border-model/50 px-5 py-5">
        <p className="flex items-center gap-2 text-sm font-medium text-model">
          <ForecastMark />
          {t.window.badge}
        </p>
        <h2 id="window-title" className="mt-2 text-xl font-semibold">
          {t.window.unavailable}
        </h2>
        <p className="mt-1 text-muted">{t.forecastReasons[forecast.reason]}</p>
      </section>
    );
  }

  const result = bestWindow({ forecast: forecast.data, now, ...(departureHour === undefined ? {} : { departureHour }) });
  const view = describeWindow(result, t, f);
  const { best, routine } = stretchesOf(result);

  return (
    <section aria-labelledby="window-title" className="haze rounded-2xl border-2 border-dashed border-model/50 px-5 pt-5 pb-4">
      <p className="flex items-center gap-2 text-sm font-medium text-model">
        <ForecastMark />
        {t.window.badge}
      </p>
      <h2 id="window-title" className="type-condensed mt-2 text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl">
        {view.headline}
      </h2>
      {view.details.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-ink/85">
          {view.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      <ForecastChart points={todaysPoints(forecast.data, now)} best={best} routine={routine} now={now} />

      {view.showCaveat && <p className="mt-4 rounded-lg bg-station/70 px-3 py-2 text-sm">{t.window.caveat}</p>}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium">{t.window.barTitle}</summary>
        <p className="mt-1 text-muted">{t.window.barBody}</p>
      </details>
    </section>
  );
}
