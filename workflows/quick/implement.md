---
place: git
agent: ada
context: 200k
check: { if [ -n "${WF_BASE_REF:-}" ]; then s=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/quick/change.ts" > "$s/change.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/quick/change.ts, so the change cannot be measured; start the run on a base that has it" >&2; false; }; } && node "$s/change.ts" size; c=$?; rm -rf "$s"; [ "$c" -eq 0 ]; else echo "wf check: a change is measured only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then p=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/pictures.ts" > "$p/pictures.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/pictures.ts, so no picture can be asked for; start the run on a base that has it" >&2; false; }; } && node "$p/pictures.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$p"; [ "$c" -eq 0 ]; else echo "wf check: pictures are asked only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then q=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/probe.ts" > "$q/probe.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/probe.ts, so no probe can be read; start the run on a base that has it" >&2; false; }; } && node "$q/probe.ts" check; c=$?; rm -rf "$q"; [ "$c" -eq 0 ]; else echo "wf check: probes are read only in a run's check, where WF_BASE_REF and WF_RUN name the run"; fi; } && npm run typecheck && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then m=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/mutants.ts" > "$m/mutants.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/mutants.ts, so no mutant can be run; start the run on a base that has it" >&2; false; }; } && node "$m/mutants.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$m"; [ "$c" -eq 0 ]; else echo "wf check: the mutants run only in a run's check, where WF_BASE_REF names the base whose runner judges them"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then s=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/quick/change.ts" > "$s/change.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/quick/change.ts, so the change cannot be measured; start the run on a base that has it" >&2; false; }; } && node "$s/change.ts" tests; c=$?; rm -rf "$s"; [ "$c" -eq 0 ]; else echo "wf check: the tests of what the change touched run only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then s=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/quick/change.ts" > "$s/change.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/quick/change.ts, so the change cannot be measured; start the run on a base that has it" >&2; false; }; } && node "$s/change.ts" pages "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$s"; [ "$c" -eq 0 ]; else echo "wf check: the pages the closeout names run only in a run's check, where WF_BASE_REF names the base the work began on"; fi; }
budget: 20
skills: effect, shadcn, change-the-board, look, see-a-dashboard, apps/web:ds-build, apps/web:ds-theme, apps/web:ds-spec
mcp: playwright
disallowedTools: SendMessage, CronCreate, CronDelete, RemoteTrigger, Bash(git push), Bash(git push:*), Bash(git branch -D:*), Bash(git branch --delete --force:*), Bash(pkill:*), Bash(killall:*), mcp__playwright__browser_run_code_unsafe, Bash(claude *--bg*), Bash(claude *--background*), Bash(claude *remote-control*), Edit(//**/.claude/settings.local.json), Edit(~/.claude/settings.json), Edit(~/.claude.json), Bash(*:4318*), Bash(*:4317*)
output: implement.schema.json
---
This is a quick build: no spec was written for you and no review follows. You are handed a card, and the person who approves the
landing reads your plan and your change at its gate.

**Write your plan first**, before you build: what changes, where, and what proves it, in a few lines. It goes in your closeout's `plan`,
as you wrote it, corrected where the work proved it wrong. Then build it, with the tests that prove it.

**Decide nothing the card does not give.** When the change needs a decision the card leaves open (a taste call, a name a person will
read, which of two behaviours), sign off `blocked` and say in `needs` what is undecided; do not choose for them.

**A quick build is small**: at most 10 files and 300 lines changed, added plus removed, tests and docs counted, generated files
(`package-lock.json`, `apps/web/theme/`, `apps/web/src/routeTree.gen.ts`) left out. The check measures it first
(`workflows/quick/change.ts`) and refuses a change past either number: a person then starts the card with `build`. When the work
grows past the bound, do not trim it to fit, split it or drop its tests: sign off `blocked`, and say in `needs` that the card is a
`build` card and why.

**Name the pages** the change touches in your closeout's `pages`, each by the name `npm run e2e -- --pages <name,…>` takes, `[]` when
it touches none: the check runs the e2e on those pages alone, and refuses a change under `apps/web/src` that names none. The check runs
the types, the lint, your mutants and the tests of the packages that read what you changed; the whole suite and the whole e2e run once,
in the landing's check on the merged tree, after a person approved. A failure there aborts the landing and comes back to you.

When the change touches `apps/web`, picture the pages and the states it touches, in light and dark, and at a phone's width where the
page sets one: `WF_ARTIFACTS=<your files directory> npm run e2e -- --photos --pages <name,…>` pictures the pages named, in both themes,
and visits no other. The `look` skill says how, and how to picture a state no page reaches.
Name each picture in `artifacts` by its absolute path. `npm run e2e` without `--photos` takes no picture but a failing page's.
The check refuses a change under `apps/web/src` whose `artifacts` names no picture that is there (`pictures.ts`); a change only under
`apps/web/test` asks for none. Run the e2e on the pages the change touches, `npm run e2e -- --pages <name,…>`, never the whole suite
but to measure it: this step's check runs the pages you name in `pages`, outside your session.

When the change touches `apps/web`, load `shadcn` for the board's components, and load `change-the-board` before `shadcn`: it says
where your shell must be for that load.

When the change touches `apps/web`, a change that draws a cut, a plate, a tile or a rail on the board takes the look's part for it from
`apps/web/src/components/look`, through its door, before it draws one of its own: `change-the-board` says which part.

When the change touches `tools/observe` — a dashboard, the collector's or Tempo's file, the compose file, the render — see it rendered
before you sign off: `node tools/observe/render/render.ts --out <your files directory>` starts a throwaway stack from this workspace
with fake data, never the live one, and writes `dashboard-<name>.png` and `dashboard-<name>.txt` for each dashboard. Read them as the
`see-a-dashboard` skill says, and name each in `artifacts` by its absolute path: the check refuses a changed dashboard whose picture and
text are not named (`pictures.ts`); a change only to `tools/observe/README.md` or under `tools/observe/profile` asks for none. To look
with your browser, add `--hold`, and stop the stack it names when you are done: `node tools/observe/render/render.ts --stop <name>`.

**Name your mutants** in the closeout: one per rule or guard the change adds, each a `file`, the text `from` it holds exactly once in
your committed result, what it becomes `to` (valid code that breaks the rule, never a syntax error), the `test` file that must fail,
and the exact `name` of one test in it (its whole name, never a part of it: only that test runs) or null. Implement's check applies
each to a copy of your result and refuses the step when its test still passes, when `from` does not apply, or when the test fails or
runs nothing unmutated. Try them first: `node workflows/build/mutants.ts <closeout.json>` after you commit. Name none only for a
change that adds no rule, saying why in `noMutants`.

**Merge the base before you sign off**, on every try: the base moves while you work, and the landing's check runs the whole suite on
the merged tree. The bound counts your own change alone, from the base you merged last. The base is the branch the repository's own checkout is on, and from your worktree git names its tip
`main-worktree/HEAD`, whatever that branch is called. Commit your work, then `git merge main-worktree/HEAD`, made as the `git` skill
says a merge is made: keep both meanings in each conflict, and sign off `blocked` where both cannot hold. Then run again the tests of
what the merge touched: those of each file of yours it changed, and of each file it changed that your code or your tests read.
Measure again whatever your change wrote by a measure, a baseline or a count that only shrinks: the number was true of the tree before
the merge. Try your mutants again on the merged result, and say in your summary the commit you merged, or that git answered
`Already up to date`. You merge the base into your branch, never your branch into the base. On a try whose brief is headed `## Merge`,
merge the commit it names and no other.

When you start a Claude Code session of your own to measure something, a probe, start it through `node workflows/build/probe.ts start
<label> -- <prompt>`: a bare `claude --bg` or Remote Control is refused to you. It names the session for the run, runs it in the
machinery's trusted folder (`$WF_ROOT/probes`), and tells the person no action is needed; pass `--settings` rather than edit a folder's
settings. Only when the measurement needs the person's answer, add `--answer "<what to press>"`: the session then reaches their phone,
and you stop `blocked` with the `needs` line it prints. Read your probes with `list`, and stop them with `stop` before you sign off:
the check refuses a live one.

When a measurement needs a collector, hold a throwaway stack and use its own: `node tools/observe/render/render.ts --hold` prints the
collector's address as the `OTEL_EXPORTER_OTLP_ENDPOINT` to give what you start, and `--stop <name>` ends it. The live collector, on
`:4318` and `:4317`, takes the factory's real work alone: a command that names either port is refused to you, a commit message or a
search that spells one included.
