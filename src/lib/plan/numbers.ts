/**
 * Number extraction shared by the packet builder (what is allowed) and the
 * validator (what was written), so both sides normalise identically.
 *
 * Text is NFKC-normalised first (fullwidth "３７" → "37"). Devanagari digits
 * are mapped to ASCII. Any decimal digit from another script, and any other
 * numeric symbol (superscripts, fractions such as "½"), is reported via
 * `hasUnsupportedNumerals`, and the validator rejects it rather than trying
 * to read it.
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/**
 * Pollutant and unit names contain digits but are not quantities anyone could
 * misstate. Matches both before and after NFKC (which turns "µg/m³" into
 * "μg/m3" and "CO₂" into "CO2").
 */
const NAME_TOKENS = /PM\s?2\.5|PM\s?10|CO[₂2]|[µμu]g\/m[³3]/gi;

const NUMBER = /\d+(?:,\d{3})*(?:\.\d+)?/g;

function canonical(n: string): string {
  return n.replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, "");
}

/** NFKC + Devanagari digits → ASCII. */
export function normalise(text: string): string {
  return text.normalize("NFKC").replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

export function extractNumbers(text: string): string[] {
  return [...normalise(text).replace(NAME_TOKENS, " ").matchAll(NUMBER)].map((m) => canonical(m[0]));
}

/**
 * True if the RAW text (before NFKC, which would quietly turn "½" into "1⁄2"
 * and "²⁵" into "25") holds any numeral we don't read: superscripts,
 * fractions, roman numerals, or decimal digits from scripts other than ASCII
 * and Devanagari. Fullwidth digits are the one exception: NFKC maps them
 * exactly, and they are then checked like any other number.
 */
export function hasUnsupportedNumerals(text: string): boolean {
  const t = text.replace(NAME_TOKENS, " ");
  for (const ch of t.match(/[\p{Nd}\p{No}\p{Nl}⁄]/gu) ?? []) {
    if (/[0-9०-९]/.test(ch)) continue; // ASCII and Devanagari digits
    if (/[０-９]/.test(ch)) continue; // fullwidth: normalised by NFKC, then checked
    return true;
  }
  return false;
}

export type Unit = "ugm3" | "kg" | "pct";

/** Numbers written directly before a unit. Used to stop a real number being reused in the wrong role. */
const UNIT_PATTERNS: Readonly<Record<Unit, RegExp>> = {
  ugm3: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:[µμu]g\/m[³3]|micrograms?)/gi,
  kg: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:kg|किलो|kilograms?)/gi,
  pct: /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:%|प्रतिशत|percent)/gi,
};

export function extractUnitNumbers(text: string): Record<Unit, string[]> {
  const t = text.normalize("NFKC").replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  const out: Record<Unit, string[]> = { ugm3: [], kg: [], pct: [] };
  for (const unit of Object.keys(UNIT_PATTERNS) as Unit[]) {
    for (const m of t.matchAll(UNIT_PATTERNS[unit])) out[unit].push(canonical(m[1]!));
  }
  return out;
}

/** Units that give a number a role; "km" and "hour" are recognised only so they are never mistaken for a bound value. */
export type OccurrenceUnit = Unit | "km" | "hour";

export interface NumberOccurrence {
  readonly value: string;
  readonly unit: OccurrenceUnit | null;
}

const POLLUTANT_NAMES = /PM\s?2\.5|PM\s?10|CO[₂2]/gi;
const UGM3 = /[µμu]g\/m[³3]/gi;
/**
 * A number, unless it is part of a clock time ("8:30": both sides skipped),
 * followed by an optional unit.
 */
const OCCURRENCE =
  /(?<![\d:.,])(\d+(?:,\d{3})*(?:\.\d+)?)(?![\d:])(?:\s*-?\s*(UGMQ|micrograms?|kg|किलो|kilograms?|%|प्रतिशत|percent|km|किमी|kilomet(?:re|er)s?|hours?|hrs?|घंटे|घंटा|घंटों))?/gi;

const UNIT_OF: ReadonlyArray<[RegExp, OccurrenceUnit]> = [
  [/^(UGMQ|micrograms?)$/i, "ugm3"],
  [/^(kg|किलो|kilograms?)$/i, "kg"],
  [/^(%|प्रतिशत|percent)$/i, "pct"],
  [/^(km|किमी|kilomet(?:re|er)s?)$/i, "km"],
  [/^(hours?|hrs?|घंटे|घंटा|घंटों)$/i, "hour"],
];

/** Every number in the text with the unit written after it (if any). Clock times are skipped. */
export function numberOccurrences(text: string): NumberOccurrence[] {
  const t = normalise(text).replace(POLLUTANT_NAMES, " ").replace(UGM3, "UGMQ");
  return [...t.matchAll(OCCURRENCE)].map((m) => {
    const u = m[2];
    const unit = u === undefined ? null : (UNIT_OF.find(([re]) => re.test(u))?.[1] ?? null);
    return { value: canonical(m[1]!), unit };
  });
}

/** Sentences, split after . ! ? ; or the danda. ("PM2.5" is not split: the dot has no space after it.) */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;।])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Spelled-out quantities. Hindi list avoids words that double as verbs (e.g. "दो" = "give"). */
const NUMBER_WORDS_EN =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|twice|double|triple|percent|per cent)\b/i;
const NUMBER_WORDS_HI = /(तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|बीस|तीस|चालीस|पचास|सौ|हज़ार|हजार|आधा|आधे|दोगुना|गुना|प्रतिशत|फ़ीसदी|फीसदी)/;

export function containsNumberWord(text: string): boolean {
  return NUMBER_WORDS_EN.test(text) || NUMBER_WORDS_HI.test(text);
}
