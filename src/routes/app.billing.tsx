import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPublicPricing } from "@/lib/admin.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/billing")({
  component: Billing,
});

function Billing() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchPricing = useServerFn(getPublicPricing);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: pricing } = useQuery({ queryKey: ["pricing"], queryFn: () => fetchPricing() });

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

  const { data: orders } = useQuery({
    queryKey: ["my-orders-billing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proxy_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: topups } = useQuery({
    queryKey: ["my-topups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topup_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const totalSpent = (orders ?? [])
    .filter((o) => o.status === "approved")
    .reduce((s, o) => s + Number(o.cost_usdt), 0);

  const balance = Number(profile?.balance_usdt ?? 0);

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  const submitTopup = async () => {
    const amt = Number(amount);
    if (!user) return;
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!txHash.trim()) return toast.error("Enter the USDT transaction hash");
    setBusy(true);
    const { error } = await supabase.from("topup_requests").insert({
      user_id: user.id,
      amount_usdt: amt,
      tx_hash: txHash.trim(),
      status: "pending",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Top-up request submitted. Awaiting admin approval.");
    setAmount("");
    setTxHash("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["my-topups", user.id] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Billing & History</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Top-up
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Available Balance</CardDescription>
            <CardTitle className="text-3xl">${balance.toFixed(2)} USDT</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Spent (Approved)</CardDescription>
            <CardTitle className="text-3xl">${totalSpent.toFixed(2)} USDT</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs defaultValue="topup">
        <TabsList>
          <TabsTrigger value="topup">Top-up history</TabsTrigger>
          <TabsTrigger value="usage">Usage history</TabsTrigger>
        </TabsList>

        <TabsContent value="topup">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order NO.</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>TX Hash</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Order Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topups?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.id.slice(0, 12)}…</TableCell>
                      <TableCell className="font-semibold">${Number(t.amount_usdt).toFixed(2)}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[220px] truncate">{t.tx_hash}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.status === "approved"
                              ? "default"
                              : t.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                        {t.admin_note ?? "-"}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {!topups?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No top-ups yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>TX Hash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders?.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {Number(o.gb_amount) >= 1
                          ? `${Number(o.gb_amount).toFixed(2)} GB`
                          : `${Math.round(Number(o.gb_amount) * 1024)} MB`}
                      </TableCell>
                      <TableCell>${Number(o.cost_usdt).toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={o.status === "approved" ? "default" : o.status === "rejected" ? "destructive" : "secondary"}>
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{o.tx_hash}</TableCell>
                    </TableRow>
                  ))}
                  {!orders?.length && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No orders yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top-up Balance</DialogTitle>
            <DialogDescription>
              Send USDT ({pricing?.usdt_network ?? "TRC20"}) to the address below, then submit the amount and TX hash.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>USDT Address ({pricing?.usdt_network ?? "TRC20"})</Label>
              {pricing?.usdt_address ? (
                <div className="mt-2 space-y-3">
                  <div className="flex justify-center">
                    <div className="bg-white p-2 rounded-lg border">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(pricing.usdt_address)}`}
                        alt="USDT Address QR Code"
                        width={180}
                        height={180}
                        className="block"
                      />
                    </div>
                  </div>
                  <p className="text-center text-xs text-muted-foreground">Scan QR or copy address manually</p>
                  <div className="flex gap-2">
                    <code className="flex-1 bg-muted rounded px-3 py-2 text-xs break-all select-all">{pricing.usdt_address}</code>
                    <Button variant="outline" size="icon" onClick={() => copy(pricing.usdt_address!)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-destructive mt-1">Admin has not set a USDT address yet.</p>
              )}
            </div>
            <div>
              <Label htmlFor="amt">Amount (USDT)</Label>
              <Input
                id="amt"
                type="number"
                min={0.01}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="50.00"
              />
            </div>
            <div>
              <Label htmlFor="tx">Transaction ID (TX Hash)</Label>
              <Input id="tx" value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x... or TRX hash" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submitTopup} disabled={busy || !pricing?.usdt_address}>
              {busy ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
