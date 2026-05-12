import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListPaymentMethods,
  adminUpsertPaymentMethod,
  adminDeletePaymentMethod,
  adminListCoupons,
  adminCreateCoupon,
  adminToggleCoupon,
  adminDeleteCoupon,
} from "@/lib/payment.functions";
import { adminGetConfig, adminSaveConfig } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Trash2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/payment")({
  component: AdminPayment,
});

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
  enabled: boolean;
  sort: number;
};

function AdminPayment() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const getCfg = useServerFn(adminGetConfig);
  const saveCfg = useServerFn(adminSaveConfig);
  const listFn = useServerFn(adminListPaymentMethods);
  const upsertFn = useServerFn(adminUpsertPaymentMethod);
  const delFn = useServerFn(adminDeletePaymentMethod);
  const listCouponsFn = useServerFn(adminListCoupons);
  const createCouponFn = useServerFn(adminCreateCoupon);
  const toggleCouponFn = useServerFn(adminToggleCoupon);
  const delCouponFn = useServerFn(adminDeleteCoupon);

  const { data: cfg } = useQuery({ queryKey: ["admin-config"], enabled: role === "admin", queryFn: () => getCfg() });
  const { data: methods } = useQuery({
    queryKey: ["admin-payment-methods"],
    enabled: role === "admin",
    queryFn: () => listFn() as Promise<Method[]>,
  });
  const { data: coupons } = useQuery({
    queryKey: ["admin-coupons"],
    enabled: role === "admin",
    queryFn: () => listCouponsFn(),
  });

  const [price, setPrice] = useState("3.00");
  useEffect(() => {
    if (cfg?.config) setPrice(String(cfg.config.price_per_gb_usdt ?? "3.00"));
  }, [cfg]);

  const savePrice = async () => {
    try {
      await saveCfg({ data: { price_per_gb_usdt: Number(price) } });
      toast.success("Price saved");
      qc.invalidateQueries({ queryKey: ["admin-config"] });
      qc.invalidateQueries({ queryKey: ["pricing"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const refreshMethods = () => qc.invalidateQueries({ queryKey: ["admin-payment-methods"] });
  const refreshCoupons = () => qc.invalidateQueries({ queryKey: ["admin-coupons"] });

  if (role !== "admin") return <p>Loading…</p>;

  const byKind = (k: Method["kind"]) => (methods ?? []).filter((m) => m.kind === k);

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold">Payment</h1>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>Selling price per GB</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 items-end">
          <div className="flex-1 max-w-xs">
            <Label>Price per GB (USDT)</Label>
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Button onClick={savePrice}>Save</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="usdt">
        <TabsList>
          <TabsTrigger value="usdt">USDT</TabsTrigger>
          <TabsTrigger value="binance">Binance Pay</TabsTrigger>
          <TabsTrigger value="card">Card</TabsTrigger>
          <TabsTrigger value="agent">Agent (Telegram)</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
        </TabsList>

        <TabsContent value="usdt"><MethodSection kind="usdt" items={byKind("usdt")} upsertFn={upsertFn} delFn={delFn} refresh={refreshMethods} /></TabsContent>
        <TabsContent value="binance"><MethodSection kind="binance" items={byKind("binance")} upsertFn={upsertFn} delFn={delFn} refresh={refreshMethods} /></TabsContent>
        <TabsContent value="card">
          <Card><CardHeader><CardTitle>Card payments</CardTitle><CardDescription>Coming soon</CardDescription></CardHeader></Card>
        </TabsContent>
        <TabsContent value="agent"><MethodSection kind="agent" items={byKind("agent")} upsertFn={upsertFn} delFn={delFn} refresh={refreshMethods} /></TabsContent>
        <TabsContent value="coupons">
          <CouponsSection
            coupons={coupons ?? []}
            createFn={createCouponFn}
            toggleFn={toggleCouponFn}
            delFn={delCouponFn}
            refresh={refreshCoupons}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MethodSection({
  kind, items, upsertFn, delFn, refresh,
}: {
  kind: Method["kind"];
  items: Method[];
  upsertFn: (a: { data: Record<string, unknown> }) => Promise<unknown>;
  delFn: (a: { data: { id: string } }) => Promise<unknown>;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Method | null>(null);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    try { await delFn({ data: { id } }); toast.success("Deleted"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="capitalize">{kind === "agent" ? "Telegram Agents" : kind === "usdt" ? "USDT Addresses" : "Binance Pay"}</CardTitle>
          <CardDescription>
            {kind === "usdt" && "Multiple networks (TRC20, BEP20, ERC20...). Optional QR image URL."}
            {kind === "binance" && "Binance ID, email and optional QR."}
            {kind === "agent" && "Per-country Telegram managers for manual top-up."}
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </DialogTrigger>
          <MethodForm kind={kind} editing={editing} onClose={() => { setOpen(false); setEditing(null); refresh(); }} upsertFn={upsertFn} />
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
        {items.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 border rounded-md p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{m.label}</span>
                {m.network && <Badge variant="secondary">{m.network}</Badge>}
                {m.country_code && <Badge variant="outline">{m.country_code}</Badge>}
                {!m.enabled && <Badge variant="destructive">disabled</Badge>}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate mt-1">
                {m.address || m.binance_id || m.telegram_url || "—"}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MethodForm({
  kind, editing, onClose, upsertFn,
}: {
  kind: Method["kind"];
  editing: Method | null;
  onClose: () => void;
  upsertFn: (a: { data: Record<string, unknown> }) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    label: editing?.label ?? "",
    network: editing?.network ?? (kind === "usdt" ? "TRC20" : ""),
    address: editing?.address ?? "",
    qr_url: editing?.qr_url ?? "",
    binance_id: editing?.binance_id ?? "",
    binance_email: editing?.binance_email ?? "",
    telegram_url: editing?.telegram_url ?? "",
    manager_name: editing?.manager_name ?? "",
    country_code: editing?.country_code ?? "",
    enabled: editing?.enabled ?? true,
    sort: editing?.sort ?? 0,
  });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await upsertFn({
        data: {
          ...(editing ? { id: editing.id } : {}),
          kind,
          label: form.label,
          network: form.network || null,
          address: form.address || null,
          qr_url: form.qr_url || null,
          binance_id: form.binance_id || null,
          binance_email: form.binance_email || null,
          telegram_url: form.telegram_url || null,
          manager_name: form.manager_name || null,
          country_code: form.country_code ? form.country_code.toUpperCase() : null,
          enabled: form.enabled,
          sort: Number(form.sort) || 0,
        },
      });
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {kind}</DialogTitle><DialogDescription>Fields vary by type.</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div><Label>Label</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. USDT TRC20" /></div>

        {kind === "usdt" && (
          <>
            <div><Label>Network</Label>
              <Select value={form.network ?? ""} onValueChange={(v) => setForm({ ...form, network: v })}>
                <SelectTrigger><SelectValue placeholder="Network" /></SelectTrigger>
                <SelectContent>
                  {["TRC20", "BEP20", "ERC20", "POLYGON", "SOLANA", "ARBITRUM", "OPTIMISM"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Wallet address</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div>
              <Label>Gateway logo URL (optional)</Label>
              <Input value={form.qr_url ?? ""} onChange={(e) => setForm({ ...form, qr_url: e.target.value })} placeholder="https://...usdt-logo.png" />
              <p className="text-xs text-muted-foreground mt-1">Shown as the gateway icon on the user billing page. The QR code is auto-generated from the wallet address.</p>
            </div>
          </>
        )}

        {kind === "binance" && (
          <>
            <div>
              <Label>Binance Pay ID</Label>
              <Input value={form.binance_id ?? ""} onChange={(e) => setForm({ ...form, binance_id: e.target.value })} placeholder="123456789" />
              <p className="text-xs text-muted-foreground mt-1">Numeric Binance Pay user ID (from Binance app → Pay → Profile).</p>
            </div>
            <div>
              <Label>Binance Pay Email</Label>
              <Input value={form.binance_email ?? ""} onChange={(e) => setForm({ ...form, binance_email: e.target.value })} placeholder="you@binance.com" />
              <p className="text-xs text-muted-foreground mt-1">The email registered with your Binance account.</p>
            </div>
            <div>
              <Label>Gateway logo URL (optional)</Label>
              <Input value={form.qr_url ?? ""} onChange={(e) => setForm({ ...form, qr_url: e.target.value })} placeholder="https://...binance-logo.png" />
              <p className="text-xs text-muted-foreground mt-1">Shown as the Binance Pay icon. QR is auto-generated from the Pay ID.</p>
            </div>
          </>
        )}

        {kind === "agent" && (
          <>
            <div><Label>Manager name</Label><Input value={form.manager_name ?? ""} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} placeholder="Robel Omor" /></div>
            <div><Label>Country code (ISO-2)</Label><Input value={form.country_code ?? ""} maxLength={2} onChange={(e) => setForm({ ...form, country_code: e.target.value.toUpperCase() })} placeholder="BD" /></div>
            <div><Label>Telegram URL</Label><Input value={form.telegram_url ?? ""} onChange={(e) => setForm({ ...form, telegram_url: e.target.value })} placeholder="https://t.me/robelomor" /></div>
            <div>
              <Label>Telegram logo URL (optional)</Label>
              <Input value={form.qr_url ?? ""} onChange={(e) => setForm({ ...form, qr_url: e.target.value })} placeholder="https://...telegram-logo.png" />
              <p className="text-xs text-muted-foreground mt-1">Optional custom logo. Defaults to Telegram brand icon.</p>
            </div>
          </>
        )}

        <div className="flex items-center gap-3">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          <span className="text-sm">Enabled (visible to users)</span>
        </div>
        <div className="max-w-[120px]"><Label>Sort</Label><Input type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !form.label}>{busy ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

type Coupon = { id: string; code: string; amount_usdt: number; max_uses: number; used_count: number; enabled: boolean; expires_at: string | null };

function CouponsSection({
  coupons, createFn, toggleFn, delFn, refresh,
}: {
  coupons: Coupon[];
  createFn: (a: { data: { code: string; amount_usdt: number; max_uses: number; expires_at?: string } }) => Promise<unknown>;
  toggleFn: (a: { data: { id: string; enabled: boolean } }) => Promise<unknown>;
  delFn: (a: { data: { id: string } }) => Promise<unknown>;
  refresh: () => void;
}) {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("10");
  const [maxUses, setMaxUses] = useState("1");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await createFn({ data: { code: code.trim(), amount_usdt: Number(amount), max_uses: Number(maxUses) } });
      toast.success("Coupon created");
      setCode(""); setAmount("10"); setMaxUses("1");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const now = Date.now();
  const isExpired = (c: Coupon) =>
    c.used_count >= c.max_uses || (c.expires_at && new Date(c.expires_at).getTime() < now);
  const active = coupons.filter((c) => !isExpired(c));
  const expired = coupons.filter((c) => isExpired(c));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coupon Codes</CardTitle>
        <CardDescription>One redemption per user. Total uses capped by Max Uses. Used / expired codes are listed separately and cannot be reactivated.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WELCOME10" /></div>
          <div><Label>Amount USDT</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><Label>Max uses</Label><Input type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} /></div>
            <Button onClick={add} disabled={busy || !code}>Add</Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm mb-2">Active ({active.length})</h3>
          <div className="space-y-2">
            {active.length === 0 && <p className="text-sm text-muted-foreground">No active coupons.</p>}
            {active.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 border rounded p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-semibold">{c.code}</div>
                  <div className="text-xs text-muted-foreground">${Number(c.amount_usdt).toFixed(2)} · {c.used_count}/{c.max_uses} used{c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}</div>
                </div>
                <Badge variant={c.enabled ? "default" : "secondary"}>{c.enabled ? "active" : "disabled"}</Badge>
                <Switch checked={c.enabled} onCheckedChange={async (v) => { await toggleFn({ data: { id: c.id, enabled: v } }); refresh(); }} />
                <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await delFn({ data: { id: c.id } }); refresh(); } }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm mb-2 text-muted-foreground">Expired / Used ({expired.length})</h3>
          <div className="space-y-2">
            {expired.length === 0 && <p className="text-sm text-muted-foreground">No expired coupons.</p>}
            {expired.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 border rounded p-3 opacity-60">
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-semibold line-through">{c.code}</div>
                  <div className="text-xs text-muted-foreground">${Number(c.amount_usdt).toFixed(2)} · {c.used_count}/{c.max_uses} used{c.expires_at ? ` · expired ${new Date(c.expires_at).toLocaleDateString()}` : ""}</div>
                </div>
                <Badge variant="destructive">expired</Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
