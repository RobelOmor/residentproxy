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

  const tokenSetAt = data?.config?.proxy_dashboard_token_set_at
    ? new Date(data.config.proxy_dashboard_token_set_at as string).getTime()
    : null;
  const tokenAgeDays = tokenSetAt ? (Date.now() - tokenSetAt) / 86400000 : null;
  const tokenExpired = tokenAgeDays != null && tokenAgeDays >= 14;
  const tokenExpiringSoon = tokenAgeDays != null && tokenAgeDays >= 13 && tokenAgeDays < 14;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Configuration</h1>

      {tokenExpired && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive font-semibold">
          🚨 Dashboard token has EXPIRED ({Math.floor(tokenAgeDays!)} days old). Live usage sync is broken — paste a fresh token below.
        </div>
      )}
      {tokenExpiringSoon && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive">
          ⚠️ Dashboard token expires in less than 1 day ({Math.floor(tokenAgeDays!)} days old). Refresh it now to avoid sync downtime.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live Usage Sync (Dashboard Token)</CardTitle>
          <CardDescription>
            Paste your 711proxy dashboard session token so we can read live <code>used / remaining MB</code> for each sub-user.
            <br />How: log in to <code>dashboard.711proxy.com</code> in your browser → press F12 → Application tab → Cookies → copy the <code>token</code> value → paste it here.
            Tokens usually last ~14 days; we'll warn you 1 day before expiry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="dt">Dashboard token</Label>
            <Input id="dt" type="password" value={dashToken} onChange={(e) => setDashToken(e.target.value)} placeholder="paste cookie value here" />
            {tokenSetAt && (
              <p className="text-xs text-muted-foreground mt-1">Set {Math.floor(tokenAgeDays!)} days ago.</p>
            )}
          </div>
          <Button type="button" variant="outline" onClick={testToken} disabled={busy}>
            Test Token
          </Button>
        </CardContent>
      </Card>

      <details className="border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-sm">711Proxy Login (advanced — usually not needed)</summary>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Enterprise account credentials. Only required for legacy auto-create flow; the dashboard token above handles live sync.</p>
          <div>
            <Label htmlFor="u">Username (email)</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="p">Password</Label>
            <Input id="p" type="password" value={passwd} onChange={(e) => setPasswd(e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={busy}>
            Test Connection
          </Button>
          {balance && !hasError && flowBalance > 0 ? (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              ✅ Connected — Enterprise Balance: <span className="font-bold">{flowGB} GB</span>
            </div>
          ) : null}
          {hasError ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {String(balance.error)}
            </div>
          ) : null}
        </div>
      </details>

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
