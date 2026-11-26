/**
 * How long a plan is reused. assumptions.ts#plan-lifetime
 */

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** A generated plan is served again for this long, then regenerated. */
export const PLAN_TTL_SECONDS = 3 * 3600;

/**
 * The Indian calendar day, part of the cache key: a plan talks about "today",
 * so it is never served after midnight.
 */
export function planDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
