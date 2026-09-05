// Parse data/sheet-baseline.csv (the current Tableau Public source) into the
// canonical data/skeleton.json shape. All box-office numbers from the sheet are
// carried over as `sheet_*` reference values; the `verified` block stays empty
// until Box Office Mojo reconciliation fills it in.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (field !== "" || row.length) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const money = (s) => {
  if (s == null) return null;
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const UNIVERSE = {
  "Marvel Studios": { code: "MCU", label: "Marvel Cinematic Universe", studioLabel: "Marvel Studios" },
  "DC Extended Universe": { code: "DCEU", label: "DC Extended Universe", studioLabel: "DC Extended Universe" },
};

const raw = readFileSync(join(root, "data/sheet-baseline.csv"), "utf8");
const [header, ...lines] = parseCsv(raw);

const films = lines.filter((r) => r[0]).map((r) => {
  const [title, releaseDate, franchise, domestic, intl, total] = r;
  const u = UNIVERSE[franchise] || { code: "UNKNOWN", label: franchise, studioLabel: franchise };
  return {
    title: title.trim(),
    release_date: releaseDate.trim(),
    universe: u.code,
    universe_label: u.label,
    studio_label: u.studioLabel,
    // Numbers as they appear in the legacy Tableau sheet — kept for diffing only.
    sheet: {
      domestic: money(domestic),
      international: money(intl),
      worldwide: money(total),
    },
    // Filled by Box Office Mojo reconciliation.
    box_office: {
      domestic: null,
      international: null,
      worldwide: null,
      opening_weekend_domestic: null,
      widest_release_theaters: null,
    },
    budget: null,
    runtime_minutes: null,
    scores: { rt_critic: null, rt_audience: null, metacritic: null, imdb: null },
    sources: {},
    verified: false,
    notes: null,
  };
});

films.sort((a, b) => a.release_date.localeCompare(b.release_date) || a.title.localeCompare(b.title));

const out = {
  meta: {
    generated: new Date().toISOString(),
    currency: "USD",
    grosses: "nominal lifetime gross unless a film is still in release (then as-of dated)",
    universes: ["MCU", "DCEU", "DCU"],
    source_note: "Baseline parsed from the legacy Tableau Public sheet; box_office/budget/scores pending Box Office Mojo + score-source verification.",
  },
  films,
};

writeFileSync(join(root, "data/skeleton.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote data/skeleton.json — ${films.length} films (${films.filter(f => f.universe === "MCU").length} MCU, ${films.filter(f => f.universe === "DCEU").length} DCEU).`);
