/**
 * Validates a POST /api/plan body before anything else runs.
 * Bounded size, JSON only, known city, locale and profile values, and the
 * profile's city must match. Anything else is a generic 400.
 */

import { z } from "zod";
import { findCity } from "../grounding/cities";
import { isLocale, type Locale } from "../i18n/locales";
import { parseProfile } from "../profile/storage";
import type { HouseholdProfile } from "../profile/types";

export const MAX_BODY_BYTES = 2048;

const Body = z.object({ cityId: z.string().max(40), locale: z.string().max(8), profile: z.unknown() }).strict();

export interface PlanRequest {
  readonly cityId: string;
  readonly locale: Locale;
  readonly profile: HouseholdProfile;
}

export async function parsePlanRequest(req: Request): Promise<PlanRequest | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const b = Body.safeParse(json);
  if (!b.success || !isLocale(b.data.locale) || !findCity(b.data.cityId)) return null;
  const profile = parseProfile(b.data.profile);
  if (!profile || profile.cityId !== b.data.cityId) return null;
  return { cityId: b.data.cityId, locale: b.data.locale, profile };
}

/** Plans are cached per 15-minute bucket: the best window depends on the time of day. */
export function timeBucket(now: Date): string {
  const ms = 15 * 60_000;
  return new Date(Math.floor(now.getTime() / ms) * ms).toISOString();
}
