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
const OVERRIDES = JSON.parse(readFileSync(join(ROOT, "data/cast-overrides.json"), "utf8")).add || {};

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
  "Red Hulk", "Mighty Thor", "Blade", "Captain Carter", "Black Bolt", "Mister Fantastic", "Deathstroke",
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
    let body = m[2]
      .replace(/<!--[\s\S]*?-->/g, "")               // HTML comments (may sit between "as" and the character)
      .replace(/<ref[^>]*\/>/gi, "")                 // self-closing <ref .../>
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")    // <ref>...</ref>
      .replace(/\{\{(?:sfn|efn|refn)[^{}]*\}\}/gi, "") // citation templates
      .replace(/'''?/g, "")                          // bold/italic wiki markup
      .trim();
    // must look like "<actor> as <character>". Wikipedia also writes "appears as", "plays",
    // "reprises his role as" and "as the voice of" for credited, non-cameo roles; the plain
    // "as" match dropped Colossus from five films, Sandman and Lizard from No Way Home, the
    // Last Stand X-Men and the 2025 Engineer
    const AS = String.raw`(?:as|appears as|plays|portrays|voices|repris\w+ (?:his|her|their) (?:respective )?roles? as|return\w* as)`;
    const am = body.match(new RegExp(String.raw`^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]\s+` + AS + String.raw`\s+(.+)$`, "i"))
      || body.match(new RegExp(String.raw`^([A-ZÀ-Ý][\wÀ-ÿ.'’-]+(?:\s+[A-Za-zÀ-ÿ][\wÀ-ÿ.'’-]+){0,4})\s+` + AS + String.raw`\s+(.+)$`));
    if (!am) continue;
    const actor = strip(unlink(am[1])).replace(/\s*\([^)]*\)\s*$/, "");
    let character = strip(unlink(am[2].split(/<br|\n/)[0].replace(/<!--[\s\S]*/, "")));
    character = character.replace(/^the\s+voice\s+of\s+/i, "");
    character = character.split(/:(?:\s|$)|:</)[0].trim();           // role separator colon
    character = character.replace(/\.\s+[A-Z][a-z]+\s+[a-z].*$/, ""); // trailing prose sentence
    character = character.replace(/\s*\((?:voiced by|voice|uncredited|cameo|archive footage|photo|young|older)[^)]*\)\s*$/i, "");
    character = character.replace(/\s*"[^"]*"\s*/g, " ").replace(/[.,;]+$/, "").replace(/\s+/g, " ").trim();
    if (!character || character.length > 60) continue;
    if (depth === 1) order++;
    rows.push({ order: depth === 1 ? order : null, minor: depth > 1, actor, character });
  }

  // Endgame-style pages list returning cast in a PROSE paragraph, not bullets. Only scan
  // paragraphs that explicitly signal a cast list ("reprise/reprising their roles", "also
  // appear", "return as"), and only take clean "[[Actor]] as [[…|Character]]" wikilink pairs.
  const haveActors = new Set(rows.map((r) => (r.actor || "").toLowerCase()));
  // "credits scene" and "uncredited" are cameo words too: without them the widened cue took
  // Captain Marvel's mid-credits scene as a ninth Black Widow film
  const CAMEO = /\b(footage|archiv|stock photo|photo of|clip|deleted|cut from|unused|cameo|likeness|was cast|originally|rumou?red|reportedly|would have|set to|(?:mid|post)-credits|credits scene|uncredited)\b/i;
  // The clause a match sits in, split on ". " and "; ", read from the clause start to the
  // match plus the match's own tail up to the next actor pair. Wide enough that "for a brief
  // cameo are A as X, B as Y, C as Z" drops all three (a 40-character lookback dropped A and
  // kept B and C), narrow enough that a cameo named three clauses later does not take out a
  // credited Black Order
  const clauseAround = (text, i, len) => {
    const starts = [text.lastIndexOf(". ", i), text.lastIndexOf("; ", i), text.lastIndexOf("\n", i)];
    const s = Math.max(...starts);
    const after = text.slice(i + len);
    const ends = [after.indexOf(". "), after.indexOf("; "), after.indexOf("\n"), after.search(/\[\[[^\]]+\]\]\s+(?:as|appears as|plays)\s/)].filter((x) => x >= 0);
    const e = ends.length ? i + len + Math.min(...ends) : text.length;
    return text.slice(s < 0 ? 0 : s + 2, e);
  };
  const addProse = (actor, character) => {
    if (!actor || !/^[A-ZÀ-Ý]/.test(actor) || haveActors.has(actor.toLowerCase())) return;
    character = character.replace(/\s*\([^)]*\)\s*$/, "").replace(/[.,;:]+$/, "").replace(/\s+/g, " ").trim();
    if (!character || character.length > 60) return;
    haveActors.add(actor.toLowerCase());
    rows.push({ order: null, minor: true, actor, character, fromProse: true });
  };
  for (const para of section.split(/\n/)) {
    if (/^\s*[*:]/.test(para)) continue;
    if (!/\b(repris\w+ (?:their|his|her) (?:respective )?(?:MCU |DCEU )?roles?|also (?:appear|star|reprise|include)|are introduced as|return(?:ing)? as|from previous .{0,20}films?)\b/i.test(para)) continue;
    const clean = para.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
    // 1. "A, B, and C reprising their respective roles as X, Y, and Z": zip the two lists by
    //    position. Love and Thunder credits all seven Guardians this way and the pairwise scan
    //    below found none of them
    const ZIP = /((?:\[\[[^\]]+\]\](?:,?\s*(?:and\s+)?)){2,})(?:are introduced as|repris\w+\s+(?:their|his|her)\s+(?:respective\s+)?(?:MCU\s+|DCEU\s+)?roles?\s+as|return\w*\s+as)\s+(.+?)(?=\.\s|\.$|;| respectively| in brief|$)/gi;
    let zm;
    while ((zm = ZIP.exec(clean))) {
      if (CAMEO.test(clauseAround(clean, zm.index, zm[0].length))) continue;
      const actors = [...zm[1].matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => strip(unlink(m[0])).replace(/\s*\([^)]*\)\s*$/, ""));
      const chars = strip(unlink(zm[2].replace(/\s+respectively.*$/i, ""))).split(/,\s*(?:and\s+)?|\s+and\s+/).map((c) => c.trim()).filter(Boolean);
      if (actors.length !== chars.length) continue;
      actors.forEach((a, i) => addProse(a, chars[i]));
    }
    // 2. clean "[[Actor]] as [[…|Character]]" pairs
    const RX = /\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]\s+as\s+(?:the\s+)?(?:voice\s+of\s+)?(?:the\s+|an?\s+)?(?:Dr\.?\s+|Doctor\s+)?\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/gi;
    let pm;
    while ((pm = RX.exec(clean))) {
      if (CAMEO.test(clauseAround(clean, pm.index, pm[0].length))) continue;
      const actor = strip(unlink(pm[1])).replace(/\s*\([^)]*\)\s*$/, "");
      addProse(actor, strip(unlink(pm[3] || pm[2])));
    }
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
  "Green Goblin": "Green Goblin",
  // Two Osborns, three goblin identities. Norman is the Green Goblin (Dafoe, 2002 + NWH).
  // Harry is the *New* Goblin in Raimi's trilogy and a second Green Goblin in Webb's, so the
  // mantle splits the way Steve / Sam Wilson Captain America does. Neither Osborn is mapped
  // from his bare real name: Harry is credited plain "Harry Osborn" in Spider-Man and
  // Spider-Man 2 (no goblin yet) and Chris Cooper's Norman never becomes one in TASM2.
  "Norman Osborn / Green Goblin": "Green Goblin",
  "New Goblin": "New Goblin", "Harry Osborn / New Goblin": "New Goblin",
  "Harry Osborn / Green Goblin": "Green Goblin (Harry Osborn)",
  "Doctor Octopus": "Doctor Octopus", "Otto Octavius": "Doctor Octopus",
  "Electro": "Electro", "Max Dillon": "Electro",
  "Yellowjacket": "Yellowjacket", "M.O.D.O.K.": "M.O.D.O.K.", "M.O.D.O.K": "M.O.D.O.K.", "Darren Cross": "Yellowjacket",
  // Cross is Yellowjacket in one film and M.O.D.O.K. in another; the slash credit names the later identity
  "Darren Cross / M.O.D.O.K.": "M.O.D.O.K.", "Darren Cross / M.O.D.O.K": "M.O.D.O.K.",
  "Karl Mordo": "Mordo", "Eric Brooks / Blade": "Blade", "Reed Richards / Mister Fantastic": "Mister Fantastic",
  "Peggy Carter / Captain Carter": "Captain Carter", "Blackagar Boltagon / Black Bolt": "Black Bolt",
  "Maria Rambeau / Captain Marvel": "Captain Marvel (Rambeau)", "Captain Marvel (Rambeau)": "Captain Marvel (Rambeau)",
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
  "Silver Surfer": "Silver Surfer", "Norrin Radd": "Silver Surfer",
  "Shalla-Bal": "Silver Surfer (Shalla-Bal)", "Shalla-Bal / Silver Surfer": "Silver Surfer (Shalla-Bal)",
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
  // 20th Century Fox — X-Men era (recasts merge, per the roster rules; Deadpool & Wolverine is filed under MCU, not here)
  "Charles Xavier": "Professor X", "Professor X": "Professor X", "Professor Charles Xavier": "Professor X",
  "Erik Lehnsherr": "Magneto", "Magneto": "Magneto", "Max Eisenhardt": "Magneto",
  "Raven Darkhölme": "Mystique", "Raven": "Mystique", "Mystique": "Mystique",
  "Hank McCoy": "Beast", "Beast": "Beast",
  "Ororo Munroe": "Storm", "Storm": "Storm",
  "Scott Summers": "Cyclops", "Cyclops": "Cyclops",
  "Jean Grey": "Jean Grey", "Phoenix": "Jean Grey", "Dark Phoenix": "Jean Grey",
  "Kurt Wagner": "Nightcrawler", "Nightcrawler": "Nightcrawler",
  "Peter Maximoff": "Quicksilver", "Quicksilver": "Quicksilver", "Pietro Maximoff": "Quicksilver",
  "Piotr Rasputin": "Colossus", "Colossus": "Colossus",
  "Marie": "Rogue", "Rogue": "Rogue",
  "Bobby Drake": "Iceman", "Iceman": "Iceman",
  "Kitty Pryde": "Shadowcat", "Shadowcat": "Shadowcat",
  "Warren Worthington III": "Angel", "Angel": "Angel", "Archangel": "Angel",
  "Alex Summers": "Havok", "Havok": "Havok",
  "Sean Cassidy": "Banshee", "Banshee": "Banshee",
  "Laura": "X-23", "Laura Kinney": "X-23", "X-23": "X-23",
  "Nathan Summers": "Cable", "Cable": "Cable",
  "Neena": "Domino", "Domino": "Domino",
  "Negasonic Teenage Warhead": "Negasonic Teenage Warhead", "Ellie Phimister": "Negasonic Teenage Warhead",
  "Yukio": "Yukio",
  "En Sabah Nur": "Apocalypse", "Apocalypse": "Apocalypse",
  "William Stryker": "William Stryker", "Colonel William Stryker": "William Stryker", "Colonel Stryker": "William Stryker", "Colonel William Styker": "William Stryker",
  "Sebastian Shaw": "Sebastian Shaw",
  "Emma Frost": "Emma Frost",
  "Azazel": "Azazel", "Darwin": "Darwin", "Armando Muñoz": "Darwin",
  "Toad": "Toad", "Mortimer Toynbee": "Toad",
  "Ichirō Yashida": "Silver Samurai", "Silver Samurai": "Silver Samurai",
  "Viper": "Viper",
  "Caliban": "Caliban",
  "Russell Collins": "Firefist", "Firefist": "Firefist",
  "Juggernaut": "Juggernaut", "Cain Marko": "Juggernaut",
  // The New Mutants
  "Danielle Moonstar": "Mirage", "Dani Moonstar": "Mirage", "Mirage": "Mirage",
  "Rahne Sinclair": "Wolfsbane", "Wolfsbane": "Wolfsbane",
  "Illyana Rasputin": "Magik", "Magik": "Magik",
  "Sam Guthrie": "Cannonball", "Cannonball": "Cannonball",
  "Roberto da Costa": "Sunspot", "Sunspot": "Sunspot",
  // Fantastic Four (2015, Fox) — merges with the MCU FF row, same as other recasts
  "Victor von Doom": "Doctor Doom", "Doctor Doom": "Doctor Doom", "Victor Domashev": "Doctor Doom", "Dr. Doom": "Doctor Doom", "Doom": "Doctor Doom",
  // The Amazing Spider-Man 1 & 2 (Garfield Spider-Man merges into the Spider-Man row)
  "Curt Connors": "Lizard", "The Lizard": "Lizard", "Lizard": "Lizard",
  // Raimi Spider-Man trilogy (2002–2007) — Maguire's Peter merges into the Spider-Man row
  "Flint Marko": "Sandman", "Sandman": "Sandman",
  "Eddie Brock": "Venom",
  // Nolan Dark Knight trilogy (Bale's Bruce merges into the Batman row)
  "Ra's al Ghul": "Ra's al Ghul", "Henri Ducard": "Ra's al Ghul",
  "Jonathan Crane": "Scarecrow", "Scarecrow": "Scarecrow",
  "Harvey Dent": "Two-Face", "Two-Face": "Two-Face",
  "Bane": "Bane",
  "Selina Kyle": "Catwoman", "Catwoman": "Catwoman",
  "Talia al Ghul": "Talia al Ghul",
  // Fox Marvel — Daredevil (2003) + Elektra (2005); Garner reprised Elektra in Deadpool & Wolverine
  "Matt Murdock": "Daredevil", "Matthew Murdock": "Daredevil", "Daredevil": "Daredevil",
  "Elektra Natchios": "Elektra", "Elektra": "Elektra",
  "Bullseye": "Bullseye",
  "Wilson Fisk": "Kingpin", "Kingpin": "Kingpin",
  "Typhoid Mary": "Typhoid Mary",
  // Fantastic Four (2005) + Rise of the Silver Surfer — merge with the other FF rows
  "Galactus": "Galactus",
  // Ghost Rider (2007) + Spirit of Vengeance (2011)
  "Johnny Blaze": "Ghost Rider", "Ghost Rider": "Ghost Rider",
  "Blackheart": "Blackheart",
  "Mephistopheles": "Mephisto", "Mephisto": "Mephisto", "Roarke": "Mephisto",
};
// noise that slips through the heuristics — never a real hero/villain identity here
const DROP = new Set(["Anne", "Isis", "Sol Soria", "Grid", "The Kid", "Girl", "Milo Morbius", "Milo", "Lucien"]);

// Full-name credits for characters CODE_KEEP only lists as mononyms. Without these the
// lookup fails on the whole string, the "/" split finds nothing, and the row never exists:
// Drax, Yondu, Ronan and Korath were absent from all five Guardians films.
Object.assign(CANON, {
  "Drax the Destroyer": "Drax", "Drax": "Drax",
  "Yondu Udonta": "Yondu", "Yondu": "Yondu",
  "Ronan the Accuser": "Ronan", "Ronan": "Ronan",
  "Korath the Pursuer": "Korath", "Korath": "Korath",
  "Baby Groot": "Groot",
  // Sabretooth was filed as a one-film MCU character; he is a foundational Fox villain
  "Sabretooth": "Sabretooth", "Victor Creed": "Sabretooth",
  "Fred Dukes": "Blob",
  "Maj. Bill Stryker": "William Stryker", "Bill Stryker": "William Stryker",
  // Wonder Woman resolved to exactly one codenamed character without these
  "Sir Patrick": "Ares", "Sir Patrick Morgan": "Ares",
  "Dr. Maru": "Doctor Poison", "Maru": "Doctor Poison",
  // Vuk is the character; "Margaret Smith" is the human body she wears, and the row was inverted
  "Vuk": "Vuk", "Margaret Smith": "Vuk",
  "Remy LeBeau": "Gambit", "Gambit": "Gambit",
  "Psylocke": "Psylocke", "Jubilee": "Jubilee",
  "Bishop": "Bishop", "Blink": "Blink", "Warpath": "Warpath",
  "Knull": "Knull", "Lobo": "Lobo",
  "Angel Salvadore": "Angel Salvadore", "Angel Dust": "Angel Dust",
  "Typhoid": "Typhoid Mary",
  "Kayla Silverfox": "Silver Fox", "Agent Zero": "Agent Zero",
  "Kraglin": "Kraglin", "Kraglin Obfonteri": "Kraglin", "Ayesha": "Ayesha", "Namora": "Namora",
  "the Foreigner": "The Foreigner", "Foreigner": "The Foreigner",
  "Hank Pym / Ant-Man": "Ant-Man (Hank Pym)", "Dr. Hank Pym / Ant-Man": "Ant-Man (Hank Pym)",
});
// Samuel Sterns and Patrick Mulligan are credited by their bare real names in BOTH their
// films, so mapping the name to the codename counted a scientist as the Leader in 2008 and a
// detective as Toxin in 2021. Same bug as Thaddeus Ross / Red Hulk.
delete CANON["Samuel Sterns"];
delete CANON["Patrick Mulligan"];
// "Mr. Sherman/Rafke" is a bit part; the last-segment fallback invented a hero called Rafke.
DROP.add("Rafke"); DROP.add("Mr. Sherman");
// Identities that are a later transformation, not a through-line: only count a film
// where the credit actually carries the alias ("Real Name / Codename"), never a bare real name.
// Hope van Dyne is credited plainly in Ant-Man and gets the suit in its mid-credits scene;
// the other three films slash the credit. Same shape as Red Hulk.
const ALIAS_ONLY = new Set(["Red Hulk", "Mighty Thor", "Captain America (Sam Wilson)", "New Goblin", "Green Goblin (Harry Osborn)", "Silver Surfer (Shalla-Bal)", "Wasp", "Ant-Man (Hank Pym)"]);
// Wikipedia credits one performer under two billings across a series; the roll-up should not
// show her twice in the same actor list.
const ACTOR_ALIAS = { "Rebecca Romijn-Stamos": "Rebecca Romijn", "UK Pitbulls": "Mike Waters" }; // the Blob link resolved to a wrestling promotion
const canon = (c) => CANON[c] || c;
const CANON_LC = {};
for (const [k, v] of Object.entries(CANON)) CANON_LC[k.toLowerCase()] = v;
for (const k of CODE_KEEP) if (!(k.toLowerCase() in CANON_LC)) CANON_LC[k.toLowerCase()] = k; // mononyms resolve to themselves
function lookup(s) {
  if (!s) return null;
  if (CANON[s]) return CANON[s];
  const lc = s.toLowerCase().replace(/["'’]/g, "").replace(/\s+/g, " ").trim();
  const tries = new Set([lc]);
  tries.add(lc.replace(/^(the|a)\s+/, ""));                    // drop article
  tries.add(lc.replace(/^dr\.?\s+/, "doctor "));               // "Dr." -> "Doctor" (title)
  tries.add(lc.replace(/^(dr\.?|doctor|mr\.?|ms\.?|mrs\.?|prof\.?|professor|sgt\.?|col\.?|gen\.?|capt\.?|lt\.?)\s+/, "")); // drop honorific entirely
  for (const t of tries) if (t && CANON_LC[t]) return CANON_LC[t];
  return null;
}
function canonOf(raw) {
  // try the whole string, then each "/"-separated part (real-name OR codename side),
  // case-insensitively, with "the "/"a " articles and "Dr." -> "Doctor" normalised
  let hit = lookup(raw);
  if (hit) return hit;
  // split on "/" (Real Name / Codename) and on " and " (dual credits like "J.A.R.V.I.S. and Vision")
  for (const part of raw.split(/\s*\/\s*|\s+and\s+|\s*&\s*/)) {
    hit = lookup(part.trim());
    if (hit) return hit;
  }
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
  let { rows, missing: miss } = parseCast(wt, f.title);
  const ov = OVERRIDES[f.title];
  if (ov) {
    // a hand-verified credit replaces whatever the parser read for the same actor: the prose
    // scan had Wesley Snipes as "half-vampire" in Deadpool & Wolverine, and the override's
    // "Eric Brooks / Blade" was being skipped because the actor was already "present"
    const ovActors = new Set(ov.map((o) => (o.actor || "").toLowerCase()));
    rows = rows.filter((r) => !ovActors.has((r.actor || "").toLowerCase()));
    const add = ov.map((o, i) => ({ actor: o.actor, character: o.character, order: -ov.length + i, minor: false, fromOverride: true }));
    rows = [...add, ...rows];
    if (add.length) miss = false;
  }
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
    const actor = ACTOR_ALIAS[r.actor] || r.actor;
    if (actor) rec.actors.add(actor);
    rec.films.push({ title: f.title, universe: f.universe, date: f.release_date, order: r.order, minor: r.minor, actor: actor });
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
