// The Worker was configured with not_found_handling "single-page-application", so every
// unknown path returned 200 plus the whole 361KB page. /robots.txt came back as HTML labelled
// text/plain, which is the worst version of that: crawlers got an unparseable robots file on
// every crawl, and every scanner probing paths pulled the full document.
//
// This writes the real sidecars next to dist/index.html. wrangler.jsonc now uses "404-page".
// It runs last in the build, so it can also read the finished dist/index.html: the CSP's
// script-src is the sha256 of each inline script (no 'unsafe-inline'), and the share image
// gets a content-hashed name so a year-long immutable cache can't serve last week's totals.
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const meta = JSON.parse(readFileSync(join(ROOT, "data/web.json"), "utf8")).meta;
const lastmod = new Date(meta.generated).toISOString().slice(0, 10);
const htmlPath = join(ROOT, "dist/index.html");
let html = readFileSync(htmlPath, "utf8");

// --- og.png -> og.<hash>.png, and the two meta tags that point at it ------------------------
const ogPath = join(ROOT, "dist/og.png");
if (existsSync(ogPath)) {
  const png = readFileSync(ogPath);
  const h = createHash("sha256").update(png).digest("hex").slice(0, 10);
  const name = `og.${h}.png`;
  for (const f of readdirSync(join(ROOT, "dist"))) if (/^og\.[0-9a-f]{10}\.png$/.test(f) && f !== name) unlinkSync(join(ROOT, "dist", f));
  writeFileSync(join(ROOT, "dist", name), png);
  unlinkSync(ogPath);
  html = html.split("https://capeindex.com/og.png").join("https://capeindex.com/" + name);
  writeFileSync(htmlPath, html);
  console.log(`dist/${name} — share image, content-hashed`);
} else {
  // og-image.mjs is not in the build chain, so after its first run the plain og.png is gone
  // and only the fingerprinted copy remains. Every later build regenerates index.html from
  // source (which says og.png) and used to skip this block, shipping a meta tag that 404s:
  // LinkedIn would have scraped the launch post with no image. Point the meta at whatever
  // fingerprinted card is already in dist.
  const existing = readdirSync(join(ROOT, "dist")).find((f) => /^og\.[0-9a-f]{10}\.png$/.test(f));
  if (existing) {
    html = html.split("https://capeindex.com/og.png").join("https://capeindex.com/" + existing);
    writeFileSync(htmlPath, html);
    console.log(`dist/${existing} — share image (existing), meta re-pointed`);
  } else {
    console.warn("WARNING: no share image in dist/ — run scripts/og-image.mjs; og:image will 404");
  }
}

writeFileSync(
  join(ROOT, "dist/robots.txt"),
  ["User-agent: *", "Allow: /", "Disallow: /404", "Sitemap: https://capeindex.com/sitemap.xml", ""].join("\n")
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

// --- headers ------------------------------------------------------------------------------
// script-src: one hash per inline <script> (the theme pre-paint line and the page itself).
// JSON data blocks are type="application/json" and never execute, so they are not hashed.
const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (inlineScripts.length < 2) throw new Error("expected the theme script and the page script inline; found " + inlineScripts.length);
const hashes = inlineScripts.map((s) => "'sha256-" + createHash("sha256").update(s, "utf8").digest("base64") + "'");
if (/\son[a-z]+="/i.test(html) || /href="javascript:/i.test(html)) throw new Error("inline event handler or javascript: URL found; a hash CSP would block it");

// fonts: self-hosted when the page carries @font-face for /fonts/, Google's origins otherwise
const selfFonts = html.includes("/fonts/") && !html.includes("fonts.googleapis.com");
const CSP = [
  "default-src 'none'",
  "script-src " + hashes.join(" ") + " https://static.cloudflareinsights.com",
  "style-src 'unsafe-inline'" + (selfFonts ? "" : " https://fonts.googleapis.com"),
  "font-src " + (selfFonts ? "'self'" : "https://fonts.gstatic.com"),
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
    // preload is only honest once the zone redirects http:// to https:// (Always Use HTTPS,
    // switched on 2026-09-08) and www 301s to the apex; both do now
    "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "  Cross-Origin-Opener-Policy: same-origin",
    "  Content-Security-Policy: " + CSP,
    "",
    "/",
    "  Content-Type: text/html; charset=utf-8",
    "",
    "/index.html",
    "  Content-Type: text/html; charset=utf-8",
    "",
    "/og.*.png",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/fonts/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    // Payload's audit: robots and sitemap shouldn't revalidate on every hit; an hour is polite
    "/robots.txt",
    "  Cache-Control: public, max-age=3600",
    "",
    "/sitemap.xml",
    "  Cache-Control: public, max-age=3600",
    "",
    // 404 body was served text/html with no charset (nosniff plus the meta save it in practice)
    "/404.html",
    "  Content-Type: text/html; charset=utf-8",
    "",
  ].join("\n")
);

console.log("dist sidecars — robots.txt · sitemap.xml (" + lastmod + ") · 404.html · _headers (" + inlineScripts.length + " script hashes" + (selfFonts ? ", self-hosted fonts" : "") + ")");
