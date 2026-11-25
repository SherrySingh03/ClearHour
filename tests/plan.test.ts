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
    for (const n of ["45", "220", "2.6", "12", "4", "5", "8", "30", "11", "2.3", "24"]) expect(allowance.numbers.has(n), n).toBe(true);
    expect(allowance.numbers.has("37")).toBe(false);
    expect(allowance.gaps).toEqual([]);
    expect(JSON.stringify(packet)).not.toContain("Breathing discomfort"); // no health statement is given to the model
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
      headline: "दिल्ली में आज सुबह जल्दी निकलना बेहतर रहेगा।",
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

  it("a re-rounded number fails too (2.3 shown → 2.4 written)", async () => {
    const r = await synthesizePlan(input, fake(withStep(2, "The bus avoids about 2.4 kg of CO₂ a day.")));
    expect(r).toEqual({ ok: false, reason: "unknown-number", detail: "2.4" });
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
    expect(check("PM2.5 stands at 220 µg/m³ today.")).toEqual({ ok: false, reason: "unknown-number", detail: "220 ugm3" });
    expect(check("The bus avoids 45 kg of CO₂.")).toEqual({ ok: false, reason: "unknown-number", detail: "45 kg" });
  });

  it("still accepts numbers used with their own unit", () => {
    expect(check("The latest reading was 45 µg/m³ at the station.").ok).toBe(true);
    expect(check("Taking the bus avoids about 2.3 kg of CO₂ on a working day.").ok).toBe(true);
  });
});

describe("numbers are bound to what they are (timeframe), not just to a unit", () => {
  const { allowance } = buildPlanInput(input);
  const check = (note: string) => validatePlan(withStep(2, note), allowance);
  const forecast = allowance.bindings.filter((b) => b.role === "forecast");

  it("records the role of each measured and predicted number", () => {
    expect(allowance.bindings).toEqual(
      expect.arrayContaining([
        { value: "220", unit: null, role: "aqi-24h" },
        { value: "45", unit: "ugm3", role: "latest-reading" },
      ]),
    );
    expect(forecast.map((b) => b.unit).sort()).toEqual(["pct", "ugm3"]);
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

  it("rejects a forecast number not called a forecast, or mixed with a reading", () => {
    const drop = forecast.find((b) => b.unit === "ugm3")!.value;
    expect(check(`Leaving early means ${drop} µg/m³ less fine dust.`)).toMatchObject({ ok: false, reason: "number-role" });
    expect(check(`The station reading and forecast differ by ${drop} µg/m³.`)).toMatchObject({ ok: false, reason: "number-role" });
    expect(check(`The forecast shows about ${drop} µg/m³ less fine dust early on.`).ok).toBe(true);
  });

  it("Hindi: rejects अभी / वर्तमान with the AQI, accepts 24 घंटे", () => {
    const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
    const hiCheck = (note: string) => validatePlan({ ...withStep(2, note), headline: "दिल्ली में आज सुबह जल्दी निकलें।", steps: [{ kind: "swap", refId: "commute:car-petrol->bus", note }] }, hi);
    expect(hiCheck("दिल्ली का AQI अभी 220 है।")).toMatchObject({ ok: false, reason: "number-role" });
    expect(hiCheck("दिल्ली की वर्तमान वायु गुणवत्ता २२० है।")).toMatchObject({ ok: false, reason: "number-role" });
    expect(hiCheck("पिछले 24 घंटों में दिल्ली का AQI 220 रहा।").ok).toBe(true);
  });

  it("clock times and other units never trip the binding", () => {
    expect(check("Leave at 4:45 am; the bus avoids about 2.3 kg of CO₂ on a working day.").ok).toBe(true);
  });
});
