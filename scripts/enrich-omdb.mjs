// Fill scores (Rotten Tomatoes critic, Metacritic, IMDb) and backfill runtime
// from OMDb, keyed by the BOM/IMDb tt id already in data/films.json.
//
//   OMDB_KEY=xxxxxxxx node scripts/enrich-omdb.mjs
//
// OMDb has no RT *audience* score and no budget — those stay null here and are
// handled in a separate pass. Raw responses cache to data/raw/omdb-<id>.json.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, sleep } from "./lib-bom.mjs";

const KEY = process.env.OMDB_KEY || process.argv[2];
if (!KEY) {
  console.error("Set OMDB_KEY (env) or pass the key as arg 1.");
  process.exit(1);
}

const path = join(ROOT, "data/films.json");
const data = JSON.parse(readFileSync(path, "utf8"));

const num = (s) => {
  if (s == null) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

let updated = 0;
for (const f of data.films) {
  const id = f.bom?.id;
  if (!id) continue;
  const cache = join(ROOT, `data/raw/omdb-${id}.json`);
  let j;
  if (existsSync(cache)) {
    j = JSON.parse(readFileSync(cache, "utf8"));
  } else {
    const r = await fetch(`https://www.omdbapi.com/?apikey=${KEY}&i=${id}&tomatoes=true`);
    j = await r.json();
    if (j.Response === "False") {
      console.error(`  ${f.title}: ${j.Error}`);
      if (/api key/i.test(j.Error || "")) process.exit(1);
      await sleep(1100);
      continue;
    }
    writeFileSync(cache, JSON.stringify(j, null, 2));
    await sleep(1100);
  }

  const rt = (j.Ratings || []).find((x) => x.Source === "Rotten Tomatoes");
  f.scores.rt_critic = rt ? num(rt.Value) : f.scores.rt_critic;
  f.scores.metacritic = j.Metascore && j.Metascore !== "N/A" ? num(j.Metascore) : f.scores.metacritic;
  f.scores.imdb = j.imdbRating && j.imdbRating !== "N/A" ? num(j.imdbRating) : f.scores.imdb;
  if (!f.runtime_minutes && j.Runtime && j.Runtime !== "N/A") f.runtime_minutes = num(j.Runtime);
  updated++;
  console.log(`  ${f.title}: RT ${f.scores.rt_critic ?? "—"} · MC ${f.scores.metacritic ?? "—"} · IMDb ${f.scores.imdb ?? "—"}`);
}

data.meta.scores_source = "OMDb (omdbapi.com) — RT critic, Metacritic, IMDb; RT audience + budgets pending";
data.meta.generated = new Date().toISOString();
writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
console.log(`\nEnriched ${updated}/${data.films.length} films.`);
