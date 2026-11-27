import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { containsNumberWord, healthConcept } from "@/lib/plan/lexicon";
import { buildPlanInput } from "@/lib/plan/packet";
import { GUIDANCE, type GuidanceId } from "@/lib/sourced/guidance";
import { input } from "./planFixtures";

/** The condition and hedge words each item must keep in the copy the writer sees. */
const CONDITIONS: Partial<Record<GuidanceId, Readonly<Record<Locale, readonly string[]>>>> = {
  "ventilate-midday": { en: ["On poor-to-severe days", "If necessary, you may"], hi: ["खराब से गंभीर AQI वाले दिनों में", "ज़रूरत हो तो"] },
  "no-coils-incense": { en: ["in closed premises", "when air quality is poor"], hi: ["बंद परिसर में", "हवा खराब हो तो"] },
  "no-angithi": { en: ["during winters", "closed, confined"], hi: ["सर्दियों में", "बंद और तंग जगह"] },
  "wet-mopping": { en: ["inside the home", "If you choose to use"], hi: ["घर के अंदर", "इस्तेमाल करना चाहें तो"] },
  "purifier-run": { en: ["On poor-to-severe days", "may help", "If you use one", "replace and clean"], hi: ["खराब से गंभीर AQI वाले दिनों में", "मददगार हो सकता है", "इस्तेमाल करें तो", "बदलें और साफ़ करें"] },
  "purifier-choose": { en: ["If you are thinking", "to filter particles", "large enough", "works by generating ozone"], hi: ["सोच रहे हैं", "कण छानने के लिए", "काफ़ी बड़ा"] },
  "clean-cooking-fuel": { en: ["Avoid burning biomass", "cooking and heating", "If you use biomass"], hi: ["जलाने से बचें", "घर गर्म करने", "इस्तेमाल करते हैं तो"] },
  "smoky-cooking-timing": { en: ["On poor air days", "if you can"], hi: ["हवा खराब होने वाले दिनों में", "हो सके तो"] },
  "children-elderly-outdoors": { en: ["On poor-to-severe days", "should restrict", "as far as possible"], hi: ["खराब से गंभीर AQI वाले दिनों में", "जहाँ तक हो सके"] },
};

describe.each(LOCALES)("advice as the plan writer sees it (%s)", (l) => {
  it.each(GUIDANCE.map((g) => [g.id, g] as const))("%s: contains nothing the writer may not repeat", (_, g) => {
    const text = (g.writerText ?? g.text)[l];
    expect(healthConcept(text)).toBeNull();
    expect(containsNumberWord(text)).toBe(false);
  });

  it.each(Object.entries(CONDITIONS))("%s: keeps every condition and hedge, as shown on screen too", (id, words) => {
    const item = GUIDANCE.find((g) => g.id === id)!;
    for (const w of words![l]) {
      expect((item.writerText ?? item.text)[l], w).toContain(w);
      expect(item.text[l], w).toContain(w);
    }
  });
});

describe("the packet", () => {
  it("sends the writer's copy, while the page keeps the attributed text", () => {
    const { packet, refs } = buildPlanInput(input);
    const sent = JSON.stringify(packet.guidance);
    expect(sent).not.toMatch(/health ministry|fatal/i);
    expect(sent).toContain("On poor-to-severe days, young children and elderly people should restrict going outdoors as far as possible.");
    expect(refs["children-elderly-outdoors"]).toMatchObject({ kind: "guidance", text: expect.stringContaining("health ministry") });
  });
});

describe("quotes carry the condition the advice states", () => {
  const conditional = GUIDANCE.filter((g) => /poor/i.test(g.text.en));

  it.each(conditional.map((g) => [g.id, g] as const))("%s: at least one verbatim quote says when it applies", (_, g) => {
    expect(g.sources.some((src) => /poor/i.test(src.quote))).toBe(true);
  });
});

describe("advice is no stronger than its source", () => {
  it.each(GUIDANCE.map((g) => [g.id, g] as const))("%s: says \"don't\" only where a quoted source says \"do not\"", (_, g) => {
    if (g.sources.some((s) => /\bdo not\b/i.test(s.quote))) return;
    expect(`${g.text.en} ${g.writerText?.en ?? ""}`).not.toMatch(/\b(don't|do not|never)\b/i);
  });

  it("no quote is cut off mid-clause", () => {
    for (const g of GUIDANCE) for (const s of g.sources) expect(s.quote, g.id).not.toMatch(/…$/);
  });
});
