# Frontend Architecture（当前实现）

## 技术栈
- Next.js 14（App Router）+ TypeScript
- Ant Design v5
- Formily（`@formily/core`, `@formily/react`, `@formily/antd-v5`）
- Supabase JS（OTP 登录 + 数据持久化）

## 目录与职责
- `app/page.tsx`
  - 四阶段 UX（Stage1~Stage4）
  - 结果仪表盘（KPI、现金流、NAV、成本拆解、热力图）
  - Supabase 登录/恢复入口
- `app/components/FieldMappings.ts`, `app/components/GroupCard.tsx`
  - Formily 字段映射与渲染
- `lib/schema.ts`
  - 从 `schema/model-schema.json` 构建 Formily schema
  - 暴露 `STAGE2_CARD_LAYOUT`（基础建模卡片）
- `lib/calc.ts`
  - 计算主引擎（兼容口径 + NAV 口径）
- `lib/policyProfiles.ts`
  - 城市政策自动注入
- `lib/supabaseClient.ts`
  - 客户端实例、OTP 登录、读写 `calc_runs` 与 `presets`

## 页面流程

### Stage 1：悬念预告
- 输入：城市、首二套、总价、面积
- 输出：政策预告与波动提示，不给最终结论

### Stage 2：现实基石
- 约 20 项核心输入，按 4 张卡片完成
- 完成后生成首版报告

### Stage 3：核心精算
- 滑杆快速调整高敏感参数：`g_p/g_r/R_inv/Invest_consistency`
- 立即重算并刷新报告

### Stage 4：Geek Mode
- Formily 分步编辑 163 参数
- 提交后重算

## 数据模型（前端使用）
`ModelOutput` 分两层：
- 兼容层：`buyTotal/rentTotal/diff/recommendation`
- 新层：`wealthView`
  - `yearly_networth`（真实 NAV 曲线）
  - `monthly_cashflow`（月度现金流）
  - `sensitivity_matrix`（热力图矩阵）

## 图表数据来源
- 现金流图：`wealthView.monthly_cashflow` 聚合为年度
- NAV 曲线：`wealthView.yearly_networth`
- 热力图：`wealthView.sensitivity_matrix.wealth_gap_matrix`
- KPI：兼容字段 + `wealthView.buyNAV/rentNAV/navDiff`

## Supabase 集成（前端）
- 登录：邮箱 OTP（`signInWithEmailOtp`）
- 持久化：每次重算后 `upsertRun(input, result)` 插入 `calc_runs`
- 恢复：页面初始化 `getLatestRun()` 读取当前用户最近记录并恢复
- Presets：`createPreset/listPresets/deletePreset` 支持手动场景管理
- 环境变量：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 状态策略
- 页面级状态由 React `useState/useMemo/useEffect` 管理。
- 不依赖外部全局状态库（当前版本）。
- `sessionReady/isLoggedIn/authMessage` 控制登录区域与恢复提示。
