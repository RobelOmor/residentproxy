import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = { [key: string]: JsonValue };


const BASE = "https://server.711proxy.com/eapi";

type ApiResult = { status: number; ok: boolean; body: JsonValue };

async function assertAdmin(context: { supabase: unknown; userId: string }) {
  const sb = context.supabase as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
  };
  const { data, error } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function callApi(
  path: string,
  init: { method: "GET" | "POST"; token?: string; body?: unknown },
): Promise<ApiResult> {
  try {
    const url = new URL(`${BASE}/${path}/`);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (init.token) headers["Authorization"] = `Bearer ${init.token}`;

    const res = await fetch(url.toString(), {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let json: JsonValue;
    try {
      json = JSON.parse(text) as JsonValue;
    } catch {
      json = { raw: text };
    }
    return { status: res.status, ok: res.ok, body: json };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: { error: error instanceof Error ? error.message : "Request failed" },
    };
  }
}

// --- Token (admin only) ---
export const getProxyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().min(1).max(128), passwd: z.string().min(1).max(256) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return callApi("token", { method: "POST", body: data });
  });

// --- Enterprise Balance (admin only) ---
export const getEnterpriseBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(2048) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return callApi("balance", { method: "GET", token: data.token });
  });

// --- Create Order (admin only) ---
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(1).max(2048),
        flow: z.number().int().positive().max(1024 * 1024),
        expire: z.string().max(64).optional(),
        host: z.string().max(256).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { token, flow, expire, host } = data;
    const flowBytes = (BigInt(flow) * BigInt(1024) * BigInt(1024) * BigInt(1024)).toString();
    const payload: Record<string, string> = { flow: flowBytes };
    if (expire) payload.expire = expire;
    if (host) payload.host = host;
    return callApi("order", { method: "POST", token, body: payload });
  });

// --- Whitelist (admin only) ---
export const addWhitelist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1).max(2048), ip: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { token, ip } = data;
    return callApi("whitelist", { method: "POST", token, body: { ip } });
  });

// --- User: purchase proxy with balance + auto-provision via 711proxy enterprise API ---
// Flow:
//   1. RPC purchase_proxy_with_balance (deducts balance, creates pending order)
//   2. Mint a fresh token from stored enterprise creds (no expiry issue)
//   3. POST /eapi/order/ with flow bytes + expire (30d)
//   4. On success: supabaseAdmin updates the order -> approved with real proxy details
//   5. On failure: supabaseAdmin refunds the balance & deletes the pending order
export const purchaseProxyAuto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      gb: z.number().positive().max(1024),
      cost: z.number().positive().max(100000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const userId = context.userId;

    // 1) Deduct balance + create pending order (as user, respects RLS)
    const { data: orderIdRaw, error: rpcErr } = await sb.rpc("purchase_proxy_with_balance", {
      _gb: data.gb,
      _cost: data.cost,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const orderId = String(orderIdRaw ?? "");
    if (!orderId) throw new Error("Order could not be created");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Helper to refund + drop the pending order
    const refund = async (reason: string): Promise<never> => {
      try {
        const { data: o } = await supabaseAdmin
          .from("proxy_orders")
          .select("cost_usdt, user_id")
          .eq("id", orderId)
          .maybeSingle();
        if (o) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("balance_usdt")
            .eq("id", o.user_id)
            .maybeSingle();
          const current = Number(prof?.balance_usdt ?? 0);
          await supabaseAdmin
            .from("profiles")
            .update({ balance_usdt: current + Number(o.cost_usdt) })
            .eq("id", o.user_id);
        }
        await supabaseAdmin.from("proxy_orders").delete().eq("id", orderId);
      } catch {
        // best-effort cleanup
      }
      throw new Error(reason);
    };

    // 2) Read enterprise creds
    const { data: cfg } = await supabaseAdmin
      .from("app_config")
      .select("proxy_username, proxy_passwd")
      .eq("id", 1)
      .maybeSingle();
    const eu = cfg?.proxy_username?.trim();
    const ep = cfg?.proxy_passwd?.trim();
    if (!eu || !ep) {
      await refund("Auto-provisioning is not configured. Admin must set 711proxy enterprise credentials in Config.");
    }

    // 3) Mint token (fresh on every order, never expires from caller's perspective)
    const tokRes = await fetch(`${BASE}/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: eu, passwd: ep }),
    });
    let tokJson: JsonRecord = {};
    try { tokJson = await tokRes.json() as JsonRecord; } catch { /* ignore */ }
    const token = ((tokJson.results as JsonRecord | undefined)?.token) as string | undefined;
    if (!token) {
      await refund(`711proxy login failed: ${String(tokJson.message ?? `HTTP ${tokRes.status}`)}`);
    }

    // 4) Create order
    const flowBytes = (BigInt(Math.round(data.gb * 1024 * 1024 * 1024))).toString();
    const expireUnix = Math.floor(Date.now() / 1000) + 90 * 86400;
    const orderRes = await fetch(`${BASE}/order/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ flow: flowBytes, expire: String(expireUnix) }),
    });
    let orderJson: JsonRecord = {};
    try { orderJson = await orderRes.json() as JsonRecord; } catch { /* ignore */ }
    if (!orderRes.ok || (typeof orderJson.code === "number" && orderJson.code !== 0)) {
      await refund(`711proxy order creation failed: ${String(orderJson.message ?? `HTTP ${orderRes.status}`)}`);
    }

    const r = ((orderJson.results as JsonRecord | undefined) ?? orderJson) as JsonRecord;
    const pick = (...keys: string[]): string | null => {
      for (const k of keys) {
        const v = r[k];
        if (v != null && v !== "") return String(v);
      }
      return null;
    };

    const orderNo = pick("order_no", "orderNo", "order_id");
    const suname = pick("un_user", "username", "suname", "user", "name") ?? orderNo;
    const passwd = pick("un_passwd", "password", "passwd", "pass");
    const host = pick("un_host", "host") ?? "global.rotgb.711proxy.com";
    const port = pick("un_port", "port") ?? "10000";
    const proto = pick("proto", "protocol") ?? "http";
    const unFlow = pick("un_flow") ?? flowBytes;
    const unFlowUsed = pick("un_flow_used") ?? "0";
    const expire = pick("expire") ?? String(expireUnix);
    const un = pick("un") ?? (suname && passwd ? `${suname}:${passwd}@${host}:${port}` : null);

    if (!suname || !passwd) {
      await refund("711proxy returned an unexpected response — no credentials issued. Please contact support.");
    }

    // 5) Mark order approved with real provisioning
    const { error: updErr } = await supabaseAdmin
      .from("proxy_orders")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        order_no: orderNo ?? suname,
        proxy_username: suname,
        proxy_passwd: passwd,
        host,
        port,
        proto,
        un,
        un_flow: unFlow,
        un_flow_used: unFlowUsed,
        expire,
      })
      .eq("id", orderId);
    if (updErr) {
      // Provisioned on 711 but couldn't save — don't refund; surface error so admin can recover.
      throw new Error(`Provisioned on 711proxy but failed to save: ${updErr.message}. Contact support with order_no ${orderNo ?? suname}.`);
    }

    return { ok: true as const, orderId, orderNo: orderNo ?? suname };
  });

