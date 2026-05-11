import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { getPublicSiteConfig } from "@/lib/admin.functions";

export type SiteBrand = {
  site_name?: string | null;
  site_title?: string | null;
  site_tagline?: string | null;
  site_description?: string | null;
  site_logo_url?: string | null;
  site_favicon_url?: string | null;
  site_og_image_url?: string | null;
  site_support_email?: string | null;
};

const DEFAULTS: Required<SiteBrand> = {
  site_name: "ResidentProxy.com",
  site_title: "ResidentProxy.com — Premium Residential Proxies",
  site_tagline: "Pay with USDT. Instant access.",
  site_description:
    "Buy residential proxies instantly with USDT. 195+ countries, HTTP/HTTPS/SOCKS5.",
  site_logo_url: "",
  site_favicon_url: "/favicon.ico",
  site_og_image_url: "",
  site_support_email: "support@residentproxy.com",
};

export function useSiteBrand(): Required<SiteBrand> {
  const fn = useServerFn(getPublicSiteConfig);
  const { data } = useQuery({
    queryKey: ["public-site-config"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  const merged = { ...DEFAULTS } as Required<SiteBrand>;
  if (data && typeof data === "object") {
    for (const k of Object.keys(DEFAULTS) as (keyof SiteBrand)[]) {
      const v = (data as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) (merged as Record<string, string>)[k] = v;
    }
  }
  return merged;
}

/** Syncs <title> and favicon to admin-configured branding on the client. */
export function BrandHeadSync() {
  const brand = useSiteBrand();
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (brand.site_title) document.title = brand.site_title;
    if (brand.site_favicon_url) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = brand.site_favicon_url;
    }
  }, [brand.site_title, brand.site_favicon_url]);
  return null;
}
