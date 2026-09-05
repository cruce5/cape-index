// Backfill two things OMDb and the BOM title page don't reliably give us:
//   - production budget (Wikipedia infobox `| budget =`)
//   - Rotten Tomatoes critic % when OMDb's Ratings array omitted it
// Wikipedia is an estimate for budgets — flagged as such in meta.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, sleep } from "./lib-bom.mjs";

const path = join(ROOT, "data/films.json");
const data = JSON.parse(readFileSync(path, "utf8"));

// Wikipedia page titles where they differ from our film title.
const PAGE = {
  "Thunderbolts*": "Thunderbolts (film)",
  "Superman": "Superman (2025 film)",
  "Supergirl": "Supergirl (2026 film)",
  "Joker": "Joker (2019 film)",
  "Joker: Folie à Deux": "Joker: Folie à Deux",
  "The Fantastic Four: First Steps": "The Fantastic Four: First Steps",
  "The Suicide Squad": "The Suicide Squad (film)",
  "Spider-Man: Brand New Day": "Spider-Man: Brand New Day",
  "The Flash": "The Flash (film)",
  "Eternals": "Eternals (film)",
  "Justice League": "Justice League (film)",
  "Aquaman": "Aquaman (film)",
  "Aquaman and the Lost Kingdom": "Aquaman and the Lost Kingdom",
  "Black Adam": "Black Adam (film)",
  "Black Widow": "Black Widow (2021 film)",
  "Blue Beetle": "Blue Beetle (film)",
  "Captain America: Brave New World": "Captain America: Brave New World",
};

const million = 1_000_000;

function parseBudget(wikitext, guardGross) {
  const i = wikitext.search(/\n\s*\|\s*budget\s*=/i);
  if (i === -1) return null;
  let s = wikitext.slice(i + 1, i + 800);
  // 1) strip refs/comments (they carry grosses and unrelated numbers)
  s = s
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // 2) cut at the next infobox field (while pipes are still intact)
  s = s.replace(/^\s*\|\s*budget\s*=/i, "");
  const nextField = s.search(/\n\s*\|\s*[a-z][a-z_ ]*\s*=/i);
  if (nextField !== -1) s = s.slice(0, nextField);
  // 3) normalise spacing templates/entities
  s = s
    .replace(/&nbsp;|&#160;|&thinsp;|\{\{nbsp\}\}|\{\{spaces?\}\}/gi, " ")
    .replace(/\{\{[Uu][Ss]\$\|/g, "")
    .replace(/[|}{*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hits = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(million|billion)/gi)].map(
    (h) => Number(h[1]) * (/b/i.test(h[2]) ? 1000 : 1) * million
  );
  // production budget convention: lower end of a range, first entry of a list
  let val = hits.length ? Math.min(...hits) : null;
  if (val == null) {
    const bare = s.match(/\$\s*([\d,]{7,})/);
    val = bare ? Number(bare[1].replace(/,/g, "")) : null;
  }
  // guard: a value within 8% of the film's own worldwide gross is a leaked gross
  if (val != null && guardGross && Math.abs(val - guardGross) / guardGross < 0.08) return null;
  if (val != null && (val < 1_000_000 || val > 500 * million)) return null;
  return val;
}

function parseRT(wikitext) {
  const m = wikitext.match(/Rotten Tomatoes[^.]*?(\d{1,3})%/) || wikitext.match(/(\d{1,3})%\s*(?:approval|of \d+ (?:critics|reviews))/i);
  const n = m ? Number(m[1]) : null;
  return n != null && n >= 0 && n <= 100 ? n : null;
}

async function wikitext(title) {
  const cache = join(ROOT, `data/raw/wiki-${title.replace(/[^a-z0-9]+/gi, "_")}.txt`);
  if (existsSync(cache)) {
    const c = readFileSync(cache, "utf8");
    if (/\|\s*budget\s*=/i.test(c) || /Rotten Tomatoes/i.test(c)) return c;
  }
  const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {
      headers: { "User-Agent": "marvel-dc-boxoffice/0.1 (box-office data reconciliation; contact williamfyost@gmail.com)" },
    });
    const body = await r.text();
    if (r.status === 429 || /too many requests/i.test(body)) {
      await sleep(8000 * (attempt + 1));
      continue;
    }
    let j;
    try { j = JSON.parse(body); } catch { return ""; }
    const wt = j?.parse?.wikitext?.["*"] || "";
    if (wt) writeFileSync(cache, wt);
    await sleep(2500);
    return wt;
  }
  return "";
}

let budgets = 0, rts = 0;
for (const f of data.films) {
  const need = !f.budget || f.scores.rt_critic == null;
  if (!need) continue;
  const wt = await wikitext(PAGE[f.title] || f.title);
  if (!wt) { console.log(`  ${f.title}: no wiki page`); continue; }
  if (!f.budget) {
    const b = parseBudget(wt, f.box_office?.worldwide);
    if (b) { f.budget = b; f.budget_estimated = true; budgets++; }
  }
  if (f.scores.rt_critic == null) {
    const rt = parseRT(wt);
    if (rt != null) { f.scores.rt_critic = rt; rts++; }
  }
  console.log(`  ${f.title}: budget ${f.budget ? "$" + (f.budget / million) + "M" + (f.budget_estimated ? " (est)" : "") : "—"} · RT ${f.scores.rt_critic ?? "—"}`);
}

// Authoritative last word: hand-set budgets/scores for cases the parsers can't nail.
const ov = JSON.parse(readFileSync(join(ROOT, "data/budget-overrides.json"), "utf8"));
let overridden = 0;
for (const f of data.films) {
  if (ov.budgets[f.title] != null && f.budget !== ov.budgets[f.title]) {
    f.budget = ov.budgets[f.title];
    f.budget_estimated = true;
    overridden++;
  }
  if (ov.rt_critic?.[f.title] != null && f.scores.rt_critic == null) {
    f.scores.rt_critic = ov.rt_critic[f.title];
  }
}
console.log(`Applied ${overridden} budget overrides. Still missing: ${data.films.filter((f) => !f.budget).map((f) => f.title).join(", ") || "none"}`);

data.meta.budget_note = "Budget source order: Box Office Mojo → Wikipedia infobox → data/budget-overrides.json. Anything not straight from BOM is budget_estimated:true and approximate (studios rarely disclose; net vs gross-of-rebate varies).";
data.meta.generated = new Date().toISOString();
writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
console.log(`\nFilled ${budgets} budgets, ${rts} RT scores. Still missing budget: ${data.films.filter((f) => !f.budget).map((f) => f.title).join(", ") || "none"}`);
