"use client";

import { useCallback, useEffect, useState } from "react";
import { CITATIONS } from "@/lib/grounding/citations";
import { findCity } from "@/lib/grounding/cities";
import type { GroundingSnapshot } from "@/lib/grounding/types";
import type { HouseholdProfile } from "@/lib/profile/types";
import { LanguageSwitch } from "./LanguageSwitch";
import { useLocale } from "./LocaleContext";
import { MeasuredMark, MeasuredPanel } from "./MeasuredPanel";
import { PlanPanel } from "./PlanPanel";
import { ForecastMark, WindowPanel } from "./WindowPanel";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; snapshot: GroundingSnapshot; now: Date };

export function Home({ profile, onEdit }: { profile: HouseholdProfile; onEdit: () => void }) {
  const { t, locale } = useLocale();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const city = findCity(profile.cityId);

  const fetchSnapshot = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const res = await fetch(`/api/grounding?city=${encodeURIComponent(profile.cityId)}`);
      if (!res.ok) throw new Error(String(res.status));
      setLoad({ status: "ready", snapshot: (await res.json()) as GroundingSnapshot, now: new Date() });
    } catch {
      setLoad({ status: "error" });
    }
  }, [profile.cityId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / city change
    void fetchSnapshot();
  }, [fetchSnapshot]);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-5 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="type-condensed text-2xl leading-none font-semibold">{t.app.name}</p>
          <p className="mt-1 text-sm text-muted">
            <span className="sr-only">{t.header.cityLabel}</span>
            {city?.names[locale]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <button type="button" onClick={onEdit} className="rounded-full border border-ink/25 px-3 py-1 text-sm hover:bg-ink/10">
            {t.header.editAnswers}
          </button>
        </div>
      </header>

      {/* The measured/forecast split in one plain line; the marks match the boxes below. */}
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-2">
          <MeasuredMark />
          {t.key.measured}
        </span>
        <span className="flex items-center gap-2">
          <ForecastMark />
          {t.key.forecast}
        </span>
      </p>

      {load.status === "loading" && <p className="mt-8 text-muted">{t.common.loading}</p>}
      {load.status === "error" && (
        <div className="mt-8">
          <p>{t.errors.network}</p>
          <button type="button" onClick={() => void fetchSnapshot()} className="mt-3 rounded-full bg-ink px-5 py-2 text-smog">
            {t.common.retry}
          </button>
        </div>
      )}
      {load.status === "ready" && (
        <div className="mt-4 space-y-5">
          <MeasuredPanel snapshot={load.snapshot} now={load.now} city={city?.names[locale] ?? ""} />
          <WindowPanel forecast={load.snapshot.forecast} now={load.now} departureHour={profile.commute.mode === "none" ? undefined : profile.commute.departureHour} />
          <PlanPanel profile={profile} />
        </div>
      )}

      <footer className="mt-10 border-t border-ink/15 pt-4 text-sm text-muted">
        <details>
          <summary className="cursor-pointer font-semibold text-ink">{t.sources.title}</summary>
          <p className="mt-2">{t.sources.neverMixed}</p>
          <ul className="mt-2 space-y-1">
          <li>
            <a className="underline underline-offset-2" href={CITATIONS["openaq-v3"].url}>
              {t.sources.openaq}
            </a>
          </li>
          <li>
            <a className="underline underline-offset-2" href={CITATIONS["cpcb-naqi-2014"].url}>
              {t.sources.cpcb}
            </a>
          </li>
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
        </details>
      </footer>
    </main>
  );
}
