import { describe, expect, it } from "vitest";
import { classifyModelError } from "@/lib/plan/model-errors";
import { numberTokens } from "@/lib/plan/numbers";
import { planHour, planningTime } from "@/lib/plan/clock";
import { synthesizePlan } from "@/lib/plan/synthesize";
import { input } from "./planFixtures";

describe("plan hour", () => {
  it("is the Indian clock hour, so every minute of it shares one key", () => {
    // 10:00–10:59 IST is 04:30–05:29 UTC
    for (const t of ["04:30:00", "04:59:59", "05:00:00", "05:29:59"]) expect(planHour(new Date(`2026-11-25T${t}Z`))).toBe("2026-11-25T04:30:00.000Z");
    expect(planHour(new Date("2026-11-25T05:30:00Z"))).toBe("2026-11-25T05:30:00.000Z");
    expect(planningTime(new Date("2026-11-25T04:31:00Z")).toISOString()).toBe("2026-11-25T05:29:00.000Z");
  });

  it("offers the same upcoming forecast points as the real time, apart from the instant a point expires", () => {
    // Points fall at :00 UTC; one counts as upcoming if it started no more than 30 minutes ago.
    const firstUpcoming = (t: number) => Math.ceil((t - 30 * 60_000) / 3_600_000);
    const base = Date.parse("2026-11-25T00:30:00Z");
    for (let minute = 0; minute < 24 * 60; minute++) {
      if (minute % 60 === 0) continue;
      const now = base + minute * 60_000;
      expect(firstUpcoming(planningTime(new Date(now)).getTime()), new Date(now).toISOString()).toBe(firstUpcoming(now));
    }
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
