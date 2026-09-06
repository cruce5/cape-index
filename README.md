# Marvel / DC / DCU Box Office

Rebuild of Bill Yost's [*Marvel / DC Box Office*](https://public.tableau.com/app/profile/bill.yost/viz/MarvelDCBoxOffice/Welcome)
Tableau Public suite as a verified dataset + a dark-first, single-file HTML visualization package.

## Universes tracked

| Code | Label | Span | Notes |
|------|-------|------|-------|
| `MCU`  | Marvel Cinematic Universe | *Iron Man* (2008) → present | Marvel Studios productions only (no Sony/Fox Spider-Man, X-Men, etc.). *Deadpool & Wolverine* counts. |
| `DCEU` | DC Extended Universe | *Man of Steel* (2013) → *Aquaman and the Lost Kingdom* (Dec 2023) | **Closed continuity.** Nothing releases after Dec 2023. |
| `DCU`  | DC Universe | *Superman* (July 2025) → present | James Gunn / Peter Safran relaunch. Theatrical films only (Creature Commandos, Peacemaker, Lanterns are TV). |
| `Elseworlds` | DC Elseworlds | *Joker* (2019), *Joker: Folie à Deux* (2024) | Warner/DC standalone films outside any shared continuity. |

## Data pipeline

Canonical dataset: **`data/films.json`** (version-controlled, hand-verified). Everything else feeds it.

| Script | Does |
|--------|------|
| `npm run scrape:bom` | Politely walk Box Office Mojo (cached to `data/raw/`, ~5–8 s between hits, resumable) for every film + the post-legacy candidates in `data/additions.json` → `data/scraped.json`. |
| `npm run validate` | Cross-check every resolved BOM page's `<h1>` title/year against the film we meant to look up. |
| `OMDB_KEY=… npm run data` | Full rebuild: `parse-baseline` → `promote` (BOM numbers → `data/films.json`) → `enrich-omdb` (RT/Metacritic/IMDb) → `enrich-wikipedia` (budgets + `data/budget-overrides.json`) → `derive` (multiplier, ROI, break-even) → `reconcile` (`RECONCILIATION.md`). |
| `npm run build` | Inline `data/web.json` into `src/index.html` → `dist/index.html`, one self-contained file. |
| `node scripts/serve.mjs` | Static-serve `dist/` on :4599 for local preview. |

Still open: **widest-release theater counts** and **RT audience scores** (a second pass — not on the BOM title page or in OMDb).

## The Tableau suite (rebuild spec)

Seven tabs in the original workbook. The HTML version keeps all seven as sections/tabs of one page.

1. **Welcome** — title card ("Superheroes at the Box Office — how powerful is Marvel and DC at the movies?"), intro copy, nav links, decorative character bands.
2. **Marvel v DC** — side-by-side franchise scorecards: total movies, total / average / median worldwide gross; stacked **box-office-by-year area chart** (Marvel above axis, DC below, 2007–2026); **box-&-whisker** of gross by franchise. Filters: *Outlier filter*, *Franchise*. Headline: "…Marvel making almost 5× as much globally."
3. **Treemap / movie** — treemap of every film, area = worldwide gross, colour = universe, label = title + gross. Filter: *Franchise*.
4. **Bubbles / movie** — packed-bubble timeline (bubbles per year, sized by gross) above two packed-bubble clusters (DC vs Marvel), bubble = film sized by gross. Filter: *Franchise*.
5. **Scatterplot** — X = release date, Y = worldwide gross, marker = universe logo, reference lines at \$1B / \$2B, outliers labelled. Filters: *Franchise*, *Outlier filter*.
6. **Domestic / International** — diverging bar per film, domestic (blue) vs international (green), one view ranked by total gross, one normalised to 100% ranked by international share. Filters: *Franchise*, *Movie*.
7. **All data** — sortable table: release date, universe, title, worldwide, domestic, international, % domestic, % international.

Design: **dark mode is the primary design target, always.** Marvel = warm red, DCEU = blue, DCU = a third hue (TBD — teal/violet). Accessible contrast, works in light too.

## Roadmap

- [x] Scaffold repo, freeze legacy sheet, define schema
- [x] **Phase 1 — Verify**: BOM scrape → `RECONCILIATION.md` → **signed off** → `films.json` (57 verified)
- [x] **Phase 2 — Extend**: Joker ×2 (Elseworlds), Thunderbolts\*, F4: First Steps, Spider-Man: Brand New Day (MCU), Superman, Supergirl (DCU). Doomsday + Clayface held out.
- [x] **Phase 1b — Enrich**: RT / Metacritic / IMDb (OMDb), production budgets (Wikipedia + overrides), derived metrics.
- [x] **Phase 3 — Rebuild**: *The Cape Index* — seven dark-first views in one HTML file, nominal ⇄ 2025-$ toggle.
- [ ] **Phase 3b — polish**: whatever Bill flags on the first build; RT audience + theater counts if wanted.
- [x] **Phase 4 — Deploy**: live on Cloudflare Workers at cape-index.williamfyost.workers.dev (`npx wrangler deploy`). Custom domain still TBD.

## Decisions (locked 2026-09-05)

- Universes: `MCU`, `DCEU`, `DCU` (just "DCU"), `Elseworlds` (Joker films).
- Canonical data = `data/films.json` in the repo. Single self-contained HTML output.
- Full enrichment incl. scores. **Inflation toggle in the viz: yes.**
- Accent colours: MCU red, DCEU blue, DCU + Elseworlds — TBD (leaning teal + violet).

## Live

Live: https://cape-index.williamfyost.workers.dev  (Cloudflare Workers, `npx wrangler deploy`)
Artifact: https://claude.ai/code/artifact/0dfb8ff4-bde5-4e40-aa34-0d601c69089e
Local preview: `node scripts/serve.mjs` then http://localhost:4599
