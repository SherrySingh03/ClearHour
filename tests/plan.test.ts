import { describe, expect, it } from "vitest";
import { buildPlanInput } from "@/lib/plan/packet";
import { synthesizePlan, type PlanModel } from "@/lib/plan/synthesize";
import { validatePlan } from "@/lib/plan/validate";

import { input, snapshotNoStation, snapshotWithStation, validPlan } from "./planFixtures";

const fake = (out: unknown): PlanModel => async () => (typeof out === "string" ? out : JSON.stringify(out));
const withStep = (i: number, note: string) => ({ ...validPlan, steps: validPlan.steps.map((s, k) => (k === i ? { ...s, note } : s)) });

describe("plan packet", () => {
  it("collects every number the page shows, and nothing for the model to invent", () => {
    const { allowance, packet } = buildPlanInput(input);
    for (const token of ["ugm3:45", "bare:220", "km:2.6", "km:12", "time:5:30", "time:8:30", "time:9", "hours:24", "hours:3"])
      expect(allowance.tokens.has(token), token).toBe(true);
    expect(allowance.known.has("37")).toBe(false);
    expect(allowance.gaps).toEqual([]);
    expect(JSON.stringify(packet)).not.toContain("Breathing discomfort"); // no health statement is given to the model
  });

  it("never gives the model a saving or a forecast difference to quote", () => {
    const { allowance, packet } = buildPlanInput(input);
    const sent = JSON.stringify(packet);
    expect(sent).not.toMatch(/kg|%|saving|less CO/i);
    const of = (kind: string) => [...allowance.tokens].filter((x) => x.startsWith(`${kind}:`));
    expect(of("kg")).toEqual([]);
    expect(of("pct")).toEqual([]);
    // The only concentration it may quote is the latest reading, and the only unitless number the AQI.
    expect(of("ugm3")).toEqual(["ugm3:45"]);
    expect(of("bare")).toEqual(["bare:220"]);
  });

  it("records missing grounding data as gaps the plan must acknowledge", () => {
    const { allowance, packet } = buildPlanInput({ ...input, snapshot: snapshotNoStation });
    expect(allowance.gaps).toEqual(["measured:no-station-in-radius"]);
    expect(packet.measured).toEqual({ available: false, gap: "measured:no-station-in-radius" });
  });
});

describe("validator accepts a grounded plan", () => {
  it("passes, and returns only the refs the plan uses", async () => {
    const r = await synthesizePlan(input, fake(validPlan));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.data.refs).sort()).toEqual(["commute:car-petrol->bus", "ventilate-midday", "window"]);
      expect(r.data.refs["commute:car-petrol->bus"]).toMatchObject({ kind: "swap", factors: [{ factorId: "car-petrol", citation: "ighgp-road-2015" }, { factorId: "bus-intracity" }] });
    }
  });

  it("allows pollutant names with digits (PM2.5, CO₂) and Hindi city names", async () => {
    const hiPlan = {
      headline: "दिल्ली में आज जल्दी निकलना बेहतर रहेगा।",
      steps: [{ kind: "window", refId: "window", note: "पूर्वानुमान के अनुसार PM2.5 सुबह कम रहेगा, इसलिए जल्दी निकलें।" }],
      acknowledgedGaps: [],
    };
    expect((await synthesizePlan({ ...input, locale: "hi" }, fake(hiPlan))).ok).toBe(true);
  });
});

describe("validator rejects the WHOLE plan", () => {
  it("an injected out-of-input number fails the whole plan", async () => {
    const r = await synthesizePlan(input, fake(withStep(0, "The forecast is about 37 µg/m³ lower early on.")));
    expect(r).toEqual({ ok: false, reason: "unknown-number", detail: "37" });
  });

  it("a re-rounded number fails too (45 shown → 46 written)", async () => {
    const r = await synthesizePlan(input, fake(withStep(1, "The latest reading was 46 µg/m³.")));
    expect(r).toEqual({ ok: false, reason: "unknown-number", detail: "46" });
  });

  it.each([
    "Taking the bus saves 0.4 kg less CO₂ per working day.",
    "Taking the bus avoids about 2.3 kg of CO₂.",
    "Piped gas gives 11% less CO₂.",
    "The forecast shows 69 µg/m³ more fine dust later.",
  ])("rejects any amount of saving or difference, right or reversed: %s", async (note) => {
    // "unknown-number" if the value is nowhere in the input, "number-role" if it is there as something else (11 of "11:30").
    const r = await synthesizePlan(input, fake(withStep(2, note)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["unknown-number", "number-role"]).toContain(r.reason);
  });

  it("an injected health claim fails the whole plan (English)", async () => {
    const r = await synthesizePlan(input, fake(withStep(1, "Keep windows shut so the smog doesn't trigger asthma.")));
    expect(r).toMatchObject({ ok: false, reason: "health-claim" });
  });

  it("an injected health claim fails the whole plan (Hindi)", async () => {
    const hi = { headline: "आज सुबह जल्दी निकलें।", steps: [{ kind: "window", refId: "window", note: "सुबह हवा बेहतर है, फेफड़ों के लिए अच्छा रहेगा।" }], acknowledgedGaps: [] };
    expect(await synthesizePlan({ ...input, locale: "hi" }, fake(hi))).toMatchObject({ ok: false, reason: "health-claim" });
  });

  it.each([
    ["safety claim", "It is safe to go out in the afternoon."],
    ["exposure claim", "This reduces your exposure on the way to work."],
    ["medical advice", "See a doctor if you feel unwell."],
  ])("rejects a %s", async (_, note) => {
    expect(await synthesizePlan(input, fake(withStep(1, note)))).toMatchObject({ ok: false, reason: "health-claim" });
  });

  it("rejects spelled-out quantities", async () => {
    expect(await synthesizePlan(input, fake(withStep(2, "The bus roughly halves nothing but cuts CO₂ by half.")))).toMatchObject({ ok: false, reason: "number-word" });
  });

  it("rejects a reference to an item that wasn't in the input", async () => {
    const bad = { ...validPlan, steps: [...validPlan.steps, { kind: "guidance", refId: "buy-oxygen-cans", note: "Do this." }] };
    expect(await synthesizePlan(input, fake(bad))).toMatchObject({ ok: false, reason: "unknown-ref" });
  });

  it("rejects a repeated reference", async () => {
    const bad = { ...validPlan, steps: [validPlan.steps[0], validPlan.steps[0]] };
    expect(await synthesizePlan(input, fake(bad))).toMatchObject({ ok: false, reason: "duplicate-ref" });
  });

  it("rejects a window step when no forecast window was given", async () => {
    const noForecast = { ...snapshotWithStation, forecast: { ok: false as const, reason: "open-meteo-unavailable" as const } };
    const r = await synthesizePlan({ ...input, snapshot: noForecast }, fake({ ...validPlan, acknowledgedGaps: ["forecast:open-meteo-unavailable"] }));
    expect(r).toMatchObject({ ok: false, reason: "window-unavailable" });
  });

  it("rejects a plan that doesn't acknowledge missing measured data", async () => {
    const plan = { ...validPlan, steps: validPlan.steps.slice(0, 1) };
    expect(await synthesizePlan({ ...input, snapshot: snapshotNoStation }, fake(plan))).toMatchObject({ ok: false, reason: "gaps-mismatch" });
    expect((await synthesizePlan({ ...input, snapshot: snapshotNoStation }, fake({ ...plan, acknowledgedGaps: ["measured:no-station-in-radius"] }))).ok).toBe(true);
  });

  it("rejects the wrong language", async () => {
    expect(await synthesizePlan({ ...input, locale: "hi" }, fake(validPlan))).toMatchObject({ ok: false, reason: "wrong-language" });
  });

  it("rejects links", async () => {
    expect(await synthesizePlan(input, fake(withStep(1, "Read more at https://example.com today.")))).toMatchObject({ ok: false, reason: "link" });
  });

  it("rejects malformed output, invalid JSON and model failures", async () => {
    expect(await synthesizePlan(input, fake({ headline: "x" }))).toMatchObject({ ok: false, reason: "schema" });
    expect(await synthesizePlan(input, fake("not json {"))).toMatchObject({ ok: false, reason: "invalid-json" });
    expect(
      await synthesizePlan(input, async () => {
        throw new Error("upstream 503: secret detail");
      }),
    ).toEqual({ ok: false, reason: "model-error" });
  });

  it("validatePlan never returns a partial plan: one bad step out of three fails everything", () => {
    const { allowance } = buildPlanInput(input);
    const r = validatePlan(withStep(2, "Cuts emissions by 99 percent."), allowance);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("data");
  });
});

describe("number gate cannot be bypassed", () => {
  const { allowance } = buildPlanInput(input);
  const check = (note: string) => validatePlan(withStep(2, note), allowance);

  it("rejects digits from other scripts (Bengali ৩৭) instead of ignoring them", () => {
    expect(check("এটি ৩৭ কম")).toMatchObject({ ok: false });
    expect(check("The bus saves ৩৭ today.")).toMatchObject({ ok: false, reason: "unknown-number" });
  });

  it("normalises fullwidth digits, then checks them like any number", () => {
    expect(check("The bus saves about ３７ today.")).toEqual({ ok: false, reason: "unknown-number", detail: "37" });
  });

  it("rejects superscripts and vulgar fractions", () => {
    expect(check("The bus cuts it by ²⁵ today.")).toMatchObject({ ok: false, reason: "unknown-number" });
    expect(check("The bus cuts it by ½ today.")).toMatchObject({ ok: false, reason: "unknown-number" });
  });

  it("rejects a real input number reused with the wrong unit (AQI 220 written as a concentration)", () => {
    expect(check("PM2.5 stands at 220 µg/m³ today.")).toEqual({ ok: false, reason: "number-role", detail: "220 as ugm3" });
    expect(check("The bus avoids 45 kg of CO₂.")).toEqual({ ok: false, reason: "number-role", detail: "45 as kg" });
  });

  it("still accepts numbers used with their own unit", () => {
    expect(check("The latest reading was 45 µg/m³ at the station.").ok).toBe(true);
  });
});

describe("numbers are bound to what they are (timeframe), not just to a unit", () => {
  const { allowance } = buildPlanInput(input);
  const check = (note: string) => validatePlan(withStep(2, note), allowance);

  it("records the role of each measured number", () => {
    expect(allowance.bindings).toEqual([
      { value: "45", unit: "ugm3", role: "latest-reading" },
      { value: "220", unit: null, role: "aqi-24h" },
    ]);
  });

  it("rejects the 24-hour AQI described as current air quality", () => {
    expect(check("Delhi's current air quality is at 220, so stay in.")).toMatchObject({ ok: false, reason: "number-role" });
    expect(check("The AQI is 220 right now.")).toMatchObject({ ok: false, reason: "number-role" });
    // No timeframe at all is also a mismatch: 220 is a 24-hour value.
    expect(check("Delhi's AQI is 220.")).toMatchObject({ ok: false, reason: "number-role" });
  });

  it("accepts the AQI when the sentence says it is a 24-hour value", () => {
    expect(check("Delhi's 24-hour AQI is 220.").ok).toBe(true);
    expect(check("Over the last 24 hours the AQI was 220, which CPCB calls Poor.").ok).toBe(true);
  });

  it("binds per sentence: a 24-hour phrase in another sentence does not cover it", () => {
    expect(check("The window is over 24 hours old. The AQI is 220.")).toMatchObject({ ok: false, reason: "number-role" });
  });

  it("rejects the latest reading presented as 'now' or as a forecast", () => {
    expect(check("PM2.5 is 45 µg/m³ now.")).toMatchObject({ ok: false, reason: "number-role" });
    expect(check("The forecast says 45 µg/m³ in the morning.")).toMatchObject({ ok: false, reason: "number-role" });
  });

  it("Hindi: rejects अभी / वर्तमान with the AQI, accepts 24 घंटे", () => {
    const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
    const hiCheck = (note: string) => validatePlan({ ...withStep(2, note), headline: "दिल्ली में आज जल्दी निकलें।", steps: [{ kind: "swap", refId: "commute:car-petrol->bus", note }] }, hi);
    expect(hiCheck("दिल्ली का AQI अभी 220 है।")).toMatchObject({ ok: false, reason: "number-role" });
    expect(hiCheck("दिल्ली की वर्तमान वायु गुणवत्ता २२० है।")).toMatchObject({ ok: false, reason: "number-role" });
    expect(hiCheck("पिछले 24 घंटों में दिल्ली का AQI 220 रहा।").ok).toBe(true);
  });

  it("clock times and other units never trip the binding", () => {
    expect(check("Leave at 5:30 am and take the bus on your 12 km commute.").ok).toBe(true);
  });
});

describe("a number keeps the kind it had in the input", () => {
  const { allowance } = buildPlanInput(input);
  const check = (note: string, a = allowance) => validatePlan(withStep(2, note), a);

  it("the fabricated threshold: the 30 of '8:30' cannot become a limit", () => {
    expect(check("Keep fine dust under 30 today.")).toEqual({ ok: false, reason: "number-role", detail: "30 as bare" });
    expect(check("Keep fine dust under 30 µg/m³ today.")).toEqual({ ok: false, reason: "number-role", detail: "30 as ugm3" });
    expect(check("आज बारीक धूल 30 से नीचे रखें।", buildPlanInput({ ...input, locale: "hi" }).allowance)).toMatchObject({ ok: false, reason: "number-role" });
  });

  it("the mirror: the same times written as times still pass", () => {
    expect(check("Leave around 5:30 am, before your usual 9 am start.").ok).toBe(true);
    expect(check("If you air the room, do it between 12 and 4 pm.").ok).toBe(true);
  });

  it("the other mirror: a measurement cannot become a time", () => {
    expect(check("Leave at 45 pm.")).toEqual({ ok: false, reason: "number-role", detail: "45 as time" });
    expect(check("Leave at 8:45.")).toMatchObject({ ok: false, reason: "unknown-number" });
  });

  it.each([
    ["a distance as a limit", "The limit is 12 for fine dust."],
    ["a station distance as a level", "Dust above 2.6 matters."],
    ["a duration as a limit", "Stay below 24 today."],
    ["a reading without its unit", "The latest reading was 45."],
    ["a time as a distance", "Walk 30 km."],
  ])("rejects %s", (_, note) => {
    expect(check(note)).toMatchObject({ ok: false, reason: "number-role" });
  });

  it("keeps the legitimate forms: reading with unit, AQI as a 24-hour value, the commute distance", () => {
    expect(check("The latest reading was 45 µg/m³ at the station.").ok).toBe(true);
    expect(check("The 24-hour AQI was 220.").ok).toBe(true);
    expect(check("Your 12 km commute can be done by bus.").ok).toBe(true);
  });

  it("ignores digits that belong to the station's name, and nothing else", () => {
    const station = snapshotWithStation.coverage;
    if (station.status !== "station") throw new Error("fixture");
    const named = buildPlanInput({ ...input, snapshot: { ...snapshotWithStation, coverage: { ...station, station: { ...station.station, name: "Sector 62, Noida" } } } }).allowance;
    expect(check("The Sector 62, Noida station reported it.", named).ok).toBe(true);
    expect(check("Keep it under 62.", named)).toMatchObject({ ok: false });
  });

  it("rejection details carry no model text", () => {
    expect(check("Keep windows shut so asthma stays away.")).toEqual({ ok: false, reason: "health-claim", detail: "asthma" });
    expect(check("Open the windows twice.")).toEqual({ ok: false, reason: "number-word" });
  });
});

describe("no third script", () => {
  const { allowance } = buildPlanInput(input);
  const check = (note: string, a = allowance) => validatePlan(withStep(2, note), a);

  it.each([
    ["Japanese mid-sentence (seen live)", "Keep outside doors and windows shut inことがあります."],
    ["Chinese", "Take the bus 巴士 on your commute."],
    ["Cyrillic look-alike", "Take the bus on your соmmute."],
    ["Greek", "Take the bus, αlways."],
    ["Bengali", "Take the bus বাস today."],
  ])("rejects %s", (_, note) => {
    expect(check(note)).toEqual({ ok: false, reason: "wrong-language" });
  });

  it("rejects it in a Hindi plan too", () => {
    const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
    const plan = { headline: "आज की योजना।", steps: [{ kind: "swap", refId: "commute:car-petrol->bus", note: "बस से जाएँ ことがあります।" }], acknowledgedGaps: [] };
    expect(validatePlan(plan, hi)).toEqual({ ok: false, reason: "wrong-language" });
  });

  it("still allows µg/m³, CO₂ and accented Latin", () => {
    expect(check("The latest reading was 45 µg/m³ at the café; the bus lowers CO₂.").ok).toBe(true);
    expect(check("The latest reading was 45 μg/m3 at the station.").ok).toBe(true);
  });
});

describe("a forecast time in the plan says it is a forecast", () => {
  const { allowance } = buildPlanInput(input);
  const windowNote = (note: string) => validatePlan(withStep(0, note), allowance);

  it("rejects an unlabelled best-time step (seen live)", () => {
    expect(windowNote("Cleanest time to be outside today: around 5:30 – 8:30 am. Your usual departure is 9:00 am.")).toEqual({ ok: false, reason: "forecast-unlabelled" });
  });

  it.each(["The forecast shows the cleanest time is around 5:30 – 8:30 am.", "Predicted cleanest time: 5:30 – 8:30 am."])("accepts: %s", (note) => {
    expect(windowNote(note).ok).toBe(true);
  });

  it("rejects an unlabelled best-time step in Hindi, and accepts a labelled one", () => {
    const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
    const plan = (note: string) => ({ headline: "आज की योजना।", steps: [{ kind: "window", refId: "window", note }], acknowledgedGaps: [] });
    expect(validatePlan(plan("आज बाहर रहने का सबसे साफ़ समय 5:30–8:30 है।"), hi)).toEqual({ ok: false, reason: "forecast-unlabelled" });
    expect(validatePlan(plan("पूर्वानुमान के अनुसार सबसे साफ़ समय 5:30–8:30 है।"), hi).ok).toBe(true);
  });

  it("also applies to a headline that quotes a time, but not to a guidance step's own hours", () => {
    expect(validatePlan({ ...validPlan, headline: "Go out around 5:30 am today." }, allowance)).toEqual({ ok: false, reason: "forecast-unlabelled" });
    expect(validatePlan(withStep(1, "If necessary, you may air the house between 12 and 4 pm."), allowance).ok).toBe(true);
  });

  it("never gives the writer the best stretch's category", () => {
    const { packet } = buildPlanInput(input);
    expect(JSON.stringify(packet.forecast)).not.toMatch(/instead of/);
  });
});

describe("forecast label: narrow words, same sentence, headline and best-time step only", () => {
  const { allowance } = buildPlanInput(input); // usual departure 9:00
  const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
  const windowNote = (note: string, a = allowance) => validatePlan(withStep(0, note), a);
  const headline = (h: string) => validatePlan({ ...validPlan, headline: h }, allowance);
  const hiPlan = (note: string, h = "आज की योजना।") => validatePlan({ headline: h, steps: [{ kind: "window", refId: "window", note }], acknowledgedGaps: [] }, hi);
  const rejected = { ok: false, reason: "forecast-unlabelled" };

  it.each([
    ["'expected' is not a label", "The cleanest time is expected around 5:30 – 8:30 am."],
    ["'model' is not a label", "The model points to 5:30 – 8:30 am."],
    ["the label sits in another sentence", "The forecast looks poor later. Leave at 5:30 am."],
    ["a part of the day without it", "The forecast is in. Go out in the evening."],
    ["no label at all", "Cleanest time to be outside today: around 5:30 – 8:30 am."],
    ["a departure sentence cannot carry a second, forecast time", "The forecast helps. Your usual departure is 9:00 am, but 5:30 am is cleaner."],
  ])("window step: rejects when %s", (_, note) => expect(windowNote(note)).toEqual(rejected));

  it.each([
    "The forecast shows the cleanest time is around 5:30 – 8:30 am.",
    "Predicted cleanest time: 5:30 – 8:30 a.m. in the morning.",
    "The forecast shows 5:30 – 8:30 am as cleanest. Your usual departure is 9:00 am.",
    "The forecast shows 5:30 – 8:30 am as cleanest. You usually leave at 9 a.m. Plan around it.",
  ])("window step: accepts %s", (note) => expect(windowNote(note).ok).toBe(true));

  it.each(["A Poor day, then a very poor evening.", "Go out around 5:30 am today.", "A forecast day. A clean morning."])("headline: rejects %s", (h) =>
    expect(headline(h)).toEqual(rejected),
  );

  it.each(["A Poor day with a very poor evening forecast.", "A Poor day.", "The forecast has a cleaner stretch around 5:30 – 8:30 am."])("headline: accepts %s", (h) =>
    expect(headline(h).ok).toBe(true),
  );

  it("leaves cited advice steps alone", () => {
    expect(validatePlan(withStep(1, "Keep outside doors and windows shut in the morning and late evening."), allowance).ok).toBe(true);
  });

  it("Hindi: only पूर्वानुमान counts", () => {
    expect(hiPlan("सबसे साफ़ समय 5:30–8:30 का अनुमान है।")).toEqual(rejected);
    expect(hiPlan("सुबह साफ़ रहने की उम्मीद है।")).toEqual(rejected);
    expect(hiPlan("पूर्वानुमान के अनुसार सबसे साफ़ समय सुबह 5:30–8:30 है। आप आमतौर पर सुबह 9:00 बजे निकलते हैं।").ok).toBe(true);
    expect(hiPlan("पूर्वानुमान के अनुसार सुबह साफ़ रहेगी।", "आज शाम हवा खराब रहेगी।")).toEqual(rejected);
    expect(hiPlan("पूर्वानुमान के अनुसार सुबह साफ़ रहेगी।", "शाम का पूर्वानुमान बहुत खराब है।").ok).toBe(true);
  });

  it("does not mistake शामिल (include) for शाम (evening)", () => {
    expect(hiPlan("पूर्वानुमान देखें।", "आज की योजना में रसोई शामिल है।").ok).toBe(true);
  });
});
