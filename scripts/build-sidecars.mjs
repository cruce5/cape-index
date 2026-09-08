// The Worker was configured with not_found_handling "single-page-application", so every
// unknown path returned 200 plus the whole 361KB page. /robots.txt came back as HTML labelled
// text/plain, which is the worst version of that: crawlers got an unparseable robots file on
// every crawl, and every scanner probing paths pulled the full document.
//
// This writes the real sidecars next to dist/index.html. wrangler.jsonc now uses "404-page".
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const meta = JSON.parse(readFileSync(join(ROOT, "data/web.json"), "utf8")).meta;
const lastmod = new Date(meta.generated).toISOString().slice(0, 10);

writeFileSync(
  join(ROOT, "dist/robots.txt"),
  ["User-agent: *", "Allow: /", "Sitemap: https://capeindex.com/sitemap.xml", ""].join("\n")
);

writeFileSync(
  join(ROOT, "dist/sitemap.xml"),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url><loc>https://capeindex.com/</loc><lastmod>" + lastmod + "</lastmod></url>",
    "</urlset>",
    "",
  ].join("\n")
);

writeFileSync(
  join(ROOT, "dist/404.html"),
  [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>Not found &middot; The Cape Index</title>",
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f14;",
    "color:#f2f3f7;font:16px/1.6 system-ui,-apple-system,sans-serif;text-align:center;padding:24px}",
    "a{color:#caa25e}@media(prefers-color-scheme:light){body{background:#f6f7f9;color:#13151b}a{color:#7d5f2c}}</style>",
    "</head>",
    "<body><div>",
    '<h1 style="font-size:28px;margin:0 0 8px">Not found</h1>',
    '<p style="opacity:.7;margin:0 0 20px">That page is not part of The Cape Index.</p>',
    '<a href="/">Go to the index</a>',
    "</div></body>",
    "</html>",
    "",
  ].join("\n")
);

// Workers static assets honours dist/_headers. There was no CSP, no nosniff, no
// Referrer-Policy and no HSTS on the live site, and og.png was served must-revalidate.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src https://cloudflareinsights.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

writeFileSync(
  join(ROOT, "dist/_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
    "  Content-Security-Policy: " + CSP,
    "",
    "/og.png",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n")
);

console.log("dist sidecars — robots.txt · sitemap.xml (" + lastmod + ") · 404.html · _headers");
