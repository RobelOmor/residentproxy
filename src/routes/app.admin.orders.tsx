import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListOrders, adminApproveOrder, adminRejectOrder, adminListTopups, adminApproveTopup, adminRejectTopup, adminDeleteOrder } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, X, ExternalLink, Copy, Trash2 } from "lucide-react";

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
  const deleteOrder = useServerFn(adminDeleteOrder);
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

  // (no per-order username override anymore — approve uses suggested proxy_username)

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  const handleApprove = async (id: string, suggestedUser: string | null) => {
    const username = (suggestedUser ?? "").trim();
    if (!username) {
      toast.error("No suggested username on this order");
      return;
    }
    setBusyId(id);
    try {
      await approve({ data: { orderId: id, orderNo: username } });
      toast.success("Approved & verified on 711proxy");
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
        <CardHeader>
          <CardTitle>Pending ({pending.length})</CardTitle>
          <p className="text-sm text-muted-foreground">
            Copy the suggested User / Pass / MB-limit, manually create the sub-user on{" "}
            <a href="https://711proxy.com" target="_blank" rel="noreferrer" className="underline">
              711proxy
            </a>{" "}
            sub-user page, then click Approve. Server verifies the username exists on 711proxy with matching quota.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.map((o) => {
            const mbLimit = Math.round(Number(o.gb_amount) * 1024);
            const sizeLabel =
              Number(o.gb_amount) >= 1
                ? `${Number(o.gb_amount).toFixed(2)} GB`
                : `${mbLimit} MB`;
            return (
              <div key={o.id} className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="font-medium">{o.user_email}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()} · ${Number(o.cost_usdt).toFixed(2)} ·{" "}
                      <span className="font-mono">{o.tx_hash}</span>
                      {o.tx_hash && o.tx_hash !== "BALANCE" && (
                        <a
                          href={`https://tronscan.org/#/transaction/${o.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block ml-1"
                        >
                          <ExternalLink className="h-3 w-3 inline" />
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge>{sizeLabel}</Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Suggested User</Label>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono break-all">
                        {o.proxy_username ?? "-"}
                      </code>
                      <Button size="icon" variant="outline" onClick={() => copy(o.proxy_username ?? "")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Suggested Pass</Label>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono break-all">
                        {o.proxy_passwd ?? "-"}
                      </code>
                      <Button size="icon" variant="outline" onClick={() => copy(o.proxy_passwd ?? "")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Limit (MB)</Label>
                    <div className="flex items-center gap-1">
                      <code className="flex-1 bg-muted rounded px-2 py-1 text-xs font-mono">{mbLimit}</code>
                      <Button size="icon" variant="outline" onClick={() => copy(String(mbLimit))}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={busyId === o.id} onClick={() => handleApprove(o.id, o.proxy_username)}>
                    <Check className="h-4 w-4 mr-1" /> {busyId === o.id ? "Verifying..." : "Approve"}
                  </Button>
                  <Button variant="destructive" disabled={busyId === o.id} onClick={() => handleReject(o.id)}>
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            );
          })}
          {!pending.length && (
            <p className="text-center text-sm text-muted-foreground py-4">No pending orders</p>
          )}
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
                  <TableCell>{Number(o.gb_amount) >= 1 ? `${Number(o.gb_amount).toFixed(2)} GB` : `${Math.round(Number(o.gb_amount) * 1024)} MB`}</TableCell>
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

      <Card>
        <CardHeader><CardTitle>Top-up Requests ({pendingTopups.length} pending)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Current Balance</TableHead>
                <TableHead>TX Hash</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingTopups.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.user_email}</TableCell>
                  <TableCell className="font-semibold">${Number(t.amount_usdt).toFixed(2)}</TableCell>
                  <TableCell>${Number(t.user_balance).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate">
                    {t.tx_hash}
                    {t.tx_hash && (
                      <a
                        href={`https://tronscan.org/#/transaction/${t.tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block ml-1"
                      >
                        <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" disabled={busyId === t.id} onClick={() => handleApproveTopup(t.id)}>
                      <Check className="h-4 w-4 mr-1" /> {busyId === t.id ? "..." : "Approve"}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={busyId === t.id} onClick={() => handleRejectTopup(t.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!pendingTopups.length && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No pending top-ups</TableCell></TableRow>
              )}
              {otherTopups.map((t) => (
                <TableRow key={t.id} className="opacity-70">
                  <TableCell>{t.user_email}</TableCell>
                  <TableCell>${Number(t.amount_usdt).toFixed(2)}</TableCell>
                  <TableCell>${Number(t.user_balance).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate">{t.tx_hash}</TableCell>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={t.status === "approved" ? "default" : "destructive"}>{t.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
