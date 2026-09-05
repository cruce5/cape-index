// Inline data/web.json into src/index.html -> dist/index.html (one self-contained file).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const tpl = readFileSync(join(ROOT, "src/index.html"), "utf8");
const data = readFileSync(join(ROOT, "data/web.json"), "utf8").trim();

if (!tpl.includes("__DATA__")) throw new Error("src/index.html has no __DATA__ placeholder");
// Guard against </script> inside the JSON breaking the tag.
const safe = data.replace(/<\//g, "<\\/");
const html = tpl.replace("__DATA__", safe);

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist/index.html"), html);
console.log(`dist/index.html — ${(html.length / 1024).toFixed(0)} KB (${JSON.parse(data).films.length} films inlined)`);
