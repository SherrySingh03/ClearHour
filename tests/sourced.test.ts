import { describe, expect, it } from "vitest";
import { ASSUMPTIONS } from "@/lib/assumptions";
import { CITATIONS } from "@/lib/grounding/citations";
import type { HouseholdProfile } from "@/lib/profile/types";
import { EMISSION_FACTORS } from "@/lib/sourced/emissionFactors";
import { GUIDANCE, selectGuidance } from "@/lib/sourced/guidance";
import { swapsFor, type Swap } from "@/lib/sourced/swaps";

/** Swaps on an ordinary (Moderate) day; the poor-day gate is tested in walking.test.ts. */
const swapsOn = (p: Parameters<typeof swapsFor>[0]) => swapsFor(p, { basis: "measured-24h", category: "moderate" });

const profile = (over: Partial<HouseholdProfile> = {}, commute: Partial<HouseholdProfile["commute"]> = {}): HouseholdProfile => ({
  cityId: "delhi",
  cookingFuel: "png",
  hasChildrenOrElderly: false,
  hasAirPurifier: false,
  ...over,
  commute: { mode: "bus", oneWayKm: 10, ...commute },
});

const byId = (swaps: readonly Swap[], id: string) => swaps.find((s) => s.id === id);

describe("sourced data integrity", () => {
  it("every factor, guidance source and swap reason cites a registered source with a locator", () => {
    for (const f of Object.values(EMISSION_FACTORS)) {
      expect(CITATIONS[f.citation]).toBeDefined();
      expect(f.locator.length).toBeGreaterThan(5);
      expect(f.printedAs.length).toBeGreaterThan(5);
      expect(f.value).toBeGreaterThan(0);
    }
    for (const g of GUIDANCE) {
      expect(g.sources.length).toBeGreaterThan(0);
      for (const s of g.sources) {
        expect(CITATIONS[s.citation]).toBeDefined();
        expect(s.quote.length).toBeGreaterThan(10);
      }
      expect(g.text.en.length).toBeGreaterThan(10);
      expect(g.text.hi.length).toBeGreaterThan(10);
    }
  });

  it("every primary document entry carries a hash of the checked file", () => {
    for (const c of Object.values(CITATIONS)) {
      if (c.checked.how === "fetched-primary" && c.url.endsWith(".pdf")) expect(c.document?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("factor values match the printed source rows", () => {
    for (const f of Object.values(EMISSION_FACTORS)) {
      const printed = f.printedAs.replace(/(\d) (\d{3})/g, "$1$2");
      expect(printed).toContain(String(f.value));
    }
  });
});

describe("commute swaps", () => {
  it("petrol car, 10 km each way: bus and suburban rail with the arithmetic shown; metro withheld", () => {
    const { swaps, withheld } = swapsOn(profile({}, { mode: "car-petrol", oneWayKm: 10 }));
    const bus = byId(swaps, "commute:car-petrol->bus");
    expect(bus?.saving).toMatchObject({ quantity: "kgCO2-per-working-day", km: 20, from: { factorId: "car-petrol", value: 0.111 }, to: { factorId: "bus-intracity", value: 0.015161 } });
    expect(bus?.saving.value).toBeCloseTo((0.111 - 0.015161) * 20, 10);
    expect(byId(swaps, "commute:car-petrol->suburban-rail")?.saving.value).toBeCloseTo((0.111 - 0.007976) * 20, 10);
    expect(bus?.assumptions).toEqual(["vehicle-representative-category", "private-vehicle-solo", "commute-round-trip"]);
    expect(withheld).toEqual([expect.objectContaining({ id: "commute:car-petrol->metro", reason: "no-verified-metro-factor" })]);
    expect(byId(swaps, "commute:car-petrol->walk-cycle")).toBeUndefined();
  });

  it("offers walking or cycling only for short trips (≤ 3 km), with zero fuel", () => {
    const { swaps } = swapsOn(profile({}, { mode: "two-wheeler", oneWayKm: 2.5 }));
    const walk = byId(swaps, "commute:two-wheeler->walk-cycle");
    expect(walk?.saving.value).toBeCloseTo(0.0319 * 5, 10);
    expect(walk?.conditional).toBe(false);
    expect(byId(swaps, "commute:two-wheeler->bus")?.saving.value).toBeCloseTo((0.0319 - 0.015161) * 5, 10);
  });

  it("withholds every auto-rickshaw swap: no per-passenger factor", () => {
    const { swaps, withheld } = swapsOn(profile({}, { mode: "auto-rickshaw", oneWayKm: 6 }));
    expect(swaps.filter((s) => s.id.startsWith("commute:"))).toHaveLength(0);
    expect(withheld.every((w) => w.reason === "no-per-passenger-auto-factor")).toBe(true);
  });

  it.each(["bus", "metro", "suburban-rail", "walk-cycle", "none"] as const)("suggests nothing for %s", (mode) => {
    const { swaps, withheld } = swapsOn(profile({}, { mode }));
    expect([...swaps, ...withheld].filter((s) => s.id.startsWith("commute:"))).toHaveLength(0);
  });

  it("does nothing with a missing or zero distance", () => {
    expect(swapsOn(profile({}, { mode: "car-diesel", oneWayKm: 0 })).swaps).toHaveLength(0);
  });
});

describe("cooking swaps", () => {
  it("LPG → piped gas: % less CO2 per unit of heat from the IPCC factors", () => {
    const s = byId(swapsOn(profile({ cookingFuel: "lpg" })).swaps, "cooking:lpg->png");
    expect(s?.saving.value).toBeCloseTo(((63_100 - 56_100) / 63_100) * 100, 10);
    expect(s?.conditional).toBe(true);
    expect(s?.assumptions).toEqual(["equal-stove-efficiency"]);
  });

  it("kerosene → LPG", () => {
    expect(byId(swapsOn(profile({ cookingFuel: "kerosene" })).swaps, "cooking:kerosene->lpg")?.saving.value).toBeCloseTo(
      ((71_900 - 63_100) / 71_900) * 100,
      10,
    );
  });

  it("biomass → LPG is withheld (no comparable CO2 figure) but keeps its sourced reason", () => {
    const { swaps, withheld } = swapsOn(profile({ cookingFuel: "biomass" }));
    expect(swaps.filter((s) => s.id.startsWith("cooking:"))).toHaveLength(0);
    expect(withheld).toContainEqual(expect.objectContaining({ id: "cooking:biomass->lpg", reason: "biomass-co2-not-comparable" }));
  });
});

describe("indoor guidance selection", () => {
  const ids = (p: HouseholdProfile, signal: Parameters<typeof selectGuidance>[1]) => selectGuidance(p, signal).map((g) => g.item.id);

  it("on a Good measured day, shows only the always-on items", () => {
    const got = ids(profile(), { basis: "measured-24h", category: "good" });
    expect(got).toEqual(["kitchen-ventilation", "no-coils-incense", "no-angithi", "wet-mopping"]);
  });

  it("on a Very Poor day, adds the poor-day items that fit the household", () => {
    const got = ids(profile({ hasAirPurifier: true, hasChildrenOrElderly: true, cookingFuel: "biomass" }), {
      basis: "measured-24h",
      category: "very-poor",
    });
    expect(got).toEqual(
      expect.arrayContaining(["ventilate-midday", "purifier-run", "clean-cooking-fuel", "smoky-cooking-timing", "children-elderly-outdoors"]),
    );
    expect(got).not.toContain("purifier-choose");
  });

  it("with no category, keeps poor-day items but marks them as conditional, not as 'today is poor'", () => {
    const sel = selectGuidance(profile(), { basis: "unknown" });
    const vent = sel.find((g) => g.item.id === "ventilate-midday");
    expect(vent?.triggeredBy).toEqual({ basis: "unknown" });
  });

  it("keeps the forecast basis visible when a forecast triggered the item", () => {
    const sel = selectGuidance(profile(), { basis: "forecast-indicative", category: "severe" });
    expect(sel.find((g) => g.item.id === "ventilate-midday")?.triggeredBy).toEqual({ basis: "forecast-indicative", category: "severe" });
  });
});

describe("assumption registry", () => {
  it("every swap assumption is registered", () => {
    const all = swapsOn(profile({ cookingFuel: "lpg" }, { mode: "car-cng", oneWayKm: 2 })).swaps.flatMap((s) => s.assumptions);
    for (const a of all) expect(ASSUMPTIONS[a]).toBeDefined();
  });
});
