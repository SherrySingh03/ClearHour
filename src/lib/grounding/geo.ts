import type { LatLon } from "./types";

const EARTH_RADIUS_KM = 6371.0088; // IUGG mean radius

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough bounding box of India, used to reject obviously wrong queries. */
export function isWithinIndiaBounds(p: LatLon): boolean {
  return p.latitude >= 6 && p.latitude <= 37.6 && p.longitude >= 68 && p.longitude <= 97.5;
}
