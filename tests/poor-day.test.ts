import { describe, expect, it } from "vitest";
import { getFormatters, getUiStrings, LOCALES } from "@/lib/i18n";
import { NAQI_CATEGORY_ORDER } from "@/lib/grounding/aqi/cpcb";
import { healthConcept } from "@/lib/plan/lexicon";
import { buildPlanInput } from "@/lib/plan/packet";
import { synthesizePlan } from "@/lib/plan/synthesize";
import { validatePlan } from "@/lib/plan/validate";
import { bestWindow } from "@/lib/plan/window";
import { isPoorOrWorse, POOR_DAY_OUTDOOR_ADVICE } from "@/lib/sourced/guidance";
import { describeWindow } from "@/lib/view/describe";
import { input, NOW, snapshotNoStation, snapshotWithStation, validPlan } from "./planFixtures";

const forecast = snapshotWithStation.forecast.ok ? snapshotWithStation.forecast.data : null;

it("applies to Poor, Very poor and Severe, and not to an unknown level", () => {
  for (const category of NAQI_CATEGORY_ORDER) {
    expect(isPoorOrWorse({ basis: "measured-24h", category })).toBe(["poor", "very-poor", "severe"].includes(category));
  }
  expect(isPoorOrWorse({ basis: "unknown" })).toBe(false);
});

it("quotes the advisory line verbatim", () => {
  expect(POOR_DAY_OUTDOOR_ADVICE.quote).toBe("Reschedule outdoor activities as per AQI, and remain indoors on days with poor to severe AQI.");
});

describe.each(LOCALES)("best-time headline (%s)", (l) => {
  const t = getUiStrings(l);
  const f = getFormatters(l);

  it.each([
    ["a clear best stretch", undefined],
    ["a stretch cleaner than the departure", 9],
  ])("on a poor day, %s is offered only to someone who must go out", (_, departureHour) => {
    const r = bestWindow({ forecast: forecast!, now: NOW, ...(departureHour === undefined ? {} : { departureHour }) });
    expect(["clear-best", "cleaner-than-routine"]).toContain(r.verdict);
    const poor = describeWindow(r, t, f, true).headline;
    expect(poor.startsWith(t.window.goOutCondition)).toBe(true);
    expect(describeWindow(r, t, f, false).headline).not.toContain(t.window.goOutCondition);
  });

  it("the writer is given the same wording and the condition", () => {
    const { packet, poorDay } = buildPlanInput({ ...input, locale: l });
    expect(poorDay).toBe(true);
    expect(packet.forecast).toMatchObject({ goOutCondition: t.window.goOutCondition, statement: expect.stringContaining(t.window.goOutCondition) });
    expect(JSON.stringify(packet.forecast)).not.toContain("Cleanest time to be outside");
    expect(buildPlanInput({ ...input, locale: l, snapshot: snapshotNoStation }).packet.forecast).not.toHaveProperty("goOutCondition");
  });
});

describe.each(LOCALES)("what the writer is told about the window (%s)", (l) => {
  const flat = { ...snapshotWithStation, forecast: { ok: true as const, data: { ...forecast!, points: forecast!.points.map((p) => ({ ...p, pm25: 150 as number })) } } } as typeof snapshotWithStation;

  it("attaches no go-out condition when no time is named", () => {
    const { packet } = buildPlanInput({ ...input, locale: l, profile: { ...input.profile, commute: { mode: "bus", oneWayKm: 5 } }, snapshot: flat });
    expect(packet.forecast).toMatchObject({ verdict: "no-clear-best" });
    expect(packet.forecast).not.toHaveProperty("goOutCondition");
  });

  it.each([
    ["a flat day", flat],
    ["a day with a best stretch", snapshotWithStation],
  ])("%s: contains no word the plan may not repeat", (_, snapshot) => {
    const { packet } = buildPlanInput({ ...input, locale: l, snapshot });
    expect(healthConcept(JSON.stringify(packet.forecast))).toBeNull();
  });
});

describe("plan on a poor day", () => {
  const { allowance } = buildPlanInput(input);
  const withWindow = (note: string, headline = "A Poor day.") => validatePlan({ ...validPlan, headline, steps: [{ kind: "window", refId: "window", note }] }, allowance);

  it("rejects a time offered as a time to be outside", () => {
    expect(withWindow("The forecast shows the cleanest time to be outside is 5:30 – 8:30 am.")).toEqual({ ok: false, reason: "poor-day-unqualified", detail: "window" });
  });

  it.each([
    "If you need to go out, the forecast shows the least polluted time is around 5:30 – 8:30 am.",
    "The forecast: if you have to go outside, 5:30 – 8:30 am is least polluted.",
    "The forecast shows no clear best stretch.",
  ])("accepts: %s", (note) => expect(withWindow(note).ok).toBe(true));

  it("does not ask for the condition when the only time is the household's own departure", () => {
    expect(withWindow("The forecast shows no clear best stretch. Your usual departure is 9:00 am.").ok).toBe(true);
    // A second time is still a time being offered.
    expect(withWindow("The forecast shows 5:30 – 8:30 am. Your usual departure is 9:00 am.")).toMatchObject({ ok: false, reason: "poor-day-unqualified" });
  });

  it("rejects a time in the headline", () => {
    expect(withWindow("The forecast shows no clear best stretch.", "Forecast: cleaner around 5:30 am.")).toEqual({ ok: false, reason: "poor-day-unqualified", detail: "headline" });
  });

  it("Hindi: needs अगर बाहर जाना ज़रूरी हो", () => {
    const hi = buildPlanInput({ ...input, locale: "hi" }).allowance;
    const plan = (note: string) => validatePlan({ headline: "आज का स्तर खराब है।", steps: [{ kind: "window", refId: "window", note }], acknowledgedGaps: [] }, hi);
    expect(plan("पूर्वानुमान के अनुसार बाहर रहने का सबसे साफ़ समय 5:30–8:30 है।")).toMatchObject({ ok: false, reason: "poor-day-unqualified" });
    expect(plan("अगर बाहर जाना ज़रूरी हो, तो पूर्वानुमान के अनुसार सबसे कम प्रदूषित समय 5:30–8:30 है।").ok).toBe(true);
  });

  it("records that it was written for a poor day", async () => {
    const plan = { ...validPlan, headline: "A Poor day.", steps: [{ kind: "window", refId: "window", note: "If you need to go out, the forecast shows 5:30 – 8:30 am as least polluted." }] };
    const r = await synthesizePlan(input, async () => JSON.stringify(plan));
    expect(r).toMatchObject({ ok: true, data: { poorDay: true } });
  });
});
