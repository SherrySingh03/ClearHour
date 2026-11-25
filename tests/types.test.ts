/**
 * Compile-time guarantees. The `@ts-expect-error` lines are checked by
 * `npm run typecheck`: if any of them stops being an error, i.e. measured
 * and forecast become interchangeable, the typecheck fails.
 */

import { describe, expectTypeOf, it } from "vitest";
import type { ForecastPoint, MeasuredValue } from "@/lib/grounding";

declare const measured: MeasuredValue;
declare const forecast: ForecastPoint;

function acceptsMeasured(v: MeasuredValue): number {
  return v.value;
}
function acceptsForecast(p: ForecastPoint): number | null {
  return p.pm25;
}

describe("measured and forecast are not interchangeable", () => {
  it("is enforced by the compiler", () => {
    expectTypeOf<ForecastPoint>().not.toExtend<MeasuredValue>();
    expectTypeOf<MeasuredValue>().not.toExtend<ForecastPoint>();

    if (false as boolean) {
      // @ts-expect-error a forecast point is not a measurement
      acceptsMeasured(forecast);
      // @ts-expect-error a measurement is not a forecast point
      acceptsForecast(measured);
      // @ts-expect-error a plain object cannot pose as a measurement (missing brand + provenance)
      acceptsMeasured({ kind: "measured", pollutant: "pm25", unit: "µg/m³", value: 120 });
    }
  });
});
