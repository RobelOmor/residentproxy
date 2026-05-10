import { createFileRoute } from "@tanstack/react-router";
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
import { Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/proxy")({
  component: BuyProxy,
});

function BuyProxy() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchPricing = useServerFn(getPublicPricing);
  const [gb, setGb] = useState(5);
  const [txHash, setTxHash] = useState("");
  const [step, setStep] = useState<"select" | "pay" | "submitted">("select");
  const [busy, setBusy] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => fetchPricing(),
  });

  const price = pricing?.price_per_gb_usdt ?? 3;
  const total = (gb * Number(price)).toFixed(2);

  const submit = async () => {
    if (!user) return;
    if (!txHash.trim()) return toast.error("Please enter the USDT transaction hash");
    setBusy(true);
    const { error } = await supabase.from("proxy_orders").insert({
      user_id: user.id,
      gb_amount: gb,
      cost_usdt: Number(total),
      tx_hash: txHash.trim(),
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Order submitted! Admin will approve shortly.");
    setStep("submitted");
    qc.invalidateQueries({ queryKey: ["my-orders"] });
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Buy Residential Proxy</h1>

      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Choose GB Amount</CardTitle>
            <CardDescription>Price: ${Number(price).toFixed(2)} USDT per GB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <Label>GB Amount</Label>
                <span className="font-bold">{gb} GB</span>
              </div>
              <Slider value={[gb]} min={1} max={100} step={1} onValueChange={(v) => setGb(v[0])} />
              <Input
                type="number"
                min={1}
                value={gb}
                onChange={(e) => setGb(Math.max(1, Number(e.target.value) || 1))}
                className="mt-3"
              />
            </div>
            <div className="border-t pt-4 flex justify-between items-center">
              <div>
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="text-3xl font-bold">${total} USDT</div>
              </div>
              <Button size="lg" onClick={() => setStep("pay")}>Continue to Payment</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "pay" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Pay {total} USDT ({pricing?.usdt_network ?? "TRC20"})</CardTitle>
            <CardDescription>Send exactly the amount, then submit your TX hash for verification.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>USDT Address ({pricing?.usdt_network ?? "TRC20"})</Label>
              {pricing?.usdt_address ? (
                <div className="flex gap-2 mt-1">
                  <code className="flex-1 bg-muted rounded px-3 py-2 text-sm break-all">{pricing.usdt_address}</code>
                  <Button variant="outline" size="icon" onClick={() => copy(pricing.usdt_address!)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-destructive mt-1">Admin has not set a USDT address yet. Contact support.</p>
              )}
            </div>
            <div>
              <Label htmlFor="tx">Transaction Hash</Label>
              <Input id="tx" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x... or TRX hash" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("select")}>Back</Button>
              <Button onClick={submit} disabled={busy || !pricing?.usdt_address}>
                {busy ? "Submitting..." : "Submit Payment Confirmation"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "submitted" && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Badge variant="secondary" className="mr-2">Pending</Badge>
              Order Submitted
            </CardTitle>
            <CardDescription>Admin will verify your USDT transaction and create your proxy. Check Billing for status.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { setStep("select"); setTxHash(""); }}>Buy Another</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
