import { describe, expect, it } from "vitest";
import { buildPlanInput } from "@/lib/plan/packet";
import { SYSTEM_PROMPT } from "@/lib/plan/prompt";
import { input } from "./planFixtures";

// The model's behaviour can't be unit-tested; these stop the rules being edited away.
describe("prompt rules that protect cited advice", () => {
  it("forbids changing conditions or scope, ahead of the numbered rules, naming both failures", () => {
    const section = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("CONDITIONS AND SCOPE"), SYSTEM_PROMPT.indexOf("Rules (a plan"));
    expect(section).toContain("overrides every other instruction");
    expect(section).toContain("never widened, never narrowed, and never attached where the source has none");
    expect(section).toContain("dropping a condition");
    expect(section).toContain("adding or moving a condition");
  });

  it("lets the headline name children or older people only with a step that covers them", () => {
    expect(SYSTEM_PROMPT).toContain('only if one of your steps has refId "children-elderly-outdoors"');
  });

  it("keeps advice in its own step and out of the headline", () => {
    expect(SYSTEM_PROMPT).toContain("A note contains only the advice of its own refId");
    expect(SYSTEM_PROMPT).toContain("It is not advice");
  });

  it("keeps a three-hour stretch from standing for a longer period", () => {
    expect(SYSTEM_PROMPT).toContain("The best stretch is only three hours");
    expect(SYSTEM_PROMPT).toContain('must itself contain the word "forecast" or "predicted"');
    expect(SYSTEM_PROMPT).toContain("never call the measured 24-hour level a forecast");
  });

  it("quotes the advice examples as the app now words them", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/don't burn mosquito|closed rooms/i);
  });

  it("never offers a time as a time to be outside on a poor day", () => {
    expect(SYSTEM_PROMPT).toContain("no time is a good time to be outside");
  });

  it("does not push the model away from its source", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/Do not copy|only restates/i);
    expect(SYSTEM_PROMPT).toContain("Staying close to the item's own wording is fine");
  });
});

describe("the evidence behind each plan step", () => {
  it("carries verbatim quotes for every guidance and swap step, for the tap on the card", () => {
    const refs = Object.values(buildPlanInput(input).refs);
    for (const ref of refs) {
      if (ref.kind === "window") continue;
      const quotes = ref.kind === "guidance" ? ref.sources : ref.why;
      expect(quotes.length).toBeGreaterThan(0);
      for (const q of quotes) expect(q.quote.length).toBeGreaterThan(20);
    }
  });
});
