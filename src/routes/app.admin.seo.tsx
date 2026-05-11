import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetConfig, adminSaveSiteConfig } from "@/lib/admin.functions";
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

type LocalSeo = {
  keywords: string;
  twitterHandle: string;
  googleSiteVerification: string;
  googleAnalyticsId: string;
  googleAdsId: string;
};

const LOCAL_DEFAULTS: LocalSeo = {
  keywords: "residential proxy, HTTP proxy, SOCKS5 proxy, USDT proxy, rotating proxies",
  twitterHandle: "",
  googleSiteVerification: "",
  googleAnalyticsId: "",
  googleAdsId: "",
};

type SiteCfg = {
  site_name: string;
  site_title: string;
  site_tagline: string;
  site_description: string;
  site_logo_url: string;
  site_favicon_url: string;
  site_og_image_url: string;
  site_support_email: string;
};

const SITE_DEFAULTS: SiteCfg = {
  site_name: "ResidentProxy.com",
  site_title: "ResidentProxy.com — Premium Residential Proxies (HTTP, HTTPS, SOCKS5)",
  site_tagline: "Pay with USDT. Instant access.",
  site_description: "Buy residential proxies instantly with USDT. 195+ countries, HTTP/HTTPS/SOCKS5. From $2/GB.",
  site_logo_url: "",
  site_favicon_url: "",
  site_og_image_url: "",
  site_support_email: "support@residentproxy.com",
};

function AdminSeo() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getConfig = useServerFn(adminGetConfig);
  const saveSite = useServerFn(adminSaveSiteConfig);

  const [seo, setSeo] = useState<LocalSeo>(LOCAL_DEFAULTS);
  const [site, setSite] = useState<SiteCfg>(SITE_DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && role && role !== "admin") navigate({ to: "/app/dashboard" });
  }, [role, loading, navigate]);

  const { data } = useQuery({
    queryKey: ["admin-config"],
    enabled: role === "admin",
    queryFn: () => getConfig(),
  });

  useEffect(() => {
    const c = data?.config as Record<string, unknown> | undefined;
    if (!c) return;
    setSite({
      site_name: (c.site_name as string) ?? SITE_DEFAULTS.site_name,
      site_title: (c.site_title as string) ?? SITE_DEFAULTS.site_title,
      site_tagline: (c.site_tagline as string) ?? SITE_DEFAULTS.site_tagline,
      site_description: (c.site_description as string) ?? SITE_DEFAULTS.site_description,
      site_logo_url: (c.site_logo_url as string) ?? "",
      site_favicon_url: (c.site_favicon_url as string) ?? "",
      site_og_image_url: (c.site_og_image_url as string) ?? "",
      site_support_email: (c.site_support_email as string) ?? SITE_DEFAULTS.site_support_email,
    });
  }, [data]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setSeo({ ...LOCAL_DEFAULTS, ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  const saveLocal = () => {
    localStorage.setItem(KEY, JSON.stringify(seo));
    toast.success("Tracking settings saved");
  };

  const saveSiteCfg = async () => {
    setBusy(true);
    try {
      await saveSite({ data: site });
      toast.success("Site branding saved");
      qc.invalidateQueries({ queryKey: ["admin-config"] });
      qc.invalidateQueries({ queryKey: ["public-site-config"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const setS = <K extends keyof SiteCfg>(k: K, v: SiteCfg[K]) => setSite((p) => ({ ...p, [k]: v }));
  const setL = <K extends keyof LocalSeo>(k: K, v: LocalSeo[K]) => setSeo((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl sm:text-3xl font-bold">Site & SEO Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Logo, favicon, name shown across the public site and dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Site Name</Label>
              <Input value={site.site_name} onChange={(e) => setS("site_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Support Email</Label>
              <Input value={site.site_support_email} onChange={(e) => setS("site_support_email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Logo URL</Label>
            <Input value={site.site_logo_url} onChange={(e) => setS("site_logo_url", e.target.value)} placeholder="https://.../logo.png" />
            {site.site_logo_url ? (
              <img src={site.site_logo_url} alt="logo preview" className="mt-2 h-10 w-auto rounded border bg-card p-1" />
            ) : null}
          </div>
          <div className="space-y-1">
            <Label>Favicon URL</Label>
            <Input value={site.site_favicon_url} onChange={(e) => setS("site_favicon_url", e.target.value)} placeholder="https://.../favicon.ico" />
          </div>
          <div className="space-y-1">
            <Label>Tagline</Label>
            <Input value={site.site_tagline} onChange={(e) => setS("site_tagline", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Meta</CardTitle>
          <CardDescription>Default page title, description, and social share image.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Site Title (browser tab)</Label>
            <Input value={site.site_title} onChange={(e) => setS("site_title", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Meta Description</Label>
            <Textarea rows={3} value={site.site_description} onChange={(e) => setS("site_description", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>OG / Social Share Image URL</Label>
            <Input value={site.site_og_image_url} onChange={(e) => setS("site_og_image_url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-1">
            <Label>Keywords (local only)</Label>
            <Input value={seo.keywords} onChange={(e) => setL("keywords", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Twitter Handle (local only)</Label>
            <Input value={seo.twitterHandle} onChange={(e) => setL("twitterHandle", e.target.value)} placeholder="@yourbrand" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification & Tracking</CardTitle>
          <CardDescription>Stored locally in your browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Google Site Verification Token</Label>
            <Input value={seo.googleSiteVerification} onChange={(e) => setL("googleSiteVerification", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Google Analytics ID (G-XXXX)</Label>
            <Input value={seo.googleAnalyticsId} onChange={(e) => setL("googleAnalyticsId", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Google Ads Conversion ID (AW-XXXX)</Label>
            <Input value={seo.googleAdsId} onChange={(e) => setL("googleAdsId", e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveSiteCfg} disabled={busy}>
          {busy ? "Saving..." : "Save Site & Branding"}
        </Button>
        <Button variant="outline" onClick={saveLocal}>Save Tracking (local)</Button>
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
