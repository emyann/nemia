---
after: design
input: design
place: git
agent: ada
context: 400k
check: { if [ -n "${WF_BASE_REF:-}" ]; then p=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/pictures.ts" > "$p/pictures.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/pictures.ts, so no picture can be asked for; start the run on a base that has it" >&2; false; }; } && node "$p/pictures.ts" "${WF_CLOSEOUT:-}"; c=$?; rm -rf "$p"; [ "$c" -eq 0 ]; else echo "wf check: pictures are asked only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then q=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/probe.ts" > "$q/probe.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/probe.ts, so no probe can be read; start the run on a base that has it" >&2; false; }; } && node "$q/probe.ts" check; c=$?; rm -rf "$q"; [ "$c" -eq 0 ]; else echo "wf check: probes are read only in a run's check, where WF_BASE_REF and WF_RUN name the run"; fi; } && { if [ -n "${WF_BASE_REF:-}" ]; then r=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/pull-request.ts" > "$r/pull-request.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/pull-request.ts, so the branch cannot be pushed and no pull request can be proven; start the run on a base that has it" >&2; false; }; } && node "$r/pull-request.ts" push; c=$?; rm -rf "$r"; [ "$c" -eq 0 ]; else echo "wf check: the branch is pushed, and its pull request proven to be at the commit this check judges, only in a run's check, where WF_BASE_REF names the base the work began on"; fi; } && npm run typecheck && npm run lint && { if [ -n "${WF_BASE_REF:-}" ]; then w=$(mktemp -d) && { git show "$WF_BASE_REF:workflows/build/pull-request.ts" > "$w/pull-request.ts" 2>/dev/null || { echo "wf check: the run's base $WF_BASE_REF has no workflows/build/pull-request.ts, so CI's verdict cannot be read; start the run on a base that has it" >&2; false; }; } && node "$w/pull-request.ts" wait; c=$?; rm -rf "$w"; [ "$c" -eq 0 ]; else echo "wf check: CI's verdict is waited for only in a run's check, where WF_BASE_REF names the base the work began on"; fi; }
budget: 40
skills: effect, shadcn, change-the-board, look, react-aria, see-a-dashboard, apps/web:ds-build, apps/web:ds-theme, apps/web:ds-spec
mcp: playwright
disallowedTools: Bash(*:4318*), Bash(*:4317*)
---
The body, byte for byte.
