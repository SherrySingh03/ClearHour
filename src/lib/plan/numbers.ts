/**
 * Number extraction shared by the packet builder (what is allowed) and the
 * validator (what was written), so both sides normalise identically.
 */

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

/** Pollutant and unit names contain digits but are not numbers anyone could misstate. */
const NAME_TOKENS = /PM\s?2\.5|PM\s?10|CO₂|CO2|µg\/m³|μg\/m³/gi;

export function extractNumbers(text: string): string[] {
  const latin = text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d))).replace(NAME_TOKENS, " ");
  const out: string[] = [];
  for (const m of latin.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) {
    out.push(m[0].replace(/,(?=\d{3}\b)/g, "").replace(/\.0+$/, ""));
  }
  return out;
}

/** Spelled-out quantities. Hindi list avoids words that double as verbs (e.g. "दो" = "give"). */
const NUMBER_WORDS_EN =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|dozen|half|twice|double|triple|percent|per cent)\b/i;
const NUMBER_WORDS_HI = /(तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|बीस|तीस|चालीस|पचास|सौ|हज़ार|हजार|आधा|आधे|दोगुना|गुना|प्रतिशत|फ़ीसदी|फीसदी)/;

export function containsNumberWord(text: string): boolean {
  return NUMBER_WORDS_EN.test(text) || NUMBER_WORDS_HI.test(text);
}
