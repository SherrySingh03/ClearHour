/**
 * Low-emission swaps for the household's stated routine.
 *
 * A swap is shown with a number only when every factor in the calculation
 * is in emissionFactors.ts (i.e. verified against its primary document).
 * Otherwise it is returned as `withheld` with a reason code, and the UI may
 * mention it without a number. Nothing is estimated to fill a gap.
 */

import type { AssumptionId } from "../assumptions";
import type { CitationId } from "../grounding/citations";
import type { CommuteMode, CookingFuel, HouseholdProfile } from "../profile/types";
import { factor, type FactorId } from "./emissionFactors";

/** Clearhour judgment call: assumptions.ts#walk-cycle-max-distance. */
export const WALK_CYCLE_MAX_ONE_WAY_KM = 3;

export interface SourcedReason {
  readonly citation: CitationId;
  readonly locator: string;
  /** Verbatim from the source (OCR misspellings corrected where noted in the citation). */
  readonly quote: string;
}

export type TransportTarget = "bus" | "suburban-rail" | "metro" | "walk-cycle";

export type SwapId =
  | `commute:${CommuteMode}->${TransportTarget}`
  | "cooking:lpg->png"
  | "cooking:kerosene->lpg"
  | "cooking:biomass->lpg";

/** A term in the calculation, shown so the user sees the factor and its source. */
export interface FactorTerm {
  readonly factorId: FactorId | "none";
  readonly value: number;
  readonly unit: string;
}

export type ComputedSaving =
  | {
      readonly kind: "computed";
      readonly quantity: "kgCO2-per-working-day";
      readonly value: number;
      /** value = (from − to) × km */
      readonly from: FactorTerm;
      readonly to: FactorTerm;
      readonly km: number;
    }
  | {
      readonly kind: "computed";
      readonly quantity: "percent-less-CO2-per-unit-heat";
      /** value = (from − to) / from × 100 */
      readonly value: number;
      readonly from: FactorTerm;
      readonly to: FactorTerm;
    };

export interface Swap {
  readonly id: SwapId;
  readonly saving: ComputedSaving;
  readonly assumptions: readonly AssumptionId[];
  /** Why this swap is suggested at all, from a published source. */
  readonly why: readonly SourcedReason[];
  /** The target may not be available (no metro/rail/piped gas nearby); the UI says "if available". */
  readonly conditional: boolean;
  /**
   * No source recommends this swap: `why` is background on the fuels, and the
   * UI says the swap rests on the CO2 figure alone.
   */
  readonly co2Only: boolean;
}

export type WithheldReason =
  | "no-verified-metro-factor"
  | "no-per-passenger-auto-factor"
  | "biomass-co2-not-comparable";

export interface WithheldSwap {
  readonly id: SwapId;
  readonly reason: WithheldReason;
  readonly why: readonly SourcedReason[];
}

export interface SwapResult {
  readonly swaps: readonly Swap[];
  readonly withheld: readonly WithheldSwap[];
}

// ---------------------------------------------------------------------------
// Published reasons for suggesting a swap
// ---------------------------------------------------------------------------

const WHY_PUBLIC_TRANSPORT: readonly SourcedReason[] = [
  {
    citation: "mohfw-air-advisory-2025",
    locator: "Annexure II (Social Media Messages), item 20, PDF p. 23",
    quote: "Use public transport whenever possible to reduce air pollution.",
  },
  {
    citation: "cpcb-naqi-2014",
    locator: "§3.4 Broad Guidelines for Actions during Very Poor and Severe Categories, 'Public', report pp. 36–37",
    quote:
      "during severe or very poor AQI categories, people should minimize travel; avoid using private vehicles and instead use public transport, bikes or walk, and carpool",
  },
];

const WHY_CLEAN_COOKING: readonly SourcedReason[] = [
  {
    citation: "mohfw-air-advisory-2025",
    locator: "Annexure I, section I (General Population), item 2, PDF p. 20",
    quote:
      "Avoid burning biomass such as wood, coal, animal dung, kerosene. Use clean smokeless fuels (gas or electricity) for cooking and heating purposes. If using biomass, use clean cook stoves.",
  },
  {
    citation: "who-household-air-2025",
    locator: "Fact sheet, section 'Guidance'",
    quote: "Guidelines for indoor air quality: household fuel combustion, which offer practical evidence-based guidance on what fuels and technologies used in the home can be considered clean, including recommendations discouraging use of kerosene and recommending against use of unprocessed coal",
  },
];

const WHY_GAS_IS_CLEAN: readonly SourcedReason[] = [
  {
    citation: "who-household-air-2025",
    locator: "Fact sheet, section 'Key facts'",
    // "These" refers to the sentence before, which the quote therefore includes.
    quote:
      "It is essential to expand use of clean fuels and technologies to reduce household air pollution and protect health. These include solar, electricity, biogas, liquefied petroleum gas (LPG), natural gas, alcohol fuels, as well as biomass stoves that meet the emission targets in the WHO Guidelines.",
  },
];

// ---------------------------------------------------------------------------
// Commute
// ---------------------------------------------------------------------------

const PRIVATE_VEHICLE_FACTOR: Partial<Record<CommuteMode, FactorId>> = {
  "car-petrol": "car-petrol",
  "car-diesel": "car-diesel",
  "car-cng": "car-cng",
  "two-wheeler": "two-wheeler",
};

const TARGET_FACTOR: Readonly<Record<Exclude<TransportTarget, "metro">, FactorId | "none">> = {
  bus: "bus-intracity",
  "suburban-rail": "rail-suburban",
  "walk-cycle": "none", // no fuel burned
};

function term(id: FactorId | "none"): FactorTerm {
  if (id === "none") return { factorId: "none", value: 0, unit: "kgCO2/passenger-km" };
  const f = factor(id);
  return { factorId: id, value: f.value, unit: f.unit };
}

function commuteSwaps(mode: CommuteMode, oneWayKm: number): SwapResult {
  if (!(oneWayKm > 0)) return { swaps: [], withheld: [] };
  const targets: TransportTarget[] = ["bus", "suburban-rail", "metro"];
  if (oneWayKm <= WALK_CYCLE_MAX_ONE_WAY_KM) targets.push("walk-cycle");

  if (mode === "auto-rickshaw") {
    return {
      swaps: [],
      withheld: targets.map((t) => ({
        id: `commute:${mode}->${t}` as const,
        reason: "no-per-passenger-auto-factor",
        why: WHY_PUBLIC_TRANSPORT,
      })),
    };
  }

  const fromId = PRIVATE_VEHICLE_FACTOR[mode];
  // Bus, rail, metro, walking, cycling or no commute: already low-emission.
  if (!fromId) return { swaps: [], withheld: [] };

  const km = 2 * oneWayKm; // assumptions.ts#commute-round-trip
  const from = term(fromId);
  const swaps: Swap[] = [];
  const withheld: WithheldSwap[] = [];

  for (const t of targets) {
    const id = `commute:${mode}->${t}` as const;
    if (t === "metro") {
      withheld.push({ id, reason: "no-verified-metro-factor", why: WHY_PUBLIC_TRANSPORT });
      continue;
    }
    const to = term(TARGET_FACTOR[t]);
    const value = (from.value - to.value) * km;
    if (!(value > 0)) continue; // never suggest a swap that doesn't reduce emissions
    swaps.push({
      id,
      saving: { kind: "computed", quantity: "kgCO2-per-working-day", value, from, to, km },
      assumptions: ["vehicle-representative-category", "private-vehicle-solo", "commute-round-trip"],
      why: WHY_PUBLIC_TRANSPORT,
      conditional: t !== "walk-cycle",
      co2Only: false,
    });
  }
  return { swaps, withheld };
}

// ---------------------------------------------------------------------------
// Cooking
// ---------------------------------------------------------------------------

function percentLess(fromId: FactorId, toId: FactorId): ComputedSaving {
  const from = term(fromId);
  const to = term(toId);
  return { kind: "computed", quantity: "percent-less-CO2-per-unit-heat", value: ((from.value - to.value) / from.value) * 100, from, to };
}

function cookingSwaps(fuel: CookingFuel): SwapResult {
  switch (fuel) {
    case "lpg":
      return {
        swaps: [
          {
            id: "cooking:lpg->png",
            saving: percentLess("lpg-combustion", "natural-gas-combustion"),
            assumptions: ["equal-stove-efficiency"],
            why: WHY_GAS_IS_CLEAN, // lists LPG and natural gas alike as clean: not a case for switching
            conditional: true, // only where piped gas is available
            co2Only: true,
          },
        ],
        withheld: [],
      };
    case "kerosene":
      return {
        swaps: [
          {
            id: "cooking:kerosene->lpg",
            saving: percentLess("kerosene-combustion", "lpg-combustion"),
            assumptions: ["equal-stove-efficiency"],
            why: WHY_CLEAN_COOKING,
            conditional: false,
            co2Only: false,
          },
        ],
        withheld: [],
      };
    case "biomass":
      // The case for switching is indoor air (see guidance.ts), not a CO2 figure:
      // IPCC treats biomass CO2 as biogenic, and stove efficiencies differ too much.
      return { swaps: [], withheld: [{ id: "cooking:biomass->lpg", reason: "biomass-co2-not-comparable", why: WHY_CLEAN_COOKING }] };
    case "png":
    case "electric":
      return { swaps: [], withheld: [] };
  }
}

export function swapsFor(profile: HouseholdProfile): SwapResult {
  const c = commuteSwaps(profile.commute.mode, profile.commute.oneWayKm);
  const k = cookingSwaps(profile.cookingFuel);
  return { swaps: [...c.swaps, ...k.swaps], withheld: [...c.withheld, ...k.withheld] };
}
