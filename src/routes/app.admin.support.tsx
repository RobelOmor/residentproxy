import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListThreads, adminListMessages, supportSendMessage, supportMarkRead } from "@/lib/support.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Paperclip, Image as ImgIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/support")({ component: AdminSupport });

type Thread = { id: string; user_id: string; user_email: string; customer_name: string; telegram_id: string | null; last_message_at: string; unread_admin: number };
type Msg = { id: string; thread_id: string; sender: string; body: string | null; attachment_url: string | null; attachment_type: string | null; created_at: string };

function AdminSupport() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const listFn = useServerFn(adminListThreads);
  const msgsFn = useServerFn(adminListMessages);
  const sendFn = useServerFn(supportSendMessage);
  const markRead = useServerFn(supportMarkRead);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  useEffect(() => {
    audioRef.current = new Audio("https://cdn.jsdelivr.net/gh/anars/blank-audio@master/250-milliseconds-of-silence.mp3");
    audioRef.current = new Audio("data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAADB8AhSmxhIIE");
  }, []);

  const { data: threads } = useQuery({
    queryKey: ["admin-support-threads"],
    enabled: role === "admin",
    queryFn: () => listFn() as Promise<Thread[]>,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!activeId) return;
    msgsFn({ data: { thread_id: activeId } }).then((m) => setMsgs(m as Msg[]));
    markRead({ data: { thread_id: activeId } }).then(() => qc.invalidateQueries({ queryKey: ["admin-support-threads"] }));
  }, [activeId, msgsFn, markRead, qc]);

  // Global realtime: alert on any new user message
  useEffect(() => {
    if (role !== "admin") return;
    const ch = supabase
      .channel("admin-support-all")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const m = payload.new as Msg;
        if (m.sender === "user") {
          audioRef.current?.play().catch(() => {});
          qc.invalidateQueries({ queryKey: ["admin-support-threads"] });
        }
        if (activeId === m.thread_id) {
          setMsgs((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [role, activeId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs]);

  if (role !== "admin") return <p>Loading…</p>;

  const handleSend = async () => {
    if (!activeId || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      await sendFn({ data: { thread_id: activeId, body } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const path = `${u.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, file);
    if (error) return toast.error(error.message);
    const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
    await sendFn({ data: { thread_id: activeId, body: null, attachment_url: pub.publicUrl, attachment_type: file.type } });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Customer Support</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-180px)]">
        <Card className="md:col-span-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-2"><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 space-y-1">
            {(threads ?? []).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`w-full text-left p-2 rounded border transition ${activeId === t.id ? "bg-primary/10 border-primary" : "hover:bg-muted"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm truncate">{t.customer_name}</span>
                  {t.unread_admin > 0 && <Badge variant="destructive" className="ml-1">{t.unread_admin}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{t.user_email}</div>
                {t.telegram_id && <div className="text-xs text-muted-foreground">TG: {t.telegram_id}</div>}
                <div className="text-[10px] text-muted-foreground">{new Date(t.last_message_at).toLocaleString()}</div>
              </button>
            ))}
            {(!threads || threads.length === 0) && <p className="text-sm text-muted-foreground p-2">No conversations yet.</p>}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 flex flex-col overflow-hidden">
          {activeId ? (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${m.sender === "admin" ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.attachment_url && (m.attachment_type?.startsWith("image/")
                        ? <img src={m.attachment_url} alt="" className="rounded mt-1 max-w-full" />
                        : <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline text-xs flex items-center gap-1 mt-1"><Paperclip className="h-3 w-3" />File</a>)}
                      <div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-2 flex items-center gap-2">
                <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.txt,.zip" onChange={handleFile} />
                <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()}><ImgIcon className="h-4 w-4" /></Button>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type reply..." onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } }} />
                <Button size="icon" onClick={handleSend} disabled={!text.trim()}><Send className="h-4 w-4" /></Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Select a conversation to reply</div>
          )}
        </Card>
      </div>
    </div>
  );
}
