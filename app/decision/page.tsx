"use client";

import React, { useCallback, useMemo, useReducer, useState, useRef } from "react";
import Link from "next/link";
import {
  runDecisionModel,
  RISK_PRESETS,
  type AssetPool,
  type YieldAssumptions,
  type HouseParams,
  type RentParams,
  type DecisionInput,
  type DecisionOutput,
  type RiskProfile,
} from "../../lib/decisionCalc";
import { deriveEffectivePolicy } from "../../lib/policyProfiles";

/* ──────────────── Helpers ──────────────── */
const fmtW = (w: number) => `${w.toFixed(1)} 万`;
const fmtY = (yuan: number) => `${Math.round(yuan).toLocaleString()} 元`;
const sign = (n: number) => (n >= 0 ? "+" : "");
const pct = (v: number) => `${v.toFixed(1)}%`;

/* ──────────────── State shape ──────────────── */
interface Wizard {
  // step 0
  target_city: "上海" | "北京";
  is_second_home: boolean;
  risk_profile: RiskProfile;
  horizon_years: number;
  // step 1 — asset pool
  cash_wan: number;
  fixed_deposit_wan: number;
  a_stock_wan: number;
  hk_stock_wan: number;
  us_stock_wan: number;
  bond_fund_wan: number;
  gjj_balance_wan: number;
  // step 2 — house params
  P_wan: number;
  area: number;
  dp_pct: number;
  reno_wan: number;
  n_years: number;
  gjj_pct: number;
  repay_type: "等额本息" | "等额本金";
  g_p_pct: number;
  is_new_house: boolean;
  holding_years: number;
  m5u: boolean;
  // step 3 — rent & income
  rent_monthly: number;
  monthly_income: number;
  gjj_monthly_contribution: number;
  use_gjj_for_rent: boolean;
  gjj_rent_withdrawal: number;
  g_r_pct: number;
  // step 4 — yield assumptions (override)
  cash_rate: number;
  fixed_deposit_rate: number;
  a_stock_rate: number;
  hk_stock_rate: number;
  us_stock_rate: number;
  bond_fund_rate: number;
}

const DEFAULT: Wizard = {
  target_city: "上海",
  is_second_home: false,
  risk_profile: "平衡",
  horizon_years: 10,
  cash_wan: 30,
  fixed_deposit_wan: 20,
  a_stock_wan: 0,
  hk_stock_wan: 0,
  us_stock_wan: 0,
  bond_fund_wan: 10,
  gjj_balance_wan: 15,
  P_wan: 600,
  area: 90,
  dp_pct: 20,
  reno_wan: 30,
  n_years: 30,
  gjj_pct: 50,
  repay_type: "等额本息",
  g_p_pct: 3,
  is_new_house: false,
  holding_years: 2,
  m5u: true,
  rent_monthly: 8000,
  monthly_income: 25000,
  gjj_monthly_contribution: 2000,
  use_gjj_for_rent: false,
  gjj_rent_withdrawal: 1500,
  g_r_pct: 3,
  ...RISK_PRESETS["平衡"],
};

type WStep = 0 | 1 | 2 | 3 | 4 | 5;

/* ──────────────── Tiny UI components ──────────────── */
function Field({ label, hint, desc, children }: {
  label: string; hint?: string; desc?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="field-label">
        {label}
        {hint && <span style={{ color: "rgba(255,255,255,0.28)", fontWeight: 400 }}> · {hint}</span>}
      </div>
      {desc && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginBottom: 8, lineHeight: 1.55 }}>{desc}</div>}
      {children}
    </div>
  );
}

function Chips<T extends string | boolean | number>({
  options, value, onChange,
}: { options: Array<{ label: string; value: T; color?: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chip-group">
      {options.map((o) => (
        <button key={String(o.value)} type="button"
          className={`chip ${o.value === value ? "active" : ""}`}
          onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Num({ value, onChange, placeholder, min = 0, max, step = 1, suffix }: {
  value: number; onChange: (v: number) => void; placeholder?: string;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input type="number" className="gl-input" value={value === 0 ? "" : value}
        placeholder={placeholder} min={min} max={max} step={step}
        style={suffix ? { paddingRight: 70 } : {}}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
      {suffix && (
        <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
          fontSize: 12, color: "rgba(255,255,255,0.32)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

function Slider({ value, onChange, min, max, step = 1, suffix }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <input type="range" className="gl-range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <span style={{ minWidth: 56, textAlign: "right", fontWeight: 700, color: "#93c5fd", fontSize: 15 }}>
        {value}{suffix}
      </span>
    </div>
  );
}

function InfoBox({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "green" | "amber" | "red" }) {
  const map = {
    blue:  { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.22)",  text: "rgba(147,197,253,0.92)" },
    green: { bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.22)",  text: "rgba(110,231,183,0.92)" },
    amber: { bg: "rgba(251,191,36,0.08)",  border: "rgba(251,191,36,0.22)",  text: "rgba(253,211,77,0.92)" },
    red:   { bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.22)", text: "rgba(252,165,165,0.92)" },
  }[color];
  return (
    <div style={{ background: map.bg, border: `1px solid ${map.border}`, borderRadius: 10,
      padding: "10px 14px", fontSize: 13, color: map.text, lineHeight: 1.6, marginTop: 8 }}>
      {children}
    </div>
  );
}

function NavRow({ onBack, onNext, nextLabel = "下一步 →", disabled, skipLabel, onSkip }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean;
  skipLabel?: string; onSkip?: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, gap: 10 }}>
      <div>{onBack && <button className="gl-btn" type="button" onClick={onBack}>← 返回</button>}</div>
      <div style={{ display: "flex", gap: 10 }}>
        {skipLabel && onSkip && <button className="gl-btn" type="button" onClick={onSkip}>{skipLabel}</button>}
        <button className="gl-btn gl-btn-primary" type="button" onClick={onNext} disabled={disabled}>{nextLabel}</button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="stat-box" style={{ flex: 1, padding: "11px 14px" }}>
      <div className="t-label" style={{ marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: warn ? "#fca5a5" : "#e8eaf0" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 28 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={i + 1 < step ? "step-dot done" : i + 1 === step ? "step-dot active" : "step-dot"} />
      ))}
      <span style={{ marginLeft: 8, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>步骤 {step} / {total}</span>
    </div>
  );
}

/* ──────────────── Asset input row ──────────────── */
function AssetRow({ icon, label, hint, value, onChange, defaultYield, color }: {
  icon: string; label: string; hint: string; value: number; onChange: (v: number) => void;
  defaultYield: string; color: string;
}) {
  return (
    <div className="glass-inset" style={{ padding: "13px 15px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>{hint}</div>
        </div>
        <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20,
          background: `${color}22`, border: `1px solid ${color}44`, color }}>
          默认年化 {defaultYield}
        </span>
      </div>
      <Num value={value} onChange={onChange} placeholder="0" min={0} step={1} suffix="万元" />
    </div>
  );
}

/* ──────────────── Yield rate row ──────────────── */
function RateRow({ label, hint, value, onChange, min = 0, max = 20, step = 0.5 }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, alignItems: "center", marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>{hint}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="range" className="gl-range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span style={{ width: 40, textAlign: "right", fontWeight: 700, color: "#93c5fd", fontSize: 14 }}>{value}%</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────
   REPORT
──────────────────────────────────────────────────*/
function ReportView({ result, w, onReset }: { result: DecisionOutput; w: Wizard; onReset: () => void }) {
  const [showTable, setShowTable] = useState(false);
  const r = result;
  const gap = r.horizon_gap;
  const isBuy = r.recommendation === "建议购买";
  const isRent = r.recommendation === "建议继续租房";

  const zoneClass = isBuy ? "zone-buy" : isRent ? "zone-rent" : "zone-watch";
  const zoneIcon = isBuy ? "🏡" : isRent ? "🏠" : "🔭";

  const scenarioColor = (g: number) => g > 0 ? "#34d399" : g < 0 ? "#f87171" : "#94a3b8";

  return (
    <div className="fade-up" style={{ maxWidth: 780, margin: "0 auto" }}>

      {/* Zone banner */}
      <div className={`glass ${zoneClass}`} style={{ padding: "26px 28px", marginBottom: 20, borderRadius: 22 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <span style={{ fontSize: 44 }}>{zoneIcon}</span>
          <div>
            <div className="t-label" style={{ marginBottom: 4, color: "rgba(255,255,255,0.42)" }}>资产决策结论</div>
            <div className="t-title" style={{ marginBottom: 8 }}>{r.recommendation}</div>
            {r.summary_lines.map((l, i) => (
              <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>{l}</div>
            ))}
          </div>
        </div>
      </div>

      {/* 10yr NAV */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 11, marginBottom: 18 }}>
        {[
          { label: "买房路径净资产", value: fmtW(r.horizon_buyNAV), cls: "grad-buy" },
          { label: "租房路径净资产", value: fmtW(r.horizon_rentNAV), cls: "grad-rent" },
          { label: `差额（买−租）`, value: `${sign(gap)}${fmtW(gap)}`, color: gap >= 0 ? "#34d399" : "#f87171" },
        ].map((item) => (
          <div key={item.label} className="stat-box">
            <div className="t-label" style={{ marginBottom: 5 }}>{item.label}</div>
            <div className={`t-value ${item.cls ?? ""}`} style={item.color ? { color: item.color } : {}}>{item.value}</div>
            <div className="t-label" style={{ marginTop: 4 }}>{w.horizon_years} 年后</div>
          </div>
        ))}
      </div>

      {/* Feasibility + liquidity */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>💰 首付可行性与资产结构</div>
        {!r.feasible && (
          <InfoBox color="red">
            ⚠ 当前资产合计 <strong>{fmtW(r.total_assets_wan)}</strong>，首付 + 税费 + 装修需要{" "}
            <strong>{fmtW(r.liquidation.total_needed_wan)}</strong>，资金缺口约{" "}
            <strong>{fmtW(r.shortfall_wan)}</strong>，需额外筹款或降低首付目标价。
          </InfoBox>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          {[
            { label: "总资产", value: fmtW(r.total_assets_wan) },
            { label: "首付 + 税费 + 装修", value: fmtW(r.liquidation.total_needed_wan) },
            { label: "购房后剩余流动资产", value: fmtW(r.liquidation.remaining_financial_wan), warn: r.liquidation.remaining_financial_wan < 10 },
            { label: "首付锁定比例", value: `${r.downpayment_lock_pct}%`, warn: r.downpayment_lock_pct > 70 },
            { label: "公积金余额使用", value: fmtW(r.gjj_balance_used_wan) },
            { label: "机会成本（等效增值）", value: `≈ ${fmtW(r.opportunity_cost_10yr_wan)}`, warn: false },
          ].map((item) => (
            <Stat key={item.label} label={item.label} value={item.value} warn={"warn" in item ? item.warn : false} />
          ))}
        </div>

        {/* Liquidation plan */}
        {Object.entries(r.liquidation.liquidated).filter(([, v]) => v > 0).length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="t-label" style={{ marginBottom: 8 }}>资产动用顺序（自动优先低机会成本）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {Object.entries(r.liquidation.liquidated)
                .filter(([, v]) => v > 0)
                .map(([key, val]) => {
                  const nameMap: Record<string, string> = {
                    cash_wan: "现金",
                    fixed_deposit_wan: "定存",
                    gjj_balance_wan: "公积金余额",
                    bond_fund_wan: "固收理财",
                    a_stock_wan: "A股",
                    hk_stock_wan: "港股",
                    us_stock_wan: "美股",
                  };
                  return (
                    <span key={key} className="badge badge-amber">
                      {nameMap[key] ?? key} {fmtW(val)}
                    </span>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Monthly pressure */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📆 现金流对比（各时间节点）</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                {["时间", "买房月支出", "月结余（买）", "租房月支出", "月结余（租）"].map((h) => (
                  <th key={h} style={{ padding: "7px 10px", textAlign: "left", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.monthly_pressure.map((row) => (
                <tr key={row.year} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "9px 10px", fontWeight: 600 }}>第 {row.year} 年</td>
                  <td style={{ padding: "9px 10px" }}>{fmtY(row.buy_monthly_cost)}</td>
                  <td style={{ padding: "9px 10px", color: row.buy_surplus >= 0 ? "#6ee7b7" : "#fca5a5", fontWeight: 600 }}>
                    {sign(row.buy_surplus)}{fmtY(row.buy_surplus)}
                  </td>
                  <td style={{ padding: "9px 10px" }}>{fmtY(row.rent_monthly_cost)}</td>
                  <td style={{ padding: "9px 10px", color: row.rent_surplus >= 0 ? "#6ee7b7" : "#fca5a5", fontWeight: 600 }}>
                    {sign(row.rent_surplus)}{fmtY(row.rent_surplus)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 11, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.breakEvenYear !== null && (
            <span className="badge badge-green">净资产超越点：第 {r.breakEvenYear} 年</span>
          )}
          <span className="badge badge-blue">组合年化收益假设 {r.blended_yield_pct}%</span>
          <span className="badge badge-purple">初始月供 {fmtY(r.buy_initial_monthly)}</span>
        </div>
      </div>

      {/* Scenarios */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>📊 三情景净资产（{w.horizon_years} 年后）</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {r.scenarios.map((s) => (
            <div key={s.label} className="glass-inset" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="badge badge-blue" style={{ fontSize: 11 }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    房价 {pct(s.g_p_pct)}/年 · 收益 {s.yield_multiplier < 1 ? "偏低" : s.yield_multiplier > 1 ? "偏高" : "基准"}
                  </span>
                </div>
                <span style={{ fontWeight: 700, color: scenarioColor(s.gap_wan), fontSize: 15 }}>
                  {sign(s.gap_wan)}{fmtW(s.gap_wan)}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="stat-box" style={{ padding: "8px 12px" }}>
                  <div className="t-label" style={{ marginBottom: 2 }}>买房 NAV</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtW(s.buyNAV_wan)}</div>
                </div>
                <div className="stat-box" style={{ padding: "8px 12px" }}>
                  <div className="t-label" style={{ marginBottom: 2 }}>租房 NAV</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtW(s.rentNAV_wan)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yearly table toggle */}
      <div className="glass" style={{ padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showTable ? 16 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>📈 每年净资产明细</div>
          <button className="gl-btn" type="button" onClick={() => setShowTable(!showTable)}
            style={{ fontSize: 12, padding: "6px 14px" }}>
            {showTable ? "收起" : "展开"}
          </button>
        </div>
        {showTable && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                  {["年", "房产价值", "剩余贷款", "买房NAV", "租房NAV", "差额"].map((h) => (
                    <th key={h} style={{ padding: "7px 8px", textAlign: "right", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.yearly.map((row) => (
                  <tr key={row.year} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600 }}>{row.year}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmtW(row.buyPropertyValue_wan)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "rgba(255,255,255,0.5)" }}>{fmtW(row.buyRemainingDebt_wan)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#93c5fd", fontWeight: 600 }}>{fmtW(row.buyNAV_wan)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#86efac", fontWeight: 600 }}>{fmtW(row.rentNAV_wan)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right",
                      color: row.gap_wan >= 0 ? "#34d399" : "#f87171", fontWeight: 700 }}>
                      {sign(row.gap_wan)}{fmtW(row.gap_wan)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", paddingBottom: 60, paddingTop: 10 }}>
        <button className="gl-btn" onClick={onReset} type="button" style={{ marginRight: 12 }}>
          ↩ 重新测算
        </button>
        <Link href="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
          切换到经典版本
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────
   PAGE
──────────────────────────────────────────────────*/
export default function DecisionPage() {
  const [step, setStep] = useState<WStep>(0);
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [w, dispatch] = useReducer(
    (s: Wizard, p: Partial<Wizard>) => ({ ...s, ...p }),
    DEFAULT
  );
  const [result, setResult] = useState<DecisionOutput | null>(null);
  const [calculating, setCalculating] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: WStep, back = false) => {
    setDir(back ? "back" : "fwd");
    setStep(next);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 40);
  }, []);

  /* Apply risk preset when profile changes */
  const applyRiskPreset = useCallback((profile: RiskProfile) => {
    dispatch({ risk_profile: profile, ...RISK_PRESETS[profile] });
  }, []);

  /* Policy */
  const policy = useMemo(
    () => deriveEffectivePolicy({ target_city: w.target_city, is_second_home: w.is_second_home,
      holding_years: w.holding_years, area: w.area }),
    [w.target_city, w.is_second_home, w.holding_years, w.area]
  );

  /* Total assets live */
  const totalAssetsWan = useMemo(() =>
    w.cash_wan + w.fixed_deposit_wan + w.a_stock_wan + w.hk_stock_wan +
    w.us_stock_wan + w.bond_fund_wan + w.gjj_balance_wan,
    [w.cash_wan, w.fixed_deposit_wan, w.a_stock_wan, w.hk_stock_wan,
     w.us_stock_wan, w.bond_fund_wan, w.gjj_balance_wan]
  );

  /* Down payment needed */
  const downPayWan = useMemo(() => w.P_wan * w.dp_pct / 100, [w.P_wan, w.dp_pct]);
  const loanWan = useMemo(() => w.P_wan - downPayWan, [w.P_wan, downPayWan]);
  const deedWan = useMemo(() => {
    const r = w.area <= 140
      ? (w.is_second_home ? policy.deedRateSmallSecondPct : policy.deedRateSmallFirstPct)
      : (w.is_second_home ? policy.deedRateLargeSecondPct : policy.deedRateLargeFirstPct);
    return w.P_wan * r / 100;
  }, [w.P_wan, w.area, w.is_second_home, policy]);
  const vatWan = useMemo(() => {
    if (w.is_new_house) return 0;
    return w.holding_years >= policy.vatExemptHoldingYears ? 0 : w.P_wan * policy.vatNonExemptPct / 100;
  }, [w.is_new_house, w.holding_years, w.P_wan, policy]);
  const pitWan = useMemo(() => (w.is_new_house || w.m5u) ? 0 : w.P_wan * 0.015, [w.is_new_house, w.m5u, w.P_wan]);
  const totalNeededWan = useMemo(() => downPayWan + deedWan + vatWan + pitWan + w.reno_wan, [downPayWan, deedWan, vatWan, pitWan, w.reno_wan]);

  /* Run */
  const run = useCallback(() => {
    setCalculating(true);
    const input: DecisionInput = {
      assets: {
        cash_wan: w.cash_wan,
        fixed_deposit_wan: w.fixed_deposit_wan,
        a_stock_wan: w.a_stock_wan,
        hk_stock_wan: w.hk_stock_wan,
        us_stock_wan: w.us_stock_wan,
        bond_fund_wan: w.bond_fund_wan,
        gjj_balance_wan: w.gjj_balance_wan,
      },
      yields: {
        cash_rate: w.cash_rate,
        fixed_deposit_rate: w.fixed_deposit_rate,
        a_stock_rate: w.a_stock_rate,
        hk_stock_rate: w.hk_stock_rate,
        us_stock_rate: w.us_stock_rate,
        bond_fund_rate: w.bond_fund_rate,
      },
      house: {
        P_wan: w.P_wan,
        dp_pct: w.dp_pct,
        deed_rate_pct: w.area <= 140 ? (w.is_second_home ? policy.deedRateSmallSecondPct : policy.deedRateSmallFirstPct)
          : (w.is_second_home ? policy.deedRateLargeSecondPct : policy.deedRateLargeFirstPct),
        vat_rate_pct: w.is_new_house ? 0 : (w.holding_years >= policy.vatExemptHoldingYears ? 0 : policy.vatNonExemptPct),
        pit_wan: pitWan,
        reno_wan: w.reno_wan,
        pm_unit: 5,
        area: w.area,
        n_years: w.n_years,
        gjj_pct: w.gjj_pct,
        lpr_pct: policy.lprPct + policy.bpBps / 100,
        gjj_rate_pct: w.is_second_home ? policy.gjjRateSecondPct : policy.gjjRateFirstPct,
        repay_type: w.repay_type,
        g_p_pct: w.g_p_pct,
      },
      rent: {
        rent_monthly: w.rent_monthly,
        gjj_rent_withdrawal: w.use_gjj_for_rent ? w.gjj_rent_withdrawal : 0,
        g_r_pct: w.g_r_pct,
        monthly_income: w.monthly_income,
        gjj_monthly_contribution: w.gjj_monthly_contribution,
      },
      horizon_years: w.horizon_years,
      risk_profile: w.risk_profile,
    };
    setTimeout(() => {
      try {
        const out = runDecisionModel(input);
        setResult(out);
        go(5);
      } catch (e) {
        console.error(e);
      }
      setCalculating(false);
    }, 400);
  }, [w, policy, pitWan, go]);

  const reset = useCallback(() => { setResult(null); go(0); }, [go]);
  const animClass = dir === "fwd" ? "step-enter" : "step-back";

  return (
    <div style={{ minHeight: "100vh", position: "relative", paddingBottom: 60 }}>
      {/* Orbs */}
      <div className="orb" style={{ width: 560, height: 560, top: -180, left: -140,
        background: "radial-gradient(circle,rgba(52,211,153,0.22) 0%,transparent 70%)" }} />
      <div className="orb" style={{ width: 420, height: 420, bottom: -100, right: -80,
        background: "radial-gradient(circle,rgba(99,102,241,0.20) 0%,transparent 70%)", animationDelay: "4s" }} />

      <div ref={topRef} />

      {/* Top nav */}
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 18px 0", display: "flex", alignItems: "center", gap: 14 }}>
        <Link href="/" style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textDecoration: "none",
          padding: "5px 12px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20 }}>
          ← 经典版
        </Link>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>资产决策引擎</span>
      </div>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "0 18px" }}>

        {/* ══════════════ STEP 0 — INTRO ══════════════ */}
        {step === 0 && (
          <div key="s0" className={animClass} style={{ paddingTop: 60 }}>
            <div style={{ textAlign: "center", marginBottom: 44 }}>
              <div className="t-label" style={{ color: "#34d399", marginBottom: 12, letterSpacing: "0.12em" }}>
                资产决策引擎 · 2.0
              </div>
              <h1 className="t-hero" style={{ marginBottom: 14 }}>
                <span className="grad-text">你的钱，</span>
                <br />买房还是继续投资？
              </h1>
              <p className="t-subtitle" style={{ maxWidth: 420, margin: "0 auto", lineHeight: 1.85 }}>
                不只是算月供。把你在 A股、美股、定存、公积金里的钱都放进来，
                看看哪条路径在 5~10 年后让你更富有。
              </p>
            </div>

            <div className="glass" style={{ padding: "24px 26px", marginBottom: 18 }}>
              <Field label="目标城市" desc="影响利率、公积金上限、契税政策。">
                <Chips
                  options={[{ label: "🌆 上海", value: "上海" as const }, { label: "🏛 北京", value: "北京" as const }]}
                  value={w.target_city} onChange={(v) => dispatch({ target_city: v })} />
              </Field>
              <Field label="购房套数" desc="首套与二套的首付比例、利率均有差异。">
                <Chips
                  options={[{ label: "首套", value: false }, { label: "二套", value: true }]}
                  value={w.is_second_home} onChange={(v) => dispatch({ is_second_home: v })} />
              </Field>
              <Field label="风险偏好" desc="影响各类资产的默认年化收益率假设（第 4 步可精调）。">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {(["保守", "平衡", "进取"] as RiskProfile[]).map((p) => (
                    <button key={p} type="button"
                      className={`chip ${w.risk_profile === p ? "active" : ""}`}
                      style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 5 }}
                      onClick={() => applyRiskPreset(p)}>
                      <span style={{ fontSize: 18 }}>{p === "保守" ? "🛡" : p === "平衡" ? "⚖️" : "🚀"}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p}</span>
                      <span style={{ fontSize: 11, opacity: 0.6 }}>
                        {p === "保守" ? "A股 5% / 美股 7%" : p === "平衡" ? "A股 7% / 美股 10%" : "A股 10% / 美股 12%"}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="分析年限" desc="买房 vs 租房净资产对比的时间窗口。">
                <Chips
                  options={[5, 10, 15, 20].map((y) => ({ label: `${y} 年`, value: y }))}
                  value={w.horizon_years} onChange={(v) => dispatch({ horizon_years: v })} />
              </Field>
            </div>
            <div style={{ textAlign: "center" }}>
              <button className="gl-btn gl-btn-primary" type="button" onClick={() => go(1)}
                style={{ fontSize: 16, padding: "15px 52px" }}>
                录入我的资产 →
              </button>
              <div style={{ marginTop: 11, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
                4 步完成 · 数据本地计算不上传
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 1 — ASSETS ══════════════ */}
        {step === 1 && (
          <div key="s1" className={animClass} style={{ paddingTop: 44 }}>
            <StepDots step={1} total={4} />
            <div className="t-title" style={{ marginBottom: 6 }}>第一步：现有资产</div>
            <p className="t-subtitle" style={{ marginBottom: 24, fontSize: 13 }}>
              告诉我们你手上的钱都在哪里。不确定的填 0 即可，越完整模型越准确。
            </p>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="t-label">现金类</div>
                <span className="badge badge-blue">低风险 · 随时可用</span>
              </div>
              <AssetRow icon="🏦" label="银行活期 / 现金" hint="包括余额宝、活期存款"
                value={w.cash_wan} onChange={(v) => dispatch({ cash_wan: v })}
                defaultYield="≈ 0.5%" color="#60a5fa" />
              <AssetRow icon="📅" label="定期存款 / 大额存单" hint="到期会解冻，机会成本低"
                value={w.fixed_deposit_wan} onChange={(v) => dispatch({ fixed_deposit_wan: v })}
                defaultYield="≈ 2.5%" color="#60a5fa" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="t-label">权益类（机会成本最高）</div>
                <span className="badge badge-purple">高收益 · 高波动</span>
              </div>
              <AssetRow icon="🇨🇳" label="A 股（沪深市场）" hint="过去 10 年年化约 5–9%（大起伏）"
                value={w.a_stock_wan} onChange={(v) => dispatch({ a_stock_wan: v })}
                defaultYield={`${RISK_PRESETS[w.risk_profile].a_stock_rate}%`} color="#c084fc" />
              <AssetRow icon="🇭🇰" label="港股（恒生市场）" hint="近十年表现偏弱，但红利稳定"
                value={w.hk_stock_wan} onChange={(v) => dispatch({ hk_stock_wan: v })}
                defaultYield={`${RISK_PRESETS[w.risk_profile].hk_stock_rate}%`} color="#c084fc" />
              <AssetRow icon="🇺🇸" label="美股（标普 / 纳斯达克）" hint="近十年标普 500 年化约 10–12%"
                value={w.us_stock_wan} onChange={(v) => dispatch({ us_stock_wan: v })}
                defaultYield={`${RISK_PRESETS[w.risk_profile].us_stock_rate}%`} color="#f472b6" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div className="t-label">理财 / 公积金</div>
                <span className="badge badge-green">中低风险</span>
              </div>
              <AssetRow icon="📊" label="固收理财 / 基金 / 保险年金" hint="银行理财、债基、年金险等"
                value={w.bond_fund_wan} onChange={(v) => dispatch({ bond_fund_wan: v })}
                defaultYield={`${RISK_PRESETS[w.risk_profile].bond_fund_rate}%`} color="#34d399" />
              <AssetRow icon="🏠" label="公积金账户余额" hint="可直接提取用于首付，不计机会成本"
                value={w.gjj_balance_wan} onChange={(v) => dispatch({ gjj_balance_wan: v })}
                defaultYield="≈ 1.5%" color="#fbbf24" />
            </div>

            {/* Total */}
            <div className="glass-inset" style={{ padding: "14px 16px", marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>资产合计：{fmtW(totalAssetsWan)}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 3 }}>
                    含公积金余额 {w.gjj_balance_wan} 万 · 权益类 {(w.a_stock_wan + w.hk_stock_wan + w.us_stock_wan).toFixed(1)} 万
                  </div>
                </div>
                <span className="badge badge-green">✓ 已录入</span>
              </div>
            </div>

            {totalAssetsWan === 0 && (
              <InfoBox color="amber">至少填入一项资产才能进行有意义的分析。</InfoBox>
            )}
            <NavRow onBack={() => go(0, true)} onNext={() => go(2)} nextLabel="下一步：购房方案 →" />
          </div>
        )}

        {/* ══════════════ STEP 2 — HOUSE ══════════════ */}
        {step === 2 && (
          <div key="s2" className={animClass} style={{ paddingTop: 44 }}>
            <StepDots step={2} total={4} />
            <div className="t-title" style={{ marginBottom: 6 }}>第二步：购房方案</div>
            <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
              描述你计划购买的房子，这些参数将决定首付锁定量与每月还款压力。
            </p>

            <div className="glass" style={{ padding: "22px 24px", marginBottom: 14 }}>
              <Field label="房源类型">
                <Chips
                  options={[{ label: "二手房", value: false }, { label: "新房", value: true }]}
                  value={w.is_new_house} onChange={(v) => dispatch({ is_new_house: v })} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="房屋总价" hint="万元">
                  <div><Slider value={w.P_wan} onChange={(v) => dispatch({ P_wan: v })} min={50} max={3000} step={10} suffix=" 万" /><div style={{ height: 8 }} /><Num value={w.P_wan} onChange={(v) => dispatch({ P_wan: v })} min={50} max={3000} step={10} suffix="万元" /></div>
                </Field>
                <Field label="建筑面积" hint="㎡">
                  <div><Slider value={w.area} onChange={(v) => dispatch({ area: v })} min={30} max={400} step={5} suffix=" ㎡" /><div style={{ height: 8 }} /><Num value={w.area} onChange={(v) => dispatch({ area: v })} min={30} max={400} step={5} suffix="㎡" /></div>
                </Field>
              </div>
              {!w.is_new_house && (
                <Field label="持有年限" desc={`满 ${policy.vatExemptHoldingYears} 年可免征增值税。`}>
                  <Slider value={w.holding_years} onChange={(v) => dispatch({ holding_years: v })} min={1} max={10} suffix=" 年" />
                </Field>
              )}
              <Field label="首付比例" desc={`政策下限 ${policy.dpMinPct}%`}>
                <Slider value={w.dp_pct} onChange={(v) => dispatch({ dp_pct: Math.max(policy.dpMinPct, v) })}
                  min={policy.dpMinPct} max={80} suffix="%" />
              </Field>
              <Field label="装修预算" hint="万元">
                <Num value={w.reno_wan} onChange={(v) => dispatch({ reno_wan: v })} suffix="万元" />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Field label="贷款年限">
                  <Chips options={[10, 15, 20, 25, 30].map((n) => ({ label: `${n}年`, value: n }))}
                    value={w.n_years} onChange={(v) => dispatch({ n_years: v })} />
                </Field>
                <Field label="还款方式">
                  <Chips options={[{ label: "等额本息", value: "等额本息" as const }, { label: "等额本金", value: "等额本金" as const }]}
                    value={w.repay_type} onChange={(v) => dispatch({ repay_type: v })} />
                </Field>
              </div>
              <Field label="公积金贷款比例" desc={`0% = 纯商业贷款；100% = 贷款全部走公积金（受额度限制）`}>
                <Slider value={w.gjj_pct} onChange={(v) => dispatch({ gjj_pct: v })} min={0} max={100} suffix="%" />
              </Field>
              {!w.is_new_house && (
                <Field label="出售方满五唯一">
                  <Chips options={[{ label: "是（免个税）", value: true }, { label: "否（需缴 ≈ 1.5%）", value: false }]}
                    value={w.m5u} onChange={(v) => dispatch({ m5u: v })} />
                </Field>
              )}
              <Field label="预期房价年涨幅">
                <Slider value={w.g_p_pct} onChange={(v) => dispatch({ g_p_pct: v })} min={-5} max={12} step={0.5} suffix="%" />
                <div style={{ display: "flex", gap: 7, marginTop: 8, flexWrap: "wrap" }}>
                  {[{ label: "悲观 -1%", v: -1 }, { label: "中性 3%", v: 3 }, { label: "乐观 5%", v: 5 }].map((p) => (
                    <button key={p.label} type="button" className={`chip ${w.g_p_pct === p.v ? "active" : ""}`}
                      style={{ fontSize: 12, padding: "5px 11px" }} onClick={() => dispatch({ g_p_pct: p.v })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Live summary */}
            <div style={{ display: "flex", gap: 9, marginBottom: 10 }}>
              <Stat label="首付" value={`${downPayWan.toFixed(1)} 万`} />
              <Stat label="贷款" value={`${loanWan.toFixed(1)} 万`} />
              <Stat label="契税" value={`${deedWan.toFixed(1)} 万`} />
              <Stat label="合计需" value={`${totalNeededWan.toFixed(1)} 万`}
                warn={totalNeededWan > totalAssetsWan} />
            </div>
            {totalNeededWan > totalAssetsWan && (
              <InfoBox color="red">
                ⚠ 资产合计 {fmtW(totalAssetsWan)} 不足以覆盖购房所需 {fmtW(totalNeededWan)}，
                差额 {fmtW(totalNeededWan - totalAssetsWan)}。可调整首付比例或降低目标总价。
              </InfoBox>
            )}

            <NavRow onBack={() => go(1, true)} onNext={() => go(3)} nextLabel="下一步：租房 & 收入 →" />
          </div>
        )}

        {/* ══════════════ STEP 3 — RENT & INCOME ══════════════ */}
        {step === 3 && (
          <div key="s3" className={animClass} style={{ paddingTop: 44 }}>
            <StepDots step={3} total={4} />
            <div className="t-title" style={{ marginBottom: 6 }}>第三步：租房现状与收入</div>
            <p className="t-subtitle" style={{ marginBottom: 22, fontSize: 13 }}>
              租房路径的核心参数。月收入越高、租金越低，租房路径的再投资能力越强。
            </p>

            <div className="glass" style={{ padding: "22px 24px", marginBottom: 14 }}>
              <Field label="月收入（税后到手）">
                <Num value={w.monthly_income} onChange={(v) => dispatch({ monthly_income: v })}
                  placeholder="25000" min={1000} suffix="元/月" />
              </Field>
              <Field label="当前等效月租金"
                desc="如果不买房，你需要租同等位置同等品质房源的月租金。">
                <Num value={w.rent_monthly} onChange={(v) => dispatch({ rent_monthly: v })}
                  placeholder="8000" min={500} suffix="元/月" />
              </Field>
              <Field label="是否可提取公积金用于租房"
                desc="上海等城市允许每年提取公积金冲抵房租，可显著降低租房净支出。">
                <Chips options={[{ label: "可以提取", value: true }, { label: "不可提取", value: false }]}
                  value={w.use_gjj_for_rent} onChange={(v) => dispatch({ use_gjj_for_rent: v })} />
                {w.use_gjj_for_rent && (
                  <div style={{ marginTop: 12 }}>
                    <Field label="每月可提取金额" hint="元/月">
                      <Num value={w.gjj_rent_withdrawal} onChange={(v) => dispatch({ gjj_rent_withdrawal: v })}
                        placeholder="1500" min={0} suffix="元/月" />
                    </Field>
                    <InfoBox color="green">
                      租房净支出约 {fmtY(Math.max(0, w.rent_monthly - w.gjj_rent_withdrawal))}/月（月租 - 公积金提取）
                    </InfoBox>
                  </div>
                )}
              </Field>
              <Field label="每月缴纳公积金（双方合计）"
                desc="用于计算还贷时公积金抵扣，以及租房时可提取额度上限参考。">
                <Num value={w.gjj_monthly_contribution} onChange={(v) => dispatch({ gjj_monthly_contribution: v })}
                  placeholder="2000" min={0} suffix="元/月" />
              </Field>
              <Field label="预期租金年涨幅" desc="参考：上海近 5 年约 2–4%。">
                <Slider value={w.g_r_pct} onChange={(v) => dispatch({ g_r_pct: v })} min={0} max={10} step={0.5} suffix="%" />
              </Field>
            </div>

            {/* Cashflow preview */}
            <div style={{ display: "flex", gap: 9, marginBottom: 10 }}>
              <Stat label="月收入" value={fmtY(w.monthly_income)} />
              <Stat label="租房净月支出" value={fmtY(Math.max(0, w.rent_monthly - (w.use_gjj_for_rent ? w.gjj_rent_withdrawal : 0)))} />
              <Stat label="租房月结余（估）" value={fmtY(w.monthly_income - Math.max(0, w.rent_monthly - (w.use_gjj_for_rent ? w.gjj_rent_withdrawal : 0)))}
                warn={w.monthly_income - w.rent_monthly < 0} />
            </div>

            <NavRow onBack={() => go(2, true)} onNext={() => go(4)} nextLabel="下一步：收益假设 →" />
          </div>
        )}

        {/* ══════════════ STEP 4 — YIELD ASSUMPTIONS ══════════════ */}
        {step === 4 && (
          <div key="s4" className={animClass} style={{ paddingTop: 44 }}>
            <StepDots step={4} total={4} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div className="t-title">第四步：收益率假设</div>
              <span className="badge badge-amber">可跳过</span>
            </div>
            <p className="t-subtitle" style={{ marginBottom: 10, fontSize: 13 }}>
              系统已根据你的风险偏好（{w.risk_profile}）预填了参考值。这些是假设，不代表真实保证收益率。可自行调整。
            </p>
            <div style={{ display: "flex", gap: 7, marginBottom: 18 }}>
              {(["保守", "平衡", "进取"] as RiskProfile[]).map((p) => (
                <button key={p} type="button" className={`chip ${w.risk_profile === p ? "active" : ""}`}
                  style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => applyRiskPreset(p)}>
                  {p}
                </button>
              ))}
            </div>

            <div className="glass" style={{ padding: "22px 24px", marginBottom: 14 }}>
              <div className="t-label" style={{ marginBottom: 14, color: "#60a5fa" }}>现金类（租房路径再投资基础）</div>
              <RateRow label="银行活期 / 现金" hint="约 0.3–0.5%，几乎无风险" value={w.cash_rate}
                onChange={(v) => dispatch({ cash_rate: v })} max={5} />
              <RateRow label="定期存款 / 大额存单" hint="近年约 2–2.8%" value={w.fixed_deposit_rate}
                onChange={(v) => dispatch({ fixed_deposit_rate: v })} max={8} />

              <div className="gl-divider" style={{ margin: "16px 0" }} />
              <div className="t-label" style={{ marginBottom: 14, color: "#c084fc" }}>权益类（机会成本核心）</div>
              <RateRow label="A 股（沪深）" hint="过去 10 年复合约 5–9%，波动较大" value={w.a_stock_rate}
                onChange={(v) => dispatch({ a_stock_rate: v })} max={20} />
              <RateRow label="港股（恒生）" hint="过去 10 年复合约 3–6%" value={w.hk_stock_rate}
                onChange={(v) => dispatch({ hk_stock_rate: v })} max={15} />
              <RateRow label="美股（标普 500）" hint="过去 10 年复合约 10–12%（含分红）" value={w.us_stock_rate}
                onChange={(v) => dispatch({ us_stock_rate: v })} max={20} />

              <div className="gl-divider" style={{ margin: "16px 0" }} />
              <div className="t-label" style={{ marginBottom: 14, color: "#34d399" }}>理财 / 固收</div>
              <RateRow label="固收理财 / 基金 / 年金" hint="近年银行理财约 2.5–4%" value={w.bond_fund_rate}
                onChange={(v) => dispatch({ bond_fund_rate: v })} max={12} />

              <InfoBox color="blue">
                以上收益率为"假设"而非承诺，历史表现不代表未来。系统会同时呈现悲观 / 基准 / 乐观三种情景。
              </InfoBox>
            </div>

            <NavRow
              onBack={() => go(3, true)}
              onNext={run}
              nextLabel={calculating ? "计算中…" : "生成报告 →"}
              disabled={calculating}
              skipLabel="直接生成报告"
              onSkip={() => !calculating && run()}
            />
          </div>
        )}

        {/* ══════════════ STEP 5 — REPORT ══════════════ */}
        {step === 5 && result && (
          <div key="s5" className={animClass} style={{ paddingTop: 36 }}>
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <div className="t-label" style={{ color: "#34d399", marginBottom: 10, letterSpacing: "0.1em" }}>
                资产决策报告 · {w.target_city} · {w.horizon_years} 年窗口
              </div>
              <h2 style={{ fontSize: "clamp(22px,4vw,32px)", fontWeight: 700, marginBottom: 10,
                background: "linear-gradient(135deg,#34d399,#60a5fa,#c084fc)",
                WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                分析完成
              </h2>
              <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap" }}>
                <span className="badge badge-green">{w.risk_profile}风险偏好</span>
                <span className="badge badge-blue">{w.target_city} · {w.is_second_home ? "二套" : "首套"}</span>
                <span className="badge badge-purple">{w.P_wan} 万 · {w.area} ㎡ · {w.horizon_years} 年</span>
              </div>
            </div>
            <ReportView result={result} w={w} onReset={reset} />
          </div>
        )}

        {step === 5 && !result && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>计算出错，请重试</div>
            <button className="gl-btn gl-btn-primary" type="button" onClick={() => go(4, true)}>← 返回重试</button>
          </div>
        )}

      </div>
    </div>
  );
}
