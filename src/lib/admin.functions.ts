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
  const flowBytes = (BigInt(gb) * BigInt(1024) * BigInt(1024) * BigInt(1024)).toString();
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

// --- Public: get pricing (anon-readable via separate client) ---
export const getPublicPricing = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb
    .from("app_config")
    .select("price_per_gb_usdt, usdt_address, usdt_network")
    .eq("id", 1)
    .maybeSingle();
  return data;
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
