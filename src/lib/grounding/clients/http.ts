/**
 * Small fetch wrapper. It never throws on upstream problems: every failure
 * comes back as a typed error, so callers can fail closed explicitly.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpFailure =
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "timeout" }
  | { readonly kind: "status"; readonly status: number }
  | { readonly kind: "invalid-json" };

export type HttpResult = { readonly ok: true; readonly json: unknown } | { readonly ok: false; readonly error: HttpFailure };

export interface HttpOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

export async function getJson(url: string, opts: HttpOptions = {}): Promise<HttpResult> {
  const doFetch = opts.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(url, {
      headers: { accept: "application/json", ...opts.headers },
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: { kind: "status", status: res.status } };
    try {
      return { ok: true, json: await res.json() };
    } catch {
      return { ok: false, error: { kind: "invalid-json" } };
    }
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, error: { kind: "timeout" } };
    return { ok: false, error: { kind: "network", message: e instanceof Error ? e.message : String(e) } };
  } finally {
    clearTimeout(timer);
  }
}

export function describeHttpFailure(e: HttpFailure): string {
  switch (e.kind) {
    case "network":
      return `network: ${e.message}`;
    case "timeout":
      return "timeout";
    case "status":
      return `HTTP ${e.status}`;
    case "invalid-json":
      return "invalid JSON";
  }
}
