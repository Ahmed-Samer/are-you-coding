import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

// Absolute base URL for <loc> tags. Reads PLATFORM_ROOT_DOMAIN at request time
// (server-only env). Falls back to the production apex if unset so the sitemap
// never emits relative URLs (which Google rejects).
function getBaseUrl(): string {
  const domain = process.env.PLATFORM_ROOT_DOMAIN?.trim() || "rentwebify.com";
  const normalized = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${normalized}`;
}

interface SitemapEntry {
  path: string;
  changefreq?: "weekly" | "monthly" | "yearly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/pricing", changefreq: "monthly", priority: "0.9" },
          { path: "/templates", changefreq: "monthly", priority: "0.8" },
          { path: "/about", changefreq: "yearly", priority: "0.6" },
          { path: "/contact", changefreq: "yearly", priority: "0.6" },
        ];

        const urls = entries
          .map((e) =>
            [
              `  <url>`,
              `    <loc>${getBaseUrl()}${e.path}</loc>`,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
