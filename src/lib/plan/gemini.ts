import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { PlanModel } from "./synthesize";

/**
 * Gemini models for plan synthesis. Server-only: the key never reaches the browser.
 *
 * Primary: "gemini-3.8-flash"; fallback: "gemini-3.6-flash". Both are listed
 * as Stable on Google's models page (checked 2026-11-25). The fallback is
 * used only when the primary is overloaded (429/503), errors server-side
 * (5xx) or times out. Its output goes through exactly the same validator.
 * Override the primary with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 45_000;

function isTransient(e: unknown): boolean {
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError" || /aborted|timed? ?out/i.test(e.message))) return true;
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return e instanceof Error && /"code":\s*(429|5\d\d)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(e.message);
}

export function createGeminiModel(apiKey: string, primary = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL): PlanModel {
  const ai = new GoogleGenAI({ apiKey });
  const models = primary === FALLBACK_GEMINI_MODEL ? [primary] : [primary, FALLBACK_GEMINI_MODEL];

  return async ({ system, user, schema }) => {
    let lastError: unknown;
    for (const model of models) {
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
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
          },
        });
        const text = res.text;
        if (!text) throw new Error("empty response");
        return text;
      } catch (e) {
        lastError = e;
        if (!isTransient(e)) break; // a real error (bad request, auth) won't be fixed by another model
      }
    }
    throw lastError;
  };
}
