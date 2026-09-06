// Pull the "Cast" section of each film's Wikipedia page and parse
// `* [[Actor]] as [[link|Character / Alias]]: ...` lines (billing order).
// Output:
//   data/cast-raw.json   — every credited role, per film, with order
//   data/characters.json — costumed/codenamed characters only (alias form or
//                          a known single-name identity), rolled up across films
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, sleep } from "./lib-bom.mjs";

const films = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8")).films;
const PAGES = JSON.parse(readFileSync(join(ROOT, "data/wiki-pages.json"), "utf8")).pages;

async function wikitext(page) {
  const cache = join(ROOT, `data/raw/wikicast-${page.replace(/[^a-z0-9]+/gi, "_")}.txt`);
  if (existsSync(cache)) return readFileSync(cache, "utf8");
  const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(page)}`;
  for (let a = 0; a < 4; a++) {
    const r = await fetch(url, { headers: { "User-Agent": "marvel-dc-boxoffice/0.1 (cast dataset; williamfyost@gmail.com)" } });
    const body = await r.text();
    if (r.status === 429 || /too many requests/i.test(body)) { await sleep(8000 * (a + 1)); continue; }
    let j; try { j = JSON.parse(body); } catch { return ""; }
    const wt = j?.parse?.wikitext?.["*"] || "";
    if (wt) writeFileSync(cache, wt);
    await sleep(2500);
    return wt;
  }
  return "";
}

const strip = (s) =>
  s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/'''?/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

// text inside [[link|display]] -> display; [[link]] -> link
function unlink(s) {
  return s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, tgt, disp) => (disp || tgt).replace(/\s*\([^)]*\)\s*$/, ""));
}

// Codenames Wikipedia writes WITHOUT a "/" alias (true mononyms + a few 2-word ones).
const CODE_KEEP = new Set([
  // MCU
  "Thanos", "Loki", "Groot", "Rocket", "Gamora", "Nebula", "Drax", "Mantis", "Vision", "Ultron",
  "Hela", "Ronan", "Yondu", "Korg", "Wong", "Namor", "Attuma", "Sylvie", "Clea", "Sersi",
  "Ikaris", "Kingo", "Sprite", "Phastos", "Makkari", "Druig", "Gilgamesh", "Thena", "Ajak",
  "Dormammu", "Gorr", "Kurse", "Malekith", "Surtur", "Abomination", "Whiplash", "Mysterio",
  "Vulture", "Taskmaster", "Ghost", "Yellowjacket", "Kang", "Valkyrie", "Wenwu", "Xialing",
  "Mordo", "Kaecilius", "Ebony Maw", "Corvus Glaive", "Proxima Midnight", "Cull Obsidian",
  "Adam Warlock", "High Evolutionary", "Cassandra Nova", "Lady Deathstrike", "Silver Surfer",
  "Galactus", "Red Skull", "Zemo", "Baron Zemo", "Winter Soldier", "War Machine", "Scarlet Witch",
  "Star-Lord", "Doctor Strange", "Ancient One", "The Ancient One", "The Mandarin", "The Leader",
  "Aunt May", "Red Guardian", "Ghost Rider", "US Agent", "U.S. Agent", "John Walker",
  "Red Hulk", "Mighty Thor",
  // DC
  "Doomsday", "Steppenwolf", "Darkseid", "Ares", "Starro", "Krypto", "Peacemaker", "Bloodsport",
  "Blackguard", "Mongal", "Javelin", "Weasel", "Savant", "T.D.K.", "Nanaue", "King Shark",
  "Milton", "Enchantress", "Katana", "Slipknot", "El Diablo", "Killer Croc",
  "Captain Boomerang", "Ratcatcher 2", "Polka-Dot Man", "The Thinker", "Lex Luthor", "General Zod",
  "Faora", "Black Manta", "Ocean Master", "Doctor Sivana", "Mister Mind", "Maxwell Lord", "Cheetah",
  "Doctor Poison", "Amanda Waller", "Rick Flag", "Anti-Monitor", "Dark Flash", "Girl of Steel",
  "Mister Terrific", "Metamorpho", "Green Lantern", "Guy Gardner", "Hawkgirl", "Ultraman",
  "The Engineer", "Atom Smasher", "Cyclone", "Hawkman", "Doctor Fate", "Sabbac", "Blue Beetle",
]);

const AKA_STOP = /^(himself|herself|voice|narrator|young|old|kid|teen)$/i;

function parseCast(wt, filmTitle) {
  let start = -1;
  for (const h of ["== Cast ==", "==Cast==", "== Cast and characters ==", "==Cast and characters==", "== Casting ==", "==Casting=="]) {
    const i = wt.indexOf(h);
    if (i !== -1) { start = i + h.length; break; }
  }
  if (start === -1) return { rows: [], missing: true };
  let end = wt.indexOf("\n==", start);
  if (end === -1) end = wt.length;
  const section = wt.slice(start, end);

  const rows = [];
  let order = 0;
  for (const rawLine of section.split("\n")) {
    const m = rawLine.match(/^(\*+)\s*(.+)$/);
    if (!m) continue;
    const depth = m[1].length;
    let body = m[2];
    // must look like "<actor> as <character>"
    const am = body.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s+as\s+(.+)$/i)
      || body.match(/^([A-ZÀ-Ý][\wÀ-ÿ.'’-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ.'’-]+){0,3})\s+as\s+(.+)$/);
    if (!am) continue;
    const actor = strip(unlink(am[1])).replace(/\s*\([^)]*\)\s*$/, "");
    let character = strip(unlink(am[2].split(/<br|\n/)[0].replace(/<!--[\s\S]*/, "")));
    character = character.split(/:(?:\s|$)|:</)[0].trim();           // role separator colon
    character = character.replace(/\.\s+[A-Z][a-z]+\s+[a-z].*$/, ""); // trailing prose sentence
    character = character.replace(/\s*\((?:voiced by|voice|uncredited|cameo|archive footage|photo|young|older)[^)]*\)\s*$/i, "");
    character = character.replace(/\s*"[^"]*"\s*/g, " ").replace(/[.,;]+$/, "").replace(/\s+/g, " ").trim();
    if (!character || character.length > 60) continue;
    if (depth === 1) order++;
    rows.push({ order: depth === 1 ? order : null, minor: depth > 1, actor, character });
  }
  return { rows, missing: rows.length === 0 };
}

// Pull a codename out of a character string.
var CODE_RX = /^(the |captain |doctor |mister |mr\.? |ms\.? |lady |baron |general |king |black |red |white |green |blue |iron |war |ghost |scarlet |golden |dark )/i;
var CODE_SUFFIX = /(man|woman|-man|girl|boy|verine|pool|witch|panther|widow|hawk|beetle|shark|surfer|monger|lord|master|skull|guardian|lantern|monitor|adam|strange|marvel|america|-el)$/i;

function codenameOf(character) {
  const parts = character.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    // an aliased entry ("Real Name / Codename") — pick the codename-looking part
    for (const c of parts.slice(1).reverse()) {
      if (CODE_KEEP.has(c) || CODE_RX.test(c) || CODE_SUFFIX.test(c)) return { code: c, real: parts[0] };
    }
    return { code: parts[parts.length - 1], real: parts[0] };
  }
  if (CODE_KEEP.has(character)) return { code: character, real: null };
  return null;
}

// Any of these strings (a real name, an alias, a variant) -> one canonical codename.
const CANON = {
  "Iron Man": "Iron Man", "Tony Stark": "Iron Man",
  "Captain America": "Captain America", "Steve Rogers": "Captain America", "Nomad": "Captain America",
  // Sam Wilson carries the Falcon mantle for five films, then Captain America from 2025 — track them apart (as with Natasha / Yelena).
  "Sam Wilson": "Falcon", "Sam Wilson / Captain America": "Captain America (Sam Wilson)",
  "Hulk": "Hulk", "The Hulk": "Hulk", "Bruce Banner": "Hulk", "Smart Hulk": "Hulk",
  "Thor": "Thor", "Thor Odinson": "Thor",
  "Black Widow": "Black Widow", "Natasha Romanoff": "Black Widow", "Natasha Romanova": "Black Widow", "Yelena Belova": "Black Widow (Yelena)",
  "Hawkeye": "Hawkeye", "Ronin": "Hawkeye", "Clint Barton": "Hawkeye",
  // War Machine only from Iron Man 2 on (suits up then); "James Rhodes" alone in Iron Man 2008 is pre-armour and does not count.
  "War Machine": "War Machine", "Iron Patriot": "War Machine",
  "Falcon": "Falcon", "Joaquin Torres": "Falcon (Joaquin Torres)", "Joaquin Torres / Falcon": "Falcon (Joaquin Torres)",
  "Winter Soldier": "Winter Soldier", "White Wolf": "Winter Soldier", "Bucky Barnes": "Winter Soldier", "Bucky Buchanan Barnes": "Winter Soldier", "James Bucky Barnes": "Winter Soldier",
  "Scarlet Witch": "Scarlet Witch", "Wanda Maximoff": "Scarlet Witch", "Wanda": "Scarlet Witch",
  "Spider-Man": "Spider-Man", "Peter Parker": "Spider-Man",
  "Star-Lord": "Star-Lord", "Peter Quill": "Star-Lord",
  "Captain Marvel": "Captain Marvel", "Carol Danvers": "Captain Marvel", "Vers": "Captain Marvel",
  "Ant-Man": "Ant-Man", "Scott Lang": "Ant-Man",
  "Wasp": "Wasp", "The Wasp": "Wasp", "Hope van Dyne": "Wasp", "Janet van Dyne": "Wasp (Janet)",
  "Zemo": "Zemo", "Baron Zemo": "Zemo", "Helmut Zemo": "Zemo",
  "The Mandarin": "The Mandarin", "Wenwu": "The Mandarin", "Xu Wenwu": "The Mandarin",
  "Doctor Strange": "Doctor Strange", "Stephen Strange": "Doctor Strange", "Sinister Strange": "Doctor Strange", "Defender Strange": "Doctor Strange",
  "Black Panther": "Black Panther", "T'Challa": "Black Panther",
  "Shuri / Black Panther": "Black Panther (Shuri)", // Shuri takes the mantle in Wakanda Forever
  "Yelena Belova / Black Widow": "Black Widow (Yelena)",
  "The Ancient One": "The Ancient One", "Ancient One": "The Ancient One",
  "General Zod": "General Zod", "Zod": "General Zod", "Dru-Zod": "General Zod",
  "Lex Luthor": "Lex Luthor", "Alexander Luthor": "Lex Luthor", "Alexander Luthor Jr.": "Lex Luthor",
  "Ocean Master": "Ocean Master", "Orm": "Ocean Master", "Orm Marius": "Ocean Master",
  "Doctor Sivana": "Doctor Sivana", "Sivana": "Doctor Sivana", "Thaddeus Sivana": "Doctor Sivana",
  "Harley Quinn": "Harley Quinn", "Harleen Quinzel": "Harley Quinn", "Harleen Frances Quinzel": "Harley Quinn",
  "Deadpool": "Deadpool", "Wade Wilson": "Deadpool",
  "Wolverine": "Wolverine", "Logan": "Wolverine", "James Howlett": "Wolverine",
  "Supergirl": "Supergirl", "Kara Zor-El": "Supergirl", "Kara": "Supergirl", "Girl of Steel": "Supergirl",
  "Superman": "Superman", "Clark Kent": "Superman", "Kal-El": "Superman",
  "Batman": "Batman", "Bruce Wayne": "Batman",
  "Wonder Woman": "Wonder Woman", "Diana Prince": "Wonder Woman", "Diana of Themyscira": "Wonder Woman",
  "Aquaman": "Aquaman", "Arthur Curry": "Aquaman",
  "The Flash": "The Flash", "the Flash": "The Flash", "Barry Allen": "The Flash",
  "Cyborg": "Cyborg", "Victor Stone": "Cyborg",
  "Shazam": "Shazam", "Shazam!": "Shazam", "Billy Batson": "Shazam", "William Batson": "Shazam",
  "Black Adam": "Black Adam", "Teth-Adam": "Black Adam", "Teth Adam": "Black Adam", 
  "Doctor Fate": "Doctor Fate", "Kent Nelson": "Doctor Fate",
  "Blue Beetle": "Blue Beetle", "Jaime Reyes": "Blue Beetle",
  "OMAC": "OMAC", "Carapax": "OMAC", "Ignacio Carapax": "OMAC", "Conrad Carapax": "OMAC",
  "Killmonger": "Killmonger", "Erik Killmonger": "Killmonger", "Erik Killmonger Stevens": "Killmonger", "Erik Stevens": "Killmonger", "N'Jadaka": "Killmonger",
  "Vulture": "Vulture", "Adrian Toomes": "Vulture",
  "Mysterio": "Mysterio", "Quentin Beck": "Mysterio",
  "Green Goblin": "Green Goblin", "Norman Osborn": "Green Goblin",
  "Doctor Octopus": "Doctor Octopus", "Otto Octavius": "Doctor Octopus",
  "Electro": "Electro", "Max Dillon": "Electro",
  "Yellowjacket": "Yellowjacket", "M.O.D.O.K.": "M.O.D.O.K.", "M.O.D.O.K": "M.O.D.O.K.", "Darren Cross": "Yellowjacket",
  "Kang": "Kang", "Kang the Conqueror": "Kang", "He Who Remains": "Kang", "Victor Timely": "Kang",
  "Red Skull": "Red Skull", "Johann Schmidt": "Red Skull",
  "Abomination": "Abomination", "Emil Blonsky": "Abomination",
  "Whiplash": "Whiplash", "Ivan Vanko": "Whiplash",
  "Iron Monger": "Iron Monger", "Obadiah Stane": "Iron Monger",
  "The Leader": "The Leader", "Samuel Sterns": "The Leader",
  // Thaddeus Ross is a plain government official in five films; he is only credited "/ Red Hulk" in Brave New World (2025), so that is his one costumed appearance.
  "Red Hulk": "Red Hulk",
  "Ms. Marvel": "Ms. Marvel", "Kamala Khan": "Ms. Marvel",
  "Ironheart": "Ironheart", "Riri Williams": "Ironheart",
  "U.S. Agent": "U.S. Agent", "US Agent": "U.S. Agent", "John Walker": "U.S. Agent",
  // Jane Foster is an astrophysicist in Thor / The Dark World; she is only "/ Mighty Thor" in Love and Thunder (2022).
  "Mighty Thor": "Mighty Thor",
  "Gorr": "Gorr", "Gorr the God Butcher": "Gorr",
  "Sentry": "Sentry", "Void": "Sentry", "Bob Reynolds": "Sentry", "Robert Reynolds": "Sentry",
  "Red Guardian": "Red Guardian", "Alexei Shostakov": "Red Guardian",
  "Taskmaster": "Taskmaster", "Antonia Dreykov": "Taskmaster",
  "Ghost": "Ghost", "Ava Starr": "Ghost",
  "Mister Fantastic": "Mister Fantastic", "Reed Richards": "Mister Fantastic",
  "Invisible Woman": "Invisible Woman", "Sue Storm": "Invisible Woman", "Susan Storm": "Invisible Woman",
  "Human Torch": "Human Torch", "Johnny Storm": "Human Torch", "Jonathan Storm": "Human Torch",
  "The Thing": "The Thing", "Ben Grimm": "The Thing", "Benjamin Grimm": "The Thing",
  "Silver Surfer": "Silver Surfer", "Shalla-Bal": "Silver Surfer",
  "Mole Man": "Mole Man", "Harvey Elder": "Mole Man",
  "Shang-Chi": "Shang-Chi", "Xu Shang-Chi": "Shang-Chi", "Shaun": "Shang-Chi",
  "Xialing": "Xialing", "Xu Xialing": "Xialing",
  "Namor": "Namor", "Kʼukʼulkan": "Namor",
  "Adam Warlock": "Adam Warlock", "High Evolutionary": "High Evolutionary",
  "Black Manta": "Black Manta", "David Kane": "Black Manta",
  "Cheetah": "Cheetah", "Barbara Minerva": "Cheetah",
  "Maxwell Lord": "Maxwell Lord",
  "Enchantress": "Enchantress", "June Moone": "Enchantress",
  "Deadshot": "Deadshot", "Floyd Lawton": "Deadshot",
  "El Diablo": "El Diablo", "Chato Santana": "El Diablo",
  "Killer Croc": "Killer Croc", "Waylon Jones": "Killer Croc",
  "Captain Boomerang": "Captain Boomerang", "Digger Harkness": "Captain Boomerang", "George Digger Harkness": "Captain Boomerang",
  "Katana": "Katana", "Tatsu Yamashiro": "Katana",
  "Slipknot": "Slipknot", "Christopher Weiss": "Slipknot",
  "Bloodsport": "Bloodsport", "Robert DuBois": "Bloodsport",
  "Peacemaker": "Peacemaker", "Christopher Smith": "Peacemaker",
  "Ratcatcher 2": "Ratcatcher 2", "Cleo Cazo": "Ratcatcher 2",
  "Polka-Dot Man": "Polka-Dot Man", "Abner Krill": "Polka-Dot Man",
  "King Shark": "King Shark", "Nanaue": "King Shark",
  "The Thinker": "The Thinker", "Gaius Grieves": "The Thinker",
  "The Huntress": "Huntress", "Huntress": "Huntress", "Helena Bertinelli": "Huntress",
  "Black Mask": "Black Mask", "Roman Sionis": "Black Mask",
  "Doctor Poison": "Doctor Poison", "Isabel Maru": "Doctor Poison",
  "Steppenwolf": "Steppenwolf", "Doomsday": "Doomsday",
  "Faora": "Faora", "Faora-Ul": "Faora",
  "Anti-Monitor": "Anti-Monitor", "Dark Flash": "Dark Flash",
  "Atom Smasher": "Atom Smasher", "Al Rothstein": "Atom Smasher", "Albert Rothstein": "Atom Smasher",
  "Cyclone": "Cyclone", "Maxine Hunkel": "Cyclone",
  "Hawkman": "Hawkman", "Carter Hall": "Hawkman",
  "Sabbac": "Sabbac", "Ishmael Gregor": "Sabbac",
  "Mister Terrific": "Mister Terrific", "Michael Holt": "Mister Terrific",
  "Metamorpho": "Metamorpho", "Rex Mason": "Metamorpho",
  "Green Lantern": "Green Lantern", "Guy Gardner": "Green Lantern",
  "Hawkgirl": "Hawkgirl", "Kendra Saunders": "Hawkgirl",
  "The Engineer": "The Engineer", "Angela Spica": "The Engineer",
  "Ultraman": "Ultraman",
  "Krypto": "Krypto",
  "Joker": "Joker", "Arthur Fleck": "Joker",
  "The Collector": "The Collector", "Taneleer Tivan": "The Collector",
  "Amanda Waller": "Amanda Waller", "Rick Flag": "Rick Flag",
  // Nick Fury has no codename — out of scope for a costumed/codenamed roster.
  "Blackguard": "Blackguard", "Savant": "Savant", "Weasel": "Weasel", "Mongal": "Mongal", "Javelin": "Javelin", "T.D.K.": "T.D.K.",
  "Valkyrie": "Valkyrie",
  "Pyro": "Pyro", "John Allerdyce": "Pyro",
  "Cassandra Nova": "Cassandra Nova",
  "Kurse": "Kurse", "Algrim": "Kurse",
  "Sidewinder": "Sidewinder", "Seth Voelker": "Sidewinder",
  "Mar-Vell": "Mar-Vell", "Wendy Lawson": "Mar-Vell", "Dr. Wendy Lawson": "Mar-Vell",
  "Black Canary": "Black Canary", "Dinah Lance": "Black Canary", "Shocker": "Shocker", "Herman Schultz": "Shocker",
  // Sony's Spider-Man Universe
  "Venom": "Venom", "Eddie Brock": "Venom",
  "Carnage": "Carnage", "Cletus Kasady": "Carnage",
  "Riot": "Riot", "Carlton Drake": "Riot",
  "Shriek": "Shriek", "Frances Barrison": "Shriek",
  "Morbius": "Morbius", "Michael Morbius": "Morbius", "Dr. Michael Morbius": "Morbius",
  "Madame Web": "Madame Web", "Cassandra Webb": "Madame Web", "Cassie Webb": "Madame Web",
  "Kraven the Hunter": "Kraven the Hunter", "Kraven": "Kraven the Hunter", "Sergei Kravinoff": "Kraven the Hunter",
  "Chameleon": "Chameleon", "Dmitri Kravinoff": "Chameleon", "Dmitri Smerdyakov": "Chameleon",
  "Rhino": "Rhino", "Aleksei Sytsevich": "Rhino",
  "Toxin": "Toxin", "Patrick Mulligan": "Toxin",
};
// noise that slips through the heuristics — never a real hero/villain identity here
const DROP = new Set(["Anne", "Isis", "Sol Soria", "Grid", "The Kid", "Girl", "Milo Morbius", "Milo", "Lucien"]);
// Identities that are a later transformation, not a through-line: only count a film
// where the credit actually carries the alias ("Real Name / Codename"), never a bare real name.
const ALIAS_ONLY = new Set(["Red Hulk", "Mighty Thor", "Captain America (Sam Wilson)"]);
const canon = (c) => CANON[c] || c;
function canonOf(raw) {
  // try full string, then the real-name (pre-slash) part, then a quote-stripped variant
  if (CANON[raw]) return CANON[raw];
  const first = raw.split(/\s*\/\s*/)[0].trim();
  if (CANON[first]) return CANON[first];
  const noquote = raw.replace(/["'’]/g, "").replace(/\s+/g, " ").trim();
  if (CANON[noquote]) return CANON[noquote];
  return null;
}

const raw = {};
const chars = new Map();
let missing = [];

for (const f of films) {
  const page = PAGES[f.title];
  if (!page) { console.error("no wiki page mapped:", f.title); continue; }
  process.stdout.write(`  ${f.title} … `);
  const wt = await wikitext(page);
  const { rows, missing: miss } = parseCast(wt, f.title);
  raw[f.title] = { page, universe: f.universe, date: f.release_date, cast: rows };
  if (miss) { missing.push(f.title); console.log("NO CAST"); continue; }

  const seen = new Set();
  for (const r of rows) {
    const cn = codenameOf(r.character);
    const mapped = canonOf(r.character);           // most specific: real-name / alias -> canonical
    var name, real;
    if (mapped) { name = mapped; real = r.character.split(/\s*\/\s*/)[0].trim(); }
    else if (cn) { name = canon(cn.code); real = cn.real; }
    else continue;
    if (real === name || !real) real = null;
    if (real) real = real.replace(/^the\s+voice\s+of\s+/i, "").replace(/^the\s+/i, "").trim();
    if (real && (/\b(and|voice|uncredited|archive)\b/i.test(real) || real.length > 32)) real = null;
    if (ALIAS_ONLY.has(name) && !/\s\/\s/.test(r.character)) continue; // needs the alias form
    if (DROP.has(name) || seen.has(name)) continue;
    seen.add(name);
    if (!chars.has(name)) chars.set(name, { name, real: real || null, universes: new Set(), actors: new Set(), films: [] });
    const rec = chars.get(name);
    rec.universes.add(f.universe);
    if (r.actor) rec.actors.add(r.actor);
    rec.films.push({ title: f.title, universe: f.universe, date: f.release_date, order: r.order, minor: r.minor, actor: r.actor });
  }
  console.log(rows.length + " credited, " + seen.size + " codenamed");
}

const characters = [...chars.values()]
  .map((c) => ({
    name: c.name,
    real_name: c.real,
    universes: [...c.universes],
    actors: [...c.actors],
    appearances: c.films.length,
    films: c.films.sort((a, b) => a.date.localeCompare(b.date)),
  }))
  .sort((a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name));

writeFileSync(join(ROOT, "data/cast-raw.json"), JSON.stringify({ generated: new Date().toISOString(), source: "English Wikipedia film Cast sections", films: raw }, null, 2) + "\n");
writeFileSync(join(ROOT, "data/characters.json"), JSON.stringify({
  generated: new Date().toISOString(),
  scope: "Costumed / codenamed characters only (alias form, or a known single-name identity). Ordered by number of film appearances.",
  source: "English Wikipedia film Cast sections (billing order)",
  missing_cast: missing,
  count: characters.length,
  characters,
}, null, 2) + "\n");

console.log(`\ncharacters.json — ${characters.length} codenamed characters`);
console.log(`most appearances: ${characters.slice(0, 8).map((c) => c.name + " (" + c.appearances + ")").join(", ")}`);
if (missing.length) console.log(`no cast section parsed for: ${missing.join(", ")}`);
