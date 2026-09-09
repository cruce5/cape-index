// Crop Gemini labels + borders off each hero JPEG.
//
// Framey iff BOTH:
//   (a) low distinct-color count (<= 8 buckets in a 4x4x4 quantize), AND
//   (b) the row/col's median color is a plausible neutral: near-white, cream,
//       near-black, a warm yellow, or mid grey - NOT a saturated portrait bg.
// Walk from each edge past framey rows/cols. Small run of noise at the very
// edge does not count as "content" (we only stop when we have 15 consecutive
// non-framey rows, and we require having seen at least 1 framey row first).

import sharp from "sharp";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "C:/Users/willi/Desktop/marvel-dc-boxoffice/reconcilers";
const OUT = join(SRC, "cropped");
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith(".jpg")).sort();

const MAX_BUCKETS = 8;
const CONSEC = 15;

function analyze(getPx, n) {
  const seen = new Uint8Array(64);
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < n; i += 3) {
    const [r, g, b] = getPx(i);
    const bi = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
    seen[bi] = 1;
    rs.push(r); gs.push(g); bs.push(b);
  }
  let buckets = 0;
  for (let i = 0; i < 64; i++) if (seen[i]) buckets++;
  rs.sort((a, b) => a - b); gs.sort((a, b) => a - b); bs.sort((a, b) => a - b);
  const mid = rs.length >> 1;
  const dr = rs[mid], dg = gs[mid], db = bs[mid];
  const luma = 0.2126 * dr + 0.7152 * dg + 0.0722 * db;
  const chroma = Math.max(dr, dg, db) - Math.min(dr, dg, db);
  const isNearWhite = luma > 215 && chroma < 30;
  const isCream     = dr > 200 && dg > 185 && db > 150 && dr >= dg && dg >= db && chroma < 60;
  const isYellow    = dr > 200 && dg > 170 && db < 150;
  const isNearBlack = luma < 45 && buckets <= 3; // real border only, not clothing
  const isMidGrey   = chroma < 15 && luma >= 55 && luma <= 200 && buckets <= 4;
  const plausible = isNearWhite || isCream || isYellow || isNearBlack || isMidGrey;
  return { framey: buckets <= MAX_BUCKETS && plausible, buckets, luma };
}

async function measureFrame(path) {
  const meta = await sharp(path).metadata();
  const width = meta.width, height = meta.height, channels = meta.channels;
  const raw = await sharp(path).raw().toBuffer();

  const rowFn = (y) => (i) => {
    const off = (y * width + i) * channels;
    return [raw[off], raw[off + 1], raw[off + 2]];
  };
  const colFn = (x) => (i) => {
    const off = (i * width + x) * channels;
    return [raw[off], raw[off + 1], raw[off + 2]];
  };

  // scan(getLine, len, orthoLen, maxCrop, forward)
  // Advances edge past every framey line until CONSEC non-framey in a row.
  // Requires that at least one framey line was seen before locking the edge -
  // if the very edge is noisy, keep going until we find frame, then measure.
  const scan = (getLine, len, orthoLen, maxCrop, forward) => {
    const step = forward ? 1 : -1;
    const start = forward ? 0 : len - 1;
    let edge = start;
    let nonFrame = 0;
    let sawFrame = false;
    for (let i = start, moved = 0; moved < maxCrop && i >= 0 && i < len; i += step, moved++) {
      const { framey } = analyze(getLine(i), orthoLen);
      if (framey) { nonFrame = 0; sawFrame = true; edge = i + step; }
      else {
        nonFrame++;
        if (sawFrame && nonFrame >= CONSEC) break;
        if (!sawFrame && nonFrame >= 40) break; // no frame at all on this edge
      }
    }
    return sawFrame ? edge : start;
  };

  // Top labels can be tall (up to ~20% of height). Border on other sides is thin.
  const top    = Math.max(0, scan(rowFn, height, width,  Math.floor(height * 0.22), true));
  const bottom = Math.min(height - 1, scan(rowFn, height, width, Math.floor(height * 0.08), false));
  const left   = Math.max(0, scan(colFn, width,  height, Math.floor(width  * 0.08), true));
  const right  = Math.min(width - 1,  scan(colFn, width,  height, Math.floor(width  * 0.08), false));

  return { width, height, top, bottom, left, right };
}

const report = [];
for (const f of files) {
  const path = join(SRC, f);
  const m = await measureFrame(path);
  const cropW = m.right - m.left + 1;
  const cropH = m.bottom - m.top + 1;
  await sharp(path)
    .extract({ left: m.left, top: m.top, width: cropW, height: cropH })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(OUT, f));
  report.push({ file: f, top: m.top, bottom: m.bottom, left: m.left, right: m.right, cropW, cropH, aspect: (cropW / cropH).toFixed(3) });
}
console.table(report);
