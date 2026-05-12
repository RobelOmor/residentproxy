import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicPricing } from "@/lib/admin.functions";
import { listPublicPaymentMethods, getVisitorCountry, redeemCoupon } from "@/lib/payment.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Copy, ExternalLink, Ticket, ChevronRight, Send, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/billing")({ component: Billing });

type Method = {
  id: string;
  kind: "usdt" | "binance" | "card" | "agent";
  label: string;
  network: string | null;
  address: string | null;
  qr_url: string | null;
  binance_id: string | null;
  binance_email: string | null;
  telegram_url: string | null;
  manager_name: string | null;
  country_code: string | null;
};

function Billing() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const fetchPricing = useServerFn(getPublicPricing);
  const fetchMethods = useServerFn(listPublicPaymentMethods);
  const fetchCountry = useServerFn(getVisitorCountry);
  const redeemFn = useServerFn(redeemCoupon);

  const { data: pricing } = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });
  const { data: methods = [] } = useQuery({ queryKey: ["public-payment-methods"], queryFn: () => fetchMethods() as Promise<Method[]> });
  const { data: visitor } = useQuery({ queryKey: ["visitor-country"], queryFn: () => fetchCountry() });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("balance_usdt").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["my-orders-billing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("proxy_orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: topups } = useQuery({
    queryKey: ["my-topups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("topup_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: redemptions } = useQuery({
    queryKey: ["my-redemptions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupon_redemptions")
        .select("id, amount_usdt, redeemed_at, coupons(code)")
        .order("redeemed_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const usdt = useMemo(() => methods.filter((m) => m.kind === "usdt"), [methods]);
  const binance = useMemo(() => methods.filter((m) => m.kind === "binance"), [methods]);
  const agents = useMemo(() => methods.filter((m) => m.kind === "agent"), [methods]);

  const totalSpent = (orders ?? []).filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.cost_usdt), 0);
  const balance = Number(profile?.balance_usdt ?? 0);

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  // Merge topups + coupon redemptions into single history list
  type HistoryRow = { id: string; amount: number; ref: string; status: string; note: string | null; date: string; kind: "topup" | "coupon" };
  const history: HistoryRow[] = useMemo(() => {
    const a: HistoryRow[] = (topups ?? []).map((t) => ({
      id: t.id, amount: Number(t.amount_usdt), ref: t.tx_hash ?? "—",
      status: t.status, note: t.admin_note ?? null, date: t.created_at, kind: "topup",
    }));
    const b: HistoryRow[] = (redemptions ?? []).map((r) => {
      const code = (r as { coupons?: { code?: string } | null }).coupons?.code ?? "—";
      return {
        id: r.id, amount: Number(r.amount_usdt), ref: `[COUPON] ${code}`,
        status: "approved", note: "Coupon redeemed", date: r.redeemed_at, kind: "coupon",
      };
    });
    return [...a, ...b].sort((x, y) => +new Date(y.date) - +new Date(x.date));
  }, [topups, redemptions]);

  const onSubmittedTopup = () => qc.invalidateQueries({ queryKey: ["my-topups", user?.id] });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Billing & Top-up</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardDescription>Available Balance</CardDescription><CardTitle className="text-3xl">${balance.toFixed(2)} USDT</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Total Spent (Approved)</CardDescription><CardTitle className="text-3xl">${totalSpent.toFixed(2)} USDT</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top-up</CardTitle>
          <CardDescription>Choose a payment method below. Pricing: ${Number(pricing?.price_per_gb_usdt ?? 3).toFixed(2)} / GB</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="usdt">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="usdt">USDT</TabsTrigger>
              <TabsTrigger value="binance">Binance Pay</TabsTrigger>
              <TabsTrigger value="agent">Telegram Agent</TabsTrigger>
              <TabsTrigger value="coupon">Coupon</TabsTrigger>
            </TabsList>

            <TabsContent value="usdt" className="space-y-4">
              <UsdtTopup methods={usdt} legacyAddr={pricing?.usdt_address ?? null} legacyNet={pricing?.usdt_network ?? null} onSubmitted={onSubmittedTopup} userId={user?.id} copy={copy} />
            </TabsContent>

            <TabsContent value="binance" className="space-y-4">
              {binance.length === 0 && <p className="text-sm text-muted-foreground">No Binance Pay account configured yet.</p>}
              {binance.map((m) => (
                <BinanceCard key={m.id} method={m} userId={user?.id} copy={copy} onSubmitted={onSubmittedTopup} />
              ))}
            </TabsContent>

            <TabsContent value="agent" className="space-y-4">
              <AgentList agents={agents} country={visitor?.country ?? null} />
            </TabsContent>

            <TabsContent value="coupon" className="space-y-3">
              <CouponBox redeemFn={redeemFn} onRedeemed={() => {
                qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
                qc.invalidateQueries({ queryKey: ["my-redemptions", user?.id] });
              }} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Tabs defaultValue="topup">
        <TabsList>
          <TabsTrigger value="topup">Top-up history</TabsTrigger>
          <TabsTrigger value="usage">Usage history</TabsTrigger>
        </TabsList>
        <TabsContent value="topup">
          <Card><CardContent className="pt-6"><Table>
            <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Amount</TableHead><TableHead>TX / Ref</TableHead><TableHead>Status</TableHead><TableHead>Note</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.id.slice(0, 12)}…</TableCell>
                  <TableCell className="font-semibold">${t.amount.toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[260px] truncate">{t.ref}</TableCell>
                  <TableCell><Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>{t.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{t.note ?? "-"}</TableCell>
                  <TableCell className="text-xs">{new Date(t.date).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {history.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No top-ups yet</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
        <TabsContent value="usage">
          <Card><CardContent className="pt-6"><Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Cost</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                  <TableCell>{Number(o.gb_amount) >= 1 ? `${Number(o.gb_amount).toFixed(2)} GB` : `${Math.round(Number(o.gb_amount) * 1024)} MB`}</TableCell>
                  <TableCell>${Number(o.cost_usdt).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={o.status === "approved" ? "default" : o.status === "rejected" ? "destructive" : "secondary"}>{o.status}</Badge></TableCell>
                </TableRow>
              ))}
              {!orders?.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>}
            </TableBody>
          </Table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function qrFor(s: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(s)}`;
}

async function uploadScreenshot(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${userId}/topup/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("support-attachments").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("support-attachments").getPublicUrl(path);
  return data.publicUrl;
}

function UsdtTopup({
  methods, legacyAddr, legacyNet, onSubmitted, userId, copy,
}: {
  methods: Method[]; legacyAddr: string | null; legacyNet: string | null;
  onSubmitted: () => void; userId: string | undefined; copy: (s: string) => void;
}) {
  const list = useMemo(() => {
    const arr = [...methods];
    if (legacyAddr && !methods.some((m) => m.address === legacyAddr)) {
      arr.push({
        id: "legacy", kind: "usdt", label: `USDT ${legacyNet ?? "TRC20"}`,
        network: legacyNet, address: legacyAddr, qr_url: null,
        binance_id: null, binance_email: null, telegram_url: null, manager_name: null, country_code: null,
      });
    }
    return arr;
  }, [methods, legacyAddr, legacyNet]);

  const [selectedId, setSelectedId] = useState(list[0]?.id ?? "");
  const selected = list.find((m) => m.id === selectedId) ?? list[0];
  const [amount, setAmount] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = () => {
    const amt = Number(amount);
    if (!amt || amt < 10) return toast.error("Minimum top-up is $10.00");
    setPreviewOpen(true);
  };

  if (list.length === 0) return <p className="text-sm text-muted-foreground">No USDT addresses configured yet.</p>;
  if (!selected) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {list.map((m) => (
          <Button key={m.id} size="sm" variant={selectedId === m.id || (!selectedId && m.id === list[0].id) ? "default" : "outline"} onClick={() => setSelectedId(m.id)}>
            {m.network ?? m.label}
          </Button>
        ))}
      </div>
      <GatewayRow logoUrl={selected.qr_url} logoFallback={selected.network ?? "USDT"} address={selected.address ?? ""} label={selected.label} copy={copy} />
      <div className="grid md:grid-cols-2 gap-3 max-w-xl">
        <div><Label>Amount (USDT)</Label><Input type="number" min={10} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00 minimum" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Minimum top-up: <strong>$10.00 USDT</strong>. No maximum.</p>
      <Button onClick={openPreview} className="w-full md:w-auto">Top-up</Button>

      <ConfirmTopupDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        userId={userId}
        gatewayLabel={selected.label}
        gatewayLogo={selected.qr_url}
        payAddress={selected.address ?? ""}
        payIdLabel="Wallet address"
        amount={Number(amount) || 0}
        txPrefix={`[USDT-${selected.network}]`}
        copy={copy}
        onDone={() => { setAmount(""); onSubmitted(); }}
      />
    </div>
  );
}

function BinanceCard({ method, userId, copy, onSubmitted }: { method: Method; userId: string | undefined; copy: (s: string) => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const ref = method.binance_id || method.binance_email || "";

  const openPreview = () => {
    const amt = Number(amount);
    if (!amt || amt < 10) return toast.error("Minimum top-up is $10.00");
    setPreviewOpen(true);
  };

  return (
    <div className="space-y-4">
      <GatewayRow logoUrl={method.qr_url} logoFallback="Binance" address={ref} label={method.label} copy={copy} />
      <div className="grid md:grid-cols-2 gap-3 max-w-xl">
        {method.binance_email && (<div><Label>Binance Email</Label><div className="flex gap-2"><code className="flex-1 bg-muted px-3 py-2 rounded text-xs">{method.binance_email}</code><Button size="icon" variant="outline" onClick={() => copy(method.binance_email!)}><Copy className="h-4 w-4" /></Button></div></div>)}
        <div><Label>Amount (USDT)</Label><Input type="number" min={10} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00 minimum" /></div>
      </div>
      <p className="text-xs text-muted-foreground">Minimum top-up: <strong>$10.00 USDT</strong>. No maximum.</p>
      <Button onClick={openPreview} className="w-full md:w-auto">Top-up</Button>

      <ConfirmTopupDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        userId={userId}
        gatewayLabel={method.label}
        gatewayLogo={method.qr_url}
        payAddress={ref}
        payIdLabel="Binance Pay ID"
        amount={Number(amount) || 0}
        txPrefix="[BINANCE]"
        copy={copy}
        onDone={() => { setAmount(""); onSubmitted(); }}
      />
    </div>
  );
}

function ConfirmTopupDialog({
  open, onOpenChange, userId, gatewayLabel, gatewayLogo, payAddress, payIdLabel, amount, txPrefix, copy, onDone,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; userId: string | undefined;
  gatewayLabel: string; gatewayLogo: string | null; payAddress: string; payIdLabel: string;
  amount: number; txPrefix: string; copy: (s: string) => void; onDone: () => void;
}) {
  const [tx, setTx] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!userId) return;
    if (!tx.trim() && !file) return toast.error("Provide transaction ID or upload a screenshot");
    setBusy(true);
    try {
      let screenshotUrl = "";
      if (file) screenshotUrl = await uploadScreenshot(userId, file);
      const refParts = [tx.trim(), screenshotUrl ? `screenshot:${screenshotUrl}` : ""].filter(Boolean).join(" | ");
      const { error } = await supabase.from("topup_requests").insert({
        user_id: userId, amount_usdt: amount, tx_hash: `${txPrefix} ${refParts}`, status: "pending",
      });
      if (error) throw error;
      toast.success("Top-up request submitted. Awaiting admin approval.");
      setTx(""); setFile(null);
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Top-up</DialogTitle>
          <DialogDescription>Review the details below, then attach your transaction proof.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 border rounded-lg p-3">
            <div className="w-12 h-12 rounded-md border bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
              {gatewayLogo ? <img src={gatewayLogo} alt={gatewayLabel} className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] font-semibold text-muted-foreground">{gatewayLabel}</span>}
            </div>
            <div className="text-sm">
              <div className="text-muted-foreground text-xs">Paying to</div>
              <div className="font-semibold">{gatewayLabel}</div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-2 rounded-lg border">
              <img src={qrFor(payAddress)} alt="QR" width={160} height={160} className="block" />
            </div>
            <div className="text-xs text-muted-foreground">{payIdLabel}</div>
            <div className="flex items-center gap-1 max-w-full">
              <code className="bg-muted rounded px-2 py-1 text-[11px] break-all">{payAddress}</code>
              <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copy(payAddress)}><Copy className="h-3 w-3" /></Button>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-muted/40 text-center">
            <div className="text-xs text-muted-foreground">Total Amount</div>
            <div className="text-2xl font-bold">${amount.toFixed(2)} USDT</div>
          </div>

          <div className="space-y-2">
            <Label>Payment Transaction ID</Label>
            <Input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="0x... / TX hash" />
            <div className="text-xs text-muted-foreground text-center">— or —</div>
            <Label className="flex items-center gap-2 cursor-pointer border rounded-md p-2 hover:bg-muted">
              <Upload className="h-4 w-4" />
              <span className="text-sm">{file ? file.name : "Upload payment screenshot"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Confirm Top-up"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GatewayRow({ logoUrl, logoFallback, address, label, copy }: { logoUrl: string | null; logoFallback: string; address: string; label: string; copy: (s: string) => void }) {
  return (
    <div className="flex items-center gap-3 md:gap-6 border rounded-lg p-4 flex-wrap md:flex-nowrap">
      <div className="flex-shrink-0 w-20 h-20 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
        {logoUrl ? <img src={logoUrl} alt={`${label} logo`} className="max-w-full max-h-full object-contain" /> : <span className="text-xs font-semibold text-muted-foreground">{logoFallback}</span>}
      </div>
      <ChevronRight className="h-6 w-6 text-muted-foreground hidden md:block" />
      <div className="flex flex-col items-center gap-2">
        <div className="bg-white p-2 rounded-lg border">
          <img src={qrFor(address)} alt={`${label} QR`} width={150} height={150} className="block" />
        </div>
        <div className="flex items-center gap-1 max-w-[260px]">
          <code className="bg-muted rounded px-2 py-1 text-[11px] break-all">{address}</code>
          <Button variant="outline" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => copy(address)}><Copy className="h-3 w-3" /></Button>
        </div>
      </div>
      <Badge variant="secondary" className="text-base px-3 py-1.5">{label}</Badge>
    </div>
  );
}

function AgentList({ agents, country }: { agents: Method[]; country: string | null }) {
  const allCountries = Array.from(new Set(agents.map((a) => a.country_code).filter(Boolean))) as string[];
  const [selected, setSelected] = useState<string | "all">(country && allCountries.includes(country) ? country : "all");
  const filtered = selected === "all" ? agents : agents.filter((a) => a.country_code === selected);

  // Show alert when visitor's detected country has no specific manager (only "other country" / global agents apply)
  const hasManagerForCountry = !!(country && allCountries.includes(country));
  const showNoManagerAlert = !!country && !hasManagerForCountry;

  if (agents.length === 0) {
    return (
      <div className="space-y-3">
        <NoManagerBanner show={true} />
        <p className="text-sm text-muted-foreground">No Telegram agents configured yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <NoManagerBanner show={showNoManagerAlert} />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Filter by country:</span>
        <Select value={selected} onValueChange={(v) => setSelected(v as string)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {allCountries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            <SelectItem value="__other">Other countries</SelectItem>
          </SelectContent>
        </Select>
        {country && <Badge variant="secondary">Detected: {country}</Badge>}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {(selected === "__other" ? agents.filter((a) => !a.country_code) : filtered).map((a) => (
          <a key={a.id} href={a.telegram_url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 border rounded-lg p-4 hover:bg-muted transition">
            <div className="w-12 h-12 rounded-full bg-[#229ED9] text-white flex items-center justify-center flex-shrink-0">
              <Send className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{a.manager_name ?? a.label}</div>
              <div className="text-xs text-muted-foreground">{a.country_code ?? "Other countries"} · Open in Telegram</div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </a>
        ))}
        {filtered.length === 0 && selected !== "__other" && <p className="text-sm text-muted-foreground">No agents for this country yet.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Minimum top-up via agent: <strong>$10.00</strong>. Confirm with your agent before sending.</p>
    </div>
  );
}

function NoManagerBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-lg border-2 border-destructive bg-destructive/10 px-4 py-3 text-destructive font-bold text-sm md:text-base animate-bounce"
      role="alert"
    >
      <AlertTriangle className="h-5 w-5" />
      <span>Earning From Agent — To Contact Support</span>
    </div>
  );
}

function CouponBox({ redeemFn, onRedeemed }: { redeemFn: (a: { data: { code: string } }) => Promise<{ ok: boolean; balance: number }>; onRedeemed: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await redeemFn({ data: { code: code.trim() } });
      toast.success(`Coupon redeemed! New balance: $${r.balance.toFixed(2)}`);
      setCode(""); onRedeemed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid code");
    } finally { setBusy(false); }
  };
  return (
    <div className="max-w-md space-y-3">
      <p className="text-sm text-muted-foreground">Got a promo code? Redeem it to add USDT to your balance instantly. One-time use per account.</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Ticket className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" className="pl-9 font-mono uppercase" maxLength={64} />
        </div>
        <Button onClick={submit} disabled={busy || !code.trim()}>{busy ? "Checking…" : "Redeem"}</Button>
      </div>
    </div>
  );
}
