import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/dashboard")({
  component: UserDashboard,
});

function UserDashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

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

  const approved = (orders ?? []).filter((o) => o.status === "approved");
  const totalGB = approved.reduce((s, o) => s + o.gb_amount, 0);

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

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
          <CardDescription>All approved proxies with credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {approved.length === 0 && (
            <p className="text-sm text-muted-foreground">No proxies yet. Buy one from the Residential Proxy page.</p>
          )}
          {approved.map((o) => (
            <div key={o.id} className="border rounded-lg p-4 space-y-2 bg-card">
              <div className="flex items-center justify-between">
                <Badge>{o.gb_amount} GB</Badge>
                <span className="text-xs text-muted-foreground">Order: {o.order_no}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Host:</span>
                  <span>{o.host}:{o.port}</span>
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
                <div className="flex items-center gap-2 pt-2">
                  <code className="flex-1 bg-muted rounded px-2 py-1 text-xs break-all">{o.un}</code>
                  <Button size="icon" variant="outline" onClick={() => copy(o.un!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
