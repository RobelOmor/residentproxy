import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";

export const Route = createFileRoute("/refund-policy")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Refund Policy — ResidentProxy.com" },
      { name: "description", content: "ResidentProxy.com refund policy. Learn when refunds are eligible for residential proxy traffic purchases." },
      { property: "og:title", content: "Refund Policy — ResidentProxy.com" },
    ],
  }),
});

function Page() {
  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display text-4xl font-bold mb-6">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="space-y-6 text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">1. Overview</h2>
            <p>
              Because residential proxy traffic is consumed on demand and our costs are paid to upstream
              IP providers immediately, refunds are processed only under the conditions outlined below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">2. Eligible refunds</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Top-up was credited but no proxy plan was ever purchased — refundable in USDT within 7 days.</li>
              <li>Proxy plan purchased but credentials never delivered within 24 hours — full refund.</li>
              <li>Verified service outage exceeding 24 consecutive hours — pro-rata refund.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">3. Non-refundable cases</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Traffic that has been partially or fully consumed.</li>
              <li>Plans expired due to the 30-day validity window.</li>
              <li>Misuse, ToS violation, fraud, or chargeback attempts.</li>
              <li>Buyer's-remorse purchases without a service issue.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">4. How to request a refund</h2>
            <p>
              Email <a className="underline text-primary" href="mailto:support@residentproxy.com">support@residentproxy.com</a> with
              your account email, order ID, USDT TX hash, and a brief description of the issue. We respond within 24 hours.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-2">5. Processing time</h2>
            <p>
              Approved refunds are sent in USDT to the wallet address you provide within 1–3 business days
              of approval. Network fees are deducted from the refund amount.
            </p>
          </section>
        </div>
      </section>
    </SiteShell>
  );
}
