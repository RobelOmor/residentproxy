import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getProxyToken,
  getEnterpriseBalance,
  createOrder,
  addWhitelist,
  type JsonValue,
} from "@/lib/proxy.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "711Proxy Console" },
      { name: "description", content: "Manage 711proxy enterprise account" },
    ],
  }),
});

type ApiResult = { status: number; ok: boolean; body: JsonValue };

function ResultBlock({ result }: { result: ApiResult | null }) {
  if (!result) return null;
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">Status:</span>
        <span className={result.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}>
          {result.status} {result.ok ? "OK" : "Error"}
        </span>
      </div>
      <pre className="bg-muted text-muted-foreground rounded-md p-4 text-xs overflow-auto max-h-80">
        {JSON.stringify(result.body, null, 2)}
      </pre>
    </div>
  );
}

function extractToken(body: JsonValue): string | null {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const results = (body as Record<string, JsonValue>).results;
    if (results && typeof results === "object" && !Array.isArray(results)) {
      const t = (results as Record<string, JsonValue>).token;
      if (typeof t === "string") return t;
    }
  }
  return null;
}

function Index() {
  const fetchToken = useServerFn(getProxyToken);
  const fetchBalance = useServerFn(getEnterpriseBalance);
  const submitOrder = useServerFn(createOrder);
  const submitWhitelist = useServerFn(addWhitelist);

  const [username, setUsername] = useState("");
  const [passwd, setPasswd] = useState("");
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  const [tokenResult, setTokenResult] = useState<ApiResult | null>(null);
  const [balanceResult, setBalanceResult] = useState<ApiResult | null>(null);
  const [orderResult, setOrderResult] = useState<ApiResult | null>(null);
  const [whitelistResult, setWhitelistResult] = useState<ApiResult | null>(null);

  // Order form
  const [flow, setFlow] = useState("1");
  // Whitelist form
  const [ip, setIp] = useState("");

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("token");
    setTokenResult(null);
    setBalanceResult(null);
    try {
      const tRes = await fetchToken({ data: { username, passwd } });
      setTokenResult(tRes);
      const t = extractToken(tRes.body);
      if (t) {
        setToken(t);
        setLoading("balance");
        const bRes = await fetchBalance({ data: { token: t } });
        setBalanceResult(bRes);
      }
    } finally {
      setLoading(null);
    }
  };

  const onRefreshBalance = async () => {
    if (!token) return;
    setLoading("balance");
    try {
      // Re-issue token first since tokens may be short-lived
      const tRes = await fetchToken({ data: { username, passwd } });
      const t = extractToken(tRes.body) ?? token;
      setToken(t);
      const bRes = await fetchBalance({ data: { token: t } });
      setBalanceResult(bRes);
    } finally {
      setLoading(null);
    }
  };

  const onCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading("order");
    setOrderResult(null);
    try {
      const tRes = await fetchToken({ data: { username, passwd } });
      const t = extractToken(tRes.body) ?? token;
      setToken(t);
      const res = await submitOrder({ data: { token: t, flow: Number(flow) } });
      setOrderResult(res);
    } finally {
      setLoading(null);
    }
  };

  const onAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading("whitelist");
    setWhitelistResult(null);
    try {
      const tRes = await fetchToken({ data: { username, passwd } });
      const t = extractToken(tRes.body) ?? token;
      setToken(t);
      const res = await submitWhitelist({ data: { token: t, ip } });
      setWhitelistResult(res);
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">711Proxy Console</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Login → Balance দেখুন → Order বা Whitelist manage করুন।
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>1. Login (Get Token)</CardTitle>
            <CardDescription>POST /eapi/token/</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onLogin} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="username">Username (email)</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passwd">Password</Label>
                  <Input
                    id="passwd"
                    type="password"
                    value={passwd}
                    onChange={(e) => setPasswd(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button type="submit" disabled={loading !== null} className="w-full">
                {loading === "token" ? "Logging in..." : "Login & Fetch Balance"}
              </Button>
            </form>
            {token && (
              <div className="mt-4 text-xs">
                <span className="font-medium">Active token: </span>
                <code className="bg-muted px-2 py-1 rounded">{token}</code>
              </div>
            )}
            <ResultBlock result={tokenResult} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>2. Enterprise Balance</CardTitle>
              <CardDescription>GET /eapi/balance/</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onRefreshBalance}
              disabled={!token || loading !== null}
            >
              {loading === "balance" ? "Loading..." : "Refresh"}
            </Button>
          </CardHeader>
          <CardContent>
            {!balanceResult && (
              <p className="text-sm text-muted-foreground">
                Login করার পর balance এখানে দেখাবে।
              </p>
            )}
            <ResultBlock result={balanceResult} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Actions</CardTitle>
            <CardDescription>Order ও Whitelist manage করুন</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="order">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="order">Create Order</TabsTrigger>
                <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
              </TabsList>

              <TabsContent value="order" className="mt-4">
                <form onSubmit={onCreateOrder} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="flow">Flow (GB)</Label>
                    <Input
                      id="flow"
                      type="number"
                      min="1"
                      value={flow}
                      onChange={(e) => setFlow(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={!token || loading !== null}>
                    {loading === "order" ? "Creating..." : "Create Order"}
                  </Button>
                </form>
                <ResultBlock result={orderResult} />
              </TabsContent>

              <TabsContent value="whitelist" className="mt-4">
                <form onSubmit={onAddWhitelist} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ip">IP Address</Label>
                    <Input
                      id="ip"
                      value={ip}
                      onChange={(e) => setIp(e.target.value)}
                      placeholder="1.2.3.4"
                      required
                    />
                  </div>
                  <Button type="submit" disabled={!token || loading !== null}>
                    {loading === "whitelist" ? "Adding..." : "Add to Whitelist"}
                  </Button>
                </form>
                <ResultBlock result={whitelistResult} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
