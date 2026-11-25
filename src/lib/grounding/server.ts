/**
 * Server entry point: a cached, public-safe snapshot for a rounded point.
 *
 * The cache key is (latitude, longitude) after `quantize`. Complete
 * snapshots live 10 minutes (CPCB data only reaches OpenAQ every ~15–60 min
 * anyway). Snapshots hit by an outage use the `seconds` profile, so they
 * are retried quickly instead of being served for 10 minutes.
 */

import { cacheLife } from "next/cache";
import { createOpenAqClient } from "./clients/openaq";
import { failureNotes, isCacheable, toPublicSnapshot } from "./public";
import { getGroundingSnapshot } from "./snapshot";
import type { GroundingSnapshot } from "./types";

export async function getPublicSnapshot(latitude: number, longitude: number): Promise<GroundingSnapshot> {
  "use cache";
  const openaq = createOpenAqClient({ apiKey: process.env.OPENAQ_API_KEY });
  const snapshot = await getGroundingSnapshot({ latitude, longitude }, { openaq });

  const notes = failureNotes(snapshot);
  if (notes.length > 0) {
    // Area only (0.1° ≈ 11 km), never the rounded point we were asked about.
    // `detail` never includes the API key (it travels only in a request header);
    // it is capped so a large upstream body cannot flood the log.
    const area = `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
    const logged = notes.map((n) => (n.detail ? { ...n, detail: n.detail.slice(0, 200) } : n));
    console.warn("[grounding]", JSON.stringify({ area, notes: logged }));
  }

  // JUDGMENT CALL — assumptions.ts#snapshot-cache
  if (isCacheable(snapshot)) cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  else cacheLife("seconds");

  return toPublicSnapshot(snapshot);
}
