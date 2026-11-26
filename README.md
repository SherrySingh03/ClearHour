# Clearhour

A GenAI air-quality assistant for Indian households during winter smog.

**Live:** https://clear-hour.vercel.app

It shows the latest reading from a government air monitor (with the monitor's name and the reading's time), a forecast for today with the cleanest outdoor stretch, indoor advice quoted from official sources, lower-CO₂ swaps for the household's routine, and, when asked for, a short plan written by Google Gemini. English and Hindi. No account: the answers stay on the device.

**Contents:** [Grounding contract](#grounding-contract) · [GenAI architecture](#genai-architecture) · [Sample inputs](#sample-inputs) · [Abuse protection](#abuse-protection) · [Sources](#sources) · [Assumptions](#assumptions) · [Known limitations](#known-limitations) · [Running](#running)

## Grounding contract

**Nothing that can be measured or computed is generated.** In plain terms:

- A **reading** comes from a real monitor. It is shown with the monitor's name, its distance from the city centre and the time it was taken.
- A **forecast** is a computer model's prediction. It is always labelled, drawn differently (solid boxes are readings, hazy boxes are predictions), and never presented as a reading.
- The two are **never blended** into one number, and neither fills in for the other. If there is no reading, the page says so and shows the forecast alone.
- **Calculations** (the air level, CO₂ savings) are ordinary code using published formulas and factors, shown with their inputs.
- **Advice** is quoted from a published source with its page.
- **Gemini** only chooses, orders and explains items that already exist. It produces no numbers of its own.

### The AQI shown is not CPCB's official AQI

Clearhour shows the CPCB **sub-index for PM2.5 only**, from one monitor, over the last 24 hours (CPCB's 16-hour minimum applies). CPCB's official AQI needs at least three pollutants, one of them PM10 or PM2.5, and takes the **worst** sub-index among them (CPCB *National Air Quality Index* report; AQI-Calculator.xls). **The official figure can therefore be higher**, and advice that triggers on "Poor or worse" can be left out on a day when the official AQI is Poor because of another pollutant. The app says both on screen.

| Kind | Source | How it is kept honest |
|---|---|---|
| **Measured** | CPCB CAAQMS ground stations via OpenAQ v3 (provider id 168) | `MeasuredValue` type carries station, sensor and observation timestamp. |
| **Forecast** | Open-Meteo Air Quality, CAMS global model | `ForecastPoint`/`ForecastSeries` types, branded so the compiler rejects them where a measurement is expected. Provenance records the 0.4° grid, 3-hour native step and that hourly values are interpolated. |
| **Computed** | CPCB NAQI formulas; published emission factors | Arithmetic on measured data or verified factors only, with the inputs attached. |
| **Sourced guidance** | MoHFW (2025), CPCB (2014), WHO (2025), US EPA (2018) | Every item quotes its source with a page locator. |

## GenAI architecture

### Models

Google Gemini through the official `@google/genai` SDK, tried in this order (`src/lib/plan/model-chain.ts`):

| Order | Model | Free-tier requests per day |
|---|---|---|
| 1 | `gemini-3.1-flash-lite` | not published; not confirmed |
| 2 | `gemini-3.5-flash-lite` | not published; not confirmed |
| 3 | `gemini-3.8-flash` | 20 (from its quota error, 2026-11-26) |
| 4 | `gemini-3.6-flash` | 20 (from its quota error, 2026-11-26) |

All four are listed as Stable on Google's models page. `GEMINI_MODEL`, if set, is tried first. Settings: temperature 0.2, low thinking, JSON-schema-constrained output.

### Free tier, and why the plan is a button

The project runs on Gemini's **free tier** (no billing). Quota is counted per model and per project, and resets at midnight Pacific time (1:30 pm IST). The design spends a request only when someone wants a plan:

- **Explicit.** Opening, reloading or switching language spends nothing. The reading, forecast, best-time box, indoor advice and CO₂ swaps never use Gemini. A plan is generated only on **Get today's plan**.
- **Hourly shared cache.** One plan per (city, language, answers, Indian clock hour), stored with Next.js `use cache: remote` so it is shared across server instances. Asking again for the same inputs in that hour costs nothing. The latest reading is not part of the key, so a new reading does not bust it; the plan says when it was written and from which reading. The forecast box is evaluated for the same clock hour, so the two agree.
- **Fallback chain.** On a used-up quota, overload, timeout or retired model, the next model is tried, within one 50 s budget (at most 20 s each). A rejected request or key stops the chain.

What still costs a request: a different city, language, set of answers or hour; a plan the validator rejects (it is discarded and not cached); retrying after a failure; two identical requests arriving at the same instant; and the first request after each deployment (the cache does not carry over).

### Where it sits

Everything the plan can talk about is computed **before** Gemini is called.

```
Browser: profile kept on the device
  │  only on "Get today's plan": POST /api/plan { cityId, locale, profile }
  ▼
Vercel Firewall        per-visitor rate limit
  ▼
Route                  validates the request (400), caps concurrent generations (502)
  ▼
Cache                  same city, language, answers and hour: stored plan returned
  ▼
Grounding (no AI)      OpenAQ reading + CPCB sub-index · Open-Meteo forecast
  ▼
Computation (no AI)    best outdoor stretch · guidance selection · CO₂ swaps
  ▼
Packet builder         the only data Gemini sees, plus the list of what it may say
  ▼
GEMINI                 chooses 1–5 items, orders them, writes short notes
  ▼
Validator (no AI)      accepts the whole plan or rejects the whole plan
  ▼
UI                     Gemini's notes beside the grounded text, amounts and sources,
                       which come from the app's own data, never from Gemini
```

Key files: `src/app/api/plan/route.ts` → `src/lib/plan/server.ts` → `packet.ts` → `prompt.ts` + `gemini.ts` → `model-chain.ts` → `validate.ts` + `lexicon.ts`. The model call is server-only (`server-only` import); the key never reaches the browser. The rest of the page (reading, forecast, advice, swaps) works without Gemini.

### What Gemini receives

A JSON packet plus the system instruction in `prompt.ts`:

| Field | Contents |
|---|---|
| `language`, `city` | Output language and city name |
| `measured` | Station name and distance; latest single-hour PM2.5 with its time; the 24-hour PM2.5 AQI and its category. Or a gap code. Key names state the timeframe. |
| `forecast` | The already-computed verdict as sentences (clock times, category words) and the 3-hour caveat. Or a gap code. |
| `household` | Commute mode, distance, usual departure, cooking fuel, children/older people, purifier |
| `guidance` | Selected advice items: id, plain-language text, why it applies |
| `swaps` | Swap id, action, "lowers CO₂", whether it may be unavailable |
| `gaps` | Codes for any missing data |

It does **not** receive: hourly forecast values, forecast differences, CO₂ savings, emission factors, health statements or health thresholds.

### What Gemini returns

Structured JSON only: a headline, 1–5 steps (each pointing at an id from the packet, with a short note) and the list of acknowledged data gaps. Ids are constrained by the response schema and checked again.

### What it is not permitted to produce, and how that is enforced

| Not permitted | Enforcement in `validate.ts` |
|---|---|
| **Pollution numbers** | Hourly forecast values are never sent. Every number in the plan must be in the packet **written as the same kind of thing**: a clock time stays a time, a distance keeps km, a duration keeps hours, a concentration keeps µg/m³. The only number allowed without a unit is the 24-hour AQI. So the "30" of "8:30" cannot become "keep it under 30". A sentence quoting the AQI must say it covers 24 hours and must not say "now"; the latest reading may not be called current or a forecast. Spelled-out quantities and unusual numerals are rejected. |
| **Emission factors and savings** | Never sent. Any number with kg or % fails, because the packet contains none. Only the app states savings, with their conditions. |
| **Health thresholds and health claims** | No thresholds or CPCB health statements are sent. A per-language word list (health, medical, safety, exposure, risk, caution and more; `lexicon.ts`) rejects any match. CPCB's statement is shown verbatim by the app. |
| Invented items | Step ids must come from the packet, without repeats; no "window" step without a forecast. |
| Hiding missing data | The plan must list exactly the packet's gap codes. |
| Links, wrong language, oversize text | Rejected. |

**Limits of this check.** It is a rule-based filter, not a proof of meaning:

- A number reused as the **same kind** can still be misused: a clock time from an advice item could be offered as a different time ("leave at 4 pm"), or the AQI value written as a ceiling in a sentence that mentions 24 hours.
- A qualitatively false sentence with no number (for example, reversing which option emits less) is not detected.
- A health claim phrased entirely without listed words would pass.

In each case the grounded text, amounts and sources the app prints beside the note are unaffected.

### On failure

**Fail closed.** If every model errors or times out, or the answer is invalid JSON or breaks any rule, the **whole** plan is discarded. The route answers `502 {"error":"plan-unavailable"}` and the page says the plan is temporarily unavailable and that the readings and forecast above are live, with a **Try again** button. A partial or unvalidated plan is never rendered, failures are not cached, and upstream error text is never returned.

The server logs codes only: one `[plan:model]` line per model attempt (`ok`, `model-quota`, `model-overloaded`, `model-timeout`, `model-error`, with the HTTP status and duration) and one `[plan]` line with the final outcome, including the validator's rejection reason. No model text is logged.

## Sample inputs

Run these in a private window at https://clear-hour.vercel.app. The page asks five questions; **Change answers** restarts them. Press **Get today's plan** for the Gemini plan; identical inputs within the hour share one. Readings and forecasts are live, so air levels and times differ by day; the CO₂ figures and the behaviours listed do not.

| | A. Station-backed city | B. Withheld figures, Hindi | C. No departure time |
|---|---|---|---|
| Language | English | हिन्दी | English |
| City | Delhi | Lucknow | Kolkata |
| Commute | Car (petrol), 12 km | Auto-rickshaw, 2 km | Scooter or motorbike, 8 km |
| Leaves at | 9:00 am | 8:00 am | **It varies** |
| Cooks on | LPG cylinder | Wood, dung or crop waste | Piped gas (PNG) |
| Children/older people | Yes | Yes | No |
| Purifier | No | Yes | No |

**A. What it shows**
- A measured reading with station, distance and time, kept apart from the forecast.
- The forecast compared with the hours around 9 am: either a named cleaner stretch or a plain "no other time looks clearly cleaner".
- Savings: bus **at least 2.3 kg** and local train **at least 2.4 kg** CO₂ per working day, each "if you travel alone and your car isn't a hybrid". Piped gas **about 11%** less, with the stove assumption. Metro is listed **without a number**.
- Advice: on a Poor-or-worse day, includes keeping windows shut, children and older people limiting time outdoors, and how to choose a purifier. On a better day those are left out, and the page says so.

**B. What it shows**
- The whole interface, and the plan when asked for, in Hindi.
- **No CO₂ number at all**: auto-rickshaw swaps are withheld (the source is per vehicle, not per passenger) and so is wood-to-LPG (biomass CO₂ is not comparable). Each says why.
- Fuel-specific advice (clean cooking; on poor days, smoky cooking and running the purifier).

**C. What it shows**
- With no departure time, there is no commute comparison: the page names the cleanest stretch against a typical one, or says no part of the day is clearly cleaner.
- Savings: bus **at least 0.26 kg**, local train **at least 0.38 kg**; no cooking swap for PNG.

**D. Forecast only (no monitor nearby).** On 2026-11-26 every city in the picker had a monitor within 25 km, so this state is reachable through the API with coordinates, here Leh:

```
https://clear-hour.vercel.app/api/grounding?lat=34.15&lon=77.58
```

Expected: `"coverage":{"status":"no-station",…}`, `"measured":{"ok":false,"reason":"no-station-in-radius"}` and a populated `"forecast"`. No measured value is substituted.

**E. Monitor without fine dust (live-dependent).** On 2026-11-26 the monitor chosen for **Bengaluru** reported PM10 but not PM2.5. The page then says there is no 24-hour air level and why, instead of borrowing a number.

Time of day matters. Once the usual departure hours have passed (A and B, late morning onward), the page says so and picks from the rest of the day. Stretches are only offered between 5 am and 10 pm, so from about 7 pm the forecast box says too little of today is left.

## Abuse protection

- **Vercel Firewall rate limit** (live since 2026-11-26): 20 requests per 60 seconds per IP across `/api/*`, then `429`. The Hobby plan allows **one** rate-limit rule, so a single limit covers both the Gemini route and the grounding route; they cannot be limited separately. This is configured in Vercel, not in this repository: `vercel firewall rules list` shows it.
- **Route:** `/api/plan` is POST and JSON only, body at most 2 KB, known city, language and profile values; generic 400 otherwise. Profiles are canonicalised (distance to 0.5 km), which bounds the number of distinct cached plans.
- **Cost bounds:** plans only on request; one per city, language, answers and hour; at most 4 generations at once per server instance; responses sent `private, no-store`.
- The rate limit bounds abuse but does not protect the daily quota: one visitor varying their answers can still use it up.
- **Keys** (`OPENAQ_API_KEY`, `GEMINI_API_KEY`) are server-side only.

## Sources

Every number below was checked on 2026-11-25 against the publisher's own document. The SHA-256 of each checked file is in `src/lib/grounding/citations.ts`.

| Used for | Document | Where |
|---|---|---|
| AQI breakpoints, 16-hour rule, health statements | CPCB, *National Air Quality Index* (CUPS/82/2014-15), cpcb.gov.in | Table 3.11, §3.7, Table 3.12 |
| Sub-index formulas | CPCB, *AQI-Calculator.xls*, cpcb.gov.in | Cells D8 (PM10), D10 (PM2.5) |
| Car, two-wheeler, bus factors | India GHG Program, *India Specific Road Transport Emission Factors* v1.0 (2015) | Summary tables, PDF pp. 11–12 |
| Suburban rail factor | India GHG Program, *India Specific Rail Transport Emission Factors* v1.0 (2015) | Executive summary, PDF p. 8 |
| LPG, natural gas, kerosene CO₂ | IPCC 2006 Guidelines, Vol. 2 Ch. 2 | Table 2.5 (cross-checked against Ch. 1 Table 1.4) |
| Indoor measures | MoHFW, *Advisory on Air Pollution and Health* (Nov 2025) | Annexures I–III, PDF pp. 20–25 |
| Purifier sizing (CADR) | US EPA, *Guide to Air Cleaners in the Home*, 2nd ed. (2018) | p. 3 |
| Clean household fuels | WHO, *Household air pollution* fact sheet (16 Dec 2025) | "Key facts", "Guidance" |

### Sourcing log: what was checked and not used

- **CPCB breakpoints** were first cited to a PeerJ 2020 reprint because `https://cpcb.nic.in` failed. CPCB has moved to `cpcb.gov.in`, where the 2014 report and the official calculator were fetched and read. Reading the calculator also showed that our interpolation had been about 1 AQI point off. It now matches CPCB's formulas exactly (tests replay the calculator's own worked example).
- **CEA CO₂ Baseline Database.** `cea.nic.in` refused connections on port 443 from two networks. Version 20.0 (Dec 2024) was read through an Internet Archive capture: all-India weighted average **0.727 tCO₂/MWh** for FY 2023-24 (Table S). Version 22.0 could not be reached. No swap uses grid electricity yet, because the per-km energy figures metro or induction would need have no verified source.
- **Metro.** No official per-passenger-km factor was found (DMRC publishes a per-trip saving). Metro swaps are **withheld** and show no number.
- **Auto-rickshaw.** The source gives per-vehicle-km only. Without a sourced occupancy, auto swaps are **withheld**.
- **Transport factors date from 2015, and that is the latest verified India-specific set.** Checked 2026-11-25: the India GHG Program's transport page (indiaghgp.org/transport-emission-factors) still lists only the 2015 Version 1.0 road, rail and air papers, and searches found no later version. CEA does update yearly, but its database covers grid electricity, not vehicles. Old-but-sourced is used over newer-but-unverified.
- **DEFRA/DESNZ 2026** conversion factors were downloaded but deliberately not used, not even as a cross-check. They describe the UK fleet and grid, and showing two factors for the same trip would invite "which one is right?" without adding rigour.
- **Biomass cooking.** IPCC treats biomass CO₂ as biogenic, and stove efficiencies are unsourced. The case for switching is made on indoor air (MoHFW, WHO), with no CO₂ number.

## Assumptions

These are **Clearhour's own judgment calls, not published standards**. The source of truth is `src/lib/assumptions.ts`, where each entry lists the code that uses it. A test fails if an entry there is missing from this section.

| Id | Value | Why |
|---|---|---|
| `station-radius` | 25 km | OpenAQ's maximum search radius. Beyond it a station says little about the user's air, so we report "no station" instead. |
| `station-freshness` | 6 hours | Started at 3 h. A live check on 2026-11-25 found all 48 live CPCB stations near Delhi 2.8–4.3 h behind (ingestion lag), so 3 h rejected the whole network. The reading's timestamp is always shown. |
| `pm-plausibility-ceiling` | 1500 µg/m³ hourly | Instrument-fault filter, **not a health threshold**. Values above it are dropped, never clamped. |
| `station-attempts` | 3 | Try the next two stations if the nearest has no fresh reading. |
| `coordinate-rounding` | 0.01° (~1.1 km) | Bounds upstream lookups. The server never handles an exact home location. |
| `snapshot-cache` | 10 min (outages: seconds) | CPCB updates every 15–60 min. Outages are retried quickly. |
| `naqi-display-rounding` | Nearest integer | CPCB bulletins report whole numbers. |
| `naqi-cap-500` | Capped at 500 | The calculator has no upper limit; the report defines the scale as 0–500. |
| `vehicle-representative-category` | Lowest-emitting common (non-hybrid) category | Onboarding doesn't ask engine size. For a solo traveller the avoided emissions are a lower bound, except for petrol hybrids (0.103 in the same table), which the figure says. |
| `private-vehicle-solo` | One person per car/two-wheeler trip | Factors are per vehicle-km. |
| `commute-round-trip` | 2 × one-way, per working day | Onboarding asks for one-way distance. |
| `walk-cycle-max-distance` | ≤ 3 km one way | Suggested only where plausibly practical. |
| `equal-stove-efficiency` | Same useful heat per unit of fuel energy | Needed to compare gas and kerosene CO₂. Biomass excluded. |
| `window-stretch-length` | 3 hourly points | CAMS resolves 3-hour steps. Never a single hour. |
| `window-outdoor-hours` | 05:00–22:00 local | When people realistically go out. |
| `window-indicative-category` | CPCB category of a 3-h forecast mean is "indicative" | Breakpoints are 24-hour. A comparison aid, never shown as an AQI. |
| `window-materially-cleaner` | Better category **or** (≥ 30 µg/m³ **and** ≥ 25% lower PM2.5) | Product rule set by the project owner. The OR keeps big drops visible when everything is Severe. If nothing clears the bar, no winner is named. |
| `window-routine-stretch` | 3-h stretch from the last point at or before departure | Forecast points fall on the half hour in IST. |
| `distance-rounding` | Nearest 0.5 km | A rough guess needs no more precision; bounds distinct profiles and cached Gemini plans. |
| `plan-concurrency` | 4 plan generations at once per server instance | Bounds Gemini spend; when full, an immediate generic 502 and a retry button. |
| `plan-model-budget` | 50 s total; ≤ 20 s per model; no new attempt with < 8 s left | One shared deadline for the whole chain. |
| `plan-model-chain` | 3.1-flash-lite → 3.5-flash-lite → 3.8-flash → 3.6-flash | Quota is per model. Next model on quota, overload, timeout or retired model. Order from real plan requests; Lite daily limits unconfirmed. |
| `plan-hour` | One plan per city, language, answers and clock hour | Repeat requests share one model call. The forecast box is evaluated for the same hour, so it matches the plan. |
| `saving-lower-bound` | "At least", rounded down to 2 significant figures, with conditions | A floor only if the commuter travels alone (and a petrol car isn't a hybrid). Rounding to nearest could overstate it. |
| `plan-timeframe-binding` | Each number keeps its kind; measured numbers are quoted with their timeframe, per sentence | The 24-hour AQI needs "24 hours" and no "now"; the latest reading is never "now" or a forecast. Savings and forecast differences are never sent to Gemini, so it can't quote or reverse them; only the UI states them. |
| `plan-health-vocabulary` | One concept table (health, medical, safety, exposure, risk, caution) with words for every UI language | Any match rejects the whole plan. A new language fails to compile, and fails tests, until every concept has words for it. |

## Languages

All UI text comes from `getUiStrings(locale)` (`src/lib/i18n`). JSX contains no string literals: ESLint's `react/jsx-no-literals` checks JSX text and `npm run check:literals` checks user-facing attributes. Missing-data reasons stay as codes in the data layer and are translated only at render. Hindi advice and CPCB statements are Clearhour's translations of the English sources, and are marked as such on screen. To add a language: add its code to `LOCALES`, add `strings/<code>.ts` typed as `UiStrings`, register it in `BUNDLES`, add the key to the `Record<Locale, …>` data (city names, guidance, validator word lists) and an example sentence per concept in `tests/lexicon.test.ts`. The compiler lists anything missing.

## Known limitations

- **Gemini free-tier quota.** The daily allowance is small (20 requests for each Flash model; the Flash-Lite limits are unconfirmed). When it is used up, or models are overloaded, the plan is unavailable until later; everything else on the page works.
- **Shared OpenAQ limit.** All visitors share one API key. Many *different* cities requested within a minute can exhaust it, and the later ones say monitor readings couldn't be reached for a short while (seen on 2026-11-26 requesting all 26 cities back to back). The grounding cache is in server memory, so on serverless hosting it does little to prevent this. The per-IP rate limit does not stop many visitors adding up. The forecast is unaffected.
- **Bengaluru's monitor and PM2.5.** On 2026-11-26 the monitor chosen for Bengaluru reported PM10 but no PM2.5, so the page shows no 24-hour air level and says why. It does not fall back to another pollutant.
- **Reading lag.** CPCB readings usually reach OpenAQ a few hours late; the reading's time is shown.
- **One monitor stands for a city**, chosen nearest the city centre among those with a fresh reading.
- **A plan can be up to an hour old** and may quote an earlier reading than the page now shows; it states which.
- **Reading age uses the device clock**; a wrong clock gives a wrong "hours ago".
- The validator limits listed under [GenAI architecture](#genai-architecture).

## Running

```bash
npm install
cp .env.example .env.local        # OPENAQ_API_KEY (free, explore.openaq.org) and GEMINI_API_KEY
npm test                          # unit tests, no network
npm run typecheck && npm run lint && npm run check:literals
npm run dev                       # http://localhost:3000
npm run probe -- delhi lucknow    # live grounding snapshot per city
npm run window -- delhi 9         # live best-window verdict (city, departure hour)
npm run plan-probe -- delhi       # live Gemini plan through the validator, en and hi
```

Without `OPENAQ_API_KEY` the measured side fails closed and only the labelled forecast is shown. Without `GEMINI_API_KEY` only the plan is unavailable. Deployed on Vercel from `main`.
