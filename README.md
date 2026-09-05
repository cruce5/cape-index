# Marvel / DC / DCU Box Office

Rebuild of Bill Yost's [*Marvel / DC Box Office*](https://public.tableau.com/app/profile/bill.yost/viz/MarvelDCBoxOffice/Welcome)
Tableau Public suite as a verified dataset + a dark-first, single-file HTML visualization package.

## Universes tracked

| Code | Label | Span | Notes |
|------|-------|------|-------|
| `MCU`  | Marvel Cinematic Universe | *Iron Man* (2008) → present | Marvel Studios productions only (no Sony/Fox Spider-Man, X-Men, etc.). *Deadpool & Wolverine* counts. |
| `DCEU` | DC Extended Universe | *Man of Steel* (2013) → *Aquaman and the Lost Kingdom* (Dec 2023) | **Closed continuity.** Nothing releases after Dec 2023. |
| `DCU`  | DC Universe — "Gods and Monsters" | *Superman* (July 2025) → present | James Gunn / Peter Safran relaunch. Theatrical films only (Creature Commandos, Peacemaker, Lanterns are TV). |

## Data pipeline

Canonical dataset: **`data/films.json`** (version-controlled, hand-verified). Everything else feeds it.

| Script | Does |
|--------|------|
| `npm run parse:baseline` | Parse `data/sheet-baseline.csv` (frozen copy of the legacy Tableau sheet) → skeleton `data/films.json`. |
| `npm run scrape:bom` | Politely walk Box Office Mojo (cached to `data/raw/`, ~5–8 s between hits, resumable) for every film + the post-*Brave New World* candidates in `data/additions.json` → `data/scraped.json`. Pulls domestic / international / worldwide / domestic opening / budget / runtime / MPAA / distributor / genres. |
| `npm run reconcile` | Diff `data/scraped.json` against the legacy sheet → `RECONCILIATION.md` (old → new → delta) for sign-off before promotion into `films.json`. |
| `npm run build` | Render `src/` → `dist/index.html`, one self-contained file. |

Second verification pass (separate sources, not on the BOM title page): **widest-release theater count**, **Rotten Tomatoes critic + audience**, **Metacritic**, **IMDb**.

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
- [~] **Phase 1 — Verify**: BOM scrape running → reconcile → sign-off → promote to `films.json`
- [ ] **Phase 2 — Extend**: add post-BNW MCU + new DCU set; confirm each against BOM
- [ ] Phase 1b — scores + theater counts second pass
- [ ] **Phase 3 — Rebuild**: the seven views as one dark-first HTML file
- [ ] **Phase 4 — Deploy**: domain + host

## Open questions for Bill

1. **DCU label** — "DC Universe (Gods and Monsters)" or just "DCU"? Third accent colour preference?
2. **Joker: Folie à Deux** (2024) — include as a DC-on-film entry, or leave out (not DCEU/DCU canon)?
3. **Scores** — OK to pull RT / Metacritic / IMDb (needs a second scrape pass or an OMDb API key — free, 1k/day)?
4. **Grosses** — nominal only, or also inflation-adjusted (2025 USD) as a toggle?
