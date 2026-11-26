/**
 * POST /api/plan  { cityId, locale, profile }  →  validated PlanResponse
 *
 * POST only (Next.js answers other methods with 405). The body is size-bounded
 * and validated before any work. Errors are generic: 400 for bad input, 502
 * when no validated plan can be produced. Upstream error text is never
 * reflected; only reason codes are logged on the server.
 */

import { NextResponse } from "next/server";
import { planHour } from "@/lib/plan/clock";
import { parsePlanRequest } from "@/lib/plan/request";
import { planLimiter } from "@/lib/plan/limiter";
import { getPlan } from "@/lib/plan/server";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(req: Request) {
  const parsed = await parsePlanRequest(req);
  if (!parsed) return NextResponse.json({ error: "bad-request" }, { status: 400, headers: NO_STORE });

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[plan]", JSON.stringify({ reason: "no-key" }));
    return NextResponse.json({ error: "plan-unavailable" }, { status: 502, headers: NO_STORE });
  }

  const release = planLimiter.tryAcquire();
  if (!release) {
    console.warn("[plan]", JSON.stringify({ reason: "busy" }));
    return NextResponse.json({ error: "plan-unavailable" }, { status: 502, headers: NO_STORE });
  }

  try {
    const plan = await getPlan(parsed.cityId, parsed.locale, parsed.profile, planHour(new Date()));
    // The plan is derived from a private household profile: never cache it in shared caches.
    return NextResponse.json(plan, { headers: { "cache-control": "private, no-store" } });
  } catch {
    // The reason is logged by getPlan, where it is still known.
    return NextResponse.json({ error: "plan-unavailable" }, { status: 502, headers: NO_STORE });
  } finally {
    release();
  }
}
