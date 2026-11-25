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

export type NumberRole = "aqi-24h" | "latest-reading" | "forecast";

export interface NumberBinding {
  /** Normalised, as `extractNumbers` returns it. */
  readonly value: string;
  /** The unit it was shown with, or null for a unitless index. */
  readonly unit: "ugm3" | "pct" | null;
  readonly role: NumberRole;
}

/** Everything the validator needs to know about what the plan may contain. */
export interface PlanAllowance {
  readonly locale: Locale;
  /** Every number that appears in the input packet, normalised. */
  readonly numbers: ReadonlySet<string>;
  /** Numbers that appeared directly before each unit. A number next to a unit must come from the same unit. */
  readonly unitNumbers: Readonly<Record<"ugm3" | "kg" | "pct", ReadonlySet<string>>>;
  /**
   * What each measured or predicted number IS. A sentence quoting one must say
   * so: the 24-hour AQI as 24-hour, never "now"; the latest reading never as
   * "now" or a prediction; a forecast number as a forecast.
   */
  readonly bindings: readonly NumberBinding[];
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
      /** The alternative may not exist on this route (metro, local train, piped gas). */
      readonly onlyIfAvailable: boolean;
      readonly factors: readonly { readonly factorId: string; readonly value: number; readonly unit: string; readonly citation: CitationId | null }[];
    };

export interface PlanResponse {
  readonly plan: Plan;
  readonly refs: Readonly<Record<string, RefDetail>>;
}
