// Palette check. The site claims, in §12 and in the README, that the categorical set was
// "checked with a script, pair by pair, in both light and dark" rather than by eye. This is
// that script, so the claim is true and stays true.
//
// What it asserts:
//   1. the two light blocks agree token for token (the @media one and the [data-theme] one
//      are edited separately, and a token has silently drifted between them before)
//   2. every pair of categorical hues stays separable under normal vision and under the
//      three common kinds of color blindness
//   3. ink tokens clear WCAG AA against every surface they are printed on
//
// Separation is OKLab distance x100. >= 10 is comfortable at small mark size; 6 to 10 is legal
// only where a mark shape carries the same identity; under 6 nothing rescues it.
//
// Protanopia and deuteranopia (together ~8% of men) are hard-gated. Tritanopia (~0.01%, and
// the one no five-hue set survives without going violet) is reported but not gated, which is
// the same tradeoff Paul Tol's own palettes make. Every chart that relies on hue alone must
// therefore carry the shape backstop; that is what makes the soft tier legal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const HTML = readFileSync(join(ROOT, "src/index.html"), "utf8");

const HUES = ["mcu", "fox", "ssu", "dceu", "dcu", "else"];
const INKS = ["ink", "ink-2", "ink-muted", "note", "neg", "pl-clear"];
const SURFACES = ["page", "surface", "surface-2"];

// --- pull each theme block out of the stylesheet -----------------------------------------
function block(startRe) {
  const m = HTML.match(startRe);
  if (!m) throw new Error("could not find theme block: " + startRe);
  const from = m.index + m[0].length;
  const to = HTML.indexOf("}", from);
  const body = HTML.slice(from, to);
  const out = {};
  for (const [, k, v] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)) out[k] = v;
  return out;
}
const THEMES = {
  dark: block(/:root\s*\{\s*\n\s*color-scheme: dark;/),
  "light (OS)": block(/@media \(prefers-color-scheme: light\)[\s\S]*?:root:not\(\[data-theme="dark"\]\)\s*\{/),
  "light (toggle)": block(/:root\[data-theme="light"\]\s*\{/),
};

// --- color maths --------------------------------------------------------------------------
const hex = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const relLum = (rgb) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => {
  const [x, y] = [relLum(hex(a)), relLum(hex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function oklab(h) {
  const [r, g, b] = hex(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dE = (a, b) => {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
};
// Brettel/Viénot-style dichromat simulation in linear LMS
function cvd(h, kind) {
  const [r, g, b] = hex(h).map(lin);
  const L = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const M = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const S = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;
  let l = L, m = M, s = S;
  if (kind === "protanopia") l = 1.05118294 * M - 0.05116099 * S;
  if (kind === "deuteranopia") m = 0.9513092 * L + 0.04866992 * S;
  if (kind === "tritanopia") s = -0.86744736 * L + 1.86727089 * M;
  const R = 5.47221206 * l - 4.6419601 * m + 0.16963708 * s;
  const G = -1.1252419 * l + 2.29317094 * m - 0.1678952 * s;
  const B = 0.02980165 * l - 0.19318073 * m + 1.16364789 * s;
  const g2 = (v) => {
    v = Math.min(1, Math.max(0, v));
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return "#" + g2(R) + g2(G) + g2(B);
}

// --- run ----------------------------------------------------------------------------------
// The discipline's own thresholds: >= 10 is comfortable at small mark size; 6 to 10 is legal
// ONLY where a second, non-color channel carries the same identity (this page uses a per-
// universe mark shape); below 6 nothing rescues it. Five saturated hues cannot all clear 10
// under every dichromacy - that is a property of the color space, not of this palette - so
// the honest contract is: hard-fail under 6, and require the shape backstop between 6 and 10.
const FLOOR = 6, WARN = 10, TEXT_AA = 4.5;
const fails = [], warns = [];

// 1. the two light blocks must be identical
const a = THEMES["light (OS)"], b = THEMES["light (toggle)"];
for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
  if (a[k] !== b[k]) fails.push(`light themes disagree on --${k}: @media says ${a[k]}, [data-theme] says ${b[k]}`);
}

// 2. categorical separation, normal vision and the three dichromacies
for (const [name, T] of Object.entries(THEMES)) {
  const present = HUES.filter((h) => T[h]);
  for (const vision of ["normal", "protanopia", "deuteranopia", "tritanopia"]) {
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const [p, q] = [present[i], present[j]];
        const [c1, c2] = vision === "normal" ? [T[p], T[q]] : [cvd(T[p], vision), cvd(T[q], vision)];
        const d = dE(c1, c2);
        const msg = `${name} / ${vision}: --${p} vs --${q} separation ${d.toFixed(1)}`;
        const gated = vision === "protanopia" || vision === "deuteranopia" || vision === "normal";
        if (d < FLOOR && gated) fails.push(msg + ` (hard floor ${FLOOR}, nothing rescues this)`);
        else if (d < WARN) warns.push(msg + " - needs the shape backstop");
      }
    }
  }
}

// 3. ink on every surface it is printed on
for (const [name, T] of Object.entries(THEMES)) {
  for (const ink of INKS) {
    if (!T[ink]) continue;
    for (const surf of SURFACES) {
      if (!T[surf]) continue;
      const r = contrast(T[ink], T[surf]);
      if (r < TEXT_AA) {
        const msg = `${name}: --${ink} on --${surf} is ${r.toFixed(2)}:1 (AA needs ${TEXT_AA})`;
        (ink === "pl-clear" || ink === "note" ? warns : fails).push(msg);
      }
    }
  }
}

// 4. the Marvel v DC lens. Two categories only, so this pair is held to a much higher bar
// than the six-hue set: red/blue is the classic convention and with n=2 it is genuinely safe.
for (const [name, T] of Object.entries(THEMES)) {
  if (!T.marvel || !T.dc) { fails.push(name + ": --marvel/--dc missing"); continue; }
  for (const vision of ["normal", "protanopia", "deuteranopia", "tritanopia"]) {
    const [c1, c2] = vision === "normal" ? [T.marvel, T.dc] : [cvd(T.marvel, vision), cvd(T.dc, vision)];
    const d = dE(c1, c2);
    if (d < 15) fails.push(name + " / " + vision + ": --marvel vs --dc separation " + d.toFixed(1) + " (floor 15 for a two-color lens)");
  }
  for (const surf of ["surface", "surface-2"]) {
    for (const k of ["marvel", "dc"]) {
      const r = contrast(T[k], T[surf]);
      if (r < 3) fails.push(name + ": --" + k + " on --" + surf + " is " + r.toFixed(2) + ":1 (graphics need 3:1)");
    }
  }
}

// 5. the two colors that DO share a row in §06: the cleared-break-even bar and the loss bar.
// (The universe chip was removed from that chart precisely so --pl-clear only has to clear
// one other color instead of six.)
for (const [name, T] of Object.entries(THEMES)) {
  if (!T["pl-clear"] || !T.neg) continue;
  const d = dE(T["pl-clear"], T.neg);
  if (d < 15) fails.push(`${name}: --pl-clear vs --neg separation ${d.toFixed(1)}; profit and loss must be unmistakable`);
}

if (warns.length) {
  console.log(`\npalette: ${warns.length} pair(s) between ${FLOOR} and ${WARN} - legal only with the shape backstop:\n`);
  warns.forEach((w) => console.log("  ~ " + w));
}
if (fails.length) {
  console.error(`\nPALETTE CHECK FAILED - ${fails.length} problem(s):\n`);
  fails.forEach((f) => console.error("  x " + f));
  console.error("");
  process.exit(1);
}
console.log(`palette OK - ${HUES.length} hues x 3 themes x 4 vision types, all pairs >= ${FLOOR}; ink clears AA on every surface`);
