/**
 * Indoor guidance. Every item is a published recommendation, quoted from its
 * source (`quote`) with a page locator, and restated in plain language
 * (`text`). The restatement keeps the action and adds no health claim the
 * source doesn't make.
 *
 * Hindi `text` is Clearhour's translation of the cited English source,
 * not an official translation.
 */

import type { CitationId } from "../grounding/citations";
import type { Locale } from "../i18n/locales";
import type { GroundingSnapshot, NaqiCategory } from "../grounding/types";
import { categoryRank } from "../grounding/aqi/cpcb";
import type { CookingFuel, HouseholdProfile } from "../profile/types";

/** One entry per UI language; the compiler flags any language that is missing. */
export type Localized = Readonly<Record<Locale, string>>;

export interface GuidanceSource {
  readonly citation: CitationId;
  readonly locator: string;
  readonly quote: string;
}

/**
 * "poor-or-worse" matches the sources' own trigger: MoHFW's advice is for
 * "days with poor to severe AQI" (AQI > 200), i.e. CPCB category Poor or worse.
 */
export type GuidanceTrigger = "always" | "poor-or-worse";

export interface GuidanceItem {
  readonly id: GuidanceId;
  readonly trigger: GuidanceTrigger;
  readonly requires?: {
    readonly purifier?: boolean;
    readonly childrenOrElderly?: true;
    readonly cookingFuel?: readonly CookingFuel[];
  };
  readonly text: Localized;
  /**
   * The same advice as given to the plan writer, where `text` carries an
   * attribution or a warning the writer may not repeat. Only those clauses are
   * left out: every condition and hedge stays, word for word.
   */
  readonly writerText?: Localized;
  readonly sources: readonly GuidanceSource[];
}

export type GuidanceId =
  | "ventilate-midday"
  | "kitchen-ventilation"
  | "no-coils-incense"
  | "no-angithi"
  | "wet-mopping"
  | "purifier-run"
  | "purifier-choose"
  | "clean-cooking-fuel"
  | "smoky-cooking-timing"
  | "children-elderly-outdoors";

const MOHFW = "mohfw-air-advisory-2025" as const;

export const GUIDANCE: readonly GuidanceItem[] = [
  {
    id: "ventilate-midday",
    trigger: "poor-or-worse",
    text: {
      en: "On poor-to-severe days, keep outside doors and windows shut in the morning and late evening. If necessary, you may air the house between 12 and 4 pm.",
      hi: "खराब से गंभीर AQI वाले दिनों में सुबह और देर शाम बाहर के दरवाज़े और खिड़कियाँ बंद रखें। ज़रूरत हो तो दोपहर 12 से 4 बजे के बीच घर में हवा आने दे सकते हैं।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure I, section I (General Population), item 1, PDF p. 20",
        quote:
          "Do not open external doors and windows during morning and late evening hours, it may ventilate if necessary, between 12 p.m. to 4 p.m. in afternoon (Days with poor to severe AQI)",
      },
      {
        citation: MOHFW,
        locator: "Annexure II (Social Media Messages), item 4(c)–(d), PDF p. 22",
        quote:
          "On days of poor to severe plus air pollution (AQI>200) … avoid opening external doors and windows during morning and late evening hours. … ventilate rooms, if necessary, between 12 p.m. to 4 p.m. in afternoon",
      },
    ],
  },
  {
    id: "kitchen-ventilation",
    trigger: "always",
    text: {
      en: "Ventilate the kitchen while cooking: open a window or door for cross-ventilation, or run the exhaust fan.",
      hi: "खाना बनाते समय रसोई में हवा आने-जाने दें: क्रॉस-वेंटिलेशन के लिए खिड़की या दरवाज़ा खोलें, या एग्ज़ॉस्ट फ़ैन चलाएँ।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure II (Social Media Messages), item 23, PDF p. 23",
        quote:
          "Ensure cooking areas are well ventilated with cross ventilation by opening windows, doors to reduce exposure to household air pollution.",
      },
      {
        citation: MOHFW,
        locator: "Annexure III (household air pollution), 2(ii), PDF p. 25",
        quote: "To ventilate air adequately to reduce smoke properly during cooking (opening windows or doors; use of exhausts fan)",
      },
    ],
  },
  {
    id: "no-coils-incense",
    trigger: "always",
    text: {
      en: "Avoid burning mosquito coils and incense sticks in closed premises, and avoid an indoor havan when air quality is poor.",
      hi: "बंद परिसर में मच्छर भगाने वाली कॉइल और अगरबत्ती जलाने से बचें, और हवा खराब हो तो घर के अंदर हवन करने से बचें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure I, section I (General Population), item 8, PDF p. 20",
        quote: "Avoid burning mosquito coils and incense sticks in closed premises.",
      },
      {
        citation: MOHFW,
        locator: "Annexure III (household air pollution), 3(vi), PDF p. 25",
        quote: "Avoid havan indoor when air quality level is poor",
      },
    ],
  },
  {
    id: "no-angithi",
    trigger: "always",
    text: {
      en: "Avoid burning wood or charcoal in an angithi (brazier) during winters in closed, confined spaces: the advisory warns this may be fatal because of carbon monoxide and built-up CO₂.",
      hi: "सर्दियों में बंद और तंग जगह में अंगीठी में लकड़ी या कोयला जलाने से बचें: सलाह के अनुसार कार्बन मोनोऑक्साइड और जमा हुई CO₂ के कारण यह जानलेवा हो सकता है।",
    },
    writerText: {
      en: "Avoid burning wood or charcoal in an angithi (brazier) during winters in closed, confined spaces.",
      hi: "सर्दियों में बंद और तंग जगह में अंगीठी में लकड़ी या कोयला जलाने से बचें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure I, section I (General Population), item 3, PDF p. 20",
        quote: "Avoid burning of wood/ charcoal in 'Anghiti' during winters, in closed and confined condition which may be fatal due to CO and built-up CO₂",
      },
    ],
  },
  {
    id: "wet-mopping",
    trigger: "always",
    text: {
      en: "Practise wet mopping instead of sweeping or vacuum cleaning inside the home. If you choose to use a vacuum cleaner, use one with a HEPA filter.",
      hi: "घर के अंदर झाड़ू लगाने या वैक्यूम करने के बजाय गीला पोंछा लगाएँ। वैक्यूम क्लीनर इस्तेमाल करना चाहें तो HEPA फ़िल्टर वाला लें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure I, section I (General Population), item 10, PDF p. 20",
        quote:
          "Practice wet mopping instead of sweeping or vacuum cleaning inside homes. If you choose to use vacuum cleaner, use those having High Efficiency Particulate Air (HEPA) filter",
      },
    ],
  },
  {
    id: "purifier-run",
    trigger: "poor-or-worse",
    requires: { purifier: true },
    text: {
      en: "On poor-to-severe days, the health ministry says an air purifier may help. If you use one, follow the maker's guidelines, and replace and clean filters as instructed.",
      hi: "स्वास्थ्य मंत्रालय के अनुसार खराब से गंभीर AQI वाले दिनों में एयर प्यूरीफ़ायर मददगार हो सकता है। इस्तेमाल करें तो निर्माता के निर्देश मानें, और फ़िल्टर बताए अनुसार बदलें और साफ़ करें।",
    },
    writerText: {
      en: "On poor-to-severe days, an air purifier may help. If you use one, follow the maker's guidelines, and replace and clean filters as instructed.",
      hi: "खराब से गंभीर AQI वाले दिनों में एयर प्यूरीफ़ायर मददगार हो सकता है। इस्तेमाल करें तो निर्माता के निर्देश मानें, और फ़िल्टर बताए अनुसार बदलें और साफ़ करें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure II (Social Media Messages), item 15, PDF p. 23",
        quote: "On days of poor to severe plus air pollution (AQI>200) use of air purifiers may be beneficial to reduce the effects of air pollution.",
      },
      {
        citation: MOHFW,
        locator: "Annexure I, section III (Optional choices), item 2, PDF p. 21",
        quote: "If you choose to use air purifier, follow manufacturers' guidelines … Ensure to replace and clean filters as instructed.",
      },
    ],
  },
  {
    id: "purifier-choose",
    trigger: "poor-or-worse",
    requires: { purifier: false },
    text: {
      en: "If you are thinking about an air purifier (the advisory lists it as optional): to filter particles, choose one whose clean air delivery rate (CADR) is large enough for the room or area where you will use it, and avoid one that works by generating ozone.",
      hi: "अगर आप एयर प्यूरीफ़ायर लेने की सोच रहे हैं (सलाह में इसे वैकल्पिक बताया गया है): कण छानने के लिए ऐसा चुनें जिसका क्लीन एयर डिलीवरी रेट (CADR) उस कमरे या जगह के लिए काफ़ी बड़ा हो जहाँ आप उसे चलाएँगे, और ओज़ोन बनाकर काम करने वाले प्यूरीफ़ायर से बचें।",
    },
    sources: [
      {
        citation: "epa-air-cleaners-2018",
        locator: "p. 3 (PDF p. 3)",
        quote:
          "To filter particles, choose a portable air cleaner that has a clean air delivery rate (CADR) that is large enough for the size of the room or area in which you will use it.",
      },
      {
        citation: MOHFW,
        locator: "Annexure I, section III (Optional choices), item 2, PDF p. 21",
        quote: "Avoid using an air purifier that works by generating ozone, as it increases pollution inside rooms.",
      },
    ],
  },
  {
    id: "clean-cooking-fuel",
    trigger: "always",
    requires: { cookingFuel: ["biomass", "kerosene"] },
    text: {
      en: "Avoid burning biomass such as wood, coal, animal dung and kerosene. Use clean smokeless fuels (gas or electricity) for cooking and heating. If you use biomass, use a clean cookstove.",
      hi: "लकड़ी, कोयला, गोबर और मिट्टी का तेल जैसे बायोमास ईंधन जलाने से बचें। खाना पकाने और घर गर्म करने के लिए साफ़, बिना धुएँ वाले ईंधन (गैस या बिजली) इस्तेमाल करें। बायोमास इस्तेमाल करते हैं तो साफ़ चूल्हा इस्तेमाल करें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure I, section I (General Population), item 2, PDF p. 20",
        quote:
          "Avoid burning biomass such as wood, coal, animal dung, kerosene. Use clean smokeless fuels (gas or electricity) for cooking and heating purposes. If using biomass, use clean cook stoves.",
      },
      {
        citation: "who-household-air-2025",
        locator: "Fact sheet, section 'Guidance'",
        quote: "Guidelines for indoor air quality: household fuel combustion, which offer practical evidence-based guidance on what fuels and technologies used in the home can be considered clean, including recommendations discouraging use of kerosene and recommending against use of unprocessed coal",
      },
    ],
  },
  {
    id: "smoky-cooking-timing",
    trigger: "poor-or-worse",
    requires: { cookingFuel: ["biomass", "kerosene"] },
    text: {
      en: "On poor air days, avoid smoky cooking, or move it to another time if you can.",
      hi: "हवा खराब होने वाले दिनों में धुएँ वाला खाना पकाने से बचें, या हो सके तो उसका समय बदल दें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure III (household air pollution), 2(v), PDF p. 25",
        quote: "During poor air quality level, to avoid cooking causing smoke or to shift timing if possible",
      },
    ],
  },
  {
    id: "children-elderly-outdoors",
    trigger: "poor-or-worse",
    requires: { childrenOrElderly: true },
    text: {
      en: "On poor-to-severe days, the health ministry says people at higher risk, such as pregnant women, young children and the elderly, should restrict going outdoors as far as possible.",
      hi: "स्वास्थ्य मंत्रालय के अनुसार खराब से गंभीर AQI वाले दिनों में ज़्यादा जोखिम वाले लोग, जैसे गर्भवती महिलाएँ, छोटे बच्चे और बुज़ुर्ग, जहाँ तक हो सके बाहर कम निकलें।",
    },
    writerText: {
      en: "On poor-to-severe days, young children and elderly people should restrict going outdoors as far as possible.",
      hi: "खराब से गंभीर AQI वाले दिनों में छोटे बच्चे और बुज़ुर्ग जहाँ तक हो सके बाहर कम निकलें।",
    },
    sources: [
      {
        citation: MOHFW,
        locator: "Annexure II (Social Media Messages), item 4 (lead-in) and 4(g), PDF p. 22",
        // The condition is in item 4's lead-in, so the quote must carry it.
        quote:
          "On days of poor to severe plus air pollution (AQI>200) … high risk people like pregnant women, young children and elderly should restrict outdoor movements as far as possible.",
      },
    ],
  },
];

/**
 * What decides whether poor-day items apply. Measured 24-h CPCB category is
 * preferred. A forecast-based category must be labelled as such, and
 * `unknown` keeps the items but marks them conditional ("on poor days…")
 * instead of claiming today is poor.
 */
export type CategorySignal =
  | { readonly basis: "measured-24h"; readonly category: NaqiCategory }
  | { readonly basis: "forecast-indicative"; readonly category: NaqiCategory }
  | { readonly basis: "unknown" };

/** Today's signal comes from the measured 24-hour sub-index only; otherwise unknown. */
export function categorySignal(snapshot: GroundingSnapshot): CategorySignal {
  if (snapshot.measured.ok && snapshot.measured.data.naqi24h.pm25.ok) {
    return { basis: "measured-24h", category: snapshot.measured.data.naqi24h.pm25.data.category };
  }
  return { basis: "unknown" };
}

export interface SelectedGuidance {
  readonly item: GuidanceItem;
  /** null = applies regardless of today's air; otherwise the signal that triggered it. */
  readonly triggeredBy: CategorySignal | null;
}

const POOR_RANK = categoryRank("poor");

export function selectGuidance(profile: HouseholdProfile, signal: CategorySignal): SelectedGuidance[] {
  const out: SelectedGuidance[] = [];
  for (const item of GUIDANCE) {
    const r = item.requires;
    if (r?.purifier !== undefined && r.purifier !== profile.hasAirPurifier) continue;
    if (r?.childrenOrElderly && !profile.hasChildrenOrElderly) continue;
    if (r?.cookingFuel && !r.cookingFuel.includes(profile.cookingFuel)) continue;

    if (item.trigger === "always") {
      out.push({ item, triggeredBy: null });
      continue;
    }
    // poor-or-worse
    if (signal.basis === "unknown") out.push({ item, triggeredBy: signal });
    else if (categoryRank(signal.category) >= POOR_RANK) out.push({ item, triggeredBy: signal });
  }
  return out;
}
