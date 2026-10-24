---
after: implement
place: git
agent: agora
loop: implement
rounds: 2
budget: 12
tally: findings, findings.kind=placement
skills: effect, shadcn, change-the-board, look, react-aria, see-a-dashboard, apps/web:ds-build, apps/web:ds-theme, apps/web:ds-spec
mcp: playwright
disallowedTools: Bash(npm run build), Bash(npm run e2e), Bash(npm test), Bash(npx shadcn@latest:*), Bash(pnpm dlx shadcn@latest:*), Bash(bunx --bun shadcn@latest:*), Bash(npx turbo run test *build*), Bash(npx tsc *-w*), Bash(npx tsc *-W*), Bash(npx tsc *-in*), Bash(npx tsc *-iN*), Bash(npx tsc *-In*), Bash(npx tsc *-IN*), Bash(npx tsc *-i *), Bash(npx tsc *-I *), Bash(npx tsc *-ts*), Bash(npx tsc *-tS*), Bash(npx tsc *-Ts*), Bash(npx tsc *-TS*), Bash(npx tsc *-g*), Bash(npx tsc *-G*), Bash(npx tsc * false*), Bash(npx tsc *@*), Bash(npx oxlint *--fix*), Bash(npx oxlint *--init*), Bash(npx oxlint *--lsp*), Bash(npx oxlint -c*), Bash(npx oxlint * -c*), Bash(npx oxlint *--config*), Bash(npx turbo run test), Bash(npx turbo run test --force), Bash(npx turbo run test --continue), Bash(npx turbo run test --force --continue), Bash(npx turbo run test --continue --force), mcp__playwright__browser_navigate(url:*:8787*), mcp__playwright__browser_navigate(url:*:5173*), mcp__playwright__browser_tabs(url:*:8787*), mcp__playwright__browser_tabs(url:*:5173*)
---
Judge what was asked and what the diff does. This is a quick run: **no spec was written**, so what was asked is the card itself, as
your brief gives it, and nothing else. The implement step left its whole closeout in its folder's `closeout.json`: its summary and body
are its own account, to check against the change, and its `plan` — what it said would change, where, and what would prove it, written
before the work — and its `pages` are declared fields you read there. A change that is not the card's is a finding; so is a plan the
work went past without saying so.

**Your pass lands the change.** There is no gate after you: once you sign off without asking again, the run files `land`, which merges
this run's pull request and fast-forwards the base branch, and nobody reads the change between your word and the merge. `again: true`
is the only way back — it files implement again, on the same branch, with your findings — and you name no step: what comes after you is
the workflow's, never yours.

**A quick build has no size bound**: quick is for a card that needs no design, whatever its size, so read every file and every line
of it — implement's check measured it and its `wf size:` line is in your brief. A test trimmed, split off or left unwritten is a
finding. A change the card turns out to need a design for is a finding too, with `again: true` and `kind` `other`: it says so, and a
person starts the card with `build`.

**Nothing ran the suite on this machine.** Implement's check is the cheap set and CI: `change.ts size`, `pictures.ts`, `probe.ts`,
`pull-request.ts push` and `pull-request.ts wait`, in that order, and nothing else — no typecheck, no lint, no declaration, no test of a
package and no e2e page here. GitHub's `ci` context judged the suite, the types, the lint, the whole e2e and the build on the commit implement pushed, and
your brief hands you the check's exit and the end of its output under `## What implement's check said`,
that verdict in it; a check that did not pass is a finding, and so is a round whose suite nothing ran.

Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`, `npm run lint`.
Run a package's tests, `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on.

To measure what a finding turns on, such as the errors a compiler flag would raise, run the compiler and the linter with any options
that write nothing, each bare and one command per call, `--noEmit` first:
`npx tsc --noEmit -p packages/agent-orchestrator --noUncheckedIndexedAccess`, `npx oxlint -D no-unused-vars packages/agent-orchestrator/src`.
Your fence refuses what would write or watch: a `tsc` whose first option is not `--noEmit`, and its `--build`, `--incremental`,
`--init`, `--tsBuildInfoFile`, `--generateTrace`, `--generateCpuProfile` and `--watch`, an option set `false` and a file of options
(`@<file>`); `oxlint`'s `--fix`, `--init`, `--lsp`, and a `-c` or `--config`, whose script would run. `tsc` reads an option's name in
any case and after one dash or two, so the refusal goes by its first letters and takes `--inlineSourceMap` and `--inlineSources` with
`--incremental`.

When the change touches `apps/web`, read the pictures the implement step named in its `artifacts`, by their paths in its folder's
`closeout.json`, in light and dark, with the `look` skill. A page or a state the change touches with no picture of it is a finding:
nobody else will look at the board before this lands.
When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used.

When the change touches `apps/web`, load `change-the-board` first: it says which of the design system kit's skills you are given the
work is for. `ds-spec`'s reader runs from the root as `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone:
this workspace's script, never the copy your skills hold, nor the path the skill's own text prints, which is no file here.

When the change touches `apps/web`, a change that draws a cut, a plate, a tile or a rail on the board takes the look's part for it from
`apps/web/src/components/look`, through its door, before it draws one of its own: `change-the-board` says which part.

When the change touches `tools/observe`, read each dashboard's picture and text the implement step named in its `artifacts`,
`dashboard-<name>.png` and `dashboard-<name>.txt`, with the `see-a-dashboard` skill: the text first. A dashboard the change touches
with no picture and text of it is a finding. You do not render one yourself: your fence refuses the command and Docker.

**Read the pull request and its checks**, read-only, by the address implement named in its `artifacts` as a value: `gh pr view 7` and
`gh pr checks 7`, the number that address ends on. A red, cancelled or absent `ci` is a finding, as is a pull request whose head is not
the commit you are reviewing. You open, edit, merge and close none: those are refused you, and Otto's.

Never build or run the e2e: CI ran every page on the commit implement pushed, and its verdict is in the check you are handed.

**Say whether the branch holds the base** as it is when you review. The base is the branch the repository's own checkout is on, and
from your workspace git names its tip `main-worktree/HEAD`, whatever that branch is called:
`git merge-base --is-ancestor main-worktree/HEAD HEAD` answers by its exit code alone, and
`git log --oneline HEAD..main-worktree/HEAD` lists what the branch lacks. Say in your summary the base's commit,
`git rev-parse main-worktree/HEAD`, and that the branch holds it or how many commits it lacks. A branch that lacks some is a finding
with `again: true` only where the base moved under the change: a file both changed, named by
`git diff --name-only HEAD...main-worktree/HEAD` and by `git diff --name-only main-worktree/HEAD...HEAD`; a file the base changed that
the change's code or tests read; or a measure the change wrote, a baseline or a count that only shrinks, over files the base changed.
Name those files in the finding, its `kind` `other`. Any other branch behind is no finding: say so in your summary. Nothing runs the
suite on the merged tree — the landing's check is a receipt — so what covers the rest is GitHub's own `mergeable` on the pull request
and the `ci` context required of the commit you read: a base that moved under a green pull request makes the landing refuse rather
than land, which costs a retry and never a broken base. Once implement has merged the base, the diff your brief names shows the base's landings
with the change: read the change alone with `git diff main-worktree/HEAD...HEAD`.

**Open the change when a picture cannot show it**: when it changes what a page does when pressed, typed into or hovered, or a state no
picture shows. Run `npm run board:serve`, bare: it builds this round's board outside the workspace and serves it on ports of its own,
against a store of its own that holds the e2e's seed, and prints where. Open that address with the `look` skill's browser tools, press
what the change is about, and say in your closeout what you opened and what it showed. The pictures are enough for a change of layout
or of words that they show. Never the live board on :8787 or :5173, which your fence refuses by address. Give no browser tool a
`filename`, which your fence refuses: a picture taken without one is saved in your files directory, `$WF_STEP_FILES`, where the tool says: name each one you
report in `artifacts` by its absolute path there. Run
`npm run board:stop` before you sign off.
