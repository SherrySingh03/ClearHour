export declare const PLAN_TTL_HOURS: number;
export declare const SAMPLES: readonly {
  readonly id: string;
  readonly label: string;
  readonly locale: string;
  readonly profile: {
    readonly cityId: string;
    readonly commute: { readonly mode: string; readonly oneWayKm: number; readonly departureHour?: number };
    readonly cookingFuel: string;
    readonly hasChildrenOrElderly: boolean;
    readonly hasAirPurifier: boolean;
  };
}[];
