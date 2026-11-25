"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, getFormatters, getUiStrings, type Formatters, type Locale, type UiStrings } from "@/lib/i18n";

export interface LocaleValue {
  readonly locale: Locale;
  readonly t: UiStrings;
  readonly f: Formatters;
  readonly setLocale: (l: Locale) => void;
}

const LocaleCtx = createContext<LocaleValue>({
  locale: DEFAULT_LOCALE,
  t: getUiStrings(DEFAULT_LOCALE),
  f: getFormatters(DEFAULT_LOCALE),
  setLocale: () => {},
});

export const LocaleProvider = LocaleCtx.Provider;

/** UI text and formatters for the current language. Components get all their words from here. */
export const useLocale = () => useContext(LocaleCtx);
