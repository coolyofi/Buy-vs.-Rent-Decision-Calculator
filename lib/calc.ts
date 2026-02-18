export type ModelInput = Record<string, any>;
import { deriveEffectivePolicy } from "./policyProfiles";

type DecisionZone = "继续租房区" | "观察区" | "建议购买区";

export interface ScenarioComparison {
  name: "Bear" | "Base" | "Bull";
  houseGrowth: number;
  buyNetWorth: number;
  rentNetWorth: number;
  gap: number;
}

export interface ModelOutput {
  buyTotal: number;
  rentTotal: number;
  diff: number;
  recommendation: string;
  isQualified: boolean;
  disqualifyReason?: string;
  wealthView?: {
    buyNAV: number;
    rentNAV: number;
    navDiff: number;
    monthly_cashflow: Array<{
      month: number;
      buyOutflow: number;
      rentOutflow: number;
      navGap: number;
    }>;
    yearly_networth: Array<{
      year: number;
      buyNAV: number;
      rentNAV: number;
    }>;
    cost_breakdown: {
      buy: {
        downPayment: number;
        taxes: number;
        totalInterest: number;
        principalPaid: number;
        maintenance: number;
        opportunityCost: number;
      };
      rent: {
        pureRent: number;
        friction: number;
        opportunityGain: number;
      };
    };
    sensitivity_matrix: {
      house_growth_rates: number[];
      rent_growth_rates: number[];
      wealth_gap_matrix: number[][];
    };
  };
  report: {
    executiveSummary: {
      currentState: string;
      zone: DecisionZone;
      topDrivers: string[];
      threeLines: string[];
      decisionWindow: string;
    };
    financialBaseline: {
      totalAssets: number;
      liquidAssetsRatio: number;
      emergencyRunwayMonths: number;
      monthlyIncomeEstimate: number;
      fixedExpense: number;
      freeCashAfterMortgage: number;
      incomeStabilityLevel: string;
    };
    buySimulation: {
      initialCosts: {
        downPayment: number;
        taxesAndFees: number;
        renovation: number;
        frictionCost: number;
        total: number;
        cashLeftAfterPurchase: number;
      };
      monthlyOutflow: number;
      first3YearsPressure: number;
      stableAfter5Years: number;
      principalPaid10Years: number;
      interestPaid10Years: number;
    };
    rentSimulation: {
      scenarios: Array<{
        label: string;
        growthRate: number;
        totalCost: number;
      }>;
      investmentContribution: number;
      relocationCost: number;
    };
    netWorthComparison: {
      scenarios: ScenarioComparison[];
      crossoverYear: number | null;
      breakEvenGrowth: number;
    };
    stressTest: {
      incomeDrop20: {
        monthlyCoverageRatio: number;
        safe: boolean;
      };
      incomeDrop40: {
        monthlyCoverageRatio: number;
        safe: boolean;
      };
      rateUp50bpMonthlyChange: number;
      rateUp100bpMonthlyChange: number;
      unemployment6MonthsSafe: boolean;
      medicalShockReserveGap: number;
    };
    nonFinancialScores: {
      stability: number;
      freedom: number;
      psychologicalSafety: number;
      autonomy: number;
    };
    decisionMap: {
      zone: DecisionZone;
      position: number;
      reason: string;
    };
    actionOptions: Array<{
      name: string;
      condition: string;
      requirements: string[];
    }>;
    triggerConditions: string[];
    policy: {
      city: string;
      policyName: string;
      policyVersion: string;
      autoAppliedFactors: string[];
    };
  };
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const normalized = value.replace(/[,\s，]/g, "").trim();
    if (!normalized) return undefined;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
};

const toPercentDecimal = (value: unknown, fallbackPercent: number): number => {
  const percent = toNumber(value) ?? fallbackPercent;
  return percent / 100;
};
const toBool = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.toLowerCase().trim();
    if (["yes", "true", "1", "y"].includes(v)) return true;
    if (["no", "false", "0", "n"].includes(v)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
};

const toWanAmount = (value: unknown, fallbackWan: number): number => {
  const raw = toNumber(value);
  if (raw === undefined) return fallbackWan;
  return raw > 10000 ? raw / 10000 : raw;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const yearlyRentCostWan = (rent0Yuan: number, growth: number, years: number): number => {
  let total = 0;
  let currentRentWan = rent0Yuan / 10000;
  for (let i = 0; i < years; i++) {
    total += currentRentWan * 12;
    currentRentWan *= 1 + growth;
  }
  return total;
};

const pmtWan = (principalWan: number, annualRate: number, termMonths: number): number => {
  if (principalWan <= 0 || termMonths <= 0) return 0;
  if (annualRate === 0) return principalWan / termMonths;
  if (annualRate < 0) return 0;
  const m = annualRate / 12;
  const pow = Math.pow(1 + m, termMonths);
  return (principalWan * m * pow) / (pow - 1);
};

type RepayType = "等额本息" | "等额本金";

const paymentAtMonthWan = (
  principalWan: number,
  annualRate: number,
  termMonths: number,
  month: number,
  repayType: RepayType
): number => {
  if (principalWan <= 0 || termMonths <= 0 || month <= 0) return 0;
  if (month > termMonths) return 0;
  if (repayType === "等额本金") {
    const principalPart = principalWan / termMonths;
    const remaining = Math.max(0, principalWan - principalPart * (month - 1));
    const interestPart = annualRate <= 0 ? 0 : remaining * (annualRate / 12);
    return principalPart + interestPart;
  }
  return pmtWan(principalWan, annualRate, termMonths);
};

const amortization = (
  principalWan: number,
  annualRate: number,
  termMonths: number,
  horizonMonths: number,
  repayType: RepayType = "等额本息"
): { principalPaidWan: number; interestPaidWan: number; remainingWan: number } => {
  if (principalWan <= 0 || horizonMonths <= 0) {
    return { principalPaidWan: 0, interestPaidWan: 0, remainingWan: Math.max(0, principalWan) };
  }
  const payment = pmtWan(principalWan, annualRate, termMonths);
  const m = annualRate / 12;
  let remaining = principalWan;
  let principalPaid = 0;
  let interestPaid = 0;
  const months = Math.min(horizonMonths, termMonths);
  for (let i = 0; i < months; i++) {
    const interest = annualRate <= 0 ? 0 : remaining * m;
    const paymentCurrent = repayType === "等额本金" ? paymentAtMonthWan(principalWan, annualRate, termMonths, i + 1, repayType) : payment;
    const principal = Math.min(remaining, paymentCurrent - interest);
    remaining -= principal;
    principalPaid += principal;
    interestPaid += interest;
  }
  return { principalPaidWan: principalPaid, interestPaidWan: interestPaid, remainingWan: remaining };
};

export function calculateModel(input: ModelInput = {}): ModelOutput {
  const policy = deriveEffectivePolicy(input);
  const expertConfigured = toBool(input.expert_configured, false);
  const debugFast = toBool(input.__debug_fast, false);
  const isSecondHome = toBool(input.is_second_home, false);
  const hasMultiChild = toBool(input.multi_child_bonus, false);
  const P = toWanAmount(input.P, 600);
  const area = toNumber(input.area) ?? 100;
  const years = Math.max(1, Math.trunc(toNumber(input.years) ?? 10));
  const holdingYears = Math.max(0, toNumber(input.holding_years) ?? years);
  const isSmallArea = area <= 140;

  const vatRate = toPercentDecimal(
    input.VAT_rate,
    holdingYears >= policy.vatExemptHoldingYears ? 0 : policy.vatNonExemptPct
  );
  const deed1Rate = toPercentDecimal(
    input.Deed1_rate,
    isSmallArea ? policy.deedRateSmallFirstPct : policy.deedRateLargeFirstPct
  );
  const deed2Rate = toPercentDecimal(
    input.Deed2_rate,
    isSmallArea ? policy.deedRateSmallSecondPct : policy.deedRateLargeSecondPct
  );
  const ctRate = toPercentDecimal(input.CT_rate, 7);
  const eduRate = toPercentDecimal(input.Edu_rate, 3);
  const localEduRate = toPercentDecimal(input.LocalEdu_rate, 2);
  const pitGrossRate = toPercentDecimal(input.PIT_gross_rate, 1.5);
  const buyerAgentRate = expertConfigured ? toPercentDecimal(input.Buyer_agent_rate, 1.5) : 0;
  const sellerToBuyerRate = expertConfigured ? toPercentDecimal(input.Seller_to_buyer_rate, 0.5) : 0;
  const m5u = toBool(input.M5U, true);

  const renoHard = toWanAmount(input.Reno_hard, 30);
  const renoSoft = toWanAmount(input.Reno_soft, 12);
  const regFee = toWanAmount(input.Reg_fee, 0.1);
  const loanService = toWanAmount(input.Loan_service, 0.1);

  const dpMin = toPercentDecimal(input.dp_min, policy.dpMinPct);
  const lprBase = toPercentDecimal(input.LPR, policy.lprPct);
  const bankPoint = (toNumber(input.BP) ?? policy.bpBps) / 10000;
  const lpr = lprBase + bankPoint;
  const rGjj = toPercentDecimal(input.r_gjj, isSecondHome ? policy.gjjRateSecondPct : policy.gjjRateFirstPct);
  const mixRatio = toPercentDecimal(input.Mix_ratio, 50);
  const gjjOffsetYuan = Math.max(0, toNumber(input.GJJ_offset) ?? 0);

  const rent0 = toNumber(input.rent_0) ?? 8000;
  const gRent = toPercentDecimal(input.g_r, 3);
  const rInv = toPercentDecimal(input.R_inv, 5);

  const totalLoanNeeded = P * (1 - dpMin);
  const gjjMerge = toBool(input.GJJ_merge, true);
  const policyGjjCapWan = hasMultiChild
    ? policy.gjjMaxMultiChildWan
    : gjjMerge
    ? policy.gjjMaxFamilyWan
    : policy.gjjMaxSingleWan;
  const inputGjjCapWan = toWanAmount(
    gjjMerge ? input.GJJ_max_family : input.GJJ_max_single,
    policyGjjCapWan
  );
  const gjjCapWan = Math.max(0, inputGjjCapWan);
  const L_gjj = Math.min(totalLoanNeeded * mixRatio, gjjCapWan);
  const L_com = Math.max(0, totalLoanNeeded - L_gjj);

  const downPaymentWan = P * dpMin;
  const deedTaxRate = isSecondHome ? deed2Rate : deed1Rate;
  const deedTaxWan = P * deedTaxRate;
  const vatWan = P * vatRate;
  const vatAddonWan = vatWan * (ctRate + eduRate + localEduRate);
  const pitWan = m5u ? 0 : P * pitGrossRate;
  const taxesAndFeesWan =
    deedTaxWan + vatWan + vatAddonWan + pitWan + P * (buyerAgentRate + sellerToBuyerRate) + regFee + loanService;
  const renovationWan = renoHard + renoSoft;
  // Move_cost is in yuan; Time_cost is in wan-yuan.
  const frictionCostWan =
    (Math.max(0, toNumber(input.Move_cost) ?? 3000) / 10000) +
    (expertConfigured ? toWanAmount(input.Time_cost, 0.1) : 0);
  const oneTimeCostWan = downPaymentWan + taxesAndFeesWan + renovationWan + frictionCostWan;

  const termMonths = Math.max(12, (Math.trunc(toNumber(input.n_years) ?? 30) * 12));
  const repayType: RepayType = input.Repay_type === "等额本金" ? "等额本金" : "等额本息";
  const monthlyPaymentWan =
    paymentAtMonthWan(L_gjj, rGjj, termMonths, 1, repayType) +
    paymentAtMonthWan(L_com, lpr, termMonths, 1, repayType);
  const monthlyPaymentYuan = monthlyPaymentWan * 10000;

  const pmUnit = toNumber(input.PM_unit) ?? 5;
  const monthlyHoldingYuan = pmUnit * area;
  const deductLimitYuan = Math.max(0, toNumber(input.Deduct_limit) ?? 1000);
  const mortgageTaxSavingYuan = deductLimitYuan * 0.1;
  const monthlyCashOutYuan = Math.max(0, monthlyPaymentYuan + monthlyHoldingYuan - gjjOffsetYuan - mortgageTaxSavingYuan);
  const pmGrowth = expertConfigured ? toPercentDecimal(input.PM_growth, 3) : 0;
  const propertyTaxRate = expertConfigured ? toPercentDecimal(input.PropertyTax_rate, 0.4) : 0;
  const maintenanceYearly = expertConfigured ? Math.max(0, toNumber(input.Maintenance_yearly) ?? 30) : 0;
  const insuranceYearly = expertConfigured ? Math.max(0, toNumber(input.Insurance) ?? 800) : 0;
  const parkingMgmtMonthly = expertConfigured ? Math.max(0, toNumber(input.Parking_mgmt) ?? 0) : 0;
  const broadbandMonthly = expertConfigured ? Math.max(0, toNumber(input.Broadband) ?? 120) : 0;
  const energyMonthly = expertConfigured ? Math.max(0, toNumber(input.Energy_premium) ?? 0) : 0;
  const largeReplaceWan = expertConfigured && years >= 10 ? toWanAmount(input.Large_replace, 2) : 0;
  const baseAnnualHoldingYuan =
    area * maintenanceYearly +
    insuranceYearly +
    (parkingMgmtMonthly + broadbandMonthly + energyMonthly) * 12 +
    P * 10000 * propertyTaxRate;
  let holdingExtraTotalWan = 0;
  for (let y = 0; y < years; y++) {
    holdingExtraTotalWan += (baseAnnualHoldingYuan * Math.pow(1 + pmGrowth, y)) / 10000;
  }
  const yearlyOutflowWan = (monthlyCashOutYuan * 12) / 10000;
  const buyCashOutWan = oneTimeCostWan + yearlyOutflowWan * years + holdingExtraTotalWan + largeReplaceWan;
  const capitalLockedWan = downPaymentWan;
  const opportunityCostWan = capitalLockedWan * (Math.pow(1 + rInv, years) - 1);
  const buyTotalWan = buyCashOutWan + opportunityCostWan;

  const rentBaseWan = yearlyRentCostWan(rent0, gRent, years);
  const moveEveryYears = Math.max(1, toNumber(input.Move_freq_years) ?? 2);
  const moves = Math.floor(years / moveEveryYears);
  const moveCostYuan = Math.max(0, toNumber(input.Move_cost) ?? 3000);
  const furnDeprYuan = expertConfigured ? Math.max(0, toNumber(input.Furn_depr) ?? 2000) : 0;
  const overlapRentYuan = expertConfigured ? Math.max(0, toNumber(input.Overlap_rent) ?? 0) : 0;
  const socialCostYuan = expertConfigured ? Math.max(0, toNumber(input.Social_cost) ?? 0) : 0;
  const rentAgentRateMonths = expertConfigured ? Math.max(0, toNumber(input.Rent_agent_rate) ?? 0.5) : 0;
  const relocationCostYuan = moves * (moveCostYuan + furnDeprYuan + overlapRentYuan + socialCostYuan);
  const rentAgentCostYuan = moves * rentAgentRateMonths * rent0;
  const depositMult = expertConfigured ? Math.max(0, toNumber(input.Deposit_mult) ?? 1.25) : 0;
  const depositOpportunityYuan = depositMult * rent0 * (Math.pow(1 + rInv, years) - 1);
  const rentFrictionWan = (relocationCostYuan + rentAgentCostYuan + depositOpportunityYuan) / 10000;
  const rentTaxRate = expertConfigured ? toPercentDecimal(input.Rent_tax_rate, 1) : 0;
  const residenceFeeYuan = expertConfigured ? Math.max(0, toNumber(input.Residence_fee) ?? 0) : 0;
  const gjjRentCapYuan = expertConfigured ? Math.max(0, toNumber(input.GJJ_rent_cap) ?? 0) : 0;
  const commuteDeltaYuan = expertConfigured ? Math.max(0, toNumber(input.Commute_delta) ?? 0) : 0;
  const rentTaxWan = rentBaseWan * rentTaxRate;
  const residenceFeeWan = (residenceFeeYuan * years) / 10000;
  const commuteWan = (commuteDeltaYuan * 12 * years) / 10000;
  const gjjRentOffsetWan = (Math.min(gjjRentCapYuan, rent0) * 12 * years) / 10000;
  const rentTotalWan = Math.max(0, rentBaseWan + rentFrictionWan + rentTaxWan + residenceFeeWan + commuteWan - gjjRentOffsetWan);
  const diffYuan = Math.round((buyTotalWan - rentTotalWan) * 10000);
  const recommendation = diffYuan > 0 ? "租房更省" : "购房更省";

  const incomeEstimateYuan =
    (toNumber(input.monthly_income) ?? monthlyPaymentYuan / (toNumber(input.Anxiety_threshold) ?? 0.5));
  const fixedExpenseYuan = incomeEstimateYuan * (toNumber(input.Fixed_burden) ?? 0.35);
  const freeCashAfterMortgage = incomeEstimateYuan - fixedExpenseYuan - monthlyCashOutYuan;

  const cashWan = toWanAmount(input.Emergency, 6);
  const investWan = toWanAmount(input.Future_big, 0);
  const familySupportWan = (toWanAmount(input.Family_support, 0) * Math.min(3, years));
  const gjjFlowWan = ((toNumber(input.GJJ_extra) ?? 0) * 24) / 10000;
  const totalAssetsYuan = Math.round((cashWan + investWan + familySupportWan + gjjFlowWan) * 10000);
  const liquidRatio = clamp(toPercentDecimal(input.Liquid_ratio, 20), 0, 1);
  const monthlyBurn = Math.max(1, fixedExpenseYuan + monthlyCashOutYuan);
  const emergencyRunwayMonths = ((cashWan + familySupportWan) * 10000) / monthlyBurn;

  const amortHorizon = Math.min(10, years) * 12;
  const gjjAmort = amortization(L_gjj, rGjj, termMonths, amortHorizon, repayType);
  const comAmort = amortization(L_com, lpr, termMonths, amortHorizon, repayType);
  const principalPaid10y = (gjjAmort.principalPaidWan + comAmort.principalPaidWan) * 10000;
  const interestPaid10y = (gjjAmort.interestPaidWan + comAmort.interestPaidWan) * 10000;
  const remainingLoanWan = gjjAmort.remainingWan + comAmort.remainingWan;

  const conservativeRentWan = yearlyRentCostWan(rent0, 0.02, years) + rentFrictionWan;
  const neutralRentWan = yearlyRentCostWan(rent0, 0.04, years) + rentFrictionWan;
  const stressRentWan = yearlyRentCostWan(rent0, 0.06, years) + rentFrictionWan;

  const initialInvestableYuan = oneTimeCostWan * 10000;
  const downPaymentFVYuan = initialInvestableYuan * Math.pow(1 + rInv, years);
  const monthlyDiffYuan = Math.max(0, monthlyCashOutYuan - rent0);
  const periodicInvRate = rInv / 12;
  const monthlyDiffFVYuan =
    periodicInvRate > 0
      ? monthlyDiffYuan * ((Math.pow(1 + periodicInvRate, years * 12) - 1) / periodicInvRate)
      : monthlyDiffYuan * years * 12;
  const investmentContribution = Math.round(downPaymentFVYuan + monthlyDiffFVYuan);
  const investConsistencyRaw = toNumber(input.Invest_consistency);
  const investConsistency = clamp(
    investConsistencyRaw === undefined ? 0.7 : (investConsistencyRaw > 1 ? investConsistencyRaw / 100 : investConsistencyRaw),
    0,
    1
  );
  const gHouse = toPercentDecimal(input.g_p, 3);
  const sellerAgentRate = toPercentDecimal(input.Seller_agent_rate, 2);
  const sellerTaxRate = toPercentDecimal(input.Seller_tax_rate, 0);
  const exitVatRate = toPercentDecimal(input.VAT_addon_exit, 0);
  const escrowRate = toPercentDecimal(input.Escrow_fee, 0);
  const exitCostRate = sellerAgentRate + sellerTaxRate + exitVatRate + escrowRate;

  const scenarioDefs = [
    { name: "Bear" as const, g: -0.01 },
    { name: "Base" as const, g: 0.015 },
    { name: "Bull" as const, g: 0.04 },
  ];

  const cpiRate = expertConfigured ? toPercentDecimal(input.CPI, 2) : 0;
  const runNavSeries = (houseGrowth: number, rentGrowth: number) => {
    let rentNowYuan = rent0;
    let buyLiquidYuan = 0;
    let rentLiquidYuan = Math.round(oneTimeCostWan * 10000);
    const yearly: Array<{ year: number; buyNAV: number; rentNAV: number }> = [];

    for (let m = 1; m <= years * 12; m++) {
      buyLiquidYuan *= 1 + rInv / 12;
      rentLiquidYuan *= 1 + rInv / 12;
      if (m > 1 && (m - 1) % 12 === 0) rentNowYuan *= 1 + rentGrowth;

      const monthPaymentWan =
        paymentAtMonthWan(L_gjj, rGjj, termMonths, m, repayType) +
        paymentAtMonthWan(L_com, lpr, termMonths, m, repayType);
      const monthBuyOutflowYuan = Math.max(0, monthPaymentWan * 10000 + monthlyHoldingYuan - gjjOffsetYuan - mortgageTaxSavingYuan);
      let rentOutflowYuan = Math.max(0, rentNowYuan - 1500 * 0.1 - Math.min(gjjRentCapYuan, rentNowYuan) + commuteDeltaYuan);
      rentOutflowYuan += rentNowYuan * rentTaxRate;
      if (m % Math.max(12, moveEveryYears * 12) === 0) {
        const moveCostInflated = moveCostYuan * Math.pow(1 + cpiRate, m / 12);
        rentOutflowYuan += moveCostInflated + rent0 * rentAgentRateMonths;
      }

      const gapYuan = monthBuyOutflowYuan - rentOutflowYuan;
      if (gapYuan > 0) {
        rentLiquidYuan += gapYuan * investConsistency;
      } else {
        buyLiquidYuan += Math.abs(gapYuan) * investConsistency;
      }

      if (m % 12 === 0) {
        const year = m / 12;
        const houseValueYuan = P * 10000 * Math.pow(1 + houseGrowth, year);
        const gjjRem = amortization(L_gjj, rGjj, termMonths, m, repayType).remainingWan * 10000;
        const comRem = amortization(L_com, lpr, termMonths, m, repayType).remainingWan * 10000;
        const sellCostYuan = houseValueYuan * exitCostRate + (expertConfigured ? toWanAmount(input.Time_cost, 0.1) * 10000 : 0);
        yearly.push({
          year,
          buyNAV: Math.round(houseValueYuan - (gjjRem + comRem) - sellCostYuan + buyLiquidYuan),
          rentNAV: Math.round(rentLiquidYuan),
        });
      }
    }
    return yearly;
  };
  const interpolateY = (x: number, x0: number, y0: number, x1: number, y1: number) => {
    if (Math.abs(x1 - x0) < 1e-9) return y0;
    return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
  };
  const interpolateGapByRent = (row: number[], rentRates: number[], targetRent: number) => {
    if (!row.length || !rentRates.length) return 0;
    if (targetRent <= rentRates[0]) return row[0];
    if (targetRent >= rentRates[rentRates.length - 1]) return row[row.length - 1];
    for (let i = 1; i < rentRates.length; i++) {
      if (targetRent <= rentRates[i]) {
        return interpolateY(targetRent, rentRates[i - 1], row[i - 1], rentRates[i], row[i]);
      }
    }
    return row[row.length - 1];
  };

  const yearlyBaseNAV = runNavSeries(gHouse, gRent);
  const finalBaseNAV = yearlyBaseNAV[yearlyBaseNAV.length - 1] ?? {
    year: years,
    buyNAV: Math.round(P * 10000 - remainingLoanWan * 10000),
    rentNAV: Math.round(oneTimeCostWan * 10000),
  };

  const scenarios: ScenarioComparison[] = debugFast
    ? scenarioDefs.map(({ name, g }) => ({
        name,
        houseGrowth: g,
        buyNetWorth: finalBaseNAV.buyNAV,
        rentNetWorth: finalBaseNAV.rentNAV,
        gap: finalBaseNAV.buyNAV - finalBaseNAV.rentNAV,
      }))
    : scenarioDefs.map(({ name, g }) => {
        const series = runNavSeries(g, gRent);
        const final = series[series.length - 1] ?? finalBaseNAV;
        return {
          name,
          houseGrowth: g,
          buyNetWorth: final.buyNAV,
          rentNetWorth: final.rentNAV,
          gap: final.buyNAV - final.rentNAV,
        };
      });

  let crossoverYear: number | null = null;
  for (const row of yearlyBaseNAV) {
    if (row.buyNAV >= row.rentNAV) {
      crossoverYear = row.year;
      break;
    }
  }

  let breakEvenGrowth = debugFast ? gHouse : 0.08;

  const increase50bp = pmtWan(L_gjj, rGjj + 0.005, termMonths) + pmtWan(L_com, lpr + 0.005, termMonths);
  const increase100bp = pmtWan(L_gjj, rGjj + 0.01, termMonths) + pmtWan(L_com, lpr + 0.01, termMonths);

  const cover20 = (incomeEstimateYuan * 0.8 - fixedExpenseYuan) / Math.max(1, monthlyCashOutYuan);
  const cover40 = (incomeEstimateYuan * 0.6 - fixedExpenseYuan) / Math.max(1, monthlyCashOutYuan);
  const runwayNeed = Math.max(1, toNumber(input.Cash_runway_months) ?? 6);
  const unemployment6Safe = emergencyRunwayMonths >= runwayNeed;
  const medicalShock = toNumber(input.Medical_future) ?? 0;
  const medicalShockReserveGap = Math.max(0, medicalShock - (cashWan * 10000 * 0.35));

  const freedomScore = clamp(Math.round((toNumber(input.Freedom_score) ?? 0.5) * 100), 0, 100);
  const stabilityScore = clamp(Math.round((toNumber(input.Rent_stability_discount) ?? 0.95) * 90), 0, 100);
  const safetyScore = clamp(Math.round((toNumber(input.Peace_discount) ?? 0.95) * 100), 0, 100);
  const autonomyScore = clamp(Math.round((toNumber(input.Hukou_weight) ?? 0.5) * 100), 0, 100);

  const diffThreshold = Math.max(P * 10000 * 0.05, 30000);
  const zone: DecisionZone = diffYuan > diffThreshold ? "继续租房区" : diffYuan < -diffThreshold ? "建议购买区" : "观察区";
  const mapPosition = clamp(Math.round(50 - (diffYuan / Math.max(1, P * 10000 * 0.25)) * 50), 0, 100);

  const driverBreakdown = [
    { label: "房贷现金流压力", value: Math.abs(monthlyCashOutYuan * years * 12 - rent0 * years * 12) },
    { label: "首付资本机会成本", value: Math.abs(opportunityCostWan * 10000) },
    { label: "交易税费与装修", value: Math.abs((taxesAndFeesWan + renovationWan) * 10000) },
    { label: "租房摩擦成本", value: Math.abs(rentFrictionWan * 10000) },
    { label: "流动性安全垫", value: Math.abs(freeCashAfterMortgage) },
  ].sort((a, b) => b.value - a.value);

  const currentState =
    zone === "观察区"
      ? "处于买租均衡区"
      : zone === "建议购买区"
      ? "处于买房优势区"
      : "处于租房优势区";

  const decisionWindow =
    zone === "建议购买区"
      ? "当前可执行，建议在 3-6 个月内完成择盘与贷款锁定。"
      : zone === "继续租房区"
      ? "建议观察 12-24 个月，优先积累现金与等待触发条件。"
      : "建议 6-12 个月内持续观测利率、租售比与现金缓冲变化。";

  const rentTaxSavingYuan = 1500 * 0.1;
  const simulationMonths = years * 12;
  let currentRentYuan = rent0;
  let buyLiquidAssetYuan = 0;
  let rentLiquidAssetYuan = Math.round(oneTimeCostWan * 10000);
  const monthly_cashflow: Array<{
    month: number;
    buyOutflow: number;
    rentOutflow: number;
    navGap: number;
  }> = [];
  const yearly_networth: Array<{
    year: number;
    buyNAV: number;
    rentNAV: number;
  }> = [...yearlyBaseNAV];

  for (let m = 1; m <= simulationMonths; m++) {
    buyLiquidAssetYuan *= 1 + rInv / 12;
    rentLiquidAssetYuan *= 1 + rInv / 12;

    if (m > 1 && (m - 1) % 12 === 0) currentRentYuan *= 1 + gRent;

    const monthPaymentWan =
      paymentAtMonthWan(L_gjj, rGjj, termMonths, m, repayType) +
      paymentAtMonthWan(L_com, lpr, termMonths, m, repayType);
    const buyOutflowYuan = Math.max(0, monthPaymentWan * 10000 + monthlyHoldingYuan - gjjOffsetYuan - mortgageTaxSavingYuan);
    let rentOutflowYuan = Math.max(0, currentRentYuan - rentTaxSavingYuan - Math.min(gjjRentCapYuan, currentRentYuan) + commuteDeltaYuan);
    rentOutflowYuan += currentRentYuan * rentTaxRate;
    if (m % Math.max(12, moveEveryYears * 12) === 0) {
      rentOutflowYuan += (moveCostYuan * Math.pow(1 + cpiRate, m / 12) + rent0 * rentAgentRateMonths);
    }
    const gapYuan = buyOutflowYuan - rentOutflowYuan;

    if (gapYuan > 0) {
      rentLiquidAssetYuan += gapYuan * investConsistency;
    } else {
      buyLiquidAssetYuan += Math.abs(gapYuan) * investConsistency;
    }

    monthly_cashflow.push({
      month: m,
      buyOutflow: Math.round(buyOutflowYuan),
      rentOutflow: Math.round(rentOutflowYuan),
      navGap: Math.round(gapYuan),
    });

    // yearly_networth is sourced from NAV-base simulation above
  }
  const finalYearly = finalBaseNAV;

  const sensitivityHouseGrowth = debugFast ? [gHouse] : [-0.02, 0, 0.02, 0.04, 0.06];
  const sensitivityRentGrowth = debugFast ? [gRent] : [0.01, 0.02, 0.03, 0.04, 0.05];
  const wealthGapMatrix = sensitivityHouseGrowth.map((hg) =>
    sensitivityRentGrowth.map((rg) => {
      const series = runNavSeries(hg, rg);
      const final = series[series.length - 1] ?? finalBaseNAV;
      return final.buyNAV - final.rentNAV;
    })
  );
  if (!debugFast) {
    const gapByHouseAtCurrentRent = sensitivityHouseGrowth.map((_, i) =>
      interpolateGapByRent(wealthGapMatrix[i], sensitivityRentGrowth, gRent)
    );
    const firstPositiveIdx = gapByHouseAtCurrentRent.findIndex((v) => v >= 0);
    if (firstPositiveIdx === 0) {
      breakEvenGrowth = sensitivityHouseGrowth[0];
    } else if (firstPositiveIdx > 0) {
      const i = firstPositiveIdx;
      breakEvenGrowth = interpolateY(
        0,
        gapByHouseAtCurrentRent[i - 1],
        sensitivityHouseGrowth[i - 1],
        gapByHouseAtCurrentRent[i],
        sensitivityHouseGrowth[i]
      );
    } else if (gapByHouseAtCurrentRent[gapByHouseAtCurrentRent.length - 1] < 0) {
      breakEvenGrowth = sensitivityHouseGrowth[sensitivityHouseGrowth.length - 1];
    }
  }
  const wealthView = {
    buyNAV: finalYearly.buyNAV,
    rentNAV: finalYearly.rentNAV,
    navDiff: finalYearly.buyNAV - finalYearly.rentNAV,
    monthly_cashflow,
    yearly_networth,
    cost_breakdown: {
      buy: {
        downPayment: Math.round(downPaymentWan * 10000),
        taxes: Math.round(taxesAndFeesWan * 10000),
        totalInterest: Math.round(interestPaid10y),
        principalPaid: Math.round(principalPaid10y),
        maintenance: Math.round(monthlyHoldingYuan * 12 * years),
        opportunityCost: Math.round(opportunityCostWan * 10000),
      },
      rent: {
        pureRent: Math.round(rentBaseWan * 10000),
        friction: Math.round(rentFrictionWan * 10000),
        opportunityGain: Math.max(0, Math.round(rentLiquidAssetYuan - oneTimeCostWan * 10000)),
      },
    },
    sensitivity_matrix: {
      house_growth_rates: sensitivityHouseGrowth,
      rent_growth_rates: sensitivityRentGrowth,
      wealth_gap_matrix: wealthGapMatrix,
    },
  };

  return {
    buyTotal: Math.round(buyTotalWan * 10000),
    rentTotal: Math.round(rentTotalWan * 10000),
    diff: diffYuan,
    recommendation,
    isQualified: true,
    wealthView,
    report: {
      executiveSummary: {
        currentState,
        zone,
        topDrivers: driverBreakdown.slice(0, 3).map((d) => d.label),
        threeLines: [
          `${years} 年净资产差异中位数约 ${Math.round(Math.abs(scenarios[1].gap)).toLocaleString()} 元。`,
          `最大风险来源：${cover40 < 1 ? "收入波动下的现金流断裂" : "长期机会成本偏离"}。`,
          `政策基线：${policy.policyName}（${policy.policyVersion}）。`,
          `决策窗口：${decisionWindow}`,
        ],
        decisionWindow,
      },
      financialBaseline: {
        totalAssets: totalAssetsYuan,
        liquidAssetsRatio: liquidRatio,
        emergencyRunwayMonths,
        monthlyIncomeEstimate: Math.round(incomeEstimateYuan),
        fixedExpense: Math.round(fixedExpenseYuan),
        freeCashAfterMortgage: Math.round(freeCashAfterMortgage),
        incomeStabilityLevel: cover20 >= 1.2 ? "高" : cover20 >= 1 ? "中" : "低",
      },
      buySimulation: {
        initialCosts: {
          downPayment: Math.round(downPaymentWan * 10000),
          taxesAndFees: Math.round(taxesAndFeesWan * 10000),
          renovation: Math.round(renovationWan * 10000),
          frictionCost: Math.round(frictionCostWan * 10000),
          total: Math.round(oneTimeCostWan * 10000),
          cashLeftAfterPurchase: Math.round((cashWan * 10000) - (oneTimeCostWan * 10000)),
        },
        monthlyOutflow: Math.round(monthlyCashOutYuan),
        first3YearsPressure: Math.round(monthlyCashOutYuan * 1.1),
        stableAfter5Years: Math.round(monthlyCashOutYuan * 0.95),
        principalPaid10Years: Math.round(principalPaid10y),
        interestPaid10Years: Math.round(interestPaid10y),
      },
      rentSimulation: {
        scenarios: [
          { label: "保守", growthRate: 0.02, totalCost: Math.round(conservativeRentWan * 10000) },
          { label: "中性", growthRate: 0.04, totalCost: Math.round(neutralRentWan * 10000) },
          { label: "压力", growthRate: 0.06, totalCost: Math.round(stressRentWan * 10000) },
        ],
        investmentContribution,
        relocationCost: relocationCostYuan,
      },
      netWorthComparison: {
        scenarios,
        crossoverYear,
        breakEvenGrowth,
      },
      stressTest: {
        incomeDrop20: {
          monthlyCoverageRatio: cover20,
          safe: cover20 >= 1,
        },
        incomeDrop40: {
          monthlyCoverageRatio: cover40,
          safe: cover40 >= 1,
        },
        rateUp50bpMonthlyChange: Math.round((increase50bp - monthlyPaymentWan) * 10000),
        rateUp100bpMonthlyChange: Math.round((increase100bp - monthlyPaymentWan) * 10000),
        unemployment6MonthsSafe: unemployment6Safe,
        medicalShockReserveGap: Math.round(medicalShockReserveGap),
      },
      nonFinancialScores: {
        stability: stabilityScore,
        freedom: freedomScore,
        psychologicalSafety: safetyScore,
        autonomy: autonomyScore,
      },
      decisionMap: {
        zone,
        position: mapPosition,
        reason:
          zone === "建议购买区"
            ? "买房路径净资产中位数已显著优于租房，并且现金流可覆盖。"
            : zone === "继续租房区"
            ? "机会成本与现金流压力仍偏高，租房+投资更稳健。"
            : "两路径差距有限，建议等待触发器再切换策略。",
      },
      actionOptions: [
        {
          name: "OPTION A｜现在买",
          condition: "适用于建议购买区",
          requirements: [
            "月供后自由现金流保持为正",
            "购房后仍保留 >= 6 个月紧急备用金",
            "锁定利率并控制总杠杆",
          ],
        },
        {
          name: "OPTION B｜延迟买",
          condition: "适用于观察区",
          requirements: [
            "现金储备提升到首付+税费+12个月缓冲",
            "收入稳定性达到中高等级",
            "继续监测利率与租售比触发器",
          ],
        },
        {
          name: "OPTION C｜长期租住+投资",
          condition: "适用于继续租房区",
          requirements: [
            "执行首付资金与月差额再投资纪律",
            "控制搬家频率与迁移摩擦成本",
            "每年复盘净资产路径偏差",
          ],
        },
      ],
      triggerConditions: [
        `若房贷综合利率 <= ${(Math.max(lpr, rGjj) * 100 - 0.5).toFixed(2)}%，可触发重新评估买入。`,
        `若目标板块房价年化预期 >= ${(breakEvenGrowth * 100).toFixed(2)}%，买房路径开始占优。`,
        `若可支配现金 >= ${Math.round(oneTimeCostWan * 10000 * 1.3).toLocaleString()} 元，可进入执行准备。`,
      ],
      policy: {
        city: policy.city,
        policyName: policy.policyName,
        policyVersion: policy.policyVersion,
        autoAppliedFactors: policy.autoAppliedFactors,
      },
    },
  };
}
