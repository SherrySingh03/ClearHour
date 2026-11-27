/**
 * Word lists the plan validator matches against, organised by CONCEPT with one
 * entry per UI language.
 *
 * Parity is structural: every concept is a Record<Locale, …>, so adding a
 * language fails to compile until every concept has words for it, and a test
 * rejects an example sentence for every concept in every language
 * (tests/lexicon.test.ts). A phrase caught in one language must be caught in
 * all of them.
 *
 * Every language's patterns are applied to every plan, whatever its language.
 */

import type { Locale } from "../i18n/locales";

type Words = Readonly<Record<Locale, readonly string[]>>;

/**
 * Devanagari spelling variants that must not slip past: nukta letters
 * (ख़ vs ख, precomposed or not) and chandrabindu vs anusvara (साँस vs सांस).
 * Applied to both the text and the patterns.
 */
export function foldForMatching(text: string): string {
  return text.normalize("NFD").replace(/़/g, "").replace(/ँ/g, "ं");
}

/** Whole word in Devanagari (letters and vowel signs on either side disqualify). */
const hiWord = (w: string) => `(?<![\\p{L}\\p{M}])(?:${w})(?![\\p{L}\\p{M}])`;

/** How each language's alternatives become one pattern. */
const COMPILE: Readonly<Record<Locale, (alternatives: readonly string[]) => RegExp>> = {
  // English: whole words.
  en: (a) => new RegExp(`\\b(?:${a.join("|")})\\b`, "iu"),
  // Hindi: stems match inside words (to catch inflections); use hiWord() where a stem is too short for that.
  hi: (a) => new RegExp(`(?:${foldForMatching(a.join("|"))})`, "iu"),
};

export type HealthConcept =
  | "health"
  | "asthma"
  | "lungs"
  | "heart"
  | "breathing"
  | "cough"
  | "illness"
  | "symptoms"
  | "discomfort"
  | "cancer"
  | "death"
  | "medical-care"
  | "treatment"
  | "immunity"
  | "pregnancy"
  | "exposure"
  | "sensitivity"
  | "safety"
  | "harm"
  | "risk"
  | "caution";

/**
 * Health, medical, safety, exposure and caution vocabulary. Any match rejects
 * the whole plan (assumptions.ts#plan-health-vocabulary).
 */
export const HEALTH_LEXICON: Readonly<Record<HealthConcept, Words>> = {
  health: { en: ["health\\w*", "unhealthy", "well-?being"], hi: ["स्वास्थ्य", "सेहत", "स्वस्थ", "तबीयत", "तबियत", "हेल्थ"] },
  asthma: { en: ["asthma\\w*"], hi: ["दमा", "अस्थमा"] },
  lungs: { en: ["lungs?"], hi: ["फेफड"] },
  heart: { en: ["heart\\w*", "cardi\\w*"], hi: ["हृदय", "दिल(?!्ली)", "हार्ट", "कार्डि"] },
  breathing: { en: ["breath\\w*", "respirat\\w*", "suffocat\\w*"], hi: ["सांस", "श्वास", "श्वसन", "दम घुट"] },
  cough: { en: ["cough\\w*", "wheez\\w*"], hi: ["खांस", "घरघर"] },
  illness: { en: ["diseases?", "illness\\w*", "ill", "sick\\w*", "patients?"], hi: ["बीमार", "रोग", "मरीज"] },
  symptoms: { en: ["symptoms?"], hi: ["लक्षण"] },
  discomfort: {
    en: ["discomfort\\w*", "irritat\\w*", "headaches?", "allerg\\w*", "infect\\w*"],
    // "जलन" (burning sensation) but not "जलने/जलाना" (to burn).
    hi: ["तकलीफ", hiWord("जलन"), "सिर ?दर्द", "एलर्जी", "ऐलर्जी", "संक्रमण", "इन्फेक्शन"],
  },
  cancer: { en: ["cancer\\w*"], hi: ["कैंसर"] },
  death: { en: ["deaths?", "die", "dies", "dying", "mortality", "fatal\\w*", "lethal", "deadly"], hi: ["मौत", "मृत्यु", "जानलेवा", "घातक"] },
  "medical-care": {
    en: ["medic\\w*", "doctors?", "hospital\\w*", "clinics?", "inhalers?", "diagnos\\w*"],
    hi: ["डॉक्टर", "डाक्टर", "अस्पताल", "चिकित्स", "दवा", "इनहेलर", "निदान"],
  },
  treatment: { en: ["treat(?:ment|ed|ing)?s?", "cure\\w*", "therap\\w*"], hi: ["इलाज", "उपचार"] },
  immunity: { en: ["immun\\w*"], hi: ["प्रतिरक्षा", "इम्यू", "इम्यु"] },
  pregnancy: { en: ["pregnan\\w*"], hi: ["गर्भ", "प्रेग्नें", "प्रेगनें"] },
  exposure: { en: ["exposure\\w*", "exposed"], hi: ["संपर्क", "सम्पर्क", "एक्सपोज"] },
  sensitivity: { en: ["sensitive", "vulnerable"], hi: ["संवेदनशील", "सेंसिटिव"] },
  safety: { en: ["safe", "safer", "safely", "safety", "unsafe", "protect\\w*"], hi: ["सुरक्ष", "रक्षा", "महफूज", "बचाव"] },
  harm: { en: ["harm\\w*", "toxic\\w*", "poison\\w*"], hi: ["हानि", "नुकसान", "जहर", "विषैल", "विषाक्त"] },
  risk: { en: ["risks?", "risky", "danger\\w*", "hazard\\w*"], hi: ["खतर", "जोखिम", "रिस्क"] },
  caution: { en: ["caution\\w*", "precaution\\w*", "careful\\w*", "beware", "take care"], hi: ["सावधान", "एहतियात", "सतर्क", "चौकन्न", "खयाल रख", "ख्याल रख"] },
};

export type TimeConcept = "now" | "forecast" | "last-24-hours";

/** Timeframe words for quoted measured numbers (assumptions.ts#plan-timeframe-binding). */
export const TIME_LEXICON: Readonly<Record<TimeConcept, Words>> = {
  now: {
    en: ["now", "current\\w*", "presently", "at present", "at the moment", "this moment", "nowadays"],
    hi: ["अभी", hiWord("अब"), "इस समय", "इस वक्त", "इस क्षण", "इस पल", "वर्तमान", "फिलहाल", "मौजूदा", "आजकल"],
  },
  forecast: {
    en: ["forecast\\w*", "predict\\w*", "expect\\w*", "model\\w*", "projected"],
    hi: ["पूर्वानुमान", "अनुमान", "संभावना", "संभावित", "उम्मीद", "आसार", "मॉडल"],
  },
  "last-24-hours": { en: ["24\\s*-?\\s*(?:hours?|hrs?)"], hi: ["24\\s*-?\\s*(?:घंटे|घंटा|घंटों)"] },
};

/** Spelled-out quantities. "one"/"एक" are excluded in both: they double as the article "a". */
export const NUMBER_WORD_LEXICON: Words = {
  en: [
    "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
    "eighty", "ninety", "hundreds?", "thousands?", "millions?", "lakhs?", "dozens?", "half", "twice", "double", "triple",
    "percent", "per cent",
  ],
  hi: [
    hiWord("दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|ग्यारह|बारह|तेरह|चौदह|पंद्रह|सोलह|सत्रह|अठारह|उन्नीस|बीस|तीस|चालीस|पचास|साठ|सत्तर|अस्सी|नब्बे|चौबीस"),
    hiWord("सौ|सैकड़ों|हज़ार|हज़ारों|लाख|लाखों|दर्जन|दर्जनों|आधा|आधे|आधी|दोगुना|दोगुनी|दोगुने|दुगना|दुगुना|तिगुना|गुना"),
    "प्रतिशत",
    "फीसदी",
  ],
};

/**
 * The only words that label a forecast time or part of the day. Deliberately
 * narrower than the forecast concept above: "expected", "model" or "hope" do
 * not tell a reader that a time is a prediction.
 */
export const FORECAST_LABEL_LEXICON: Words = {
  en: ["forecast", "predicted"],
  hi: ["पूर्वानुमान"],
};

/** Parts of the day: in the headline or best-time step they need the label too. */
export const DAY_PART_LEXICON: Words = {
  en: [
    "morning\\w*", "afternoon\\w*", "evening\\w*", "night\\w*", "tonight", "overnight", "midnight", "midday", "mid-day", "noon\\w*",
    "dawn\\w*", "dusk", "sunrise", "sunset", "sundown", "daybreak", "daytime", "twilight", "early hours", "small hours",
  ],
  hi: [
    hiWord("सुबह|सुबहें|सुबहों|दोपहर|दोपहरी|शाम|शामें|शामों|रात|रातें|रातों|रातभर|रात्रि|सवेरा|सवेरे|तड़के|भोर|सांझ|सायं|सायंकाल|प्रातः|प्रातःकाल|मध्याह्न|सूर्योदय|सूर्यास्त"),
  ],
};

/** Whether a label is present, counting only the words of the plan's own language. */
export function hasForecastLabel(text: string, locale: Locale): boolean {
  return COMPILE[locale](FORECAST_LABEL_LEXICON[locale]).test(foldForMatching(text));
}

function compileAll(words: Words): readonly RegExp[] {
  return (Object.keys(words) as Locale[]).map((l) => COMPILE[l](words[l]));
}

/** A matcher that is true when the text uses the concept in any language. */
export function matcher(words: Words): (text: string) => boolean {
  const patterns = compileAll(words);
  return (text) => {
    const folded = foldForMatching(text);
    return patterns.some((re) => re.test(folded));
  };
}

const healthMatchers = (Object.keys(HEALTH_LEXICON) as HealthConcept[]).map((c) => [c, matcher(HEALTH_LEXICON[c])] as const);

/** The first health concept the text uses, or null. */
export function healthConcept(text: string): HealthConcept | null {
  return healthMatchers.find(([, m]) => m(text))?.[0] ?? null;
}

export const mentionsNow = matcher(TIME_LEXICON.now);
export const mentionsForecast = matcher(TIME_LEXICON.forecast);
export const mentionsLast24Hours = matcher(TIME_LEXICON["last-24-hours"]);
export const containsNumberWord = matcher(NUMBER_WORD_LEXICON);
export const mentionsDayPart = matcher(DAY_PART_LEXICON);
