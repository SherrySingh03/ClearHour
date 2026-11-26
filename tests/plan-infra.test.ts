import { describe, expect, it } from "vitest";
import { classifyModelError } from "@/lib/plan/model-errors";
import { numberTokens } from "@/lib/plan/numbers";
import { PLAN_TTL_SECONDS, planDay } from "@/lib/plan/clock";
import { buildPlanInput } from "@/lib/plan/packet";
import { dayOutlook } from "@/lib/plan/window";
import { PLAN_TTL_HOURS } from "../scripts/samples.mjs";
import { synthesizePlan } from "@/lib/plan/synthesize";
import { input, NOW, snapshotWithStation } from "./planFixtures";

describe("plan lifetime", () => {
  it("is three hours, and the pre-warm script agrees", () => {
    expect(PLAN_TTL_SECONDS).toBe(10_800);
    expect(PLAN_TTL_HOURS * 3600).toBe(PLAN_TTL_SECONDS);
  });

  it("keys on the Indian day, so a plan about 'today' is never served after midnight", () => {
    expect(planDay(new Date("2026-11-25T18:29:59Z"))).toBe("2026-11-25"); // 23:59:59 IST
    expect(planDay(new Date("2026-11-25T18:30:00Z"))).toBe("2026-11-26"); // 00:00 IST
  });
});

describe("forecast outlook given to the plan writer", () => {
  const series = snapshotWithStation.forecast.ok ? snapshotWithStation.forecast.data : null;

  it("describes each part of today still ahead, as a category word", () => {
    // fixture: 150 µg/m³ from 05:00 to 09:00 IST, 290 otherwise; the morning mean (210) is "very poor"
    expect(dayOutlook(series!, NOW)).toEqual([
      { part: "morning", indicativeCategory: "very-poor" },
      { part: "afternoon", indicativeCategory: "severe" },
      { part: "evening", indicativeCategory: "severe" },
    ]);
  });

  it("drops parts that are over instead of describing them", () => {
    const at6pm = new Date("2026-11-25T12:30:00Z");
    expect(dayOutlook(series!, at6pm).map((o) => o.part)).toEqual(["evening"]);
  });

  it("is in the packet in words only, labelled as a forecast, and returned for the screen", () => {
    const { packet, outlook, allowance } = buildPlanInput(input);
    expect(outlook).toHaveLength(3);
    expect(packet.forecast).toMatchObject({ isModelPrediction: true, outlookByPartOfDay: outlook });
    expect(JSON.stringify(outlook)).not.toMatch(/\d/);
    expect(allowance.tokens.size).toBeGreaterThan(0);
  });
});

describe("model failures are told apart", () => {
  const apiError = (code: number, status: string) => new Error(JSON.stringify({ error: { code, status, message: "x" } }));
  const aborted = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

  it.each([
    [apiError(429, "RESOURCE_EXHAUSTED"), "model-quota", 429],
    [apiError(503, "UNAVAILABLE"), "model-overloaded", 503],
    [Object.assign(new Error("boom"), { status: 500 }), "model-overloaded", 500],
    [aborted, "model-timeout", null],
    [apiError(400, "INVALID_ARGUMENT"), "model-error", 400],
    [new Error("empty response"), "model-error", null],
  ])("%s → %s", (error, kind, status) => {
    expect(classifyModelError(error)).toMatchObject({ kind, status });
  });

  it("the plan failure carries that code", async () => {
    const r = await synthesizePlan(input, async () => {
      throw apiError(429, "RESOURCE_EXHAUSTED");
    });
    expect(r).toEqual({ ok: false, reason: "model-quota" });
  });
});

describe("number tokens", () => {
  it("reads kinds in both languages", () => {
    expect(numberTokens("सुबह 5:30–8:30, दोपहर 12 से 4 बजे, 12 किमी, 24 घंटे, ४५ µg/m³")).toEqual([
      { kind: "time", value: "5:30" },
      { kind: "time", value: "8:30" },
      { kind: "time", value: "12" },
      { kind: "time", value: "4" },
      { kind: "km", value: "12" },
      { kind: "hours", value: "24" },
      { kind: "ugm3", value: "45" },
    ]);
    expect(numberTokens("9:00 am and 4 p.m.; 0.4 kg, 11%, PM2.5 and 220")).toEqual([
      { kind: "time", value: "9" },
      { kind: "time", value: "4" },
      { kind: "kg", value: "0.4" },
      { kind: "pct", value: "11" },
      { kind: "bare", value: "220" },
    ]);
  });
});
