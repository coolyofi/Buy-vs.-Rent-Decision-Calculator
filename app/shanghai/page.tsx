"use client";

import React, { useReducer, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  checkShanghaiEligibility,
  type EligibilityInput,
  type EligibilityOutput,
  type HukouStatus,
  type MaritalStatus,
  type TargetZone,
} from "../../lib/shanghaiEligibility";
import {
  IconBarChart, IconHouse, IconApartment, IconShield,
  IconCity, IconBank, IconCalendar, IconArrowUndo,
  IconBriefcase, IconBell, IconTrendingUp,
} from "../../lib/icons";

/* ──────── tiny helpers ──────── */
const fmtWan = (w: number) =>
  w >= 9990 ? "不限" : `${w.toFixed(0)} 万元`;

/* ──────── state ──────── */
interface State extends EligibilityInput {
  house_area: number;   // 建筑面积 (㎡)，用于契税计算
}

const DEFAULT: State = {
  hukou_status: "Non_SH",
  marital_status: "Married",
  children_count: 0,
  social_security_years: 0,
  residence_permit_years: 0,
  target_zone: "Inner_Ring",
  current_owned_sets_inner: 0,
  current_owned_sets_outer: 0,
  is_green_building: false,
  house_area: 90,
};

type Action = Partial<State>;
function reducer(s: State, a: Action): State {
  return { ...s, ...a };
}

/* ──────── tiny components ──────── */
function Section({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="glass" style={{ padding: "22px 24px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18,
        fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
        <span style={{ opacity: 0.7 }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children, hint }: {
  label: string; children: React.ReactNode; hint?: string;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,
        color: "rgba(255,255,255,0.75)" }}>
        {label}
        {hint && (
          <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.35)", marginLeft: 6,
            fontSize: 12 }}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipGroup<T extends string | number | boolean>({
  options, value, onChange,
}: { options: Array<{ label: string; value: T }>; value: T; onChange: (v: T) => void }) {
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

function NumStepper({ value, onChange, min = 0, max = 20, step = 1, suffix = "" }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button type="button"
        className="chip"
        onClick={() => onChange(Math.max(min, value - step))}
        style={{ width: 36, height: 36, padding: 0, fontSize: 18, lineHeight: 1 }}>
        −
      </button>
      <div className="glass-inset" style={{
        minWidth: 64, textAlign: "center", padding: "7px 12px",
        fontWeight: 700, fontSize: 15,
      }}>
        {value}{suffix}
      </div>
      <button type="button"
        className="chip"
        onClick={() => onChange(Math.min(max, value + step))}
        style={{ width: 36, height: 36, padding: 0, fontSize: 18, lineHeight: 1 }}>
        +
      </button>
    </div>
  );
}

function SliderRow({ value, onChange, min = 0, max = 10, step = 0.5, suffix = "年" }: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input type="range" className="gl-range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }} />
      <div className="glass-inset" style={{
        minWidth: 64, textAlign: "center", padding: "6px 12px",
        fontWeight: 700, fontSize: 14,
      }}>
        {value}{suffix}
      </div>
    </div>
  );
}

/* ──────── result view ──────── */
function ResultCard({ out, state, onEdit }: {
  out: EligibilityOutput; state: State; onEdit: () => void;
}) {
  const zoneLabel = state.target_zone === "Inner_Ring" ? "外环内" : "外环外";
  const isUnlimited = out.remaining_in_target_zone >= 999;
  const remaining = isUnlimited ? "不限" : String(out.remaining_in_target_zone);

  // 契税率
  const isFirst = (state.current_owned_sets_inner + state.current_owned_sets_outer) === 0;
  const isSmall = state.house_area <= 140;
  const deedRate = isFirst
    ? (isSmall ? out.deed_tax_rate_small_first_pct : out.deed_tax_rate_large_first_pct)
    : (isSmall ? out.deed_tax_rate_small_second_pct : out.deed_tax_rate_large_second_pct);

  return (
    <div>
      {/* Main verdict */}
      <div className={`glass ${out.eligible ? "zone-buy" : "zone-rent"}`}
        style={{ padding: "26px 28px", marginBottom: 18, borderRadius: 22 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 52, height: 52, display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0, opacity: 0.9 }}>
            {out.eligible
              ? <IconHouse size={48} />
              : <IconApartment size={48} />}
          </div>
          <div>
            <div className="t-label" style={{ marginBottom: 4, color: "rgba(255,255,255,0.45)" }}>
              上海 {zoneLabel} 购房资格
            </div>
            <div className="t-title" style={{ marginBottom: 8 }}>
              {out.eligible
                ? `有资格，${zoneLabel}还可购入 ${remaining} 套`
                : `暂不符合 ${zoneLabel} 购房条件`}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", lineHeight: 1.7 }}>
              {out.reason}
            </div>
          </div>
        </div>
      </div>

      {/* Quota grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 14 }}>
        {[
          {
            label: "外环内可持有套数",
            value: out.max_allowed_inner >= 999 ? "不限" : `最多 ${out.max_allowed_inner} 套`,
            sub: `已持有 ${state.current_owned_sets_inner} 套，剩余 ${out.remaining_inner >= 999 ? "不限" : out.remaining_inner + " 套"}`,
          },
          {
            label: "外环外可持有套数",
            value: out.max_allowed_outer >= 999 ? "不限购" : `最多 ${out.max_allowed_outer} 套`,
            sub: `已持有 ${state.current_owned_sets_outer} 套`,
          },
          {
            label: "公积金贷款上限（估）",
            value: fmtWan(out.gjj_estimated_wan),
            sub: out.gjj_notes.join(" · "),
          },
          {
            label: `契税率（${isFirst ? "首套" : "非首套"}·${isSmall ? "≤140㎡" : ">140㎡"}）`,
            value: `${deedRate}%`,
            sub: `增值税：持有 ≥ 2 年免征`,
          },
        ].map((item) => (
          <div key={item.label} className="stat-box" style={{ padding: "13px 16px" }}>
            <div className="t-label" style={{ marginBottom: 4, fontSize: 11 }}>{item.label}</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>
              {item.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Derivation steps */}
      <div className="glass" style={{ padding: "18px 22px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12,
          fontSize: 13, fontWeight: 700 }}>
          <IconBriefcase size={14} /> 推导依据（沪七条 · 2026-02-26）
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {out.detail_lines.map((line, i) => (
            <div key={i} className="glass-inset"
              style={{ padding: "9px 13px", fontSize: 12, color: "rgba(255,255,255,0.65)",
                lineHeight: 1.6 }}>
              <span style={{ color: "rgba(255,255,255,0.28)", marginRight: 8, fontVariantNumeric: "tabular-nums" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Policy reference table */}
      <div className="glass" style={{ padding: "18px 22px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12,
          fontSize: 13, fontWeight: 700 }}>
          <IconBarChart size={14} /> 关键政策数值速查（2026.02.26 起施行）
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.38)" }}>
                {["政策项", "旧规", "新规"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px",
                    fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["非沪籍外环内购房社保门槛", "3 年", "1 年"],
                ["非沪籍外环内增购门槛", "—", "社保满 3 年可购第 2 套"],
                ["非沪籍居住证特例", "需社保", "居住证满 5 年可购 1 套（免社保）"],
                ["非沪籍外环外套数", "限 1 套", "不限套数（社保 ≥ 1 年）"],
                ["沪籍单身外环内限额", "1 套", "2 套"],
                ["多子女家庭外环内增购", "—", "+1 套"],
                ["增值税免征年限", "2年/5年混同", "统一 2 年"],
                ["公积金首套家庭上限", "约 120–160 万", "240 万"],
                ["多子女+绿建封顶", "—", "324 万（×1.35）"],
              ].map(([item, old, new_]) => (
                <tr key={item} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.65)" }}>{item}</td>
                  <td style={{ padding: "8px 10px", color: "rgba(255,255,255,0.38)" }}>
                    <s>{old}</s>
                  </td>
                  <td style={{ padding: "8px 10px", color: "#34d399", fontWeight: 600 }}>{new_}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          数据来源：《关于进一步优化调整本市房地产政策的通知》（2026-02-26 施行）及权威解读。
          本工具仅供参考，实际以住建委或不动产登记中心审核为准。
        </div>
      </div>

      <div style={{ textAlign: "center", paddingBottom: 40 }}>
        <button className="gl-btn" onClick={onEdit} type="button"
          style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <IconArrowUndo size={15} /> 重新填写
        </button>
      </div>
    </div>
  );
}

/* ──────── main page ──────── */
export default function ShanghaiPage() {
  const [state, dispatch] = useReducer(reducer, DEFAULT);
  const [showResult, setShowResult] = React.useState(false);

  const set = useCallback(<K extends keyof State>(k: K, v: State[K]) =>
    dispatch({ [k]: v } as Action), []);

  const output = useMemo<EligibilityOutput>(
    () => checkShanghaiEligibility(state),
    [state],
  );

  // Live preview for the top indicator
  const liveOk = output.eligible;
  const liveMsg = output.can_buy_in_target_zone
    ? output.remaining_in_target_zone >= 999
      ? "有资格 · 不限套数"
      : `有资格 · 还可购 ${output.remaining_in_target_zone} 套`
    : "暂不符合条件";

  return (
    <main style={{ minHeight: "100vh", padding: "0 0 40px" }}>
      {/* Top nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(12,14,30,0.72)", backdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 20px",
        display: "flex", alignItems: "center", gap: 16, height: 52,
      }}>
        <Link href="/" style={{ color: "rgba(255,255,255,0.45)", textDecoration: "none",
          fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <IconArrowUndo size={14} /> 返回主页
        </Link>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
          <IconCity size={14} style={{ opacity: 0.6 }} />
          <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>上海购房资格计算器</span>
          <span className="badge badge-amber" style={{ fontSize: 10 }}>沪七条 2026</span>
        </div>
        {/* live indicator */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: state.target_zone === "Inner_Ring"
              ? liveOk ? "#34d399" : "#f87171"
              : liveOk ? "#34d399" : "#f87171",
            boxShadow: liveOk
              ? "0 0 6px #34d399"
              : "0 0 6px #f87171",
          }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{liveMsg}</span>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px 0" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: 18,
            background: "linear-gradient(135deg,rgba(52,211,153,0.18),rgba(96,165,250,0.12))",
            border: "1px solid rgba(52,211,153,0.2)",
            marginBottom: 14 }}>
            <IconCity size={28} style={{ opacity: 0.9, color: "#34d399" }} />
          </div>
          <div className="t-hero" style={{ fontSize: 24, marginBottom: 8 }}>
            上海购房资格查询
          </div>
          <div className="t-subtitle" style={{ fontSize: 13, maxWidth: 440, margin: "0 auto" }}>
            基于 2026-02-26 施行的「沪七条」新政，判断您是否有资格在上海购房、
            最多可购几套，并估算公积金贷款上限
          </div>
        </div>

        {showResult ? (
          <ResultCard out={output} state={state} onEdit={() => setShowResult(false)} />
        ) : (
          <div>

            {/* 户籍与家庭 */}
            <Section title="户籍 & 家庭状况" icon={<IconBriefcase size={15} />}>
              <Row label="户籍状态">
                <ChipGroup
                  options={[
                    { label: "沪籍", value: "SH" as HukouStatus },
                    { label: "非沪籍", value: "Non_SH" as HukouStatus },
                  ]}
                  value={state.hukou_status}
                  onChange={(v) => set("hukou_status", v)}
                />
              </Row>
              <Row label="婚姻状况">
                <ChipGroup
                  options={[
                    { label: "已婚家庭", value: "Married" as MaritalStatus },
                    { label: "单身（成年）", value: "Single" as MaritalStatus },
                  ]}
                  value={state.marital_status}
                  onChange={(v) => set("marital_status", v)}
                />
              </Row>
              <Row label="未成年子女数量" hint="两孩及以上享受增购优惠">
                <NumStepper
                  value={state.children_count}
                  onChange={(v) => set("children_count", v)}
                  min={0} max={6}
                />
              </Row>
            </Section>

            {/* 社保 / 居住证（仅非沪籍） */}
            {state.hukou_status === "Non_SH" && (
              <Section title="社保 & 居住证" icon={<IconCalendar size={15} />}>
                <Row label="连续社保/个税缴纳年限" hint="含个人所得税缴纳年限">
                  <SliderRow
                    value={state.social_security_years}
                    onChange={(v) => set("social_security_years", v)}
                    min={0} max={10} step={0.5}
                  />
                  {state.social_security_years >= 3 && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
                      fontSize: 12, color: "#6ee7b7" }}>
                      满 3 年：外环内可购 2 套
                    </div>
                  )}
                  {state.social_security_years >= 1 && state.social_security_years < 3 && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)",
                      fontSize: 12, color: "#93c5fd" }}>
                      满 1 年但不足 3 年：外环内可购 1 套
                    </div>
                  )}
                </Row>
                <Row label="持《上海市居住证》年限" hint="满5年可享受特例（无需社保）">
                  <SliderRow
                    value={state.residence_permit_years}
                    onChange={(v) => set("residence_permit_years", v)}
                    min={0} max={10} step={0.5}
                  />
                  {state.residence_permit_years >= 5 && (
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 10,
                      background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
                      fontSize: 12, color: "#6ee7b7" }}>
                      满 5 年：不受社保限制，全市（含外环内）可购 1 套
                    </div>
                  )}
                </Row>
              </Section>
            )}

            {/* 目标房源 */}
            <Section title="目标房源" icon={<IconHouse size={15} />}>
              <Row label="购房区域">
                <ChipGroup
                  options={[
                    { label: "外环内", value: "Inner_Ring" as TargetZone },
                    { label: "外环外", value: "Outer_Ring" as TargetZone },
                  ]}
                  value={state.target_zone}
                  onChange={(v) => set("target_zone", v)}
                />
              </Row>
              <Row label="建筑面积" hint="影响契税税率（≤140㎡为小户型税率）">
                <SliderRow
                  value={state.house_area}
                  onChange={(v) => set("house_area", v)}
                  min={30} max={400} step={5}
                  suffix=" ㎡"
                />
              </Row>
              <Row label="是否为绿色建筑 / 装配式建筑" hint="公积金额度可额外上浮 20%">
                <ChipGroup
                  options={[
                    { label: "否", value: false },
                    { label: "是", value: true },
                  ]}
                  value={state.is_green_building}
                  onChange={(v) => set("is_green_building", v)}
                />
              </Row>
            </Section>

            {/* 现有房产 */}
            <Section title="名下现有房产" icon={<IconApartment size={15} />}>
              <Row label="外环内（含内环）现有套数">
                <NumStepper
                  value={state.current_owned_sets_inner}
                  onChange={(v) => set("current_owned_sets_inner", v)}
                  min={0} max={5}
                />
              </Row>
              <Row label="外环外现有套数">
                <NumStepper
                  value={state.current_owned_sets_outer}
                  onChange={(v) => set("current_owned_sets_outer", v)}
                  min={0} max={5}
                />
              </Row>
            </Section>

            {/* Live preview bar */}
            <div className="glass-inset" style={{
              padding: "14px 18px", marginBottom: 18, borderRadius: 14,
              border: `1px solid ${liveOk ? "rgba(52,211,153,0.28)" : "rgba(248,113,113,0.25)"}`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: liveOk ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.10)",
                color: liveOk ? "#34d399" : "#f87171",
              }}>
                {liveOk ? <IconHouse size={20} /> : <IconApartment size={20} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700,
                  color: liveOk ? "#34d399" : "#f87171", marginBottom: 2 }}>
                  {state.target_zone === "Inner_Ring" ? "外环内" : "外环外"} · 实时预判
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{liveMsg}</div>
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                公积金上限 {fmtWan(output.gjj_estimated_wan)}
              </span>
            </div>

            <div style={{ textAlign: "center", paddingBottom: 48 }}>
              <button
                className="gl-btn gl-btn-primary"
                type="button"
                style={{ fontSize: 16, padding: "15px 56px" }}
                onClick={() => setShowResult(true)}
              >
                查看完整结果 →
              </button>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
                数据本地计算，不上传任何个人信息
              </div>
            </div>

          </div>
        )}

        {/* Bottom links */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, paddingBottom: 40,
          fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>
            经典版买卖对比
          </Link>
          <span>·</span>
          <Link href="/decision" style={{ color: "inherit", textDecoration: "none" }}>
            资产决策引擎
          </Link>
        </div>
      </div>
    </main>
  );
}
