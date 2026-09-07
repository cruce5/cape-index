// Did the weekly refresh change any actual data, or only the timestamps?
//
// Every data file carries a `generated` / `scraped_at` stamp that moves on every run,
// so `git diff --quiet` always says "changed" and the weekly job used to push a
// no-op "Weekly data refresh" commit each Monday. This compares each tracked data
// file against HEAD with those keys stripped. Exit 0 = nothing real changed,
// exit 1 = something did (prints which files).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILES = ["data/films.json", "data/scraped.json", "data/skeleton.json", "data/web.json", "data/web-cast.json", "data/characters.json"];
const STAMPS = new Set(["generated", "scraped_at", "fetched_at", "enriched_at"]);

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) if (!STAMPS.has(k)) o[k] = strip(v[k]);
    return o;
  }
  return v;
}
function canon(text) { return JSON.stringify(strip(JSON.parse(text))); }

const changed = [];
for (const f of FILES) {
  let head;
  try { head = execSync(`git show HEAD:${f}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { changed.push(f + " (new)"); continue; }
  let disk;
  try { disk = readFileSync(f, "utf8"); } catch { continue; }
  if (canon(head) !== canon(disk)) changed.push(f);
}

if (changed.length) { console.log("data changed: " + changed.join(", ")); process.exit(1); }
console.log("no data changes beyond timestamps");
process.exit(0);
