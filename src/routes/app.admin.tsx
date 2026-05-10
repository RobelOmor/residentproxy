import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetConfig, adminListOrders } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/admin")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const getConfig = useServerFn(adminGetConfig);
  const listOrders = useServerFn(adminListOrders);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data: cfg } = useQuery({
    queryKey: ["admin-config"],
    enabled: role === "admin",
    queryFn: () => getConfig(),
  });

  const { data: ord } = useQuery({
    queryKey: ["admin-orders-summary"],
    enabled: role === "admin",
    queryFn: () => listOrders(),
  });

  if (role !== "admin") return <p>Loading...</p>;

  const balance = cfg?.balance as Record<string, unknown> | null;
  const flowBalanceBytes = Number(balance?.flow_balance ?? 0);
  const flowBalanceGB = (flowBalanceBytes / (1024 ** 3)).toFixed(2);

  const orders = ord?.orders ?? [];
  const pending = orders.filter((o) => o.status === "pending");
  const approved = orders.filter((o) => o.status === "approved");
  const totalSold = approved.reduce((s, o) => s + o.gb_amount, 0);
  const totalRevenue = approved.reduce((s, o) => s + Number(o.cost_usdt), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Enterprise Balance</CardDescription></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{flowBalanceGB} GB</div>
            {balance?.error ? <p className="text-xs text-destructive mt-1">{String(balance.error)}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total GB Sold</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalSold} GB</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Revenue (USDT)</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold">${totalRevenue.toFixed(2)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending Orders</CardDescription></CardHeader>
          <CardContent><div className="text-3xl font-bold flex items-center gap-2">{pending.length} {pending.length > 0 && <Badge variant="destructive">action</Badge>}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Status</CardTitle>
          <CardDescription>{cfg?.config?.proxy_username ? "✅ 711proxy connected" : "⚠️ 711proxy not configured — go to Config"}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <p>Price per GB: <span className="font-bold">${Number(cfg?.config?.price_per_gb_usdt ?? 0).toFixed(2)} USDT</span></p>
          <p>USDT Address: <span className="font-mono text-xs">{cfg?.config?.usdt_address ?? "not set"}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
