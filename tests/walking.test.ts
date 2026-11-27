import { describe, expect, it } from "vitest";
import { NAQI_CATEGORY_ORDER } from "@/lib/grounding/aqi/cpcb";
import { buildPlanInput } from "@/lib/plan/packet";
import type { CommuteMode, HouseholdProfile } from "@/lib/profile/types";
import { swapsFor } from "@/lib/sourced/swaps";
import { input, snapshotNoStation } from "./planFixtures";

const walker = (mode: CommuteMode, oneWayKm = 2): HouseholdProfile => ({
  cityId: "delhi",
  commute: { mode, oneWayKm },
  cookingFuel: "electric",
  hasChildrenOrElderly: false,
  hasAirPurifier: false,
});
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);
const isWalk = (id: string) => id.endsWith("->walk-cycle");

describe.each(["car-petrol", "two-wheeler", "auto-rickshaw"] as const)("walking and cycling (%s, 2 km)", (mode) => {
  it.each(NAQI_CATEGORY_ORDER)("on a %s day", (category) => {
    const r = swapsFor(walker(mode), { basis: "measured-24h", category });
    const offered = [...ids(r.swaps), ...ids(r.withheld)].some(isWalk);
    const poorOrWorse = ["poor", "very-poor", "severe"].includes(category);
    expect(offered).toBe(!poorOrWorse);
    expect(r.gated.map((g) => g.reason)).toEqual(poorOrWorse ? ["poor-air-day"] : []);
  });

  it("is not suggested when there is no air level to check", () => {
    const r = swapsFor(walker(mode), { basis: "unknown" });
    expect([...ids(r.swaps), ...ids(r.withheld)].some(isWalk)).toBe(false);
    expect(r.gated[0]!.reason).toBe("air-level-unknown");
  });
});

describe("the gating rule is cited", () => {
  it("quotes the advice, including its poor-to-severe condition", () => {
    const [gated] = swapsFor(walker("car-petrol"), { basis: "measured-24h", category: "poor" }).gated;
    for (const q of gated!.why) {
      expect(q.citation).toBe("mohfw-air-advisory-2025");
      expect(q.quote).toMatch(/poor to severe/i);
      expect(q.quote).toMatch(/walk/i);
    }
  });

  it("on an ordinary day the walking figure claims no source recommendation", () => {
    const walk = swapsFor(walker("car-petrol"), { basis: "measured-24h", category: "good" }).swaps.find((s) => isWalk(s.id))!;
    expect(walk.co2Only).toBe("walking");
  });

  it("longer trips and public transport users get no gate notice", () => {
    expect(swapsFor(walker("car-petrol", 8), { basis: "measured-24h", category: "severe" }).gated).toEqual([]);
    expect(swapsFor(walker("bus"), { basis: "measured-24h", category: "severe" }).gated).toEqual([]);
  });
});

describe("the plan writer is never offered a gated walk", () => {
  const profile = walker("car-petrol");
  it.each([
    ["a Poor day", input.snapshot],
    ["no station", snapshotNoStation],
  ])("%s", (_, snapshot) => {
    const { packet, allowance } = buildPlanInput({ ...input, snapshot, profile });
    expect([...allowance.swapIds].some(isWalk)).toBe(false);
    expect(JSON.stringify(packet.swaps)).not.toMatch(/walk/i);
  });
});
