// Build the canonical data/films.json from:
//   - data/scraped.json   (Box Office Mojo = source of truth for money)
//   - data/additions.json (universe tagging for post-legacy films)
//   - data/sheet-baseline.csv via the existing skeleton (legacy numbers, kept for the diff)
//   - scripts/inflation.mjs (2025-dollar equivalents)
// Films BOM shows with no worldwide gross (unreleased) are held out and listed
// under meta.held_out.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";
import { toReal2025 } from "./inflation.mjs";

const scraped = JSON.parse(readFileSync(join(ROOT, "data/scraped.json"), "utf8"));
const additions = JSON.parse(readFileSync(join(ROOT, "data/additions.json"), "utf8")).candidates;
const skeleton = JSON.parse(readFileSync(join(ROOT, "data/skeleton.json"), "utf8"));
// Release dates the legacy sheet got wrong (Turnstile audit, 2026-09-19). The sheet stays as it was
// for the diff; the correction is applied here, by title, and each carries its source.
const DATE_FIX = JSON.parse(readFileSync(join(ROOT, "data/trade-conventions.json"), "utf8")).release_date_fixes;

// Money a film earns in a later release (a re-release, a recut, an anniversary run) is inflated at
// that release's own year, not the original's (Turnstile audit, 2026-09-19): The Dark Knight's 2012
// re-release used to get 2008's larger multiplier. The groups come from the "By Release" table on
// the cached Box Office Mojo title page; a film with no cached page keeps the single-year basis.
function laterReleaseGroups(bomId, releaseYear) {
  const p = join(ROOT, `data/raw/title-${bomId}.html`);
  if (!bomId || !existsSync(p)) return [];
  const h = readFileSync(p, "utf8");
  const start = h.indexOf(">By Release<");
  if (start < 0) return [];
  const table = h.slice(start, h.indexOf("</table>", start));
  const money = (cell) => { const m = cell.match(/\$([\d,]+)/); return m ? Number(m[1].replace(/,/g, "")) : 0; };
  const groups = [];
  for (const [, row] of [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (cells.length < 6 || /^original release$/i.test(cells[0])) continue;
    // the year in the group's name ("2018 Re-release") if it has one, else the latest year its rollout reached
    const named = cells[0].match(/\b(?:19|20)\d{2}\b/);
    const rollout = [...cells[1].matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    const year = named ? Number(named[0]) : rollout.length ? Math.max(...rollout) : null;
    if (!year || year <= releaseYear) continue; // a same-year group needs no correction
    groups.push({ name: cells[0], year, domestic: money(cells[3]), international: money(cells[4]), worldwide: money(cells[5]) });
  }
  return groups;
}
// lifetime minus the later groups at the release year, plus each later group at its own year
function realByRelease(total, key, releaseYear, groups) {
  if (total == null) return null;
  const later = groups.reduce((sum, g) => sum + g[key], 0);
  return toReal2025(Math.max(0, total - later), releaseYear) + groups.reduce((sum, g) => sum + toReal2025(g[key], g.year), 0);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Universe/label lookup: legacy sheet rows -> MCU/DCEU; additions carry their own.
const legacyUniverse = new Map(
  skeleton.films.map((f) => [slug(`${f.title}-${f.release_date.slice(0, 4)}`), f])
);
const additionMeta = new Map(
  additions.map((a) => [slug(`${a.title}-${a.release_date.slice(0, 4)}`), a])
);

const CANON_TITLE = { "Joker: Folie a Deux": "Joker: Folie à Deux" };
// Releases before this are treated as done in theatres; later ones carry the "still in release" marker
// and stay out of the profit tallies. Nudge forward as runs end — 2026-07-01 keeps Supergirl (Jun 26,
// now on digital) in the profit math while Spider-Man: Brand New Day (Jul 31) is still running.
const FINAL_CUTOFF = "2026-07-01";

const films = [];
const heldOut = [];

// A row that appears identically on several films' pages is a series total, not any one film's
// share: Columbia's 100th Anniversary run shows the same $6.36M on all eight Sony Spider-Man pages.
// It can't be attributed per film, so that money stays on the release-year basis.
const groupSeen = new Map();
for (const rec of Object.values(scraped)) {
  for (const g of laterReleaseGroups(rec.bom_id, 0)) {
    const sig = `${g.name}|${g.domestic}|${g.international}|${g.worldwide}`;
    groupSeen.set(sig, (groupSeen.get(sig) || 0) + 1);
  }
}
const ownGroup = (g) => groupSeen.get(`${g.name}|${g.domestic}|${g.international}|${g.worldwide}`) === 1;

for (const [key, rec] of Object.entries(scraped)) {
  const p = rec.parsed || {};
  const add = additionMeta.get(key);
  const legacy = legacyUniverse.get(key);

  const universe = add?.universe || legacy?.universe || "UNKNOWN";
  const universe_label = add?.universe_label || legacy?.universe_label || universe;
  const studio_label = add?.studio_label || legacy?.studio_label || universe_label;
  const title = CANON_TITLE[rec.title] || rec.title;
  const release_date = DATE_FIX[title]?.date || add?.release_date || legacy?.release_date || `${rec.year}-01-01`;
  const year = Number(release_date.slice(0, 4));

  if (p.worldwide == null) {
    heldOut.push({ title, release_date, universe, bom_url: rec.bom_url, reason: "no worldwide gross on Box Office Mojo (unreleased)" });
    continue;
  }

  const dom = p.domestic ?? null;
  const intl = p.international ?? (p.worldwide != null && dom != null ? p.worldwide - dom : null);
  const groups = laterReleaseGroups(rec.bom_id, year).filter(ownGroup);

  films.push({
    title,
    release_date,
    universe,
    universe_label,
    studio_label,
    bom: { id: rec.bom_id, url: rec.bom_url },
    box_office: {
      domestic: dom,
      international: intl,
      worldwide: p.worldwide,
      opening_weekend_domestic: p.opening_weekend_domestic ?? null,
      widest_release_theaters: null,
      is_final: release_date < FINAL_CUTOFF,
    },
    box_office_real_2025: {
      domestic: realByRelease(dom, "domestic", year, groups),
      international: realByRelease(intl, "international", year, groups),
      worldwide: realByRelease(p.worldwide, "worldwide", year, groups),
    },
    ...(groups.length ? { later_releases: groups } : {}),
    budget: p.budget ?? null,
    runtime_minutes: p.running_time_minutes ?? null,
    mpaa: p.mpaa ?? null,
    distributor: p.distributor ?? null,
    genres: p.genres ? p.genres.trim().split(/\s+/) : null,
    scores: { rt_critic: null, rt_audience: null, metacritic: null, imdb: null },
    sheet: legacy
      ? { domestic: legacy.sheet.domestic, international: legacy.sheet.international, worldwide: legacy.sheet.worldwide }
      : null,
    bom_meta: { earliest_release_date: p.earliest_release_date ?? null },
    verified: true,
    verified_at: new Date().toISOString().slice(0, 10),
    notes: rec.source === "addition" ? "Added beyond the legacy Tableau sheet." : null,
  });
}

films.sort((a, b) => a.release_date.localeCompare(b.release_date) || a.title.localeCompare(b.title));

const byU = (u) => films.filter((f) => f.universe === u).length;
const out = {
  meta: {
    generated: new Date().toISOString(),
    currency: "USD",
    grosses: "nominal lifetime worldwide gross from Box Office Mojo; box_office_real_2025 = CPI-U adjusted to 2025 dollars, each later release (re-release, recut) at its own year",
    source_of_truth: "Box Office Mojo (boxofficemojo.com) title pages",
    universes: { MCU: byU("MCU"), Fox: byU("Fox"), SSU: byU("SSU"), DCEU: byU("DCEU"), DCU: byU("DCU"), Elseworlds: byU("Elseworlds") },
    count: films.length,
    held_out: heldOut,
    scores_source: "OMDb (pending enrich-omdb.mjs)",
  },
  films,
};

writeFileSync(join(ROOT, "data/films.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`films.json: ${films.length} verified films — MCU ${byU("MCU")}, Fox ${byU("Fox")}, SSU ${byU("SSU")}, DCEU ${byU("DCEU")}, DCU ${byU("DCU")}, Elseworlds ${byU("Elseworlds")}`);
console.log(`held out: ${heldOut.map((h) => h.title).join(", ") || "none"}`);
