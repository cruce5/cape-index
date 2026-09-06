// Politely walk Box Office Mojo for every film in data/films.json plus the
// post-Brave-New-World candidates in data/additions.json. Resumable: cached raw
// HTML in data/raw/ is reused, so re-runs only hit the network for gaps.
//
// Output: data/scraped.json  (one record per film, with resolved BOM id,
// the matched search blurb for eyeballing, and the parsed summary box.)
import { fetchText, resolveTitleId, parseTitlePage, sleep, jitter, io, ROOT, RAW_DIR } from "./lib-bom.mjs";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const DELAY_BASE = Number(process.env.BOM_DELAY ?? 5000); // ms between network hits
const DELAY_SPREAD = 3000;
// BOM_REFRESH=1 forgets the cache for recent / upcoming films so a periodic rebuild
// actually pulls their climbing grosses. Films older than this stay frozen.
const REFRESH = process.env.BOM_REFRESH === "1";
const REFRESH_MAX_AGE_DAYS = 300;

const films = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8")).films;
const additions = JSON.parse(readFileSync(join(ROOT, "data/additions.json"), "utf8")).candidates;

const targets = [
  ...films.map((f) => ({ title: f.title, year: f.release_date.slice(0, 4), release_date: f.release_date, universe: f.universe, bom_id: null, source: "baseline" })),
  ...additions.map((a) => ({ title: a.title, year: a.release_date.slice(0, 4), release_date: a.release_date, universe: a.universe, bom_id: a.bom_id, source: "addition" })),
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const outPath = join(ROOT, "data/scraped.json");
const results = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};

let netHits = 0;
async function cachedFetch(url, cacheKey) {
  const file = join(RAW_DIR, cacheKey + ".html");
  if (existsSync(file)) return readFileSync(file, "utf8");
  netHits++;
  process.stdout.write(`  net #${netHits}: ${url}\n`);
  const txt = await fetchText(url);
  if (txt) writeFileSync(file, txt);
  await sleep(jitter(DELAY_BASE, DELAY_SPREAD));
  return txt;
}

for (const t of targets) {
  const key = slug(`${t.title}-${t.year}`);
  if (REFRESH) {
    const ageDays = (Date.now() - Date.parse(t.release_date)) / 864e5;
    if (ageDays < REFRESH_MAX_AGE_DAYS) {
      const bom = results[key]?.bom_id || t.bom_id;
      if (bom) { const rf = join(RAW_DIR, "title-" + bom + ".html"); if (existsSync(rf)) rmSync(rf); }
      delete results[key];
      console.log(`refresh  ${t.title} (${t.year}) — recent release, re-fetching`);
    }
  }
  if (results[key]?.parsed?.worldwide != null || results[key]?.status === "unreleased") {
    console.log(`skip  ${t.title} (${t.year}) — already have it`);
    continue;
  }
  console.log(`\n=> ${t.title} (${t.year}) [${t.universe}]`);

  let id = t.bom_id;
  let matchedText = t.bom_id ? "(pinned id)" : null;
  let candidates = null;
  if (!id) {
    const searchHtml = await cachedFetch(
      "https://www.boxofficemojo.com/search/?q=" + encodeURIComponent(t.title),
      "search-" + key
    );
    const r = await resolveTitleId(t.title, t.year, searchHtml);
    if (!r) {
      results[key] = { ...t, status: "no-search-match" };
      writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
      continue;
    }
    id = r.id;
    matchedText = r.matchedText;
    candidates = r.candidates;
  }

  const titleHtml = await cachedFetch(`https://www.boxofficemojo.com/title/${id}/`, "title-" + id);
  if (!titleHtml) {
    results[key] = { ...t, bom_id: id, matchedText, status: "title-404" };
    writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
    continue;
  }
  const parsed = parseTitlePage(titleHtml);
  const status = parsed.worldwide == null ? "unreleased-or-no-gross" : "ok";
  results[key] = {
    title: t.title,
    year: t.year,
    release_date: t.release_date,
    universe: t.universe,
    source: t.source,
    bom_id: id,
    bom_url: `https://www.boxofficemojo.com/title/${id}/`,
    matchedText,
    candidates,
    status,
    parsed,
    scraped_at: new Date().toISOString(),
  };
  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  console.log(`   ${status}  dom=${parsed.domestic} intl=${parsed.international} ww=${parsed.worldwide} open=${parsed.opening_weekend_domestic} budget=${parsed.budget}`);
}

console.log(`\nDone. ${Object.keys(results).length} records, ${netHits} network hits this run. -> data/scraped.json`);
