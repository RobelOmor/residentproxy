import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetConfig } from "@/lib/admin.functions";
import { adminGetStats } from "@/lib/support.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/admin/")({ component: AdminDashboard });

function AdminDashboard() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const getConfig = useServerFn(adminGetConfig);
  const statsFn = useServerFn(adminGetStats);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data: cfg } = useQuery({ queryKey: ["admin-config"], enabled: role === "admin", queryFn: () => getConfig() });
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], enabled: role === "admin", queryFn: () => statsFn(), refetchInterval: 15000 });

  if (role !== "admin") return <p>Loading...</p>;

  const balance = cfg?.balance as Record<string, unknown> | null;
  const enterpriseGB = (Number(balance?.flow_balance ?? 0) / 1024 ** 3).toFixed(2);

  const card = (label: string, val: string, badge?: { text: string; variant: "default" | "destructive" | "secondary" }) => (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
      <CardContent><div className="text-3xl font-bold flex items-center gap-2">{val}{badge && <Badge variant={badge.variant}>{badge.text}</Badge>}</div></CardContent>
    </Card>
  );

  const s = stats ?? {};
  const pending = Number(s.orders_pending ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-4">
        {card("Enterprise Balance", `${enterpriseGB} GB`)}
        {card("Total GB Sold", `${Number(s.gb_sold ?? 0).toFixed(2)} GB`)}
        {card("GB Remaining (active)", `${Number(s.gb_remaining ?? 0).toFixed(2)} GB`)}
        {card("USDT Sold", `$${Number(s.usdt_sold ?? 0).toFixed(2)}`)}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {card("USDT Topped Up", `$${Number(s.usdt_topped_up ?? 0).toFixed(2)}`)}
        {card("Pending Orders", String(pending), pending > 0 ? { text: "action", variant: "destructive" } : undefined)}
        {card("Approved Orders", String(s.orders_approved ?? 0))}
        {card("Rejected Orders", String(s.orders_rejected ?? 0))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Status</CardTitle>
          <CardDescription>{cfg?.config?.proxy_username && cfg?.config?.proxy_passwd ? "✅ Enterprise account connected — full automation active" : "⚠️ 711proxy enterprise credentials not set in Config — auto-provisioning disabled"}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <p>Price per GB: <span className="font-bold">${Number(cfg?.config?.price_per_gb_usdt ?? 0).toFixed(2)} USDT</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
