import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/components/auth-modal";
import { Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Pricing — From $2/GB | ResidentProxy.com" },
      { name: "description", content: "Pay-as-you-go residential proxy pricing. Starts at $3/GB and scales to $2/GB at 100 GB. No subscriptions, USDT only." },
      { property: "og:title", content: "Residential Proxy Pricing — From $2/GB" },
    ],
  }),
});

const TIERS = [
  { gb: 1, price: 3.0, label: "Starter" },
  { gb: 10, price: 2.81, label: "Growth", highlight: false },
  { gb: 25, price: 2.51, label: "Pro", highlight: true },
  { gb: 100, price: 2.0, label: "Scale" },
];

function Page() {
  const { open } = useAuthModal();
  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h1>
          <p className="text-lg text-muted-foreground">Pay only for what you use. Volume discounts apply automatically.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIERS.map((t) => (
            <Card key={t.gb} className={`p-6 flex flex-col ${t.highlight ? "border-primary shadow-elegant relative" : ""}`}>
              {t.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold">{t.label}</h3>
              <div className="mt-4 mb-2">
                <span className="text-4xl font-bold">${t.price.toFixed(2)}</span>
                <span className="text-muted-foreground"> /GB</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{t.gb} GB · ${(t.gb * t.price).toFixed(2)} total</p>
              <ul className="space-y-2 text-sm flex-1">
                {["HTTP / HTTPS / SOCKS5", "All 195+ countries", "30-day validity", "Unlimited threads"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-accent" /> {f}</li>
                ))}
              </ul>
              <Button onClick={() => open("signup")} className="mt-5">Get Started</Button>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Need a custom volume? Email <a className="underline" href="mailto:support@residentproxy.com">support@residentproxy.com</a>
        </p>
      </section>
    </SiteShell>
  );
}
