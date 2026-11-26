/**
 * Generates and caches real plans for the README's sample inputs on the
 * deployed app, so those paths are already warm when someone tries them.
 *
 *   npm run prewarm                      # https://clear-hour.vercel.app
 *   npm run prewarm -- http://localhost:3000
 *
 * A plan is cached for its Indian clock hour only, and a new deployment starts
 * with an empty cache: run this after deploying, early in the hour in which the
 * testing happens. Each plan not already cached costs a model request.
 * Nothing is seeded or made up: these are ordinary requests to /api/plan.
 */

import { SAMPLES } from "./samples.mjs";

const base = (process.argv[2] ?? "https://clear-hour.vercel.app").replace(/\/$/, "");
const IST_OFFSET_MS = 5.5 * 3_600_000;
const hourStart = (ms) => Math.floor((ms + IST_OFFSET_MS) / 3_600_000) * 3_600_000 - IST_OFFSET_MS;
const ist = (ms) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit" });

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

const started = Date.now();
const hour = hourStart(started);
console.log(`Warming ${SAMPLES.length} sample plans on ${base} at ${ist(started)} IST`);

let warm = 0;
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
  const stored = again.plan?.preparedAt === r.plan.preparedAt;
  const age = Date.parse(r.plan.preparedAt) < askedAt - 5_000 ? "already cached" : "generated now";
  console.log(`  ${sample.id} ${sample.label}: ${stored ? "WARM" : "NOT CONFIRMED"} (${age}, written ${ist(Date.parse(r.plan.preparedAt))} IST)`);
  if (stored) warm++;
}

console.log(`\n${warm}/${SAMPLES.length} warm until ${ist(hour + 3_600_000)} IST (end of this clock hour).`);
if (hourStart(Date.now()) !== hour) console.log("WARNING: the hour changed while warming. Run it again.");
process.exitCode = warm === SAMPLES.length && hourStart(Date.now()) === hour ? 0 : 1;
