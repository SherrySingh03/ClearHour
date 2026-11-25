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
 *  - health: no health, medical or exposure claims (the UI shows CPCB's
 *    verbatim statement; the plan adds none)
 *  - numbers: no spelled-out quantities; no digits from other scripts or
 *    numeric symbols; every numeral appears in the input; and a number next
 *    to a unit (µg/m³, kg, %) appeared with that same unit in the input
 *  - timeframes: a sentence quoting a measured or predicted number says what
 *    it is (24-hour AQI as 24-hour and never "now"; the latest reading never
 *    "now" or a forecast; a forecast number as a forecast)
 *  - language: written in the requested language
 */

import { z } from "zod";
import { missing, ok, type Grounded } from "../grounding/types";
import { containsNumberWord, extractNumbers, extractUnitNumbers, hasUnsupportedNumerals, normalise, numberOccurrences, sentences } from "./numbers";
import type { NumberBinding, NumberRole, Plan, PlanAllowance } from "./types";

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
  | "wrong-language";

const PlanSchema = z.object({
  headline: z.string().trim().min(1).max(LIMITS.headline),
  steps: z
    .array(z.object({ kind: z.enum(["window", "guidance", "swap"]), refId: z.string().min(1).max(80), note: z.string().trim().min(1).max(LIMITS.note) }))
    .min(1)
    .max(LIMITS.maxSteps),
  acknowledgedGaps: z.array(z.string().max(80)).max(10),
});

/**
 * Health / medical / exposure vocabulary. Matching any of it rejects the plan.
 * Deliberately broad: a false positive costs a retry; a false negative would
 * put an unsourced health claim on screen.
 */
const HEALTH_EN =
  /\b(health\w*|healthy|unhealthy|asthma\w*|lungs?|heart|cardi\w*|breath\w*|respirat\w*|cough\w*|wheez\w*|diseases?|illness\w*|ill|sick\w*|symptoms?|cancer\w*|deaths?|die|dying|mortality|medic\w*|doctors?|hospital\w*|inhaler\w*|diagnos\w*|treat(ment|ed|ing)?|cure\w*|immun\w*|pregnan\w*|exposure\w*|exposed|safe|safer|safely|unsafe|harmful|toxic\w*|poison\w*|risks?|risky|protects? your)\b/i;
const HEALTH_HI =
  /(स्वास्थ्य|सेहत|स्वस्थ|अस्वस्थ|दमा|अस्थमा|फेफड़|फेफड|हृदय|दिल(?!्ली)|सांस|साँस|श्वास|खांसी|खाँसी|बीमार|रोग|लक्षण|कैंसर|मौत|मृत्यु|डॉक्टर|अस्पताल|दवा|इलाज|उपचार|गर्भ|संपर्क|सुरक्षित|असुरक्षित|हानिकारक|ज़हरीला|जहरीला|खतरा|ख़तरा|जोखिम)/;

const LINK = /(https?:\/\/|www\.)/i;

/**
 * Timeframe words. A measured value is never "now": the latest reading is
 * hours old and the AQI is a 24-hour average. Broad on purpose, like the
 * health list: a false positive costs a retry.
 */
const H24 = /24\s*-?\s*(hours?|hrs?|घंटे|घंटा|घंटों)/i;
const NOW = /\b(now|current\w*|presently|at the moment|this moment)\b|अभी|इस समय|इस वक़्त|इस वक्त|वर्तमान|फ़िलहाल|फिलहाल|मौजूदा/i;
const FORECAST = /\b(forecast\w*|predict\w*|expect\w*|model\w*|projected)\b|पूर्वानुमान|अनुमान|संभावना/i;
const MEASURED = /\b(reading\w*|measured|measurement\w*|monitor\w*|station\w*|recorded)\b|रीडिंग|मापा|मापी|मापे|मॉनिटर|स्टेशन|दर्ज/i;

const ROLE_OK: Readonly<Record<NumberRole, (sentence: string) => boolean>> = {
  "aqi-24h": (x) => H24.test(x) && !NOW.test(x) && !FORECAST.test(x),
  "latest-reading": (x) => !NOW.test(x) && !FORECAST.test(x),
  forecast: (x) => FORECAST.test(x) && !MEASURED.test(x),
};

/**
 * The first number in `text` whose sentence misstates what it is, or null.
 * A number can match several bindings (the same value shown twice); the
 * sentence passes if it fits any one of them. A unitless number matches a
 * binding of any unit; a number with another unit (km, kg, hours) matches none.
 */
function misboundNumber(text: string, bindings: readonly NumberBinding[]): string | null {
  for (const raw of sentences(text)) {
    const sentence = normalise(raw);
    for (const occ of numberOccurrences(sentence)) {
      const candidates = bindings.filter((b) => b.value === occ.value && (occ.unit === null || b.unit === occ.unit));
      if (candidates.length > 0 && !candidates.some((b) => ROLE_OK[b.role](sentence))) return `${occ.value} (${candidates.map((b) => b.role).join("|")})`;
    }
  }
  return null;
}

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
    if (!known) return missing("unknown-ref", s.refId);
    if (seen.has(s.refId)) return missing("duplicate-ref", s.refId);
    seen.add(s.refId);
    if (s.kind === "window" && !a.windowAvailable) return missing("window-unavailable");
  }

  const expected = new Set<string>(a.gaps);
  const given = new Set<string>(p.acknowledgedGaps);
  if (given.size !== expected.size || [...expected].some((g) => !given.has(g))) return missing("gaps-mismatch");

  const texts = [p.headline, ...p.steps.map((s) => s.note)];
  for (const text of texts) {
    if (LINK.test(text)) return missing("link");
    if (HEALTH_EN.test(text) || HEALTH_HI.test(text)) return missing("health-claim", text);
    if (containsNumberWord(text)) return missing("number-word", text);
    if (hasUnsupportedNumerals(text)) return missing("unknown-number", "unsupported-numerals");
    const stray = extractNumbers(text).find((n) => !a.numbers.has(n));
    if (stray !== undefined) return missing("unknown-number", stray);
    const units = extractUnitNumbers(text);
    for (const unit of ["ugm3", "kg", "pct"] as const) {
      const misused = units[unit].find((n) => !a.unitNumbers[unit].has(n));
      if (misused !== undefined) return missing("unknown-number", `${misused} ${unit}`);
    }
    const misbound = misboundNumber(text, a.bindings);
    if (misbound !== null) return missing("number-role", misbound);
  }

  const share = devanagariShare(texts.join(" "));
  if (a.locale === "hi" ? share < 0.5 : share > 0.05) return missing("wrong-language");

  return ok({ headline: p.headline, steps: p.steps, acknowledgedGaps: p.acknowledgedGaps as Plan["acknowledgedGaps"] });
}
