import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthModal } from "@/components/auth-modal";
import { Check, Network, Globe2, Zap } from "lucide-react";

export const Route = createFileRoute("/residential-proxy")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Residential Proxy — HTTP, HTTPS & SOCKS5 | ResidentProxy.com" },
      { name: "description", content: "Real residential IPs from 195+ countries with HTTP, HTTPS, and SOCKS5 protocol support. Rotating & sticky sessions. Buy from $2/GB with USDT." },
      { property: "og:title", content: "Residential Proxy — HTTP, HTTPS & SOCKS5" },
      { property: "og:description", content: "Real residential IPs from 195+ countries. From $2/GB." },
    ],
  }),
});

function Page() {
  const { open } = useAuthModal();
  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Residential Proxies</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mb-8">
          Genuine ISP-issued IPs from real homes worldwide. The most undetectable proxy type
          for SEO research, ad verification, e-commerce monitoring, and social media automation.
        </p>

        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {[
            { t: "Rotating IPs", d: "Fresh IP on every request — perfect for scraping at scale." },
            { t: "Sticky Sessions", d: "Hold the same IP for up to 30 minutes for login workflows." },
            { t: "Country Targeting", d: "Pick from 195+ countries: BD, US, DE, JP, BR, IN…" },
          ].map((f) => (
            <Card key={f.t} className="p-5">
              <Check className="h-5 w-5 text-accent mb-2" />
              <h3 className="font-semibold mb-1">{f.t}</h3>
              <p className="text-sm text-muted-foreground">{f.d}</p>
            </Card>
          ))}
        </div>

        <h2 className="font-display text-2xl font-bold mb-4">Protocols Supported</h2>
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {["HTTP", "HTTPS", "SOCKS5"].map((p) => (
            <Card key={p} className="p-5">
              <Network className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-semibold">{p}</h3>
              <code className="text-xs text-muted-foreground">{p.toLowerCase()}://user:pass@host:port</code>
            </Card>
          ))}
        </div>

        <h2 className="font-display text-2xl font-bold mb-4">Use Cases</h2>
        <ul className="grid md:grid-cols-2 gap-3 mb-12">
          {[
            "Web scraping & data collection",
            "SEO rank tracking",
            "Ad verification & brand protection",
            "Social media account management",
            "Sneaker & ticket purchasing",
            "Price comparison & market research",
            "Travel fare aggregation",
            "Cybersecurity research",
          ].map((u) => (
            <li key={u} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-accent mt-1 shrink-0" />
              <span className="text-sm">{u}</span>
            </li>
          ))}
        </ul>

        <Card className="p-8 bg-gradient-primary text-white text-center">
          <Zap className="h-8 w-8 mx-auto mb-3" />
          <h3 className="font-display text-2xl font-bold mb-2">Get started in under 2 minutes</h3>
          <p className="opacity-90 mb-5">Sign up, top up with USDT, and start using your proxies immediately.</p>
          <Button size="lg" variant="secondary" onClick={() => open("signup")}>Sign Up Free</Button>
        </Card>
      </section>
    </SiteShell>
  );
}
