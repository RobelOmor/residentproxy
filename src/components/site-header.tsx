import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/components/auth-modal";
import { Menu, X, Globe2 } from "lucide-react";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/residential-proxy", label: "Residential Proxy" },
  { to: "/locations", label: "Locations" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold">
          <Globe2 className="h-6 w-6 text-primary" />
          <span>ResidentProxy<span className="text-primary">.com</span></span>
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              activeProps={{ className: "text-foreground" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-2">
          {user ? (
            <Button asChild>
              <Link to="/app/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => open("login")}>Log In</Button>
              <Button onClick={() => open("signup")}>Sign Up</Button>
            </>
          )}
        </div>

        <button
          aria-label="Toggle menu"
          className="lg:hidden p-2"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t bg-background">
          <div className="container mx-auto px-4 py-3 flex flex-col gap-2">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMobileOpen(false)}
                className="py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
            <div className="pt-2 flex gap-2">
              {user ? (
                <Button asChild className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Link to="/app/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="outline" className="flex-1" onClick={() => { open("login"); setMobileOpen(false); }}>
                    Log In
                  </Button>
                  <Button className="flex-1" onClick={() => { open("signup"); setMobileOpen(false); }}>
                    Sign Up
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
