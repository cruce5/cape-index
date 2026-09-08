# The Cape Index

Every live-action Marvel or DC superhero film since 2000 that belongs to a
multi-film franchise, its box office from Box Office Mojo, and a dark-first single-file HTML
visualization of the lot.

**Live:** https://capeindex.com

Grew out of [Bill Yost's *Marvel / DC Box Office*](https://public.tableau.com/app/profile/bill.yost/viz/MarvelDCBoxOffice/Welcome)
Tableau Public workbook. The rebuild turned into a re-check against the source and a
much wider scope. The full story of how it got made, with the wrong turns and
the bugs, is section 15 of the site itself.

## Scope

One rule: every live-action theatrical **Marvel or DC superhero film** whose
continuity **began in 2000 or later** and that is **part of a multi-film
continuity**: a shared universe, a trilogy, or a film with a theatrical sequel.
One-and-done films with no sequel are out (no franchise arc to compare).

**In (91 films):**

| Code | Group | What it covers |
|------|-------|----------------|
| `MCU` | Marvel Cinematic Universe | Marvel Studios productions. *Deadpool & Wolverine* counts here, not Fox. |
| `Fox` | 20th Century Fox's Marvel films | The X-Men series (2000–2020), the 2005 *Fantastic Four* and *Rise of the Silver Surfer*, *Daredevil*, *Elektra*. |
| `SSU` | Sony's Marvel films | Raimi's *Spider-Man* trilogy, *The Amazing Spider-Man* 1–2, the Venom-led SSU, both *Ghost Rider*s. |
| `DCEU` | DC Extended Universe | *Man of Steel* (2013) through *Aquaman and the Lost Kingdom* (2023). Closed continuity. |
| `DCU` | DC Universe | James Gunn's relaunch, *Superman* (2025) on. Theatrical only. |
| `Elseworlds` | DC's standalone films | Nolan's *Dark Knight* trilogy, both *Joker*s, *The Batman*. |

**Out:** continuities that began before 2000 (Burton's *Batman*, Donner's
*Superman*, the *Blade* trilogy); anything animated; one-and-done films
(*Catwoman*, *Constantine*, *Green Lantern*, *Jonah Hex*, *Watchmen*, Ang Lee's
*Hulk*, the 2015 *Fantastic Four*, both *Punisher*s, *Superman Returns* as a coda
to Donner's run, and *Kick-Ass* as creator-owned). A later multiverse cameo
doesn't pull an excluded film back in.

## Data

`data/films.json` is the canonical dataset. Everything else feeds it.

Adding a film: append it to `data/additions.json` with a pinned IMDb id, then

```
npm run scrape:bom          # Box Office Mojo: worldwide / domestic / overseas / opening
OMDB_KEY=<key> npm run data  # scores from OMDb, budgets, derived metrics, RECONCILIATION.md
npm run cast                 # Wikipedia cast sections -> the roster
npm run build                # inline everything into dist/index.html + og.png
```

Grosses are scraped from Box Office Mojo, one title page at a time, and the scraper matches each film to the right page automatically. Budgets are the **production**
budget (r/boxoffice convention, not marketing-inclusive); break-even is estimated
at 2.5× that. In-release films are marked and held out of the profit tallies.
About a third of the budgets are estimates, marked `est.` in the ledger.

## Weekly refresh

`scripts/weekly-rebuild.ps1` (Windows Task Scheduler, Mondays) re-scrapes only the
films still in motion (released within ~10 months, or not out yet), rebuilds, and
deploys. Older films stay frozen. It aborts before deploying on any failure and
logs to `scripts/weekly-rebuild.log`.

Set up: copy `scripts/local.env.example.ps1` to `scripts/local.env.ps1` and put
your OMDb key in it (gitignored).

## Design

Dark mode is the primary target. The palette is a color-blind-safe set
([Paul Tol "bright"](https://personal.sron.nl/~pault/) plus a gray), validated
with a script rather than by eye, with a mark shape per group as a backstop.
Type is three faces with one job each: IBM Plex Sans Condensed for headings and hero
numbers, Sans for every word a reader reads, Mono for figures and metadata, each declared
once as a token with a real fallback. Section headlines state the finding, not the axis. No dual-axis charts, no trend
lines where the data doesn't support one, median over mean. Every chart carries a
"why this form / what it can't tell you" note behind a toggle, and every encoded
value is a plain number in the data table.

## Stack

One HTML file, hand-written inline SVG, no charting library. Node scripts for the
data pipeline. Hosted on Cloudflare Workers static assets (`npm run deploy`).
Local preview: `node scripts/serve.mjs` then http://localhost:4599.

## Credits

Built by [Bill Yost](https://www.linkedin.com/in/billyost/), rebuilt from his
Tableau Public workbook. Box office from Box Office Mojo, scores from OMDb, cast
from Wikipedia. Not affiliated with Marvel, DC, Disney, Warner Bros. or Sony.

Code is [MIT](LICENSE). The box office figures are facts and aren't covered by it.
