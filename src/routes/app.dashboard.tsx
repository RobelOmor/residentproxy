import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { refreshMyOrdersUsage } from "@/lib/admin.functions";

export const Route = createFileRoute("/app/dashboard")({
  component: UserDashboard,
});

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

function formatTraffic(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return "0 MB";
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

function getExpiry(approvedAt: string | null): { date: Date | null; label: string } {
  if (!approvedAt) return { date: null, label: "Validity: 30 days" };
  const date = new Date(approvedAt);
  date.setDate(date.getDate() + 30);
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return { date, label: "Expired" };
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const label =
    days > 0
      ? `Expires in ${days}d ${hours}h ${minutes}m ${seconds}s`
      : `Expires in ${hours}h ${minutes}m ${seconds}s`;
  return { date, label };
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
      return data;
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

  const approved = (orders ?? []).filter((o) => o.status === "approved");
  const totalGB = approved.reduce((s, o) => s + o.gb_amount, 0);

  // tick every second so countdown updates live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // auto-refresh usage once on mount when there are approved orders
  useEffect(() => {
    if (approved.length > 0 && !refreshMut.isPending) {
      refreshMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved.length]);

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending || approved.length === 0}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshMut.isPending ? "animate-spin" : ""}`} />
          Refresh Usage
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total GB Purchased</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalGB} GB</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Proxies</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{approved.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Orders</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{orders?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Proxies</CardTitle>
          <CardDescription>Usage and validity (30 days from approval). Click Refresh to update from 711proxy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approved.length === 0 && (
            <p className="text-sm text-muted-foreground">No proxies yet. Buy one from the Residential Proxy page.</p>
          )}
          {approved.map((o) => {
            const totalBytes = o.gb_amount * GB;
            const remainingBytes = o.un_flow ? Number(o.un_flow) : totalBytes;
            const usedBytes =
              o.un_flow_used != null
                ? Number(o.un_flow_used)
                : Math.max(0, totalBytes - remainingBytes);
            const usedPct = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
            const { date: expireDate, label: expireLabel } = getExpiry(o.approved_at);

            return (
              <div key={o.id} className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Badge>{o.gb_amount} GB</Badge>
                  <span className="text-xs text-muted-foreground">Order: {o.order_no}</span>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
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
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{usedPct.toFixed(1)}% used</span>
                    <span>
                      {expireLabel}
                      {expireDate ? ` · ${expireDate.toLocaleDateString()}` : ""}
                    </span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 text-sm font-mono pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Host:</span>
                    <span>{o.host}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Port:</span>
                    <span>{o.port}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Proto:</span>
                    <span>{o.proto}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">User:</span>
                    <span>{o.proxy_username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Pass:</span>
                    <span>{o.proxy_passwd}</span>
                  </div>
                </div>
                {o.un && (
                  <div className="flex items-center gap-2 pt-1">
                    <code className="flex-1 bg-muted rounded px-2 py-1 text-xs break-all">{o.un}</code>
                    <Button size="icon" variant="outline" onClick={() => copy(o.un!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
