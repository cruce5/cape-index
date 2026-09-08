# The Reconcilers

*They don't save the world. They check it.*

Nine auditors and one villain, packaged as a Claude Code skill plus ten agent definitions, that you point at any data product: a dashboard, a report, a notebook, a public dataset, a model card, a single-file visualization. Each hero owns one lane. They work in parallel, they don't compare notes until the end, and every finding has to point at a line, a cell, or a screen. When the findings are in, Doctor Missedit turns up uninvited and audits the auditors.

Built on and first run against [The Cape Index](https://capeindex.com), where the team found 78 things, 55 after the overlaps merged, and the Doctor found 7 places the fixes had missed.

## The roster

| Hero | Lane | Model (standard issue) |
|---|---|---|
| **Meld** | Context. Reads the local stack first and draws the map the other eight follow, so nobody audits a notebook for missing webpack. Runs alone, before anyone else. | Sonnet |
| **Ledger** | Data integrity. Every number walks back to a source, or it doesn't get on the page. | Opus |
| **Doppel** | Entities and consistency. The same thing under two names; two things under one. | Opus |
| **Median** | Statistics. The n behind every average, the denominator behind every rate. | Opus |
| **Chartjunk** | Visualization craft. Has made every misleading chart once, so recognizes them on sight. | Opus |
| **Thumb** | UX. Uses the product the way a stranger does, on a phone, without the docs. | Sonnet |
| **Greyscale** | Accessibility. Reads the product through every channel except color. | Sonnet |
| **Redline** | Editorial. The headline has to say the finding, and the finding has to be true. | Opus |
| **Payload** | Engineering, security, performance. Is the network tab. | Sonnet |
| **Doctor Missedit** | The audit itself. May only remove confidence from a finding, never add one. Arrives after the heroes, without being asked. | Fable |

Full powers, weaknesses and origins are in `agents/*.md` and on [capeindex.com](https://capeindex.com/#ref).

There are two model rosters. **Standard issue** is the table above. **Flamethrower** puts every hero on Fable. The skill asks which you want before it dispatches anyone, and tells you what it will cost you in tokens, because it is a lot.

## Install

You need [Claude Code](https://claude.com/claude-code). Then, from the folder that holds the product you want audited:

**Windows (PowerShell)**

```powershell
& "<path-to-this-folder>\install.ps1"
```

**macOS / Linux**

```bash
bash <path-to-this-folder>/install.sh
```

Either one copies `agents/*.md` into `.claude/agents/` and `SKILL.md` into `.claude/skills/reconcilers/` in the current directory. Nothing is installed globally; the team is scoped to the repo you called them for. To uninstall, delete those two paths.

## Call them

```
claude
/reconcilers
```

The skill asks three things: what the product is (one line), which model roster, and whether it may use the browser. Then Meld goes in, then the eight, then the report, then the surprise.

Every report lands in `.reconcilers/` inside the target directory: `context.md` (Meld's map), one file per hero, `REPORT.md` (the compiled, ranked, deduplicated list), and `missedit.md` (the verdicts). Add `.reconcilers/` to your `.gitignore` or commit it; both are fine.

## House rules

- Read-only. The team never edits your product, commits, or deploys. Fixing is a separate conversation, and you start it.
- Only verified findings. Reasoned-but-not-checked goes in a "suspected" list at the bottom, never in the ranking.
- Every finding cites a location: `file:line`, a data key, or a screen and a viewport width.
- Every report ends with "Checked clean", so silence is never ambiguous.
- No em dashes. It's a team quirk. Don't fight it.

## Why the villain

Auditors have characteristic false positives, and nobody checks the checkers. On the first run, two of Thumb's findings were artifacts of a hidden browser pane, Median's recomputation moved a number's confidence without changing the sentence, and Ledger pinned one film at the top of a range one paragraph after praising the bottom-of-range rule. The Doctor's job is to know each hero's tell and read every finding with it in one hand and the evidence in the other. His report has three verdicts per finding: stands, downgraded (with the reason), or artifact (with the mechanism), plus a fourth for a run where fixes have already landed: fix mismatch.

Same Bat-time. Same Bat-channel.
