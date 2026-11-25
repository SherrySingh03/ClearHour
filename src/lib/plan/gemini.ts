import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { PlanModel } from "./synthesize";

/**
 * Gemini models for plan synthesis. Server-only: the key never reaches the browser.
 *
 * Primary: "gemini-3.8-flash"; fallback: "gemini-3.6-flash". Both are listed
 * as Stable on Google's models page (checked 2026-11-25). The fallback is
 * used only when the primary errors server-side (5xx, incl. 503 overload) or
 * times out, and only within one shared 50 s budget. Its output goes through
 * exactly the same validator.
 * Override the primary with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-3.6-flash";
/** One deadline for the whole call, shared by primary and fallback. */
const TOTAL_BUDGET_MS = 50_000;
/** Only try the fallback if at least this much of the budget is left. */
const MIN_FALLBACK_MS = 15_000;

/**
 * Fall back only when the primary is overloaded or broken (5xx) or timed out.
 * NOT on 429 / RESOURCE_EXHAUSTED: that is our quota, and a second model would
 * only spend more of it.
 */
function shouldFallBack(e: unknown): boolean {
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError" || /aborted|timed? ?out/i.test(e.message))) return true;
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number") return status >= 500;
  return e instanceof Error && /"code":\s*5\d\d|"status":\s*"UNAVAILABLE"/.test(e.message);
}

export function createGeminiModel(apiKey: string, primary = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL): PlanModel {
  const ai = new GoogleGenAI({ apiKey });
  const models = primary === FALLBACK_GEMINI_MODEL ? [primary] : [primary, FALLBACK_GEMINI_MODEL];

  return async ({ system, user, schema }) => {
    const deadline = AbortSignal.timeout(TOTAL_BUDGET_MS);
    const started = Date.now();
    let lastError: unknown;
    for (const [i, model] of models.entries()) {
      if (i > 0 && TOTAL_BUDGET_MS - (Date.now() - started) < MIN_FALLBACK_MS) break;
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            // Flash models here support low/medium/high thinking (3.8 rejects "minimal"). Low keeps latency down.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal: deadline,
          },
        });
        const text = res.text;
        if (!text) throw new Error("empty response");
        return text;
      } catch (e) {
        lastError = e;
        if (!shouldFallBack(e)) break; // quota, bad request or auth: another model won't help
      }
    }
    throw lastError;
  };
}
