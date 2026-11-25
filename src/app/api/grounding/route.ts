/**
 * GET /api/grounding?city=delhi  or  ?lat=28.61&lon=77.21
 *
 * Returns the public GroundingSnapshot: reason codes only, no upstream error
 * text. Runs on the server so OPENAQ_API_KEY never reaches the browser.
 * Coordinates are rounded to 0.01° before use (see `quantize`).
 *
 * Abuse protection beyond caching (per-IP rate limiting) belongs in the
 * Vercel Firewall, set up at deploy time.
 */

import { NextResponse, type NextRequest } from "next/server";
import { findCity, isWithinIndiaBounds, type LatLon } from "@/lib/grounding";
import { isCacheable, quantize } from "@/lib/grounding/public";
import { getPublicSnapshot } from "@/lib/grounding/server";

export async function GET(req: NextRequest) {
  const point = parsePoint(req.nextUrl.searchParams);
  if (!point) {
    return NextResponse.json({ error: "bad-location" }, { status: 400 });
  }
  const snapshot = await getPublicSnapshot(point.latitude, point.longitude);
  return NextResponse.json(snapshot, {
    headers: {
      "cache-control": isCacheable(snapshot)
        ? "public, s-maxage=600, stale-while-revalidate=300"
        : "no-store",
    },
  });
}

function parsePoint(params: URLSearchParams): LatLon | null {
  const cityId = params.get("city");
  if (cityId) return findCity(cityId)?.center ?? null;
  const rawLat = params.get("lat");
  const rawLon = params.get("lon");
  if (rawLat === null || rawLon === null) return null;
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = quantize({ latitude: lat, longitude: lon });
  return isWithinIndiaBounds(p) ? p : null;
}
