// Slim data/characters.json + data/cast-raw.json into data/web-cast.json for the page.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const chars = JSON.parse(readFileSync(join(ROOT, "data/characters.json"), "utf8")).characters;
const filmOrder = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8")).films.map((f) => f.title);

const primaryUniverse = (c) => {
  // the universe the character is most associated with = where it appears most
  const t = {};
  c.films.forEach((f) => { t[f.universe] = (t[f.universe] || 0) + 1; });
  return Object.keys(t).sort((a, b) => t[b] - t[a])[0];
};

const characters = chars.map((c) => {
  const films = c.films.filter((f) => filmOrder.includes(f.title));
  const fa = {};
  films.forEach((f) => { if (f.actor) fa[f.title] = f.actor; });
  return {
    n: c.name,
    real: c.real_name || null,
    u: primaryUniverse(c),
    us: c.universes,
    apps: c.appearances,
    actors: c.actors,
    films: films.map((f) => f.title),
    fa, // film title -> actor in that film
  };
});

const byFilm = {};
filmOrder.forEach((t) => { byFilm[t] = []; });
characters.forEach((c) => c.films.forEach((t) => byFilm[t].push(c.n)));

writeFileSync(join(ROOT, "data/web-cast.json"), JSON.stringify({
  generated: JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8")).meta.generated,
  source: "English Wikipedia film cast sections",
  note: "Costumed / codenamed characters only. Recasts counted as one character (see .actors).",
  characters,
  byFilm,
}));
console.log(`web-cast.json — ${characters.length} characters, ${(JSON.stringify({ characters, byFilm }).length / 1024).toFixed(0)} KB`);
