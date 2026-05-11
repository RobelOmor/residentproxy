import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAuthModal } from "@/components/auth-modal";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Globe2, Shield, Zap, Lock, ArrowRight, Check, Server, Network, Wallet,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "ResidentProxy.com — Premium Residential Proxies (HTTP, HTTPS, SOCKS5)" },
      { name: "description", content: "Buy residential proxies instantly with USDT. 195+ countries, HTTP/HTTPS/SOCKS5 protocols. From $2/GB. Perfect for SEO, scraping, ads verification & social media." },
      { name: "keywords", content: "residential proxy, residential proxies, HTTP proxy, SOCKS5 proxy, USDT proxy, rotating proxies, sticky proxies" },
      { property: "og:title", content: "ResidentProxy.com — Premium Residential Proxies" },
      { property: "og:description", content: "195+ countries, HTTP/HTTPS/SOCKS5. Pay with USDT, instant access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const SCREENSHOTS = [
  { src: "/screenshots/dashboard.png", caption: "Live dashboard — track usage & remaining traffic in real time" },
  { src: "/screenshots/buy-1gb.png", caption: "Pick your traffic — start as low as 1 GB" },
  { src: "/screenshots/buy-45gb.png", caption: "Volume discounts auto-apply as you scale up" },
  { src: "/screenshots/buy-100gb.png", caption: "Scale up to 100 GB at $2/GB" },
  { src: "/screenshots/billing.png", caption: "Top-up with USDT, instant approval" },
];

function Landing() {
  const { user } = useAuth();
  const { open } = useAuthModal();
  const navigate = useNavigate();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (user) navigate({ to: "/app/dashboard" });
  }, [user, navigate]);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SCREENSHOTS.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <SiteShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-80" aria-hidden />
        <div className="container mx-auto px-4 py-16 md:py-24 grid lg:grid-cols-2 gap-12 items-center relative">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium">
              <Zap className="h-3 w-3" /> Instant USDT top-up · 195+ countries
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-tight">
              Premium Residential Proxies for Serious Operators
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl">
              Real residential IPs across 195+ countries. HTTP, HTTPS &amp; SOCKS5 supported.
              Pay with USDT, get credentials in seconds — no contracts, no minimums.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" onClick={() => open("signup")} className="hover:scale-105 transition-transform">
                Start with $1 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/pricing">View Pricing</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-5 pt-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Check className="h-4 w-4 text-accent" /> 99.9% Uptime</span>
              <span className="inline-flex items-center gap-1"><Check className="h-4 w-4 text-accent" /> Unlimited Threads</span>
              <span className="inline-flex items-center gap-1"><Check className="h-4 w-4 text-accent" /> 30-Day Validity</span>
            </div>
          </div>

          {/* Animated screenshot carousel */}
          <div className="relative">
            <div className="rounded-xl border bg-card shadow-elegant overflow-hidden aspect-[16/9]">
              <div
                className="flex transition-transform duration-700 ease-in-out h-full"
                style={{ transform: `translateX(-${idx * 100}%)` }}
              >
                {SCREENSHOTS.map((s) => (
                  <img
                    key={s.src}
                    src={s.src}
                    alt={s.caption}
                    loading="lazy"
                    className="w-full h-full object-cover flex-shrink-0"
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 text-center text-sm text-muted-foreground min-h-[1.5rem]">
              {SCREENSHOTS[idx].caption}
            </div>
            <div className="flex justify-center gap-1.5 mt-2">
              {SCREENSHOTS.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Protocols */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-display text-3xl font-bold mb-3">Every Protocol You Need</h2>
          <p className="text-muted-foreground">Drop-in compatible with all major scrapers, browsers, and automation tools.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { p: "HTTP", desc: "Universal compatibility. Works with curl, Python requests, Node.js, browsers." },
            { p: "HTTPS", desc: "TLS-encrypted tunnels. Secure, fast, audit-friendly." },
            { p: "SOCKS5", desc: "Full TCP/UDP support. Ideal for sneaker bots, gaming, custom protocols." },
          ].map((x) => (
            <Card key={x.p} className="p-6 hover:shadow-elegant transition-shadow">
              <Network className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-display text-xl font-semibold mb-2">{x.p}</h3>
              <p className="text-sm text-muted-foreground">{x.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-card/50 border-y">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-3xl font-bold mb-3">Built for Reliability</h2>
            <p className="text-muted-foreground">The proxy infrastructure professionals trust.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { i: Globe2, t: "195+ Countries", d: "Country & city level targeting worldwide." },
              { i: Server, t: "100M+ IPs", d: "Massive residential IP pool, rotated on demand." },
              { i: Shield, t: "Anti-Detection", d: "Real ISP IPs that bypass standard bot filters." },
              { i: Wallet, t: "Pay with USDT", d: "TRC20 / ERC20. No invoices, no contracts." },
            ].map((f) => (
              <div key={f.t} className="space-y-2">
                <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
                  <f.i className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.t}</h3>
                <p className="text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-16">
        <Card className="p-10 text-center bg-gradient-primary text-white shadow-elegant">
          <Lock className="h-10 w-10 mx-auto mb-4 opacity-90" />
          <h2 className="font-display text-3xl font-bold mb-3">Ready to launch?</h2>
          <p className="opacity-90 mb-6 max-w-xl mx-auto">
            Create your account, top up with USDT, and get residential proxies in minutes.
          </p>
          <Button size="lg" variant="secondary" onClick={() => open("signup")} className="hover:scale-105 transition-transform">
            Get Started Free <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Card>
      </section>
    </SiteShell>
  );
}
