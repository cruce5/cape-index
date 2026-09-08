# Porting The Reconcilers to another agent runtime

The team is defined by one skill (the episode) and ten briefs (one per hero, one for the villain). Any agent runtime that can (a) read a file, (b) write a file, and (c) follow a checklist can host the Reconcilers. This page describes the protocol.

## The protocol, in one page

1. **Input**: a target directory, and one line about what the product is.
2. **State**: a folder `<target>/.reconcilers/` where every report lands.
3. **Order**:
   - `context.md` (Meld) is written first, alone.
   - Every other hero reads `context.md` before writing their own report.
   - Heroes do not read each other's reports.
   - `REPORT.md` (the compiler) reads all eight hero reports and Meld's map.
   - `missedit.md` (the villain) reads all of the above.
4. **Output shape** (per hero):
   - Title line: `<HERO> · <lane>`
   - One sentence in character.
   - Findings ranked Critical / Major / Minor, max 10 or 12.
   - Each finding: what, where (`file:line` or a data key), evidence, one-line fix.
   - Then "Checked clean" so silence is not ambiguous.
5. **House rules that outrank everything**:
   - Read-only. No writes outside `.reconcilers/`.
   - Only verified findings in the ranking; reasoned-but-not-checked goes in a "Suspected, not verified" tail.
   - Every finding cites a location.
   - No em dashes anywhere in any report.
6. **The villain**:
   - Arrives after the eight, without being asked.
   - May only remove confidence, never add findings.
   - Verdicts per finding: `stands` (one word), `downgraded` + reason + citation, `artifact` + mechanism + citation, `fix mismatch` + what the finding said, what the fix did, what it should have done (only after fixes land).

## Two runtimes we ship

- **Claude Code** (the default): `SKILL.md` (the episode) + `agents/*.md` (one file per hero, with model frontmatter). Installed to `.claude/skills/reconcilers/` and `.claude/agents/`. Ten agents run in parallel from one dispatcher.
- **Codex**: `adapters/codex/AGENTS.md`, dropped at the repo root. One agent runs the ten lanes sequentially. Same briefs, same rules, same output.

## Adding a runtime

You need three things.

1. **The dispatcher.** How does the runtime start? For Codex, it is `AGENTS.md` at the root. For Cursor, it is a `.cursor/rules/reconcilers.mdc`. For Aider, it is a `CONVENTIONS.md` line pointing at the skill. For a plain scripted runner, it is a shell script that iterates the briefs.
2. **The briefs.** Each hero's mandate (see `../agents/*.md`) transcribed into the runtime's own format. The mandate is stable across runtimes; only the surrounding metadata (model choice, tools, frontmatter) changes.
3. **The theatre.** Optional but recommended: keep the 1966 Batman flavour. The style card is in `SKILL.md` and the Codex `AGENTS.md`. Sound effects, dispatch calls, `HOLD IT!` before the villain, `Same Bat-time. Same Bat-channel.` at the end.

## What to keep the same

- The order (Meld first, alone; then the eight; then the compiler; then the villain).
- The output shape and the four verdicts.
- The no-em-dashes rule.
- The read-only guarantee.
- The villain's rule: he may only remove confidence.

## What is fair to change

- **Parallelism**: Claude Code runs the eight at once; Codex runs them one after another. Both are valid; the compiler does not care.
- **Model choice**: Claude Code pins a model per hero in the agent frontmatter. Codex lets the user pick a roster (standard or flamethrower). Any runtime should give the user the same choice.
- **Sound effects**: the specific effects cycle in the SKILL.md are conventions, not law; use whatever your reader will recognise.
- **The name**: someone will want to rename this for their org. That is fine. The rules travel; the branding is theirs.

## What breaks the team

- Letting a hero read another hero's report before Act 3 (they stop being independent).
- Compiling before every hero has filed (you lose the corroboration count).
- Adding a fifth verdict to the villain (he becomes an auditor; he was fired for that).
- Skipping the "Checked clean" section (silence becomes ambiguous, which is exactly the failure mode the section exists to prevent).
