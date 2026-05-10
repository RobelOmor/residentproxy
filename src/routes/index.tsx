import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "711Proxy — Residential Proxy Reseller" },
      { name: "description", content: "Buy residential proxy GB instantly with USDT. Powered by 711Proxy." },
    ],
  }),
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app/dashboard" });
  }, [loading, user, navigate]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">711Proxy Reseller</h1>
        <p className="text-xl text-muted-foreground">
          Premium residential proxies. Pay with USDT. Get credentials instantly.
        </p>
        <div className="flex gap-3 justify-center pt-4">
          <Button asChild size="lg">
            <Link to="/auth">Get Started</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
