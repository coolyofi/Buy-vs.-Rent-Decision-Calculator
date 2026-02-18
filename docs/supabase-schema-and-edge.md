# Supabase：登录与数据持久化（当前实现）

当前版本使用 **Supabase Auth + Postgres 表写入**，不依赖 Edge Function 即可完成：
- 登录后自动保存计算历史
- 自动恢复最近一次记录
- 手动保存/加载多个场景（presets）

## 1. 必需环境变量（前端）
`.env.local`：
```bash
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 2. 数据表（最小可用）
```sql
create extension if not exists pgcrypto;

create table if not exists public.calc_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  input_schema_version text not null default '0.1.0',
  input_json jsonb not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_calc_runs_user_created_at
  on public.calc_runs(user_id, created_at desc);

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  input_json jsonb not null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_presets_user_updated_at
  on public.presets(user_id, updated_at desc);
```

## 3. RLS（必须开启）
```sql
alter table public.calc_runs enable row level security;
alter table public.presets enable row level security;

create policy "calc_runs_select_own"
on public.calc_runs
for select
using (auth.uid() = user_id);

create policy "calc_runs_insert_own"
on public.calc_runs
for insert
with check (auth.uid() = user_id);

create policy "presets_select_own"
on public.presets
for select
using (auth.uid() = user_id);

create policy "presets_insert_own"
on public.presets
for insert
with check (auth.uid() = user_id);

create policy "presets_delete_own"
on public.presets
for delete
using (auth.uid() = user_id);
```

## 4. 前端调用路径
实现文件：`lib/supabaseClient.ts`
- `signInWithEmailOtp(email)`：发送邮箱登录链接。
- `getSession()`：读取会话。
- `upsertRun(input, result)`：当前实现为 `insert` 一条新记录。
- `getLatestRun()`：按 `created_at desc` 取最新一条。
- `listPresets()`：读取当前用户全部场景（按 `updated_at` 倒序）。
- `createPreset(name, input, result)`：保存具名场景。
- `deletePreset(id)`：删除场景。

页面逻辑：`app/page.tsx`
- 初始化：若已登录，自动拉取并恢复最近一次输入与结果。
- 每次重算：若已登录，自动保存当前输入和输出。
- 场景卡片：支持“保存当前场景 / 加载 / 删除”。

## 5. OTP 登录配置建议
在 Supabase Dashboard 配置：
- Authentication -> URL Configuration
  - Site URL：你的站点地址
  - Redirect URLs：本地与线上地址（例如 `http://localhost:3000`）

## 6. 可选扩展
- 如果需要“场景更新而非新增”，可增加 `update preset` 接口并维护版本号。
- 如果需要服务端统一计算，可再引入 Edge Function；当前版本已可直接运行。
