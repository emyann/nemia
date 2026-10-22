---
after: implement
input: design
place: git
agent: agora
loop: implement
rounds: 3
budget: 16
tally: findings, findings.kind=placement
skills: effect, shadcn, change-the-board, look, react-aria, see-a-dashboard, apps/web:ds-build, apps/web:ds-theme, apps/web:ds-spec
mcp: playwright
disallowedTools: Bash(cd:*), Bash(git grep *-O*), Bash(git grep *--open-files-in-pager*), mcp__playwright__browser_run_code_unsafe, mcp__playwright__browser_console_messages(filename:*), mcp__playwright__browser_evaluate(filename:*), mcp__playwright__browser_network_request(filename:*), mcp__playwright__browser_network_requests(filename:*), mcp__playwright__browser_snapshot(filename:*), mcp__playwright__browser_take_screenshot(filename:*), Bash(npm run build), Bash(npm run e2e), Bash(npm test), Bash(npx turbo run test), Bash(npx turbo run test --force), Bash(npx turbo run test --continue), Bash(npx turbo run test --force --continue), Bash(npx turbo run test --continue --force), mcp__playwright__browser_navigate(url:*:8787*), mcp__playwright__browser_navigate(url:*:5173*), mcp__playwright__browser_tabs(url:*:8787*), mcp__playwright__browser_tabs(url:*:5173*)
---
Judge what was asked and what the diff does. The steps before you each left their whole closeout in their folder's `closeout.json`:
its summary and body are that step's own account, to check against the change, never taken as the answer to a finding.

When the change touches `apps/web`, read the pictures the implement step named in its `artifacts`, by their paths in its folder's
`closeout.json`, in light and dark, with the `look` skill. A page or a state the change touches with no picture of it is a finding.
When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used.

When the change touches `apps/web`, load `change-the-board` first: it says which of the design system kit's skills you are given the
work is for. `ds-spec`'s reader runs from the root as `node apps/web/.claude/skills/ds-spec/md3.mjs <command>`, typed whole and alone:
this workspace's script, never the copy your skills hold, nor the path the skill's own text prints, which is no file here.

When the change touches `apps/web`, a change that draws a cut, a plate, a tile or a rail on the board takes the look's part for it from
`apps/web/src/components/look`, through its door, before it draws one of its own: `change-the-board` says which part.

When the change touches `tools/observe`, read each dashboard's picture and text the implement step named in its `artifacts`,
`dashboard-<name>.png` and `dashboard-<name>.txt`, with the `see-a-dashboard` skill: the text first. A dashboard the change touches
with no picture and text of it is a finding. You do not render one yourself: your fence refuses the command and Docker.

Implement's check ran the declarations, the typecheck and the lint on this round's tree, and waited on CI: GitHub's `ci` context judged
the suite, the types, the lint, the whole e2e and the build on the commit implement pushed, and the check proved that commit is the one
it judged. Your brief hands you its exit and the end of its output under `## What implement's check said`, that verdict in it; a check
that did not pass is a finding, and so is a round whose suite nothing ran.

**Read the pull request and its checks**, read-only, by the address implement named in its `artifacts` as a value: `gh pr view 7` and
`gh pr checks 7`, the number that address ends on. A red, cancelled or absent `ci` is a finding, as is a pull request whose head is not
the commit you are reviewing. You open, edit, merge and close none: those are refused you, and a person's.

Run the typecheck and the lint yourself, each bare and one command per call: `npx turbo run typecheck --force`,
`npm run lint`. Run a package's tests, `npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to
stand on.

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
