import { useState, createContext, useContext, useCallback, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Ctx = { open: (mode?: "login" | "signup") => void; close: () => void };
const AuthModalCtx = createContext<Ctx>({ open: () => {}, close: () => {} });
export const useAuthModal = () => useContext(AuthModalCtx);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [openState, setOpenState] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const open = useCallback((m: "login" | "signup" = "login") => {
    setMode(m);
    setOpenState(true);
  }, []);
  const close = useCallback(() => setOpenState(false), []);

  return (
    <AuthModalCtx.Provider value={{ open, close }}>
      {children}
      <AuthDialog open={openState} onOpenChange={setOpenState} mode={mode} setMode={setMode} />
    </AuthModalCtx.Provider>
  );
}

function AuthDialog({
  open, onOpenChange, mode, setMode,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  mode: "login" | "signup";
  setMode: (m: "login" | "signup") => void;
}) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Logged in");
    onOpenChange(false);
    navigate({ to: "/app/dashboard" });
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setBusy(true);
    const { error } = await signUp(email, password);
    setBusy(false);
    if (error) return toast.error(error);
    toast.success("Account created!");
    onOpenChange(false);
    navigate({ to: "/app/dashboard" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Welcome to ResidentProxy.com</DialogTitle>
          <DialogDescription>Premium residential proxies. Pay with USDT.</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="space-y-3 mt-4">
            <Button type="button" variant="outline" className="w-full" onClick={signInWithGoogle}>
              Continue with Google
            </Button>
            <form onSubmit={onLogin} className="space-y-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in..." : "Login"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup" className="space-y-3 mt-4">
            <Button type="button" variant="outline" className="w-full" onClick={signInWithGoogle}>
              Sign up with Google
            </Button>
            <form onSubmit={onSignup} className="space-y-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <div className="space-y-1">
                <Label>Confirm</Label>
                <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating..." : "Sign Up"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
