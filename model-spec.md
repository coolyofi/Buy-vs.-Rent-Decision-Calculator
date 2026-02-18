# 模型规范（当前实现）

本文档对应当前代码实现：`lib/calc.ts` 与 `app/page.tsx`。

## 1. 总体目标
- 不要求用户一次填完全部参数，也能得到可信结论。
- 同时保留“兼容口径”和“净资产口径”，避免旧页面断裂。
- 所有关键图表数据直接来自模型计算，不使用前端估算。

## 2. 两套输出口径

### 2.1 兼容口径（沿用）
- `buyTotal`：买房总成本（元）
- `rentTotal`：租房总成本（元）
- `diff`：总成本差额（元，买房 - 租房）

### 2.2 主决策口径（新增）
- `wealthView.buyNAV`：买房期末净资产（元）
- `wealthView.rentNAV`：租房期末净资产（元）
- `wealthView.navDiff`：净资产差额（元，买房 - 租房）

## 2.1 专家参数启用规则
- 默认计算不纳入专家扩展项（如隐藏摩擦成本、附加中介、押金机会成本等）。
- 仅当用户在“高级模式”提交后，`expert_configured=true`，才启用专家扩展项。
- 目的：避免用户未配置高级参数时出现“来源不明的大额成本”。

## 3. 交互流程（页面）
- 阶段一：悬念预告（城市/套数/总价/面积）
- 阶段二：基础建模（约 20 项核心参数）
- 阶段三：核心精算（关键参数滑杆）
- 阶段四：高级模式（全量参数微调）

## 4. 政策引擎
来源：`deriveEffectivePolicy(input)`（`lib/policyProfiles.ts`）

当前支持：上海、北京。

自动注入：
- 首付下限
- 商贷利率基线与加点
- 公积金利率（首套/二套）
- 契税分档
- 增值税免征年限
- 公积金额度上限（单人/家庭/多子女）

这些政策参数在前端按“自动应用”展示，不允许手工修改。

## 5. 核心计算链路

### 5.1 贷款结构与成本
- `totalLoanNeeded = P * (1 - dpMin)`
- `L_gjj = min(totalLoanNeeded * mixRatio, gjjCapWan)`
- `L_com = max(0, totalLoanNeeded - L_gjj)`
- 一次性成本 = 首付 + 税费 + 装修 + 交易摩擦

### 5.2 月度时序模拟
模型按月循环，核心包含：
- 买租两侧流动资金按 `R_inv/12` 复利
- 租金按 `g_r` 年化增长
- 月度现金流差额按 `Invest_consistency` 进入投资池
  - 输入兼容 `0~1` 与 `0~100` 两种格式（`70` 会按 `70%` 处理）
- 每 12 个月输出年度净资产截面

当前已纳入的关键字段（含近期补齐）：
- 还款方式：`Repay_type`（等额本息/等额本金）
- 个税抵扣：`Deduct_limit`
- 现金安全阈值：`Cash_runway_months`
- 高级模式持有成本：`PM_growth`、`Maintenance_yearly`、`PropertyTax_rate`、`Insurance`、`Parking_mgmt`、`Broadband`、`Energy_premium`、`Large_replace`
- 高级模式租房扩展：`Rent_tax_rate`、`Residence_fee`、`GJJ_rent_cap`、`Commute_delta`、`CPI`

### 5.3 年度净资产
- 买房净资产 = 房屋市值 - 剩余贷款 - 卖出成本 + 买方流动资产
- 租房净资产 = 租方流动资产

## 6. 图表数据（全部同源）

### 6.1 月度现金流
`wealthView.monthly_cashflow[]`
- `month`
- `buyOutflow`
- `rentOutflow`
- `navGap`

### 6.2 年度净资产
`wealthView.yearly_networth[]`
- `year`
- `buyNAV`
- `rentNAV`

### 6.3 敏感性热力图
`wealthView.sensitivity_matrix`
- `house_growth_rates`
- `rent_growth_rates`
- `wealth_gap_matrix`（终值净资产差，元）

## 7. 关键衍生指标

### 7.1 `crossoverYear`（净资产口径）
来自 `yearly_networth`：
- 找到第一个 `buyNAV >= rentNAV` 的年份。
- 若不存在，返回 `null`。

### 7.2 `breakEvenGrowth`（与热力图同源）
使用同一套 `sensitivity_matrix`：
1. 固定当前租金增长率，在矩阵上对租金维度插值。
2. 获得“房价增长率 -> 净资产差”的曲线。
3. 对 0 交点线性插值，得到房价平衡增速。
4. 若无交点，返回边界值。

## 8. 场景输出
`report.netWorthComparison.scenarios` 包含三情景：
- 偏弱情景（Bear）
- 基准情景（Base）
- 偏强情景（Bull）

三者均基于同一时序函数重算，不走独立估算公式。

## 9. 单位约定
- 输入支持“元/万元”混合，内部通过转换函数统一。
- `wealthView` 和报告输出大多为“元”。
- 前端可展示为“万元 + 元”双格式。

## 10. 代码映射
- 核心计算：`lib/calc.ts`
- 页面交互与仪表盘：`app/page.tsx`
- 表单分层与字段映射：`lib/schema.ts`
- 政策注入：`lib/policyProfiles.ts`
- 登录与持久化：`lib/supabaseClient.ts`

## 11. 调试模式（参数影响分解）
- 页面结果区内置“参数影响分解（全量）”调试表。
- 计算方法：对每个参数做一次微小扰动，重跑模型并记录差值：
  - `净资产差额变化（deltaNavDiff）`
  - `买房总成本变化（deltaBuyTotal）`
  - `租房总成本变化（deltaRentTotal）`
- 调试重算使用 `__debug_fast=true` 口径，避免重复执行完整敏感性矩阵，保障页面可用性。
