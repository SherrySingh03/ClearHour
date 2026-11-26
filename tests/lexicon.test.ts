import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import {
  containsNumberWord,
  HEALTH_LEXICON,
  healthConcept,
  mentionsForecast,
  mentionsLast24Hours,
  mentionsNow,
  NUMBER_WORD_LEXICON,
  TIME_LEXICON,
  type HealthConcept,
  type TimeConcept,
} from "@/lib/plan/lexicon";

type Examples = Readonly<Record<Locale, readonly string[]>>;

/**
 * One concept, every language. A new language or concept fails to compile here
 * until it has example sentences, and fails the test until the lexicon catches
 * them.
 */
const HEALTH: Readonly<Record<HealthConcept, Examples>> = {
  health: { en: ["Good for your health.", "An unhealthy morning."], hi: ["सेहत के लिए अच्छा है।", "तबीयत का ध्यान रखें।"] },
  asthma: { en: ["This matters for asthma."], hi: ["दमा वाले लोग घर में रहें।", "अस्थमा हो तो ध्यान दें।"] },
  lungs: { en: ["Easier on the lungs."], hi: ["फेफड़ों के लिए बेहतर।"] },
  heart: { en: ["Easier on the heart."], hi: ["हृदय के लिए बेहतर।", "दिल के लिए बेहतर।"] },
  breathing: { en: ["Breathe easier indoors."], hi: ["साँस लेना आसान होगा।", "सांस लेना आसान होगा।"] },
  cough: { en: ["It may stop the coughing."], hi: ["खाँसी कम होगी।"] },
  illness: { en: ["You could get sick.", "Patients should stay in."], hi: ["आप बीमार हो सकते हैं।", "मरीज़ घर में रहें।"] },
  symptoms: { en: ["Watch for symptoms."], hi: ["लक्षण पर नज़र रखें।"] },
  discomfort: { en: ["Less eye irritation."], hi: ["आँखों में जलन कम होगी।", "लोगों को तकलीफ़ हो सकती है।"] },
  cancer: { en: ["Linked to cancer."], hi: ["कैंसर से जुड़ा है।"] },
  death: { en: ["This can be fatal."], hi: ["यह जानलेवा हो सकता है।"] },
  "medical-care": { en: ["Ask your doctor."], hi: ["डॉक्टर से पूछें।", "दवाइयाँ साथ रखें।"] },
  treatment: { en: ["It is no cure."], hi: ["यह इलाज नहीं है।"] },
  immunity: { en: ["Helps immunity."], hi: ["इम्युनिटी के लिए अच्छा।"] },
  pregnancy: { en: ["Important in pregnancy."], hi: ["गर्भवती महिलाएँ घर में रहें।"] },
  exposure: { en: ["Cuts your exposure."], hi: ["धुएँ के संपर्क से बचें।"] },
  sensitivity: { en: ["For sensitive people."], hi: ["संवेदनशील लोग घर में रहें।"] },
  safety: { en: ["It is safe to go out.", "For your safety."], hi: ["बाहर जाना सुरक्षित है।", "अपनी सुरक्षा के लिए।"] },
  harm: { en: ["The smoke is harmful."], hi: ["धुआँ नुक़सान करता है।", "ज़हरीला धुआँ।"] },
  risk: { en: ["The air is dangerous."], hi: ["हवा ख़तरनाक है।", "जोखिम ज़्यादा है।"] },
  caution: {
    en: ["Take precautions indoors.", "Be careful today."],
    hi: ["आज घर के अंदर सावधानी बरतें।", "सावधान रहें।", "एहतियात रखें।"],
  },
};

const TIME: Readonly<Record<TimeConcept, Examples>> = {
  now: { en: ["It is high right now.", "The current level."], hi: ["अभी स्तर ऊँचा है।", "अब स्तर ऊँचा है।", "फ़िलहाल ऊँचा है।"] },
  forecast: { en: ["The forecast says so.", "It is expected to drop."], hi: ["पूर्वानुमान के अनुसार।", "घटने की उम्मीद है।"] },
  "last-24-hours": { en: ["Over the last 24 hours.", "The 24-hour AQI."], hi: ["पिछले 24 घंटों में।", "24-घंटे का AQI।"] },
};
const TIME_MATCHER = { now: mentionsNow, forecast: mentionsForecast, "last-24-hours": mentionsLast24Hours } as const;

const NUMBER_WORDS: Examples = {
  en: ["Half the dust.", "Open it for two hours.", "Thousands use it."],
  hi: ["आधी धूल।", "दो घंटे खोलें।", "हज़ारों लोग।", "सौ बार।"],
};

describe("lexicon parity across UI languages", () => {
  it("every concept lists words for every language", () => {
    for (const words of [...Object.values(HEALTH_LEXICON), ...Object.values(TIME_LEXICON), NUMBER_WORD_LEXICON]) {
      for (const l of LOCALES) expect(words[l].length).toBeGreaterThan(0);
    }
  });

  for (const l of LOCALES) {
    it.each(Object.entries(HEALTH))(`${l}: health concept %s is caught`, (_, examples) => {
      for (const sentence of examples[l]) expect(healthConcept(sentence), sentence).not.toBeNull();
    });
    it.each(Object.keys(TIME) as TimeConcept[])(`${l}: time concept %s is caught`, (concept) => {
      for (const sentence of TIME[concept][l]) expect(TIME_MATCHER[concept](sentence), sentence).toBe(true);
    });
    it(`${l}: spelled-out quantities are caught`, () => {
      for (const sentence of NUMBER_WORDS[l]) expect(containsNumberWord(sentence), sentence).toBe(true);
    });
  }
});

describe("lexicon does not fire on ordinary words", () => {
  it.each([
    "दिल्ली में आज सुबह बस से जाएँ।", // Delhi is not "heart"
    "खाना बनाते समय खिड़की खुली रखें।",
    "बंद कमरे में कॉइल न जलाएँ।", // to burn, not a burning sensation
    "इस पर विचार करें और कमरा साफ़ रखें।", // "विचार" is not "चार" (four)
    "सौर चूल्हा भी एक विकल्प है।", // "सौर" (solar) is not "सौ" (hundred)
    "जवाब बदल सकते हैं।", // "जवाब" is not "अब" (now)
    "Wet-mop the floors and run the kitchen fan while cooking.",
  ])("%s", (sentence) => {
    expect(healthConcept(sentence)).toBeNull();
    expect(containsNumberWord(sentence)).toBe(false);
    expect(mentionsNow(sentence)).toBe(false);
  });
});
