/**
 * Runs the real Gemini plan pipeline (snapshot → packet → Gemini → validator)
 * outside Next.js, and reports pass/fail per city and language.
 *
 *   npm run plan-probe -- delhi lucknow        (runs each in en and hi)
 */
import nextEnv from "@next/env";
import { createOpenAqClient, findCity, getGroundingSnapshot } from "../src/lib/grounding/index";
import { toPublicSnapshot } from "../src/lib/grounding/public";
import { createGeminiModel, DEFAULT_GEMINI_MODEL } from "../src/lib/plan/gemini";
import { synthesizePlan } from "../src/lib/plan/synthesize";
import type { HouseholdProfile } from "../src/lib/profile/types";

nextEnv.loadEnvConfig(process.cwd());
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("GEMINI_API_KEY not set");
const cities = process.argv.slice(2).length ? process.argv.slice(2) : ["delhi"];
const openaq = createOpenAqClient({ apiKey: process.env.OPENAQ_API_KEY });
const model = createGeminiModel(key);
console.log(`model: ${process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL}`);

let pass = 0, total = 0;
for (const cityId of cities) {
  const city = findCity(cityId);
  if (!city) throw new Error(`unknown city ${cityId}`);
  const snapshot = toPublicSnapshot(await getGroundingSnapshot(city.center, { openaq }));
  const profile: HouseholdProfile = { cityId, commute: { mode: "car-petrol", oneWayKm: 12, departureHour: 9 }, cookingFuel: "lpg", hasChildrenOrElderly: true, hasAirPurifier: false };
  for (const locale of ["en", "hi"] as const) {
    total++;
    const t0 = Date.now();
    const r = await synthesizePlan({ snapshot, profile, locale, now: new Date() }, async (req) => {
      try { return await model(req); } catch (e) { console.log(`   model error: ${e instanceof Error ? e.message.slice(0, 200) : e}`); throw e; }
    });
    const ms = Date.now() - t0;
    if (r.ok) {
      pass++;
      console.log(`\n[PASS] ${cityId}/${locale} (${ms} ms)\n  ${r.data.plan.headline}`);
      for (const s of r.data.plan.steps) console.log(`  - [${s.kind}:${s.refId}] ${s.note}`);
      if (r.data.plan.acknowledgedGaps.length) console.log(`  gaps: ${r.data.plan.acknowledgedGaps.join(", ")}`);
    } else {
      console.log(`\n[FAIL] ${cityId}/${locale} (${ms} ms) → ${r.reason}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }
}
console.log(`\n${pass}/${total} plans passed validation`);
