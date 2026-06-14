import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Copy, RefreshCw, Globe, Search } from "lucide-react";
import { toast } from "sonner";
import { refreshMyOrdersUsage } from "@/lib/admin.functions";
import { REGIONS, COUNTRIES, type Region } from "@/lib/proxy-regions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app/dashboard")({
  component: UserDashboard,
});

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

type OrderRow = {
  id: string;
  gb_amount: number;
  status: string;
  approved_at: string | null;
  order_no: string | null;
  un_flow: string | null;
  un_flow_used: string | null;
  host: string | null;
  port: string | null;
  proto: string | null;
  proxy_username: string | null;
  proxy_passwd: string | null;
  un: string | null;
};

function formatTraffic(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return "0 MB";
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

function formatAmount(gb: number): string {
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${Math.round(gb * 1024)} MB`;
}

function getExpiry(approvedAt: string | null): { date: Date | null; expired: boolean; label: string } {
  if (!approvedAt) return { date: null, expired: false, label: "Validity: 30 days" };
  const date = new Date(approvedAt);
  date.setDate(date.getDate() + 30);
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return { date, expired: true, label: "Expired" };
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const label =
    days > 0
      ? `Expires in ${days}d ${hours}h ${minutes}m ${seconds}s`
      : `Expires in ${hours}h ${minutes}m ${seconds}s`;
  return { date, expired: false, label };
}

function ProxyCard({ o, expired }: { o: OrderRow; expired: boolean }) {
  const totalBytes = Number(o.gb_amount) * GB;
  // Usage is tracked against the purchased amount. The upstream sub-user pool
  // (un_flow) may be larger than this single order's allocation, so we derive
  // remaining from used + total instead of trusting un_flow directly.
  const rawUsed = o.un_flow_used != null ? Number(o.un_flow_used) : 0;
  const usedBytes = Math.max(0, Math.min(totalBytes, rawUsed));
  const remainingBytes = Math.max(0, totalBytes - usedBytes);
  const usedPct = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const { date: expireDate, label: expireLabel } = getExpiry(o.approved_at);

  const [region, setRegion] = useState<Region>(REGIONS[0]);
  const [countryCode, setCountryCode] = useState<string | null>("BR");
  const [countryName, setCountryName] = useState<string | null>("Brazil");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [proto, setProto] = useState<"http" | "https" | "socks5">("socks5");

  const baseUser = o.proxy_username ?? "";
  const dynamicUser = countryCode
    ? `${baseUser}-zone-custom-region-${countryCode}`
    : `${baseUser}-zone-custom`;
  const port = o.port || "10000";
  const connString = `${region.ip}:${port}:${dynamicUser}:${o.proxy_passwd ?? ""}`;
  const protoUrl = `${proto}://${dynamicUser}:${o.proxy_passwd ?? ""}@${region.ip}:${port}`;

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(countryQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(countryQuery.toLowerCase()),
  );

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <div
      className={`border rounded-lg p-4 space-y-3 bg-card ${
        expired ? "border-destructive/50 text-destructive [&_*]:!text-destructive blur-[2px] hover:blur-0 transition-all" : ""
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={expired ? "destructive" : "default"}>{formatAmount(Number(o.gb_amount))}</Badge>
          {expired && <Badge variant="outline">Expired</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">Order: {o.order_no}</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">
            Used: <span className="font-semibold text-foreground">{formatTraffic(usedBytes)}</span>
          </span>
          <span className="text-muted-foreground">
            Remaining: <span className="font-semibold text-foreground">{formatTraffic(remainingBytes)}</span>
          </span>
          <span className="text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatTraffic(totalBytes)}</span>
          </span>
        </div>
        <Progress value={usedPct} />
        <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-1">
          <span>{usedPct.toFixed(1)}% used</span>
          <span>
            {expireLabel}
            {expireDate ? ` · ${expireDate.toLocaleDateString()}` : ""}
          </span>
        </div>
      </div>

      {/* Region selector */}
      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">Choose Region</div>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => {
            const active = region.code === r.code;
            return (
              <Button
                key={r.code}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setRegion(r)}
              >
                <Globe className="h-3 w-3 mr-1" />
                {r.label}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCountryOpen(true)}
          >
            More Country
          </Button>
        </div>
        {countryCode && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm font-medium">
              Country: {countryName} ({countryCode})
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCountryOpen(true)}
            >
              More Country
            </Button>
          </div>
        )}

      </div>

      {/* Protocol selector */}
      <div className="pt-2 border-t space-y-2">
        <div className="text-xs text-muted-foreground">Protocol</div>
        <div className="flex flex-wrap gap-2">
          {(["http", "https", "socks5"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={proto === p ? "default" : "outline"}
              onClick={() => setProto(p)}
            >
              {p.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-sm font-mono pt-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Host:</span>
          <span className="break-all">{region.ip}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => copy(region.ip)} title="Copy host">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Port:</span>
          <span>{port}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => copy(port)} title="Copy port">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Proto:</span>
          <span>{proto}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => copy(proto)} title="Copy protocol">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <span className="text-muted-foreground">User:</span>
          <span className="break-all">{dynamicUser}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => copy(dynamicUser)} title="Copy user">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Pass:</span>
          <span className="break-all">{o.proxy_passwd}</span>
          <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={() => copy(o.proxy_passwd ?? "")} title="Copy password">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted rounded px-2 py-1 text-xs break-all">{connString}</code>
          <Button size="icon" variant="outline" onClick={() => copy(connString)} title="Copy IP:Port:User:Pass">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted rounded px-2 py-1 text-xs break-all">{protoUrl}</code>
          <Button size="icon" variant="outline" onClick={() => copy(protoUrl)} title="Copy URL">
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={countryOpen} onOpenChange={setCountryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select Custom Country</DialogTitle>
            <DialogDescription>
              Pick a country to route through. Username becomes{" "}
              <code className="text-xs">{baseUser}-zone-custom-region-XX</code>
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search country..."
              value={countryQuery}
              onChange={(e) => setCountryQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
            {filteredCountries.map((c) => (
              <button
                key={c.code}
                onClick={() => {
                  setCountryCode(c.code);
                  setCountryName(c.name);
                  setCountryOpen(false);
                  setCountryQuery("");
                }}
                className="text-left px-3 py-2 rounded hover:bg-muted text-sm flex justify-between items-center"
              >
                <span>{c.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <p className="text-sm text-muted-foreground p-3">No countries match.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (role === "admin") navigate({ to: "/app/admin" });
  }, [role, navigate]);

  const { data: orders } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proxy_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OrderRow[];
    },
  });

  const refreshMut = useMutation({
    mutationFn: () => refreshMyOrdersUsage(),
    onSuccess: (r) => {
      toast.success(`Refreshed ${r.refreshed} proxy${r.refreshed === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["my-orders", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvedAll = (orders ?? []).filter((o) => o.status === "approved");
  const isQuotaExhausted = (o: OrderRow) => {
    if (o.un_flow == null) return false;
    try { return BigInt(o.un_flow) <= 0n; } catch { return false; }
  };
  const active = approvedAll.filter((o) => !getExpiry(o.approved_at).expired && !isQuotaExhausted(o));
  const expired = approvedAll.filter((o) => getExpiry(o.approved_at).expired || isQuotaExhausted(o));
  const totalGB = approvedAll.reduce((s, o) => s + Number(o.gb_amount), 0);

  // tick every second so countdown updates live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // auto-refresh usage every time the dashboard mounts (and when approved orders appear)
  useEffect(() => {
    if (approvedAll.length > 0 && !refreshMut.isPending) {
      refreshMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedAll.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending || approvedAll.length === 0}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMut.isPending ? "animate-spin" : ""}`} />
          Refresh Usage
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Purchased</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{formatAmount(totalGB)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Proxies</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{active.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Expired Proxies</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{expired.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Proxies</CardTitle>
          <CardDescription>Usage and validity (30 days from approval). Auto-refreshes on load.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.length === 0 && (
            <p className="text-sm text-muted-foreground">No active proxies. Buy one from the Residential Proxy page.</p>
          )}
          {active.map((o) => <ProxyCard key={o.id} o={o} expired={false} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expired Proxies</CardTitle>
          <CardDescription>Proxies past the 30-day validity window.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {expired.length === 0 && (
            <p className="text-sm text-muted-foreground">No expired proxies.</p>
          )}
          {expired.map((o) => <ProxyCard key={o.id} o={o} expired={true} />)}
        </CardContent>
      </Card>
    </div>
  );
}
