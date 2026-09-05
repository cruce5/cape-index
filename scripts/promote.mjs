// Build the canonical data/films.json from:
//   - data/scraped.json   (Box Office Mojo = source of truth for money)
//   - data/additions.json (universe tagging for post-legacy films)
//   - data/sheet-baseline.csv via the existing skeleton (legacy numbers, kept for the diff)
//   - scripts/inflation.mjs (2025-dollar equivalents)
// Films BOM shows with no worldwide gross (unreleased) are held out and listed
// under meta.held_out.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";
import { toReal2025 } from "./inflation.mjs";

const scraped = JSON.parse(readFileSync(join(ROOT, "data/scraped.json"), "utf8"));
const additions = JSON.parse(readFileSync(join(ROOT, "data/additions.json"), "utf8")).candidates;
const skeleton = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8"));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Universe/label lookup: legacy sheet rows -> MCU/DCEU; additions carry their own.
const legacyUniverse = new Map(
  skeleton.films.map((f) => [slug(`${f.title}-${f.release_date.slice(0, 4)}`), f])
);
const additionMeta = new Map(
  additions.map((a) => [slug(`${a.title}-${a.release_date.slice(0, 4)}`), a])
);

const CANON_TITLE = { "Joker: Folie a Deux": "Joker: Folie à Deux" };
const FINAL_CUTOFF = "2026-05-01"; // releases after this are still "in release" -> not final

const films = [];
const heldOut = [];

for (const [key, rec] of Object.entries(scraped)) {
  const p = rec.parsed || {};
  const add = additionMeta.get(key);
  const legacy = legacyUniverse.get(key);

  const universe = add?.universe || legacy?.universe || "UNKNOWN";
  const universe_label = add?.universe_label || legacy?.universe_label || universe;
  const studio_label = add?.studio_label || legacy?.studio_label || universe_label;
  const release_date = add?.release_date || legacy?.release_date || `${rec.year}-01-01`;
  const title = CANON_TITLE[rec.title] || rec.title;
  const year = Number(release_date.slice(0, 4));

  if (p.worldwide == null) {
    heldOut.push({ title, release_date, universe, bom_url: rec.bom_url, reason: "no worldwide gross on Box Office Mojo (unreleased)" });
    continue;
  }

  const dom = p.domestic ?? null;
  const intl = p.international ?? (p.worldwide != null && dom != null ? p.worldwide - dom : null);

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
      domestic: toReal2025(dom, year),
      international: toReal2025(intl, year),
      worldwide: toReal2025(p.worldwide, year),
    },
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
    grosses: "nominal lifetime worldwide gross from Box Office Mojo; box_office_real_2025 = CPI-U adjusted to 2025 dollars",
    source_of_truth: "Box Office Mojo (boxofficemojo.com) title pages",
    universes: { MCU: byU("MCU"), DCEU: byU("DCEU"), DCU: byU("DCU"), Elseworlds: byU("Elseworlds") },
    count: films.length,
    held_out: heldOut,
    scores_source: "OMDb (pending enrich-omdb.mjs)",
  },
  films,
};

writeFileSync(join(ROOT, "data/films.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`films.json: ${films.length} verified films — MCU ${byU("MCU")}, DCEU ${byU("DCEU")}, DCU ${byU("DCU")}, Elseworlds ${byU("Elseworlds")}`);
console.log(`held out: ${heldOut.map((h) => h.title).join(", ") || "none"}`);
