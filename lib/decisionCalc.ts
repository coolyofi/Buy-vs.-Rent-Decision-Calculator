/**
 * Asset Decision Engine — Buy vs Rent
 *
 * Core model: the user has a portfolio of assets spread across different
 * instrument classes, each with its own forward yield assumption.
 * We simulate TWO paths from today to a horizon:
 *
 *   BUY PATH  : liquidate enough assets for down-payment + costs → take
 *               mortgage → remaining assets compound → property appreciates
 *               → NAV = property equity + financial-assets NAV
 *
 *   RENT PATH : keep all assets invested → pay rent from cashflow → monthly
 *               surplus/deficit re-invested → NAV = financial-assets NAV
 *
 * The delta at every year is the buy/rent wealth gap.
 */

/* ──────────────────── Types ──────────────────── */
export interface AssetPool {
  cash_wan: number;           // 银行活期 / 现金
  fixed_deposit_wan: number;  // 定期存款
  a_stock_wan: number;        // A 股
  hk_stock_wan: number;       // 港股
  us_stock_wan: number;       // 美股
  bond_fund_wan: number;      // 固收理财 / 基金
  gjj_balance_wan: number;    // 公积金账户余额（可提取用于首付）
}

/** Annualized yield assumptions (percentage, e.g. 7 = 7%) */
export interface YieldAssumptions {
  cash_rate: number;           // default 0.5
  fixed_deposit_rate: number;  // default 2.5
  a_stock_rate: number;        // default 7
  hk_stock_rate: number;       // default 5
  us_stock_rate: number;       // default 10
  bond_fund_rate: number;      // default 3.5
}

export type RiskProfile = "保守" | "平衡" | "进取";

/** Risk-profile presets for yield assumptions */
export const RISK_PRESETS: Record<RiskProfile, YieldAssumptions> = {
  保守: { cash_rate: 0.5, fixed_deposit_rate: 2.3, a_stock_rate: 5,  hk_stock_rate: 3.5, us_stock_rate: 7,  bond_fund_rate: 2.8 },
  平衡: { cash_rate: 0.5, fixed_deposit_rate: 2.5, a_stock_rate: 7,  hk_stock_rate: 5.0, us_stock_rate: 10, bond_fund_rate: 3.5 },
  进取: { cash_rate: 0.5, fixed_deposit_rate: 2.5, a_stock_rate: 10, hk_stock_rate: 7.0, us_stock_rate: 12, bond_fund_rate: 4.0 },
};

export interface HouseParams {
  P_wan: number;           // 总价（万元）
  dp_pct: number;          // 首付比例（e.g. 20 = 20%）
  deed_rate_pct: number;   // 契税（e.g. 1.5）
  vat_rate_pct: number;    // 增值税（0 if exempt）
  pit_wan: number;         // 个税（万元，0 if M5U/new house）
  reno_wan: number;        // 装修（万元）
  pm_unit: number;         // 物业费（元/㎡/月）
  area: number;            // 面积（㎡）
  n_years: number;         // 贷款年限
  gjj_pct: number;         // 贷款中公积金占比（0–100）
  lpr_pct: number;         // 商业贷款利率（e.g. 3.05）
  gjj_rate_pct: number;    // 公积金贷款利率（e.g. 2.6）
  repay_type: "等额本息" | "等额本金";
  g_p_pct: number;         // 房价年涨幅（e.g. 3）
}

export interface RentParams {
  rent_monthly: number;           // 当前月租金（元）
  gjj_rent_withdrawal: number;    // 可提公积金用于租房（元/月），0 = 不提取
  g_r_pct: number;                // 租金年涨幅（e.g. 3）
  monthly_income: number;         // 月收入（元）
  gjj_monthly_contribution: number; // 每月缴纳公积金（元）—— 还贷时会被划扣
}

export interface DecisionInput {
  assets: AssetPool;
  yields: YieldAssumptions;
  house: HouseParams;
  rent: RentParams;
  horizon_years: number;  // 分析年限（e.g. 10）
  risk_profile: RiskProfile;
}

/* ──────────────────── Internal helpers ──────────────────── */

const toRate = (pct: number) => pct / 100;

/** 等额本息月供（元） */
function pmt_annuity(principal_wan: number, annual_rate_pct: number, years: number): number {
  if (years <= 0 || principal_wan <= 0) return 0;
  const r = toRate(annual_rate_pct) / 12;
  const n = years * 12;
  if (r === 0) return (principal_wan * 10000) / n;
  return (principal_wan * 10000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/** 等额本金第m期月供（元，1-indexed） */
function pmt_declining(principal_wan: number, annual_rate_pct: number, years: number, month: number): number {
  if (years <= 0 || principal_wan <= 0) return 0;
  const r = toRate(annual_rate_pct) / 12;
  const n = years * 12;
  const monthly_principal = (principal_wan * 10000) / n;
  return monthly_principal + (principal_wan * 10000 - monthly_principal * (month - 1)) * r;
}

/** Remaining principal after m months paid (annuity loan) */
function remaining_principal_annuity(principal_wan: number, annual_rate_pct: number, years: number, months_paid: number): number {
  if (years <= 0 || principal_wan <= 0) return 0;
  const r = toRate(annual_rate_pct) / 12;
  const n = years * 12;
  if (r === 0) return principal_wan * 10000 * (1 - months_paid / n);
  return principal_wan * 10000 * (Math.pow(1 + r, n) - Math.pow(1 + r, months_paid)) / (Math.pow(1 + r, n) - 1);
}

/** Remaining principal after m months paid (equal-principal loan) */
function remaining_principal_declining(principal_wan: number, years: number, months_paid: number): number {
  if (years <= 0 || principal_wan <= 0) return 0;
  const n = years * 12;
  const monthly_principal = (principal_wan * 10000) / n;
  return Math.max(0, principal_wan * 10000 - monthly_principal * months_paid);
}

/** Blended annualized yield of the financial portfolio */
function blended_yield(assets: AssetPool, y: YieldAssumptions): number {
  const rows: [number, number][] = [
    [assets.cash_wan, y.cash_rate],
    [assets.fixed_deposit_wan, y.fixed_deposit_rate],
    [assets.a_stock_wan, y.a_stock_rate],
    [assets.hk_stock_wan, y.hk_stock_rate],
    [assets.us_stock_wan, y.us_stock_rate],
    [assets.bond_fund_wan, y.bond_fund_rate],
    // GJJ balance earns ~1.5% (regulated)
    [assets.gjj_balance_wan, 1.5],
  ];
  const totalWan = rows.reduce((s, [w]) => s + w, 0);
  if (totalWan <= 0) return 2.5;
  return rows.reduce((s, [w, r]) => s + (w / totalWan) * r, 0);
}

/** Total financial assets in wan */
function total_financial_wan(assets: AssetPool): number {
  return (
    assets.cash_wan + assets.fixed_deposit_wan + assets.a_stock_wan +
    assets.hk_stock_wan + assets.us_stock_wan + assets.bond_fund_wan +
    assets.gjj_balance_wan
  );
}

/**
 * Compute how much (in wan) is liquidated from each bucket to cover 'needed_wan'.
 * Liquidation priority: cash → fixed_deposit → gjj_balance → bond_fund → a_stock → hk_stock → us_stock
 * Returns: { remaining: AssetPool, shortfall_wan: number }
 */
function liquidate_for_downpayment(
  assets: AssetPool,
  needed_wan: number
): { remaining: AssetPool; shortfall_wan: number; liquidated: Record<string, number> } {
  const buckets: Array<[keyof AssetPool, number]> = [
    ["cash_wan", assets.cash_wan],
    ["fixed_deposit_wan", assets.fixed_deposit_wan],
    ["gjj_balance_wan", assets.gjj_balance_wan],
    ["bond_fund_wan", assets.bond_fund_wan],
    ["a_stock_wan", assets.a_stock_wan],
    ["hk_stock_wan", assets.hk_stock_wan],
    ["us_stock_wan", assets.us_stock_wan],
  ];

  const remaining = { ...assets };
  const liquidated: Record<string, number> = {};
  let left = needed_wan;

  for (const [key] of buckets) {
    if (left <= 0) break;
    const available = remaining[key];
    const take = Math.min(available, left);
    remaining[key] = available - take;
    liquidated[key] = (liquidated[key] ?? 0) + take;
    left -= take;
  }

  return { remaining, shortfall_wan: Math.max(0, left), liquidated };
}

/* ──────────────────── Output Types ──────────────────── */

export interface YearlySnapshot {
  year: number;
  buyNAV_wan: number;         // 买房路径净资产
  rentNAV_wan: number;        // 租房路径净资产
  gap_wan: number;            // buy - rent
  buyPropertyValue_wan: number;
  buyRemainingDebt_wan: number;
  buyFinancialAssets_wan: number;
  rentFinancialAssets_wan: number;
}

export interface MonthlyPressure {
  year: number;
  buy_monthly_cost: number;     // 月供 + 物业费（元）
  rent_monthly_cost: number;    // 房租净（扣除公积金提取后）（元）
  buy_surplus: number;          // 月收入 - 月供 - 物业费（正=结余）
  rent_surplus: number;         // 月收入 - 房租净（正=结余）
}

export interface AssetLiquidationPlan {
  downpayment_wan: number;
  taxes_fees_wan: number;
  reno_wan: number;
  total_needed_wan: number;
  shortfall_wan: number;       // if > 0, assets insufficient
  liquidated: Record<string, number>;
  remaining_financial_wan: number;
  remaining_assets: AssetPool;
}

export interface ScenarioResult {
  label: string;
  g_p_pct: number;
  yield_multiplier: number;
  buyNAV_wan: number;
  rentNAV_wan: number;
  gap_wan: number;
}

export interface DecisionOutput {
  feasible: boolean;           // can afford down payment?
  shortfall_wan: number;       // how much more cash needed

  liquidation: AssetLiquidationPlan;
  blended_yield_pct: number;   // portfolio's blended yield

  yearly: YearlySnapshot[];
  breakEvenYear: number | null;
  horizon_buyNAV: number;
  horizon_rentNAV: number;
  horizon_gap: number;

  monthly_pressure: MonthlyPressure[];  // years 1, 3, 5, 10 (if within horizon)

  scenarios: ScenarioResult[];          // Bear / Base / Bull

  /* Ratios & insight */
  buy_initial_monthly: number;          // first month total payment (yuan)
  rent_net_monthly_yr1: number;         // rent net of GJJ withdrawal (yuan)
  property_pm_monthly: number;          // 物业费/月
  opportunity_cost_10yr_wan: number;    // what liquidated assets would have grown to
  downpayment_lock_pct: number;         // % of total wealth locked in down payment
  liquidity_score_buy: number;          // 0–100  remaining liquid assets ratio
  liquidity_score_rent: number;         // 0–100  (usually higher)

  /* GJJ & asset structure insights */
  gjj_balance_used_wan: number;
  total_assets_wan: number;

  recommendation: "建议购买" | "建议继续租房" | "势均力敌 — 看个人偏好";
  summary_lines: string[];
}

/* ──────────────────── Main calculation ──────────────────── */
export function runDecisionModel(input: DecisionInput): DecisionOutput {
  const { assets, yields, house, rent, horizon_years } = input;

  /* ── 1. Cost structure ── */
  const dp_wan = house.P_wan * toRate(house.dp_pct);
  const deed_wan = house.P_wan * toRate(house.deed_rate_pct);
  const vat_wan = house.P_wan * toRate(house.vat_rate_pct);
  const pit_wan = house.pit_wan;
  const taxes_fees_wan = deed_wan + vat_wan + pit_wan;
  const reno_wan = house.reno_wan;
  const total_needed_wan = dp_wan + taxes_fees_wan + reno_wan;

  /* ── 2. Asset liquidation ── */
  const { remaining: remaining_assets, shortfall_wan, liquidated } = liquidate_for_downpayment(assets, total_needed_wan);
  const total_financial_start = total_financial_wan(assets);
  const remaining_financial_start = total_financial_wan(remaining_assets);
  const feasible = shortfall_wan === 0;

  const liquidation: AssetLiquidationPlan = {
    downpayment_wan: dp_wan,
    taxes_fees_wan,
    reno_wan,
    total_needed_wan,
    shortfall_wan,
    liquidated,
    remaining_financial_wan: remaining_financial_start,
    remaining_assets,
  };

  /* ── 3. Mortgage ── */
  const loan_total_wan = house.P_wan - dp_wan;
  const gjj_loan_wan = Math.min(loan_total_wan * toRate(house.gjj_pct), loan_total_wan);
  const com_loan_wan = Math.max(0, loan_total_wan - gjj_loan_wan);
  const n_years = house.n_years;

  const gjj_monthly = pmt_annuity(gjj_loan_wan, house.gjj_rate_pct, n_years);
  const com_monthly =
    house.repay_type === "等额本息"
      ? pmt_annuity(com_loan_wan, house.lpr_pct, n_years)
      : pmt_declining(com_loan_wan, house.lpr_pct, n_years, 1);
  const pm_monthly = house.pm_unit * house.area;
  const buy_monthly_yr1 = gjj_monthly + com_monthly + pm_monthly;

  /* ── 4. Rent net ── */
  const rent_net_monthly_yr1 = Math.max(0, rent.rent_monthly - rent.gjj_rent_withdrawal);

  /* ── 5. Blended yield of portfolio ── */
  const blend_pct = blended_yield(assets, yields);

  /* ── 6. Year-by-year simulation ── */
  const yearly: YearlySnapshot[] = [];
  const monthly_pressure_map = new Map<number, MonthlyPressure>();
  const check_years = [1, 3, 5, 10].filter((y) => y <= horizon_years);

  // Rent path: all original assets grow at blended yield
  // Monthly surplus (if rent < income) re-invested
  let rentFinancial_wan = total_financial_start;
  // Each year, accumulated monthly surplus in rent path
  let rentSurplus_cumulative_wan = 0;

  // Buy path: remaining assets grow at blended yield
  // Property appreciates at g_p
  // Monthly surplus (income - mortgage - pm) re-invested
  let buyFinancial_wan = remaining_financial_start;
  let buySurplus_cumulative_wan = 0;
  let breakEvenYear: number | null = null;

  const g_p = toRate(house.g_p_pct);
  const g_r = toRate(rent.g_r_pct);
  const blend_annual = toRate(blend_pct);
  const monthly_income = rent.monthly_income;

  let buy_nav_prev = 0;
  let rent_nav_prev = 0;

  for (let year = 1; year <= horizon_years; year++) {
    /* Property value this year */
    const property_val_wan = house.P_wan * Math.pow(1 + g_p, year);

    /* Remaining mortgage debt */
    const months_paid = Math.min(year * 12, n_years * 12);
    const gjj_remaining =
      loan_total_wan > 0 && gjj_loan_wan > 0
        ? remaining_principal_annuity(gjj_loan_wan, house.gjj_rate_pct, n_years, months_paid) / 10000
        : 0;
    const com_remaining =
      com_loan_wan > 0
        ? (house.repay_type === "等额本息"
            ? remaining_principal_annuity(com_loan_wan, house.lpr_pct, n_years, months_paid)
            : remaining_principal_declining(com_loan_wan, n_years, months_paid)) / 10000
        : 0;
    const remaining_debt_wan = gjj_remaining + com_remaining;

    /* Financial assets grow for 1 year */
    buyFinancial_wan *= 1 + blend_annual;
    rentFinancial_wan *= 1 + blend_annual;

    /* Monthly cashflows this year */
    const yr_rent_net =
      rent.rent_monthly * Math.pow(1 + g_r, year - 1) - rent.gjj_rent_withdrawal;
    const yr_buy_payment =
      house.repay_type === "等额本息"
        ? gjj_monthly + com_monthly + pm_monthly
        : pmt_declining(com_loan_wan, house.lpr_pct, n_years, Math.min(year * 6 + 1, n_years * 12)) +
          gjj_monthly +
          pm_monthly;

    const buy_surplus_monthly = monthly_income - yr_buy_payment;
    const rent_surplus_monthly = monthly_income - Math.max(0, yr_rent_net);

    /* Accumulate surplus into financial assets */
    const surplus_invest_buy = (buy_surplus_monthly / 10000) * 12;
    const surplus_invest_rent = (rent_surplus_monthly / 10000) * 12;
    buyFinancial_wan += surplus_invest_buy;
    rentFinancial_wan += surplus_invest_rent;
    buySurplus_cumulative_wan += surplus_invest_buy;
    rentSurplus_cumulative_wan += surplus_invest_rent;

    /* NAVs */
    const buyNAV_wan = property_val_wan - remaining_debt_wan + Math.max(0, buyFinancial_wan);
    const rentNAV_wan = Math.max(0, rentFinancial_wan);
    const gap_wan = buyNAV_wan - rentNAV_wan;

    yearly.push({
      year,
      buyNAV_wan: Math.round(buyNAV_wan * 10) / 10,
      rentNAV_wan: Math.round(rentNAV_wan * 10) / 10,
      gap_wan: Math.round(gap_wan * 10) / 10,
      buyPropertyValue_wan: Math.round(property_val_wan * 10) / 10,
      buyRemainingDebt_wan: Math.round(remaining_debt_wan * 10) / 10,
      buyFinancialAssets_wan: Math.round(Math.max(0, buyFinancial_wan) * 10) / 10,
      rentFinancialAssets_wan: Math.round(Math.max(0, rentFinancial_wan) * 10) / 10,
    });

    /* Break-even detection */
    if (
      breakEvenYear === null &&
      ((buy_nav_prev <= rent_nav_prev && buyNAV_wan >= rentNAV_wan) ||
        (buy_nav_prev >= rent_nav_prev && buyNAV_wan <= rentNAV_wan))
    ) {
      breakEvenYear = year;
    }
    buy_nav_prev = buyNAV_wan;
    rent_nav_prev = rentNAV_wan;

    /* Snapshot pressure */
    if (check_years.includes(year)) {
      monthly_pressure_map.set(year, {
        year,
        buy_monthly_cost: Math.round(yr_buy_payment),
        rent_monthly_cost: Math.round(Math.max(0, yr_rent_net)),
        buy_surplus: Math.round(buy_surplus_monthly),
        rent_surplus: Math.round(rent_surplus_monthly),
      });
    }
  }

  const horizon_snap = yearly[yearly.length - 1] ?? yearly[0];
  const horizon_buyNAV = horizon_snap?.buyNAV_wan ?? 0;
  const horizon_rentNAV = horizon_snap?.rentNAV_wan ?? 0;
  const horizon_gap = horizon_buyNAV - horizon_rentNAV;

  /* ── 7. Scenarios (Bear / Base / Bull) ── */
  function run_scenario(g_p_override: number, yield_mult: number): ScenarioResult {
    let bf = remaining_financial_start;
    let rf = total_financial_start;
    const blend_s = blend_annual * yield_mult;
    const g_p_s = toRate(g_p_override);

    for (let y = 1; y <= horizon_years; y++) {
      bf *= 1 + blend_s;
      rf *= 1 + blend_s;
      bf += ((monthly_income - buy_monthly_yr1) / 10000) * 12;
      rf += ((monthly_income - rent_net_monthly_yr1) / 10000) * 12;
    }
    const prop = house.P_wan * Math.pow(1 + g_p_s, horizon_years);
    const months_h = Math.min(horizon_years * 12, n_years * 12);
    const rem_gjj = gjj_loan_wan > 0
      ? remaining_principal_annuity(gjj_loan_wan, house.gjj_rate_pct, n_years, months_h) / 10000
      : 0;
    const rem_com = com_loan_wan > 0
      ? remaining_principal_annuity(com_loan_wan, house.lpr_pct, n_years, months_h) / 10000
      : 0;
    const buyNAV = prop - rem_gjj - rem_com + Math.max(0, bf);
    const rentNAV = Math.max(0, rf);
    return {
      label: g_p_override < house.g_p_pct ? "悲观" : g_p_override > house.g_p_pct ? "乐观" : "基准",
      g_p_pct: g_p_override,
      yield_multiplier: yield_mult,
      buyNAV_wan: Math.round(buyNAV * 10) / 10,
      rentNAV_wan: Math.round(rentNAV * 10) / 10,
      gap_wan: Math.round((buyNAV - rentNAV) * 10) / 10,
    };
  }

  const scenarios: ScenarioResult[] = [
    run_scenario(house.g_p_pct - 2, 0.8),   // Bear: house -2%, yields lower
    run_scenario(house.g_p_pct, 1.0),        // Base
    run_scenario(house.g_p_pct + 2, 1.2),   // Bull: house +2%, yields higher
  ];

  /* ── 8. Derived insight ── */
  const opportunity_cost_10yr_wan = (() => {
    const liq_total = Object.values(liquidated).reduce((a, b) => a + b, 0);
    return liq_total * (Math.pow(1 + blend_annual, Math.min(10, horizon_years)) - 1);
  })();

  const downpayment_lock_pct =
    total_financial_start > 0
      ? Math.min(100, Math.round((total_needed_wan / total_financial_start) * 100))
      : 0;

  const liquidity_score_rent = Math.min(100, Math.max(0, Math.round((total_financial_start / Math.max(1, total_financial_start)) * 100)));
  const liquidity_score_buy = Math.min(100, Math.max(0, Math.round((remaining_financial_start / Math.max(1, total_financial_start)) * 100)));

  const gjj_balance_used_wan = liquidated["gjj_balance_wan"] ?? 0;

  /* ── 9. Recommendation ── */
  let recommendation: DecisionOutput["recommendation"];
  if (horizon_gap > house.P_wan * 0.15) recommendation = "建议购买";
  else if (horizon_gap < -house.P_wan * 0.10) recommendation = "建议继续租房";
  else recommendation = "势均力敌 — 看个人偏好";

  const horizon_pct = horizon_gap / Math.max(1, Math.abs(horizon_rentNAV)) * 100;
  const summary_lines: string[] = [
    `🏠 ${horizon_years} 年后：买房路径净资产约 ${horizon_buyNAV.toFixed(0)} 万，租房路径约 ${horizon_rentNAV.toFixed(0)} 万。`,
    `${horizon_gap >= 0 ? "📈" : "📉"} 两者差距约 ${Math.abs(horizon_gap).toFixed(0)} 万（${Math.abs(horizon_pct).toFixed(1)}%），买房${horizon_gap >= 0 ? "领先" : "落后"}。`,
    feasible
      ? `💰 首付 + 税费 + 装修合计 ${total_needed_wan.toFixed(1)} 万，资产可足额覆盖，购房后剩余流动资产约 ${remaining_financial_start.toFixed(0)} 万。`
      : `⚠ 首付 + 税费 + 装修合计 ${total_needed_wan.toFixed(1)} 万，**资金缺口约 ${shortfall_wan.toFixed(1)} 万**，需额外筹款。`,
    breakEvenYear !== null
      ? `⏱ 净资产超越点：约第 ${breakEvenYear} 年起买房路径${horizon_gap >= 0 ? "领先" : "落后"}。`
      : `⏱ 在 ${horizon_years} 年分析窗口内暂无明显交叉。`,
    `🔒 首付 + 成本占现有资产总量的 ${downpayment_lock_pct}%，购房后流动资产比例降至 ${liquidity_score_buy}%。`,
  ];

  return {
    feasible,
    shortfall_wan,
    liquidation,
    blended_yield_pct: Math.round(blend_pct * 10) / 10,
    yearly,
    breakEvenYear,
    horizon_buyNAV,
    horizon_rentNAV,
    horizon_gap,
    monthly_pressure: check_years.map((y) => monthly_pressure_map.get(y)!).filter(Boolean),
    scenarios,
    buy_initial_monthly: Math.round(buy_monthly_yr1),
    rent_net_monthly_yr1: Math.round(rent_net_monthly_yr1),
    property_pm_monthly: Math.round(pm_monthly),
    opportunity_cost_10yr_wan: Math.round(opportunity_cost_10yr_wan * 10) / 10,
    downpayment_lock_pct,
    liquidity_score_buy,
    liquidity_score_rent,
    gjj_balance_used_wan,
    total_assets_wan: total_financial_start,
    recommendation,
    summary_lines,
  };
}
