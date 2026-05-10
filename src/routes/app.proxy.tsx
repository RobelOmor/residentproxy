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
  const [mb, setMb] = useState(1024); // default 1 GB
  const [txHash, setTxHash] = useState("");
  const [step, setStep] = useState<"select" | "pay" | "submitted">("select");
  const [busy, setBusy] = useState(false);

  const { data: pricing } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => fetchPricing(),
  });

  const pricePerGB = Number(pricing?.price_per_gb_usdt ?? 3);
  const gb = mb / 1024;
  const total = (gb * pricePerGB).toFixed(4);

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
            <CardTitle>Step 1: Choose Traffic Amount</CardTitle>
            <CardDescription>
              Price: ${pricePerGB.toFixed(2)} USDT per GB · Min 1 MB · Max 100 GB
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
