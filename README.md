# 买房与租房决策系统

面向上海/北京的买房与租房决策工具，基于 **163 参数模型**、**分阶段交互** 与 **期末净资产口径**。

## 当前能力
- 四阶段建模流程：悬念预告 -> 基础建模 -> 核心精算 -> 高级模式。
- 城市政策自动注入：`lib/policyProfiles.ts`（首套/二套、多子女、绿色建筑等）。
- 计算引擎：`lib/calc.ts`
  - 兼容字段：`buyTotal`、`rentTotal`、`diff`（总成本口径）
  - 主决策字段：`wealthView`（净资产、月度现金流、年度净资产、敏感性矩阵）
  - 默认不计入“专家参数”附加项，只有进入“高级模式”并应用后才纳入计算
  - 城市政策参数自动应用且锁定，用户无需手动填写
- 登录与数据保留（可选）：邮箱验证码登录后自动保存计算历史，支持最近记录恢复与多场景保存。

## 本地运行
1. 安装依赖
```bash
npm install
```
2. 启动开发环境
```bash
npm run dev
```
3. 打开 `http://localhost:3000`

## 云端登录与数据保存（可选）
未配置云端服务也可本地使用；配置后启用登录与云端数据保留（基于 Supabase）。

### 1) 环境变量
创建 `.env.local`：
```bash
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase 地址
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的匿名访问密钥
```

### 2) 建表与权限
执行 `docs/supabase-schema-and-edge.md` 中的 SQL（`calc_runs`、`presets` 及对应 RLS 策略）。

### 3) 使用方式
- 页面左侧「账号与云端保存」支持邮箱验证码登录。
- 登录后每次重算自动写入 `calc_runs`。
- 页面初始化会恢复当前用户最近一条记录。
- 页面左侧「场景保存」支持保存、加载、删除多个具名场景。

## 文档索引
- 模型规范：`model-spec.md`
- 前端架构：`docs/frontend-architecture.md`
- 城市政策引擎：`docs/city-policy-engine.md`
- Supabase 表结构与权限：`docs/supabase-schema-and-edge.md`
