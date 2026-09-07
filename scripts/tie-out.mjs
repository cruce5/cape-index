// Tie-out check: every hand-written number and claim in the prose (headlines, deks,
// notes, build log) is verified against the source data. Run it on every data refresh
// so a stale sentence can never quietly drift from what the charts compute.
//
//   node scripts/tie-out.mjs
//
// Exits 0 if every claim ties out, 1 (with a report) if any don't. Wired into
// `npm run build` and the weekly rebuild. Add a claim: drop another entry in CLAIMS.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const web = JSON.parse(readFileSync(join(ROOT, "data/web.json"), "utf8"));
const cast = JSON.parse(readFileSync(join(ROOT, "data/web-cast.json"), "utf8"));
const html = readFileSync(join(ROOT, "src/index.html"), "utf8");

const F = web.films;
const DC = new Set(["DCEU", "DCU", "Elseworlds"]);
const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];

// --- derived facts, computed the way the charts compute them ------------------
const N = F.length;
const twoB = F.filter((f) => f.ww >= 2e9);
const b1 = (pred) => F.filter((f) => f.ww >= 1e9 && pred(f)).length;
const mcuB = b1((f) => f.u === "MCU");
const dcB = b1((f) => DC.has(f.u));
const foxB = b1((f) => f.u === "Fox");
const sonyB = b1((f) => f.u === "SSU");
const sinceYr = {};
F.filter((f) => f.ww >= 1e9).forEach((f) => { const y = +f.date.slice(0, 4); if (y >= 2020) sinceYr[y] = (sinceYr[y] || 0) + 1; });
const maxSince2020 = Math.max(0, ...Object.values(sinceYr));
const intl = F.map((f) => f.pctIntl).filter((x) => x != null).sort((a, b) => a - b);
const intlLo = Math.round(intl[0]), intlHi = Math.round(intl[intl.length - 1]);
const topFilm = F.slice().sort((a, b) => b.ww - a.ww)[0];
const mcuTotal = F.filter((f) => f.u === "MCU").reduce((s, f) => s + f.ww, 0);
const dcTotal = F.filter((f) => DC.has(f.u)).reduce((s, f) => s + f.ww, 0);
const ratio = mcuTotal / dcTotal;
const mult = (t) => { const f = F.find((x) => x.t === t); return f ? f.mult.toFixed(1) : "?"; };

const counts = cast.characters.map((x) => ({ n: x.n, f: (x.films || []).length })).sort((a, b) => b.f - a.f);
const topChar = counts[0];
const singleAppear = counts.filter((x) => x.f === 1).length;
const maxFootprint = counts[0].f;
const minFootprint = 2; // the footprint chart filters to >= 2 appearances

// --- claims -------------------------------------------------------------------
// has:  HTML must contain this exact (data-derived) string.
// grab: run the regex on the HTML, compare the first capture group to `want`.
//       a regex that doesn't match at all is also a failure (the sentence moved).
const CLAIMS = [
  // the film count is hand-written into several sentences (the masthead/ledger stamp is
  // JS-generated from FILMS.length, so it's always right and isn't checked here); pin each
  // hand-typed instance so a partial update can't slip through
  { name: "film count — treemap", grab: /across all ([0-9]+) films/, want: String(N) },
  { name: "film count — split pies", grab: /be ([0-9]+) pies/, want: String(N) },
  { name: "film count — roster", grab: /all ([0-9]+) films in release order/, want: String(N) },
  { name: "film count — ledger note", grab: /same ([0-9]+) films as everything/, want: String(N) },
  { name: "$2B club is three, all Marvel",
    grab: /([a-z]+) films have passed \$2 billion/i, want: WORD[twoB.length],
    also: () => twoB.every((f) => f.u === "MCU") || `not all MCU: ${twoB.map((f) => f.t + "/" + f.u).join(", ")}` },
  { name: "MCU $1B count (§04 headline)", grab: /cleared \$1 billion ([a-z]+) times/i, want: WORD[mcuB] },
  { name: "DC $1B count (§04 headline)", grab: /DC ([a-z]+) times/i, want: WORD[dcB] },
  { name: "Fox & Sony $1B = never (§04)", also: () => (foxB === 0 && sonyB === 0) || `Fox ${foxB}, Sony ${sonyB} cleared $1B`,
    has: "Fox and Sony never" },
  { name: "since-2020 one-$1B-a-year (§03)", also: () => maxSince2020 <= 1 || `a year since 2020 had ${maxSince2020} $1B films`,
    has: "no year has produced more than one billion-dollar film" },
  { name: "overseas split range (§09)", has: `${intlLo}% to ${intlHi}%` },
  { name: "top film is the $2.8B one", has: `$${(topFilm.ww / 1e9).toFixed(1)}B`, note: `${topFilm.t}` },
  { name: "Aquaman legs multiplier (§07 dek)", grab: /Aquaman<\/em> finished at ([0-9.]+)&times;/, want: mult("Aquaman") },
  { name: "Joker: Folie à Deux legs multiplier (§07 dek)", grab: /Folie &agrave; Deux<\/em> managed ([0-9.]+)&times;/, want: mult("Joker: Folie à Deux") },
  { name: "Spider-Man appearances (§11 headline)", grab: /Spider-Man has been in ([a-z]+) films/i, want: WORD[topChar.f],
    also: () => (topChar.n === "Spider-Man") || `top character is ${topChar.n}, not Spider-Man` },
  { name: "single-appearance characters (~130)", grab: /there are ~?([0-9]+) of them/i, want: String(singleAppear) },
  { name: "footprint range (§11 note)", grab: /small integers \(([0-9]+)&ndash;([0-9]+)\)/, want: String(minFootprint), want2: String(maxFootprint) },
  { name: "Marvel-to-DC ratio supports 'nearly three to one'", also: () => (ratio >= 2.4 && ratio < 3.4) || `ratio is ${ratio.toFixed(2)}x, re-word §01` },
];

// --- run ----------------------------------------------------------------------
const fails = [];
for (const c of CLAIMS) {
  if (c.has && !html.includes(c.has)) {
    fails.push(`${c.name}: HTML is missing "${c.has}"${c.note ? " (" + c.note + ")" : ""}`);
  }
  if (c.grab) {
    const m = html.match(c.grab);
    if (!m) { fails.push(`${c.name}: pattern ${c.grab} not found in HTML (sentence changed?)`); }
    else {
      const got = (m[1] !== undefined ? m[1] : m[2]);
      if (String(got) !== String(c.want)) fails.push(`${c.name}: HTML says "${got}", data says "${c.want}"`);
      if (c.want2 !== undefined && String(m[2]) !== String(c.want2)) fails.push(`${c.name}: HTML upper "${m[2]}", data says "${c.want2}"`);
    }
  }
  if (c.also) {
    const r = c.also();
    if (r !== true) fails.push(`${c.name}: ${r}`);
  }
}

if (fails.length) {
  console.error(`\nTIE-OUT FAILED — ${fails.length} claim(s) don't match the data:\n`);
  fails.forEach((f) => console.error("  ✗ " + f));
  console.error("\nFix the prose in src/index.html (or the data), then re-run.\n");
  process.exit(1);
}
console.log(`tie-out OK — ${CLAIMS.length} claims verified against ${N} films`);
