/**
 * Shanghai Housing Purchase Eligibility Engine
 * Based on 沪七条 (Shanghai 7 Measures), effective 2026-02-26
 * Source: 《关于进一步优化调整本市房地产政策的通知》
 */

export type HukouStatus = "SH" | "Non_SH";
export type MaritalStatus = "Single" | "Married";
export type TargetZone = "Inner_Ring" | "Outer_Ring";

export interface EligibilityInput {
  hukou_status: HukouStatus;
  marital_status: MaritalStatus;
  children_count: number;            // 未成年子女数
  social_security_years: number;     // 连续社保/个税缴纳年限
  residence_permit_years: number;    // 持上海市居住证年限
  target_zone: TargetZone;
  current_owned_sets_inner: number;  // 当前名下外环内房产套数
  current_owned_sets_outer: number;  // 当前名下外环外房产套数
  is_green_building: boolean;        // 绿色建筑/装配式
}

export interface EligibilityOutput {
  eligible: boolean;
  reason: string;
  detail_lines: string[];            // 详细推导步骤
  max_allowed_inner: number;         // 外环内最多可持有套数
  max_allowed_outer: number;         // 外环外最多可持有套数 (999 = 不限购)
  remaining_inner: number;           // 外环内还能买几套
  remaining_outer: number;           // 外环外还能买几套
  can_buy_in_target_zone: boolean;
  remaining_in_target_zone: number;
  // GJJ (公积金) 估算
  gjj_first_family_base_wan: number;    // 首套家庭基础额度
  gjj_multiplier: number;               // 上浮倍数
  gjj_estimated_wan: number;            // 估算公积金贷款上限
  gjj_notes: string[];
  // 税费
  vat_holding_years_for_exemption: number; // 增值税免征持有年限门槛
  deed_tax_rate_small_first_pct: number;
  deed_tax_rate_large_first_pct: number;
  deed_tax_rate_small_second_pct: number;
  deed_tax_rate_large_second_pct: number;
}

const INFINITY_SETS = 999;

/**
 * 判断是否符合非沪籍"居住证满5年"特例资格
 */
function qualifiesByResidencePermit(rp: number): boolean {
  return rp >= 5;
}

export function checkShanghaiEligibility(input: EligibilityInput): EligibilityOutput {
  const {
    hukou_status,
    marital_status,
    children_count,
    social_security_years,
    residence_permit_years,
    target_zone,
    current_owned_sets_inner,
    current_owned_sets_outer,
    is_green_building,
  } = input;

  const ss = social_security_years;
  const rp = residence_permit_years;
  const kids = children_count;
  const ownedInner = current_owned_sets_inner;
  const ownedOuter = current_owned_sets_outer;
  const isMultiChild = kids >= 2;
  const detail: string[] = [];

  let maxAllowedInner = 0;
  let maxAllowedOuter = 0;
  let eligible = false;
  let reason = "";

  // ─────────────── 非沪籍逻辑 ───────────────
  if (hukou_status === "Non_SH") {
    detail.push("户籍：非沪籍");

    // 居住证满5年特例
    const rpQualifies = qualifiesByResidencePermit(rp);
    if (rpQualifies) {
      detail.push(`居住证年限 ${rp} 年 ≥ 5 年，享受特例资格（全市可购 1 套，无需社保）`);
    }

    // 外环外
    if (ss >= 1 || rpQualifies) {
      maxAllowedOuter = INFINITY_SETS;
      detail.push(`外环外：${ss >= 1 ? `社保 ${ss} 年 ≥ 1 年` : "居住证满5年特例"}，不限购套数`);
    } else {
      maxAllowedOuter = 0;
      detail.push(`外环外：社保 ${ss} 年 < 1 年，且居住证 ${rp} 年 < 5 年，无资格`);
    }

    // 外环内
    if (ss >= 3) {
      maxAllowedInner = 2;
      detail.push(`外环内：社保 ${ss} 年 ≥ 3 年，可购 2 套（基础1套 + 增购1套）`);
    } else if (ss >= 1) {
      maxAllowedInner = 1;
      detail.push(`外环内：社保 ${ss} 年 ≥ 1 年，可购 1 套`);
    } else if (rpQualifies) {
      maxAllowedInner = 1;
      detail.push(`外环内：居住证满5年特例，可购 1 套`);
    } else {
      maxAllowedInner = 0;
      detail.push(`外环内：社保 ${ss} 年 < 1 年，居住证 ${rp} 年 < 5 年，无购房资格`);
    }

    // 多子女非沪籍增购 (外环内，满足基础资格 + ss≥1 或居住证≥5年)
    if (isMultiChild && (ss >= 1 || rpQualifies) && maxAllowedInner >= 1) {
      maxAllowedInner += 1;
      detail.push(`多子女（${kids}个未成年子女）：外环内可额外增购 1 套，上限升至 ${maxAllowedInner} 套`);
    }

    // 判定目标区域可否购买
    if (target_zone === "Outer_Ring") {
      const ok = maxAllowedOuter > ownedOuter;
      eligible = ok;
      reason = ok
        ? `非沪籍，外环外${ss >= 1 ? `社保满 ${ss} 年` : "居住证满5年"}，不限购，当前外环外持有 ${ownedOuter} 套，可继续购买`
        : `非沪籍，外环外购房条件不满足（社保 < 1年且居住证 < 5年）`;
    } else {
      const remaining = Math.max(0, maxAllowedInner - ownedInner);
      eligible = remaining > 0;
      reason = eligible
        ? `非沪籍，外环内最多可持有 ${maxAllowedInner} 套，当前已持有 ${ownedInner} 套，还可购买 ${remaining} 套`
        : maxAllowedInner === 0
          ? `非沪籍，不满足外环内购房资格（社保不足）`
          : `非沪籍，外环内已达套数上限（${maxAllowedInner} 套），无法继续购买`;
    }

  // ─────────────── 沪籍逻辑 ───────────────
  } else {
    detail.push("户籍：沪籍");
    detail.push("外环外：沪籍不限购");
    maxAllowedOuter = INFINITY_SETS;

    // 外环内基础套数
    let baseInner = 2; // 沪籍单身/已婚统一 2 套（沪七条后单身放开至2套）
    detail.push(`外环内基础套数：${marital_status === "Single" ? "单身（新政2套）" : "已婚家庭（2套）"} = ${baseInner} 套`);

    if (isMultiChild) {
      baseInner += 1;
      detail.push(`多子女（${kids}个未成年子女）：外环内增购 1 套，上限升至 ${baseInner} 套`);
    }

    maxAllowedInner = baseInner;

    const remaining = Math.max(0, maxAllowedInner - ownedInner);
    eligible = target_zone === "Outer_Ring" ? true : remaining > 0;

    if (target_zone === "Inner_Ring") {
      reason = eligible
        ? `沪籍，外环内最多可持有 ${maxAllowedInner} 套，当前已持有 ${ownedInner} 套，还可购买 ${remaining} 套`
        : `沪籍，外环内已达套数上限（${maxAllowedInner} 套），无法继续购买`;
    } else {
      reason = `沪籍，外环外不限购，当前外环外持有 ${ownedOuter} 套，可继续购买`;
    }
  }

  // ─────────────── 计算结果 ───────────────
  const remainingInner = Math.max(0, maxAllowedInner - ownedInner);
  const remainingOuter = maxAllowedOuter === INFINITY_SETS
    ? INFINITY_SETS
    : Math.max(0, maxAllowedOuter - ownedOuter);
  const remainingTarget = target_zone === "Inner_Ring" ? remainingInner : remainingOuter;

  // ─────────────── 公积金估算 ───────────────
  const totalOwned = ownedInner + ownedOuter;
  const isFirstBuy = totalOwned === 0;

  // 沪七条: 首套家庭上限 240万, 二套 120万 (估算)
  const gjjBase = isFirstBuy ? 240 : 120;
  const gjjNotes: string[] = [
    `${isFirstBuy ? "首套" : "非首套"}基础额度 ${gjjBase} 万`,
  ];

  let gjjMultiplier = 1.0;
  if (isMultiChild) {
    gjjMultiplier += 0.20;
    gjjNotes.push(`多子女家庭 +20% 上浮`);
  }
  if (is_green_building) {
    gjjMultiplier += 0.20;
    gjjNotes.push(`绿色建筑/装配式 +20% 上浮`);
  }
  // 封顶 1.35 倍
  if (gjjMultiplier > 1.35) {
    gjjMultiplier = 1.35;
    gjjNotes.push(`上浮封顶 35%（240 × 1.35 = 324 万）`);
  }

  const gjjEstimated = Math.min(gjjBase * gjjMultiplier, 324);
  if (isFirstBuy && gjjEstimated < 240) {
    gjjNotes.push(`最终额度 ${gjjEstimated.toFixed(0)} 万元`);
  } else if (isFirstBuy) {
    gjjNotes.push(`最终额度 ${gjjEstimated.toFixed(0)} 万元（上限 324 万）`);
  }

  return {
    eligible,
    reason,
    detail_lines: detail,
    max_allowed_inner: maxAllowedInner,
    max_allowed_outer: maxAllowedOuter,
    remaining_inner: remainingInner,
    remaining_outer: remainingOuter,
    can_buy_in_target_zone: eligible,
    remaining_in_target_zone: remainingTarget,
    gjj_first_family_base_wan: gjjBase,
    gjj_multiplier: gjjMultiplier,
    gjj_estimated_wan: gjjEstimated,
    gjj_notes: gjjNotes,
    vat_holding_years_for_exemption: 2,
    deed_tax_rate_small_first_pct: 1,
    deed_tax_rate_large_first_pct: 1.5,
    deed_tax_rate_small_second_pct: 1,
    deed_tax_rate_large_second_pct: 2,
  };
}
