import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  cachedClient = createClient(url, anonKey);
  return cachedClient;
}

export interface PersistedRunRow {
  id: string;
  user_id: string;
  input_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  created_at: string;
}

export interface PresetRow {
  id: string;
  user_id: string;
  name: string;
  input_json: Record<string, unknown>;
  result_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function signInWithEmailOtp(email: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 未配置");
  return supabase.auth.signInWithOtp({ email });
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function upsertRun(input: Record<string, unknown>, result: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("calc_runs").insert({
    user_id: user.id,
    input_json: input,
    result_json: result,
    input_schema_version: "0.1.0",
  });
}

export async function getLatestRun(): Promise<PersistedRunRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("calc_runs")
    .select("id,user_id,input_json,result_json,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PersistedRunRow | null) ?? null;
}

export async function listPresets(): Promise<PresetRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("presets")
    .select("id,user_id,name,input_json,result_json,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return (data as PresetRow[] | null) ?? [];
}

export async function createPreset(
  name: string,
  input: Record<string, unknown>,
  result: Record<string, unknown> | null = null
) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 未配置");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("用户未登录");
  const { error, data } = await supabase
    .from("presets")
    .insert({
      user_id: user.id,
      name: name.trim(),
      input_json: input,
      result_json: result,
    })
    .select("id,user_id,name,input_json,result_json,created_at,updated_at")
    .single();
  if (error) throw error;
  return data as PresetRow;
}

export async function deletePreset(id: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 未配置");
  const { error } = await supabase.from("presets").delete().eq("id", id);
  if (error) throw error;
}
