import { describe, expect, it } from "vitest";
import { MODEL_CHAIN, runModelChain, type Attempt } from "@/lib/plan/model-chain";

const apiError = (code: number) => new Error(JSON.stringify({ error: { code, status: code === 429 ? "RESOURCE_EXHAUSTED" : "X", message: "x" } }));
const aborted = () => Object.assign(new Error("This operation was aborted"), { name: "AbortError" });

/** Runs the real chain with scripted outcomes: an Error to throw, or text to return. */
async function run(script: readonly (Error | string)[], msPerAttempt = 100) {
  const log: Attempt[] = [];
  let clock = 0;
  const outcome = await runModelChain(
    MODEL_CHAIN,
    async () => {
      const next = script[log.length]!;
      clock += msPerAttempt;
      if (next instanceof Error) throw next;
      return next;
    },
    (a) => log.push(a),
    { totalMs: 50_000, attemptMs: 20_000, minAttemptMs: 8_000 },
    () => clock,
  ).then(
    (text) => ({ text }),
    (e: Error) => ({ error: e.message }),
  );
  return { outcome, models: log.map((a) => a.model), results: log.map((a) => a.outcome) };
}

describe("model chain", () => {
  it("starts with the primary and stops at the first answer", async () => {
    expect(await run(["plan"])).toEqual({ outcome: { text: "plan" }, models: ["gemini-3.1-flash-lite"], results: ["ok"] });
  });

  it("moves down the chain on used-up quota, one model at a time", async () => {
    const r = await run([apiError(429), apiError(429), apiError(429), "plan"]);
    expect(r.outcome).toEqual({ text: "plan" });
    expect(r.models).toEqual([...MODEL_CHAIN]);
  });

  it("also moves on after overload, timeout and a retired model", async () => {
    const r = await run([apiError(503), aborted(), apiError(404), "plan"]);
    expect(r.results).toEqual(["model-overloaded", "model-timeout", "model-error", "ok"]);
  });

  it.each([400, 401, 403])("stops on %d: another model would fail the same way", async (code) => {
    const r = await run([apiError(code), "never"]);
    expect(r.outcome).toEqual({ error: "model-error" });
    expect(r.models).toHaveLength(1);
  });

  it("when every model is used up, reports quota", async () => {
    expect((await run([apiError(429), apiError(429), apiError(429), apiError(429)])).outcome).toEqual({ error: "model-quota" });
  });

  it.each([
    [20_000, 3], // 50 s: attempts start with 50, 30 and 10 s left
    [25_000, 2], // 50 s: attempts start with 50 and 25 s left
  ])("shares one deadline: with %d ms per timed-out attempt, %d attempts", async (ms, attempts) => {
    const r = await run([aborted(), aborted(), aborted(), "never"], ms);
    expect(r.models).toHaveLength(attempts);
  });
});
