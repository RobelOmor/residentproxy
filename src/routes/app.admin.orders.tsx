import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListOrders, adminApproveOrder, adminRejectOrder, adminListTopups, adminApproveTopup, adminRejectTopup } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/app/admin/orders")({
  component: AdminOrders,
});

function AdminOrders() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listOrders = useServerFn(adminListOrders);
  const approve = useServerFn(adminApproveOrder);
  const reject = useServerFn(adminRejectOrder);
  const listTopups = useServerFn(adminListTopups);
  const approveTopup = useServerFn(adminApproveTopup);
  const rejectTopup = useServerFn(adminRejectTopup);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data } = useQuery({
    queryKey: ["admin-orders"],
    enabled: role === "admin",
    queryFn: () => listOrders(),
    refetchInterval: 10000,
  });

  const { data: topupData } = useQuery({
    queryKey: ["admin-topups"],
    enabled: role === "admin",
    queryFn: () => listTopups(),
    refetchInterval: 10000,
  });

  const handleApproveTopup = async (id: string) => {
    setBusyId(id);
    try {
      await approveTopup({ data: { topupId: id } });
      toast.success("Top-up approved & balance credited");
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectTopup = async (id: string) => {
    const note = prompt("Reason for rejection?") ?? undefined;
    setBusyId(id);
    try {
      await rejectTopup({ data: { topupId: id, note } });
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approve({ data: { orderId: id } });
      toast.success("Approved & proxy created");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-orders-summary"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt("Reason for rejection?") ?? undefined;
    setBusyId(id);
    try {
      await reject({ data: { orderId: id, note } });
      toast.success("Rejected");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  };

  if (role !== "admin") return <p>Loading...</p>;

  const orders = data?.orders ?? [];
  const pending = orders.filter((o) => o.status === "pending");
  const others = orders.filter((o) => o.status !== "pending");
  const topups = topupData?.topups ?? [];
  const pendingTopups = topups.filter((t) => t.status === "pending");
  const otherTopups = topups.filter((t) => t.status !== "pending");

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Orders</h1>

      <Card>
        <CardHeader><CardTitle>Pending ({pending.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>GB</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>TX Hash</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.user_email}</TableCell>
                  <TableCell><Badge>{o.gb_amount} GB</Badge></TableCell>
                  <TableCell>${Number(o.cost_usdt).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate">
                    {o.tx_hash}
                    {o.tx_hash && (
                      <a
                        href={`https://tronscan.org/#/transaction/${o.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block ml-1"
                      >
                        <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" disabled={busyId === o.id} onClick={() => handleApprove(o.id)}>
                      <Check className="h-4 w-4 mr-1" /> {busyId === o.id ? "..." : "Approve"}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busyId === o.id} onClick={() => handleReject(o.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!pending.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No pending orders</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Created Proxy Users</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>GB</TableHead>
                <TableHead>Proxy User</TableHead>
                <TableHead>Host:Port</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {others.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>{o.user_email}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "approved" ? "default" : "destructive"}>{o.status}</Badge>
                  </TableCell>
                  <TableCell>{o.gb_amount}</TableCell>
                  <TableCell className="font-mono text-xs">{o.proxy_username ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{o.host ? `${o.host}:${o.port}` : "-"}</TableCell>
                  <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!others.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No completed orders</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
