import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://server.711proxy.com/eapi";

type JsonRecord = Record<string, unknown>;

async function fetch711Token(username: string, passwd: string): Promise<string> {
  const res = await fetch(`${BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passwd }),
  });
  const json = (await res.json()) as JsonRecord;
  const results = json.results as JsonRecord | null;
  const token = results?.token;
  if (typeof token !== "string") {
    throw new Error(`711proxy login failed: ${JSON.stringify(json)}`);
  }
  return token;
}

async function fetch711Balance(token: string) {
  const res = await fetch(`${BASE}/balance/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json()) as JsonRecord;
}

async function create711Order(token: string, gb: number) {
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

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
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
    await assertAdmin(context.userId);
    const { data: config } = await supabaseAdmin
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .single();
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
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("app_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Public: get pricing ---
export const getPublicPricing = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("price_per_gb_usdt, usdt_address, usdt_network")
    .eq("id", 1)
    .single();
  return data;
});

// --- Admin: list all orders + users ---
export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: orders } = await supabaseAdmin
      .from("proxy_orders")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, email, display_name");
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
    await assertAdmin(context.userId);

    const { data: order, error: oerr } = await supabaseAdmin
      .from("proxy_orders")
      .select("*")
      .eq("id", data.orderId)
      .single();
    if (oerr || !order) throw new Error("Order not found");
    if (order.status !== "pending") throw new Error(`Order already ${order.status}`);

    const { data: config } = await supabaseAdmin
      .from("app_config")
      .select("proxy_username, proxy_passwd")
      .eq("id", 1)
      .single();
    if (!config?.proxy_username || !config?.proxy_passwd) {
      throw new Error("711proxy credentials not configured. Configure in admin Config page first.");
    }

    const token = await fetch711Token(config.proxy_username, config.proxy_passwd);
    const apiRes = await create711Order(token, order.gb_amount);

    if (apiRes.code !== 200 && apiRes.code !== 0) {
      throw new Error(`711proxy order failed: ${apiRes.msg ?? apiRes.error ?? JSON.stringify(apiRes)}`);
    }

    const { error: uerr } = await supabaseAdmin
      .from("proxy_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        order_no: (apiRes.order_no as string) ?? null,
        proxy_username: (apiRes.username as string) ?? null,
        proxy_passwd: (apiRes.passwd as string) ?? null,
        host: (apiRes.host as string) ?? null,
        port: (apiRes.port as string) ?? null,
        proto: (apiRes.proto as string) ?? null,
        un: (apiRes.un as string) ?? null,
        expire: (apiRes.expire as string) ?? null,
        un_flow: (apiRes.un_flow as string) ?? null,
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
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("proxy_orders")
      .update({ status: "rejected", admin_note: data.note ?? null })
      .eq("id", data.orderId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
