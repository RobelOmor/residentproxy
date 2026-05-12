import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SbClient = ReturnType<typeof createClient<Database>>;

async function isAdmin(sb: SbClient, uid: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
  return !!data;
}

// Get my open thread or create one
export const supportGetOrCreateThread = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      customer_name: z.string().trim().min(1).max(120),
      telegram_id: z.string().trim().max(80).optional().nullable(),
    }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const uid = context.userId;
    const { data: existing } = await sb
      .from("support_threads")
      .select("*")
      .eq("user_id", uid)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
    const { data: created, error } = await sb
      .from("support_threads")
      .insert({
        user_id: uid,
        customer_name: data.customer_name,
        telegram_id: data.telegram_id || null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const supportListMyMessages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ thread_id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: msgs, error } = await sb
      .from("support_messages")
      .select("*")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });

export const supportSendMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      thread_id: z.string().uuid(),
      body: z.string().max(4000).optional().nullable(),
      attachment_url: z.string().url().max(500).optional().nullable(),
      attachment_type: z.string().max(60).optional().nullable(),
    }).parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { data: id, error } = await sb.rpc("support_send_message", {
      _thread_id: data.thread_id,
      _body: data.body ?? null,
      _attachment_url: data.attachment_url ?? null,
      _attachment_type: data.attachment_type ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, id };
  });

export const supportMarkRead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ thread_id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    const { error } = await sb.rpc("support_mark_read", { _thread_id: data.thread_id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin
export const adminListThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as SbClient;
    if (!(await isAdmin(sb, context.userId))) throw new Error("Forbidden");
    const { data: threads, error } = await sb
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: profiles } = await sb.from("profiles").select("id, email");
    const m = new Map((profiles ?? []).map((p) => [p.id, p.email]));
    return (threads ?? []).map((t) => ({ ...t, user_email: m.get(t.user_id) ?? "unknown" }));
  });

export const adminListMessages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ thread_id: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SbClient;
    if (!(await isAdmin(sb, context.userId))) throw new Error("Forbidden");
    const { data: msgs, error } = await sb
      .from("support_messages")
      .select("*")
      .eq("thread_id", data.thread_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });

// Admin dashboard stats
export const adminGetStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as SbClient;
    if (!(await isAdmin(sb, context.userId))) throw new Error("Forbidden");
    const { data, error } = await sb.rpc("admin_stats");
    if (error) throw new Error(error.message);
    return data as Record<string, number>;
  });
