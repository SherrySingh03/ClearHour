"use client";

import { useCallback, useEffect, useState } from "react";
import { CITATIONS } from "@/lib/grounding/citations";
import type { PlanResponse } from "@/lib/plan/types";
import type { HouseholdProfile } from "@/lib/profile/types";
import { describeGap } from "@/lib/view/describe";
import { useLocale } from "./LocaleContext";

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; data: PlanResponse };

/**
 * Shows the Gemini-written plan only after the server has validated all of it.
 * On any failure: one generic message and a retry. Never a partial plan.
 */
export function PlanPanel({ profile }: { profile: HouseholdProfile }) {
  const { t, locale } = useLocale();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const fetchPlan = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cityId: profile.cityId, locale, profile }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setLoad({ status: "ready", data: (await res.json()) as PlanResponse });
    } catch {
      setLoad({ status: "failed" });
    }
  }, [profile, locale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / input change
    void fetchPlan();
  }, [fetchPlan]);

  return (
    <section aria-labelledby="plan-title" className="rounded-2xl border border-ink/20 bg-station px-5 py-5">
      <h2 id="plan-title" className="type-condensed text-3xl font-semibold">
        {t.plan.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.plan.byline}</p>

      {load.status === "loading" && <p className="mt-4 text-muted">{t.plan.loading}</p>}
      {load.status === "failed" && (
        <div className="mt-4" role="status">
          <p>{t.plan.failed}</p>
          <button type="button" onClick={() => void fetchPlan()} className="mt-3 rounded-full bg-ink px-5 py-2 text-smog">
            {t.plan.retry}
          </button>
        </div>
      )}
      {load.status === "ready" && (
        <div className="mt-4">
          <p className="text-xl font-semibold">{load.data.plan.headline}</p>
          <ol className="mt-4 space-y-4">
            {load.data.plan.steps.map((step) => {
              const ref = load.data.refs[step.refId];
              return (
                <li key={step.refId} className="border-l-2 border-ink/25 pl-4">
                  <p>{step.note}</p>
                  {ref?.kind === "window" && <p className="mt-1 text-sm text-model">{t.plan.seeForecast}</p>}
                  {ref?.kind === "guidance" && (
                    <div className="mt-1 text-sm text-muted">
                      <p>{ref.text}</p>
                      {ref.sources.map((s) => (
                        <p key={s.locator} className="mt-0.5 text-xs">
                          <a className="underline underline-offset-2" href={CITATIONS[s.citation].url}>
                            {t.plan.source({ title: CITATIONS[s.citation].publisher })}
                          </a>
                        </p>
                      ))}
                    </div>
                  )}
                  {ref?.kind === "swap" && (
                    <div className="mt-1 text-sm text-muted">
                      <p className="font-medium text-ink">{ref.action}</p>
                      <p>{ref.saving}</p>
                      {ref.factors
                        .filter((x) => x.citation !== null)
                        .map((x) => (
                          <p key={x.factorId} className="mt-0.5 text-xs">
                            <a className="underline underline-offset-2" href={CITATIONS[x.citation!].url}>
                              {t.plan.source({ title: CITATIONS[x.citation!].title })}
                            </a>
                          </p>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {load.data.plan.acknowledgedGaps.length > 0 && (
            <div className="mt-4 text-sm">
              <p className="font-medium">{t.plan.gapsIntro}</p>
              <ul className="mt-1 list-disc pl-5 text-muted">
                {load.data.plan.acknowledgedGaps.map((g) => (
                  <li key={g}>{describeGap(g, t)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
