// Diff the legacy Tableau sheet against the verified Box Office Mojo numbers now
// in data/films.json, and write RECONCILIATION.md for sign-off.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib-bom.mjs";

const { films, meta } = JSON.parse(readFileSync(join(ROOT, "data/films.json"), "utf8"));

const usd = (n) => (n == null ? "—" : "$" + n.toLocaleString("en-US"));
const signed = (n) => (n == null ? "—" : (n >= 0 ? "+" : "−") + "$" + Math.abs(n).toLocaleString("en-US"));
const pct = (d, base) => (base ? ((d / base) * 100).toFixed(2) + "%" : "—");

const withSheet = films.filter((f) => f.sheet);
const added = films.filter((f) => !f.sheet);

const rows = withSheet.map((f) => {
  const b = f.box_office, s = f.sheet;
  return {
    title: f.title,
    dDom: b.domestic - s.domestic,
    dIntl: b.international - s.international,
    dWW: b.worldwide - s.worldwide,
    s, b,
  };
});

const material = rows.filter((r) => Math.abs(r.dWW) >= 1_000_000).sort((a, b) => Math.abs(b.dWW) - Math.abs(a.dWW));
const minor = rows.filter((r) => Math.abs(r.dWW) > 0 && Math.abs(r.dWW) < 1_000_000).sort((a, b) => Math.abs(b.dWW) - Math.abs(a.dWW));
const exact = rows.filter((r) => r.dWW === 0 && r.dDom === 0 && r.dIntl === 0);

const totSheet = withSheet.reduce((a, f) => a + f.sheet.worldwide, 0);
const totBom = withSheet.reduce((a, f) => a + f.box_office.worldwide, 0);

let md = `# Reconciliation — legacy sheet vs Box Office Mojo

_Generated ${new Date().toISOString().slice(0, 10)}. Source of truth: ${meta.source_of_truth}._

## Summary

| | |
|---|---|
| Legacy sheet films re-checked | **${withSheet.length}** |
| Exact match (no change) | ${exact.length} |
| Minor drift (< $1M worldwide) | ${minor.length} |
| **Material change (≥ $1M worldwide)** | **${material.length}** |
| New films added (verified) | ${added.length} |
| Held out (unreleased on BOM) | ${meta.held_out.length} |
| Legacy total worldwide | ${usd(totSheet)} |
| Verified total worldwide | ${usd(totBom)} |
| Net change | ${signed(totBom - totSheet)} |

## Material changes (≥ $1M worldwide)

| Film | Domestic (sheet → BOM) | International (sheet → BOM) | Worldwide (sheet → BOM) | Δ WW | Δ % |
|------|------------------------|----------------------------|-------------------------|------|-----|
${material.map((r) => `| ${r.title} | ${usd(r.s.domestic)} → ${usd(r.b.domestic)} | ${usd(r.s.international)} → ${usd(r.b.international)} | ${usd(r.s.worldwide)} → ${usd(r.b.worldwide)} | ${signed(r.dWW)} | ${pct(r.dWW, r.s.worldwide)} |`).join("\n")}

## Minor drift (< $1M worldwide)

| Film | Δ Domestic | Δ International | Δ Worldwide |
|------|-----------|----------------|-------------|
${minor.map((r) => `| ${r.title} | ${signed(r.dDom)} | ${signed(r.dIntl)} | ${signed(r.dWW)} |`).join("\n")}

## Exact matches (${exact.length})

${exact.map((r) => r.title).join(" · ")}

## New films added (verified against BOM)

| Film | Universe | Release | Domestic | International | Worldwide | Final? |
|------|----------|---------|----------|--------------|-----------|--------|
${added.map((f) => `| ${f.title} | ${f.universe} | ${f.release_date} | ${usd(f.box_office.domestic)} | ${usd(f.box_office.international)} | ${usd(f.box_office.worldwide)} | ${f.box_office.is_final ? "yes" : "**still in release**"} |`).join("\n")}

## Held out (no worldwide gross on Box Office Mojo)

${meta.held_out.map((h) => `- **${h.title}** (${h.release_date}, ${h.universe}) — ${h.reason}. ${h.bom_url}`).join("\n")}

## Notes

- International splits BOM does not publish are derived as \`worldwide − domestic\`.
- \`is_final: false\` films are still accumulating gross; their numbers will move.
- Rotten Tomatoes / Metacritic / IMDb, production budgets for a few recent titles, and widest-release theater counts are pending a second pass.
`;

writeFileSync(join(ROOT, "RECONCILIATION.md"), md);
console.log(`RECONCILIATION.md — ${material.length} material, ${minor.length} minor, ${exact.length} exact, ${added.length} added.`);
