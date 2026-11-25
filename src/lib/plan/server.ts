import "server-only";
import { cacheLife } from "next/cache";
import { findCity } from "../grounding/cities";
import { getPublicSnapshot } from "../grounding/server";
import type { Locale } from "../i18n/locales";
import type { HouseholdProfile } from "../profile/types";
import { createGeminiModel } from "./gemini";
import { synthesizePlan, type PlanFailure } from "./synthesize";
import type { PlanResponse } from "./types";

export type PlanUnavailableReason = PlanFailure | "no-key" | "unknown-city";

const REASONS: ReadonlySet<string> = new Set<PlanUnavailableReason>([
  "schema", "unknown-ref", "duplicate-ref", "window-unavailable", "gaps-mismatch", "link", "health-claim",
  "number-word", "unknown-number", "wrong-language", "model-error", "invalid-json", "no-key", "unknown-city",
]);

export class PlanUnavailable extends Error {
  constructor(readonly reason: PlanUnavailableReason) {
    super(reason);
  }
}

/**
 * Errors thrown inside a "use cache" function lose their class on the way out,
 * so the reason is carried in the message and read back against a closed set.
 * Anything else logs as "unexpected"; nothing upstream is ever echoed.
 */
export function planFailureReason(e: unknown): PlanUnavailableReason | "unexpected" {
  const msg = e instanceof Error ? e.message : "";
  return REASONS.has(msg) ? (msg as PlanUnavailableReason) : "unexpected";
}

/**
 * Cached per (city, locale, profile, 15-minute bucket). Failures throw, so
 * they are never cached and the next request tries again.
 */
export async function getPlan(cityId: string, locale: Locale, profile: HouseholdProfile, bucketIso: string): Promise<PlanResponse> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 1800 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new PlanUnavailable("no-key");
  const city = findCity(cityId);
  if (!city) throw new PlanUnavailable("unknown-city");

  const snapshot = await getPublicSnapshot(city.center.latitude, city.center.longitude);
  const result = await synthesizePlan({ snapshot, profile, locale, now: new Date(bucketIso) }, createGeminiModel(apiKey));
  if (!result.ok) throw new PlanUnavailable(result.reason);
  return result.data;
}
