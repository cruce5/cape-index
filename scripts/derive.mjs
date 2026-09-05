// Final pass: add the derived metrics r/boxoffice actually argues about, once
// budget + scores are in place. Runs last in `npm run data`.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";
import { toReal2025 } from "./inflation.mjs";

const BREAKEVEN_MULTIPLE = 2.5; // rough theatrical break-even: ~2.5x production budget

const path = join(ROOT, "data/films.json");
const data = JSON.parse(readFileSync(path, "utf8"));

const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

for (const f of data.films) {
  const bo = f.box_office;
  const open = bo.opening_weekend_domestic;
  const breakeven = f.budget ? Math.round(f.budget * BREAKEVEN_MULTIPLE) : null;
  f.metrics = {
    pct_domestic: bo.worldwide ? r2((bo.domestic / bo.worldwide) * 100) : null,
    pct_international: bo.worldwide ? r2((bo.international / bo.worldwide) * 100) : null,
    domestic_multiplier: open ? r2(bo.domestic / open) : null, // "legs": total / opening
    opening_share_worldwide: bo.worldwide && open ? r2((open / bo.worldwide) * 100) : null,
    roi_worldwide: f.budget ? r2(bo.worldwide / f.budget) : null,
    breakeven_worldwide: breakeven,
    profit_vs_breakeven: breakeven ? bo.worldwide - breakeven : null,
    profitable: breakeven ? bo.worldwide >= breakeven : null,
    budget_real_2025: toReal2025(f.budget, Number(f.release_date.slice(0, 4))),
  };
}

data.meta.derived_note = `metrics.* added by derive.mjs. breakeven_worldwide = production budget x ${BREAKEVEN_MULTIPLE} (theatrical rule of thumb). domestic_multiplier = domestic total / domestic opening weekend.`;
data.meta.generated = new Date().toISOString();
writeFileSync(path, JSON.stringify(data, null, 2) + "\n");

const prof = data.films.filter((f) => f.metrics.profitable === true).length;
const unprof = data.films.filter((f) => f.metrics.profitable === false).length;
console.log(`derived metrics for ${data.films.length} films — ${prof} above break-even, ${unprof} below (by ${BREAKEVEN_MULTIPLE}x rule).`);
