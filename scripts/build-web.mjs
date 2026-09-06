// Slim data/films.json -> data/web.json (the ~30 KB payload build.mjs inlines).
// Short keys keep the inlined JSON small; every field the page reads is here.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const src = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8"));

const slim = src.films.map((f) => {
  const b = f.box_office, r = f.box_office_real_2025 || {}, m = f.metrics || {}, s = f.scores || {};
  return {
    t: f.title,
    u: f.universe,
    ul: f.universe_label,
    studio: f.studio_label,
    date: f.release_date,
    wd: b.domestic, wi: b.international, ww: b.worldwide,
    open: b.opening_weekend_domestic,
    final: b.is_final,
    rd: r.domestic, ri: r.international, rw: r.worldwide,
    budget: f.budget,
    budgetEst: f.budget_estimated || false,
    rbudget: m.budget_real_2025,
    runtime: f.runtime_minutes,
    mpaa: f.mpaa,
    genres: f.genres,
    rt: s.rt_critic, mc: s.metacritic, imdb: s.imdb,
    pctDom: m.pct_domestic, pctIntl: m.pct_international,
    mult: m.domestic_multiplier,
    roi: m.roi_worldwide,
    breakeven: m.breakeven_worldwide,
    profit: m.profit_vs_breakeven,
    profitable: m.profitable,
    bom: f.bom ? f.bom.id : null,
  };
});

const out = {
  meta: {
    generated: src.meta.generated,
    held_out: (src.meta.held_out || []).map((h) => ({ t: h.title, date: h.release_date, u: h.universe })),
    source: "Box Office Mojo",
    budget_note: "Budget source order: Box Office Mojo -> Wikipedia infobox -> data/budget-overrides.json. Anything not straight from BOM is budget_estimated:true and approximate (studios rarely disclose; net vs gross-of-rebate varies).",
  },
  films: slim,
};

writeFileSync(join(ROOT, "data/web.json"), JSON.stringify(out) + "\n");
const u = {};
slim.forEach((f) => { u[f.u] = (u[f.u] || 0) + 1; });
console.log(`web.json — ${slim.length} films (${Object.entries(u).map(([k, v]) => k + " " + v).join(", ")}), ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
