/**
 * Source registry. Every grounded value points at entries here by id, so the
 * UI can always render "where did this come from".
 *
 * `checked` records how the entry was verified when it was added, so a
 * reviewer can see what was confirmed and what still needs a primary-source
 * check.
 */

export interface Citation {
  readonly id: CitationId;
  readonly publisher: string;
  readonly title: string;
  readonly url: string;
  /** Secondary copy used to cross-check when the primary was unreachable. */
  readonly mirrorUrl?: string;
  readonly attribution?: string;
  readonly checked: {
    readonly on: string; // YYYY-MM-DD
    readonly how: "fetched-primary" | "fetched-mirror" | "api-docs";
    readonly note?: string;
  };
}

export type CitationId =
  | "openaq-v3"
  | "cpcb-caaqms"
  | "cpcb-naqi-2014"
  | "open-meteo-air-quality"
  | "cams-global";

export const CITATIONS: Readonly<Record<CitationId, Citation>> = {
  "openaq-v3": {
    id: "openaq-v3",
    publisher: "OpenAQ",
    title: "OpenAQ API v3 — locations, latest, sensor hourly averages",
    url: "https://docs.openaq.org/",
    checked: { on: "2026-11-25", how: "api-docs" },
  },
  "cpcb-caaqms": {
    id: "cpcb-caaqms",
    publisher: "Central Pollution Control Board (CPCB), Govt. of India",
    title: "Continuous Ambient Air Quality Monitoring Stations (CAAQMS) — data relayed via OpenAQ",
    url: "https://cpcb.nic.in/",
    checked: {
      on: "2026-11-25",
      how: "api-docs",
      note: "Station network identified at runtime from the OpenAQ provider field. cpcb.nic.in timed out from the build environment.",
    },
  },
  "cpcb-naqi-2014": {
    id: "cpcb-naqi-2014",
    publisher: "Central Pollution Control Board (CPCB), Govt. of India",
    title: "National Air Quality Index (Control of Urban Pollution Series CUPS/82/2014-15), Oct 2014 — breakpoints and 16-hour minimum for 24-h averages",
    url: "https://cpcb.nic.in/National-Air-Quality-Index/",
    mirrorUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7397983/table/table-1/",
    checked: {
      on: "2026-11-25",
      how: "fetched-mirror",
      note: "PM2.5/PM10 breakpoints cross-checked against the reproduced CPCB (2014) table in Resmi et al., PeerJ 2020. The primary CPCB URL was unreachable from the build environment; confirm it before release.",
    },
  },
  "open-meteo-air-quality": {
    id: "open-meteo-air-quality",
    publisher: "Open-Meteo",
    title: "Air Quality API (keyless) — hourly PM2.5/PM10 forecast",
    url: "https://open-meteo.com/en/docs/air-quality-api",
    attribution: "Air quality forecast by Open-Meteo.com (CC BY 4.0)",
    checked: { on: "2026-11-25", how: "fetched-primary" },
  },
  "cams-global": {
    id: "cams-global",
    publisher: "Copernicus Atmosphere Monitoring Service (CAMS), ECMWF",
    title: "CAMS global atmospheric composition forecasts (0.4° grid, 3-hourly) — a model, not an observation",
    url: "https://confluence.ecmwf.int/display/CKB/CAMS:+Global+atmospheric+composition+forecast+data+documentation",
    attribution: "Generated using Copernicus Atmosphere Monitoring Service information",
    checked: { on: "2026-11-25", how: "api-docs", note: "Resolution and time step as stated in the Open-Meteo data-source table." },
  },
};

export const cite = (id: CitationId): Citation => CITATIONS[id];
