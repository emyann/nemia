# Features to build

The features agent-workflows is still missing, in the order I would take them. Each says what exists
today, what the feature has to settle, and what earlier work already taught about it. Bugs and open
questions live in [agent-engine/docs/open-issues.md](../../agent-engine/docs/open-issues.md).

State as of 2026-09-13: the check (package C of `docs/plan-hold-the-bar.md`, hkb-v2), declared
outputs (package J), a step's files directory with `workflows/ui/` (U1), a browser for every Claude
step (the repository's `.mcp.json`), a worktree's own `node_modules` with `.worktreeinclude`,
trying a step again with `retries:` and `wf retry` (§4 F), going round again with `loop:`,
`rounds:` and `wf round` (§4 R), a step's `tools:` and `effort:` (§4 I), the decider screen
(§4 G), and looking as a skill with `workflows/ui/` as implement ⇄ review (§4 U2) have shipped.

## Shipped: the check

A step's `check:` is executed by the run after the step signs off, as an engine task on the run's own
`check` harness; exit 0 is `verified` and files what follows, anything else is `failed (check)` and
files nothing. With it: the workflow is frozen onto the run at `wf start`; a step that ends without the
closeout it was asked for is `unsigned` and files nothing; failed and stopped steps are handed off
(engine open issue 2); `wf ls` and `wf decide` say `verified ✓`, `checking`, `failed ✗ check (exit N)`,
`unverified` and `unsigned`; `wf decide` no longer reads a `--no-worktree` run as shipped. The README's
*The check* section is the account.

What it leaves for wave 2 of the plan, in its order:

- **Retries** (§4 F). Shipped: *Shipped: trying again*, below.
- **The decider screen** (§4 G). Shipped: *Shipped: the decider screen*, below.
- **Rounds** (§4 R, which absorbed §4 H). Shipped: *Shipped: going round again*, below.

## Shipped: declared outputs and inputs

A step's product can travel to the next step as its closeout, declared, instead of as a file written
into the workspace. There are two keys, and neither is control flow. `output: <file>` on the producer
names a JSON Schema beside the step. It is read at `wf start` and frozen on the run with the step, and
its properties are merged into the closeout the step is filed with, still strict. `input: <step>` on
the consumer puts the producer's declared fields, and nothing else, in its brief under
`## From <step>`, as data. At load, the run refuses a missing file, a schema that is not strict or uses `$ref`, a
schema naming a base field, and an `input:` on a step that is not `after` the producer or that
declares no output. A producer whose closeout lacks a declared field is `unsigned`, and nothing that
waits on it is filed. `wf decide` prints the declared output after the summary.

The anchoring rule is kept by making both ends declared. A step's summary still goes only to the
person who decides, and nothing from any closeout reaches a step that did not ask for it.
`workflows/review.md` now declares `findings` (`review.schema.json`) and runs read-only.
`workflows/respond.md` read them with `input: review` until the loop replaced it, and `workflows/ui/respond.md`
did until the loop replaced it there too (§4 U2).
The README section *Declared output* is the full account.

What it leaves:

- **A size cap.** A declared output travels whole into the next brief. hkb capped a result at 4 KB,
  and no cap is stated here yet.
- **The board's Output tab** (apps, not this package) can render the declared output from the
  engine's record, the same way `wf decide` does.
- **Files as inputs** (plan §4b). `wf start --input <file>` would copy into `runs/<id>/inputs/`, and
  every brief would name the directory. A closeout carries text, not a screenshot.

## Shipped: a step's files directory, and `workflows/ui/`

The run makes `runs/<id>/artifacts/<step>/` under `WF_ROOT` before it files a step, tells the step where
it is on its brief, beside the closeout contract, and gives the step's check the same directory as
`WF_ARTIFACTS`. A declared artifact by absolute path counts when it is a file in that directory; any other
absolute path is refused without being looked at. `wf decide` lists the directory's files with their
sizes. With it came `workflows/ui/`, checked by `npm run e2e`, which screenshots every page of the web app
in both themes into the step's directory for the steps after it to read — since §4 U2, implement ⇄ review
(*Shipped: looking is a skill*, below). The README section *A step's files* is the account.

What it leaves:

- **Reading outside the worktree, unattended, is measured in `dontAsk` only.** The screenshots live under
  `WF_ROOT`, outside the reviewer's worktree. A `claude -p` spawned as the engine spawns `workflows/ui/review.md`
  (`--permission-mode dontAsk --tools Read,Grep,Glob,Bash --mcp-config .mcp.json --strict-mcp-config`, in a
  worktree) read a PNG under `runs/<id>/artifacts/` without asking (Claude Code 2.1.270, 2026-09-13). Nobody
  has run a step in `auto` mode to see the same. If one stalls `needs-human`, the fix is a directory the step
  may read, carried on the task the way `mcp:` will be (§4 E4).
- **The board does not show a step's files.** That needs a small api endpoint over
  `runs/<id>/artifacts/` and a list in the step inspector (plan, *The `ui/` workflow*).
- **The api does not tell an unfiled step its directory.** `composeBrief` takes the directory as a fifth
  argument, and the api's "what it would be told now" does not pass it yet. It is one line in `toldOf`.
  A worktree the run cuts now resolves its own `agent-workflows`, so the app change and the package
  change can land on one branch. A worktree made by hand still links main's tree.
- **No clean-up and no size cap.** Screenshots accumulate per run under `WF_ROOT`, as check stderr files
  do. `wf rm`, when it comes, removes `runs/<id>/` whole.

## Shipped: a browser for every Claude step

The browser the plan gives the ui `implement` step, through the content route: the repository's
`.mcp.json` names one server, `playwright`, run as `node node_modules/@playwright/mcp/cli.js --headless
--browser chromium --isolated --output-dir /tmp/playwright-mcp`, with `@playwright/mcp` pinned exactly in
the root devDependencies. The engine names that file on every Claude spawn, beside `--strict-mcp-config`
and `--no-chrome` (E4), so a step in any worktree of the repository has the `browser_*` tools and none of
the operator's servers. `.claude/settings.json` enables it for an interactive session in the checkout.
`node`, not `npx`, so nothing is downloaded at a spawn, and the relative path resolves through each
worktree's `node_modules` link. `--isolated` keeps each session's profile in memory, so no two steps share
cookies or storage. `--output-dir` keeps the snapshots and screenshots the tools write out of the
workspace, where the run would otherwise commit `.playwright-mcp/`. `workflows/ui/implement.md` tells the
step it can drive the page it builds. `test/mcp-config.test.ts` holds the file to that shape, makes each
way out of it refuse, and starts the server as configured to list its tools. A live test (`AE_LIVE=1`)
files a `--bg` task in the checkout and reads back its MCP servers and tools. Run on 2026-09-13 in a
worktree (Claude Code 2.1.270, on a machine whose operator has a user-scope server), it passed:
`playwright` was the only server, and `mcp__playwright__browser_navigate` was among the tools.

What it leaves:

- **Every Claude step has it, the readers too,** and a tool list does not take it away (measured, under
  *Shipped: looking is a skill*). Per-step choice is the `mcp:` question under *Shipped: what a step may
  have*, below: the engine's `mcp` adds servers beside `.mcp.json`, and cannot take that file's servers away.
- **Codex steps do not have it.** Codex reads no `.mcp.json`. The engine hands a task's `mcp` to Codex as
  one `-c mcp_servers=…` override, so a Codex browser waits on the same `mcp:` key.
- **Two browser builds.** No `@playwright/mcp` release pins the e2e's playwright 1.62.1 (Chromium 1234),
  so 0.0.80 brings its own 1.63.0 alpha (Chromium 1243). Each is installed once per machine; CLAUDE.md
  gives both commands.

## Shipped: a worktree's own `node_modules`, and `.worktreeinclude`

A worktree the run cuts no longer links the main checkout's whole `node_modules`. Through that link a
branch's app imported main's workspace packages, and M1's check was refused four times over it (plan
§4b): a dependency the branch pinned was not in the shared tree, and main moving under the branch
failed tests the branch never touched. `depsPlan` (`src/deps.ts`, pure) gives the worktree a directory
of its own. Workspace packages link to the worktree's copies and third-party packages to main's, and
`.bin` and every `@scope` belong to the worktree. When the worktree's `package-lock.json` asks for a
package main's `node_modules` does not have on disk (`lockfileParting`), `provisionDeps` runs `npm ci`
there instead, and the brief says so under *Where to look*. The gitignored
paths `.worktreeinclude` lists are copied from the main checkout at the cut, and `node_modules` is never
copied. A pass that dies mid-cut no longer wedges the run. `Advanced.notes` carries what the cut had to
say, and `wf up` and `wf tick` print it. The README section *What a worktree is given* is the account.

`.worktreeinclude` was added to the brief mid-run, by a cross-session message relayed from the person
who asked. It is recorded here because the run's record would not show it (plan §4b, *steering by
message*).

What it leaves:

- **`npm ci` runs inside the tick.** It is awaited, so `wf up` files nothing else for that minute, and a
  slow registry makes every run wait. If that hurts, the fix is an install filed as an engine task, the
  way the check is.
- **Only the root `node_modules`.** A workspace's nested `node_modules`, where npm puts a conflicting
  version, is not provisioned. Here `apps/web/node_modules` holds only vite's caches. The day one holds
  a package, the worktree resolves the root's version of it.
- **The cut is the only time the run provisions.** A step that changes the lockfile mid-session installs
  for itself. `npm install` in a linked worktree replaces the links it touches with directories and
  writes nothing of main's (measured with a local tarball, not a registry).
- **npm only.** The worktree's `package-lock.json` is compared with what is on disk in main's
  `node_modules`, so a change to another package manager's lockfile goes unseen and that tree is linked
  as npm's would be.
- **An optional package main did not install is taken for a platform build.** That is right for the
  84 such entries in this repository's lockfile. It is wrong for an optional package a branch adds that
  this machine would take: the worktree links, and the package is missing until a step installs it.
- **A package main has and the branch dropped is not looked for.** The worktree links, so the dropped
  package still resolves there and a test that needs it passes. Finding it would mean walking main's
  whole tree.
- **A version is compared, not contents.** A package main has at the lockfile's version is taken to be
  it, wherever it was fetched from.
- **A workspace bin has to be committed executable.** A linked `.bin` runs the worktree's file with the
  mode git gave it, whereas npm would chmod it at install. This repository's bins are `100755`.
- **`.worktreeinclude` takes paths, not patterns.** Claude Code's reads gitignore patterns, but a glob
  here is a path nothing has: it is skipped and named. A leading `/` is read as gitignore reads it, the
  root of the repository. Patterns would need `git ls-files --others --ignored` and a matcher.
- **Worktrees cut before this keep their link.** `provisionDeps` leaves a `node_modules` that is a link
  alone (`shared`), and nothing re-provisions a worktree after its cut.

## Shipped: trying again — `retries:` and `wf retry`

A step whose check did not pass can now be tried again without hand surgery. Before, the only remedy for
a check that refused for a reason that was not the code was editing the engine's journal and the run's
record with the daemon stopped. That happened four times on 2026-09-13 (plan §4b: a parallel-turbo flake, a
leaked `WF_STDERR`, a missing package, and three checks the harness killed for "low memory" with 16 GB free).

- `retries: n` re-files a step its check **refused** (settled `failed`, with an exit code), up to `n` times.
  The step's own last session is continued, and its brief carries the verdict as data: the command, the exit,
  both tails, and "do not weaken it".
- A check that **did not finish** (`stopped`, or `failed` without an exit code) spends no try. It waits on
  the person, and `wf decide` offers `wf retry <run> <step> --recheck`.
- `wf retry <run> <step> [--nudge | --fresh | --model <m> | --recheck]` writes `runs/<id>.asks/retry-<step>-<n>`
  exclusively. The next tick honours it once and moves it into `done/`.
- `steps[name].taskId` and `.check` stay the current try's, and the tries before go under `steps[name].tries`.
  The derived ids (`<run>-<step>-try<n>`, `…-try<n>-check`) let the next pass adopt a try a crashed pass filed.

`wf ls` puts the try beside a step's line (`note`) and never in its word, so the board's vocabulary is
unchanged. The README section *Trying again* is the account.

What it leaves:

- **The board does not see asks.** `apps/api` gives `assess` and `listing` each check's verdict, as the tick
  does, so a try `retries:` covers reads the same in both places: running, moving, and waiting on nobody. It
  reads no ask files, though. Until the tick files a try a person asked for, the board shows that run failed,
  not moving, and waiting on you. `note` is not in its payload either. Fixing that is one argument each in
  `judge`, plus a verb on the board if a person should be able to ask from there.
- **An ask carries no message.** A nudge tells the step what happened, not what the person wants done
  differently. That is plan §4b's *steering by message*: the same file shape, with text the tick composes into
  the brief.
- **The refused check's litter is in the workspace when the next try starts.** The new try's hand-off commits
  whatever the suite left that git does not ignore, under the step's name. A clean-up would be destructive,
  so nothing does one.
- **A try shares its step's files directory.** The last try's screenshots stay beside the new try's until they
  are overwritten, and `wf decide` lists them all.
- **Two readings of one verdict.** The tick tells a refusal by the exit code the engine recorded, so no log is
  read per pass. `wf ls` and `wf decide` read the log's `[wf check] exit N`. They agree while the check prints
  the code it exits with. A record from before the engine kept exit codes reads as "did not finish" to the
  tick, so it offers `--recheck` rather than spending a retry. A caller that passes no verdict gets the same
  reading. F's review found the api passing none, and reading a check stopped at its deadline as a refusal
  with a try due.
- **The engine's deadline is `failed`, not `stopped`.** A check stopped at its deadline settles `failed` with
  no exit code, so the missing exit code, not the phase, is what says it did not finish.
- **`bin/wf.ts` exits 1 on every error**, including the verbs' refusals, which set `exitCode` 2.
- **No `retries:` on this repository's workflows.** A flaky suite would spend a whole session on a nudge.

## Shipped: going round again — `loop:`, `rounds:` and `wf round`

Plan §4 R, which absorbed §4 H. The shipped workflow is implement ⇄ review until the reviewer says the
change is done, at most three rounds, then a person: the README's last unchecked item. `respond` was not
a third kind of work — J had already made it `resume: implement` with `input: review` and the check — so
the loop replaced it, and its three honest answers moved into the contract the run appends.

- `loop: <step>` on the looping step names an ancestor by `after`, and `rounds: N` caps it, 3 by default.
  A looping step declares `again: boolean` in its `output:`. Refused at load: a loop naming no step it
  waits on, a looping step without a boolean `again`, `rounds:` without `loop:`, a step in the loop that
  forks, merges or resumes, a step in two loops, and a target that declares `replies`.
- The looping step verified (or unverified) with `again: true` and rounds left: the next tick files the
  target again — its last session continued, handed the looping step's declared output as data, without
  `again` or the summary — then the steps between, then the looping step, as new sessions. `again: false`
  continues to what comes after, or ends the run succeeded.
- From round 2 the target owes `replies` (`fixed`, or `won't fix` and why), merged into its closeout
  schema, and the next round's looping step is handed them as data. A target that gives none is `unsigned`.
- At the cap with `again: true`: `rounds exhausted`, waiting on a person. `wf decide` says so, prints the
  last findings and offers `wf round <run> [<step>]`, which writes `runs/<id>.asks/round-<step>-<n>`,
  honoured once. Refused while a round runs or the run would go round itself, on a loop that ended, on a
  step of the loop that stopped, and on a cancelled run.
- A round is F's tries: `then: 'round'`, ids `<run>-<step>-try<n>`, adoption after a dead pass as for a
  try, and `round 2 of 3` in the row's `note`. `retries:` now counts within a round.

The README section *Going round again* is the account, and says how `loop:` and `retries:` differ.

What it leaves:

- **The board does not see rounds yet.** `apps/api`'s `judge` passes `assess` no round asks, and its
  `moving` does not count `round`: a run with a round due reads running and not moving until the tick
  files it, and a round a person asked for reads waiting on you until then. `apps/web`'s `stepState` does
  not know `rounds exhausted` and draws it as working. `note` is not in the api's payload, and the canvas
  draws no loop edge. Each is an argument or a word in the apps, from what `listing` already says.
- **A loop is a chain.** A step in the loop that forks or merges is refused, because its worktree is cut
  once and a round would not bring the target's new commits into it. Merging the target's branch into
  such a worktree each round would lift that, and a loop over two reviewers side by side needs it.
  `workflows/ui/` had two, and loops now because looking became a skill and its reviewers one (§4 U2).
- **`wf logs <run> <step>`** on a step of the loop waiting for its round says it has not run: it reads the
  current try, which is not filed yet. The earlier tries are under their own ids, for `ae logs`.
- **An ask carries no message**, as `wf retry`'s does not: `wf round` says once more, not what to look at.
- **Nothing measures a reviewer that asks again for nits.** The cap and the person are the guard. The
  looping step is told that a finding worth a person's attention and not another round can go with
  `again: false`, and that is prose.

## Shipped: what a step may have — `tools:` and `effort:`

Plan §4 I. A step names the only tools its session has, `tools: Read, Grep, Glob, Bash`, and how hard its
harness thinks, `effort: high`. Both reach `e.file` on every filing of the step: the first, each try
(`retries:`, `wf retry`) and each round. The engine gives them to Claude Code as `--tools` and `--effort`
(B), and `--tools` was measured not to take away the tool a closeout is made with.

- `tools:` is refused at load when it names no tool, when an entry has a space or a comma inside (a list
  without its commas, a rule such as `Bash(git diff:*)`, a list in brackets or quotes), and on codex, which has
  no tool list. The codex message names `permissionMode`, the sandbox, instead.
- `effort:` is refused by name with its harness's list, as a permission mode is.
- The parser's permission modes and efforts are copies of the engine's, and the modes had drifted: the engine
  took Claude Code's `manual` and codex's `bypassPermissions`, and the parser refused both at load.
  `test/vocabulary.test.ts` imports `CLAUDE_PERMISSION_MODES`, `CLAUDE_EFFORTS`, `CODEX_SANDBOXES` and
  `CODEX_EFFORTS` and fails on any difference. The engine is the source.
- `phaseOfView`, `closeoutAsked` and `exitVerdicts` are exported from the package root, so a consumer words a
  step as `wf ls` does off the views it already has, with no `logs` call. `wf ls` now says `unknown`, not
  `pending`, for a task the engine has no record of (plan §4b).
- `workflows/review.md` stays on codex in `permissionMode: read-only`, and its frontmatter gives the Claude
  form: `tools: Read, Grep, Glob, Bash`, which `workflows/ui/review.md` uses in `dontAsk` since §4 U2.

What it leaves:

- **`mcp:` on a step is the next question.** Every Claude step gets the checkout's `.mcp.json` (E4), readers
  included. The engine's task `mcp` adds servers beside that file and cannot withhold it. A per-step `mcp:` that
  narrows — a reader without a browser, or with only the servers it names — needs the engine to leave the
  checkout's file out when a task asks it to. Until then an `mcp:` key could only add, and a step that named
  none would still have every server in the file. So the key is not built.
- **`--tools` does not narrow a server's tools, measured.** `claude --help` (2.1.270) says the list is "from the
  built-in set", and a `claude -p` with `--tools Read,Grep,Glob,Bash` and `.mcp.json` listed every `browser_*`
  tool (2026-09-13, *Shipped: looking is a skill*). What keeps a server's tool from such a step is its permission
  mode and the settings, not its tool list. No `--bg` step has been filed with both yet.
- **The shipped reviewers still cannot be shown to run the suite.** They are on codex, and its `read-only`
  sandbox writes nothing, while the root `npm test` runs turbo, which writes a cache. Nobody has run it under
  that sandbox. A Claude reviewer with `tools: Read, Grep, Glob, Bash` has the tool for it, and the operator's own
  folders run review on Claude. But Bash can also write. And the `auto` classifier that refused `node --test`
  (plan §4b) is not a tool list, so whether it lets a tool-fenced reviewer's `npm test` through is unmeasured.
- **The engine's lists are not exported from its root.** The vocabulary test reads them from the engine modules
  beside the root the package resolves. One export line in `agent-engine/src/facade.ts` would let it import
  them by name.
- **The api still carries its copies.** `apps/api/src/app.ts` has `phaseOf`, `askedOf` and `verdictOf`, and
  its test leaves a lost task out of the words it holds to `list`'s. Both go when the api swaps to these
  exports, in a follow-up.
- **Codex's tool-list fence in the engine is unused.** The engine runs a codex task `read-only` when its list has
  none of Bash, Write or Edit. No step reaches that now, and `permissionMode: read-only` says the same plainly.

## Shipped: looking is a skill — `workflows/ui/` as implement ⇄ review

Plan §4 U2. `workflows/ui/` forked implement into `look`, `review` and `respond`, which read as three kinds of
work when it was one loop. `look` was a step because the reviewer ran on codex, which reads no image and has no
browser, and `respond` because there was no loop. Neither holds: `workflows/ui/review.md` runs on Claude, every
Claude step has the checkout's `.mcp.json`, and §4 R gave the edge back.

- **The look skill**, `.claude/skills/look/SKILL.md` in this repository: read the e2e's PNGs; serve the app as
  the e2e does and photograph the pages with the `browser_*` tools, never `browser_run_code_unsafe`; judge the
  layout, both themes and what a person notices first, in `look.md`'s words. It writes nothing into the
  workspace.
- **`implement`** uses it on every page it changed before it signs off. Its check, `screenshots` and `pages`
  are unchanged.
- **`review`** is `input: implement`, `tools: Read, Grep, Glob, Bash`, `permissionMode: dontAsk`,
  `loop: implement`, `rounds: 3`: the old review's prose, then the old look's. Its schema is
  `workflows/review.schema.json` with a finding's place as `where: { file, line } | { page, theme }`, strict.
- **`look.md`, `look.schema.json` and `respond.md` are gone**, from this folder and the repository's copy.
  `test/ui-workflow.test.ts` loads the two steps and the loop; makes the closeout schema refuse a finding that
  names neither a file nor a page, half of one, or both, with `ajv` (now a dev dependency); and holds the
  repository's `workflows/ui/` to this folder, README aside, catching a copy that drifts.

What it leaves:

- **At this repository's settings the reviewer looks through the screenshots only.** Measured on 2026-09-13 with a
  `claude -p` spawned as the engine spawns `review` (Claude Code 2.1.270): a Read of a PNG under
  `runs/<id>/artifacts/` and `git status` were allowed; `browser_navigate`, `browser_take_screenshot` and `cp`
  were denied without a prompt, because `.claude/settings.json` allows none of them and `dontAsk` denies what
  it does not allow. So the skill's browser half is inert for `review` until a person adds the browser tools a
  reader may use to `allow` — by name, not `mcp__playwright` whole, which would allow `browser_file_upload` and
  `browser_evaluate` too. The skill says what to do meanwhile: judge from the pictures, and say so.
- **The browser photographs the light theme only.** The app and its canvas follow `prefers-color-scheme`, the
  browser's is light (measured), and no `browser_*` tool changes it; `browser_run_code_unsafe` could, and is
  denied. The dark theme is the e2e's `<page>-dark.png`. A browser that photographs the dark needs its server to
  start that way: a second server in `.mcp.json` given `--config` with `browser.contextOptions.colorScheme`, or a
  per-step `mcp:`.
- **The browser saves only under its output directory or the workspace.** Playwright MCP refuses any other
  path, so a step's own photographs reach its files directory by a copy, which a `dontAsk` step cannot make.
  They stay in `/tmp/playwright-mcp`, one directory for every step on the machine (plan §4b); the skill names a
  folder per run and step inside it.
- **The pictures `review` reads are the check's.** `implement`'s check runs `npm run e2e` into the directory its
  `screenshots` name, after it signs off and before `review` is filed, so each round's reviewer reads the
  change as it stands under the same paths. A photograph `implement` takes with the browser is not among them.

## Shipped: the decider screen

Plan §4 G. On a run waiting on you, `wf decide` prints three things between the verdicts and the closeouts:
what the result branch touched, the lesson line, and the whole diff of the check-affecting files. Beside
each step's check it prints what the step's session consumed. `src/radius.ts` is the pure part. `touchedBy`,
`sensitiveDiff` and `consumption` in `src/runner.ts` ask git and the engine. `decide` returns `used` off the
views it already read, so the screen still reads each task once (each view is a harness observe, plan §4b). The README section *What the
screen puts in front of you* is the account.

- `radius` reads `git diff --numstat <base>...<branch>`: a rename in its brace or plain form, a binary file's
  `-` counts as no lines, and a quoted path as its name. It refuses a line it cannot read, and the screen says
  that branch was not read. Groups are the base's npm `workspaces`, else top-level directories, else `(root)`.
- The agent-facing, check-affecting and lesson lists are globs written once and printed by `wf decide --help`.
  A lesson is `CLAUDE.md` or `AGENTS.md` at any depth, or a file in the root's `docs/` or a workspace
  package's. It is not any `docs/`, so an app's `src/routes/docs/` does not count. A flag before the run is refused.
  `--sensitive <globs>` replaces the check-affecting list for the files printed in full. It is refused when
  mistyped, when it has no glob, and when given twice.
- `used` sums the current task's attempts, a count only when every attempt measured it. It leaves out an
  attempt that never started, and reads the one in flight off the view. `cost` prints a number only when a
  runner was told one.
- `main(argv, e)` takes an engine, so `test/decide.test.ts` prints the whole screen over a real repository and
  a board settled by hand.

What it leaves:

- **A lockfile diff is long.** `package-lock.json` is check-affecting, so a branch that adds a dependency prints
  its whole lockfile diff above the closeouts. `--sensitive` narrows one screen. A default that names the
  packages a lockfile changed would read better, and is not built.
- **Only the current try is counted.** A step tried again or gone round consumed its earlier tries as well,
  under their own task ids (`tries` on the step's record). The line says what the try beside it used, not
  what the step cost in all.
- **No runner `wf` files on reports cost.** The engine's SDK runner does (`total_cost_usd`). The claude-bg,
  claude-detached and codex runners read transcripts and streams, which hold none.
- **The board shows none of it.** `apps/api` returns no radius, lesson or usage. Each is a call to the
  functions above.
- **The lesson line counts any change**, a deletion included. `CLAUDE.md +0 −12` is printed as what it is, and
  a person reads whether that is a lesson.
- **Steps are still listed in file order** (plan §4b sends a topological order in `workflow.ts` to G). The
  screen's steps read in `run.steps` order as before. Sorting at `wf start` is `workflow.ts`'s, not this screen's.

## 1. Forgetting a run (`wf rm`)

**Why.** Runs, worktrees and branches accumulate, and clearing them is manual: `git worktree
remove`, `git branch -D`, deleting `~/.agent-workflows/runs/<id>.json`.

**History.** A run built this once (`add-a-wf-rm-runid-verb-to-th-sd0s`), with review and response.
It was deleted unmerged on 2026-09-12: it predated the structured closeout and conflicted with master
in three files. One bug it found was salvaged as `0e7b02a`. Its branch tips, if it is ever wanted
back: implement `9efc52a`, review `8a2a31f`, respond `621fcff`.

**What its review taught — carry these into the rebuild.**

- Remove a worktree through git (`git worktree remove`, then `git worktree prune`), never `rm -rf`,
  or git keeps believing it exists.
- Keep branches by default. Delete a merged branch on request; an unmerged one only with an explicit
  force.
- Refuse a run with a step in flight. A step that is **ready but not yet filed** counts too: a pass
  may be filing it at that moment, and a pass that finishes afterwards must not recreate the record
  that was just removed.
- Commit what a step left before removing its worktree. Failed and stopped steps are handed off since
  the check shipped (open issue 2), but a worktree can still hold work written after the last pass.
- A locked worktree makes git refuse. Report it; do not delete the directory behind git's back.
- A run whose tasks the engine no longer knows must be removable (fixed by `0e7b02a`).

**The brief, to re-run on current master.**

```text
Add a `wf rm <runId>` verb to this repository: forget a run that is over.

The run store grows and nothing ever removes anything. Every run leaves a record in `runs/`, a git
worktree per step under `worktrees/<runId>/`, and a branch per step in the repository. All three
outlive any use for them, and there is no way to clear one out short of deleting directories by
hand — which leaves git's worktree metadata stale and the run record pointing at nothing.

What it should do:

- Remove the run's worktrees properly, so git does not keep believing they exist. There is a
  correct way to do this; find it rather than deleting directories.
- Remove the run's own record, and any file that belongs to it.
- Leave the branches alone by default, and take a flag to delete them too. A branch is where the
  work actually is, and deleting one that has not been merged loses it — so refuse to delete an
  unmerged branch unless the flag is explicit about forcing it. Say which branches you kept and
  why.
- Refuse to remove a run that still has a step in flight, and say what is running. Cancelling and
  forgetting are two different decisions and running one should not silently do the other.

Removing a run that does not exist, and removing one whose worktrees are already gone, are both
normal. Neither is an error; both should say what happened.

Write tests for the pure part — whatever decides what may be removed and what must be kept — in
the style of the tests already in `test/`. Run the whole suite before you commit.
```

## 2. A run that grows steps from a plan

**Registered.** The README, under the splitter:

> **The splitter proposes; it does not file.** It writes `PLAN.md` and stops. A run's steps come from
> a folder that is fixed when the run starts, so turning a plan into concurrent steps would mean
> letting a run grow steps while it is running — a decision about the run model, not something to
> slip in with an example. For now a person reads `PLAN.md` and starts a run per part.

**What it needs.**

- A way for a step to declare new steps. The closeout is the natural carrier: a plan is an artifact,
  and since `output:` shipped, a step's closeout can already have a declared shape the run reads.
  What is missing is a run that files steps from it.
- A run model in which steps can be added after the run starts, while `assess` stays a pure function
  of the steps it is given.
- A fan-in when the parts are not known in advance: which step merges them, and what it is told.
  Worktrees per concurrent step and merging at fan-in already exist.

## Engine-side work

Not agent-workflows features, listed so nothing is lost: waking the tick loop on harness registry
changes instead of a timer (agent-engine README), and the hkb migration
([agent-engine/docs/hkb-migration.md](../../agent-engine/docs/hkb-migration.md)).
