/**
 * Plan validator: the gate between Gemini and the screen. All-or-nothing.
 * Any failed check rejects the WHOLE plan; nothing partial is ever rendered.
 *
 * Checks:
 *  - shape: matches the schema, within length limits
 *  - references: every step points at an id that was in the input (and not twice)
 *  - window: no window step when no forecast window was given
 *  - gaps: exactly the input's missing-data codes are acknowledged
 *  - links: no URLs
 *  - health: no health, medical, safety, exposure or caution wording, in any
 *    UI language (lexicon.ts); the UI shows CPCB's verbatim statement
 *  - numbers: no spelled-out quantities; no digits from other scripts or
 *    numeric symbols; every number must be in the input AS THE SAME KIND (clock
 *    time, µg/m³, km, hours...), and the only unitless one allowed is the AQI
 *
 * Rejection details carry codes and numbers only, never the model's text, so
 * they are safe to log.
 *  - timeframes: a sentence quoting a measured or predicted number says what
 *    it is (24-hour AQI as 24-hour and never "now"; the latest reading never
 *    "now" or a forecast). Savings and forecast differences are never given
 *    to the model, so it cannot quote or reverse them: only the UI shows them
 *  - forecast label: the best-time step, and any headline that quotes a time,
 *    must say it is a forecast
 *  - language: written in the requested language, with no letters from a
 *    script other than Latin and Devanagari
 */

import { z } from "zod";
import { missing, ok, type Grounded } from "../grounding/types";
import { containsNumberWord, healthConcept, mentionsForecast, mentionsLast24Hours, mentionsNow } from "./lexicon";
import { hasUnsupportedNumerals, normalise, numberTokens, sentences } from "./numbers";
import type { NumberRole, Plan, PlanAllowance } from "./types";

export const LIMITS = { headline: 160, note: 240, maxSteps: 5 } as const;

export type PlanRejection =
  | "schema"
  | "unknown-ref"
  | "duplicate-ref"
  | "window-unavailable"
  | "gaps-mismatch"
  | "link"
  | "health-claim"
  | "number-word"
  | "unknown-number"
  | "number-role"
  | "forecast-unlabelled"
  | "wrong-language";

const PlanSchema = z.object({
  headline: z.string().trim().min(1).max(LIMITS.headline),
  steps: z
    .array(z.object({ kind: z.enum(["window", "guidance", "swap"]), refId: z.string().min(1).max(80), note: z.string().trim().min(1).max(LIMITS.note) }))
    .min(1)
    .max(LIMITS.maxSteps),
  acknowledgedGaps: z.array(z.string().max(80)).max(10),
});

const LINK = /(https?:\/\/|www\.)/i;

/**
 * A measured value is never "now": the latest reading is hours old and the AQI
 * is a 24-hour average. Neither may be quoted as a forecast.
 */
const ROLE_OK: Readonly<Record<NumberRole, (sentence: string) => boolean>> = {
  "aqi-24h": (x) => mentionsLast24Hours(x) && !mentionsNow(x) && !mentionsForecast(x),
  "latest-reading": (x) => !mentionsNow(x) && !mentionsForecast(x),
};

/**
 * The first number in `text` whose sentence misstates what it is, or null.
 * A number can match several bindings (the same value shown twice); the
 * sentence passes if it fits any one of them.
 */
function misboundNumber(text: string, a: PlanAllowance): string | null {
  for (const raw of sentences(text)) {
    const sentence = normalise(raw);
    for (const occ of numberTokens(sentence, a.names)) {
      const candidates = a.bindings.filter((b) => b.value === occ.value && occ.kind === (b.unit ?? "bare"));
      if (candidates.length > 0 && !candidates.some((b) => ROLE_OK[b.role](sentence))) return `${occ.value} (${candidates.map((b) => b.role).join("|")})`;
    }
  }
  return null;
}

/**
 * A letter from any script other than the two we write in. The micro sign (and
 * the Greek mu that NFKC turns it into) is allowed for µg/m³.
 */
const FOREIGN_LETTER = /(?![\p{Script=Latin}\p{Script=Devanagari}\u00B5\u03BC])\p{L}/u;

/** Share of letters that are Devanagari. */
function devanagariShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  return letters.filter((c) => /[ऀ-ॿ]/.test(c)).length / letters.length;
}

export function validatePlan(raw: unknown, a: PlanAllowance): Grounded<Plan, PlanRejection> {
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success) return missing("schema");
  const p = parsed.data;

  const seen = new Set<string>();
  for (const s of p.steps) {
    const known =
      (s.kind === "window" && s.refId === "window") ||
      (s.kind === "guidance" && a.guidanceIds.has(s.refId)) ||
      (s.kind === "swap" && a.swapIds.has(s.refId));
    if (!known) return missing("unknown-ref", s.kind);
    if (seen.has(s.refId)) return missing("duplicate-ref", s.kind);
    seen.add(s.refId);
    if (s.kind === "window" && !a.windowAvailable) return missing("window-unavailable");
  }

  const expected = new Set<string>(a.gaps);
  const given = new Set<string>(p.acknowledgedGaps);
  if (given.size !== expected.size || [...expected].some((g) => !given.has(g))) return missing("gaps-mismatch");

  const texts = [p.headline, ...p.steps.map((s) => s.note)];
  for (const text of texts) {
    if (LINK.test(text)) return missing("link");
    const concept = healthConcept(text);
    if (concept !== null) return missing("health-claim", concept);
    if (containsNumberWord(text)) return missing("number-word");
    if (hasUnsupportedNumerals(text)) return missing("unknown-number", "unsupported-numerals");
    for (const n of numberTokens(text, a.names)) {
      if (a.tokens.has(`${n.kind}:${n.value}`)) continue;
      // In the input, but not as this kind of thing (a clock time reused as a limit).
      if (a.known.has(n.value)) return missing("number-role", `${n.value} as ${n.kind}`);
      return missing("unknown-number", n.value.slice(0, 20));
    }
    const misbound = misboundNumber(text, a);
    if (misbound !== null) return missing("number-role", misbound);
  }

  // Stray text in a third script (seen live: Japanese mid-sentence) is not either language.
  if (texts.some((x) => FOREIGN_LETTER.test(x))) return missing("wrong-language");
  // A forecast time must call itself a forecast: the best-time step always, and
  // the headline whenever it quotes a time. (Guidance steps quote their own hours.)
  const forecastTexts = [
    ...p.steps.filter((s) => s.kind === "window").map((s) => s.note),
    ...(numberTokens(p.headline, a.names).some((n) => n.kind === "time") ? [p.headline] : []),
  ];
  if (forecastTexts.some((x) => !mentionsForecast(normalise(x)))) return missing("forecast-unlabelled");

  const share = devanagariShare(texts.join(" "));
  if (a.locale === "hi" ? share < 0.5 : share > 0.05) return missing("wrong-language");

  return ok({ headline: p.headline, steps: p.steps, acknowledgedGaps: p.acknowledgedGaps as Plan["acknowledgedGaps"] });
}
