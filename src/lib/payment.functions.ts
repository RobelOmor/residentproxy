import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SbClient = ReturnType<typeof createClient<Database>>;

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

const baseFields = {
  kind: z.enum(["usdt", "binance", "card", "agent"]),
  label: z.string().trim().min(1).max(120),
  network: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(200).nullish(),
  qr_url: z.string().trim().url().max(500).nullish().or(z.literal("")),
  binance_id: z.string().trim().max(80).nullish(),
  binance_email: z.string().trim().email().max(200).nullish().or(z.literal("")),
  telegram_url: z
    .string()
    .trim()
    .max(200)
    .regex(/^https:\/\/t\.me\/.+/, "Telegram URL must start with https://t.me/")
    .nullish()
    .or(z.literal("")),
  manager_name: z.string().trim().max(120).nullish(),
  country_code: z.string().trim().regex(/^[A-Z]{2}$/).nullish().or(z.literal("")),
  enabled: z.boolean().optional(),
  sort: z.number().int().min(0).max(9999).optional(),
};

function clean<T extends Record<string, unknown>>(o: T) {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) r[k] = v === "" ? null : v;
  return r;
}

// Public: list enabled methods (no auth needed)
export const listPublicPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  const sb = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("get_public_payment_methods");
  if (error) {
    console.error("get_public_payment_methods:", error.message);
    return [];
  }
  return data ?? [];
});

// Get visitor country (Cloudflare header). Returns 'XX' if unknown.
export const getVisitorCountry = createServerFn({ method: "GET" }).handler(async () => {
  const cc =
    getRequestHeader("cf-ipcountry") ??
    getRequestHeader("x-vercel-ip-country") ??
    getRequestHeader("x-country-code") ??
    null;
  return { country: cc && /^[A-Z]{2}$/.test(cc) ? cc : null };
});

// Admin: list all methods
export const adminListPaymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { data, error } = await sb.from("payment_methods").select("*").order("kind").order("sort");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Admin: upsert
export const adminUpsertPaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().optional(), ...baseFields }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { id, ...rest } = data;
    const payload = clean(rest);
    if (id) {
      const { error } = await sb.from("payment_methods").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb.from("payment_methods").insert(payload as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeletePaymentMethod = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { error } = await sb.from("payment_methods").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Coupons -----
export const adminListCoupons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { data, error } = await sb.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminCreateCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
        amount_usdt: z.number().positive().max(100000),
        max_uses: z.number().int().positive().max(100000).default(1),
        expires_at: z.string().datetime().nullish().or(z.literal("")),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { error } = await sb.from("coupons").insert({
      code: data.code,
      amount_usdt: data.amount_usdt,
      max_uses: data.max_uses,
      expires_at: data.expires_at ? data.expires_at : null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { error } = await sb.from("coupons").update({ enabled: data.enabled }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    await assertAdmin(sb, context.userId);
    const { error } = await sb.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// User: redeem (calls SECURITY DEFINER RPC). Generic errors only.
const rateBucket = new Map<string, { count: number; resetAt: number }>();
export const redeemCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ code: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid format") }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const uid = context.userId;
    // simple per-user rate limit (5 / minute)
    const now = Date.now();
    const b = rateBucket.get(uid);
    if (!b || now > b.resetAt) rateBucket.set(uid, { count: 1, resetAt: now + 60_000 });
    else {
      b.count++;
      if (b.count > 5) throw new Error("Too many attempts. Try again in a minute.");
    }
    const { data: newBalance, error } = await sb.rpc("redeem_coupon", { _code: data.code });
    if (error) {
      // Map any DB error to generic message to prevent enumeration
      const msg = error.message || "";
      if (msg.toLowerCase().includes("already used")) throw new Error("This code was already used by your account.");
      throw new Error("Invalid or expired code");
    }
    return { ok: true, balance: Number(newBalance) };
  });
