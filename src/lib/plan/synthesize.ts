/**
 * Plan synthesis: packet → model → validator. The model is injected, so tests
 * use a fake and production uses Gemini (gemini.ts). Returns either a fully
 * validated plan or a reason code. There is no path that returns an
 * unvalidated or partial plan.
 */

import { missing, ok, type Grounded } from "../grounding/types";
import { classifyModelError, type ModelFailureKind } from "./model-errors";
import { buildPlanInput, type PlanInput } from "./packet";
import { SYSTEM_PROMPT } from "./prompt";
import type { PlanAllowance, PlanResponse } from "./types";
import { LIMITS, validatePlan, type PlanRejection } from "./validate";

export interface PlanModelRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: Record<string, unknown>;
}
/** Returns the model's raw text. Throws on transport failure. */
export type PlanModel = (req: PlanModelRequest) => Promise<string>;

export type PlanFailure = PlanRejection | ModelFailureKind;

/** JSON Schema for structured output. Length limits are enforced by the validator. */
export function planJsonSchema(a: PlanAllowance): Record<string, unknown> {
  const refIds = [...(a.windowAvailable ? ["window"] : []), ...a.guidanceIds, ...a.swapIds];
  return {
    type: "object",
    properties: {
      headline: { type: "string", description: `One sentence, at most ${LIMITS.headline} characters.` },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: LIMITS.maxSteps,
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["window", "guidance", "swap"] },
            refId: { type: "string", enum: refIds },
            note: { type: "string", description: `At most ${LIMITS.note} characters.` },
          },
          required: ["kind", "refId", "note"],
        },
      },
      acknowledgedGaps: a.gaps.length > 0 ? { type: "array", items: { type: "string", enum: [...a.gaps] } } : { type: "array", maxItems: 0, items: { type: "string" } },
    },
    required: ["headline", "steps", "acknowledgedGaps"],
  };
}

export async function synthesizePlan(input: PlanInput, model: PlanModel): Promise<Grounded<PlanResponse, PlanFailure>> {
  const { packet, allowance, refs } = buildPlanInput(input);
  let text: string;
  try {
    text = await model({ system: SYSTEM_PROMPT, user: JSON.stringify(packet), schema: planJsonSchema(allowance) });
  } catch (e) {
    return missing(classifyModelError(e).kind);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return missing("invalid-json");
  }
  const v = validatePlan(raw, allowance);
  if (!v.ok) return v.detail === undefined ? missing(v.reason) : missing(v.reason, v.detail);
  const used = Object.fromEntries(v.data.steps.map((s) => [s.refId, refs[s.refId]!]));
  return ok({ plan: v.data, refs: used });
}
