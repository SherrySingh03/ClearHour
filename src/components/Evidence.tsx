"use client";

import type { ReactNode } from "react";
import { CITATIONS, type CitationId } from "@/lib/grounding/citations";
import { citationLabel } from "@/lib/view/describe";
import { useLocale } from "./LocaleContext";

/** Evidence one tap away: the plain answer stays outside, the proof goes in here. */
export function Evidence({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-1.5 text-sm">
      <summary className="cursor-pointer font-medium underline decoration-ink/30 underline-offset-4">{summary}</summary>
      <div className="mt-2 space-y-3 border-l-2 border-ink/15 pl-3">{children}</div>
    </details>
  );
}

/**
 * A source's own words (always in the source's language) with its page locator
 * and a link. Several quotes from one document share a single link.
 */
export function Quotes({ items }: { items: readonly { citation: CitationId; locator: string; quote: string }[] }) {
  const { t } = useLocale();
  const documents = [...new Set(items.map((i) => i.citation))];
  return (
    <>
      {documents.map((id) => (
        <figure key={id}>
          {items
            .filter((i) => i.citation === id)
            .map((i) => (
              <div key={i.locator} className="mt-1.5 first:mt-0" lang="en">
                <blockquote className="before:content-['“'] after:content-['”']">{i.quote}</blockquote>
                <p className="text-xs text-muted">{i.locator}</p>
              </div>
            ))}
          <figcaption className="mt-1 text-xs">
            <a className="underline underline-offset-2" href={CITATIONS[id].url}>
              {t.plan.source({ title: citationLabel(id) })}
            </a>
          </figcaption>
        </figure>
      ))}
    </>
  );
}
