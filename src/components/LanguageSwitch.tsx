"use client";

import { LOCALE_META, LOCALES } from "@/lib/i18n";
import { useLocale } from "./LocaleContext";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div role="group" aria-label={t.common.language} className="flex rounded-full border border-ink/25 p-0.5 text-sm">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={LOCALE_META[l].htmlLang}
          aria-pressed={l === locale}
          onClick={() => setLocale(l)}
          className={`rounded-full px-3 py-1 ${l === locale ? "bg-ink text-smog" : "text-ink hover:bg-ink/10"}`}
        >
          {LOCALE_META[l].nativeName}
        </button>
      ))}
    </div>
  );
}
