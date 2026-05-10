import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/app/billing")({
  component: Billing,
});

function Billing() {
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

  const total = (orders ?? []).filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.cost_usdt), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Billing & History</h1>

      <Card>
        <CardHeader>
          <CardDescription>Total Spent (Approved)</CardDescription>
          <CardTitle className="text-3xl">${total.toFixed(2)} USDT</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Orders</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>GB</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>TX Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                  <TableCell>{o.gb_amount} GB</TableCell>
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
    </div>
  );
}
