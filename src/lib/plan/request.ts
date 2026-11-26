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

/**
 * Reads at most MAX_BODY_BYTES from the stream and stops as soon as the cap is
 * passed, so an oversized body is never fully buffered. Content-Length is only
 * an early hint; the streamed count is what is enforced.
 */
async function readBounded(req: Request): Promise<string | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= MAX_BODY_BYTES)) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function parsePlanRequest(req: Request): Promise<PlanRequest | null> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const text = await readBounded(req);
  if (text === null) return null;
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
