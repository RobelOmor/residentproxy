import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/admin/subusers")({
  component: AdminSubUsers,
});

function AdminSubUsers() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    suname: "",
    passwd: "",
    host: "global.rotgb.711proxy.com",
    port: "10000",
    mb_capacity: 1024,
    note: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data: pool } = useQuery({
    queryKey: ["sub-user-pool"],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sub_user_pool")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 10000,
  });

  const add = async () => {
    if (!form.suname || !form.passwd || !form.mb_capacity) {
      return toast.error("suname, passwd and MB capacity required");
    }
    setBusy(true);
    const { error } = await supabase.from("sub_user_pool").insert({
      suname: form.suname.trim(),
      passwd: form.passwd.trim(),
      host: form.host.trim(),
      port: form.port.trim(),
      mb_capacity: form.mb_capacity,
      note: form.note || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Sub-user added to pool");
    setForm({ ...form, suname: "", passwd: "", note: "" });
    qc.invalidateQueries({ queryKey: ["sub-user-pool"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this pool entry?")) return;
    const { error } = await supabase.from("sub_user_pool").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["sub-user-pool"] });
  };

  const available = (pool ?? []).filter((p) => !p.assigned_to_order_id);
  const assigned = (pool ?? []).filter((p) => p.assigned_to_order_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sub-User Pool</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pre-create sub-users in 711proxy dashboard with a traffic limit, then add their credentials here.
          When a user order is approved, the smallest matching pool entry is auto-assigned.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Available</CardDescription>
            <CardTitle className="text-2xl">{available.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>Assigned</CardDescription>
            <CardTitle className="text-2xl">{assigned.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Sub-User to Pool</CardTitle>
          <CardDescription>
            Create the sub-user in 711proxy dashboard first (set username, password, and traffic limit there),
            then paste the credentials here with the same MB capacity.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Sub-username (suname)</Label>
            <Input value={form.suname} onChange={(e) => setForm({ ...form, suname: e.target.value })} placeholder="USER881191-zone-custom" />
          </div>
          <div>
            <Label>Password</Label>
            <Input value={form.passwd} onChange={(e) => setForm({ ...form, passwd: e.target.value })} placeholder="..." />
          </div>
          <div>
            <Label>MB Capacity (set in 711)</Label>
            <Input
              type="number"
              min={1}
              value={form.mb_capacity}
              onChange={(e) => setForm({ ...form, mb_capacity: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>Host</Label>
            <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div>
            <Label>Port</Label>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Button onClick={add} disabled={busy}>{busy ? "Adding..." : "Add to Pool"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pool Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sub-user</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Host:Port</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>MB Used (edit)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(pool ?? []).map((p) => (
                <PoolRow key={p.id} p={p} onChanged={() => qc.invalidateQueries({ queryKey: ["sub-user-pool"] })} onRemove={remove} />
              ))}
              {(pool ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No pool entries yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PoolRow({
  p,
  onChanged,
  onRemove,
}: {
  p: { id: string; suname: string; passwd: string; host: string; port: string; mb_capacity: number; mb_used: number; assigned_to_order_id: string | null; created_at: string };
  onChanged: () => void;
  onRemove: (id: string) => void;
}) {
  const [used, setUsed] = useState<string>(String(p.mb_used ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setUsed(String(p.mb_used ?? 0)); }, [p.mb_used]);

  const save = async () => {
    const n = Number(used);
    if (!isFinite(n) || n < 0) return toast.error("Invalid number");
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_pool_usage" as never, { _pool_id: p.id, _mb_used: n } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Usage updated & synced to user order");
    onChanged();
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{p.suname}</TableCell>
      <TableCell className="font-mono text-xs">{p.passwd}</TableCell>
      <TableCell className="font-mono text-xs">{p.host}:{p.port}</TableCell>
      <TableCell>{Number(p.mb_capacity).toLocaleString()} MB</TableCell>
      <TableCell>
        <div className="flex gap-1 items-center">
          <Input
            className="h-8 w-24"
            type="number"
            min={0}
            step="0.01"
            value={used}
            onChange={(e) => setUsed(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            {saving ? "..." : "Save"}
          </Button>
        </div>
      </TableCell>
      <TableCell>
        {p.assigned_to_order_id ? <Badge>Assigned</Badge> : <Badge variant="secondary">Available</Badge>}
      </TableCell>
      <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
      <TableCell>
        {!p.assigned_to_order_id && (
          <Button size="icon" variant="ghost" onClick={() => onRemove(p.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
