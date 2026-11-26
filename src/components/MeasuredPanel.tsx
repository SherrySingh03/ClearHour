"use client";

import type { ReactNode } from "react";
import { NAQI_CATEGORY_ORDER } from "@/lib/grounding/aqi/cpcb";
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
  return <span aria-hidden className="inline-block size-3 shrink-0 bg-ink" />;
}

function Badge() {
  const { t } = useLocale();
  return (
    <p className="flex items-center gap-2 text-sm font-medium">
      <MeasuredMark />
      {t.measured.badge}
    </p>
  );
}

/** CPCB's six levels, with the verdict's level raised. The sentence below it says the same in words. */
function CategoryScale({ category }: { category: NaqiCategory }) {
  const { t, f } = useLocale();
  const idx = NAQI_CATEGORY_ORDER.indexOf(category);
  return (
    <div className="mt-3 max-w-md">
      <div aria-hidden className="flex items-end gap-1">
        {NAQI_CATEGORY_ORDER.map((c, i) => (
          <span
            key={c}
            className={`flex-1 rounded-[2px] ${i === idx ? "h-4" : "h-2 opacity-30"}`}
            style={{ backgroundColor: CATEGORY_VAR[c] }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-sm text-muted">
        {t.measured.scalePosition({ category: t.categories[category], n: f.number(idx + 1), total: f.number(NAQI_CATEGORY_ORDER.length) })}
      </p>
    </div>
  );
}

function Figure({ value, unit, label, sub, extra }: { value: string; unit?: string; label: string; sub: string; extra?: string | false }) {
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="type-condensed text-4xl leading-none font-bold tabular-nums">{value}</span>
        {unit && <span className="text-sm font-semibold">{unit}</span>}
      </p>
      <p className="mt-1 text-sm leading-snug font-medium">{label}</p>
      <p className="text-sm leading-snug text-muted">{sub}</p>
      {extra && <p className="text-sm font-medium">{extra}</p>}
    </div>
  );
}

function Shell({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <section aria-labelledby="measured-title" className="border-l-[6px] bg-station px-5 py-4 shadow-[0_1px_0_var(--smog-deep)]" style={{ borderColor: accent }}>
      {children}
    </section>
  );
}

/**
 * Everything here is MEASURED (or computed from measurements). Visual
 * language: white slab, solid edge, heavy numerals. Nothing forecast is ever
 * drawn inside this panel.
 *
 * Order: the plain verdict first, then the numbers behind it, then station
 * details one tap away.
 */
export function MeasuredPanel({ snapshot, now, city }: { snapshot: GroundingSnapshot; now: Date; city: string }) {
  const { t, f } = useLocale();
  const m = t.measured;
  const { coverage, measured } = snapshot;

  if (coverage.status === "no-station") {
    return (
      <Shell accent="color-mix(in srgb, var(--ink) 35%, transparent)">
        <Badge />
        <h2 id="measured-title" className="type-condensed mt-2 text-3xl leading-tight font-semibold">
          {m.forecastOnlyTitle}
        </h2>
        <p className="mt-2 max-w-prose">{m.forecastOnlyBody}</p>
      </Shell>
    );
  }

  if (!measured.ok || coverage.status !== "station") {
    const reason = measured.ok ? null : measured.reason;
    return (
      <Shell accent="color-mix(in srgb, var(--ink) 35%, transparent)">
        <Badge />
        <h2 id="measured-title" className="type-condensed mt-2 text-3xl leading-tight font-semibold">
          {m.unknownTitle}
        </h2>
        {reason && <p className="mt-2 max-w-prose">{m.reasons[reason]}</p>}
      </Shell>
    );
  }

  const pm25 = measured.data.latest.pm25;
  const naqi = measured.data.naqi24h.pm25;
  const station = coverage.station;
  const accent = naqi.ok ? CATEGORY_VAR[naqi.data.category] : "var(--ink)";

  return (
    <Shell accent={accent}>
      <Badge />

      {naqi.ok ? (
        <>
          <h2 id="measured-title" className="type-condensed mt-2 text-4xl leading-[1.05] font-semibold text-balance sm:text-5xl">
            {m.verdict[naqi.data.category]({ city })}
          </h2>
          <p className="mt-1 text-sm leading-snug text-muted">{m.verdictBasis({ km: t.common.km({ km: f.number(coverage.distanceKm, 1) }) })}</p>
          <figure className="mt-2 border-l-2 border-ink/30 pl-3">
            <blockquote className="leading-snug before:content-['“'] after:content-['”']">{t.healthStatements[naqi.data.category]}</blockquote>
            <figcaption className="text-xs leading-snug text-muted">
              {m.cpcbAttribution({ category: t.categories[naqi.data.category] })}
              {t.healthStatementIsTranslation && <span className="block">{t.healthStatementIsTranslation}</span>}
            </figcaption>
          </figure>
        </>
      ) : (
        <>
          <h2 id="measured-title" className="type-condensed mt-2 text-3xl leading-tight font-semibold">
            {m.noAqiTitle}
          </h2>
          <p className="mt-2 max-w-prose">{m.naqiReasons[naqi.reason]}</p>
        </>
      )}

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink/15 pt-3">
        {naqi.ok && (
          <Figure value={f.number(naqi.data.subIndex)} label={m.aqiLabel} sub={m.aqiScope} extra={naqi.data.cappedAtScaleMax && m.aqiCapped} />
        )}
        {pm25 ? (
          <Figure
            value={f.number(pm25.value)}
            unit={t.common.unitUgm3}
            label={m.latestLabel}
            sub={m.observed({ time: f.time(pm25.provenance.observedAt.utc), ago: describeAge(pm25.provenance.observedAt.utc, now, t) })}
          />
        ) : (
          <p className="text-sm text-muted">{m.noPm25Now}</p>
        )}
      </div>
      {naqi.ok && pm25 && <p className="mt-2 text-sm leading-snug">{m.aqiVsLatest}</p>}

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-medium underline decoration-ink/30 underline-offset-4">{m.detailsTitle}</summary>
        {naqi.ok && <CategoryScale category={naqi.data.category} />}
        <ul className="mt-3 space-y-1.5 text-muted">
          <li className="text-ink">{m.station({ name: station.name, km: t.common.km({ km: f.number(coverage.distanceKm, 1) }) })}</li>
          <li>{m.network}</li>
          <li>{m.lagNote}</li>
          {naqi.ok && <li>{m.aqiBasis({ hours: naqi.data.hoursObserved })}</li>}
          {naqi.ok && <li>{m.pm25Only}</li>}
        </ul>
      </details>
    </Shell>
  );
}
