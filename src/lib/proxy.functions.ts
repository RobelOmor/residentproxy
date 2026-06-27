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

  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

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
