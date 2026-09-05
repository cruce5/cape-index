// Shared helpers for talking to Box Office Mojo politely.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const RAW_DIR = join(ROOT, "data/raw");
if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (base, spread) => base + Math.floor(Math.random() * spread);

// Fetch with a browser-ish UA, one retry on transient failure. Caches nothing
// itself — callers decide what to persist.
export async function fetchText(url, { retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (r.status === 200) return await r.text();
      if (r.status === 404) return null;
      throw new Error(`HTTP ${r.status}`);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(jitter(8000, 4000));
    }
  }
}

const strip = (s) => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const money = (s) => {
  const n = Number(String(s).replace(/[^0-9]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Resolve a film title+year to a Box Office Mojo /title/ttXXXX id via site search.
// Returns { id, matchedText } or null. `year` is used to disambiguate.
export async function resolveTitleId(title, year, html) {
  const doc = html ?? (await fetchText("https://www.boxofficemojo.com/search/?q=" + encodeURIComponent(title)));
  if (!doc) return null;
  const matches = [
    ...doc.matchAll(/href="(\/title\/(tt\d+)\/)[^"]*"([\s\S]{0,240})/g),
  ].map((m) => ({ id: m[2], text: strip(m[3]).slice(0, 120) }));
  // De-dupe (search lists an image link then a text link per result).
  const seen = new Set();
  const uniq = matches.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)));
  if (!uniq.length) return null;
  const wantYear = String(year);
  // Prefer a result whose blurb contains the target year; else first result.
  const byYear = uniq.find((m) => m.text.includes(`(${wantYear})`));
  const chosen = byYear || uniq[0];
  return { id: chosen.id, matchedText: chosen.text, candidates: uniq.slice(0, 5) };
}

// Parse the summary box of a /title/ page.
export function parseTitlePage(html) {
  const out = {
    domestic: null,
    international: null,
    worldwide: null,
    opening_weekend_domestic: null,
    budget: null,
    earliest_release_date: null,
    mpaa: null,
    running_time_minutes: null,
    genres: null,
    distributor: null,
  };

  const sumStart = html.indexOf("mojo-performance-summary-table");
  if (sumStart !== -1) {
    const chunk = html.slice(sumStart, sumStart + 2500);
    const blocks = [...chunk.matchAll(/<span class="a-size-small">\s*([A-Za-z]+)[\s\S]*?<span class="money">([^<]+)<\/span>/g)];
    for (const b of blocks) {
      const key = b[1].toLowerCase();
      if (key === "domestic") out.domestic = money(b[2]);
      else if (key === "international") out.international = money(b[2]);
      else if (key === "worldwide") out.worldwide = money(b[2]);
    }
  }

  // Detail rows: <div class="a-section a-spacing-none"><span>Label</span><span>Value</span></div>
  for (const m of html.matchAll(/<div class="a-section a-spacing-none"><span>\s*([^<]+?)\s*<\/span><span>([\s\S]*?)<\/span><\/div>/g)) {
    const label = strip(m[1]);
    const valHtml = m[2];
    const val = strip(valHtml);
    if (label === "Domestic Opening") out.opening_weekend_domestic = money(val);
    else if (label === "Budget") out.budget = money(val);
    else if (label === "Earliest Release Date") out.earliest_release_date = val;
    else if (label === "MPAA") out.mpaa = val;
    else if (label === "Domestic Distributor") out.distributor = val.replace(/See full company information.*$/, "").trim();
    else if (label === "Running Time") {
      const hm = val.match(/(?:(\d+)\s*hr)?\s*(?:(\d+)\s*min)?/);
      if (hm) out.running_time_minutes = (Number(hm[1] || 0) * 60) + Number(hm[2] || 0) || null;
    } else if (label === "Genres") out.genres = val;
  }

  // International fallback: worldwide - domestic when BOM omits the split.
  if (out.international == null && out.worldwide != null && out.domestic != null) {
    out.international = out.worldwide - out.domestic;
    out._international_derived = true;
  }
  return out;
}

export const io = { readFileSync, writeFileSync, existsSync, join };
