import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "user" | null;

interface AuthCtx {
  session: Session | null;
  user: User | null;
  role: Role;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Inject Supabase access token into server-function fetch calls
    if (typeof window !== "undefined" && !(window as unknown as { __sbFetchPatched?: boolean }).__sbFetchPatched) {
      const orig = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        try {
          const url = typeof input === "string" ? input : input instanceof Request ? input.url : (input as URL).toString();
          const isServerFn = url.includes("/_serverFn/") || url.includes("/_server");
          if (isServerFn) {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) {
              const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
              if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
              return orig(input, { ...init, headers });
            }
          }
        } catch {
          // ignore and fall through
        }
        return orig(input, init);
      };
      (window as unknown as { __sbFetchPatched?: boolean }).__sbFetchPatched = true;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // defer role fetch to avoid deadlock
        setTimeout(() => {
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", sess.user.id)
            .maybeSingle()
            .then(({ data }) => setRole((data?.role as Role) ?? "user"));
        }, 0);
      } else {
        setRole(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", s.user.id)
          .maybeSingle()
          .then(({ data }) => setRole((data?.role as Role) ?? "user"));
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/app/dashboard`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/dashboard` },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ session, user, role, loading, signIn, signUp, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
