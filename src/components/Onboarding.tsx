"use client";

import { useId, useState, type ReactNode } from "react";
import { CITIES } from "@/lib/grounding/cities";
import { COMMUTE_MODES, COOKING_FUELS, MAX_ONE_WAY_KM, roundKm } from "@/lib/profile/storage";
import type { CommuteMode, CookingFuel, HouseholdProfile } from "@/lib/profile/types";
import { LanguageSwitch } from "./LanguageSwitch";
import { useLocale } from "./LocaleContext";

interface Draft {
  cityId: string;
  mode: CommuteMode | null;
  km: string;
  departureHour: number | null;
  cookingFuel: CookingFuel | null;
  hasChildrenOrElderly: boolean | null;
  hasAirPurifier: boolean | null;
}

const STEPS = ["city", "commute", "cooking", "household", "purifier"] as const;
type Step = (typeof STEPS)[number];
const DEPARTURE_HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 05:00–22:00

function fromProfile(p: HouseholdProfile | null): Draft {
  return {
    cityId: p?.cityId ?? "",
    mode: p?.commute.mode ?? null,
    km: p && p.commute.mode !== "none" ? String(p.commute.oneWayKm) : "",
    departureHour: p?.commute.departureHour ?? null,
    cookingFuel: p?.cookingFuel ?? null,
    hasChildrenOrElderly: p?.hasChildrenOrElderly ?? null,
    hasAirPurifier: p?.hasAirPurifier ?? null,
  };
}

function parseKm(s: string): number | null {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= MAX_ONE_WAY_KM ? Math.max(0.5, roundKm(n)) : null;
}

function toProfile(d: Draft): HouseholdProfile | null {
  if (!d.cityId || !d.mode || !d.cookingFuel || d.hasChildrenOrElderly === null || d.hasAirPurifier === null) return null;
  const km = d.mode === "none" ? 0 : parseKm(d.km);
  if (km === null) return null;
  const commute = d.mode === "none" || d.departureHour === null ? { mode: d.mode, oneWayKm: km } : { mode: d.mode, oneWayKm: km, departureHour: d.departureHour };
  return { cityId: d.cityId, commute, cookingFuel: d.cookingFuel, hasChildrenOrElderly: d.hasChildrenOrElderly, hasAirPurifier: d.hasAirPurifier };
}

function stepComplete(step: Step, d: Draft): boolean {
  switch (step) {
    case "city":
      return d.cityId !== "";
    case "commute":
      return d.mode === "none" || (d.mode !== null && parseKm(d.km) !== null);
    case "cooking":
      return d.cookingFuel !== null;
    case "household":
      return d.hasChildrenOrElderly !== null;
    case "purifier":
      return d.hasAirPurifier !== null;
  }
}

export function Onboarding({ initial, onDone }: { initial: HouseholdProfile | null; onDone: (p: HouseholdProfile) => void }) {
  const { t, f, locale } = useLocale();
  const o = t.onboarding;
  const [draft, setDraft] = useState<Draft>(() => fromProfile(initial));
  const [i, setI] = useState(0);
  const step = STEPS[i]!;
  const last = i === STEPS.length - 1;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const advance = () => {
    if (!stepComplete(step, draft)) return;
    if (!last) return setI(i + 1);
    const p = toProfile(draft);
    if (p) onDone(p);
  };

  const cities = [...CITIES].sort((a, b) => a.names[locale].localeCompare(b.names[locale], locale));

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-6 pb-10">
      <header className="flex items-center justify-between gap-4">
        <p className="type-condensed text-2xl font-semibold">{t.app.name}</p>
        <LanguageSwitch />
      </header>

      {i === 0 ? (
        <div className="mt-10">
          <h1 className="type-condensed text-4xl leading-tight font-semibold">{o.title}</h1>
          <p className="mt-2 text-lg">{o.intro}</p>
          <p className="mt-1 text-sm text-muted">{o.privacy}</p>
        </div>
      ) : (
        <h1 className="sr-only">{o.title}</h1>
      )}

      <form
        className={`${i === 0 ? "mt-8" : "mt-6"} flex flex-1 flex-col`}
        onSubmit={(e) => {
          e.preventDefault();
          advance();
        }}
      >
        <p className="text-sm text-muted" aria-live="polite">
          {o.progress({ n: i + 1, total: STEPS.length })}
        </p>
        <div className="mt-1 h-1 w-full rounded-full bg-smog-deep">
          <div className="h-1 rounded-full bg-ink" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} />
        </div>

        <div className="mt-6 flex-1">
          {step === "city" && (
            <Question legend={o.city.question} why={o.city.why}>
              <select
                value={draft.cityId}
                onChange={(e) => set({ cityId: e.target.value })}
                className="w-full rounded-lg border border-ink/30 bg-station px-3 py-3 text-lg"
                aria-label={o.city.question}
              >
                <option value="">{o.city.placeholder}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.names[locale]}
                  </option>
                ))}
              </select>
            </Question>
          )}

          {step === "commute" && (
            <Question legend={o.commute.question} why={o.commute.why}>
              <Choices name="mode" value={draft.mode} options={COMMUTE_MODES.map((m) => ({ value: m, label: o.commute.modes[m] }))} onChange={(mode) => set({ mode })} />
              {draft.mode !== null && draft.mode !== "none" && (
                <div className="mt-7 grid gap-6 border-t border-ink/15 pt-5">
                  <NumberField label={o.commute.distance} hint={o.commute.distanceHint} unit={t.common.kmUnit} value={draft.km} onChange={(km) => set({ km })} />
                  <label className="block">
                    <span className="text-lg font-medium">{o.commute.departure}</span>
                    <select
                      value={draft.departureHour ?? ""}
                      onChange={(e) => set({ departureHour: e.target.value === "" ? null : Number(e.target.value) })}
                      className="mt-1 w-full max-w-xs rounded-lg border border-ink/30 bg-station px-3 py-2.5"
                    >
                      <option value="">{o.commute.departureUnset}</option>
                      {DEPARTURE_HOURS.map((h) => (
                        <option key={h} value={h}>
                          {f.clockHour(h)}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-sm text-muted">{o.commute.departureHint}</span>
                  </label>
                </div>
              )}
            </Question>
          )}

          {step === "cooking" && (
            <Question legend={o.cooking.question} why={o.cooking.why}>
              <Choices name="fuel" value={draft.cookingFuel} options={COOKING_FUELS.map((v) => ({ value: v, label: o.cooking.fuels[v] }))} onChange={(cookingFuel) => set({ cookingFuel })} />
            </Question>
          )}

          {step === "household" && (
            <Question legend={o.household.question} why={o.household.why}>
              <YesNo name="household" value={draft.hasChildrenOrElderly} onChange={(v) => set({ hasChildrenOrElderly: v })} />
            </Question>
          )}

          {step === "purifier" && (
            <Question legend={o.purifier.question} why={o.purifier.why}>
              <YesNo name="purifier" value={draft.hasAirPurifier} onChange={(v) => set({ hasAirPurifier: v })} />
            </Question>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="rounded-full px-5 py-3 text-ink disabled:invisible">
            {o.back}
          </button>
          <button type="submit" disabled={!stepComplete(step, draft)} className="rounded-full bg-ink px-6 py-3 font-medium text-smog disabled:opacity-40">
            {last ? o.finish : o.next}
          </button>
        </div>
      </form>
    </main>
  );
}

/** One question per screen: the question, then why we ask it, then the answers. */
function Question({ legend, why, children }: { legend: string; why: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="type-condensed text-3xl leading-tight font-semibold text-balance">{legend}</legend>
      <p className="mt-2 max-w-prose border-l-2 border-ink/20 pl-3 text-muted">{why}</p>
      <div className="mt-5">{children}</div>
    </fieldset>
  );
}

function Choices<T extends string>({ name, value, options, onChange }: { name: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-sky ${
            value === opt.value ? "border-ink bg-station font-medium" : "border-ink/20 bg-station/60 hover:border-ink/50"
          }`}
        >
          <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} className="size-4 accent-[var(--ink)]" />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

function YesNo({ name, value, onChange }: { name: string; value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useLocale();
  const v = value === null ? null : value ? "yes" : "no";
  return (
    <Choices
      name={name}
      value={v}
      options={[
        { value: "yes", label: t.common.yes },
        { value: "no", label: t.common.no },
      ]}
      onChange={(x) => onChange(x === "yes")}
    />
  );
}

function NumberField({ label, hint, unit, value, onChange }: { label: string; hint: string; unit: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-lg font-medium">
        {label}
      </label>
      <div className="mt-1 flex max-w-xs items-center rounded-lg border border-ink/30 bg-station pr-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky">
        <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg bg-transparent px-3 py-2.5 focus-visible:outline-none" />
        <span className="text-muted">{unit}</span>
      </div>
      <span className="mt-1 block text-sm text-muted">{hint}</span>
    </div>
  );
}
