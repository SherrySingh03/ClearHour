"use client";

import { CITATIONS } from "@/lib/grounding/citations";
import type { GroundingSnapshot } from "@/lib/grounding/types";
import type { SwapAssumptionId } from "@/lib/i18n/strings/en";
import type { HouseholdProfile } from "@/lib/profile/types";
import { EMISSION_FACTORS } from "@/lib/sourced/emissionFactors";
import { categorySignal } from "@/lib/sourced/guidance";
import { swapsFor, type FactorTerm, type Swap, type WithheldReason, type WithheldSwap } from "@/lib/sourced/swaps";
import { citationLabel, describeSaving, swapTarget } from "@/lib/view/describe";
import { Evidence, Quotes } from "./Evidence";
import { useLocale } from "./LocaleContext";

/** The calculation behind one figure: the sum, each factor as printed, and what was assumed. */
function Working({ swap }: { swap: Swap }) {
  const { t, f } = useLocale();
  const s = t.swapsSection;
  const { saving } = swap;
  const n = (v: number) => f.number(v, 6);
  const terms: FactorTerm[] = [saving.from, saving.to];
  const transport = saving.quantity === "kgCO2-per-working-day";

  return (
    <Evidence summary={s.evidence}>
      <p className="tabular-nums">
        {saving.quantity === "kgCO2-per-working-day"
          ? s.sumKg({ from: n(saving.from.value), to: n(saving.to.value), km: f.number(saving.km, 1), result: f.number(saving.value, 3) })
          : s.sumPercent({ from: n(saving.from.value), to: n(saving.to.value), result: f.number(saving.value, 1) })}
      </p>

      <div>
        <p className="font-medium">{s.factorsTitle}</p>
        <ul className="mt-1 space-y-2">
          {terms.map((term) => {
            if (term.factorId === "none") return <li key={term.factorId}>{s.factorLabels.none}</li>;
            const factor = EMISSION_FACTORS[term.factorId];
            return (
              <li key={term.factorId}>
                <p>{s.factorLine({ label: s.factorLabels[term.factorId], value: n(term.value), unit: s.factorUnits[factor.unit] })}</p>
                <p className="text-xs text-muted">{s.sourceRow}</p>
                <p className="text-xs text-muted" lang="en">
                  {factor.printedAs}
                </p>
                <p className="text-xs text-muted" lang="en">
                  {factor.locator}
                </p>
                <p className="text-xs">
                  <a className="underline underline-offset-2" href={CITATIONS[factor.citation].url}>
                    {t.plan.source({ title: citationLabel(factor.citation) })}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="font-medium">{s.assumedTitle}</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {swap.assumptions.map((id) => (
            <li key={id}>{s.assumed[id as SwapAssumptionId]}</li>
          ))}
          {saving.from.factorId === "car-petrol" && <li>{s.noHybrids}</li>}
          {transport && <li>{s.dataAge}</li>}
          {saving.to.factorId === "bus-intracity" && <li>{s.busScope}</li>}
        </ul>
      </div>

      <div>
        <p className="font-medium">{swap.co2Only ? s.aboutTitle : s.whyTitle}</p>
        {swap.co2Only && <p>{s.co2OnlyNotes[swap.co2Only]}</p>}
        <Quotes items={swap.why} />
      </div>
    </Evidence>
  );
}

/** Swaps we can name but not put a figure on, grouped by the reason. */
function groupByReason(withheld: readonly WithheldSwap[]): [WithheldReason, WithheldSwap[]][] {
  const groups = new Map<WithheldReason, WithheldSwap[]>();
  for (const w of withheld) groups.set(w.reason, [...(groups.get(w.reason) ?? []), w]);
  return [...groups];
}

export function SwapsPanel({ profile, snapshot }: { profile: HouseholdProfile; snapshot: GroundingSnapshot }) {
  const { t, f } = useLocale();
  const s = t.swapsSection;
  const signal = categorySignal(snapshot);
  const { swaps, withheld, gated } = swapsFor(profile, signal);

  return (
    <section aria-labelledby="swaps-title" className="border-t-2 border-ink/15 pt-5">
      <h2 id="swaps-title" className="type-condensed text-3xl font-semibold">
        {s.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{s.intro}</p>

      {swaps.length === 0 && withheld.length === 0 && gated.length === 0 && <p className="mt-3">{s.none}</p>}

      {swaps.length > 0 && (
        <ul className="mt-3 divide-y divide-ink/10">
          {swaps.map((swap) => (
            <li key={swap.id} className="py-3">
              <h3 className="text-lg font-semibold">{t.swaps.targets[swapTarget(swap.id)]}</h3>
              <p className="leading-snug">{describeSaving(swap, t, f)}</p>
              {swap.conditional && <p className="mt-0.5 text-sm text-muted">{t.swaps.ifAvailable}</p>}
              <Working swap={swap} />
            </li>
          ))}
        </ul>
      )}

      {gated.map((g) => (
        <div key={g.id} className="mt-4">
          <h3 className="font-semibold">{s.gatedTitle}</h3>
          <p className="mt-0.5 text-sm">
            {signal.basis === "unknown" ? s.gatedUnknown : s.gatedPoor({ category: t.categories[signal.category] })}
          </p>
          <Evidence summary={t.plan.sourceSays}>
            <Quotes items={g.why} />
          </Evidence>
        </div>
      ))}

      {withheld.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold">{s.withheldTitle}</h3>
          <ul className="mt-1 divide-y divide-ink/10">
            {groupByReason(withheld).map(([reason, items]) => (
              <li key={reason} className="py-3">
                <ul className="flex flex-wrap gap-x-4 font-medium">
                  {items.map((w) => (
                    <li key={w.id}>{t.swaps.targets[swapTarget(w.id)]}</li>
                  ))}
                </ul>
                <p className="mt-0.5 text-sm text-muted">{s.withheld[reason]}</p>
                <Evidence summary={s.whyTitle}>
                  <Quotes items={items[0]!.why} />
                </Evidence>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
