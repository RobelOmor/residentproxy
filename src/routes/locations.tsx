import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { Card } from "@/components/ui/card";
import { Globe2 } from "lucide-react";

export const Route = createFileRoute("/locations")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Proxy Locations — 195+ Countries | ResidentProxy.com" },
      { name: "description", content: "Residential proxy IPs in 195+ countries including USA, UK, Germany, Japan, Bangladesh, India, Brazil. City & ISP targeting available." },
      { property: "og:title", content: "Proxy Locations — 195+ Countries" },
    ],
  }),
});

const TOP = [
  "United States", "United Kingdom", "Germany", "France", "Canada", "Australia",
  "Japan", "South Korea", "Singapore", "Hong Kong", "India", "Bangladesh",
  "Brazil", "Mexico", "Netherlands", "Italy", "Spain", "Sweden",
  "United Arab Emirates", "Saudi Arabia", "Turkey", "South Africa",
  "Indonesia", "Philippines", "Vietnam", "Thailand", "Malaysia", "Pakistan",
  "Russia", "Poland", "Argentina", "Egypt",
];

function Page() {
  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Global Proxy Network</h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
          Choose from residential IP pools across 195+ countries. Six high-availability gateway
          regions: Global, Asia, North America, Europe, Southeast Asia, and Hong Kong.
        </p>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {TOP.map((c) => (
            <Card key={c} className="p-4 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <span className="text-sm">{c}</span>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          + 160 more countries available — pick any country directly from your dashboard.
        </p>
      </section>
    </SiteShell>
  );
}
