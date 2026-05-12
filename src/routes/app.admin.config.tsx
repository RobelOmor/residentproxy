import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetConfig, adminSaveConfig, adminTest711, adminTestDashboardToken } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/config")({
  component: AdminConfig,
});

function AdminConfig() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getConfig = useServerFn(adminGetConfig);
  const saveConfig = useServerFn(adminSaveConfig);
  const test711 = useServerFn(adminTest711);
  const testDashToken = useServerFn(adminTestDashboardToken);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-config"],
    enabled: role === "admin",
    queryFn: () => getConfig(),
  });

  const [username, setUsername] = useState("");
  const [passwd, setPasswd] = useState("");
  const [dashToken, setDashToken] = useState("");
  const [price, setPrice] = useState("3.00");
  const [usdt, setUsdt] = useState("");
  const [network, setNetwork] = useState("TRC20");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.config) {
      setUsername(data.config.proxy_username ?? "");
      setPasswd(data.config.proxy_passwd ?? "");
      setDashToken(data.config.proxy_dashboard_token ?? "");
      setPrice(String(data.config.price_per_gb_usdt ?? "3.00"));
      setUsdt(data.config.usdt_address ?? "");
      setNetwork(data.config.usdt_network ?? "TRC20");
    }
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await saveConfig({
        data: {
          proxy_username: username,
          proxy_passwd: passwd,
          proxy_dashboard_token: dashToken,
          price_per_gb_usdt: Number(price),
          usdt_address: usdt,
          usdt_network: network,
        },
      });
      toast.success("Config saved");
      qc.invalidateQueries({ queryKey: ["admin-config"] });
      qc.invalidateQueries({ queryKey: ["pricing"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    if (!username || !passwd) {
      toast.error("Enter username & password first");
      return;
    }
    setBusy(true);
    try {
      const res = await test711({ data: { username, passwd } });
      if (res.ok) {
        const gb = (Number((res.balance as Record<string, unknown>)?.flow_balance ?? 0) / 1024 ** 3).toFixed(2);
        toast.success(`Connected ✓ Balance: ${gb} GB`);
        qc.setQueryData(["admin-config"], (old: unknown) => ({
          ...(old as object),
          balance: res.balance,
        }));
      } else {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  const testToken = async () => {
    if (!dashToken) { toast.error("Paste a dashboard token first"); return; }
    setBusy(true);
    try {
      const res = await testDashToken({ data: { token: dashToken } });
      if (res.ok) toast.success("Dashboard token works ✓");
      else toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  };

  if (role !== "admin" || isLoading) return <p>Loading...</p>;

  const balance = data?.balance as Record<string, unknown> | null;
  const flowBalance = Number(balance?.flow_balance ?? 0);
  const flowGB = (flowBalance / 1024 ** 3).toFixed(2);
  const hasError = balance && typeof balance.error === "string";

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>711Proxy Login</CardTitle>
          <CardDescription>Enterprise account credentials. Used to fetch balance and create proxy orders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="u">Username (email)</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="p">Password</Label>
            <Input id="p" type="password" value={passwd} onChange={(e) => setPasswd(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={testConnection} disabled={busy}>
            Test Connection
          </Button>
          {balance && !hasError && flowBalance > 0 ? (
            <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
              <div>✅ Connected — Enterprise Balance: <span className="font-bold">{flowGB} GB</span></div>
              <div className="text-xs text-muted-foreground">Raw flow_balance: {String(balance.flow_balance ?? "—")} bytes</div>
            </div>
          ) : null}
          {hasError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {String(balance.error)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live Usage Sync (Dashboard Token)</CardTitle>
          <CardDescription>
            Paste your 711proxy dashboard session token so we can read live <code>used / remaining MB</code> for each sub-user.
            <br />How: log in to <code>dashboard.711proxy.com</code> in your browser → press F12 → Application tab → Cookies → copy the <code>token</code> value → paste it here.
            Tokens usually last 1–2 weeks; re-paste when sync starts failing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="dt">Dashboard token</Label>
            <Input id="dt" type="password" value={dashToken} onChange={(e) => setDashToken(e.target.value)} placeholder="paste cookie value here" />
          </div>
          <Button type="button" variant="outline" onClick={testToken} disabled={busy}>
            Test Token
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Pricing, USDT addresses, Binance Pay, Telegram agents and coupons are managed in the{" "}
        <a href="/app/admin/payment" className="underline font-semibold text-primary">Payment</a> page.
      </p>

      <Button onClick={save} disabled={busy} size="lg">
        {busy ? "Saving..." : "Save Configuration"}
      </Button>
    </div>
  );
}
