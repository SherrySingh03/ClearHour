import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTIONS } from "@/lib/assumptions";

describe("README stays in sync with the assumption registry", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  it.each(Object.keys(ASSUMPTIONS))("documents `%s`", (id) => {
    expect(readme).toContain(`\`${id}\``);
  });
});
