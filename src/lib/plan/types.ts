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

export type NumberRole = "aqi-24h" | "latest-reading";

export interface NumberBinding {
  /** Normalised, as `numberTokens` returns it. */
  readonly value: string;
  /** The unit it was shown with, or null for a unitless index. */
  readonly unit: "ugm3" | null;
  readonly role: NumberRole;
}

/** Everything the validator needs to know about what the plan may contain. */
export interface PlanAllowance {
  readonly locale: Locale;
  /**
   * Every `kind:value` the plan may write: each number in the packet as the kind
   * it was written as. The only bare (unitless) number allowed is the 24-hour AQI.
   */
  readonly tokens: ReadonlySet<string>;
  /** Every value in the packet whatever its kind; tells "invented" from "misused". */
  readonly known: ReadonlySet<string>;
  /** Proper nouns containing digits (the station name), ignored by the number check. */
  readonly names: readonly string[];
  /**
   * What each measured number IS. A sentence quoting one must say so: the
   * 24-hour AQI as 24-hour, never "now"; the latest reading never as "now" or
   * a prediction.
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

/** A plan as served: reusable for an hour, so it says when it was written and from which reading. */
export interface PreparedPlan extends PlanResponse {
  readonly preparedAt: string;
  /** Time of the latest reading the writer was given, or null if it had none. */
  readonly readingUtc: string | null;
}
