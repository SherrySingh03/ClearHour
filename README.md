# Clearhour

A GenAI air-quality assistant for Indian households during winter smog. It shows the measured air now (with station and timestamp), today's forecast curve with the cleanest outdoor stretch, indoor measures that help, and lower-emission swaps for the household's routine. Every claim carries its source.

> **Status:** grounding layer, sourced data and best-window logic are built and tested. The UI, onboarding, i18n and Gemini synthesis come next.

## Grounding contract

Nothing that can be measured or computed is generated.

| Kind | Source | How it is kept honest |
|---|---|---|
| **Measured** | CPCB CAAQMS ground stations via OpenAQ v3 (provider id 168) | `MeasuredValue` type carries station, sensor and observation timestamp. Never a model's guess. |
| **Forecast** | Open-Meteo Air Quality, CAMS global model | `ForecastPoint`/`ForecastSeries` types, branded so the compiler rejects them where a measurement is expected. Provenance records the 0.4° grid, 3-hour native step and that hourly values are interpolated. |
| **Computed** | CPCB NAQI formulas; published emission factors | Arithmetic on measured data or verified factors only, with the inputs attached. |
| **Sourced guidance** | MoHFW (2025), CPCB (2014), WHO (2025), US EPA (2018) | Every item quotes its source with a page locator. |

Missing data is reported as missing (`{ ok: false, reason }`). Measured and forecast are never blended into one number, and neither fills in for the other.

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
- **DEFRA/DESNZ 2026** conversion factors were downloaded but not used. They describe the UK fleet and grid, and India-specific factors exist for every mode we compute.
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
| `vehicle-representative-category` | Lowest-emitting common category | Onboarding doesn't ask engine size, so avoided emissions are a lower bound. |
| `private-vehicle-solo` | One person per car/two-wheeler trip | Factors are per vehicle-km. |
| `commute-round-trip` | 2 × one-way, per working day | Onboarding asks for one-way distance. |
| `walk-cycle-max-distance` | ≤ 3 km one way | Suggested only where plausibly practical. |
| `equal-stove-efficiency` | Same useful heat per unit of fuel energy | Needed to compare gas and kerosene CO₂. Biomass excluded. |
| `window-stretch-length` | 3 hourly points | CAMS resolves 3-hour steps. Never a single hour. |
| `window-outdoor-hours` | 05:00–22:00 local | When people realistically go out. |
| `window-indicative-category` | CPCB category of a 3-h forecast mean is "indicative" | Breakpoints are 24-hour. A comparison aid, never shown as an AQI. |
| `window-materially-cleaner` | Better category **or** (≥ 30 µg/m³ **and** ≥ 25% lower PM2.5) | Product rule set by the project owner. The OR keeps big drops visible when everything is Severe. If nothing clears the bar, no winner is named. |
| `window-routine-stretch` | 3-h stretch from the last point at or before departure | Forecast points fall on the half hour in IST. |

## Running

```bash
npm install
cp .env.example .env.local        # add OPENAQ_API_KEY (free, explore.openaq.org)
npm test                          # unit tests, no network
npm run typecheck
npm run probe -- delhi lucknow    # live grounding snapshot per city
npm run window -- delhi 9         # live best-window verdict (city, departure hour)
npm run dev                       # GET /api/grounding?city=delhi
```

Without `OPENAQ_API_KEY` the measured side fails closed and only the labelled forecast is returned.
