import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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
import { Database, Sparkles } from "lucide-react";

export const Route = createFileRoute("/app/proxy")({
  component: BuyProxy,
});

const MIN_GB = 1;
const MAX_GB = 100;
const PRICE_AT_MIN = 3.0;
const PRICE_AT_MAX = 2.0;

function pricePerGB(gb: number): number {
  const clamped = Math.min(MAX_GB, Math.max(MIN_GB, gb));
  return PRICE_AT_MIN - ((clamped - 1) / 99) * (PRICE_AT_MIN - PRICE_AT_MAX);
}

function BuyProxy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [gb, setGb] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
  const rate = pricePerGB(gb);
  const cost = Number((gb * rate).toFixed(4));
  const insufficient = cost > balance;
  const bulkDiscount = gb > 10;

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
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">
          Buy Residential Proxy
        </h1>
        <Card className="px-4 py-2">
          <div className="text-xs text-muted-foreground">Available Balance</div>
          <div className="text-lg sm:text-xl font-bold">${balance.toFixed(2)} USDT</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Storage Pricing Calculator
          </CardTitle>
          <CardDescription>
            Min 1 GB · Max 100 GB · Volume discount auto-applied
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* GB display */}
          <div className="text-center">
            <div className="text-6xl font-bold tracking-tight text-slate-900 dark:text-foreground">
              {gb}
              <span className="text-2xl font-semibold text-muted-foreground ml-2">GB</span>
            </div>
            {bulkDiscount && (
              <Badge className="mt-3 bg-blue-600 hover:bg-blue-600 text-white gap-1">
                <Sparkles className="h-3 w-3" />
                Bulk Discount Applied
              </Badge>
            )}
          </div>

          {/* Slider */}
          <div className="space-y-3">
            <Slider
              value={[gb]}
              min={MIN_GB}
              max={MAX_GB}
              step={1}
              onValueChange={(v) => setGb(v[0])}
              className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5 [&_[role=slider]]:border-blue-600 [&_[data-orientation=horizontal]>span]:bg-blue-600"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 GB</span>
              <span>100 GB</span>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Enter exact amount (GB)</Label>
              <Input
                type="number"
                min={MIN_GB}
                max={MAX_GB}
                step={1}
                value={gb}
                onChange={(e) =>
                  setGb(Math.min(MAX_GB, Math.max(MIN_GB, Math.round(Number(e.target.value) || MIN_GB))))
                }
              />
            </div>
          </div>

          {/* Pricing card */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Current Rate
                </div>
                <div className="text-xl sm:text-2xl font-bold text-blue-600">
                  ${rate.toFixed(2)}
                  <span className="text-sm text-muted-foreground font-normal">/GB</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Amount
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-foreground">
                  ${cost.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">USDT</div>
              </div>
            </div>
            {insufficient && (
              <Badge variant="destructive" className="mb-2">
                Insufficient balance
              </Badge>
            )}
            <div className="flex gap-2 justify-end">
              {insufficient && (
                <Button variant="outline" asChild>
                  <Link to="/app/billing">Top-up Balance</Link>
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => setConfirmOpen(true)}
                disabled={busy || insufficient}
                className="bg-blue-600 hover:bg-blue-700 text-white transition-transform hover:scale-105"
              >
                {busy ? "Processing..." : "Purchase Now"}
              </Button>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Price scales down automatically as you increase volume.
          </p>
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
                  <span className="font-semibold text-foreground">{gb} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price per GB</span>
                  <span className="font-semibold text-foreground">${rate.toFixed(2)}</span>
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
