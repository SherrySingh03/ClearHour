/**
 * Tries models in order until one answers. Free-tier quota is counted per
 * model, so when one is used up the next may still have requests left.
 *
 * assumptions.ts#plan-model-chain, #plan-model-budget
 */

import { classifyModelError, type ModelFailure } from "./model-errors";

/**
 * Primary first. Order chosen by the project owner on 2026-11-26 from real plan
 * requests through our schema and validator: the Flash-Lite models passed and
 * answered in 2–5 s. All four are listed as Stable.
 */
export const MODEL_CHAIN = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"] as const;

export interface ChainBudget {
  /** One deadline for the whole plan, shared by every attempt. */
  readonly totalMs: number;
  /** Longest a single model may take before the next is tried. */
  readonly attemptMs: number;
  /** Don't start an attempt with less than this left. */
  readonly minAttemptMs: number;
}

export const CHAIN_BUDGET: ChainBudget = { totalMs: 50_000, attemptMs: 20_000, minAttemptMs: 8_000 };

/**
 * Move on when this model can't serve the request but another might: used-up
 * quota, overload, timeout, or a model that no longer exists. A rejected
 * request or key (400, 401, 403) would fail the same way everywhere.
 */
export function triesNextModel(f: ModelFailure): boolean {
  return f.kind === "model-quota" || f.kind === "model-overloaded" || f.kind === "model-timeout" || f.status === 404;
}

export interface Attempt {
  readonly model: string;
  readonly outcome: "ok" | ModelFailure["kind"];
  readonly status: number | null;
  readonly ms: number;
}

export async function runModelChain(
  models: readonly string[],
  call: (model: string, signal: AbortSignal) => Promise<string>,
  onAttempt: (a: Attempt) => void,
  budget: ChainBudget = CHAIN_BUDGET,
  now: () => number = Date.now,
): Promise<string> {
  const started = now();
  let last: ModelFailure | null = null;
  for (const [i, model] of models.entries()) {
    const left = budget.totalMs - (now() - started);
    if (i > 0 && left < budget.minAttemptMs) break;
    const attemptStarted = now();
    try {
      const text = await call(model, AbortSignal.timeout(Math.max(1, Math.min(left, budget.attemptMs))));
      onAttempt({ model, outcome: "ok", status: 200, ms: now() - attemptStarted });
      return text;
    } catch (e) {
      last = classifyModelError(e);
      onAttempt({ model, outcome: last.kind, status: last.status, ms: now() - attemptStarted });
      if (!triesNextModel(last)) break;
    }
  }
  throw last ?? classifyModelError(new Error("no model configured"));
}
