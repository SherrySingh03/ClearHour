/**
 * Prints a readable summary of the grounding snapshot for one or more cities.
 *
 *   npm run probe -- delhi mumbai
 *
 * Env files (.env.local etc.) are loaded with @next/env, the same loader and
 * precedence Next.js uses, so the script sees what the app sees.
 *
 * If OPENAQ_API_KEY is not set, the measured side fails closed and the
 * forecast side still works. That is the intended behaviour.
 */

import nextEnv from "@next/env";
import { CITIES, createOpenAqClient, findCity, getGroundingSnapshot } from "../src/lib/grounding/index";

nextEnv.loadEnvConfig(process.cwd());

const ids = process.argv.slice(2);
const cities = ids.length ? ids.map((id) => findCity(id) ?? die(`unknown city: ${id}`)) : CITIES.slice(0, 3);
const openaq = createOpenAqClient({ apiKey: process.env.OPENAQ_API_KEY });

const istHour = (utc: string) =>
  new Date(utc).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false, day: "2-digit", month: "short" });

for (const city of cities) {
  const s = await getGroundingSnapshot(city.center, { openaq });
  console.log(`\n=== ${city.names.en} (${city.center.latitude}, ${city.center.longitude}) ===`);

  console.log("COVERAGE:", s.coverage.status);
  if (s.coverage.status === "station") {
    console.log(`  station: ${s.coverage.station.name} [${s.coverage.station.provider}] ${s.coverage.distanceKm.toFixed(1)} km`);
  }
  if (s.coverage.status !== "unknown") {
    for (const r of s.coverage.rejected.slice(0, 5)) console.log(`  rejected: ${r.name} (${r.distanceKm?.toFixed(1)} km) → ${r.reason}`);
  }

  console.log("MEASURED:");
  if (!s.measured.ok) console.log(`  unavailable → ${s.measured.reason}${s.measured.detail ? ` (${s.measured.detail})` : ""}`);
  else {
    for (const v of Object.values(s.measured.data.latest)) {
      console.log(`  ${v.pollutant} = ${v.value} ${v.unit} @ ${v.provenance.station.name}, observed ${v.provenance.observedAt.local}`);
    }
    for (const [p, n] of Object.entries(s.measured.data.naqi24h)) {
      console.log(
        n.ok
          ? `  NAQI ${p}: ${n.data.cappedAtScaleMax ? "≥" : ""}${n.data.subIndex} (${n.data.category}) from 24h avg ${n.data.average24h} over ${n.data.hoursObserved}h`
          : `  NAQI ${p}: not computed → ${n.reason}${n.detail ? ` (${n.detail})` : ""}`,
      );
    }
  }

  console.log("FORECAST (modeled, CAMS global — not a measurement):");
  if (!s.forecast.ok) console.log(`  unavailable → ${s.forecast.reason}`);
  else {
    const { points, provenance } = s.forecast.data;
    console.log(`  grid cell ${provenance.gridCell.latitude}, ${provenance.gridCell.longitude}; ${points.length} hourly points`);
    const upcoming = points.filter((p) => Date.parse(p.timeUtc) >= Date.now()).slice(0, 12);
    console.log("  " + upcoming.map((p) => `${istHour(p.timeUtc)}h:${p.pm25 ?? "–"}`).join("  "));
  }
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}
