import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app/settings")({
  component: Settings,
});

function Settings() {
  const { user } = useAuth();
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-3xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your profile information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div>
            <Label>User ID</Label>
            <Input value={user?.id ?? ""} disabled className="font-mono text-xs" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
