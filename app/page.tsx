"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createForm } from "@formily/core";
import { FormProvider } from "@formily/react";
import { FormLayout, FormStep, FormButtonGroup, Submit, Reset } from "@formily/antd-v5";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  InputNumber,
  Progress,
  Radio,
  Row,
  Select,
  Slider,
  Space,
  Statistic,
  Steps,
  Tag,
  Typography,
} from "antd";
import { SchemaField } from "./components/FieldMappings";
import { buildFormilySchema, createFieldMetaMap, STAGE2_CARD_LAYOUT } from "../lib/schema";
import { calculateModel, type ModelOutput } from "../lib/calc";
import { deriveEffectivePolicy } from "../lib/policyProfiles";
import {
  createPreset,
  deletePreset,
  getLatestRun,
  getSession,
  getSupabaseClient,
  listPresets,
  signInWithEmailOtp,
  signOut,
  upsertRun,
  type PresetRow,
} from "../lib/supabaseClient";
import rawSchema from "../schema/model-schema.json";

const { Title, Text, Paragraph } = Typography;

type QuickInputs = {
  target_city: "上海" | "北京";
  is_second_home: number;
  area: number;
  holding_years: number;
  multi_child_bonus: number;
  green_building: number;
  P: number;
  dp_min: number;
  monthly_income: number;
  rent_0: number;
  years: number;
  R_inv: number;
  Mix_ratio: number;
  GJJ_extra: number;
  Emergency: number;
  n_years: number;
  Repay_type: "等额本息" | "等额本金";
  GJJ_merge: number;
  M5U: "yes" | "no";
  Reno_hard: number;
  Reno_soft: number;
  PM_unit: number;
  g_p: number;
  g_r: number;
  Move_freq_years: number;
  Move_cost: number;
  Invest_consistency: number;
  Cash_runway_months: number;
};

const fmtWan = (v: number) => `${(v / 10000).toFixed(1)} 万元`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtWanWithYuan = (v: number) => `${(v / 10000).toFixed(1)} 万元（${Math.round(v).toLocaleString()} 元）`;
const fmtSmartAmount = (v: number) =>
  Math.abs(v) >= 100000 ? `${(v / 10000).toFixed(1)} 万元` : `${Math.round(v).toLocaleString()} 元`;
const isModelOutputLike = (value: unknown): value is ModelOutput => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.buyTotal === "number" &&
    typeof row.rentTotal === "number" &&
    typeof row.diff === "number" &&
    typeof row.recommendation === "string" &&
    typeof row.isQualified === "boolean"
  );
};

export default function CalculatorPage() {
  const form = useMemo(() => createForm({ values: {}, validateFirst: true }), []);
  const formStep = useMemo(() => FormStep.createFormStep(), []);
  const uiSchema = useMemo(() => buildFormilySchema(rawSchema), []);
  const fieldMetaMap = useMemo(() => createFieldMetaMap(rawSchema), []);

  const [result, setResult] = useState<ModelOutput | null>(null);
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);
  const [stage2Completed, setStage2Completed] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetBusy, setPresetBusy] = useState(false);
  const [quickInputs, setQuickInputs] = useState<QuickInputs>({
    target_city: "上海",
    is_second_home: 0,
    area: 90,
    holding_years: 2,
    multi_child_bonus: 0,
    green_building: 0,
    P: 600,
    dp_min: 20,
    monthly_income: 25000,
    rent_0: 8000,
    years: 10,
    R_inv: 5,
    Mix_ratio: 50,
    GJJ_extra: 2000,
    Emergency: 20,
    n_years: 30,
    Repay_type: "等额本息",
    GJJ_merge: 1,
    M5U: "yes",
    Reno_hard: 30,
    Reno_soft: 12,
    PM_unit: 5,
    g_p: 3,
    g_r: 3,
    Move_freq_years: 2,
    Move_cost: 3000,
    Invest_consistency: 70,
    Cash_runway_months: 6,
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    let mounted = true;
    const pullPresets = async () => {
      const rows = await listPresets();
      if (!mounted) return;
      setPresets(rows);
    };
    (async () => {
      const session = await getSession();
      if (!mounted) return;
      setIsLoggedIn(!!session);
      setSessionReady(true);
      if (!session) return;
      await pullPresets();
      const latest = await getLatestRun();
      if (!latest) return;
      const savedInput = (latest.input_json ?? {}) as Record<string, unknown>;
      const merged = { ...quickInputs, ...savedInput } as QuickInputs;
      setQuickInputs(merged);
      form.setValues(merged as Record<string, unknown>);
      const savedResult = latest.result_json;
      if (isModelOutputLike(savedResult)) {
        setResult(savedResult);
        setStage2Completed(true);
        setStage(4);
      }
      setAuthMessage(`已恢复你在 ${new Date(latest.created_at).toLocaleString()} 的最近一次记录`);
    })();

    if (!supabase) return () => { mounted = false; };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsLoggedIn(!!session);
      if (session) {
        void pullPresets();
      } else {
        setPresets([]);
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateQuickInput = useCallback(
    <K extends keyof QuickInputs>(key: K, value: number | null) => {
      if (value === null || Number.isNaN(value)) return;
      setQuickInputs((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const runAnalysis = useCallback(
    (overrides: Record<string, any> = {}) => {
      const merged = {
        ...form.values,
        ...quickInputs,
        ...overrides,
      };
      form.setValues(merged);
      const computed = calculateModel(merged);
      setResult(computed);
      if (isLoggedIn) {
        void upsertRun(merged as Record<string, unknown>, computed as unknown as Record<string, unknown>);
      }
    },
    [form, quickInputs, isLoggedIn]
  );
  const refreshPresets = useCallback(async () => {
    const rows = await listPresets();
    setPresets(rows);
  }, []);
  const applyPreset = useCallback(
    (preset: PresetRow) => {
      const savedInput = (preset.input_json ?? {}) as Record<string, unknown>;
      const merged = { ...quickInputs, ...savedInput } as QuickInputs;
      setQuickInputs(merged);
      form.setValues(merged as Record<string, unknown>);
      const savedResult = preset.result_json;
      if (isModelOutputLike(savedResult)) {
        setResult(savedResult);
        setStage2Completed(true);
        setStage(4);
      } else {
        runAnalysis(merged as Record<string, unknown>);
      }
      setAuthMessage(`已加载场景：${preset.name}`);
    },
    [form, quickInputs, runAnalysis]
  );

  const teaserPolicy = useMemo(() => deriveEffectivePolicy(quickInputs), [quickInputs]);

  const modelResolution = useMemo(() => {
    const required: Array<keyof QuickInputs> = [
      "P",
      "area",
      "dp_min",
      "monthly_income",
      "rent_0",
      "years",
      "Emergency",
      "R_inv",
      "n_years",
      "Reno_hard",
      "Reno_soft",
    ];
    const filled = required.filter((k) => Number(quickInputs[k]) > 0).length;
    const base = 30 + Math.round((filled / required.length) * 40);
    if (!stage2Completed) return Math.min(70, base);
    if (stage >= 3) return Math.min(95, base + 20);
    return Math.min(85, base + 10);
  }, [quickInputs, stage2Completed, stage]);

  const onExpertSubmit = useCallback(async () => {
    try {
      const values = (await form.submit()) as Record<string, any>;
      runAnalysis(values);
    } catch {}
  }, [form, runAnalysis]);

  const renderStage2Field = useCallback((key: keyof QuickInputs) => {
    const meta = fieldMetaMap[key as string];
    const label = meta?.label ?? key;
    const unit = meta?.unit;

    if (key === "Repay_type") {
      return (
        <>
          <Text>{label}</Text>
          <Select
            style={{ width: "100%" }}
            value={quickInputs.Repay_type}
            options={[{ label: "等额本息", value: "等额本息" }, { label: "等额本金", value: "等额本金" }]}
            onChange={(v) => setQuickInputs((p) => ({ ...p, Repay_type: v }))}
          />
        </>
      );
    }
    if (key === "M5U") {
      return (
        <>
          <Text>{label}</Text>
          <Select
            style={{ width: "100%" }}
            value={quickInputs.M5U}
            options={[{ label: "是", value: "yes" }, { label: "否", value: "no" }]}
            onChange={(v) => setQuickInputs((p) => ({ ...p, M5U: v }))}
          />
        </>
      );
    }
    if (key === "GJJ_merge") {
      return (
        <>
          <Text>{label}</Text>
          <Radio.Group value={quickInputs.GJJ_merge} onChange={(e) => setQuickInputs((p) => ({ ...p, GJJ_merge: e.target.value }))}>
            <Radio.Button value={1}>家庭</Radio.Button>
            <Radio.Button value={0}>单人</Radio.Button>
          </Radio.Group>
        </>
      );
    }
    if (meta?.enum?.length) {
      return (
        <>
          <Text>{label}</Text>
          <Select
            style={{ width: "100%" }}
            value={quickInputs[key] as any}
            options={meta.enum.map((v) => ({ label: String(v), value: v }))}
            onChange={(v) => setQuickInputs((p) => ({ ...p, [key]: v }))}
          />
        </>
      );
    }
    return (
      <>
        <Text>{unit ? `${label}（${unit}）` : label}</Text>
        <InputNumber style={{ width: "100%" }} value={quickInputs[key] as number} onChange={(v) => updateQuickInput(key as any, v)} />
      </>
    );
  }, [fieldMetaMap, quickInputs, updateQuickInput]);

  const dashboard = useMemo(() => {
    if (!result) return null;

    const horizon = Math.max(1, quickInputs.years);
    const annualCashflow = result.wealthView?.monthly_cashflow
      ? Array.from({ length: horizon }, (_, i) => {
          const year = i + 1;
          const from = i * 12;
          const to = from + 12;
          const slice = result.wealthView!.monthly_cashflow.slice(from, to);
          const buy = slice.reduce((sum, row) => sum + row.buyOutflow, 0);
          const rent = slice.reduce((sum, row) => sum + row.rentOutflow, 0);
          return { year, buy, rent };
        })
      : Array.from({ length: horizon }, (_, i) => {
          const year = i + 1;
          const buy = result.report.buySimulation.monthlyOutflow * 12 * (year <= 3 ? 1.03 : year >= 6 ? 0.98 : 1);
          const rent = quickInputs.rent_0 * 12 * Math.pow(1.03, year - 1);
          return { year, buy, rent };
        });

    const baseScenario =
      result.report.netWorthComparison.scenarios.find((s) => s.name === "Base") ?? result.report.netWorthComparison.scenarios[0];

    const cumulativeAssets = result.wealthView?.yearly_networth?.length
      ? result.wealthView.yearly_networth.map((row) => ({ year: row.year, buy: row.buyNAV, rent: row.rentNAV }))
      : Array.from({ length: horizon }, (_, i) => {
          const year = i + 1;
          const ratio = year / horizon;
          const buy =
            -result.report.buySimulation.initialCosts.total +
            (baseScenario.buyNetWorth + result.report.buySimulation.initialCosts.total) * Math.pow(ratio, 1.05);
          const rent = baseScenario.rentNetWorth * Math.pow(ratio, 0.95);
          return { year, buy, rent };
        });

    const buyParts = [
      { label: "首付", value: result.report.buySimulation.initialCosts.downPayment, color: "#1677ff" },
      { label: "税费", value: result.report.buySimulation.initialCosts.taxesAndFees, color: "#13c2c2" },
      { label: "装修", value: result.report.buySimulation.initialCosts.renovation, color: "#faad14" },
      { label: "摩擦", value: result.report.buySimulation.initialCosts.frictionCost, color: "#ff7a45" },
      { label: "利息", value: result.report.buySimulation.interestPaid10Years, color: "#f5222d" },
    ];
    const rentParts = [
      { label: "租金", value: result.rentTotal, color: "#722ed1" },
      { label: "搬迁", value: result.report.rentSimulation.relocationCost, color: "#eb2f96" },
    ];

    const matrix = result.wealthView?.sensitivity_matrix;
    const houseGrowthAxis = matrix ? matrix.house_growth_rates.map((v) => Math.round(v * 100)) : [-2, 0, 2, 4, 6];
    const rentGrowthAxis = matrix ? matrix.rent_growth_rates.map((v) => Math.round(v * 100)) : [1, 2, 3, 4, 5];
    const sensitivity = matrix
      ? matrix.wealth_gap_matrix.map((row) => row.map((yuan) => Math.round(yuan / 10000)))
      : Array.from({ length: houseGrowthAxis.length }, () => Array.from({ length: rentGrowthAxis.length }, () => 0));

    return {
      annualCashflow,
      cumulativeAssets,
      buyParts,
      rentParts,
      buyTotalParts: buyParts.reduce((sum, p) => sum + p.value, 0),
      rentTotalParts: rentParts.reduce((sum, p) => sum + p.value, 0),
      houseGrowthAxis,
      rentGrowthAxis,
      sensitivity,
      baseScenario,
      navDiff: result.wealthView?.navDiff,
      buyNAV: result.wealthView?.buyNAV,
      rentNAV: result.wealthView?.rentNAV,
    };
  }, [result, quickInputs]);
  const hasSupabase = !!getSupabaseClient();

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <header style={{ marginBottom: 16 }}>
        <Title level={2} style={{ marginBottom: 6 }}>买房 vs 租房 专业结果解读</Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          四段式建模流程：悬念预告 -&gt; 基础建模 -&gt; 核心精算 -&gt; 高级模式。
        </Paragraph>
      </header>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Steps
            current={stage - 1}
            onChange={(next) => {
              const target = (next + 1) as 1 | 2 | 3 | 4;
              if (target <= stage || target <= 2 || (stage2Completed && target >= 3)) setStage(target);
            }}
            items={[{ title: "悬念预告" }, { title: "基础建模" }, { title: "核心精算" }, { title: "高级模式" }]}
          />
          <div>
            <Text>模型清晰度</Text>
            <Progress percent={modelResolution} />
          </div>
        </Space>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Card title="账号与云端保存" size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                {!hasSupabase && (
                  <Alert
                    type="warning"
                    showIcon
                    message="Supabase 未配置"
                    description="请设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY。"
                  />
                )}
                {sessionReady && !isLoggedIn && hasSupabase && (
                  <>
                    <div>
                      <Text>登录邮箱（验证码）</Text>
                      <input
                        style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #d9d9d9" }}
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="请输入邮箱地址"
                      />
                    </div>
                    <Button
                      type="primary"
                      block
                      onClick={async () => {
                        try {
                          const { error } = await signInWithEmailOtp(authEmail.trim());
                          if (error) throw error;
                          setAuthMessage("登录链接已发送到邮箱，请点击后返回本页面。");
                        } catch (e: any) {
                          setAuthMessage(`发送失败：${e?.message ?? "未知错误"}`);
                        }
                      }}
                      disabled={!authEmail.trim()}
                    >
                      发送登录链接
                    </Button>
                  </>
                )}
                {sessionReady && isLoggedIn && (
                  <>
                    <Alert type="success" showIcon message="已登录，计算结果会自动保存到云端。" />
                    <Button
                      block
                      onClick={async () => {
                        await signOut();
                        setIsLoggedIn(false);
                        setAuthMessage("已退出登录。");
                      }}
                    >
                      退出登录
                    </Button>
                  </>
                )}
                {authMessage && <Text type="secondary">{authMessage}</Text>}
              </Space>
            </Card>

            <Card title="场景保存" size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                {!isLoggedIn && (
                  <Alert
                    type="info"
                    showIcon
                    message="登录后可保存多个场景"
                    description="你可以给每组参数命名，并在后续一键加载。"
                  />
                )}
                {isLoggedIn && (
                  <>
                    <div>
                      <Text>场景名称</Text>
                      <input
                        style={{ width: "100%", marginTop: 6, padding: 8, borderRadius: 6, border: "1px solid #d9d9d9" }}
                        type="text"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="例如：上海首套-偏保守"
                      />
                    </div>
                    <Row gutter={8}>
                      <Col span={12}>
                        <Button
                          type="primary"
                          block
                          loading={presetBusy}
                          disabled={!presetName.trim()}
                          onClick={async () => {
                            setPresetBusy(true);
                            try {
                              const merged = {
                                ...form.values,
                                ...quickInputs,
                              } as Record<string, unknown>;
                              await createPreset(
                                presetName.trim(),
                                merged,
                                (result ?? null) as unknown as Record<string, unknown> | null
                              );
                              setPresetName("");
                              await refreshPresets();
                              setAuthMessage("场景已保存。");
                            } catch (e: any) {
                              setAuthMessage(`保存场景失败：${e?.message ?? "未知错误"}`);
                            } finally {
                              setPresetBusy(false);
                            }
                          }}
                        >
                          保存当前场景
                        </Button>
                      </Col>
                      <Col span={12}>
                        <Button block onClick={() => void refreshPresets()} disabled={presetBusy}>
                          刷新列表
                        </Button>
                      </Col>
                    </Row>
                    {presets.length === 0 && <Text type="secondary">暂无场景，先保存一条。</Text>}
                    {presets.map((preset) => (
                      <Card key={preset.id} size="small" style={{ background: "#fafafa" }}>
                        <Space direction="vertical" style={{ width: "100%" }} size={4}>
                          <Text strong>{preset.name}</Text>
                          <Text type="secondary">{new Date(preset.updated_at).toLocaleString()}</Text>
                          <Row gutter={8}>
                            <Col span={12}>
                              <Button block size="small" onClick={() => applyPreset(preset)}>
                                加载
                              </Button>
                            </Col>
                            <Col span={12}>
                              <Button
                                block
                                size="small"
                                danger
                                onClick={async () => {
                                  setPresetBusy(true);
                                  try {
                                    await deletePreset(preset.id);
                                    await refreshPresets();
                                    setAuthMessage(`已删除场景：${preset.name}`);
                                  } catch (e: any) {
                                    setAuthMessage(`删除场景失败：${e?.message ?? "未知错误"}`);
                                  } finally {
                                    setPresetBusy(false);
                                  }
                                }}
                              >
                                删除
                              </Button>
                            </Col>
                          </Row>
                        </Space>
                      </Card>
                    ))}
                  </>
                )}
              </Space>
            </Card>

            <Card title="阶段一：悬念预告（先不出结论）" size="small">
              <Space direction="vertical" style={{ width: "100%" }} size={10}>
                <div>
                  <Text>目标城市</Text>
                  <Select
                    style={{ width: "100%", marginTop: 6 }}
                    value={quickInputs.target_city}
                    options={[{ label: "上海", value: "上海" }, { label: "北京", value: "北京" }]}
                    onChange={(v) => setQuickInputs((p) => ({ ...p, target_city: v }))}
                  />
                </div>
                <div>
                  <Text>是否二套</Text>
                  <Radio.Group value={quickInputs.is_second_home} onChange={(e) => setQuickInputs((p) => ({ ...p, is_second_home: e.target.value }))}>
                    <Radio.Button value={0}>首套</Radio.Button>
                    <Radio.Button value={1}>二套</Radio.Button>
                  </Radio.Group>
                </div>
                <div>
                  <Text>房价（万元）</Text>
                  <InputNumber style={{ width: "100%" }} value={quickInputs.P} onChange={(v) => updateQuickInput("P", v)} />
                </div>
                <div>
                  <Text>房屋面积（㎡）</Text>
                  <InputNumber style={{ width: "100%" }} value={quickInputs.area} onChange={(v) => updateQuickInput("area", v)} />
                </div>
                <Alert
                  type="info"
                  showIcon
                  message={`政策引擎已加载：${teaserPolicy.policyName}`}
                  description={`已自动应用：${teaserPolicy.autoAppliedFactors.slice(0, 3).join("；")}`}
                />
                <Alert
                  type="warning"
                  showIcon
                  message="命运分叉口预告（仅做悬念）"
                  description={`按当前城市与总价，10年可能出现约 ${Math.round(quickInputs.P * 0.25).toLocaleString()} 万区间波动。继续基础建模后才给真实净资产结论。`}
                />
                <Button type="primary" block onClick={() => setStage(2)}>开始建立我的财务档案</Button>
              </Space>
            </Card>

            {stage >= 2 && (
              <Card title="阶段二：现实基石（约20项）" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  {STAGE2_CARD_LAYOUT.map((card) => (
                    <div key={card.title}>
                      <Text strong>{card.title}</Text>
                      <Row gutter={8} style={{ marginTop: 6 }}>
                        {card.keys.map((key) => (
                          <Col span={12} key={key}>
                            {renderStage2Field(key as keyof QuickInputs)}
                          </Col>
                        ))}
                      </Row>
                    </div>
                  ))}

                  <Button type="primary" block onClick={() => { runAnalysis(); setStage2Completed(true); setStage(3); }}>
                    完成基础建模并生成首版报告
                  </Button>
                </Space>
              </Card>
            )}

            {stage2Completed && stage >= 3 && (
              <Card title="阶段三：精算小专家（核心杠杆）" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  <Text>房价年化预期（%）</Text>
                  <Slider min={-5} max={10} value={quickInputs.g_p} onChange={(v) => setQuickInputs((p) => ({ ...p, g_p: Number(v) }))} />
                  <Text>租金年化涨幅（%）</Text>
                  <Slider min={0} max={8} value={quickInputs.g_r} onChange={(v) => setQuickInputs((p) => ({ ...p, g_r: Number(v) }))} />
                  <Text>理财收益率（%）</Text>
                  <Slider min={1} max={10} value={quickInputs.R_inv} onChange={(v) => setQuickInputs((p) => ({ ...p, R_inv: Number(v) }))} />
                  <Text>投资执行力（%）</Text>
                  <Slider min={10} max={100} value={quickInputs.Invest_consistency} onChange={(v) => setQuickInputs((p) => ({ ...p, Invest_consistency: Number(v) }))} />
                  <Row gutter={8}>
                    <Col span={12}><Text>搬家频率（年/次）</Text><InputNumber style={{ width: "100%" }} value={quickInputs.Move_freq_years} onChange={(v) => updateQuickInput("Move_freq_years", v)} /></Col>
                    <Col span={12}><Text>搬家费（元）</Text><InputNumber style={{ width: "100%" }} value={quickInputs.Move_cost} onChange={(v) => updateQuickInput("Move_cost", v)} /></Col>
                  </Row>
                  <Button type="primary" block onClick={() => { runAnalysis(); setStage(4); }}>
                    更新4K精算报告
                  </Button>
                </Space>
              </Card>
            )}

            {stage2Completed && (
              <Card title="阶段四：高级模式（100+参数微调）" size="small">
                <FormProvider form={form}>
                  <FormLayout labelCol={8} wrapperCol={16}>
                    <SchemaField schema={uiSchema} scope={{ formStep }} />
                    <FormButtonGroup style={{ marginTop: 16, justifyContent: "center" }}>
                      <Button onClick={() => formStep.back()} disabled={!formStep.allowBack}>上一步</Button>
                      <Button
                        type="primary"
                        onClick={async () => {
                          if (!formStep.allowNext) return;
                          const currentStepIndex = formStep.current + 1;
                          try {
                            await form.validate(`steps.step${currentStepIndex}.*`);
                            formStep.setCurrent(formStep.current + 1);
                          } catch {}
                        }}
                        disabled={!formStep.allowNext}
                      >
                        下一步
                      </Button>
                      <Submit onSubmit={onExpertSubmit}>应用高级参数并重算</Submit>
                      <Reset onClick={() => form.reset()}>重置</Reset>
                    </FormButtonGroup>
                  </FormLayout>
                </FormProvider>
              </Card>
            )}
          </Space>
        </Col>

        <Col xs={24} lg={15}>
          {!stage2Completed || !result || !dashboard ? (
            <Card>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                先完成“阶段二：基础建模”，系统才会生成第一版真实净资产报告。
              </Paragraph>
            </Card>
          ) : (
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Card title="政策自动应用" size="small">
                <Alert type="success" showIcon message={`${result.report.policy.city} · ${result.report.policy.policyName}`} description={`政策版本：${result.report.policy.policyVersion}`} />
                <Divider style={{ margin: "10px 0" }} />
                {result.report.policy.autoAppliedFactors.map((f) => (
                  <Text key={f} type="secondary" style={{ display: "block" }}>- {f}</Text>
                ))}
              </Card>

              <Card title="关键指标总览（10年）" size="small">
                <Row gutter={[12, 12]}>
                  <Col xs={12} md={8}><Statistic title="买房总成本" value={fmtWan(result.buyTotal)} /></Col>
                  <Col xs={12} md={8}><Statistic title="租房总成本" value={fmtWan(result.rentTotal)} /></Col>
                  <Col xs={12} md={8}><Statistic title="总差额" value={fmtWan(result.diff)} valueStyle={{ color: result.diff <= 0 ? "#389e0d" : "#d46b08" }} /></Col>
                  <Col xs={12} md={8}><Statistic title="买房期末净资产" value={fmtWan(dashboard.buyNAV ?? dashboard.baseScenario.buyNetWorth)} /></Col>
                  <Col xs={12} md={8}><Statistic title="租房期末净资产" value={fmtWan(dashboard.rentNAV ?? dashboard.baseScenario.rentNetWorth)} /></Col>
                  <Col xs={12} md={8}><Statistic title="净资产差额" value={fmtWan(dashboard.navDiff ?? dashboard.baseScenario.gap)} valueStyle={{ color: (dashboard.navDiff ?? dashboard.baseScenario.gap) >= 0 ? "#389e0d" : "#d46b08" }} /></Col>
                  <Col xs={12} md={8}><Statistic title="基准净资产差" value={fmtWan(dashboard.baseScenario.gap)} /></Col>
                  <Col xs={12} md={8}><Statistic title="盈亏平衡点" value={result.report.netWorthComparison.crossoverYear ?? "未出现"} suffix={result.report.netWorthComparison.crossoverYear ? "年" : ""} /></Col>
                  <Col xs={12} md={8}><Statistic title="房价平衡增速" value={fmtPct(result.report.netWorthComparison.breakEvenGrowth)} /></Col>
                </Row>
                <Divider style={{ margin: "10px 0" }} />
                <Tag color={result.report.executiveSummary.zone === "建议购买区" ? "green" : result.report.executiveSummary.zone === "继续租房区" ? "orange" : "blue"}>
                  {result.report.executiveSummary.currentState}
                </Tag>
                <Text style={{ marginLeft: 8 }}>{result.recommendation}</Text>
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">买房总成本：{fmtWanWithYuan(result.buyTotal)}</Text>
                  <br />
                  <Text type="secondary">租房总成本：{fmtWanWithYuan(result.rentTotal)}</Text>
                </div>
              </Card>

              <Card title="现金流曲线（年化）" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                  {(() => {
                    const maxFlow = Math.max(...dashboard.annualCashflow.map((x) => Math.max(x.buy, x.rent)), 1);
                    return dashboard.annualCashflow.map((row) => (
                      <div key={row.year}>
                        <Text type="secondary">第 {row.year} 年</Text>
                        <div style={{ marginTop: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Text style={{ width: 60 }}>买房</Text>
                            <div style={{ flex: 1, background: "#f5f5f5", height: 8, borderRadius: 4 }}>
                              <div style={{ width: `${(row.buy / maxFlow) * 100}%`, background: "#1677ff", height: 8, borderRadius: 4 }} />
                            </div>
                            <Text>{fmtSmartAmount(row.buy)}</Text>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                            <Text style={{ width: 60 }}>租房</Text>
                            <div style={{ flex: 1, background: "#f5f5f5", height: 8, borderRadius: 4 }}>
                              <div style={{ width: `${(row.rent / maxFlow) * 100}%`, background: "#fa8c16", height: 8, borderRadius: 4 }} />
                            </div>
                            <Text>{fmtSmartAmount(row.rent)}</Text>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </Space>
              </Card>

              <Card title="累计资产曲线（净资产）" size="small">
                <Space direction="vertical" style={{ width: "100%" }} size={8}>
                  {(() => {
                    const maxAbs = Math.max(...dashboard.cumulativeAssets.map((x) => Math.max(Math.abs(x.buy), Math.abs(x.rent))), 1);
                    return dashboard.cumulativeAssets.map((row) => (
                      <div key={row.year}>
                        <Text type="secondary">第 {row.year} 年</Text>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <Text style={{ width: 60 }}>买房</Text>
                          <div style={{ flex: 1, background: "#f5f5f5", height: 8, borderRadius: 4 }}>
                            <div style={{ width: `${(Math.abs(row.buy) / maxAbs) * 100}%`, background: "#2f54eb", height: 8, borderRadius: 4 }} />
                          </div>
                          <Text>{fmtSmartAmount(row.buy)}</Text>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <Text style={{ width: 60 }}>租房</Text>
                          <div style={{ flex: 1, background: "#f5f5f5", height: 8, borderRadius: 4 }}>
                            <div style={{ width: `${(Math.abs(row.rent) / maxAbs) * 100}%`, background: "#fa8c16", height: 8, borderRadius: 4 }} />
                          </div>
                          <Text>{fmtSmartAmount(row.rent)}</Text>
                        </div>
                      </div>
                    ));
                  })()}
                </Space>
              </Card>

              <Card title="总成本构成（堆叠）" size="small">
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Text strong>买房路径</Text>
                    <div style={{ marginTop: 8, display: "flex", borderRadius: 6, overflow: "hidden", height: 14 }}>
                      {dashboard.buyParts.map((p) => <div key={p.label} style={{ width: `${(p.value / Math.max(1, dashboard.buyTotalParts)) * 100}%`, background: p.color }} />)}
                    </div>
                    <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                      {dashboard.buyParts.map((p) => <Text key={p.label} type="secondary">{p.label}: {fmtWanWithYuan(p.value)}</Text>)}
                    </Space>
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong>租房路径</Text>
                    <div style={{ marginTop: 8, display: "flex", borderRadius: 6, overflow: "hidden", height: 14 }}>
                      {dashboard.rentParts.map((p) => <div key={p.label} style={{ width: `${(p.value / Math.max(1, dashboard.rentTotalParts)) * 100}%`, background: p.color }} />)}
                    </div>
                    <Space direction="vertical" size={2} style={{ marginTop: 8 }}>
                      {dashboard.rentParts.map((p) => <Text key={p.label} type="secondary">{p.label}: {fmtWanWithYuan(p.value)}</Text>)}
                    </Space>
                  </Col>
                </Row>
              </Card>

              <Card title="敏感性热力图（房价涨幅 × 租金涨幅）" size="small">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 6, borderBottom: "1px solid #f0f0f0" }}>房价\\租金</th>
                        {dashboard.rentGrowthAxis.map((r) => <th key={r} style={{ padding: 6, borderBottom: "1px solid #f0f0f0" }}>{r}%</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.houseGrowthAxis.map((h, rowIdx) => (
                        <tr key={h}>
                          <td style={{ padding: 6, borderBottom: "1px solid #f5f5f5", fontWeight: 600 }}>{h}%</td>
                          {dashboard.sensitivity[rowIdx].map((value, colIdx) => {
                            const bg = value > 0 ? (value > 80 ? "#b7eb8f" : "#ffe58f") : "#ffa39e";
                            return (
                              <td key={`${h}-${dashboard.rentGrowthAxis[colIdx]}`} style={{ padding: 6, borderBottom: "1px solid #f5f5f5", background: bg }}>
                                {value}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Text type="secondary">单元格数值为净资产差额（万元，买房-租房）。绿色越深表示买房路径越占优。</Text>
              </Card>

              <Card title="现金流安全" size="small">
                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Progress type="dashboard" percent={Math.min(100, Math.round(result.report.stressTest.incomeDrop20.monthlyCoverageRatio * 50))} format={() => `${result.report.stressTest.incomeDrop20.monthlyCoverageRatio.toFixed(2)}x`} />
                    <Text type="secondary">收入-20%覆盖率</Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Progress type="dashboard" percent={Math.min(100, Math.round(result.report.stressTest.incomeDrop40.monthlyCoverageRatio * 50))} format={() => `${result.report.stressTest.incomeDrop40.monthlyCoverageRatio.toFixed(2)}x`} strokeColor={result.report.stressTest.incomeDrop40.safe ? "#52c41a" : "#ff4d4f"} />
                    <Text type="secondary">收入-40%覆盖率</Text>
                  </Col>
                  <Col xs={24} md={8}>
                    <Progress type="dashboard" percent={Math.min(100, Math.round((result.report.financialBaseline.emergencyRunwayMonths / 12) * 100))} format={() => `${result.report.financialBaseline.emergencyRunwayMonths.toFixed(1)}月`} strokeColor={result.report.stressTest.unemployment6MonthsSafe ? "#52c41a" : "#ff4d4f"} />
                    <Text type="secondary">紧急现金覆盖</Text>
                  </Col>
                </Row>
              </Card>
            </Space>
          )}
        </Col>
      </Row>
    </div>
  );
}
