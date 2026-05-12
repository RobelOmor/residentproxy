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
import { Copy, ExternalLink, Ticket, ChevronRight, Send } from "lucide-react";
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

  const usdt = useMemo(() => methods.filter((m) => m.kind === "usdt"), [methods]);
  const binance = useMemo(() => methods.filter((m) => m.kind === "binance"), [methods]);
  const agents = useMemo(() => methods.filter((m) => m.kind === "agent"), [methods]);

  const totalSpent = (orders ?? []).filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.cost_usdt), 0);
  const balance = Number(profile?.balance_usdt ?? 0);

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

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
              <UsdtTopup methods={usdt} legacyAddr={pricing?.usdt_address ?? null} legacyNet={pricing?.usdt_network ?? null} onSubmitted={() => qc.invalidateQueries({ queryKey: ["my-topups", user?.id] })} userId={user?.id} copy={copy} />
            </TabsContent>

            <TabsContent value="binance" className="space-y-4">
              {binance.length === 0 && <p className="text-sm text-muted-foreground">No Binance Pay account configured yet.</p>}
              {binance.map((m) => (
                <BinanceCard key={m.id} method={m} userId={user?.id} copy={copy} onSubmitted={() => qc.invalidateQueries({ queryKey: ["my-topups", user?.id] })} />
              ))}
            </TabsContent>

            <TabsContent value="agent" className="space-y-4">
              <AgentList agents={agents} country={visitor?.country ?? null} />
            </TabsContent>

            <TabsContent value="coupon" className="space-y-3">
              <CouponBox redeemFn={redeemFn} onRedeemed={() => qc.invalidateQueries({ queryKey: ["my-profile", user?.id] })} />
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
              {topups?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.id.slice(0, 12)}…</TableCell>
                  <TableCell className="font-semibold">${Number(t.amount_usdt).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[220px] truncate">{t.tx_hash}</TableCell>
                  <TableCell><Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>{t.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{t.admin_note ?? "-"}</TableCell>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!topups?.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No top-ups yet</TableCell></TableRow>}
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

function UsdtTopup({
  methods, legacyAddr, legacyNet, onSubmitted, userId, copy,
}: {
  methods: Method[]; legacyAddr: string | null; legacyNet: string | null;
  onSubmitted: () => void; userId: string | undefined; copy: (s: string) => void;
}) {
  // Combine admin-managed methods + legacy single address (if not already in methods)
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
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!userId || !selected) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!tx.trim()) return toast.error("Enter the transaction hash");
    setBusy(true);
    const { error } = await supabase.from("topup_requests").insert({
      user_id: userId, amount_usdt: amt, tx_hash: `[USDT-${selected.network}] ${tx.trim()}`, status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Top-up request submitted. Awaiting admin approval.");
    setAmount(""); setTx(""); onSubmitted();
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
      <div className="grid md:grid-cols-2 gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="bg-white p-2 rounded-lg border">
            <img src={selected.qr_url || qrFor(selected.address ?? "")} alt={`${selected.label} QR`} width={180} height={180} className="block" />
          </div>
          <p className="text-xs text-muted-foreground">{selected.label}</p>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Address</Label>
            <div className="flex gap-2">
              <code className="flex-1 bg-muted rounded px-3 py-2 text-xs break-all">{selected.address}</code>
              <Button variant="outline" size="icon" onClick={() => copy(selected.address ?? "")}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
          <div><Label>Amount (USDT)</Label><Input type="number" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><Label>Transaction Hash</Label><Input value={tx} onChange={(e) => setTx(e.target.value)} placeholder="0x... / TRX hash" /></div>
          <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit top-up"}</Button>
        </div>
      </div>
    </div>
  );
}

function BinanceCard({ method, userId, copy, onSubmitted }: { method: Method; userId: string | undefined; copy: (s: string) => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!userId) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!tx.trim()) return toast.error("Enter the Binance Pay transaction ID");
    setBusy(true);
    const { error } = await supabase.from("topup_requests").insert({
      user_id: userId, amount_usdt: amt, tx_hash: `[BINANCE] ${tx.trim()}`, status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Submitted. Awaiting admin approval.");
    setAmount(""); setTx(""); onSubmitted();
  };
  const ref = method.binance_id || method.binance_email || "";
  return (
    <div className="border rounded-lg p-4 grid md:grid-cols-2 gap-4">
      <div className="flex flex-col items-center gap-2">
        <div className="bg-white p-2 rounded-lg border">
          <img src={method.qr_url || qrFor(ref)} alt="Binance Pay QR" width={180} height={180} />
        </div>
        <p className="text-xs text-muted-foreground">{method.label}</p>
      </div>
      <div className="space-y-3">
        {method.binance_id && (<div><Label>Binance Pay ID</Label><div className="flex gap-2"><code className="flex-1 bg-muted px-3 py-2 rounded text-xs">{method.binance_id}</code><Button size="icon" variant="outline" onClick={() => copy(method.binance_id!)}><Copy className="h-4 w-4" /></Button></div></div>)}
        {method.binance_email && (<div><Label>Binance Email</Label><div className="flex gap-2"><code className="flex-1 bg-muted px-3 py-2 rounded text-xs">{method.binance_email}</code><Button size="icon" variant="outline" onClick={() => copy(method.binance_email!)}><Copy className="h-4 w-4" /></Button></div></div>)}
        <div><Label>Amount (USDT)</Label><Input type="number" step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Binance Pay TX ID</Label><Input value={tx} onChange={(e) => setTx(e.target.value)} /></div>
        <Button onClick={submit} disabled={busy} className="w-full">{busy ? "Submitting…" : "Submit top-up"}</Button>
      </div>
    </div>
  );
}

function AgentList({ agents, country }: { agents: Method[]; country: string | null }) {
  const allCountries = Array.from(new Set(agents.map((a) => a.country_code).filter(Boolean))) as string[];
  const [selected, setSelected] = useState<string | "all">(country && allCountries.includes(country) ? country : "all");
  const filtered = selected === "all" ? agents : agents.filter((a) => a.country_code === selected);

  if (agents.length === 0) return <p className="text-sm text-muted-foreground">No Telegram agents configured yet.</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Filter by country:</span>
        <Select value={selected} onValueChange={(v) => setSelected(v as string)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {allCountries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        {country && <Badge variant="secondary">Detected: {country}</Badge>}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map((a) => (
          <a key={a.id} href={a.telegram_url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted transition">
            <div>
              <div className="font-semibold">{a.manager_name ?? a.label}</div>
              <div className="text-xs text-muted-foreground">{a.country_code ?? "Global"} · Telegram</div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No agents for this country yet.</p>}
      </div>
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
