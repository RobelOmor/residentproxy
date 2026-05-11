import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { SiteShell } from "@/components/site-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Clock, Globe2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Contact Us — ResidentProxy.com" },
      { name: "description", content: "Get in touch with the ResidentProxy.com team. Email support@residentproxy.com for sales, technical questions, or custom volume pricing." },
      { property: "og:title", content: "Contact ResidentProxy.com" },
    ],
  }),
});

function Page() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Contact from ${name}`);
    const body = encodeURIComponent(`From: ${name} <${email}>\n\n${message}`);
    window.location.href = `mailto:support@residentproxy.com?subject=${subject}&body=${body}`;
    toast.success("Opening your email client...");
  };

  return (
    <SiteShell>
      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Contact Us</h1>
        <p className="text-lg text-muted-foreground mb-10 max-w-2xl">
          Questions about pricing, technical integration, or custom volumes? We typically reply within a few hours.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card className="p-6">
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="n">Your Name</Label>
                  <Input id="n" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="e">Email</Label>
                  <Input id="e" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="m">Message</Label>
                  <Textarea id="m" rows={6} required value={message} onChange={(e) => setMessage(e.target.value)} />
                </div>
                <Button type="submit" size="lg">Send Message</Button>
              </form>
            </Card>
          </div>
          <div className="space-y-3">
            <Card className="p-5">
              <Mail className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-semibold">Email Support</h3>
              <a href="mailto:support@residentproxy.com" className="text-sm text-muted-foreground hover:text-foreground">
                support@residentproxy.com
              </a>
            </Card>
            <Card className="p-5">
              <Clock className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-semibold">Response Time</h3>
              <p className="text-sm text-muted-foreground">Typically within a few hours, 24/7.</p>
            </Card>
            <Card className="p-5">
              <Globe2 className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-semibold">Coverage</h3>
              <p className="text-sm text-muted-foreground">Worldwide, 195+ countries.</p>
            </Card>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
