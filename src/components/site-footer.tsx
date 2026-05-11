import { Link } from "@tanstack/react-router";
import { Globe2, Mail } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-card/50 mt-20">
      <div className="container mx-auto px-4 py-12 grid gap-8 md:grid-cols-4">
        <div className="space-y-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <Globe2 className="h-5 w-5 text-primary" />
            <span>ResidentProxy.com</span>
          </Link>
          <p className="text-sm text-muted-foreground">
            Premium residential proxies with HTTP, HTTPS &amp; SOCKS5 support. Pay with USDT, get instant access.
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm">Product</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/residential-proxy" className="hover:text-foreground">Residential Proxy</Link></li>
            <li><Link to="/locations" className="hover:text-foreground">Locations</Link></li>
            <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm">Company</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/about" className="hover:text-foreground">About Us</Link></li>
            <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
            <li><Link to="/refund-policy" className="hover:text-foreground">Refund Policy</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold mb-3 text-sm">Support</h3>
          <a
            href="mailto:support@residentproxy.com"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
          >
            <Mail className="h-4 w-4" />
            support@residentproxy.com
          </a>
        </div>
      </div>
      <div className="border-t">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {year} ResidentProxy.com. All rights reserved.</span>
          <div className="flex gap-4">
            <Link to="/refund-policy" className="hover:text-foreground">Refund Policy</Link>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
