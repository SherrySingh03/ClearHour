import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // No user-facing string literals in JSX: all text comes from getUiStrings().
    // Attribute literals (aria-label="…", alt="…") are caught by scripts/check-jsx-literals.mjs.
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    rules: { "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
