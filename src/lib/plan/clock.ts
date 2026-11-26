/**
 * The hour a plan belongs to. The page's forecast box and the plan writer both
 * use these, so a plan reused anywhere in the hour talks about the same
 * stretch the page shows.
 *
 * assumptions.ts#plan-hour
 */

const IST_OFFSET_MS = 5.5 * 3_600_000;
const HOUR_MS = 3_600_000;

/** Start of the Indian clock hour containing `now` (the plan cache key). */
export function planHour(now: Date): string {
  return new Date(Math.floor((now.getTime() + IST_OFFSET_MS) / HOUR_MS) * HOUR_MS - IST_OFFSET_MS).toISOString();
}

/**
 * The instant the best-window logic is evaluated at: the last minute of that
 * hour. Forecast points fall on the half hour in IST and stretches that began
 * up to 30 minutes earlier still count, so this offers the same upcoming
 * stretches as the real time does.
 */
export function planningTime(now: Date): Date {
  return new Date(Date.parse(planHour(now)) + HOUR_MS - 60_000);
}
