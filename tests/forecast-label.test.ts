import { describe, expect, it } from "vitest";
import { buildPlanInput } from "@/lib/plan/packet";
import { validatePlan } from "@/lib/plan/validate";
import { input, snapshotNoStation } from "./planFixtures";

// No measured level, so only the label rule applies (the poor-day rule is tested separately).
const base = { ...input, snapshot: snapshotNoStation };
const gaps = ["measured:no-station-in-radius"];
const allowance = (locale: "en" | "hi", departureHour: number) =>
  buildPlanInput({ ...base, locale, profile: { ...base.profile, commute: { ...base.profile.commute, departureHour } } }).allowance;
const run = (locale: "en" | "hi", headline: string, note: string, departureHour = 9) =>
  validatePlan({ headline, steps: [{ kind: "window", refId: "window", note }], acknowledgedGaps: gaps }, allowance(locale, departureHour));
const rejected = { ok: false, reason: "forecast-unlabelled" };

const TODAY = { en: "Today.", hi: "आज की योजना।" } as const;
const LABEL = { en: "The forecast has a cleaner stretch.", hi: "पूर्वानुमान देखें।" } as const;

describe("departure exemption: the exact time, and only when it is the sentence's sole time", () => {
  it.each([
    ["en", 9, "You usually leave at 9:00 am."],
    ["en", 9, "You usually leave at 9 a.m."],
    ["en", 17, "Your usual departure is 5:00 pm."],
    ["hi", 8, "आपका आम तौर पर निकलने का समय सुबह 8:00 है।"],
    ["hi", 8, "आप सुबह 8 बजे निकलते हैं।"],
    ["hi", 17, "आप शाम 5:00 बजे निकलते हैं।"],
  ] as const)("%s, %d:00: accepts %s", (l, hour, sentence) => {
    expect(run(l, TODAY[l], `${LABEL[l]} ${sentence}`, hour).ok).toBe(true);
  });

  it.each([
    ["en", 9, "Go out at 9 pm."],
    ["en", 17, "Go out at 5 am."],
    ["en", 9, "Skip 9 am and 9 pm."],
    ["en", 9, "You leave at 9 am, so the evening works."],
    ["en", 9, "9 am or 9 am."],
    ["hi", 8, "आप रात 8:00 बजे निकलें।"],
    ["hi", 8, "आप सुबह 8:00 बजे निकलते हैं, शाम बेहतर है।"],
  ] as const)("%s, %d:00: rejects %s", (l, hour, sentence) => {
    expect(run(l, TODAY[l], `${LABEL[l]} ${sentence}`, hour).ok).toBe(false);
  });
});

describe("a.m./p.m. never joins two sentences", () => {
  it.each([
    ["en", "The forecast holds until 8:30 a.m. 5:30 am is cleaner."],
    ["en", "The forecast holds until 8:30 p.m. Go in the evening."],
    ["en", "The forecast holds until 8:30 a. m. leave in the morning."],
    ["hi", "पूर्वानुमान 8:30 a.m. शाम को बाहर जाएँ।"],
  ] as const)("%s: %s", (l, note) => expect(run(l, TODAY[l], note)).toEqual(rejected));
});

describe("the label is in the plan's own language", () => {
  it("English 'forecast' does not label a Hindi plan", () => {
    expect(run("hi", TODAY.hi, "forecast के अनुसार सबसे साफ़ समय 5:30–8:30 है, उसी समय बाहर के काम रखें।")).toEqual(rejected);
  });

  it("पूर्वानुमान does not label an English plan", () => {
    const long = "Cleanest time to be outside today is around 5:30 – 8:30 am, so plan errands and the school run around it, and keep everything else for another part of your day if you can manage that: पूर्वानुमान.";
    expect(run("en", "A day of errands, school runs, cooking and cleaning at home, planned around what is on this page.", long)).toEqual(rejected);
  });
});

const DAY_WORDS = {
  en: ["A clean dawn.", "Cleaner around sunrise.", "Mornings are cleaner.", "Poor evenings today.", "Clean in the early hours.", "Poor overnight.", "Hazy at dusk.", "Nights are poor.", "Clear by sunset.", "Better at daybreak."],
  hi: ["भोर में हवा साफ़ है।", "रातें खराब रहेंगी।", "सायंकाल हवा खराब है।", "सुबहें साफ़ हैं।", "शामें खराब हैं।", "प्रातःकाल हवा साफ़ है।", "सूर्योदय पर हवा साफ़ है।", "साँझ को हवा खराब है।", "रात्रि में हवा खराब है।"],
} as const;

describe.each(["en", "hi"] as const)("every part-of-day word needs the label (%s)", (l) => {
  it.each(DAY_WORDS[l])("headline %s", (headline) => {
    expect(run(l, headline, LABEL[l])).toEqual(rejected);
  });
});

it("ordinary words that merely contain one are left alone", () => {
  expect(run("hi", "आज की योजना में रसोई शामिल है।", LABEL.hi).ok).toBe(true);
});
