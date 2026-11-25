import type { CitationId } from "../grounding/citations";
import type { ForecastMissingReason, MeasuredMissingReason, NaqiMissingReason } from "../grounding/types";
import type { Locale } from "../i18n/locales";

/** A missing piece of grounding data. The plan must acknowledge every one. */
export type GapCode = `measured:${MeasuredMissingReason}` | `aqi:${NaqiMissingReason}` | `forecast:${ForecastMissingReason}`;

export type StepKind = "window" | "guidance" | "swap";

/** What Gemini returns: references to grounded items, plus short plain-language notes. */
export interface PlanStep {
  readonly kind: StepKind;
  readonly refId: string;
  readonly note: string;
}

export interface Plan {
  readonly headline: string;
  readonly steps: readonly PlanStep[];
  readonly acknowledgedGaps: readonly GapCode[];
}

/** Everything the validator needs to know about what the plan may contain. */
export interface PlanAllowance {
  readonly locale: Locale;
  /** Every number that appears in the input packet, normalised. */
  readonly numbers: ReadonlySet<string>;
  readonly guidanceIds: ReadonlySet<string>;
  readonly swapIds: ReadonlySet<string>;
  readonly windowAvailable: boolean;
  readonly gaps: readonly GapCode[];
}

/** Grounded detail for each id the plan may reference, rendered by the UI (never by Gemini). */
export type RefDetail =
  | { readonly kind: "window" }
  | { readonly kind: "guidance"; readonly text: string; readonly sources: readonly { readonly citation: CitationId; readonly locator: string; readonly quote: string }[] }
  | {
      readonly kind: "swap";
      readonly action: string;
      readonly saving: string;
      readonly factors: readonly { readonly factorId: string; readonly value: number; readonly unit: string; readonly citation: CitationId | null }[];
    };

export interface PlanResponse {
  readonly plan: Plan;
  readonly refs: Readonly<Record<string, RefDetail>>;
}
