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

async function create711Order(token: string, gb: number): Promise<JsonRecord> {
  // Support fractional GB (e.g. 0.001 GB ≈ 1 MB). Convert to whole bytes.
  const flowBytes = BigInt(Math.max(1, Math.round(gb * 1024 * 1024 * 1024))).toString();
  const res = await fetch(`${BASE}/order/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ flow: flowBytes }),
  });
  return (await res.json()) as JsonRecord;
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

// --- Admin: approve order (calls 711 API, saves credentials) ---
export const adminApproveOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);

    const { data: order, error: oerr } = await supabase
      .from("proxy_orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error(oerr.message);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending") throw new Error(`Order already ${order.status}`);

    const { data: config } = await supabase
      .from("app_config")
      .select("proxy_username, proxy_passwd")
      .eq("id", 1)
      .maybeSingle();
    if (!config?.proxy_username || !config?.proxy_passwd) {
      throw new Error("711proxy credentials not configured. Configure in admin Config page first.");
    }

    const token = await fetch711Token(config.proxy_username, config.proxy_passwd);
    const apiRes = await create711Order(token, order.gb_amount);

    if (apiRes.code !== 200 && apiRes.code !== 0) {
      throw new Error(`711proxy order failed: ${apiRes.msg ?? apiRes.error ?? JSON.stringify(apiRes)}`);
    }

    const results = (apiRes.results && typeof apiRes.results === "object" && !Array.isArray(apiRes.results)
      ? (apiRes.results as JsonRecord)
      : apiRes) as JsonRecord;

    const { error: uerr } = await supabase
      .from("proxy_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        order_no: (results.order_no as string) ?? null,
        proxy_username: (results.username as string) ?? null,
        proxy_passwd: (results.passwd as string) ?? null,
        host: (results.host as string) ?? null,
        port: (results.port as string) ?? null,
        proto: (results.proto as string) ?? null,
        un: (results.un as string) ?? null,
        expire: (results.expire as string) ?? null,
        un_flow: (results.un_flow as string) ?? null,
        api_response: apiRes as never,
      })
      .eq("id", order.id);
    if (uerr) throw new Error(uerr.message);

    return { ok: true };
  });

// --- User: refresh own orders' usage from 711proxy live API ---
export const refreshMyOrdersUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;

    const { data: orders, error: oerr } = await supabase
      .from("proxy_orders")
      .select("id, order_no")
      .eq("user_id", context.userId)
      .eq("status", "approved");
    if (oerr) throw new Error(oerr.message);
    if (!orders || orders.length === 0) return { ok: true, refreshed: 0 };

    // Get 711 enterprise creds via SECURITY DEFINER RPC
    const { data: credsRow, error: cerr } = await supabase.rpc("get_711_credentials" as never);
    if (cerr) throw new Error(cerr.message);
    const creds = Array.isArray(credsRow) ? credsRow[0] : credsRow;
    const username = (creds as { username?: string } | null)?.username;
    const passwd = (creds as { passwd?: string } | null)?.passwd;
    if (!username || !passwd) throw new Error("711proxy credentials not configured");

    const token = await fetch711Token(username, passwd);

    let refreshed = 0;
    for (const o of orders) {
      if (!o.order_no) continue;
      try {
        const res = await fetch(`${BASE}/order/?order_no=${encodeURIComponent(o.order_no)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as JsonRecord;
        const r = (json.results && typeof json.results === "object" && !Array.isArray(json.results)
          ? (json.results as JsonRecord)
          : json) as JsonRecord;
        const { error: uerr } = await supabase.rpc("update_my_order_usage" as never, {
          _order_id: o.id,
          _un_flow: (r.un_flow as string) ?? null,
          _un_flow_used: (r.un_flow_used as string) ?? null,
          _expire: (r.expire as string) ?? null,
        } as never);
        if (uerr) {
          console.error("update_my_order_usage failed", o.order_no, uerr.message);
          continue;
        }
        refreshed++;
      } catch (e) {
        console.error("refresh order failed", o.order_no, e);
      }
    }

    return { ok: true, refreshed };
  });

// --- Admin: reject order ---
export const adminRejectOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), note: z.string().optional() }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    const { error } = await supabase
      .from("proxy_orders")
      .update({ status: "rejected", admin_note: data.note ?? null })
      .eq("id", data.orderId)
      .eq("status", "pending");
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
