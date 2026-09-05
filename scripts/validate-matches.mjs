// Cross-check every scraped record's resolved Box Office Mojo page against the
// film we meant to look up. Reads cached title-*.html (no network), pulls the
// real <h1> title + year, and flags anything whose title/year doesn't line up.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, RAW_DIR } from "./lib-bom.mjs";

const scraped = JSON.parse(readFileSync(join(ROOT, "data/scraped.json"), "utf8"));

const norm = (s) =>
  s.toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bthe\b/g, "")
    .trim()
    .replace(/\s+/g, " ");

function pageTitle(id) {
  const p = join(RAW_DIR, `title-${id}.html`);
  if (!existsSync(p)) return null;
  const html = readFileSync(p, "utf8");
  const m = html.match(/<h1 class="a-size-extra-large">([\s\S]*?)<\/h1>/);
  if (!m) return null;
  const yr = m[1].match(/\((\d{4})\)/);
  const title = m[1].replace(/<[^>]+>/g, "").replace(/\(\d{4}\)/, "").replace(/&amp;/g, "&").trim();
  return { title, year: yr ? Number(yr[1]) : null };
}

let ok = 0;
const flags = [];
for (const [key, r] of Object.entries(scraped)) {
  if (!r.bom_id) { flags.push({ key, why: `no BOM id (status: ${r.status})` }); continue; }
  const pt = pageTitle(r.bom_id);
  if (!pt) { flags.push({ key, why: `no cached page for ${r.bom_id}` }); continue; }
  const wantT = norm(r.title);
  const gotT = norm(pt.title);
  const titleOk = gotT === wantT || gotT.includes(wantT) || wantT.includes(gotT);
  const wantY = Number(r.year);
  const yearOk = pt.year == null || Math.abs(pt.year - wantY) <= 1;
  if (titleOk && yearOk) { ok++; continue; }
  flags.push({
    key,
    why: `resolved to "${pt.title}" (${pt.year}) — expected "${r.title}" (${r.year})`,
    bom: r.bom_url,
  });
}

console.log(`${ok} clean, ${flags.length} to review:\n`);
for (const f of flags) console.log(`  ✗ ${f.key}\n      ${f.why}${f.bom ? "\n      " + f.bom : ""}`);
