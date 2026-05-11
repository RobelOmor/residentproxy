import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicPricing } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/proxy")({
  component: BuyProxy,
});

// Unit in MB. Min 1 MB, Max 100 GB = 102400 MB.
const MIN_MB = 1;
const MAX_MB = 100 * 1024;

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 2)} GB`;
  return `${mb} MB`;
}

function BuyProxy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchPricing = useServerFn(getPublicPricing);
  const [mb, setMb] = useState(1024);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => fetchPricing(),
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance_usdt")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const balance = Number(profile?.balance_usdt ?? 0);
  const pricePerGB = Number(pricing?.price_per_gb_usdt ?? 3);
  const gb = mb / 1024;
  const cost = Number((gb * pricePerGB).toFixed(4));
  const insufficient = cost > balance;

  const submit = async () => {
    if (!user) return;
    if (insufficient) return toast.error("Insufficient balance. Please top-up first.");
    setConfirmOpen(false);
    setBusy(true);
    const { error } = await supabase.rpc("purchase_proxy_with_balance" as never, {
      _gb: gb,
      _cost: cost,
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Order placed! $${cost.toFixed(4)} deducted. Awaiting admin provisioning.`);
    qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
    qc.invalidateQueries({ queryKey: ["my-orders"] });
    qc.invalidateQueries({ queryKey: ["my-orders-billing"] });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Buy Residential Proxy</h1>
        <Card className="px-4 py-2">
          <div className="text-xs text-muted-foreground">Available Balance</div>
          <div className="text-xl font-bold">${balance.toFixed(2)} USDT</div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose Traffic Amount</CardTitle>
          <CardDescription>
            Price: ${pricePerGB.toFixed(2)} USDT per GB · Min 1 MB · Max 100 GB · Paid from balance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <Label>Amount</Label>
              <span className="font-bold">{formatMB(mb)}</span>
            </div>
            <Slider
              value={[mb]}
              min={MIN_MB}
              max={MAX_MB}
              step={1}
              onValueChange={(v) => setMb(v[0])}
            />
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label className="text-xs text-muted-foreground">Megabytes (MB)</Label>
                <Input
                  type="number"
                  min={MIN_MB}
                  max={MAX_MB}
                  value={mb}
                  onChange={(e) =>
                    setMb(Math.min(MAX_MB, Math.max(MIN_MB, Number(e.target.value) || MIN_MB)))
                  }
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Gigabytes (GB)</Label>
                <Input
                  type="number"
                  min={0.001}
                  max={100}
                  step={0.001}
                  value={gb}
                  onChange={(e) => {
                    const g = Math.min(100, Math.max(0.001, Number(e.target.value) || 0.001));
                    setMb(Math.max(MIN_MB, Math.round(g * 1024)));
                  }}
                />
              </div>
            </div>
          </div>
          <div className="border-t pt-4 flex justify-between items-center flex-wrap gap-3">
            <div>
              <div className="text-sm text-muted-foreground">Total cost</div>
              <div className="text-3xl font-bold">${cost.toFixed(4)} USDT</div>
              {insufficient && (
                <div className="mt-1">
                  <Badge variant="destructive">Insufficient balance</Badge>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {insufficient && (
                <Button variant="outline" asChild>
                  <Link to="/app/billing">Top-up Balance</Link>
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || insufficient || !pricing}
              >
                {busy ? "Processing..." : "Purchase Now"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm purchase</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Traffic amount</span>
                  <span className="font-semibold text-foreground">{formatMB(mb)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price per GB</span>
                  <span className="font-semibold text-foreground">${pricePerGB.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-muted-foreground">Total cost</span>
                  <span className="font-bold text-foreground">${cost.toFixed(4)} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance after</span>
                  <span className="font-semibold text-foreground">
                    ${(balance - cost).toFixed(2)} USDT
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  Once confirmed, the amount is deducted immediately and the order goes to admin
                  for provisioning. This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={busy}>
              {busy ? "Processing..." : "Confirm & Pay"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
