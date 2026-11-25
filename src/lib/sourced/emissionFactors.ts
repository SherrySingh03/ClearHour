/**
 * Emission factors. Every value was transcribed from the primary document
 * named in `citation` on 2026-11-25, at the `locator` given; `printedAs`
 * repeats the row as it appears there, so a reviewer can find and check it.
 *
 * Nothing here comes from memory. Factors that could not be verified are
 * absent, and the swaps that would need them fail closed (see swaps.ts).
 *
 * CO2 only (not CO2e): that is what the Indian transport sources publish.
 */

import type { CitationId } from "../grounding/citations";

export type FactorUnit = "kgCO2/vehicle-km" | "kgCO2/passenger-km" | "kgCO2/TJ";

export interface EmissionFactor {
  readonly id: FactorId;
  readonly value: number;
  readonly unit: FactorUnit;
  readonly citation: CitationId;
  readonly locator: string;
  /** The source row, verbatim. */
  readonly printedAs: string;
  /** Year the factor's underlying data describes. */
  readonly dataYear: string;
  readonly note?: string;
}

export type FactorId =
  | "car-petrol"
  | "car-diesel"
  | "car-cng"
  | "two-wheeler"
  | "bus-intracity"
  | "rail-suburban"
  | "lpg-combustion"
  | "natural-gas-combustion"
  | "kerosene-combustion";

const ROAD_TABLE = "Summary of Emission Factors, PDF pp. 11–12, column 'Emission Factor (kg CO2/km) with uplift factor'";

export const EMISSION_FACTORS: Readonly<Record<FactorId, EmissionFactor>> = {
  // Representative categories: see assumptions.ts#vehicle-representative-category.
  "car-petrol": {
    id: "car-petrol",
    value: 0.111,
    unit: "kgCO2/vehicle-km",
    citation: "ighgp-road-2015",
    locator: `Passenger Car row 1, ${ROAD_TABLE}`,
    printedAs: "1 Small <800 CC Gasoline 0.103 0.111",
    dataYear: "2015",
  },
  "car-diesel": {
    id: "car-diesel",
    value: 0.113,
    unit: "kgCO2/vehicle-km",
    citation: "ighgp-road-2015",
    locator: `Passenger Car row 22, ${ROAD_TABLE}`,
    printedAs: "22 Hatchback <1000 CC Diesel 0.105 0.113",
    dataYear: "2015",
  },
  "car-cng": {
    id: "car-cng",
    value: 0.068,
    unit: "kgCO2/vehicle-km",
    citation: "ighgp-road-2015",
    locator: `Passenger Car row 2, ${ROAD_TABLE}`,
    printedAs: "2 Small <800 CC CNG 0.063 0.068",
    dataYear: "2015",
    note: "The only CNG car row in the table.",
  },
  "two-wheeler": {
    id: "two-wheeler",
    value: 0.0319,
    unit: "kgCO2/vehicle-km",
    citation: "ighgp-road-2015",
    locator: `Two Wheelers row 4, ${ROAD_TABLE}`,
    printedAs: "4 Motorcycle <125 CC 0.0290 0.0319",
    dataYear: "2015",
  },
  "bus-intracity": {
    id: "bus-intracity",
    value: 0.015161,
    unit: "kgCO2/passenger-km",
    citation: "ighgp-road-2015",
    locator: "Summary of Emission Factors, 'Bus', PDF p. 12",
    printedAs: "The calculated emission factor for bus transport is 0.015161 kg CO2/pax-km.",
    dataYear: "2015",
    note: "Intracity buses only; the source says it does not apply to BRTS or intercity travel.",
  },
  "rail-suburban": {
    id: "rail-suburban",
    value: 0.007976,
    unit: "kgCO2/passenger-km",
    citation: "ighgp-rail-2015",
    locator: "Executive Summary, '2014-15 Passenger Transport', PDF p. 8",
    printedAs: "2014-15 Passenger Transport: (kg CO2 / Passenger – km) … 2.Suburban – 0.007976",
    dataYear: "FY 2014-15",
    note: "Indian Railways suburban services (e.g. Mumbai locals). Not a metro factor.",
  },
  "lpg-combustion": {
    id: "lpg-combustion",
    value: 63_100,
    unit: "kgCO2/TJ",
    citation: "ipcc-2006-v2-ch2",
    locator: "Table 2.5 (residential), CO2 default, PDF p. 22",
    printedAs: "Liquefied Petroleum Gases 63 100 61 600 65 600 …",
    dataYear: "2006",
  },
  "natural-gas-combustion": {
    id: "natural-gas-combustion",
    value: 56_100,
    unit: "kgCO2/TJ",
    citation: "ipcc-2006-v2-ch2",
    locator: "Table 2.5 (continued, residential), CO2 default, PDF p. 23",
    printedAs: "Natural Gas 56 100 54 300 58 300 …",
    dataYear: "2006",
  },
  "kerosene-combustion": {
    id: "kerosene-combustion",
    value: 71_900,
    unit: "kgCO2/TJ",
    citation: "ipcc-2006-v2-ch2",
    locator: "Table 2.5 (residential), 'Other Kerosene', CO2 default, PDF p. 22",
    printedAs: "Other Kerosene 71 900 70 800 73 700 …",
    dataYear: "2006",
  },
};

export const factor = (id: FactorId): EmissionFactor => EMISSION_FACTORS[id];
