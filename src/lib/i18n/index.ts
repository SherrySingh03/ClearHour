import { LOCALE_META, type Locale } from "./locales";
import { en, type UiStrings } from "./strings/en";
import { hi } from "./strings/hi";

export * from "./locales";
export type { UiStrings } from "./strings/en";

const BUNDLES: Readonly<Record<Locale, UiStrings>> = { en, hi };

/** The only way UI code gets user-facing text. */
export function getUiStrings(locale: Locale): UiStrings {
  return BUNDLES[locale];
}

/** Locale-aware number and time formatting. Times are always shown in IST. */
export function getFormatters(locale: Locale) {
  const { intl: tag, dayPeriodWords } = LOCALE_META[locale];
  const period = dayPeriodWords ? ({ dayPeriod: "short" } as const) : {};
  const time = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata", ...period });
  const hourOnly = new Intl.DateTimeFormat(tag, { hour: "numeric", timeZone: "Asia/Kolkata", ...period });
  return {
    number: (n: number, maxFractionDigits = 0) =>
      new Intl.NumberFormat(tag, { maximumFractionDigits: maxFractionDigits }).format(n),
    time: (iso: string) => time.format(new Date(iso)),
    hour: (iso: string) => hourOnly.format(new Date(iso)),
    timeRange: (startIso: string, endIso: string) => time.formatRange(new Date(startIso), new Date(endIso)),
    /** A local clock hour (0–23) on today's date, as a time label. */
    clockHour: (hour: number) => time.format(new Date(Date.UTC(2026, 0, 1, hour, 0) - 5.5 * 3_600_000)),
  };
}

export type Formatters = ReturnType<typeof getFormatters>;
