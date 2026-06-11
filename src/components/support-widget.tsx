import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/components/auth-modal";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  supportGetOrCreateThread,
  supportListMyMessages,
  supportSendMessage,
  supportMarkRead,
} from "@/lib/support.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Headset, X, Send, Paperclip, Image as ImgIcon } from "lucide-react";
import { SupportAttachment } from "@/components/support-attachment";
import { toast } from "sonner";

type Msg = {
  id: string;
  thread_id: string;
  sender: string;
  body: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
};

export function SupportWidget() {
  const { user } = useAuth();
  const { open: openAuth } = useAuthModal();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<{ id: string; customer_name: string } | null>(null);
  const [name, setName] = useState("");
  const [tg, setTg] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getOrCreate = useServerFn(supportGetOrCreateThread);
  const list = useServerFn(supportListMyMessages);
  const send = useServerFn(supportSendMessage);
  const markRead = useServerFn(supportMarkRead);

  useEffect(() => {
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
    );
  }, []);

  // Load thread on open
  useEffect(() => {
    if (!open || !thread) return;
    list({ data: { thread_id: thread.id } }).then((m) => setMsgs(m as Msg[]));
    markRead({ data: { thread_id: thread.id } }).catch(() => {});
  }, [open, thread, list, markRead]);

  // Realtime
  useEffect(() => {
    if (!thread) return;
    const ch = supabase
      .channel(`support-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          const m = payload.new as Msg;
          setMsgs((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
          if (m.sender === "admin") {
            audioRef.current?.play().catch(() => {});
            if (open) markRead({ data: { thread_id: thread.id } }).catch(() => {});
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [thread, open, markRead]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const handleStart = async () => {
    if (!user) {
      setOpen(false);
      openAuth("signup");
      return;
    }
    if (!name.trim()) return toast.error("Enter your name");
    setBusy(true);
    try {
      const t = await getOrCreate({ data: { customer_name: name.trim(), telegram_id: tg.trim() || null } });
      setThread({ id: t.id, customer_name: t.customer_name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async () => {
    if (!thread || !text.trim()) return;
    const body = text.trim();
    setText("");
    try {
      await send({ data: { thread_id: thread.id, body } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setText(body);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !thread || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max 5MB");
    setBusy(true);
    try {
      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("support-attachments").upload(path, file);
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("support-attachments").getPublicUrl(path);
      await send({
        data: {
          thread_id: thread.id,
          body: null,
          attachment_url: pub.publicUrl,
          attachment_type: file.type,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-full bg-[hsl(0_72%_45%)] px-5 py-3 text-white shadow-2xl hover:scale-105 transition"
        aria-label="Chat with support"
      >
        <span className="rounded-full bg-white/20 p-2"><Headset className="h-5 w-5" /></span>
        <span className="text-left leading-tight">
          <span className="block font-semibold text-sm">Chat With Support</span>
          <span className="block text-xs opacity-90">We reply instantly</span>
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] rounded-2xl bg-card shadow-2xl border flex flex-col overflow-hidden">
      <div className="bg-[hsl(0_72%_45%)] text-white px-4 py-3 flex items-center gap-3">
        <div className="rounded-full bg-white/20 p-2"><Headset className="h-5 w-5" /></div>
        <div className="flex-1 leading-tight">
          <div className="font-semibold text-sm">Support</div>
          <div className="text-xs opacity-90">● Online · We reply instantly</div>
        </div>
        <button onClick={() => setOpen(false)} className="hover:bg-white/20 p-1 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!thread ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <div className="rounded-full bg-[hsl(0_72%_45%)]/10 p-4">
            <Headset className="h-8 w-8 text-[hsl(0_72%_45%)]" />
          </div>
          <h3 className="text-lg font-semibold">Start a Conversation</h3>
          <p className="text-sm text-muted-foreground">Chat with our support team. We're here to help!</p>
          <Input placeholder="Your Full Name *" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Telegram ID (optional)" value={tg} onChange={(e) => setTg(e.target.value)} />
          <Button onClick={handleStart} disabled={busy} className="w-full bg-[hsl(0_72%_45%)] hover:bg-[hsl(0_72%_40%)] text-white">
            <Send className="h-4 w-4 mr-2" /> Start Chat
          </Button>
          {!user && <p className="text-xs text-muted-foreground">You must sign up / log in first.</p>}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/30">
            {msgs.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">Say hi to start the conversation.</p>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.sender === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}
                >
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.attachment_url && (
                    m.attachment_type?.startsWith("image/") ? (
                      <img src={m.attachment_url} alt="attachment" className="rounded mt-1 max-w-full" />
                    ) : (
                      <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline text-xs flex items-center gap-1 mt-1">
                        <Paperclip className="h-3 w-3" /> File
                      </a>
                    )
                  )}
                  <div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t p-2 flex items-center gap-2">
            <input ref={fileRef} type="file" hidden accept="image/*,.pdf,.txt,.zip" onChange={handleFile} />
            <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
              <ImgIcon className="h-4 w-4" />
            </Button>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <Button size="icon" onClick={handleSend} disabled={!text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
