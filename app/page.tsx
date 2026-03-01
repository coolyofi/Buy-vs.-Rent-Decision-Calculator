"use client";

import React, { useCallback, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { calculateModel, type ModelOutput, type ScenarioComparison } from "../lib/calc";
import { deriveEffectivePolicy } from "../lib/policyProfiles";

/* ─────────────────────────── Types ─────────────────────────── */
interface Inputs {
  // Step 0
  target_city: "上海" | "北京";
  is_second_home: boolean;
  // Step 1 – Property
  is_new_house: boolean;
  P: number;
  area: number;
  holding_years: number;
  // Step 2 – Financing (multi_child + GJJ_merge moved here from step 1)
  multi_child_bonus: boolean;
  GJJ_merge: boolean;
  dp_min: number;
  monthly_income: number;
  Emergency: number;
  n_years: number;
  Repay_type: "等额本息" | "等额本金";
  GJJ_extra: number;
  // Step 3 – Rent benchmark
  rent_0: number;
  years: number;
  R_inv: number;
  g_r: number;
  // Step 4 – Fine-tune (optional)
  Mix_ratio: number;
  g_p: number;
  Reno_hard: number;
  Reno_soft: number;
  PM_unit: number;
  M5U: boolean;
  Invest_consistency: number;
  Move_freq_years: number;
  Cash_runway_months: number;
}

const DEFAULT: Inputs = {
  target_city: "上海",
  is_second_home: false,
  is_new_house: false,
  P: 600,
  area: 90,
  holding_years: 2,
  multi_child_bonus: false,
  GJJ_merge: true,
  dp_min: 20,
  monthly_income: 25000,
  Emergency: 20,
  n_years: 30,
  Repay_type: "等额本息",
  GJJ_extra: 2000,
  rent_0: 8000,
  years: 10,
  R_inv: 5,
  g_r: 3,
  Mix_ratio: 50,
  g_p: 3,
  Reno_hard: 30,
  Reno_soft: 12,
  PM_unit: 5,
  M5U: true,
  Invest_consistency: 70,
  Move_freq_years: 2,
  Cash_runway_months: 6,
};

type Step = 0 | 1 | 2 | 3 | 4 | 5;

/* ─────────────────────────── Fmt helpers ─────────────────────────── */
const fmtWan = (yuan: number) => `${(yuan / 10000).toFixed(1)} 万元`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtMon = (yuan: number) => `${Math.round(yuan).toLocaleString()} 元/月`;
const sign = (n: number) => (n >= 0 ? "+" : "");
const fmtW = (wan: number) => `${wan.toFixed(1)} 万元`;

/* ─────────────────────────── Field wrapper ─────────────────────────── */
function Field({
  label,
  hint,
  desc,
  children,
  required,
}: {
  label: string;
  hint?: string;
  desc?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="field-wrap" style={{ marginBottom: 22 }}>
      <div className="field-label">
        {required && <span style={{ color: "#f87171", marginRight: 3 }}>*</span>}
        {label}
        {hint && (
          <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 400 }}>
            {" · "}{hint}
          </span>
        )}
      </div>
      {desc && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginBottom: 8, lineHeight: 1.5 }}>
          {desc}
        </div>
      )}
      {children}
    </div>
  );
}

/* ─────────────────────────── SliderInput — slider + number in one row ─── */
function SliderInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  displayFn,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  displayFn?: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <input
          type="range"
          className="gl-range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ minWidth: 70, textAlign: "right", fontSize: 15, fontWeight: 700, color: "#93c5fd", whiteSpace: "nowrap" }}>
          {displayFn ? displayFn(value) : `${value}${suffix ?? ""}`}
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          className="gl-input"
          value={value === 0 ? "" : value}
          min={min}
          max={max}
          step={step}
          style={{ paddingRight: suffix ? 60 : 14, fontSize: 14 }}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
            fontSize: 12, color: "rgba(255,255,255,0.35)", pointerEvents: "none",
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── NumInput ─────────────────────────── */
function NumInput({
  value, onChange, placeholder, min, max, step = 1, suffix,
}: {
  value: number; onChange: (v: number) => void; placeholder?: string;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number"
        className="gl-input"
        value={value === 0 ? "" : value}
        placeholder={placeholder}
        min={min} max={max} step={step}
        style={suffix ? { paddingRight: 64 } : {}}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      {suffix && (
        <span style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          fontSize: 12, color: "rgba(255,255,255,0.35)", pointerEvents: "none", whiteSpace: "nowrap",
        }}>{suffix}</span>
      )}
    </div>
  );
}

/* ─────────────────────────── Chips ─────────────────────────── */
function Chips<T extends string | boolean | number>({
  options, value, onChange,
}: {
  options: Array<{ label: string; value: T; desc?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chip-group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={`chip ${o.value === value ? "active" : ""}`}
          onClick={() => onChange(o.value)}
          type="button"
          title={o.desc}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────── InfoBox ─────────────────────────── */
function InfoBox({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "green" | "amber" | "red" }) {
  const map = {
    blue: { bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.22)", text: "rgba(147,197,253,0.9)" },
    green: { bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.22)", text: "rgba(110,231,183,0.9)" },
    amber: { bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.22)", text: "rgba(253,211,77,0.9)" },
    red: { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", text: "rgba(252,165,165,0.9)" },
  }[color];
  return (
    <div style={{
      background: map.bg, border: `1px solid ${map.border}`, borderRadius: 10,
      padding: "10px 14px", fontSize: 13, color: map.text, lineHeight: 1.6, marginTop: 8,
    }}>
      {children}
    </div>
  );
}

/* ─────────────────────────── LiveStat ─────────────────────────── */
function LiveStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-box" style={{ padding: "11px 14px", flex: 1 }}>
      <div className="t-label" style={{ marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#e8eaf0" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/* ─────────────────────────── Accuracy ─────────────────────────── */
function accuracyColor(pct: number) {
  if (pct >= 85) return "#34d399";
  if (pct >= 65) return "#60a5fa";
  return "#fbbf24";
}
function calcAccuracy(inp: Inputs, step: Step): number {
  const s1 = inp.P > 0 && inp.area > 0 ? 20 : 0;
  const s2 = inp.dp_min > 0 && inp.monthly_income > 0 && inp.n_years > 0 ? 25 : 0;
  const s3 = inp.rent_0 > 0 && inp.years > 0 ? 25 : 0;
  const s4 = step >= 4 ? 14 : 0;
  return Math.min(99, 16 + s1 + s2 + s3 + s4);
}

/* ─────────────────────────── StepHeader ─────────────────────────── */
function StepHeader({ step, total, accuracy }: { step: number; total: number; accuracy: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
      <div className="step-dots">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={i + 1 < step ? "step-dot done" : i + 1 === step ? "step-dot active" : "step-dot"} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="t-label">精度</span>
        <div style={{ width: 72 }}>
          <div className="accuracy-bar">
            <div className="accuracy-fill" style={{ width: `${accuracy}%`, background: `linear-gradient(90deg,${accuracyColor(accuracy)},#818cf8)` }} />
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: accuracyColor(accuracy) }}>{accuracy}%</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── NavRow ─────────────────────────── */
function NavRow({
  onBack, onNext, nextLabel = "下一步", nextDisabled = false, skipLabel, onSkip,
}: {
  onBack?: () => void; onNext: () => void; nextLabel?: string;
  nextDisabled?: boolean; skipLabel?: string; onSkip?: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, gap: 12 }}>
      <div>
        {onBack && <button className="gl-btn" onClick={onBack} type="button">← 返回</button>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {skipLabel && onSkip && (
          <button className="gl-btn" onClick={onSkip} type="button">{skipLabel}</button>
        )}
        <button className="gl-btn gl-btn-primary" onClick={onNext} disabled={nextDisabled} type="button">
          {nextLabel} →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── PolicyBadges ─────────────────────────── */
function PolicyBadges({ inp }: { inp: Inputs }) {
  const policy = useMemo(() => deriveEffectivePolicy({ ...inp }), [inp]);
  const effectiveLpr = policy.lprPct + policy.bpBps / 100;
  const deedRate =
    inp.area <= 140
      ? (inp.is_second_home ? policy.deedRateSmallSecondPct : policy.deedRateSmallFirstPct)
      : (inp.is_second_home ? policy.deedRateLargeSecondPct : policy.deedRateLargeFirstPct);
  const vatText = inp.is_new_house
    ? "增值税：新房免征 ✓"
    : inp.holding_years >= policy.vatExemptHoldingYears
    ? `增值税：满${policy.vatExemptHoldingYears}年免征 ✓`
    : `增值税：${policy.vatNonExemptPct}%（未满${policy.vatExemptHoldingYears}年）`;

  return (
    <div className="glass-inset" style={{ padding: "13px 16px" }}>
      <div className="t-label" style={{ marginBottom: 9 }}>政策自动应用</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {[
          `首付下限 ${policy.dpMinPct}%`,
          `商贷利率 ${effectiveLpr.toFixed(2)}%`,
          `公积金 ${inp.is_second_home ? policy.gjjRateSecondPct : policy.gjjRateFirstPct}%`,
          `契税 ${deedRate}%`,
          vatText,
        ].map((t) => (
          <span key={t} className="badge badge-blue">{t}</span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   REPORT SCREEN
──────────────────────────────────────────────────────────────────────*/
function ReportScreen({ result, inp, onReset }: { result: ModelOutput; inp: Inputs; onReset: () => void }) {
  const r = result.report;
  const wv = result.wealthView;
  const navDiff = wv?.navDiff ?? (result.buyTotal - result.rentTotal);
  const buyNAV = wv?.buyNAV ?? result.buyTotal;
  const rentNAV = wv?.rentNAV ?? result.rentTotal;

  const zoneClass =
    r.executiveSummary.zone === "建议购买区" ? "zone-buy"
    : r.executiveSummary.zone === "继续租房区" ? "zone-rent"
    : "zone-watch";
  const zoneEmoji = r.executiveSummary.zone === "建议购买区" ? "🏡" : r.executiveSummary.zone === "继续租房区" ? "🏠" : "🔭";

  const scenarioColor = (s: ScenarioComparison) => s.gap > 0 ? "#34d399" : s.gap < 0 ? "#f87171" : "#94a3b8";

  return (
    <div className="fade-up" style={{ maxWidth: 760, margin: "0 auto" }}>
      {/* Zone banner */}
      <div className={`glass ${zoneClass}`} style={{ padding: "26px 28px", marginBottom: 20, borderRadius: 22 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <span style={{ fontSize: 42 }}>{zoneEmoji}</span>
          <div style={{ flex: 1 }}>
            <div className="t-label" style={{ marginBottom: 5, color: "rgba(255,255,255,0.45)" }}>决策分区</div>
            <div className="t-title" style={{ marginBottom: 7 }}>{r.executiveSummary.zone}</div>
            <div className="t-body" style={{ marginBottom: 9 }}>{r.decisionMap.reason}</div>
            <div className="t-label" style={{ color: "rgba(255,255,255,0.38)" }}>{r.executiveSummary.decisionWindow}</div>
          </div>
        </div>
      </div>

      {/* Core NAV */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 11, marginBottom: 18 }}>
        {[
          { label: "买房净资产", value: fmtWan(buyNAV), cls: "grad-buy" },
          { label: "租房净资产", value: fmtWan(rentNAV), cls: "grad-rent" },
          { label: "差额（买−租）", value: `${sign(navDiff)}${fmtWan(navDiff)}`, color: navDiff >= 0 ? "#34d399" : "#f87171" },
        ].map((item) => (
          <div key={item.label} className="stat-box">
            <div className="t-label" style={{ marginBottom: 6 }}>{item.label}</div>
            <div className={`t-value ${item.cls ?? ""}`} style={item.color ? { color: item.color } : {}}>{item.value}</div>
            <div className="t-label" style={{ marginTop: 4 }}>{inp.years} 年后</div>
          </div>
        ))}
      </div>

      {/* Scenarios */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📊 三情景净资产对比</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {(r.netWorthComparison.scenarios ?? []).map((s) => {
            const pct = Math.min(96, Math.max(6, Math.abs(s.gap) / Math.max(1, Math.abs(navDiff) * 1.8) * 80 + 8));
            return (
              <div key={s.name} className="glass-inset" style={{ padding: "12px 15px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="badge badge-blue" style={{ fontSize: 11 }}>
                      {s.name === "Bear" ? "偏弱" : s.name === "Base" ? "基准" : "偏强"}
                    </span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>房价 {fmtPct(s.houseGrowth)}/年</span>
                  </div>
                  <span style={{ fontWeight: 700, color: scenarioColor(s), fontSize: 15 }}>{sign(s.gap)}{fmtWan(s.gap)}</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2,
                    background: s.gap >= 0 ? "linear-gradient(90deg,#34d399,#60a5fa)" : "linear-gradient(90deg,#f87171,#c084fc)" }} />
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 11, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.netWorthComparison.crossoverYear !== null && (
            <span className="badge badge-green">净资产超越点：第 {r.netWorthComparison.crossoverYear} 年</span>
          )}
          <span className="badge badge-amber">房价平衡增速：{fmtPct(r.netWorthComparison.breakEvenGrowth)}</span>
        </div>
      </div>

      {/* Financial baseline */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>💼 财务基线</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "月收入估算", value: fmtMon(r.financialBaseline.monthlyIncomeEstimate) },
            { label: "月固定支出", value: fmtMon(r.financialBaseline.fixedExpense) },
            { label: "购房后自由现金", value: fmtMon(r.financialBaseline.freeCashAfterMortgage), warn: r.financialBaseline.freeCashAfterMortgage < 0 },
            { label: "紧急备用月数", value: `${r.financialBaseline.emergencyRunwayMonths.toFixed(1)} 个月` },
            { label: "收入稳定性", value: r.financialBaseline.incomeStabilityLevel },
            { label: "液动资产比率", value: fmtPct(r.financialBaseline.liquidAssetsRatio) },
          ].map((item) => (
            <div key={item.label} className="stat-box" style={{ padding: "10px 14px" }}>
              <div className="t-label" style={{ marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "warn" in item && item.warn ? "#f87171" : "#e8eaf0" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Buy simulation */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>🏡 购房模拟</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[
            { label: "首付", value: fmtWan(r.buySimulation.initialCosts.downPayment) },
            { label: "税费", value: fmtWan(r.buySimulation.initialCosts.taxesAndFees) },
            { label: "装修", value: fmtWan(r.buySimulation.initialCosts.renovation) },
            { label: "一次性合计", value: fmtWan(r.buySimulation.initialCosts.total) },
          ].map((item) => (
            <div key={item.label} className="stat-box" style={{ padding: "10px 14px" }}>
              <div className="t-label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div className="gl-divider" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "当前月供", value: fmtMon(r.buySimulation.monthlyOutflow) },
            { label: "前 3 年月均", value: fmtMon(r.buySimulation.first3YearsPressure) },
            { label: "第 5 年月供", value: fmtMon(r.buySimulation.stableAfter5Years) },
          ].map((item) => (
            <div key={item.label} className="stat-box" style={{ padding: "10px 14px" }}>
              <div className="t-label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 11, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge badge-amber">10年利息 {fmtWan(r.buySimulation.interestPaid10Years)}</span>
          <span className="badge badge-blue">10年还本 {fmtWan(r.buySimulation.principalPaid10Years)}</span>
        </div>
      </div>

      {/* Rent simulation */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>🏠 租房模拟</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
          {(r.rentSimulation.scenarios ?? []).map((s) => (
            <div key={s.label} className="stat-box" style={{ padding: "10px 14px", flex: 1, minWidth: 100 }}>
              <div className="t-label" style={{ marginBottom: 3 }}>{s.label} ({fmtPct(s.growthRate)}/年)</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtWan(s.totalCost)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge badge-purple">搬迁摩擦 {Math.round(r.rentSimulation.relocationCost).toLocaleString()} 元</span>
          <span className="badge badge-green">首付再投资贡献 {fmtWan(r.rentSimulation.investmentContribution)}</span>
        </div>
      </div>

      {/* Stress test */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>⚡ 压力测试</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "收入下降 20%", value: `覆盖率 ${(r.stressTest.incomeDrop20.monthlyCoverageRatio * 100).toFixed(0)}%`, ok: r.stressTest.incomeDrop20.safe },
            { label: "收入下降 40%", value: `覆盖率 ${(r.stressTest.incomeDrop40.monthlyCoverageRatio * 100).toFixed(0)}%`, ok: r.stressTest.incomeDrop40.safe },
            { label: "利率上行 +50BP", value: `月供 +${r.stressTest.rateUp50bpMonthlyChange.toLocaleString()} 元`, ok: r.stressTest.rateUp50bpMonthlyChange < 2000 },
            { label: "失业 6 个月", value: r.stressTest.unemployment6MonthsSafe ? "✓ 备用金充足" : "⚠ 备用金告急", ok: r.stressTest.unemployment6MonthsSafe },
          ].map((item) => (
            <div key={item.label} className="stat-box" style={{ padding: "10px 14px", borderColor: item.ok ? "rgba(52,211,153,0.22)" : "rgba(248,113,113,0.22)" }}>
              <div className="t-label" style={{ marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.ok ? "#6ee7b7" : "#fca5a5" }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Triggers */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>🔔 什么时候可以触发买入？</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(r.triggerConditions ?? []).map((c, i) => (
            <div key={i} className="glass-inset" style={{ padding: "10px 14px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{c}</div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 28 }}>
        <span className="badge badge-blue">{r.policy.policyName}</span>
        <span className="t-label">{r.policy.policyVersion}</span>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 56 }}>
        <button className="gl-btn" onClick={onReset} type="button">↩ 重新测算</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   PAGE
──────────────────────────────────────────────────────────────────────*/
export default function WizardPage() {
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [inputs, dispatch] = useReducer(
    (state: Inputs, patch: Partial<Inputs>) => ({ ...state, ...patch }),
    DEFAULT
  );
  const [result, setResult] = useState<ModelOutput | null>(null);
  const [calculating, setCalculating] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const accuracy = calcAccuracy(inputs, step);

  const go = useCallback((next: Step, isBack = false) => {
    setDir(isBack ? "back" : "fwd");
    setStep(next);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  }, []);

  /* Required guards */
  const canStep1 = inputs.P > 0 && inputs.area > 0;
  const canStep2 = inputs.dp_min > 0 && inputs.monthly_income > 0 && inputs.n_years > 0;
  const canStep3 = inputs.rent_0 > 0 && inputs.years > 0;

  /* Derived policy */
  const policy = useMemo(
    () => deriveEffectivePolicy({ ...inputs }),
    [inputs]
  );

  /* Live financing calculations */
  const totalLoanWan = useMemo(() => Math.max(0, inputs.P * (1 - inputs.dp_min / 100)), [inputs.P, inputs.dp_min]);
  const downPayWan = useMemo(() => Math.max(0, inputs.P * inputs.dp_min / 100), [inputs.P, inputs.dp_min]);
  const gjjCapWan = useMemo(() => {
    if (inputs.multi_child_bonus) return policy.gjjMaxMultiChildWan;
    return inputs.GJJ_merge ? policy.gjjMaxFamilyWan : policy.gjjMaxSingleWan;
  }, [inputs.multi_child_bonus, inputs.GJJ_merge, policy]);
  const gjjMaxLoanWan = useMemo(() => Math.min(totalLoanWan, gjjCapWan), [totalLoanWan, gjjCapWan]);
  const gjjFullMixPct = useMemo(() =>
    totalLoanWan > 0 ? Math.min(100, Math.round((gjjCapWan / totalLoanWan) * 100)) : 0,
    [gjjCapWan, totalLoanWan]
  );

  /* Approx remaining liquid after purchase */
  const roughTaxWan = useMemo(() => {
    const deedRate = inputs.area <= 140
      ? (inputs.is_second_home ? policy.deedRateSmallSecondPct : policy.deedRateSmallFirstPct)
      : (inputs.is_second_home ? policy.deedRateLargeSecondPct : policy.deedRateLargeFirstPct);
    return inputs.P * deedRate / 100;
  }, [inputs.P, inputs.area, inputs.is_second_home, policy]);
  const remainingLiquidWan = useMemo(
    () => inputs.Emergency - downPayWan - roughTaxWan - inputs.Reno_hard - inputs.Reno_soft,
    [inputs.Emergency, downPayWan, roughTaxWan, inputs.Reno_hard, inputs.Reno_soft]
  );

  /* Reno preset helper */
  const renoHardPresets = useMemo(() => [
    { label: "基础款", value: Math.round(inputs.area * 700 / 10000 * 10) / 10, desc: `约 700 元/㎡` },
    { label: "良好", value: Math.round(inputs.area * 1500 / 10000 * 10) / 10, desc: `约 1500 元/㎡` },
    { label: "精装", value: Math.round(inputs.area * 2000 / 10000 * 10) / 10, desc: `约 2000 元/㎡` },
  ], [inputs.area]);
  const renoSoftPresets = useMemo(() => [
    { label: "基础款", value: Math.round(inputs.area * 150 / 10000 * 10) / 10, desc: `约 150 元/㎡` },
    { label: "良好", value: Math.round(inputs.area * 300 / 10000 * 10) / 10, desc: `约 300 元/㎡` },
    { label: "品质", value: Math.round(inputs.area * 1000 / 10000 * 10) / 10, desc: `约 1000 元/㎡` },
  ], [inputs.area]);

  const runCalculation = useCallback(() => {
    setCalculating(true);
    const vatRate = inputs.is_new_house ? 0 : (inputs.holding_years >= policy.vatExemptHoldingYears ? 0 : policy.vatNonExemptPct);
    const merged = {
      ...inputs,
      M5U: inputs.M5U ? "yes" : "no",
      is_second_home: inputs.is_second_home ? 1 : 0,
      multi_child_bonus: inputs.multi_child_bonus ? 1 : 0,
      GJJ_merge: inputs.GJJ_merge ? 1 : 0,
      LPR: policy.lprPct,
      BP: policy.bpBps,
      r_gjj: inputs.is_second_home ? policy.gjjRateSecondPct : policy.gjjRateFirstPct,
      Deed1_rate: inputs.area <= 140 ? policy.deedRateSmallFirstPct : policy.deedRateLargeFirstPct,
      Deed2_rate: inputs.area <= 140 ? policy.deedRateSmallSecondPct : policy.deedRateLargeSecondPct,
      VAT_rate: vatRate,
      GJJ_max_single: policy.gjjMaxSingleWan,
      GJJ_max_family: policy.gjjMaxFamilyWan,
      GJJ_max_multichild: policy.gjjMaxMultiChildWan,
    };
    setTimeout(() => {
      try {
        const out = calculateModel(merged);
        setResult(out);
      } catch (e) {
        console.error(e);
      }
      setCalculating(false);
      go(5);
    }, 350);
  }, [inputs, policy, go]);

  const reset = useCallback(() => { setResult(null); go(0); }, [go]);

  const animClass = dir === "fwd" ? "step-enter" : "step-back";

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", paddingBottom: 60 }}>
      {/* Ambient orbs */}
      <div className="orb" style={{ width: 620, height: 620, top: -220, left: -170, background: "radial-gradient(circle,rgba(99,102,241,0.32) 0%,transparent 70%)" }} />
      <div className="orb" style={{ width: 480, height: 480, bottom: -120, right: -90, background: "radial-gradient(circle,rgba(52,211,153,0.18) 0%,transparent 70%)", animationDelay: "3s" }} />
      <div className="orb" style={{ width: 340, height: 340, top: "42%", right: "18%", background: "radial-gradient(circle,rgba(244,114,182,0.12) 0%,transparent 70%)", animationDelay: "6s" }} />

      <div ref={topRef} />
      <div style={{ maxWidth: 580, margin: "0 auto", padding: "0 18px" }}>

        {/* ══════════════ STEP 0 — INTRO ══════════════ */}
        {step === 0 && (
          <div key="s0" className={animClass} style={{ paddingTop: 80 }}>
            <div style={{ textAlign: "center", marginBottom: 52 }}>
              <div className="t-label" style={{ marginBottom: 14, color: "#60a5fa", letterSpacing: "0.12em" }}>
                买 VS 租 · 专业决策系统
              </div>
              <h1 className="t-hero" style={{ marginBottom: 18 }}>
                <span className="grad-text">你现在买房</span>
                <br />真的划算吗？
              </h1>
              <p className="t-subtitle" style={{ maxWidth: 400, margin: "0 auto", lineHeight: 1.85 }}>
                4 步引导，基于真实净资产模型对比买房与租房路径。
                <br />
                <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 13 }}>
                  填得越多模型越精准 · 数据本地计算不上传
                </span>
              </p>
            </div>

            <div className="glass" style={{ padding: "24px 26px", marginBottom: 22 }}>
              <Field label="目标城市" desc="影响贷款基准利率、公积金上限与契税政策。">
                <Chips
                  options={[{ label: "🌆 上海", value: "上海" as const }, { label: "🏛 北京", value: "北京" as const }]}
                  value={inputs.target_city}
                  onChange={(v) => dispatch({ target_city: v })}
                />
              </Field>
              <Field label="购房套数" desc="首套与二套的首付比例、利率均有差异。">
                <Chips
                  options={[{ label: "首套", value: false }, { label: "二套", value: true }]}
                  value={inputs.is_second_home}
                  onChange={(v) => dispatch({ is_second_home: v })}
                />
              </Field>
            </div>

            <div style={{ textAlign: "center" }}>
              <button className="gl-btn gl-btn-primary" onClick={() => go(1)} type="button" style={{ fontSize: 16, padding: "15px 52px" }}>
                开始测算 →
              </button>
              <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>约 3 分钟完成全部 4 步</div>
            </div>

            {/* Decision engine promo */}
            <Link href="/decision" style={{ display: "block", textDecoration: "none", marginTop: 28 }}>
              <div className="glass-inset" style={{ padding: "16px 20px", borderRadius: 16,
                border: "1px solid rgba(52,211,153,0.22)", cursor: "pointer",
                transition: "border-color 0.2s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 28 }}>🧮</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#e8eaf0", marginBottom: 3 }}>
                      资产决策引擎版（新）
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.55 }}>
                      把你在 A股、美股、定存、公积金的资产都放进来，看看买房 vs 继续投资哪条路更富有
                    </div>
                  </div>
                  <span style={{ color: "#34d399", fontSize: 18 }}>→</span>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* ══════════════ STEP 1 — PROPERTY ══════════════ */}
        {step === 1 && (
          <div key="s1" className={animClass} style={{ paddingTop: 52 }}>
            <StepHeader step={1} total={4} accuracy={accuracy} />
            <div className="glass" style={{ padding: "24px 26px", marginBottom: 16 }}>
              <div className="t-title" style={{ fontSize: 18, marginBottom: 4 }}>意向房源基本信息</div>
              <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
                告诉我们你想购买的房子大概是什么情况，这几项是必填的。
              </p>

              {/* 新房 vs 二手房 */}
              <Field
                label="房源类型"
                desc="这将影响增值税的计算方式。"
              >
                <Chips
                  options={[
                    { label: "二手房", value: false },
                    { label: "新房（期房/现房）", value: true },
                  ]}
                  value={inputs.is_new_house}
                  onChange={(v) => dispatch({ is_new_house: v })}
                />
                {inputs.is_new_house ? (
                  <InfoBox color="green">
                    🏗 新房购买：购房合同签订即为首手，增值税<strong>天然免征</strong>，无需关注持有年限。
                  </InfoBox>
                ) : (
                  <InfoBox color="blue">
                    🏘 二手房：若持有满 {policy.vatExemptHoldingYears} 年，增值税免征；未满则按 {policy.vatNonExemptPct}% 计算。
                  </InfoBox>
                )}
              </Field>

              {/* 价格 */}
              <Field label="房屋总价" hint="万元" required>
                <SliderInput
                  value={inputs.P}
                  onChange={(v) => dispatch({ P: v })}
                  min={50} max={3000} step={10}
                  suffix="万元"
                  displayFn={(v) => `${v} 万元`}
                />
              </Field>

              {/* 面积 */}
              <Field label="建筑面积" hint="平方米" required>
                <SliderInput
                  value={inputs.area}
                  onChange={(v) => dispatch({ area: v })}
                  min={30} max={400} step={5}
                  suffix="㎡"
                  displayFn={(v) => `${v} ㎡`}
                />
                {inputs.area <= 90 && (
                  <InfoBox color="blue">面积 ≤ 90㎡，属于小户型，契税享受优惠税率。</InfoBox>
                )}
                {inputs.area > 90 && inputs.area <= 140 && (
                  <InfoBox color="blue">面积 90–140㎡，契税按 {policy.deedRateSmallFirstPct}% 首套优惠税率计算。</InfoBox>
                )}
                {inputs.area > 140 && (
                  <InfoBox color="amber">面积 &gt; 140㎡，契税按 {policy.deedRateLargeFirstPct}%（首套）计算。</InfoBox>
                )}
              </Field>

              {/* 持有年限（仅二手房显示） */}
              {!inputs.is_new_house && (
                <Field
                  label="计划持有年限"
                  desc={`二手房满 ${policy.vatExemptHoldingYears} 年可免征增值税（当前：${inputs.holding_years >= policy.vatExemptHoldingYears ? "✓ 已满足" : `× 差 ${policy.vatExemptHoldingYears - inputs.holding_years} 年`}）。`}
                >
                  <SliderInput
                    value={inputs.holding_years}
                    onChange={(v) => dispatch({ holding_years: v })}
                    min={1} max={10} step={1}
                    suffix=" 年"
                  />
                  {inputs.holding_years < policy.vatExemptHoldingYears && (
                    <InfoBox color="amber">
                      ⚠ 持有不满 {policy.vatExemptHoldingYears} 年出售，将额外缴纳 {policy.vatNonExemptPct}% 增值税，约 {fmtW(inputs.P * policy.vatNonExemptPct / 100)}。
                    </InfoBox>
                  )}
                  {inputs.holding_years >= policy.vatExemptHoldingYears && (
                    <InfoBox color="green">✓ 持有满 {policy.vatExemptHoldingYears} 年，增值税免征，节省约 {fmtW(inputs.P * policy.vatNonExemptPct / 100)}。</InfoBox>
                  )}
                </Field>
              )}

              <PolicyBadges inp={inputs} />
            </div>

            {!canStep1 && (
              <InfoBox color="red">请填写房屋总价和建筑面积才能继续。</InfoBox>
            )}
            <NavRow onBack={() => go(0, true)} onNext={() => go(2)} nextDisabled={!canStep1} />
          </div>
        )}

        {/* ══════════════ STEP 2 — FINANCING ══════════════ */}
        {step === 2 && (
          <div key="s2" className={animClass} style={{ paddingTop: 52 }}>
            <StepHeader step={2} total={4} accuracy={accuracy} />
            <div className="glass" style={{ padding: "24px 26px", marginBottom: 16 }}>
              <div className="t-title" style={{ fontSize: 18, marginBottom: 4 }}>资金安排与还款方式</div>
              <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
                月收入与备用金将用于现金流压力测试，贷款参数决定每月还款额。
              </p>

              {/* 多孩 & GJJ口径 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 22 }}>
                <Field label="是否多孩家庭" desc="影响公积金贷款上限。">
                  <Chips
                    options={[{ label: "否", value: false }, { label: "是", value: true }]}
                    value={inputs.multi_child_bonus}
                    onChange={(v) => dispatch({ multi_child_bonus: v })}
                  />
                </Field>
                <Field label="公积金贷款口径">
                  <Chips
                    options={[{ label: "家庭合并", value: true }, { label: "单人", value: false }]}
                    value={inputs.GJJ_merge}
                    onChange={(v) => dispatch({ GJJ_merge: v })}
                  />
                </Field>
              </div>

              {/* GJJ capacity insight */}
              <div className="glass-inset" style={{ padding: "12px 15px", marginBottom: 22 }}>
                <div className="t-label" style={{ marginBottom: 8 }}>公积金贷款上限参考</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div className="stat-box" style={{ padding: "9px 13px", flex: 1 }}>
                    <div className="t-label" style={{ marginBottom: 3 }}>政策上限额度</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{gjjCapWan} 万元</div>
                  </div>
                  <div className="stat-box" style={{ padding: "9px 13px", flex: 1 }}>
                    <div className="t-label" style={{ marginBottom: 3 }}>实际可贷（含总贷限制）</div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{gjjMaxLoanWan.toFixed(1)} 万元</div>
                  </div>
                  <div className="stat-box" style={{ padding: "9px 13px", flex: 1 }}>
                    <div className="t-label" style={{ marginBottom: 3 }}>贷满公积金时混合比例</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#93c5fd" }}>{gjjFullMixPct}%</div>
                  </div>
                </div>
              </div>

              {/* 首付比例 + 实时换算 */}
              <Field
                label="首付比例"
                desc={`政策下限 ${policy.dpMinPct}%，可根据自身资金适当上调。`}
              >
                <SliderInput
                  value={inputs.dp_min}
                  onChange={(v) => dispatch({ dp_min: Math.max(policy.dpMinPct, v) })}
                  min={policy.dpMinPct} max={80} step={1}
                  suffix="%"
                />
              </Field>
              {/* 实时结果 */}
              <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
                <LiveStat label="首付金额" value={`${downPayWan.toFixed(1)} 万元`} sub={`= ${inputs.P} × ${inputs.dp_min}%`} />
                <LiveStat label="需贷款总额" value={`${totalLoanWan.toFixed(1)} 万元`} sub="商贷 + 公积金" />
              </div>

              {/* 月收入 */}
              <Field label="月收入（税后到手）" required>
                <NumInput value={inputs.monthly_income} onChange={(v) => dispatch({ monthly_income: v })}
                  placeholder="25000" min={1000} suffix="元/月" />
              </Field>

              {/* 可流动资金 */}
              <Field
                label="现有可流动资产"
                desc="不含购房资金（即首付款已另计）。将计算付完首付后你还剩多少可投资资金。"
                required
              >
                <NumInput value={inputs.Emergency} onChange={(v) => dispatch({ Emergency: v })}
                  placeholder="20" min={0} suffix="万元" />
              </Field>
              {/* 购房后剩余流动资金  */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <LiveStat
                    label="付完首付后剩余流动资金（估）"
                    value={remainingLiquidWan >= 0 ? `${remainingLiquidWan.toFixed(1)} 万元` : `⚠ 不足`}
                    sub={remainingLiquidWan < 0 ? "流动资金可能不足，请留意" : "将作为投资本金计入租房路径"}
                  />
                </div>
                {remainingLiquidWan < 6 && (
                  <InfoBox color="amber">
                    ⚠ 购房后可流动资金低于 6 万元，建议确保至少保有 3-6 个月生活开支作为紧急备用金。
                  </InfoBox>
                )}
              </div>

              {/* 贷款期限 */}
              <Field label="贷款期限" required>
                <Chips
                  options={[
                    { label: "10 年", value: 10 as number },
                    { label: "15 年", value: 15 as number },
                    { label: "20 年", value: 20 as number },
                    { label: "25 年", value: 25 as number },
                    { label: "30 年", value: 30 as number },
                  ]}
                  value={inputs.n_years}
                  onChange={(v) => dispatch({ n_years: v })}
                />
                {inputs.n_years <= 15 && (
                  <InfoBox color="amber">贷款期限较短，月供会明显偏高，请结合月收入评估还款压力。</InfoBox>
                )}
              </Field>

              {/* 还款方式 */}
              <Field label="还款方式" desc="等额本息：每月固定；等额本金：前高后低，总利息更少。">
                <Chips
                  options={[
                    { label: "等额本息", value: "等额本息" as const },
                    { label: "等额本金", value: "等额本金" as const },
                  ]}
                  value={inputs.Repay_type}
                  onChange={(v) => dispatch({ Repay_type: v })}
                />
              </Field>

              {/* 公积金月缴 */}
              <Field label="公积金月缴额（双方合计）" desc="填写每月实际缴纳的公积金金额，填 0 表示不使用公积金贷款。">
                <NumInput value={inputs.GJJ_extra} onChange={(v) => dispatch({ GJJ_extra: v })}
                  placeholder="2000" min={0} suffix="元/月" />
              </Field>
            </div>

            {!canStep2 && (
              <InfoBox color="red">请填写月收入并确认贷款期限才能继续。</InfoBox>
            )}
            <NavRow onBack={() => go(1, true)} onNext={() => go(3)} nextDisabled={!canStep2} />
          </div>
        )}

        {/* ══════════════ STEP 3 — RENT BENCHMARK ══════════════ */}
        {step === 3 && (
          <div key="s3" className={animClass} style={{ paddingTop: 52 }}>
            <StepHeader step={3} total={4} accuracy={accuracy} />
            <div className="glass" style={{ padding: "24px 26px", marginBottom: 16 }}>
              <div className="t-title" style={{ fontSize: 18, marginBottom: 4 }}>租房路径对照基准</div>
              <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
                如果不买房，你的资金将用于租房 + 投资。这几项决定两条路径最终净资产的对比结果。
              </p>

              <Field label="当前等效月租金" hint="租同等位置同等品质房源的月租" required>
                <NumInput value={inputs.rent_0} onChange={(v) => dispatch({ rent_0: v })}
                  placeholder="8000" min={500} suffix="元/月" />
              </Field>

              <Field label="分析年限" hint="净资产比较的时间窗口" required>
                <SliderInput value={inputs.years} onChange={(v) => dispatch({ years: v })}
                  min={3} max={30} suffix=" 年" />
              </Field>

              <Field
                label="理财年化收益率"
                desc="如果不买房，扣除租金后的剩余资金（以及首付资金）按此收益率复利增长。填写你通常能做到的理财或基金年化收益率，例如货币基金约 2%、债基约 3.5%、指数基金长期约 5~7%。"
              >
                <SliderInput value={inputs.R_inv} onChange={(v) => dispatch({ R_inv: v })}
                  min={1} max={15} step={0.5} suffix="%" />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "货币基金 ~2%", v: 2 },
                    { label: "债基 ~3.5%", v: 3.5 },
                    { label: "稳健 ~5%", v: 5 },
                    { label: "指数基金 ~7%", v: 7 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`chip ${inputs.R_inv === p.v ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 12px" }}
                      onClick={() => dispatch({ R_inv: p.v })}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="预期租金年涨幅" desc="每年租金上涨的幅度。参考：近 5 年上海平均约 2–4%。">
                <SliderInput value={inputs.g_r} onChange={(v) => dispatch({ g_r: v })}
                  min={0} max={10} step={0.5} suffix="%" />
              </Field>
            </div>

            {!canStep3 && (
              <InfoBox color="red">请填写月租金并选择分析年限才能继续。</InfoBox>
            )}
            <NavRow
              onBack={() => go(2, true)}
              onNext={() => go(4)}
              nextDisabled={!canStep3}
              nextLabel="进入精算优化"
            />
          </div>
        )}

        {/* ══════════════ STEP 4 — FINE TUNE ══════════════ */}
        {step === 4 && (
          <div key="s4" className={animClass} style={{ paddingTop: 52 }}>
            <StepHeader step={4} total={4} accuracy={accuracy} />
            <div className="glass" style={{ padding: "24px 26px", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div className="t-title" style={{ fontSize: 18 }}>精算优化参数</div>
                <span className="badge badge-amber">可跳过</span>
              </div>
              <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
                填写越多，模型误差越低。可直接点"跳过并生成报告"也能得出结论。
              </p>

              {/* 公积金混合比例 */}
              <Field
                label="公积金混合贷款比例"
                desc={`公积金最多可贷 ${gjjMaxLoanWan.toFixed(1)} 万元（占总贷款 ${gjjFullMixPct}%）。建议贷满公积金以享受更低利率。`}
              >
                <SliderInput value={inputs.Mix_ratio} onChange={(v) => dispatch({ Mix_ratio: v })}
                  min={0} max={100} suffix="%" />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" className="chip" style={{ fontSize: 12, padding: "5px 12px" }}
                    onClick={() => dispatch({ Mix_ratio: gjjFullMixPct })}>
                    贷满公积金 ({gjjFullMixPct}%)
                  </button>
                  <button type="button" className="chip" style={{ fontSize: 12, padding: "5px 12px" }}
                    onClick={() => dispatch({ Mix_ratio: 0 })}>
                    不用公积金 (0%)
                  </button>
                </div>
                {totalLoanWan > 0 && (
                  <InfoBox color="blue">
                    当前配置：公积金贷 {(totalLoanWan * inputs.Mix_ratio / 100).toFixed(1)} 万元（
                    {policy.gjjRateFirstPct}% 利率），商业贷 {(totalLoanWan * (1 - inputs.Mix_ratio / 100)).toFixed(1)} 万元（
                    {(policy.lprPct + policy.bpBps / 100).toFixed(2)}% 利率）。
                  </InfoBox>
                )}
              </Field>

              {/* 房价预期 */}
              <Field label="预期房价年涨幅" desc="用于计算买房路径的房屋资产增值。填写你对该城市/区域的长期年化预期。">
                <SliderInput value={inputs.g_p} onChange={(v) => dispatch({ g_p: v })}
                  min={-5} max={12} step={0.5} suffix="%" />
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {[{ label: "悲观 -1%", v: -1 }, { label: "中性 3%", v: 3 }, { label: "乐观 5%", v: 5 }].map((p) => (
                    <button key={p.label} type="button" className={`chip ${inputs.g_p === p.v ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => dispatch({ g_p: p.v })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>

              {/* 装修 硬装 */}
              <Field label="装修硬装预算" desc={`基于你的面积（${inputs.area} ㎡）给出三档参考，也可手动调整。`}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {renoHardPresets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`chip ${inputs.Reno_hard === p.value ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 12px" }}
                      onClick={() => dispatch({ Reno_hard: p.value })}
                      title={p.desc}
                    >
                      {p.label} ({p.value}万)
                    </button>
                  ))}
                </div>
                <NumInput value={inputs.Reno_hard} onChange={(v) => dispatch({ Reno_hard: v })}
                  placeholder="30" min={0} step={0.5} suffix="万元" />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 6 }}>
                  约 {inputs.area > 0 ? Math.round(inputs.Reno_hard * 10000 / inputs.area) : "—"} 元/㎡
                </div>
              </Field>

              {/* 装修 软装 */}
              <Field label="软装 / 电器预算" desc="家具、电器、窗帘、装饰等。">
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {renoSoftPresets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={`chip ${inputs.Reno_soft === p.value ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 12px" }}
                      onClick={() => dispatch({ Reno_soft: p.value })}
                      title={p.desc}
                    >
                      {p.label} ({p.value}万)
                    </button>
                  ))}
                </div>
                <NumInput value={inputs.Reno_soft} onChange={(v) => dispatch({ Reno_soft: v })}
                  placeholder="12" min={0} step={0.5} suffix="万元" />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 6 }}>
                  约 {inputs.area > 0 ? Math.round(inputs.Reno_soft * 10000 / inputs.area) : "—"} 元/㎡
                </div>
                {/* 装修总计 */}
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <span className="badge badge-blue">
                    装修合计 {(inputs.Reno_hard + inputs.Reno_soft).toFixed(1)} 万元
                  </span>
                  <span className="badge badge-purple">
                    约 {inputs.area > 0 ? Math.round((inputs.Reno_hard + inputs.Reno_soft) * 10000 / inputs.area) : "—"} 元/㎡
                  </span>
                </div>
              </Field>

              {/* 物业费 */}
              <Field label="物业费" desc="每月每平方米的物业管理费，影响持有成本。">
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  {[{ label: "普通 2元", v: 2 }, { label: "中档 4元", v: 4 }, { label: "高档 8元", v: 8 }].map((p) => (
                    <button key={p.label} type="button" className={`chip ${inputs.PM_unit === p.v ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => dispatch({ PM_unit: p.v })}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <NumInput value={inputs.PM_unit} onChange={(v) => dispatch({ PM_unit: v })}
                  placeholder="5" min={0} step={0.5} suffix="元/㎡/月" />
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 6 }}>
                  月物业费约 {Math.round(inputs.PM_unit * inputs.area).toLocaleString()} 元
                </div>
              </Field>

              {/* 满五唯一（仅二手房显示） */}
              {!inputs.is_new_house && (
                <Field label="出售方是否满五唯一" desc="满五唯一可免征个人所得税（约为总价的 1.5%），节省显著。">
                  <Chips
                    options={[{ label: "是，免个税", value: true }, { label: "否，需缴纳", value: false }]}
                    value={inputs.M5U}
                    onChange={(v) => dispatch({ M5U: v })}
                  />
                  {!inputs.M5U && (
                    <InfoBox color="amber">
                      非满五唯一，将额外缴纳约 {fmtW(inputs.P * 0.015)} 个税。
                    </InfoBox>
                  )}
                </Field>
              )}

              {/* 投资执行纪律 */}
              <Field label="再投资执行纪律" desc={'你每月实际能坚持把「买房路径」与「租房路径」之间的月差额投入理财的比例。越高，租房路径的净资产越准确。'}>
                <SliderInput value={inputs.Invest_consistency} onChange={(v) => dispatch({ Invest_consistency: v })}
                  min={0} max={100} suffix="%" />
              </Field>

              {/* 搬家间隔 & 现金缓冲 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="平均搬家间隔" desc="影响租房路径的搬迁成本。">
                  <SliderInput value={inputs.Move_freq_years} onChange={(v) => dispatch({ Move_freq_years: v })}
                    min={1} max={10} suffix=" 年" />
                </Field>
                <Field label="现金安全缓冲" desc="紧急备用金覆盖的月数。">
                  <SliderInput value={inputs.Cash_runway_months} onChange={(v) => dispatch({ Cash_runway_months: v })}
                    min={1} max={24} suffix=" 月" />
                </Field>
              </div>
            </div>

            <NavRow
              onBack={() => go(3, true)}
              onNext={runCalculation}
              nextLabel={calculating ? "计算中…" : "生成报告"}
              nextDisabled={calculating}
              skipLabel="跳过并生成报告"
              onSkip={() => { if (!calculating) runCalculation(); }}
            />

            {calculating && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <div style={{ width: 220, margin: "0 auto 10px" }}>
                  <div className="accuracy-bar" style={{ height: 6 }}>
                    <div className="accuracy-fill" style={{ width: "100%" }} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>正在运行净资产模型…</div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ STEP 5 — REPORT ══════════════ */}
        {step === 5 && result && (
          <div key="s5" className={animClass} style={{ paddingTop: 44 }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div className="t-label" style={{ marginBottom: 10, color: "#60a5fa", letterSpacing: "0.1em" }}>
                决策报告 · {inputs.target_city} · {inputs.years} 年窗口
              </div>
              <h2 style={{
                fontSize: "clamp(24px,4vw,36px)", fontWeight: 700, marginBottom: 10,
                background: "linear-gradient(135deg,#93c5fd,#c4b5fd,#86efac)",
                WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>
                净资产分析完成
              </h2>
              <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="badge badge-green">精度 {accuracy}%</span>
                <span className="badge badge-blue">{inputs.target_city} · {inputs.is_second_home ? "二套" : "首套"} · {inputs.is_new_house ? "新房" : "二手房"}</span>
                <span className="badge badge-purple">{inputs.P} 万元 · {inputs.area} ㎡</span>
              </div>
            </div>
            <ReportScreen result={result} inp={inputs} onReset={reset} />
          </div>
        )}

        {step === 5 && !result && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ color: "rgba(255,255,255,0.45)", marginBottom: 18 }}>计算出错，请重试</div>
            <button className="gl-btn gl-btn-primary" onClick={() => go(4, true)} type="button">← 返回重试</button>
          </div>
        )}

      </div>
    </div>
  );
}
