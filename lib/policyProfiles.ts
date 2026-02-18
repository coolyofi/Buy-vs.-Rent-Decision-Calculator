export type SupportedCity = "上海" | "北京";

export interface PolicyProfileInput {
  target_city?: string;
  is_second_home?: unknown;
  holding_years?: unknown;
  area?: unknown;
  multi_child_bonus?: unknown;
  green_building?: unknown;
}

export interface EffectivePolicy {
  city: SupportedCity;
  policyName: string;
  policyVersion: string;
  dpMinPct: number;
  lprPct: number;
  bpBps: number;
  gjjRateFirstPct: number;
  gjjRateSecondPct: number;
  deedRateSmallFirstPct: number;
  deedRateLargeFirstPct: number;
  deedRateSmallSecondPct: number;
  deedRateLargeSecondPct: number;
  vatNonExemptPct: number;
  vatExemptHoldingYears: number;
  gjjMaxSingleWan: number;
  gjjMaxFamilyWan: number;
  gjjMaxMultiChildWan: number;
  autoAppliedFactors: string[];
}

const toNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const toBool = (v: unknown, fallback = false): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["1", "true", "yes", "y", "是"].includes(s)) return true;
    if (["0", "false", "no", "n", "否"].includes(s)) return false;
  }
  return fallback;
};

export function deriveEffectivePolicy(input: PolicyProfileInput): EffectivePolicy {
  const city: SupportedCity = input.target_city === "北京" ? "北京" : "上海";
  const isSecond = toBool(input.is_second_home, false);
  const holdingYears = toNum(input.holding_years) ?? 2;
  const area = toNum(input.area) ?? 90;
  const isSmall = area <= 140;
  const hasMultiChild = toBool(input.multi_child_bonus, false);
  const isGreen = toBool(input.green_building, false);

  if (city === "北京") {
    const gjjMaxBase = hasMultiChild || isGreen ? 200 : 160;
    return {
      city,
      policyName: "北京 2026 基线政策",
      policyVersion: "BJ-2026.01",
      dpMinPct: isSecond ? 25 : 20,
      lprPct: 3.05,
      bpBps: 0,
      gjjRateFirstPct: 2.6,
      gjjRateSecondPct: 3.075,
      deedRateSmallFirstPct: 1,
      deedRateLargeFirstPct: 1.5,
      deedRateSmallSecondPct: 1,
      deedRateLargeSecondPct: 2,
      vatNonExemptPct: 3,
      vatExemptHoldingYears: 2,
      gjjMaxSingleWan: isSecond ? 100 : 120,
      gjjMaxFamilyWan: gjjMaxBase,
      gjjMaxMultiChildWan: 200,
      autoAppliedFactors: [
        `首付下限 ${isSecond ? "25%" : "20%"}`,
        `商贷基准 ${3.05}%`,
        `公积金利率 ${isSecond ? "3.075%" : "2.6%"}`,
        `契税 ${isSmall ? (isSecond ? "1%" : "1%") : (isSecond ? "2%" : "1.5%")}`,
        `增值税 ${holdingYears >= 2 ? "免征" : "3%"}`,
      ],
    };
  }

  const gjjSingle = 80;
  const gjjFamily = hasMultiChild ? 216 : 184;
  return {
    city,
    policyName: "上海 2026 基线政策",
    policyVersion: "SH-2026.01",
    dpMinPct: isSecond ? 25 : 20,
    lprPct: 3.5,
    bpBps: isSecond ? 0 : -45,
    gjjRateFirstPct: 2.6,
    gjjRateSecondPct: 3.075,
    deedRateSmallFirstPct: 1,
    deedRateLargeFirstPct: 1.5,
    deedRateSmallSecondPct: 1,
    deedRateLargeSecondPct: 2,
    vatNonExemptPct: 5.3,
    vatExemptHoldingYears: 2,
    gjjMaxSingleWan: gjjSingle,
    gjjMaxFamilyWan: gjjFamily,
    gjjMaxMultiChildWan: 216,
    autoAppliedFactors: [
      `首付下限 ${isSecond ? "25%" : "20%"}`,
      `商贷基准 ${3.5}% + ${-45}BP(首套参考)`,
      `公积金利率 ${isSecond ? "3.075%" : "2.6%"}`,
      `契税 ${isSmall ? (isSecond ? "1%" : "1%") : (isSecond ? "2%" : "1.5%")}`,
      `增值税 ${holdingYears >= 2 ? "免征" : "5.3%"}`,
    ],
  };
}

