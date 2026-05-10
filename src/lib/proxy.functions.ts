import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const BASE = "https://server.711proxy.com/eapi";

type ApiResult = { status: number; ok: boolean; body: JsonValue };

async function callApi(
  path: string,
  init: { method: "GET" | "POST"; token?: string; body?: unknown },
): Promise<ApiResult> {
  try {
    const url = new URL(`${BASE}/${path}/`);
    if (init.token && init.method === "GET") {
      url.searchParams.set("token", init.token);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (init.token) headers["token"] = init.token;

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

// --- Token ---
export const getProxyToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ username: z.string().min(1), passwd: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => callApi("token", { method: "POST", body: data }));

// --- Enterprise Balance ---
export const getEnterpriseBalance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => callApi("balance", { method: "GET", token: data.token }));

// --- Create Order ---
export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().min(1),
        flow: z.number().int().positive(), // GB amount
        days: z.number().int().positive().optional(),
        product_type: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { token, ...payload } = data;
    return callApi("order", { method: "POST", token, body: payload });
  });

// --- Whitelist (add user/IP) ---
export const addWhitelist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(1), ip: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { token, ip } = data;
    return callApi("whitelist", { method: "POST", token, body: { ip } });
  });
