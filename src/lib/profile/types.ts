/**
 * Household profile from onboarding. Stored only on the device.
 * Every field maps to one onboarding question.
 */

export type CommuteMode =
  | "car-petrol"
  | "car-diesel"
  | "car-cng"
  | "two-wheeler"
  | "auto-rickshaw"
  | "bus"
  | "metro"
  | "suburban-rail"
  | "walk-cycle"
  | "none";

export type CookingFuel = "lpg" | "png" | "electric" | "biomass" | "kerosene";

export interface HouseholdProfile {
  readonly cityId: string;
  readonly commute: {
    readonly mode: CommuteMode;
    /** One-way distance the user estimates, km. Ignored for "none". */
    readonly oneWayKm: number;
    /** Usual departure, local clock hour 0–23. Optional: the plan works without it. */
    readonly departureHour?: number;
  };
  readonly cookingFuel: CookingFuel;
  /** Children or elderly people live in the household. */
  readonly hasChildrenOrElderly: boolean;
  readonly hasAirPurifier: boolean;
}
