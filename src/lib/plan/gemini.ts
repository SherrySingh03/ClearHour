import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { PlanModel } from "./synthesize";

/**
 * Gemini model for plan synthesis. Server-only: the key never reaches the browser.
 * Default model: "gemini-3.8-flash", listed as Stable on Google's models page
 * (checked 2026-11-25). Override with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 20_000;

export function createGeminiModel(apiKey: string, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL): PlanModel {
  const ai = new GoogleGenAI({ apiKey });
  return async ({ system, user, schema }) => {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: {
        systemInstruction: system,
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        // 3.8 Flash supports low/medium/high (not minimal). Low keeps latency and cost down.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      },
    });
    const text = res.text;
    if (!text) throw new Error("empty response");
    return text;
  };
}
