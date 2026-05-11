import { createFileRoute } from "@tanstack/react-router";

const ROUTES = [
  "", "residential-proxy", "locations", "pricing", "about", "contact", "refund-policy",
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const today = new Date().toISOString().split("T")[0];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map((r) => `  <url><loc>${origin}/${r}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${r === "" ? "1.0" : "0.8"}</priority></url>`).join("\n")}
</urlset>`;
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      },
    },
  },
});
