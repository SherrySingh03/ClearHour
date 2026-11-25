"use client";

import type { GroundingSnapshot, NaqiCategory } from "@/lib/grounding/types";
import { describeAge } from "@/lib/view/describe";
import { useLocale } from "./LocaleContext";

export const CATEGORY_VAR: Readonly<Record<NaqiCategory, string>> = {
  good: "var(--cat-good)",
  satisfactory: "var(--cat-satisfactory)",
  moderate: "var(--cat-moderate)",
  poor: "var(--cat-poor)",
  "very-poor": "var(--cat-very-poor)",
  severe: "var(--cat-severe)",
};

/** Solid square = measured. Used in the key and on every measured surface. */
export function MeasuredMark() {
  return <span aria-hidden className="inline-block size-3 bg-ink" />;
}

/**
 * Everything here is MEASURED (or computed from measurements). Visual
 * language: white slab, solid ink rule, heavy numerals. Nothing forecast
 * is ever drawn inside this panel.
 */
export function MeasuredPanel({ snapshot, now }: { snapshot: GroundingSnapshot; now: Date }) {
  const { t, f } = useLocale();
  const m = t.measured;
  const { coverage, measured } = snapshot;

  if (coverage.status === "no-station") {
    return (
      <section aria-labelledby="measured-title" className="border-l-4 border-ink/40 bg-station/70 px-5 py-4">
        <h2 id="measured-title" className="text-lg font-semibold">
          {m.forecastOnlyTitle}
        </h2>
        <p className="mt-1 text-muted">{m.forecastOnlyBody}</p>
      </section>
    );
  }

  if (!measured.ok || coverage.status !== "station") {
    const reason = measured.ok ? null : measured.reason;
    return (
      <section aria-labelledby="measured-title" className="border-l-4 border-ink/40 bg-station/70 px-5 py-4">
        <h2 id="measured-title" className="text-lg font-semibold">
          {m.unknownTitle}
        </h2>
        {reason && <p className="mt-1 text-muted">{m.reasons[reason]}</p>}
      </section>
    );
  }

  const pm25 = measured.data.latest.pm25;
  const naqi = measured.data.naqi24h.pm25;
  const station = coverage.station;

  return (
    <section aria-labelledby="measured-title" className="border-l-4 border-ink bg-station px-5 py-5 shadow-[0_1px_0_var(--smog-deep)]">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MeasuredMark />
        <span>{m.badge}</span>
      </div>
      <h2 id="measured-title" className="mt-1 text-lg font-semibold">
        {m.title}
      </h2>

      {pm25 ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <p className="type-condensed text-6xl leading-none font-bold tabular-nums">{f.number(pm25.value)}</p>
          <p className="flex gap-1.5 text-lg">
            <span className="font-semibold">{t.common.unitUgm3}</span>
            <span>{t.common.pm25}</span>
          </p>
        </div>
      ) : (
        <p className="mt-3 text-muted">{m.noPm25Now}</p>
      )}

      <div className="mt-3 space-y-0.5 text-sm">
        <p className="font-medium">{m.station({ name: station.name, km: t.common.km({ km: f.number(coverage.distanceKm, 1) }) })}</p>
        {pm25 && <p>{m.observed({ time: f.time(pm25.provenance.observedAt.utc), ago: describeAge(pm25.provenance.observedAt.utc, now, t) })}</p>}
        <p className="text-muted">{m.network}</p>
        <p className="text-muted">{m.lagNote}</p>
      </div>

      <div className="mt-5 border-t border-ink/15 pt-4">
        <h3 className="text-sm font-semibold">{m.aqiTitle}</h3>
        {naqi.ok ? (
          <div className="mt-2">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="type-condensed text-4xl font-bold tabular-nums">{f.number(naqi.data.subIndex)}</span>
              <span className="rounded px-2 py-0.5 text-sm font-semibold text-white" style={{ backgroundColor: CATEGORY_VAR[naqi.data.category] }}>
                {t.categories[naqi.data.category]}
              </span>
              {naqi.data.cappedAtScaleMax && <span className="text-sm text-muted">{m.aqiCapped}</span>}
            </p>
            <figure className="mt-3">
              <blockquote className="border-l-2 border-ink/30 pl-3 italic">{t.healthStatements[naqi.data.category]}</blockquote>
              <figcaption className="mt-1 text-xs text-muted">
                {m.healthSource}
                {t.healthStatementIsTranslation && <span className="block">{t.healthStatementIsTranslation}</span>}
              </figcaption>
            </figure>
            <p className="mt-3 text-sm">{m.aqiVsLatest}</p>
            <p className="mt-1 text-xs text-muted">{m.aqiBasis({ hours: naqi.data.hoursObserved })}</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">{m.naqiReasons[naqi.reason]}</p>
        )}
      </div>
    </section>
  );
}
