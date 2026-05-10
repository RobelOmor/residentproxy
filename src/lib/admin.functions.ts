import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BASE = "https://server.711proxy.com/eapi";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonRecord = { [k: string]: JsonValue };

type SbClient = ReturnType<typeof createClient<Database>>;

async function fetch711Token(username: string, passwd: string): Promise<string> {
  const res = await fetch(`${BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passwd }),
  });
  const json = (await res.json()) as { code?: number; message?: string; results?: { token?: string } };
  const token = json.results?.token;
  if (typeof token !== "string") {
    throw new Error(json.message ?? `711proxy login failed (code ${json.code ?? "?"})`);
  }
  return token;
}

async function fetch711Balance(token: string): Promise<JsonRecord> {
  const res = await fetch(`${BASE}/balance/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as JsonRecord;
  if (json && typeof json === "object" && json.results && typeof json.results === "object" && !Array.isArray(json.results)) {
    return { ...(json.results as JsonRecord), _code: (json.code as JsonValue) ?? null, _message: (json.message as JsonValue) ?? null };
  }
  return json;
}

// Create order (allocates traffic from enterprise pool, returns auto-generated user:pass).
// Endpoint: POST /eapi/order/ — body: { flow (bytes string), expire (unix-sec string), host? }
async function create711Order(
  token: string,
  flowBytes: string,
  expireUnixSec: string,
): Promise<JsonRecord> {
  const res = await fetch(`${BASE}/order/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ flow: flowBytes, expire: expireUnixSec }),
  });
  const text = await res.text();
  let json: JsonRecord;
  try { json = JSON.parse(text) as JsonRecord; } catch { json = { raw: text }; }
  return { ...json, _http_status: res.status };
}

async function assertAdmin(supabase: SbClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// --- Admin: get config + live balance ---
export const adminGetConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    const { data: config, error } = await supabase
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    let balance: JsonRecord | null = null;
    if (config?.proxy_username && config?.proxy_passwd) {
      try {
        const tok = await fetch711Token(config.proxy_username, config.proxy_passwd);
        balance = await fetch711Balance(tok);
      } catch (e) {
        balance = { error: e instanceof Error ? e.message : "balance fetch failed" };
      }
    }
    return { config, balance };
  });

// --- Admin: save config ---
export const adminSaveConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        proxy_username: z.string().optional(),
        proxy_passwd: z.string().optional(),
        price_per_gb_usdt: z.number().positive().optional(),
        usdt_address: z.string().optional(),
        usdt_network: z.string().optional(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    const { error } = await supabase
      .from("app_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Admin: test 711 credentials without saving ---
export const adminTest711 = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().min(1), passwd: z.string().min(1) }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    try {
      const token = await fetch711Token(data.username, data.passwd);
      const balance = await fetch711Balance(token);
      return { ok: true as const, balance };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Connection failed" };
    }
  });

// --- Public: get pricing via SECURITY DEFINER RPC (no auth required) ---
export const getPublicPricing = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.rpc("get_public_pricing");
  if (error) {
    console.error("get_public_pricing rpc error:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
});

// --- Admin: list all orders + users ---
export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    const { data: orders, error } = await supabase
      .from("proxy_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: profiles } = await supabase.from("profiles").select("id, email, display_name");
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      orders: (orders ?? []).map((o) => ({
        ...o,
        user_email: profileMap.get(o.user_id)?.email ?? "unknown",
      })),
    };
  });

// --- Admin: approve order — assigns a pre-created sub-user from the pool ---
export const adminApproveOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    const { data: res, error } = await supabase.rpc(
      "admin_assign_sub_user_to_order" as never,
      { _order_id: data.orderId } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, result: res };
  });

// --- User: refresh own orders' usage from sub-user pool (admin-maintained) ---
// Note: 711proxy EAPI has no public per-sub-user usage endpoint, so admins
// enter mb_used into the pool from the 711 dashboard; this RPC propagates it.
export const refreshMyOrdersUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;
    const { data, error } = await supabase.rpc("sync_my_orders_usage_from_pool" as never);
    if (error) throw new Error(error.message);
    return { ok: true, refreshed: Number(data ?? 0) };
  });

// --- Admin: reject order (auto-refunds balance if paid from balance) ---
export const adminRejectOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), note: z.string().optional() }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    const { error } = await supabase.rpc("admin_reject_order_refund" as never, {
      _order_id: data.orderId,
      _note: data.note ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Admin: list all topup requests ---
export const adminListTopups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    const { data: topups, error } = await supabase
      .from("topup_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: profiles } = await supabase.from("profiles").select("id, email, balance_usdt");
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      topups: (topups ?? []).map((t) => ({
        ...t,
        user_email: map.get(t.user_id)?.email ?? "unknown",
        user_balance: Number(map.get(t.user_id)?.balance_usdt ?? 0),
      })),
    };
  });

export const adminApproveTopup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ topupId: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    const { error } = await supabase.rpc("admin_approve_topup" as never, { _topup_id: data.topupId } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRejectTopup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ topupId: z.string().uuid(), note: z.string().optional() }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    const { error } = await supabase.rpc("admin_reject_topup" as never, {
      _topup_id: data.topupId,
      _note: data.note ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
