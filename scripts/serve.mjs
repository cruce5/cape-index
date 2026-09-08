// Minimal static server for local preview of dist/.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const PORT = process.env.PORT || 4599;
const DIR = join(ROOT, "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8" };

createServer(async (req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  try {
    const buf = await readFile(safeJoin(DIR, p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}`));
