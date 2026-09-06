// Render dist/og.png (1200x630) — the social-share card for The Cape Index.
// Pure SVG -> PNG via resvg; no browser. Uses whatever sans the OS provides.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ROOT } from "./lib-bom.mjs";

const films = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8")).films;
const sum = (a) => a.reduce((s, f) => s + f.box_office.worldwide, 0);
const mcu = sum(films.filter((f) => f.universe === "MCU"));
const dc = sum(films.filter((f) => ["DCEU", "DCU", "Elseworlds"].includes(f.universe)));
const total = sum(films);
const gap = (mcu / dc).toFixed(1);
const usd = (n) => "$" + (n / 1e9).toFixed(1) + "B";

const W = 1200, H = 630;
const SANS = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

// three ascending bars, lower-right motif (kept clear of all text)
const baseline = 552;
const bars = [
  { x: 892, h: 96, c: "#e66767" },
  { x: 992, h: 168, c: "#3987e5" },
  { x: 1092, h: 132, c: "#199e70" },
].map((b) => `<rect x="${b.x}" y="${baseline - b.h}" width="64" height="${b.h}" rx="6" fill="${b.c}"/>`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d0f14"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#e66767"/>
  <text x="80" y="156" font-family="${SANS}" font-size="25" letter-spacing="5" fill="#8a92a4">SUPERHERO BOX OFFICE &#183; 2008&#8211;2026</text>
  <text x="76" y="300" font-family="${SANS}" font-size="118" font-weight="800" fill="#f2f3f7" letter-spacing="-3">The Cape Index</text>
  <text x="80" y="366" font-family="${SANS}" font-size="33" fill="#a6acbb">Every Marvel and DC film since 2008, and what it made.</text>
  <text x="80" y="524" font-family="${SANS}" font-size="30" font-weight="700" fill="#f2f3f7">${usd(total)} worldwide &#183; ${films.length} films</text>
  <text x="80" y="566" font-family="${SANS}" font-size="24" fill="#8a92a4">Marvel out-grosses DC ${gap}&#215;, verified against Box Office Mojo</text>
  ${bars}
</svg>`;

mkdirSync(join(ROOT, "dist"), { recursive: true });
const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { loadSystemFonts: true } })
  .render()
  .asPng();
writeFileSync(join(ROOT, "dist/og.png"), png);
console.log(`dist/og.png — ${(png.length / 1024).toFixed(0)} KB (${W}x${H})`);
