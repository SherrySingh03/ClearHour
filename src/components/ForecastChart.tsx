"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ForecastPoint } from "@/lib/grounding/types";
import type { Stretch } from "@/lib/plan/window";
import { describeForecastRange, istDayKey, istHour } from "@/lib/view/describe";
import { useLocale } from "./LocaleContext";

const H = 220;
const M = { l: 38, r: 10, t: 18, b: 30 };
const PLOT_H = H - M.t - M.b;
const FONT = 12;
/** Gridlines fall on the model's 3-hour blocks, so the chart itself shows its resolution. */
const BLOCK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const LABEL_HOURS = [6, 12, 18];

function niceMax(v: number): number {
  const step = v > 200 ? 100 : 50;
  return Math.max(step, Math.ceil((v * 1.1) / step) * step);
}

/** Splits at nulls: a forecast gap is drawn as a gap, never bridged. */
function segments(points: readonly ForecastPoint[]): { h: number; v: number }[][] {
  const out: { h: number; v: number }[][] = [];
  let cur: { h: number; v: number }[] = [];
  for (const p of points) {
    if (p.pm25 === null) {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    cur.push({ h: istHour(Date.parse(p.timeUtc)), v: p.pm25 });
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The drawing's coordinate system matches the chart's real on-screen width,
 * so labels render at true pixel size instead of shrinking on phones.
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setW(Math.max(280, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ForecastChart({ points, best, routine, now }: { points: readonly ForecastPoint[]; best: Stretch | null; routine: Stretch | null; now: Date }) {
  const { t, f } = useLocale();
  const uid = useId().replace(/:/g, "");
  const [boxRef, W] = useWidth(360);
  const values = points.flatMap((p) => (p.pm25 === null ? [] : [p.pm25]));
  if (values.length === 0) return null;

  const x = (localHour: number) => M.l + (localHour / 24) * (W - M.l - M.r);
  const stretchX = (s: Stretch) => ({ x0: x(istHour(Date.parse(s.startUtc))), x1: x(istHour(Date.parse(s.endUtc)) || 24) });
  const yMax = niceMax(Math.max(...values));
  const y = (v: number) => M.t + PLOT_H - (v / yMax) * PLOT_H;
  const yTicks = [0, yMax / 2, yMax];
  const segs = segments(points);
  const dayStart = Date.parse(`${istDayKey(now.getTime())}T00:00:00Z`) - 5.5 * 3_600_000;
  const hourIso = (h: number) => new Date(dayStart + h * 3_600_000).toISOString();
  const nowX = x(istHour(now.getTime()));
  const summary = describeForecastRange(points, t, f);
  const path = (pts: { h: number; v: number }[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.h).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");

  return (
    <figure className="mt-4">
      <div ref={boxRef}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-labelledby={`${uid}-title ${uid}-desc`} className="block h-auto w-full">
          <title id={`${uid}-title`}>{t.chart.title}</title>
          <desc id={`${uid}-desc`}>{summary}</desc>
          <defs>
            <pattern id={`${uid}-haze`} width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="var(--model)" opacity="0.38" />
            </pattern>
          </defs>

          {BLOCK_HOURS.map((h) => (
            <line key={h} x1={x(h)} x2={x(h)} y1={M.t} y2={M.t + PLOT_H} stroke="var(--model)" strokeOpacity="0.2" />
          ))}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--ink)" strokeOpacity={v === 0 ? 0.35 : 0.08} />
              <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize={FONT} fill="var(--muted)">
                {f.number(v)}
              </text>
            </g>
          ))}

          {/* Forecast: hazy dotted area under a dashed line. */}
          {segs.map((s, i) => (
            <g key={i}>
              <path d={`${path(s)} L${x(s[s.length - 1]!.h).toFixed(1)},${y(0)} L${x(s[0]!.h).toFixed(1)},${y(0)} Z`} fill={`url(#${uid}-haze)`} />
              <path d={path(s)} fill="none" stroke="var(--model)" strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" />
            </g>
          ))}

          {/* The clear window: the haze is cut away over the cleanest stretch. */}
          {best && (
            <g>
              <rect x={stretchX(best).x0} y={M.t} width={stretchX(best).x1 - stretchX(best).x0} height={PLOT_H} fill="var(--station)" fillOpacity="0.82" />
              <rect x={stretchX(best).x0} y={M.t} width={stretchX(best).x1 - stretchX(best).x0} height={PLOT_H} fill="none" stroke="var(--sky)" strokeWidth="2" />
              {segs.map((s, i) => {
                const from = istHour(Date.parse(best.startUtc)) - 0.01;
                const to = (istHour(Date.parse(best.endUtc)) || 24) - 0.99;
                const inside = s.filter((p) => p.h >= from && p.h <= to);
                return inside.length < 2 ? null : <path key={i} d={path(inside)} fill="none" stroke="var(--sky)" strokeWidth="2.5" strokeDasharray="7 5" strokeLinecap="round" />;
              })}
            </g>
          )}

          {routine && (
            <g stroke="var(--ink)" strokeWidth="2">
              <line x1={stretchX(routine).x0} x2={stretchX(routine).x1} y1={M.t + PLOT_H + 7} y2={M.t + PLOT_H + 7} />
              <line x1={stretchX(routine).x0} x2={stretchX(routine).x0} y1={M.t + PLOT_H + 2} y2={M.t + PLOT_H + 12} />
              <line x1={stretchX(routine).x1} x2={stretchX(routine).x1} y1={M.t + PLOT_H + 2} y2={M.t + PLOT_H + 12} />
            </g>
          )}

          {nowX >= M.l && nowX <= W - M.r && (
            <g>
              <line x1={nowX} x2={nowX} y1={M.t} y2={M.t + PLOT_H} stroke="var(--ink)" strokeWidth="1.5" />
              <text x={nowX + 4} y={M.t + 12} fontSize={FONT} fontWeight="600" fill="var(--ink)">
                {t.chart.now}
              </text>
            </g>
          )}

          {LABEL_HOURS.map((h) => (
            <text key={h} x={x(h)} y={H - 4} textAnchor="middle" fontSize={FONT} fill="var(--muted)">
              {f.hour(hourIso(h))}
            </text>
          ))}
          <text x={M.l} y={M.t - 6} fontSize={FONT} fill="var(--muted)">
            {t.common.unitUgm3}
          </text>
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <svg width="26" height="10" aria-hidden>
            <line x1="1" x2="25" y1="5" y2="5" stroke="var(--model)" strokeWidth="2.5" strokeDasharray="7 5" />
          </svg>
          {t.chart.legendForecast}
        </span>
        {best && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-3 w-5 border-2 border-sky bg-station" />
            {t.chart.legendBest}
          </span>
        )}
        {routine && (
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-2 w-5 border-x-2 border-b-2 border-ink" />
            {t.chart.legendRoutine}
          </span>
        )}
      </figcaption>
      {summary && <p className="mt-1 text-sm text-muted">{summary}</p>}
    </figure>
  );
}
