"use client";

import type { GroundingSnapshot } from "@/lib/grounding/types";
import type { HouseholdProfile } from "@/lib/profile/types";
import { categorySignal, selectGuidance, type SelectedGuidance } from "@/lib/sourced/guidance";
import { Evidence, Quotes } from "./Evidence";
import { useLocale } from "./LocaleContext";

/** Sourced indoor advice for this household: plain sentence first, quotes behind a tap. */
export function IndoorPanel({ snapshot, profile }: { snapshot: GroundingSnapshot; profile: HouseholdProfile }) {
  const { t, locale } = useLocale();
  const s = t.indoor;
  const signal = categorySignal(snapshot);
  const items = selectGuidance(profile, signal);
  // "unknown" keeps every poor-day item, so a shorter list means some were left out today.
  const someLeftOut = items.length < selectGuidance(profile, { basis: "unknown" }).length;

  const why = (g: SelectedGuidance) => {
    if (g.triggeredBy === null) return s.anyDay;
    return g.triggeredBy.basis === "unknown" ? s.categoryUnknown : s.becauseMeasured({ category: t.categories[g.triggeredBy.category] });
  };

  return (
    <section aria-labelledby="indoor-title" className="border-t-2 border-ink/15 pt-5">
      <h2 id="indoor-title" className="type-condensed text-3xl font-semibold">
        {s.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{s.intro}</p>
      {s.translationNote && <p className="text-sm text-muted">{s.translationNote}</p>}

      <ul className="mt-3 divide-y divide-ink/10">
        {items.map((g) => (
          <li key={g.item.id} className="py-3">
            <p className="text-lg leading-snug">{g.item.text[locale]}</p>
            <p className="mt-1 text-sm text-muted">{why(g)}</p>
            <Evidence summary={s.evidence}>
              <p className="font-medium">{s.originalWording}</p>
              <Quotes items={g.item.sources} />
            </Evidence>
          </li>
        ))}
      </ul>
      {someLeftOut && signal.basis !== "unknown" && <p className="mt-2 text-sm text-muted">{s.leftOut({ category: t.categories[signal.category] })}</p>}
    </section>
  );
}
