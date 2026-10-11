---
after: implement
input: design
place: git
agent: agora
loop: implement
rounds: 3
budget: 16
tally: findings, findings.kind=placement, mutants.proves
skills: effect, shadcn, change-the-board, look
mcp: playwright
output: review.schema.json
disallowedTools: Bash(cd:*), mcp__playwright__browser_run_code_unsafe, mcp__playwright__browser_console_messages(filename:*), mcp__playwright__browser_evaluate(filename:*), mcp__playwright__browser_network_request(filename:*), mcp__playwright__browser_network_requests(filename:*), mcp__playwright__browser_snapshot(filename:*), mcp__playwright__browser_take_screenshot(filename:*), Bash(npm run build), Bash(npm run e2e), Bash(npm test), Bash(npx turbo run test), Bash(npx turbo run test --force), Bash(npx turbo run test --continue), Bash(npx turbo run test --force --continue), Bash(npx turbo run test --continue --force), mcp__playwright__browser_navigate(url:*:8787*), mcp__playwright__browser_navigate(url:*:5173*), mcp__playwright__browser_tabs(url:*:8787*), mcp__playwright__browser_tabs(url:*:5173*)
---
When the change touches `apps/web`, read the pictures the implement step named in its `artifacts`, from its handed files your brief
lists, in light and dark, with the `look` skill. A page or a state the change touches with no picture of it is a finding.
When the change touches `apps/web`, read `.claude/skills/shadcn/SKILL.md` with Read for how the board's components are meant to be used.

Implement's check ran the whole test suite on this round's tree, forced, and your brief hands you its exit and the end of its output
under `## What implement's check said`. That run is the floor, and a run of yours on the same tree would only say it again, and your
fence refuses the whole suite; a check that did not pass is a finding. Run the typecheck and the lint yourself, each bare and one
command per call: `npx turbo run typecheck --force`, `npm run lint`. Run a package's tests,
`npx turbo run test --force --continue --filter=<package>`, only where a finding needs a run to stand on.

**Judge the mutants, do not run them**: implement's check applied each mutant the engineer's closeout names and refused the step if
one survived; your brief hands you what it said under `## What implement's check said`, each `wf mutants:` line whole in `reported`.
Judge whether the list covers every rule the change adds, and whether each mutant breaks the rule rather than the file's syntax: a
rule with no mutant, or a mutant that only stops the file loading, is a finding. Quote each `wf mutants:` line you judged in your
closeout's `mutants`.

Never build or run the e2e: implement's check ran it on this round's tree, and its log is in the check you are handed.

**Open the change when a picture cannot show it**: when it changes what a page does when pressed, typed into or hovered, or a state no
picture shows. Run `npm run board:serve`, bare: it builds this round's board outside the workspace and serves it on ports of its own,
against a store of its own that holds the e2e's seed, and prints where. Open that address with the `look` skill's browser tools, press
what the change is about, and say in your closeout what you opened and what it showed. The pictures are enough for a change of layout
or of words that they show. Never the live board on :8787 or :5173, which your fence refuses by address. Give no browser tool a
`filename`, which your fence refuses: a picture taken without one is saved outside the workspace, where the tool says. Run
`npm run board:stop` before you sign off.
