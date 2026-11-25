/**
 * GET /api/grounding?city=delhi  or  ?lat=28.61&lon=77.21
 *
 * Returns the GroundingSnapshot. Runs on the server so OPENAQ_API_KEY never
 * reaches the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createOpenAqClient, findCity, getGroundingSnapshot, isWithinIndiaBounds, type LatLon } from "@/lib/grounding";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const point = parsePoint(params);
  if (!point) {
    return NextResponse.json({ error: "bad-location" }, { status: 400 });
  }
  const openaq = createOpenAqClient({ apiKey: process.env.OPENAQ_API_KEY });
  const snapshot = await getGroundingSnapshot(point, { openaq });
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=300" },
  });
}

function parsePoint(params: URLSearchParams): LatLon | null {
  const cityId = params.get("city");
  if (cityId) return findCity(cityId)?.center ?? null;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!params.has("lat") || !params.has("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const p = { latitude: lat, longitude: lon };
  return isWithinIndiaBounds(p) ? p : null;
}
