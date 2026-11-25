/**
 * On-device storage for the household profile and UI language. No account,
 * no server copy. Every read is validated: a corrupt or outdated profile
 * reads as "none" (back to onboarding) instead of crashing the app.
 * Storage can be unavailable (private mode, blocked site data), so every
 * access is guarded.
 */

import { z } from "zod";
import { findCity } from "../grounding/cities";
import { isLocale, type Locale } from "../i18n/locales";
import type { CommuteMode, CookingFuel, HouseholdProfile } from "./types";

const PROFILE_KEY = "clearhour.profile.v1";
const LOCALE_KEY = "clearhour.locale";

export const COMMUTE_MODES = [
  "car-petrol",
  "car-diesel",
  "car-cng",
  "two-wheeler",
  "auto-rickshaw",
  "bus",
  "metro",
  "suburban-rail",
  "walk-cycle",
  "none",
] as const satisfies readonly CommuteMode[];

export const COOKING_FUELS = ["lpg", "png", "electric", "biomass", "kerosene"] as const satisfies readonly CookingFuel[];

/** Bounds for the onboarding distance field. Input sanity limits, not assumptions about anyone's commute. */
export const MAX_ONE_WAY_KM = 100;

const ProfileSchema = z.object({
  cityId: z.string().refine((id) => findCity(id) !== undefined),
  commute: z.object({
    mode: z.enum(COMMUTE_MODES),
    oneWayKm: z.number().min(0).max(MAX_ONE_WAY_KM),
    departureHour: z.number().int().min(0).max(23).optional(),
  }),
  cookingFuel: z.enum(COOKING_FUELS),
  hasChildrenOrElderly: z.boolean(),
  hasAirPurifier: z.boolean(),
});

export function parseProfile(raw: unknown): HouseholdProfile | null {
  const r = ProfileSchema.safeParse(raw);
  if (!r.success) return null;
  const { departureHour, ...commute } = r.data.commute;
  return { ...r.data, commute: departureHour === undefined ? commute : { ...commute, departureHour } };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadProfile(): HouseholdProfile | null {
  try {
    const raw = storage()?.getItem(PROFILE_KEY);
    return raw ? parseProfile(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Returns false if the device refused to store it; the app keeps working for this session. */
export function saveProfile(p: HouseholdProfile): boolean {
  try {
    storage()?.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function loadLocale(): Locale | null {
  try {
    const raw = storage()?.getItem(LOCALE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveLocale(l: Locale): void {
  try {
    storage()?.setItem(LOCALE_KEY, l);
  } catch {
    /* non-essential */
  }
}
