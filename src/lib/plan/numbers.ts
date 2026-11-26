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

function canonical(n: string): string {
  return n.replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, "");
}

/** NFKC + Devanagari digits → ASCII. */
export function normalise(text: string): string {
  return text.normalize("NFKC").replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
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

/**
 * What a number is, judged by how it is written. A number the model quotes must
 * be written as the same kind of thing it was in the input: the "30" of the
 * clock time "8:30" is a time, and cannot reappear as a threshold.
 */
export type NumberKind = "time" | "ugm3" | "km" | "hours" | "minutes" | "kg" | "pct" | "bare";

export interface NumberToken {
  readonly value: string;
  readonly kind: NumberKind;
}

const NUM = String.raw`\d+(?:,\d{3})*(?:\.\d+)?`;
const HM = String.raw`(?<![\d.,])\d{1,2}(?::\d{2})?`;
const MERIDIEM = String.raw`(?:a\.?m\.?(?![a-z])|p\.?m\.?(?![a-z])|o['’]clock|बजे|in the (?:morning|afternoon|evening)|noon)`;
const DAY_PART = String.raw`(?:सुबह|दोपहर|शाम|रात)`;
const RANGE_JOIN = String.raw`(?:–|—|-|to|and|से|और|तथा)`;
// Order matters: "किलोमीटर" before "किलो", "km" before "kg" is irrelevant but kept together.
const UNITS: ReadonlyArray<readonly [Exclude<NumberKind, "time" | "bare">, string]> = [
  ["ugm3", "UGMQ|micrograms?"],
  ["km", "km|किमी|किलोमीटर|kilomet(?:re|er)s?"],
  ["kg", "kg|किलो|kilograms?"],
  ["pct", "%|प्रतिशत|percent"],
  ["hours", "hours?|hrs?|घंटे|घंटा|घंटों"],
  ["minutes", "minutes?|mins?|मिनट"],
];
const UNIT = UNITS.map(([, p]) => `(?:${p})`).join("|");

/** Alternatives are tried left to right at each position. */
const TOKEN = new RegExp(
  [
    // 1. a time range closed by a meridiem: "12 and 4 pm", "5:30 – 8:30 am", "12 से 4 बजे"
    String.raw`(?<r1>${HM})\s*${RANGE_JOIN}\s*(?<r2>${HM})\s*${MERIDIEM}`,
    // 2. a clock time: "8:30"
    String.raw`(?<clock>(?<![\d.,])\d{1,2}:\d{2})`,
    // 3. a number with a unit: "45 µg/m³", "12 km", "24-hour"
    String.raw`(?<qty>${NUM})\s*-?\s*(?<unit>${UNIT})`,
    // 4. an hour with a meridiem: "4 pm", "9 बजे"
    String.raw`(?<h1>(?<![\d.,])\d{1,2})\s*${MERIDIEM}`,
    // 5. an hour after a day part: "सुबह 9"
    String.raw`${DAY_PART}\s*(?<h2>\d{1,2})(?![\d:.,])`,
    // 6. anything else
    String.raw`(?<bare>${NUM})`,
  ].join("|"),
  "gi",
);

const POLLUTANT_NAMES = /PM\s?2\.5|PM\s?10|CO[₂2]/gi;
const UGM3 = /[µμu]g\/m[³3]/gi;

/** "09:00" and "9" are the same time; "8:30" stays "8:30". */
const timeValue = (t: string) => t.replace(/:00$/, "").replace(/^0(?=\d)/, "");

/**
 * Every number in the text with its kind. `names` are proper nouns that happen
 * to contain digits ("Sector 22" station); they are removed first.
 */
export function numberTokens(text: string, names: readonly string[] = []): NumberToken[] {
  let t = normalise(text);
  for (const name of names) t = t.replaceAll(normalise(name), " ");
  t = t.replace(POLLUTANT_NAMES, " ").replace(UGM3, "UGMQ");
  const out: NumberToken[] = [];
  for (const m of t.matchAll(TOKEN)) {
    const g = m.groups!;
    if (g.r1 !== undefined) out.push({ kind: "time", value: timeValue(g.r1) }, { kind: "time", value: timeValue(g.r2!) });
    else if (g.clock !== undefined) out.push({ kind: "time", value: timeValue(g.clock) });
    else if (g.qty !== undefined) {
      const kind = UNITS.find(([, p]) => new RegExp(`^(?:${p})$`, "i").test(g.unit!))![0];
      out.push({ kind, value: canonical(g.qty) });
    } else if (g.h1 !== undefined) out.push({ kind: "time", value: timeValue(g.h1) });
    else if (g.h2 !== undefined) out.push({ kind: "time", value: timeValue(g.h2) });
    else out.push({ kind: "bare", value: canonical(g.bare!) });
  }
  return out;
}

/** Sentences, split after . ! ? ; or the danda. ("PM2.5" is not split: the dot has no space after it.) */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;।])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
