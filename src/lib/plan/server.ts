import "server-only";
import { cacheLife } from "next/cache";
import { findCity } from "../grounding/cities";
import { getPublicSnapshot } from "../grounding/server";
import type { Locale } from "../i18n/locales";
import type { HouseholdProfile } from "../profile/types";
import { PLAN_TTL_SECONDS } from "./clock";
import { createGeminiModel } from "./gemini";
import { synthesizePlan, type PlanFailure } from "./synthesize";
import type { PreparedPlan } from "./types";

export type PlanUnavailableReason = PlanFailure | "no-key" | "unknown-city";

export class PlanUnavailable extends Error {
  constructor(readonly reason: PlanUnavailableReason) {
    super(reason);
  }
}

/**
 * One plan per (city, language, profile, Indian day, poor-day or not), reused for three hours and
 * shared across server instances (`use cache: remote`), so repeat requests cost
 * no model calls. The reading is deliberately not part of the key.
 *
 * Failures throw, so they are never cached. Their reason is logged HERE: in
 * production an error crossing the cache boundary arrives without its details.
 */
export async function getPlan(cityId: string, locale: Locale, profile: HouseholdProfile, day: string, poorAir: boolean): Promise<PreparedPlan> {
  "use cache: remote";
  // Gone after three hours. `expire` must exceed `revalidate`; the one-minute gap
  // keeps an old plan from being served much past its lifetime.
  cacheLife({ stale: 300, revalidate: PLAN_TTL_SECONDS, expire: PLAN_TTL_SECONDS + 60 });

  const started = Date.now();
  const log = (reason: string, detail?: string) =>
    console.warn("[plan]", JSON.stringify({ reason, ...(detail === undefined ? {} : { detail }), city: cityId, locale, day, poorAir, ms: Date.now() - started }));
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new PlanUnavailable("no-key");
    const city = findCity(cityId);
    if (!city) throw new PlanUnavailable("unknown-city");

    const snapshot = await getPublicSnapshot(city.center.latitude, city.center.longitude);
    const result = await synthesizePlan({ snapshot, profile, locale, now: new Date() }, createGeminiModel(apiKey));
    if (!result.ok) {
      log(result.reason, result.detail);
      throw new PlanUnavailable(result.reason);
    }
    log("ok");
    const reading = snapshot.measured.ok ? snapshot.measured.data.latest.pm25 : undefined;
    return { ...result.data, preparedAt: new Date().toISOString(), readingUtc: reading?.provenance.observedAt.utc ?? null };
  } catch (e) {
    if (!(e instanceof PlanUnavailable)) log("unexpected", e instanceof Error ? e.name : typeof e);
    throw e;
  }
}
