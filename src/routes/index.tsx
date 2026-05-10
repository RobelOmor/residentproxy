import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getProxyToken } from "@/lib/proxy.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "711Proxy Token Tester" },
      { name: "description", content: "Test the 711proxy EAPI token endpoint" },
    ],
  }),
});

function Index() {
  const fetchToken = useServerFn(getProxyToken);
  const [username, setUsername] = useState("");
  const [passwd, setPasswd] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; ok: boolean; body: Record<string, unknown> } | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const res = await fetchToken({ data: { username, passwd } });
      setResult(res);
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        body: { error: err instanceof Error ? err.message : "Unknown error" },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>711Proxy Token Tester</CardTitle>
          <CardDescription>
            POST <code className="text-xs">/eapi/token/</code> — username / password দিয়ে token নিন।
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username (email)</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="youremail@example.com"
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
                placeholder="yourpasswd"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Requesting..." : "Get Token"}
            </Button>
          </form>

          {result && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">Status:</span>
                <span
                  className={
                    result.ok
                      ? "text-green-600 dark:text-green-400"
                      : "text-destructive"
                  }
                >
                  {result.status} {result.ok ? "OK" : "Error"}
                </span>
              </div>
              <pre className="bg-muted text-muted-foreground rounded-md p-4 text-xs overflow-auto max-h-96">
                {JSON.stringify(result.body, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
