"use client";

import type { ReactNode } from "react";
import { CITATIONS } from "@/lib/grounding/citations";
import type { ForecastMissingReason, ForecastSeries, Grounded } from "@/lib/grounding/types";
import { bestWindow, type Stretch, type WindowResult } from "@/lib/plan/window";
import { describeWindow, todaysPoints } from "@/lib/view/describe";
import { ForecastChart } from "./ForecastChart";
import { useLocale } from "./LocaleContext";

/** Open dashed circle = forecast. Used in the key and on every forecast surface. */
export function ForecastMark() {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-full border-2 border-dashed border-model" />;
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

function Shell({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  return (
    <section aria-labelledby="window-title" className="haze rounded-2xl border-2 border-dashed border-model/50 px-5 pt-3 pb-4">
      <p className="flex items-center gap-2 text-sm font-medium text-model">
        <ForecastMark />
        {t.window.badge}
      </p>
      {children}
    </section>
  );
}

/**
 * Everything here is FORECAST. Visual language: dotted violet haze, dashed
 * outline, open-circle mark. No measured value is ever drawn inside it.
 *
 * Wherever a window is claimed, the short 3-hour-block caveat sits right
 * under the claim; the full caveat and the "clearly cleaner" rule are one tap
 * away.
 */
export function WindowPanel({ forecast, now, departureHour }: { forecast: Grounded<ForecastSeries, ForecastMissingReason>; now: Date; departureHour: number | undefined }) {
  const { t, f } = useLocale();

  if (!forecast.ok) {
    return (
      <Shell>
        <h2 id="window-title" className="type-condensed mt-2 text-3xl leading-tight font-semibold">
          {t.window.unavailable}
        </h2>
        <p className="mt-1">{t.forecastReasons[forecast.reason]}</p>
      </Shell>
    );
  }

  const result = bestWindow({ forecast: forecast.data, now, ...(departureHour === undefined ? {} : { departureHour }) });
  const view = describeWindow(result, t, f);
  const { best, routine } = stretchesOf(result);
  const lines = [view.drop, ...view.details, view.shift].filter((x): x is string => x !== null);

  return (
    <Shell>
      <h2 id="window-title" className="type-condensed mt-2 text-3xl leading-[1.08] font-semibold text-balance sm:text-4xl">
        {view.headline}
      </h2>
      {view.showCaveat && <p className="mt-2 text-sm font-medium text-model">{t.window.approxNote}</p>}
      {lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-ink/85">
          {lines.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}

      <ForecastChart points={todaysPoints(forecast.data, now)} best={best} routine={routine} now={now} />

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium underline decoration-model/40 underline-offset-4">{t.window.detailsTitle}</summary>
        <div className="mt-2 space-y-3">
          <p>{t.window.caveat}</p>
          <div>
            <h3 className="font-medium">{t.window.barTitle}</h3>
            <p className="text-ink/80">{t.window.barBody}</p>
          </div>
          <ul className="space-y-1 text-ink/80">
            <li>
              <a className="underline underline-offset-2" href={CITATIONS["open-meteo-air-quality"].url}>
                {t.sources.openMeteo}
              </a>
            </li>
            <li>
              <a className="underline underline-offset-2" href={CITATIONS["cams-global"].url}>
                {t.sources.cams}
              </a>
            </li>
          </ul>
        </div>
      </details>
    </Shell>
  );
}
