import { Fragment } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListUsersWithOrders, adminExpireOrder, adminRejectOrder } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/users")({
  component: AdminUsers,
});

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
function fmtBytes(b: number) {
  if (!isFinite(b) || b <= 0) return "0 MB";
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`;
  return `${(b / MB).toFixed(1)} MB`;
}

function AdminUsers() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listUsers = useServerFn(adminListUsersWithOrders);
  const expireOrder = useServerFn(adminExpireOrder);
  const rejectOrder = useServerFn(adminRejectOrder);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data } = useQuery({
    queryKey: ["admin-users-with-orders"],
    enabled: role === "admin",
    queryFn: () => listUsers(),
    refetchInterval: 15000,
  });

  if (role !== "admin") return <p>Loading...</p>;

  const users = (data?.users ?? []).filter((u) =>
    !search.trim()
      ? true
      : (u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.display_name?.toLowerCase().includes(search.toLowerCase())),
  );

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const handleExpire = async (orderId: string) => {
    if (!confirm("Mark this approved proxy as expired/rejected? User will lose access.")) return;
    setBusyId(orderId);
    try {
      await expireOrder({ data: { orderId, note: "Expired by admin" } });
      toast.success("Proxy expired");
      qc.invalidateQueries({ queryKey: ["admin-users-with-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectPending = async (orderId: string) => {
    const note = prompt("Reason for rejection (refunds balance)?") ?? undefined;
    setBusyId(orderId);
    try {
      await rejectOrder({ data: { orderId, note } });
      toast.success("Rejected & refunded");
      qc.invalidateQueries({ queryKey: ["admin-users-with-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">User Management</h1>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 w-64"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Total GB</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggle(u.id)}
                  >
                    <TableCell>
                      {expanded[u.id] ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>${u.balance_usdt.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge>{u.approved_count}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.pending_count > 0 ? (
                        <Badge variant="destructive">{u.pending_count}</Badge>
                      ) : (
                        <Badge variant="secondary">0</Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.total_gb.toFixed(2)} GB</TableCell>
                    <TableCell>${u.total_spent.toFixed(2)}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                  {expanded[u.id] && (
                    <TableRow key={`${u.id}-expand`}>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        {u.orders.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No orders.</p>
                        ) : (
                          <div className="space-y-2">
                            {u.orders.map((o) => {
                              const total = Number(o.gb_amount) * GB;
                              const remaining = o.un_flow ? Number(o.un_flow) : total;
                              const used =
                                o.un_flow_used != null
                                  ? Number(o.un_flow_used)
                                  : Math.max(0, total - remaining);
                              return (
                                <div
                                  key={o.id}
                                  className="border rounded p-3 bg-card flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
                                >
                                  <Badge
                                    variant={
                                      o.status === "approved"
                                        ? "default"
                                        : o.status === "pending"
                                          ? "secondary"
                                          : "destructive"
                                    }
                                  >
                                    {o.status}
                                  </Badge>
                                  <span className="font-mono text-xs">
                                    {Number(o.gb_amount) >= 1
                                      ? `${Number(o.gb_amount).toFixed(2)} GB`
                                      : `${Math.round(Number(o.gb_amount) * 1024)} MB`}
                                  </span>
                                  <span className="text-muted-foreground text-xs">
                                    Used: <b className="text-foreground">{fmtBytes(used)}</b> /{" "}
                                    {fmtBytes(total)}
                                  </span>
                                  {o.proxy_username && (
                                    <span className="font-mono text-xs">
                                      {o.proxy_username}@{o.host}:{o.port}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    {new Date(o.created_at).toLocaleDateString()}
                                  </span>
                                  {o.status === "approved" && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={busyId === o.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExpire(o.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" /> Expire
                                    </Button>
                                  )}
                                  {o.status === "pending" && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={busyId === o.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectPending(o.id);
                                      }}
                                    >
                                      <X className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-6"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
