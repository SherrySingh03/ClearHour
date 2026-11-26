/**
 * Generates and caches real plans for the README's sample inputs on the
 * deployed app, so those paths are already warm when someone tries them.
 *
 *   npm run prewarm                      # https://clear-hour.vercel.app
 *   npm run prewarm -- http://localhost:3000
 *
 * A plan is reused for three hours (never past midnight IST), and a new
 * deployment starts with an empty cache. Each plan not already cached costs a
 * model request; running this again while they are warm costs none.
 * Nothing is seeded or made up: these are ordinary requests to /api/plan.
 */

import { PLAN_TTL_HOURS, SAMPLES } from "./samples.mjs";

const base = (process.argv[2] ?? "https://clear-hour.vercel.app").replace(/\/$/, "");
const IST_OFFSET_MS = 5.5 * 3_600_000;
const ist = (ms) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const nextMidnight = (ms) => Math.floor((ms + IST_OFFSET_MS) / 86_400_000 + 1) * 86_400_000 - IST_OFFSET_MS;
/** When a plan written at `ms` stops being served. */
const expiry = (ms) => Math.min(ms + PLAN_TTL_HOURS * 3_600_000, nextMidnight(ms));

async function request({ locale, profile }) {
  try {
    const res = await fetch(`${base}/api/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cityId: profile.cityId, locale, profile }),
      signal: AbortSignal.timeout(75_000),
    });
    return { status: res.status, plan: res.ok ? await res.json() : null };
  } catch (e) {
    return { status: e instanceof Error ? e.name : "error", plan: null };
  }
}

console.log(`Warming ${SAMPLES.length} sample plans on ${base} at ${ist(Date.now())} IST`);

const expiries = [];
for (const sample of SAMPLES) {
  const askedAt = Date.now();
  let r = await request(sample);
  if (!r.plan) {
    console.log(`  ${sample.id} ${sample.label}: failed (${r.status}), trying once more`);
    await new Promise((done) => setTimeout(done, 5_000));
    r = await request(sample);
  }
  if (!r.plan) {
    console.log(`  ${sample.id} ${sample.label}: NOT WARM (${r.status})`);
    continue;
  }
  // Ask again: only an identical plan proves it was stored.
  const again = await request(sample);
  const written = Date.parse(r.plan.preparedAt);
  const stored = again.plan?.preparedAt === r.plan.preparedAt;
  const age = written < askedAt - 5_000 ? "already cached" : "generated now";
  console.log(`  ${sample.id} ${sample.label}: ${stored ? `WARM until ${ist(expiry(written))} IST` : "NOT CONFIRMED"} (${age}, written ${ist(written)} IST)`);
  if (stored) expiries.push(expiry(written));
}

const all = expiries.length === SAMPLES.length;
console.log(
  all
    ? `\nAll ${SAMPLES.length} warm until ${ist(Math.min(...expiries))} IST. The host can evict a cached entry early.`
    : `\n${expiries.length}/${SAMPLES.length} warm. Run it again.`,
);
process.exitCode = all ? 0 : 1;
