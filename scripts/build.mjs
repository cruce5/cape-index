// Build two outputs from src/index.html (a head+body fragment) + data/web.json:
//   dist/artifact.html  — the fragment, for the claude.ai Artifact (its host
//                          supplies <!doctype>, <head>, charset + viewport).
//   dist/index.html      — a complete standalone document with its own charset
//                          and viewport meta, for Cloudflare / any static host.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const tpl = readFileSync(join(ROOT, "src/index.html"), "utf8");
const data = readFileSync(join(ROOT, "data/web.json"), "utf8").trim();
const castData = readFileSync(join(ROOT, "data/web-cast.json"), "utf8").trim();
if (!tpl.includes("__DATA__")) throw new Error("src/index.html has no __DATA__ placeholder");
if (!tpl.includes("__CAST__")) throw new Error("src/index.html has no __CAST__ placeholder");

const esc = (s) => s.replace(/<\//g, "<\\/"); // don't let </...> in the JSON close the tag
const fragment = tpl.replace("__DATA__", esc(data)).replace("__CAST__", esc(castData));

mkdirSync(join(ROOT, "dist"), { recursive: true });
mkdirSync(join(ROOT, "build"), { recursive: true });
writeFileSync(join(ROOT, "build/artifact.html"), fragment); // kept out of dist/ so Cloudflare serves only index.html

const marker = "</style>";
const cut = fragment.indexOf(marker);
if (cut === -1) throw new Error("src/index.html: no </style> to split head from body");
const headInner = fragment.slice(0, cut + marker.length).trim();
const bodyInner = fragment.slice(cut + marker.length).trim();

const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
${headInner}
</head>
<body>
${bodyInner}
</body>
</html>
`;
writeFileSync(join(ROOT, "dist/index.html"), doc);
// self-hosted IBM Plex: the Google stylesheet was the one render-blocking request on the page
import { readdirSync, copyFileSync } from "node:fs";
mkdirSync(join(ROOT, "dist/fonts"), { recursive: true });
for (const f of readdirSync(join(ROOT, "assets/fonts"))) if (f.endsWith(".woff2")) copyFileSync(join(ROOT, "assets/fonts", f), join(ROOT, "dist/fonts", f));
console.log(
  `dist/index.html — ${(doc.length / 1024).toFixed(0)} KB standalone · ` +
  `build/artifact.html — ${(fragment.length / 1024).toFixed(0)} KB fragment · ` +
  `${JSON.parse(data).films.length} films`
);
