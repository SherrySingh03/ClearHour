/**
 * Complements ESLint's react/jsx-no-literals (which checks JSX text) by
 * scanning user-facing ATTRIBUTES for hard-coded strings, e.g.
 * aria-label="Close" or placeholder="City". Exits 1 if any are found.
 *
 *   node scripts/check-jsx-literals.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/components", "src/app"];
const ATTRS = ["aria-label", "aria-description", "aria-placeholder", "aria-valuetext", "alt", "title", "placeholder", "label"];
const pattern = new RegExp(`\\b(${ATTRS.join("|")})\\s*=\\s*(["'])(.*?)\\2`, "g");

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
};
ROOTS.forEach(walk);

const hits = [];
for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(pattern)) hits.push(`${file}:${i + 1}  ${m[1]}=${m[2]}${m[3]}${m[2]}`);
    });
}

if (hits.length) {
  console.log(`Found ${hits.length} user-facing attribute literal(s):\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`No user-facing attribute literals in ${files.length} .tsx files (${ATTRS.join(", ")}).`);
