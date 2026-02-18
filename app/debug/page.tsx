"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Col, Divider, Input, InputNumber, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
import rawSchema from "../../schema/model-schema.json";
import { calculateModel, type ModelOutput } from "../../lib/calc";
import { deriveEffectivePolicy } from "../../lib/policyProfiles";
import { POLICY_LOCKED_KEYS } from "../../lib/schema";

const { Title, Text, Paragraph } = Typography;

type FieldItem = {
  key: string;
  label: string;
  type: string;
  unit?: string;
  enum?: Array<string | number>;
  default?: unknown;
  group: string;
};

type ModuleDef = {
  id: string;
  name: string;
  keys: string[];
  metrics: string[];
  formulas: (ctx: { input: Record<string, unknown>; result: ModelOutput; policy: ReturnType<typeof deriveEffectivePolicy> }) => string[];
};

type ImpactRow = {
  key: string;
  label: string;
  before: string;
  after: string;
  deltaNavDiff: number;
  deltaBuyTotal: number;
  deltaRentTotal: number;
};

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const fmtYuan = (v: number) => `${Math.round(v).toLocaleString()} 元`;
const fmtWan = (v: number) => `${(v / 10000).toFixed(2)} 万元`;

const buildFieldItems = (): FieldItem[] =>
  (rawSchema.groups ?? []).flatMap((group: any) =>
    (group.items ?? []).map((item: any) => ({
      key: String(item.key),
      label: String(item.label ?? item.key),
      type: String(item.type ?? "string"),
      unit: item.unit,
      enum: Array.isArray(item.enum) ? item.enum : undefined,
      default: item.default,
      group: String(group.name ?? "未分组"),
    }))
  );

const EXTRA_DEFAULTS: Record<string, unknown> = {
  target_city: "上海",
  is_second_home: 0,
  holding_years: 2,
  multi_child_bonus: 0,
  green_building: 0,
  monthly_income: 25000,
  Fixed_burden: 0.35,
  Anxiety_threshold: 0.5,
  Family_support: 0,
  Future_big: 0,
  Medical_future: 0,
  Liquid_ratio: 20,
  Rent_stability_discount: 0.95,
  Hukou_weight: 0.5,
  Peace_discount: 0.95,
  Freedom_score: 0.5,
  expert_configured: true,
};

const buildDefaultInput = (items: FieldItem[]) => {
  const base: Record<string, unknown> = { ...EXTRA_DEFAULTS };
  for (const item of items) {
    if (item.default !== undefined) base[item.key] = item.default;
  }
  return base;
};

const buildPolicyLockedInputs = (input: Record<string, unknown>) => {
  const policy = deriveEffectivePolicy(input as any);
  const area = toNumber(input.area) ?? 90;
  const isSmallArea = area <= 140;
  const holdingYears = toNumber(input.holding_years) ?? 2;
  const isSecond = !!input.is_second_home;
  return {
    LPR: policy.lprPct,
    BP: policy.bpBps,
    r_gjj: isSecond ? policy.gjjRateSecondPct : policy.gjjRateFirstPct,
    Deed1_rate: isSmallArea ? policy.deedRateSmallFirstPct : policy.deedRateLargeFirstPct,
    Deed2_rate: isSmallArea ? policy.deedRateSmallSecondPct : policy.deedRateLargeSecondPct,
    VAT_rate: holdingYears >= policy.vatExemptHoldingYears ? 0 : policy.vatNonExemptPct,
    GJJ_max_single: policy.gjjMaxSingleWan,
    GJJ_max_family: policy.gjjMaxFamilyWan,
    GJJ_max_multichild: policy.gjjMaxMultiChildWan,
  };
};

const MODULES: ModuleDef[] = [
  {
    id: "base-policy",
    name: "政策与贷款结构",
    keys: ["target_city", "is_second_home", "area", "holding_years", "dp_min", "LPR", "BP", "r_gjj", "Mix_ratio", "n_years", "Repay_type", "GJJ_merge"],
    metrics: ["买房总成本", "净资产差额", "盈亏平衡点"],
    formulas: ({ input, result, policy }) => [
      `自动政策：${policy.policyName}（${policy.policyVersion}）`,
      `贷款结构：总价 × (1 - 首付比例) -> 公积金贷款 + 商贷`,
      `当前：首付比例 ${toNumber(input.dp_min) ?? 20}%，贷款年限 ${toNumber(input.n_years) ?? 30} 年，还款方式 ${String(input.Repay_type ?? "等额本息")}`,
      `输出：买房总成本 ${fmtWan(result.buyTotal)}，净资产差额 ${fmtWan(result.wealthView?.navDiff ?? 0)}`,
    ],
  },
  {
    id: "buy-cost",
    name: "买房成本构成",
    keys: ["P", "Reno_hard", "Reno_soft", "Reg_fee", "Loan_service", "Move_cost", "Time_cost", "M5U", "PIT_gross_rate", "CT_rate", "Edu_rate", "LocalEdu_rate", "Deed1_rate", "Deed2_rate", "VAT_rate"],
    metrics: ["首付", "税费", "装修", "摩擦成本"],
    formulas: ({ result }) => [
      `首付 = ${fmtWan(result.report.buySimulation.initialCosts.downPayment)}`,
      `税费 = ${fmtWan(result.report.buySimulation.initialCosts.taxesAndFees)}`,
      `装修 = ${fmtWan(result.report.buySimulation.initialCosts.renovation)}`,
      `摩擦成本 = ${fmtWan(result.report.buySimulation.initialCosts.frictionCost)}`,
      `一次性总计 = ${fmtWan(result.report.buySimulation.initialCosts.total)}`,
    ],
  },
  {
    id: "hold-flow",
    name: "持有期现金流",
    keys: ["PM_unit", "PM_growth", "PropertyTax_rate", "Maintenance_yearly", "Insurance", "Parking_mgmt", "Broadband", "Energy_premium", "Large_replace", "Deduct_limit", "GJJ_offset", "Cash_runway_months"],
    metrics: ["月度流出", "压力覆盖率", "紧急现金覆盖月数"],
    formulas: ({ result }) => [
      `月度流出（首月）= ${fmtYuan(result.report.buySimulation.monthlyOutflow)}`,
      `收入-20% 覆盖率 = ${result.report.stressTest.incomeDrop20.monthlyCoverageRatio.toFixed(2)} 倍`,
      `收入-40% 覆盖率 = ${result.report.stressTest.incomeDrop40.monthlyCoverageRatio.toFixed(2)} 倍`,
      `紧急现金覆盖 = ${result.report.financialBaseline.emergencyRunwayMonths.toFixed(2)} 月`,
    ],
  },
  {
    id: "rent-flow",
    name: "租房路径与摩擦",
    keys: ["rent_0", "g_r", "Move_freq_years", "Move_cost", "Furn_depr", "Rent_agent_rate", "Deposit_mult", "Residence_fee", "Rent_tax_rate", "GJJ_rent_cap", "Commute_delta", "Overlap_rent", "Social_cost", "CPI"],
    metrics: ["租房总成本", "租房净资产", "净资产差额"],
    formulas: ({ result }) => [
      `租房总成本 = ${fmtWan(result.rentTotal)}`,
      `租房期末净资产 = ${fmtWan(result.wealthView?.rentNAV ?? 0)}`,
      `净资产差额（买房-租房） = ${fmtWan(result.wealthView?.navDiff ?? 0)}`,
    ],
  },
  {
    id: "nav-exit",
    name: "期末净资产与退出",
    keys: ["g_p", "Seller_agent_rate", "Seller_tax_rate", "VAT_addon_exit", "Escrow_fee", "Time_cost", "R_inv", "Invest_consistency"],
    metrics: ["买房净资产", "租房净资产", "净资产差额", "盈亏平衡点"],
    formulas: ({ result }) => [
      `买房期末净资产 = ${fmtWan(result.wealthView?.buyNAV ?? 0)}`,
      `租房期末净资产 = ${fmtWan(result.wealthView?.rentNAV ?? 0)}`,
      `净资产差额 = ${fmtWan(result.wealthView?.navDiff ?? 0)}`,
      `盈亏平衡点 = ${result.report.netWorthComparison.crossoverYear ?? "未出现"}`,
    ],
  },
];

const BREAKDOWN_TO_MODULE: Array<{ name: string; moduleId: string; value: (r: ModelOutput) => number; hint: string }> = [
  { name: "买房总成本", moduleId: "buy-cost", value: (r) => r.buyTotal, hint: "由首付、税费、装修、持有期支出组成" },
  { name: "租房总成本", moduleId: "rent-flow", value: (r) => r.rentTotal, hint: "由租金、搬家、中介、通勤等组成" },
  { name: "净资产差额", moduleId: "nav-exit", value: (r) => r.wealthView?.navDiff ?? 0, hint: "买房净资产减租房净资产" },
  { name: "月度流出", moduleId: "hold-flow", value: (r) => r.report.buySimulation.monthlyOutflow, hint: "房贷、物业、税收抵扣等叠加结果" },
  { name: "盈亏平衡点", moduleId: "base-policy", value: (r) => r.report.netWorthComparison.crossoverYear ?? 0, hint: "净资产首次反超年份" },
];

const pickStep = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 10000) return Math.max(100, abs * 0.01);
  if (abs >= 100) return Math.max(1, abs * 0.01);
  if (abs >= 1) return 0.1;
  return 0.01;
};

export default function DebugPage() {
  const fields = useMemo(() => buildFieldItems(), []);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const [input, setInput] = useState<Record<string, unknown>>(() => buildDefaultInput(fields));
  const [activeModuleId, setActiveModuleId] = useState<string>(MODULES[0].id);

  const lockedPolicy = useMemo(() => buildPolicyLockedInputs(input), [input]);
  const mergedInput = useMemo<Record<string, unknown>>(
    () => ({ ...input, ...lockedPolicy, expert_configured: true }),
    [input, lockedPolicy]
  );
  const result = useMemo(() => calculateModel(mergedInput), [mergedInput]);
  const policy = useMemo(() => deriveEffectivePolicy(mergedInput as any), [mergedInput]);

  const moduleSummaries = useMemo(() => {
    return MODULES.map((m) => {
      const rows: ImpactRow[] = [];
      for (const key of m.keys) {
        const meta = fieldByKey.get(key);
        const current = mergedInput[key] ?? meta?.default;
        let nextValue: unknown = undefined;
        if (meta?.type === "number") {
          const n = toNumber(current);
          if (n !== undefined) nextValue = n + pickStep(n);
        } else if (meta?.enum && meta.enum.length > 1) {
          const idx = meta.enum.findIndex((v: unknown) => v === current);
          nextValue = meta.enum[(idx >= 0 ? idx + 1 : 0) % meta.enum.length];
        } else if (typeof current === "boolean") {
          nextValue = !current;
        }
        if (nextValue === undefined) continue;
        const out = calculateModel({ ...mergedInput, [key]: nextValue, __debug_fast: true });
        rows.push({
          key,
          label: meta?.label ?? key,
          before: String(current ?? ""),
          after: String(nextValue),
          deltaNavDiff: (out.wealthView?.navDiff ?? 0) - (result.wealthView?.navDiff ?? 0),
          deltaBuyTotal: out.buyTotal - result.buyTotal,
          deltaRentTotal: out.rentTotal - result.rentTotal,
        });
      }
      rows.sort((a, b) => Math.abs(b.deltaNavDiff) - Math.abs(a.deltaNavDiff));
      const score = rows.reduce((s, r) => s + Math.abs(r.deltaNavDiff), 0);
      return { module: m, rows, score };
    }).sort((a, b) => b.score - a.score);
  }, [mergedInput, fieldByKey, result]);

  const active = moduleSummaries.find((x) => x.module.id === activeModuleId) ?? moduleSummaries[0];
  const breakdownRows = useMemo(
    () =>
      BREAKDOWN_TO_MODULE.map((item) => {
        const linkedModule = MODULES.find((m) => m.id === item.moduleId) ?? MODULES[0];
        return {
          key: item.name,
          name: item.name,
          value: item.value(result),
          hint: item.hint,
          moduleId: item.moduleId,
          moduleName: linkedModule.name,
          keys: linkedModule.keys,
        };
      }),
    [result]
  );

  const renderFieldControl = (key: string) => {
    const meta = fieldByKey.get(key);
    const locked = POLICY_LOCKED_KEYS.includes(key);
    const value = locked ? (lockedPolicy as Record<string, unknown>)[key] : mergedInput[key];

    if (meta?.enum?.length) {
      return (
        <Select
          style={{ width: "100%" }}
          value={value as any}
          disabled={locked}
          options={meta.enum.map((x) => ({ label: String(x), value: x }))}
          onChange={(next) => setInput((prev) => ({ ...prev, [key]: next }))}
        />
      );
    }
    if (meta?.type === "number") {
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={typeof value === "number" ? value : toNumber(value)}
          disabled={locked}
          onChange={(next) => {
            if (next === null || Number.isNaN(next)) return;
            setInput((prev) => ({ ...prev, [key]: next }));
          }}
        />
      );
    }
    if (meta?.type === "boolean" || typeof value === "boolean") {
      return (
        <Switch
          checked={Boolean(value)}
          disabled={locked}
          onChange={(checked) => setInput((prev) => ({ ...prev, [key]: checked }))}
        />
      );
    }
    return (
      <Input
        value={value === undefined || value === null ? "" : String(value)}
        disabled={locked}
        onChange={(e) => setInput((prev) => ({ ...prev, [key]: e.target.value }))}
      />
    );
  };

  return (
    <div style={{ padding: 20, maxWidth: 1500, margin: "0 auto" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card size="small">
          <Row justify="space-between" align="middle">
            <Col>
              <Title level={3} style={{ margin: 0 }}>参数影响调试工作台</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                你可以手动改参数，系统会实时刷新每个模块和最终结果的变化来源。
              </Paragraph>
            </Col>
            <Col>
              <Link href="/">
                <Button>返回主页面</Button>
              </Link>
            </Col>
          </Row>
        </Card>

        <Card title="总结果细分（点击可定位到相关模块）" size="small">
          <Row gutter={[12, 12]}>
            {BREAKDOWN_TO_MODULE.map((b) => {
              const val = b.value(result);
              const isMoney = b.name !== "盈亏平衡点";
              return (
                <Col xs={24} md={12} lg={8} key={b.name}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => setActiveModuleId(b.moduleId)}
                    style={{ borderColor: active.module.id === b.moduleId ? "#1677ff" : undefined }}
                  >
                    <Text strong>{b.name}</Text>
                    <div style={{ marginTop: 8 }}>
                      <Text>{isMoney ? `${fmtWan(val)}（${fmtYuan(val)}）` : `${val || "未出现"} 年`}</Text>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Text type="secondary">{b.hint}</Text>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
          <Divider style={{ margin: "10px 0" }} />
          <Text type="secondary">政策自动应用：{policy.policyName}（{policy.policyVersion}）</Text>
        </Card>

        <Card title="模块卡片（按对净资产差额影响排序）" size="small">
          <Row gutter={[12, 12]}>
            {moduleSummaries.map((m) => (
              <Col xs={24} md={12} lg={8} key={m.module.id}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => setActiveModuleId(m.module.id)}
                  style={{ borderColor: active.module.id === m.module.id ? "#1677ff" : undefined }}
                >
                  <Text strong>{m.module.name}</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary">关联参数 {m.module.keys.length} 个</Text>
                  </div>
                  <div>
                    <Text type="secondary">影响指标：{m.module.metrics.join("、")}</Text>
                  </div>
                  <div>
                    <Text type="secondary">影响总量：{fmtYuan(m.score)}</Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>

        <Row gutter={16}>
          <Col xs={24} lg={10}>
            <Card title={`模块参数：${active.module.name}`} size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                {active.module.keys.map((key) => {
                  const meta = fieldByKey.get(key);
                  const locked = POLICY_LOCKED_KEYS.includes(key);
                  return (
                    <div key={key}>
                      <Text>{meta?.label ?? key}{meta?.unit ? `（${meta.unit}）` : ""}{locked ? "（自动应用）" : ""}</Text>
                      <div style={{ marginTop: 6 }}>
                        {renderFieldControl(key)}
                      </div>
                      <Text type="secondary">参数键：{key}</Text>
                    </div>
                  );
                })}
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={14}>
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card title="计算步骤（当前值代入）" size="small">
                <ul>
                  {active.module.formulas({ input: mergedInput, result, policy }).map((line) => (
                    <li key={line}><Text>{line}</Text></li>
                  ))}
                </ul>
              </Card>

              <Card title="总结果组成与模块映射" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  {breakdownRows.map((row) => (
                    <Card
                      key={row.key}
                      size="small"
                      hoverable
                      onClick={() => setActiveModuleId(row.moduleId)}
                      style={{ borderColor: active.module.id === row.moduleId ? "#1677ff" : undefined }}
                    >
                      <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        <Row justify="space-between">
                          <Text strong>{row.name}</Text>
                          <Text>{row.name === "盈亏平衡点" ? `${row.value || "未出现"} 年` : `${fmtWan(row.value)}（${fmtYuan(row.value)}）`}</Text>
                        </Row>
                        <Text type="secondary">{row.hint}</Text>
                        <div>
                          <Tag color="blue">{row.moduleName}</Tag>
                          {row.keys.slice(0, 6).map((k) => (
                            <Tag key={k}>{fieldByKey.get(k)?.label ?? k}</Tag>
                          ))}
                          {row.keys.length > 6 ? <Tag>...</Tag> : null}
                        </div>
                      </Space>
                    </Card>
                  ))}
                </Space>
              </Card>

              <Card title="参数变化对结果的影响（当前模块）" size="small">
                <Table
                  size="small"
                  rowKey="key"
                  pagination={{ pageSize: 8 }}
                  dataSource={active.rows}
                  columns={[
                    { title: "参数", dataIndex: "label", key: "label", render: (v, r: ImpactRow) => `${v}（${r.key}）` },
                    { title: "原值", dataIndex: "before", key: "before" },
                    { title: "扰动值", dataIndex: "after", key: "after" },
                    {
                      title: "净资产差额变化",
                      dataIndex: "deltaNavDiff",
                      key: "deltaNavDiff",
                      render: (v: number) => <Text style={{ color: v >= 0 ? "#389e0d" : "#cf1322" }}>{v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString()} 元</Text>,
                    },
                    {
                      title: "买房总成本变化",
                      dataIndex: "deltaBuyTotal",
                      key: "deltaBuyTotal",
                      render: (v: number) => <Text>{v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString()} 元</Text>,
                    },
                    {
                      title: "租房总成本变化",
                      dataIndex: "deltaRentTotal",
                      key: "deltaRentTotal",
                      render: (v: number) => <Text>{v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString()} 元</Text>,
                    },
                  ]}
                />
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>
    </div>
  );
}
