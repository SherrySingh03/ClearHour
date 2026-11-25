/**
 * Supported UI languages. Adding one is a pure append:
 *   1. add its code to LOCALES and a LOCALE_META entry,
 *   2. add strings/<code>.ts typed as UiStrings,
 *   3. register it in BUNDLES (index.ts),
 *   4. add the code to every Record<Locale, string> in data (city names,
 *      guidance text). The compiler lists each one that is missing.
 */
export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_META: Readonly<Record<Locale, { readonly nativeName: string; readonly htmlLang: string; readonly intl: string }>> = {
  en: { nativeName: "English", htmlLang: "en", intl: "en-IN" },
  hi: { nativeName: "हिन्दी", htmlLang: "hi", intl: "hi-IN" },
};

export const isLocale = (x: unknown): x is Locale => typeof x === "string" && (LOCALES as readonly string[]).includes(x);
