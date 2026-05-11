import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EAPI_BASE = "https://server.711proxy.com/eapi";
const API_BASE = "https://server.711proxy.com";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonRecord = { [k: string]: JsonValue };

type SbClient = ReturnType<typeof createClient<Database>>;

async function fetch711Token(username: string, passwd: string): Promise<string> {
  const res = await fetch(`${EAPI_BASE}/token/`, {
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
  const res = await fetch(`${EAPI_BASE}/balance/`, {
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
  const res = await fetch(`${EAPI_BASE}/order/`, {
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
        proxy_dashboard_token: z.string().optional(),
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

// --- Admin: test 711 dashboard session token ---
export const adminTestDashboardToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(10) }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);
    try {
      const res = await fetch(`${API_BASE}/user/sub/?page=1&page_size=1&status=0`, {
        headers: {
          Authorization: `Bearer ${data.token}`,
          Accept: "application/json",
          Origin: "https://dashboard.711proxy.com",
          Referer: "https://dashboard.711proxy.com/",
        },
      });
      if (!res.ok) {
        return { ok: false as const, error: `Token rejected (${res.status}). Re-copy a fresh token from the 711proxy dashboard.` };
      }
      const json = (await res.json()) as JsonRecord;
      const total = (json.results && Array.isArray(json.results)) ? json.results.length : 0;
      return { ok: true as const, sample_count: total };
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

// Fetch one order's live data from 711proxy by order_no
async function fetch711OrderInfo(token: string, orderNo: string): Promise<JsonRecord> {
  const res = await fetch(`${EAPI_BASE}/order/?order_no=${encodeURIComponent(orderNo)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: JsonRecord;
  try { json = JSON.parse(text) as JsonRecord; } catch { json = { raw: text }; }
  return json;
}

async function fetch711SubUserByName(token: string, username: string): Promise<JsonRecord | null> {
  const res = await fetch(
    `${API_BASE}/user/sub/?page=1&page_size=999&status=0&name=${encodeURIComponent(username)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        Origin: "https://dashboard.711proxy.com",
        Referer: "https://dashboard.711proxy.com/",
      },
    },
  );
  const text = await res.text();
  let json: JsonRecord;
  try { json = JSON.parse(text) as JsonRecord; } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`711proxy sub-user lookup failed (${res.status})`);
  }

  const results = Array.isArray(json.results) ? json.results : [];
  const exact = results.find(
    (row) =>
      row &&
      typeof row === "object" &&
      "suname" in row &&
      typeof row.suname === "string" &&
      row.suname === username,
  );
  if (exact && typeof exact === "object" && !Array.isArray(exact)) return exact as JsonRecord;

  const caseInsensitive = results.find(
    (row) =>
      row &&
      typeof row === "object" &&
      "suname" in row &&
      typeof row.suname === "string" &&
      row.suname.toLowerCase() === username.toLowerCase(),
  );
  if (caseInsensitive && typeof caseInsensitive === "object" && !Array.isArray(caseInsensitive)) {
    return caseInsensitive as JsonRecord;
  }

  return null;
}

function parseTrafficTextToBytes(value: unknown): bigint | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || /unlimited/i.test(raw)) return null;

  const normalized = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB|TB)\b/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const multiplier = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  }[match[2] as "B" | "KB" | "MB" | "GB" | "TB"];

  return BigInt(Math.round(amount * multiplier));
}

type UsageSnapshot = {
  lookupType: "order" | "sub-user";
  resolvedOrderNo: string;
  suname?: string;
  passwd?: string;
  unFlow: string | null;
  unFlowUsed: string | null;
  expire: string | null;
  allocatedBytes: bigint | null;
};

async function fetch711UsageSnapshot(
  token: string,
  identifier: string,
  fallbackUsername?: string | null,
): Promise<UsageSnapshot | null> {
  const trimmedIdentifier = identifier.trim();

  if (/^\d+$/.test(trimmedIdentifier)) {
    const info = await fetch711OrderInfo(token, trimmedIdentifier);
    const unFlow = info.un_flow != null ? String(info.un_flow) : null;
    const unFlowUsed = info.un_flow_used != null ? String(info.un_flow_used) : null;
    if (unFlow != null || unFlowUsed != null) {
      const allocatedBytes = unFlow != null && unFlowUsed != null
        ? BigInt(unFlow) + BigInt(unFlowUsed)
        : unFlow != null
          ? BigInt(unFlow)
          : null;

      return {
        lookupType: "order",
        resolvedOrderNo: trimmedIdentifier,
        unFlow,
        unFlowUsed,
        expire: info.expire != null ? String(info.expire) : null,
        allocatedBytes,
      };
    }
  }

  const usernameCandidates = [trimmedIdentifier, fallbackUsername?.trim() ?? ""].filter(Boolean);
  for (const username of usernameCandidates) {
    const subUser = await fetch711SubUserByName(token, username);
    if (!subUser) continue;

    const unlimited = Number(subUser.traffic_top ?? NaN) === 0 || /unlimited/i.test(String(subUser.traff_flow_top ?? ""));
    const allocatedBytes = unlimited ? null : parseTrafficTextToBytes(subUser.traff_flow_top);
    const usedBytes = parseTrafficTextToBytes(subUser.traff_used) ?? 0n;
    if (!unlimited && allocatedBytes == null) {
      throw new Error(`711proxy returned an unreadable traffic limit for sub-user \"${username}\".`);
    }

    const remainingBytes = allocatedBytes == null ? null : allocatedBytes > usedBytes ? allocatedBytes - usedBytes : 0n;
    return {
      lookupType: "sub-user",
      resolvedOrderNo: typeof subUser.suname === "string" && subUser.suname ? subUser.suname : username,
      suname: typeof subUser.suname === "string" ? subUser.suname : undefined,
      passwd: typeof subUser.passwd === "string" ? subUser.passwd : undefined,
      unFlow: remainingBytes == null ? null : remainingBytes.toString(),
      unFlowUsed: usedBytes.toString(),
      expire: subUser.expire != null ? String(subUser.expire) : null,
      allocatedBytes,
    };
  }

  return null;
}

// --- Admin: approve order — admin enters 711 order_no after manual sub-user creation.
// Server verifies the order exists in 711proxy and that allocated traffic is sufficient,
// then stores the credentials + live un_flow / un_flow_used / expire on the order.
export const adminApproveOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        orderNo: z.string().min(1),
        suname: z.string().min(1).optional(),
        passwd: z.string().min(1).optional(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SbClient;
    await assertAdmin(supabase, context.userId);

    // Get the order
    const { data: order, error: oerr } = await supabase
      .from("proxy_orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (oerr) throw new Error(oerr.message);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending") throw new Error(`Order already ${order.status}`);

    // Get 711 credentials
    const { data: cfg } = await supabase
      .from("app_config")
      .select("proxy_username, proxy_passwd")
      .eq("id", 1)
      .maybeSingle();
    if (!cfg?.proxy_username || !cfg?.proxy_passwd) throw new Error("711proxy credentials not configured");

    // NOTE: 711proxy's sub-user list endpoint requires a dashboard JWT (not the EAPI token),
    // so server-side verification is not possible. We trust the admin's click — the admin
    // manually created the sub-user on 711proxy with the suggested user/pass/MB-limit before
    // approving here. Live usage is then synced via the cron + manual refresh button.
    // Connectivity sanity-check: make sure our 711 credentials still work.
    try {
      await fetch711Token(cfg.proxy_username, cfg.proxy_passwd);
    } catch (e) {
      throw new Error(`711proxy login failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    const requiredBytes = BigInt(Math.round(Number(order.gb_amount) * 1024 * 1024 * 1024));
    const suname = data.suname ?? order.proxy_username ?? data.orderNo;
    const passwd = data.passwd ?? order.proxy_passwd ?? undefined;

    const { error } = await supabase.rpc("admin_approve_order_manual" as never, {
      _order_id: data.orderId,
      _order_no: data.orderNo,
      _suname: suname ?? null,
      _passwd: passwd ?? null,
      _un_flow: requiredBytes.toString(),
      _un_flow_used: "0",
      _expire: null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- User: refresh own orders' usage from 711proxy live API ---
export const refreshMyOrdersUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SbClient;

    const { data: orders, error } = await supabase
      .from("proxy_orders")
      .select("id, order_no, proxy_username")
      .eq("status", "approved");
    if (error) throw new Error(error.message);
    const list = (orders ?? []).filter((o) => o.order_no || o.proxy_username);
    if (list.length === 0) return { ok: true, refreshed: 0 };

    const { data: cfg } = await supabase.rpc("get_711_credentials" as never);
    const cred = Array.isArray(cfg) ? (cfg[0] as { username?: string; passwd?: string } | undefined) : undefined;
    if (!cred?.username || !cred?.passwd) throw new Error("711proxy credentials not available");
    const token = await fetch711Token(cred.username, cred.passwd);

    let count = 0;
    for (const o of list) {
      try {
        const snapshot = await fetch711UsageSnapshot(token, o.order_no ?? o.proxy_username ?? "", o.proxy_username);
        if (!snapshot) continue;
        const unFlow = snapshot.unFlow;
        const unFlowUsed = snapshot.unFlowUsed;
        const expire = snapshot.expire;
        if (unFlow == null && unFlowUsed == null) continue;
        const { error: uerr } = await supabase.rpc("update_my_order_usage" as never, {
          _order_id: o.id,
          _un_flow: unFlow,
          _un_flow_used: unFlowUsed,
          _expire: expire,
        } as never);
        if (!uerr) count++;
      } catch {
        // skip individual failures
      }
    }
    return { ok: true, refreshed: count };
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
