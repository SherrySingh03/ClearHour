/**
 * Runs the best-window logic on today's live forecast for a city.
 *   npm run window -- delhi 9      (city, optional departure hour)
 */
import { findCity, fetchForecast } from "../src/lib/grounding/index";
import { bestWindow, type Stretch } from "../src/lib/plan/window";

const [cityId = "delhi", dep] = process.argv.slice(2);
const city = findCity(cityId);
if (!city) throw new Error(`unknown city ${cityId}`);
const f = await fetchForecast(city.center);
if (!f.ok) throw new Error(`forecast unavailable: ${f.error.code}`);
const ist = (iso: string) => new Date(Date.parse(iso) + 19_800_000).toISOString().slice(11, 16);
const show = (s: Stretch) => `${ist(s.startUtc)}–${ist(s.endUtc)} IST  mean PM2.5 ${s.meanPm25.toFixed(1)} (indicative ${s.indicativeCategory})`;
const r = bestWindow({ forecast: f.data, now: new Date(), ...(dep ? { departureHour: Number(dep) } : {}) });
console.log(`${city.names.en}, departure ${dep ?? "not given"} — FORECAST (CAMS, 3-hour resolution):`);
console.log("verdict:", r.verdict);
for (const [k, v] of Object.entries(r)) if (v && typeof v === "object" && "meanPm25" in v) console.log(`  ${k.padEnd(9)} ${show(v as Stretch)}`);
if ("comparison" in r) console.log("  comparison:", JSON.stringify({ ...r.comparison, dropUgm3: +r.comparison.dropUgm3.toFixed(1), dropFraction: +r.comparison.dropFraction.toFixed(3) }));
