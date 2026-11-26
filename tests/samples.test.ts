import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findCity } from "@/lib/grounding/cities";
import { isLocale } from "@/lib/i18n/locales";
import { parseProfile } from "@/lib/profile/storage";
import { SAMPLES } from "../scripts/samples.mjs";

describe("pre-warm samples", () => {
  it.each(SAMPLES.map((s) => [s.id, s] as const))("%s is exactly what the app would send, so it warms the entry an evaluator hits", (_, s) => {
    expect(isLocale(s.locale)).toBe(true);
    expect(parseProfile(s.profile)).toEqual(s.profile);
    expect(findCity(s.profile.cityId)).toBeTruthy();
  });

  it("covers the README's sample inputs A, B and C", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(SAMPLES.map((s) => s.id)).toEqual(["A", "B", "C"]);
    for (const s of SAMPLES) expect(readme).toContain(findCity(s.profile.cityId)!.names.en);
  });
});
