import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { MODEL_CHAIN, runModelChain } from "./model-chain";
import type { PlanModel } from "./synthesize";

/**
 * Gemini models for plan synthesis. Server-only: the key never reaches the
 * browser. The models and their order are in model-chain.ts; whichever answers,
 * its output goes through exactly the same validator.
 *
 * GEMINI_MODEL, if set, is tried before the chain.
 */
export function createGeminiModel(apiKey: string, preferred = process.env.GEMINI_MODEL): PlanModel {
  const ai = new GoogleGenAI({ apiKey });
  const models: readonly string[] = preferred ? [...new Set<string>([preferred, ...MODEL_CHAIN])] : MODEL_CHAIN;

  return ({ system, user, schema }) =>
    runModelChain(
      models,
      async (model, abortSignal) => {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: user }] }],
          config: {
            systemInstruction: system,
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            // These models support a low thinking level (3.8 rejects "minimal"). Low keeps latency down.
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            abortSignal,
          },
        });
        // An empty answer is malformed too: the chain rejects it and tries the next model.
        return res.text ?? "";
      },
      // One log line per attempt, codes only: which model, what happened, how long.
      (attempt) => console.warn("[plan:model]", JSON.stringify(attempt)),
    );
}
