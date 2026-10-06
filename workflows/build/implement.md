---
after: design
input: design
place: git
agent: ada
check: { if [ -n "${WF_BASE_REF:-}" ]; then p=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/pictures.ts" > "$p/pictures.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/pictures.ts, so no picture can be asked for; start the run on a base that has it" >&2; false; }; } && node "$p/pictures.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$p"; [ "$c" -eq 0 ]; else echo "wf check: pictures are asked only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && npm test && npm run typecheck && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then m=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/mutants.ts" > "$m/mutants.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/mutants.ts, so no mutant can be run; start the run on a base that has it" >&2; false; }; } && node "$m/mutants.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$m"; [ "$c" -eq 0 ]; else echo "wf check: the mutants run only in a run's check, where WF_BASE_REF names the base whose runner judges them"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then range="$WF_BASE_REF...HEAD"; else range=HEAD...MERGE_HEAD; fi; touched=$(git -c core.quotePath=false diff --no-renames --name-only "$range" --) || { echo "wf check: cannot tell what the work touched, since git diff --name-only $range failed; the build and the e2e are not skipped on a guess" >&2; false; }; } && if printf '%s\n' "$touched" | grep -Eq '^(apps/(web|api)/|package(-lock)?\.json$|turbo\.json$)'; then if [ -n "${WF_BASE_REF:-}" ]; then npm run build && echo "wf check: no e2e in a round's check; it runs once, on the merged tree, where no WF_BASE_REF is set"; else npm run e2e; fi; else echo "wf check: nothing under apps/web/ or apps/api/, nor the root's package.json, package-lock.json or turbo.json, was touched: no build, no e2e"; fi
budget: 40
skills: effect, shadcn, change-the-board
---
When the change touches `apps/web`, picture the pages and the states it touches, in light and dark, and at a phone's width where the
page sets one: `WF_ARTIFACTS=<your files directory> npm run e2e -- --photos --pages <name,…>` pictures the pages named, in both themes,
and visits the pages before them unpictured, for what they leave. The `look` skill says how, and how to picture a state no page reaches.
Name each picture in `artifacts` by its absolute path. `npm run e2e` without `--photos` takes no picture but a failing page's.
The check refuses a change under `apps/web/src` whose `artifacts` names no picture that is there (`pictures.ts`); a change only under
`apps/web/test` asks for none.
