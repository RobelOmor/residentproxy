import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";

export const Route = createFileRoute("/about")({
  component: Page,
  head: () => ({
    meta: [
      { title: "About Us — ResidentProxy.com" },
      { name: "description", content: "ResidentProxy.com provides premium residential proxies to developers, marketers and enterprises worldwide. Our mission: reliable IP infrastructure for the open web." },
      { property: "og:title", content: "About ResidentProxy.com" },
    ],
  }),
});

function Page() {
  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-3xl prose dark:prose-invert">
        <h1 className="font-display text-4xl font-bold mb-6">About ResidentProxy.com</h1>
        <p className="text-lg text-muted-foreground">
          ResidentProxy.com is a residential proxy reseller operating a globally distributed
          network of 100M+ real residential IPs across 195+ countries. We power data collection,
          ad verification, brand protection, and social workflows for developers, agencies, and
          enterprises around the world.
        </p>
        <h2 className="font-display text-2xl font-bold mt-10 mb-3">Our mission</h2>
        <p className="text-muted-foreground">
          We believe access to the open web should be reliable, affordable, and friction-free.
          That is why we accept USDT, charge by the gigabyte instead of by the month, and provide
          credentials within seconds of payment.
        </p>
        <h2 className="font-display text-2xl font-bold mt-10 mb-3">What we offer</h2>
        <ul className="list-disc pl-6 text-muted-foreground space-y-1">
          <li>HTTP, HTTPS and SOCKS5 protocols</li>
          <li>Country and city level targeting in 195+ regions</li>
          <li>Rotating and sticky session support</li>
          <li>Pay-as-you-go pricing from $2/GB</li>
          <li>24/7 support via email</li>
        </ul>
        <h2 className="font-display text-2xl font-bold mt-10 mb-3">Get in touch</h2>
        <p className="text-muted-foreground">
          Questions? Email us anytime at{" "}
          <a className="underline" href="mailto:support@residentproxy.com">support@residentproxy.com</a>.
        </p>
      </section>
    </SiteShell>
  );
}
