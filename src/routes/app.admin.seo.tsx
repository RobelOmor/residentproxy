import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/seo")({
  component: AdminSeo,
});

const KEY = "site_seo_overrides_v1";

type Seo = {
  siteTitle: string;
  siteDescription: string;
  keywords: string;
  ogImage: string;
  twitterHandle: string;
  googleSiteVerification: string;
  googleAnalyticsId: string;
  googleAdsId: string;
};

const DEFAULTS: Seo = {
  siteTitle: "ResidentProxy.com — Premium Residential Proxies (HTTP, HTTPS, SOCKS5)",
  siteDescription: "Buy residential proxies instantly with USDT. 195+ countries, HTTP/HTTPS/SOCKS5. From $2/GB.",
  keywords: "residential proxy, HTTP proxy, SOCKS5 proxy, USDT proxy, rotating proxies",
  ogImage: "",
  twitterHandle: "",
  googleSiteVerification: "",
  googleAnalyticsId: "",
  googleAdsId: "",
};

function AdminSeo() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const [seo, setSeo] = useState<Seo>(DEFAULTS);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setSeo({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(seo));
    toast.success("SEO settings saved locally");
  };

  const set = <K extends keyof Seo>(k: K, v: Seo[K]) => setSeo((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold">SEO Settings</h1>
      <p className="text-sm text-muted-foreground">
        Manage default site metadata, social previews, and tracking IDs.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Global Meta</CardTitle>
          <CardDescription>Used as defaults across the public site.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Site Title</Label>
            <Input value={seo.siteTitle} onChange={(e) => set("siteTitle", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Meta Description</Label>
            <Textarea rows={3} value={seo.siteDescription} onChange={(e) => set("siteDescription", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Keywords</Label>
            <Input value={seo.keywords} onChange={(e) => set("keywords", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>OG Image URL</Label>
            <Input value={seo.ogImage} onChange={(e) => set("ogImage", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>Twitter Handle</Label>
            <Input value={seo.twitterHandle} onChange={(e) => set("twitterHandle", e.target.value)} placeholder="@yourbrand" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification & Tracking</CardTitle>
          <CardDescription>Search Console, Analytics & Ads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Google Site Verification Token</Label>
            <Input value={seo.googleSiteVerification} onChange={(e) => set("googleSiteVerification", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Google Analytics ID (G-XXXX)</Label>
            <Input value={seo.googleAnalyticsId} onChange={(e) => set("googleAnalyticsId", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Google Ads Conversion ID (AW-XXXX)</Label>
            <Input value={seo.googleAdsId} onChange={(e) => set("googleAdsId", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save}>Save Settings</Button>
        <Button variant="outline" asChild>
          <a href="/sitemap.xml" target="_blank" rel="noreferrer">View Sitemap</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/robots.txt" target="_blank" rel="noreferrer">View robots.txt</a>
        </Button>
      </div>
    </div>
  );
}
