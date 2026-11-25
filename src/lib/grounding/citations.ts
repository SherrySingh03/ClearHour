/**
 * Source registry. Every grounded value, factor and guidance item points at
 * entries here by id, so the UI can always show where it came from.
 *
 * `document` pins the exact file that was read when the entry was checked:
 * the URL it came from and its SHA-256. If a publisher replaces a file, the
 * hash shows which version these numbers were checked against.
 */

export interface Citation {
  readonly id: CitationId;
  readonly publisher: string;
  readonly title: string;
  /** Year of publication, or "live" for an API. */
  readonly year: string;
  readonly url: string;
  readonly attribution?: string;
  readonly document?: {
    readonly sha256: string;
    /** Where the checked copy came from, if not `url` itself. */
    readonly retrievedFrom?: string;
  };
  readonly checked: {
    readonly on: string; // YYYY-MM-DD
    /**
     * fetched-primary: the publisher's own file, read in full.
     * fetched-primary-archived: the publisher's file via an Internet Archive capture (same bytes).
     * api-docs: documentation of a live API we call.
     */
    readonly how: "fetched-primary" | "fetched-primary-archived" | "api-docs";
    readonly note?: string;
  };
}

export type CitationId =
  | "openaq-v3"
  | "cpcb-caaqms"
  | "cpcb-naqi-2014"
  | "cpcb-aqi-calculator"
  | "open-meteo-air-quality"
  | "cams-global"
  | "mohfw-air-advisory-2025"
  | "epa-air-cleaners-2018"
  | "who-household-air-2025"
  | "ighgp-road-2015"
  | "ighgp-rail-2015"
  | "ipcc-2006-v2-ch2";

export const CITATIONS: Readonly<Record<CitationId, Citation>> = {
  "openaq-v3": {
    id: "openaq-v3",
    publisher: "OpenAQ",
    title: "OpenAQ API v3 — locations, latest, sensor hourly averages",
    year: "live",
    url: "https://docs.openaq.org/",
    checked: { on: "2026-11-25", how: "api-docs" },
  },
  "cpcb-caaqms": {
    id: "cpcb-caaqms",
    publisher: "Central Pollution Control Board (CPCB), Govt. of India",
    title: "Continuous Ambient Air Quality Monitoring Stations (CAAQMS), relayed via OpenAQ provider 168 \"CPCB\"",
    year: "live",
    url: "https://cpcb.gov.in/",
    checked: {
      on: "2026-11-25",
      how: "api-docs",
      note: "Provider id 168 confirmed live against OpenAQ. CPCB has moved from cpcb.nic.in to cpcb.gov.in.",
    },
  },
  "cpcb-naqi-2014": {
    id: "cpcb-naqi-2014",
    publisher: "Central Pollution Control Board (CPCB), Govt. of India",
    title:
      "National Air Quality Index (CUPS/82/2014-15). Table 3.11 breakpoints (AQI scale 0–500); Table 3.12 health statements; §3.7 16-hour minimum for a sub-index",
    year: "2014",
    url: "https://cpcb.gov.in/upload/national-air-quality-index/FINAL-REPORT_AQI_.pdf",
    document: { sha256: "d2b0fd754a8f9fb36919ec8d5a41e85a81b471dc4ebcf7831e3a1172aee8db37" },
    checked: {
      on: "2026-11-25",
      how: "fetched-primary",
      note: "Same file also served at airquality.cpcb.gov.in/ccr_docs/FINAL-REPORT_AQI_.pdf. Replaces the PeerJ 2020 reprint used before.",
    },
  },
  "cpcb-aqi-calculator": {
    id: "cpcb-aqi-calculator",
    publisher: "Central Pollution Control Board (CPCB), Govt. of India",
    title: "AQI Calculator (AQI-Calculator.xls): sub-index formulas in cells D8 (PM10) and D10 (PM2.5); health-statement legend B23–F28",
    year: "2015 (last saved 2022)",
    url: "https://cpcb.gov.in/upload/national-air-quality-index/AQI-Calculator.xls",
    document: { sha256: "92eb788f7f61bd46edea1814a9e1b8f5dd75d05dfb88f34a460905bc07bd151a" },
    checked: {
      on: "2026-11-25",
      how: "fetched-primary",
      note: "Cell formulas read directly. Linked from cpcb.gov.in/National-Air-Quality-Index/.",
    },
  },
  "open-meteo-air-quality": {
    id: "open-meteo-air-quality",
    publisher: "Open-Meteo",
    title: "Air Quality API (keyless) — hourly PM2.5/PM10 forecast",
    year: "live",
    url: "https://open-meteo.com/en/docs/air-quality-api",
    attribution: "Air quality forecast by Open-Meteo.com (CC BY 4.0)",
    checked: { on: "2026-11-25", how: "api-docs" },
  },
  "cams-global": {
    id: "cams-global",
    publisher: "Copernicus Atmosphere Monitoring Service (CAMS), ECMWF",
    title: "CAMS global atmospheric composition forecasts (0.4° grid, 3-hourly): a model, not an observation",
    year: "live",
    url: "https://confluence.ecmwf.int/display/CKB/CAMS:+Global+atmospheric+composition+forecast+data+documentation",
    attribution: "Generated using Copernicus Atmosphere Monitoring Service information",
    checked: {
      on: "2026-11-25",
      how: "api-docs",
      note: "Grid spacing and 3-hour step as stated in Open-Meteo's data-source table.",
    },
  },
  "mohfw-air-advisory-2025": {
    id: "mohfw-air-advisory-2025",
    publisher: "Ministry of Health and Family Welfare (MoHFW), Govt. of India — NCDC / NPCCHH",
    title: "Advisory on Air Pollution and Health (enclosed with the Health Secretary's D.O. letter dated 01.11.2025)",
    year: "2025",
    url: "https://ncdc.mohfw.gov.in/uploads/pdf/air2.pdf",
    document: { sha256: "1f536f1c2bda53d3a82bb5ce6d77ffdcae2dd39b0d61f1555bbb2c6880a7e701" },
    checked: {
      on: "2026-11-25",
      how: "fetched-primary",
      note: "Scanned PDF. Quotes are from OCR, with obvious OCR misspellings corrected (e.g. 'buming' → 'burning'); wording otherwise unchanged.",
    },
  },
  "epa-air-cleaners-2018": {
    id: "epa-air-cleaners-2018",
    publisher: "U.S. Environmental Protection Agency (EPA)",
    title: "Guide to Air Cleaners in the Home, 2nd edition (EPA 402-F-08-004)",
    year: "2018",
    url: "https://www.epa.gov/sites/default/files/2018-07/documents/guide_to_air_cleaners_in_the_home_2nd_edition.pdf",
    document: { sha256: "413ff78ecf5e2d77e997cc96ba19c4bdf411df78c8ce974937922a4dfb408f8e" },
    checked: { on: "2026-11-25", how: "fetched-primary" },
  },
  "who-household-air-2025": {
    id: "who-household-air-2025",
    publisher: "World Health Organization (WHO)",
    title: "Household air pollution — fact sheet (16 December 2025), summarising the WHO Guidelines for indoor air quality: household fuel combustion",
    year: "2025",
    url: "https://www.who.int/news-room/fact-sheets/detail/household-air-pollution-and-health",
    checked: { on: "2026-11-25", how: "fetched-primary", note: "Web page; no hash because the HTML is dynamic." },
  },
  "ighgp-road-2015": {
    id: "ighgp-road-2015",
    publisher: "India GHG Program (WRI India, CII, TERI)",
    title: "India Specific Road Transport Emission Factors, Version 1.0",
    year: "2015",
    url: "https://indiaghgp.org/sites/default/files/Road%20Transport%20Technical%20Paper.pdf",
    document: { sha256: "82c52c2be6349b3119d3cfbe274c22f26dc6bfcacc2e3f02f13d338d59a04b67" },
    checked: {
      on: "2026-11-25",
      how: "fetched-primary",
      note: "Summary tables on PDF pp. 11–12. Car and two-wheeler values use the paper's 'with uplift factor' column (real-world adjustment of 8% for cars and 10% for two-wheelers).",
    },
  },
  "ighgp-rail-2015": {
    id: "ighgp-rail-2015",
    publisher: "India GHG Program (WRI India, CII, TERI)",
    title: "India Specific Rail Transport Emission Factors, Version 1.0",
    year: "2015",
    url: "https://indiaghgp.org/sites/default/files/Rail%20Transport%20Emission.pdf",
    document: { sha256: "7cc44c272a4677f71e69f173d09c0192420e2dbf71e296d9afc679f3edab66f9" },
    checked: { on: "2026-11-25", how: "fetched-primary", note: "Executive summary, PDF p. 8; FY 2014-15 values." },
  },
  "ipcc-2006-v2-ch2": {
    id: "ipcc-2006-v2-ch2",
    publisher: "IPCC (Intergovernmental Panel on Climate Change)",
    title: "2006 IPCC Guidelines for National Greenhouse Gas Inventories, Vol. 2 Energy, Ch. 2 Stationary Combustion — Table 2.5 (residential defaults)",
    year: "2006",
    url: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/2_Volume2/V2_2_Ch2_Stationary_Combustion.pdf",
    document: { sha256: "a25d9f96d7672df391b328de79d4cfd812c07fe79d5cf4a30d23d82d8f02985b" },
    checked: {
      on: "2026-11-25",
      how: "fetched-primary",
      note: "Table 2.5 on PDF pp. 22–23. CO2 values cross-checked against Vol. 2 Ch. 1 Table 1.4 (identical).",
    },
  },
};

export const cite = (id: CitationId): Citation => CITATIONS[id];
