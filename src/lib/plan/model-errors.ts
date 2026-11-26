/**
 * Why a model call failed, as a code. Used for logs and the fallback decision;
 * upstream error text is read here and never passed on.
 */

export type ModelFailureKind = "model-quota" | "model-overloaded" | "model-timeout" | "model-error";

export class ModelFailure extends Error {
  constructor(
    readonly kind: ModelFailureKind,
    /** HTTP status from the API, when there was one. */
    readonly status: number | null,
  ) {
    super(kind);
  }
}

export function classifyModelError(e: unknown): ModelFailure {
  if (e instanceof ModelFailure) return e;
  const message = e instanceof Error ? e.message : "";
  const name = e instanceof Error ? e.name : "";
  const own = (e as { status?: unknown } | null)?.status;
  const fromText = /"code":\s*(\d{3})/.exec(message)?.[1];
  const status = typeof own === "number" ? own : fromText ? Number(fromText) : null;

  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) return new ModelFailure("model-quota", status ?? 429);
  if ((status !== null && status >= 500) || /"status":\s*"UNAVAILABLE"/.test(message)) return new ModelFailure("model-overloaded", status);
  if (name === "AbortError" || name === "TimeoutError" || /aborted|timed? ?out/i.test(message)) return new ModelFailure("model-timeout", status);
  return new ModelFailure("model-error", status);
}
