import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const EAPI_BASE = "https://server.711proxy.com/eapi";
const API_BASE = "https://server.711proxy.com";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonRecord = { [k: string]: JsonValue };

async function fetch711Token(username: string, passwd: string): Promise<string> {
  const res = await fetch(`${EAPI_BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, passwd }),
  });
  const json = (await res.json()) as { code?: number; message?: string; results?: { token?: string } };
  const token = json.results?.token;
  if (typeof token !== "string") throw new Error(json.message ?? "711 login failed");
  return token;
}

async function fetch711OrderInfo(token: string, orderNo: string): Promise<JsonRecord> {
  const res = await fetch(`${EAPI_BASE}/order/?order_no=${encodeURIComponent(orderNo)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  try { return JSON.parse(text) as JsonRecord; } catch { return { raw: text }; }
}

async function fetch711SubUserByName(token: string, username: string): Promise<JsonRecord | null> {
  const res = await fetch(
    `${API_BASE}/user/sub/?page=1&page_size=999&status=0&name=${encodeURIComponent(username)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const text = await res.text();
  let json: JsonRecord;
  try { json = JSON.parse(text) as JsonRecord; } catch { return null; }
  const results = Array.isArray(json.results) ? json.results : [];
  const exact = results.find(
    (r) => r && typeof r === "object" && "suname" in r && typeof (r as JsonRecord).suname === "string" &&
      ((r as JsonRecord).suname as string).toLowerCase() === username.toLowerCase(),
  );
  return exact && typeof exact === "object" && !Array.isArray(exact) ? (exact as JsonRecord) : null;
}

function parseTrafficTextToBytes(value: unknown): bigint | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || /unlimited/i.test(raw)) return null;
  const m = raw.toUpperCase().match(/([0-9]+(?:\.[0-9]+)?)\s*(B|KB|MB|GB|TB)\b/);
  if (!m) return null;
  const amount = Number(m[1]);
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[m[2] as "B"];
  return BigInt(Math.round(amount * mult));
}

export const Route = createFileRoute("/api/public/hooks/sync-usage")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return new Response("Server not configured", { status: 500 });
        const sb = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: cfg } = await sb.from("app_config").select("proxy_username, proxy_passwd").eq("id", 1).maybeSingle();
        if (!cfg?.proxy_username || !cfg?.proxy_passwd) {
          return new Response(JSON.stringify({ ok: false, error: "no creds" }), { status: 200 });
        }

        const { data: orders } = await sb
          .from("proxy_orders")
          .select("id, order_no, proxy_username")
          .eq("status", "approved");
        const list = (orders ?? []).filter((o) => o.order_no || o.proxy_username);
        if (list.length === 0) return new Response(JSON.stringify({ ok: true, refreshed: 0 }));

        let token: string;
        try { token = await fetch711Token(cfg.proxy_username, cfg.proxy_passwd); }
        catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 }); }

        let count = 0;
        for (const o of list) {
          try {
            const id = (o.order_no ?? o.proxy_username ?? "").trim();
            if (!id) continue;
            let unFlow: string | null = null;
            let unFlowUsed: string | null = null;
            let expire: string | null = null;

            if (/^\d+$/.test(id)) {
              const info = await fetch711OrderInfo(token, id);
              unFlow = info.un_flow != null ? String(info.un_flow) : null;
              unFlowUsed = info.un_flow_used != null ? String(info.un_flow_used) : null;
              expire = info.expire != null ? String(info.expire) : null;
            }
            if (unFlow == null && unFlowUsed == null) {
              const uname = o.proxy_username ?? id;
              const sub = await fetch711SubUserByName(token, uname);
              if (!sub) continue;
              const allocated = parseTrafficTextToBytes(sub.traff_flow_top);
              const used = parseTrafficTextToBytes(sub.traff_used) ?? 0n;
              const remaining = allocated == null ? null : allocated > used ? allocated - used : 0n;
              unFlow = remaining == null ? null : remaining.toString();
              unFlowUsed = used.toString();
              expire = sub.expire != null ? String(sub.expire) : null;
            }
            if (unFlow == null && unFlowUsed == null) continue;
            await sb.from("proxy_orders").update({
              un_flow: unFlow ?? undefined,
              un_flow_used: unFlowUsed ?? undefined,
              expire: expire ?? undefined,
            }).eq("id", o.id);
            count++;
          } catch {
            // continue
          }
        }
        return new Response(JSON.stringify({ ok: true, refreshed: count }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
