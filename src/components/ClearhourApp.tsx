"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, getFormatters, getUiStrings, LOCALE_META, type Locale } from "@/lib/i18n";
import { loadLocale, loadProfile, saveLocale, saveProfile } from "@/lib/profile/storage";
import type { HouseholdProfile } from "@/lib/profile/types";
import { Home } from "./Home";
import { LocaleProvider } from "./LocaleContext";
import { Onboarding } from "./Onboarding";

type ProfileState = { status: "loading" } | { status: "none" } | { status: "editing"; current: HouseholdProfile } | { status: "ready"; profile: HouseholdProfile };

export function ClearhourApp() {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  // Device storage is only readable in the browser, so it is read after mount.
  useEffect(() => {
    const storedLocale = loadLocale();
    const storedProfile = loadProfile();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from device storage */
    if (storedLocale) setLocaleState(storedLocale);
    setState(storedProfile ? { status: "ready", profile: storedProfile } : { status: "none" });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].htmlLang;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveLocale(l);
  }, []);

  const value = useMemo(() => ({ locale, t: getUiStrings(locale), f: getFormatters(locale), setLocale }), [locale, setLocale]);

  const finish = (p: HouseholdProfile) => {
    saveProfile(p);
    setState({ status: "ready", profile: p });
  };

  return (
    <LocaleProvider value={value}>
      {state.status === "loading" && <p className="mx-auto max-w-2xl px-4 py-10 text-muted">{value.t.common.loading}</p>}
      {state.status === "none" && <Onboarding initial={null} onDone={finish} />}
      {state.status === "editing" && <Onboarding initial={state.current} onDone={finish} />}
      {state.status === "ready" && <Home profile={state.profile} onEdit={() => setState({ status: "editing", current: state.profile })} />}
    </LocaleProvider>
  );
}
