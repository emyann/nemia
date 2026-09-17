# Features to build

The features agent-workflows is still missing, in the order I would take them. Each says what exists
today, what the feature has to settle, and what earlier work already taught about it. Bugs and open
questions live in [agent-engine/docs/open-issues.md](../../agent-engine/docs/open-issues.md).

State as of 2026-09-16: the check (package C of `docs/plan-hold-the-bar.md`, hkb-v2), declared
outputs (package J), a step's files directory with `workflows/ui/` (U1), a browser for every Claude
step (the repository's `.mcp.json`), a worktree's own `node_modules` with `.worktreeinclude`,
trying a step again with `retries:` and `wf retry` (§4 F), going round again with `loop:`,
`rounds:` and `wf round` (§4 R), a step's `tools:` and `effort:` (§4 I) and its `disallow:` (§4b), the decider screen
(§4 G), looking as a skill with `workflows/ui/` as implement ⇄ review (§4 U2), an answer for a step
that asks (`wf retry --message`) beside a step that plans (`workflows/dev-planned/`, §4 Q), a run
that waits on a run (`wf start --after`, the first half of §4 P), and three guards made to hold (a session
the harness blocked tried again, `shipped` with nothing past the base, an ask file that is not an ask), and a plan as a folder of cards whose waiting runs are handed their parents'
closeouts (`wf plan`, the rest of §4 P), and telling a running step something (`wf say`, with its route and the session page's
prompt box: the steering channel's upper half), and six small items — `radius` reading workspace globs as npm does, a run's steps
in the order they run, `wf start --input`, artifacts collected from the workspace, a stale ask honoured, and `wf start` on a card
file (§6 items 6–9, 24, 25) — and a step gone quiet without its closeout reading `unsigned` again after the engine began
settling it `failed` — and a step's `budget:`, with what a step and a run cost on `wf ls` and `wf decide` (plan §6 item 29, its
workflow half), forgetting a run that is over (`wf rm`) — and an inbox of cards parked before they are started (`wf inbox`,
and its page on the board) — two small items from the plan's queue (§6 items 28 and 31), a cap on runs in flight (`WF_MAX_RUNS`) and
cards that start themselves (`wf inbox queue`) — and markdown rendered on the board, with a page for a card and for a step that
explains their keys — and a gate, a step's handoff that waits for a person (`gate: true`, `--gate`, `wf approve`), in the package — have
shipped.

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
  the brief. Built for a step waiting on a person, as `--message` (§4 Q, below); a step still running has no
  channel yet.
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
- **An ask carries no message**, as `wf retry`'s did not before `--message`: `wf round` says once more, not what to look at.
- **Nothing measures a reviewer that asks again for nits.** The cap and the person are the guard. The
  looping step is told that a finding worth a person's attention and not another round can go with
  `again: false`, and that is prose.

## Shipped: what a step may not have — `disallow:`

Plan §4b, "the reviewer's fence has two holes the brief covers". A step names the permission rules its session is
denied, `disallow: Bash(npm run build), SendMessage`. The engine carries them on the task as `disallowedTools`, beside
`tools`, and both Claude runners pass them as `--disallowedTools`. They reach `e.file` on the first filing, each try
and each round, as `tools:` does.

- `disallow:` is refused at load when it names no rule, when a comma is inside a rule's parentheses (the list is split
  on every comma), when an entry is not one rule (a list in brackets or quotes among them), and on codex, whose message
  names `permissionMode`. A quote inside the parentheses is legal, `Bash(git commit -m 'wip')`, so unlike `tools:` the
  comma check does not look in quotes: `tools:`'s check refused such a rule whenever another entry followed it. The engine's `file()` refuses a `disallowedTools` that is not a list of rules, and codex
  refuses one that denies anything rather than drop it.
- **Measured on `claude --bg`, the harness the reviewers run on** (`agent-engine/test/live.test.ts`, `AE_LIVE=1`,
  Claude Code 2.1.270). Two sessions in `dontAsk` with `tools: Bash`, each in a checkout whose settings allow
  `npm run build` and `npm run e2e`: the control ran both, and the one filed with `disallowedTools` naming them ran
  neither, refused by the deny's own message. By hand on `claude -p`, the implement list took `SendMessage`,
  `CronCreate`, `CronDelete` and `RemoteTrigger` from the session's tools (30 → 26).
- The shipped Claude reviewers (`workflows/dev`, `dev-build` and `ui`, and the package's `workflows/ui`) are denied
  `Bash(npm run build)` and `Bash(npm run e2e)`: `.claude/settings.json` allows both for implement's check, and both
  write into the workspace. The fence keeps them from those two commands; from the build and the e2e by another name,
  only their brief does (below).
- Every shipped `implement` is denied `SendMessage`, `CronCreate`, `CronDelete` and `RemoteTrigger`, which an
  unattended session had (measured, plan §4b) and no step needs.
- `wf decide` prints a finding's `where` as a place (`file:line`, `page · theme`, a string as it is, another object as
  its keys and values), where it printed a ui review's nested `where` as JSON. `placeText` in run.ts.

What it leaves:

- **The build and the e2e have two other ways in, which no deny closes.** `.claude/settings.json` also allows
  `Bash(npx turbo run test:*)` and `Bash(node --test:*)`, which the reviewer briefs name for the suite. `npx turbo run
  test build` runs turbo's `build` task, `apps/web`'s `vite build`, which rewrites `src/routeTree.gen.ts`; and
  `node --test apps/web/test/e2e/run.ts` runs the e2e, whose `main()` is called at top level, into `.e2e/` without
  `WF_ARTIFACTS`. Neither matches `Bash(npm run build)` or `Bash(npm run e2e)`, so a `dontAsk` reviewer may run both
  (read from the settings, `turbo.json` and `run.ts`; neither was run, both write into the workspace). A pattern deny
  would not close them: `node --test` takes a glob, and on Node 24 `node --test 'apps/web/test/**/run.ts'` ran a stub
  `run.ts`, a command with no `e2e` in it. The allows are what is loose, and narrowing them is for whoever owns
  `.claude/settings.json`, outside this change; until then the dev and dev-build briefs name both forms. A step
  outside `dontAsk` would need the same care.
- **The board does not show it.** The api's step spec and the inspector name `tools` and not `disallow`. → apps.
- **`ae` briefs have no `disallowedTools` key.** The engine's task has the field, and its CLI does not read one.
- **The live test needs a checkout Claude Code trusts.** Its first form made the checkouts in `os.tmpdir()`, and there
  a `--bg` session was not given the directory's settings: the control was refused with dontAsk's own message, so
  the fenced session's refusal proved nothing. The checkouts are now made inside the package. Run from this run's
  implement worktree, they were given their settings, and review works in that worktree, so the fence measured is
  the one review has. From a directory Claude Code does not trust, the control is refused, and its message says so.
- **The four tools implement is denied are measured by hand only**, on `claude -p`.

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
- **Both bodies name the skill's file**, `.claude/skills/look/SKILL.md`, for Read. A `tools:` line without `Skill`
  gives a session no Skill tool — measured with 2.1.270, whose session still lists the repository's skills — so
  `review`, told only "the look skill", could not load it (round 1's review found that). The test refuses a body
  that names a skill its step cannot reach: no Skill tool and not told the file, or told a file that is not there.
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
- **`wf decide` prints a ui finding's place as JSON.** `itemLines` (`src/run.ts`) heads a finding with
  `file:line` only when `file` is at its top level, so a `where` finding prints
  `- where: {"file":"…","line":12}` and then `what:`, and a page finding `where: {"page":"/workflows","theme":"dark"}`.
  Reading `where.file`/`where.line` and `where.page`/`where.theme` there is a few lines and a case in
  `test/run.test.ts`, outside this change's files. The board reads no finding's place, so it needs nothing.
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

## Shipped: a step that asks gets an answer, and a step that plans

Plan §4 Q. A step that needs a person already asked the right way: it signs off `outcome: blocked` with the
question in `needs`, which ends its session, puts the question on the record, and is drawn on the board.
Nothing carried the answer back. A person answered by cross-session message, which left no trace on the run
(§4b, *steering by message*), or with `wf retry --nudge`, which told the step what happened and not what they
said.

- `wf retry <run> <step> [--nudge | --fresh | --model <m>] --message "<answer>"` puts `message` on the ask
  file, beside the mode, and writes nothing else. Refused before anything is written (`messageRefusal`, from
  the CLI's parse and from `retryRefusal`): an empty or blank message, and `--message` with `--recheck`, which
  files no session to read it; in the CLI also a `--message` with no text, one followed by nothing but one of
  the verb's own flags (the answer left out; `--message=<answer>` gives such an answer), or one given twice.
  Any other next argument is the answer, `--flag stays` included. A message to a step
  that did not sign off blocked is allowed, and the usage text says what the flag is for.
- The tick honours the ask once, as before, and carries the message through `Retry` and `RetryBriefing` into
  the brief: `## Your answer` inside `## Try <n>`, the text as written in a fence longer than any run of
  backticks in it (`fenced`, which `## From <step>` data now uses too), after the paragraph that says where
  the step is and before `## What the check said`. The sentence saying whose word the try is names
  `--message`. A try without one is briefed exactly as before. The engine is untouched: the answer travels
  in the brief, and needed no field on the task.
- The tick holds a hand-written ask file to the verb's word: a message that is not text, is blank, or rides on
  a recheck is noted and not honoured. An ask file without `message`, as every one before this was, reads as
  it did.
- The record keeps no message. `wf ls` and `wf decide` read it off the ask files, waiting and in `done/`
  (`readAnswers`), and `answerOf` counts one only for the try it names, filed the way it asked. `wf ls` says
  `try 2 asked (--nudge, with your answer)`, then `try 2, nudged on your word, answered`. `wf decide` says the
  same on the step's line and prints `try 1 needs:` and `your answer:` under it; under a blocked step's
  `needs` it prints `to answer it:  wf retry <run> <step> --message "<answer>"` (`answerLines`). The offers
  under *once more* are unchanged.
- `workflows/dev-planned/` is `plan → implement ⇄ review`. `plan` is on review's fence (read-only tools and
  Bash in `dontAsk`, the build and the e2e denied by name), with `output: plan.schema.json`: `approach`,
  `files` with a line each, `steps`, `risks`. It signs off `done` with the plan when the brief reads one way,
  and `blocked` with the question in `needs` when it reads two materially different ways, or asks for
  approval. `implement` is dev's with `after: plan` and `input: plan`; `review` is dev's. `workflows/dev`
  stays the default.

What was measured:

- The suite, at shipped defaults: a refusal test for each refusal above, at the verb, the CLI and the tick; the
  brief with an answer compared whole against the brief without one; `readAsks` on an ask file written before
  `message`; the decide screen end to end, from the blocked sign-off to the answered try; and `dev-planned`
  loaded from the repository, its graph and plan's fence asserted, with a guard shown to refuse a plan given a
  tool that writes.
- The first run of the whole check from the root failed one api test. The offer for a blocked step had carried
  `--message "<answer>"` after its command, and `apps/api/test/decision.test.ts` pins the offer's shape
  (`:  wf retry <run> <step>  (--fresh`), because the board cuts its command out of the line. The package's
  suite cannot see that test. The offer went back to what it was, and the command moved under the question.
- Round 2's review found `--message` refusing any answer that started with `--`, so the brief's own example
  question ("Rename --flag, or keep it?") could not be answered by naming the flag. The next argument is now
  the answer, and a test gives four such answers through the CLI and reads them off the ask file.
- Round 2's review also found the answer composed raw. A snippet that left a fence open made one code block of
  everything after it, up to the brief's next fence. Measured on a step that signed off blocked, that was both
  contracts, the check's and the closeout's, which on a nudge are the only instructions left; on a refused check,
  the check's own fence closed it, and what the check said was hidden. It is fenced now, and a test reads the
  brief's headings outside fences in both cases, with the answer fenced and raw.
- No session has run `dev-planned`. Whether `plan` asks at the right moments is its brief's prose until a run
  shows it.
- One observation against §4 Q's measurement: this step's own session, filed by `wf` on Claude Code, listed
  `AskUserQuestion` among its tools and `EnterPlanMode` among its deferred ones. Neither was called, since
  nobody sits beside a step to answer, so whether either works headless is still unmeasured. Nothing here
  depends on it: `blocked` ends the session rather than holding one open for nobody.

What it leaves:

- **The plan's paragraph is `approach`, not `summary`.** The brief asked for `summary`, and every closeout
  already has one, written for the person who decides; the parser refuses a declared field that reuses it.
- **The board's answer box.** `retry(e, id, step, { mode, model, message })` and the ask file are what it builds
  on: a box on a blocked step in the Decide section, posting to a route guarded as `POST /api/runs` is. The api
  reads no answers yet. Its `listing` and `tryNote` calls pass none, so the board's note never says `answered`,
  and its once-more command, cut from the offer by `ONCE_MORE`, is `wf retry <run> <step>` without `--message`.
- **The steering channel.** A message reached a step that was over and waiting, not one still running. *Shipped
  since, below: `wf say`*, over the engine's `say`, which is the way to reach a live session `wf` did not have. The
  record is the engine's journal of the task rather than an ask file, and `wf decide` prints it.
- **`wf round` carries no message.** A person's once more still says nothing about what to look at.
- **The question beside the answer is read from the engine.** `wf decide` views the task of the try before the
  answered one for its `needs`: one more view per answered step, and no question printed if the engine has lost
  that task.
- **A plan is not steps.** `plan`'s `steps` are prose for one `implement`; a run that files steps from a plan
  is still §1 below.

## Shipped: the steering channel — `wf say`

Plan §6 item 3, the upper half, over S3's `Engine.say`. A step steered mid-flight by cross-session message left
nothing on its run (§4b, *steering by message*), and the words were typed into a terminal against an engine task
id, away from the session page where the conversation is.

- `wf say <run> <step> "<words>"` calls `Engine.say` on the step's current try's task, which hands the words to
  the session through its harness and journals a `said` entry. The verb writes nothing of its own. Refused first
  in the package's words (`sayRefusal`: no such step, a cancelled run, a step not filed, a task settled, which
  points at `wf retry --message`), then in the engine's, verbatim.
- The words are read back off the engine's view: `wf ls` notes `said to 2×` beside the try the step is on
  (`saidCount`, `saidWord`), and `wf decide` prints each thing said to every try under the step, before its
  closeout, with its time and the words fenced (`saidLines`).
- Open issue 16's fix in this layer: a try or a round that continues a session carries what was said to the last
  try's task as `## Said to your session`, inside `## Try <n>` or `## Round <n>`, before `## Your answer`.
- `POST /api/runs/:id/steps/:step/say`, guarded as the retry route is, calls `say()`: 409 for a refusal, 502 for
  words the harness did not take, 202 with the entry. The step's detail carries `said`, and the session page draws
  each as a turn of its own, beside the conversation, under which a prompt box sends more.

What it leaves:

- **Taken is not read** (engine open issue 12). `said` means the harness took the words, and the record says
  nothing more; Claude Code can still set them aside.
- **A new session is handed none of it.** `--fresh`, and a nudge with no session left to continue, start without
  what was said to the last try, as they start without its conversation. A person who wants it said again says
  it with `--message`.
- **`wf ls` counts the current try; `wf decide` reads every try.** An earlier try's task is viewed once more for
  it, as its question is for an answered try.
- **`wf decide` prints nothing per step while the run runs.** Words said to a step of a run still running are in
  `wf ls`'s note and on the session page until the run waits on a person.
- **The box closes on the board's last read of the step.** Read every five seconds, so a session that ended since
  is refused by the api when words are sent, and the refusal is shown; nothing is said.
- **Only the session page draws what was said.** The inspector's Activity tab folds the transcript alone.
- **An arrival is known by its words.** The session page takes a system line whose text is what was said, or ends with
  it after Claude Code's line for a peer's message, written no more than 5 s before the entry, as the session's record of
  the words reaching it, and draws the words once (`heardIn`). A Claude Code that wrote them otherwise would draw them
  twice again, and lose nothing.
- **Codex and `claude-detached` steps have no channel**, and the engine refuses them in its words.

## Shipped: a run that waits on a run — `wf start --after`

Plan §4 P, its first half. All day a person had done the sequencing by hand: start B once A is on main.
Now the run holds that as a fact. The run boundary is the human gate, so a run's dependents start when
the run has **shipped**, meaning its own `wf decide` says `shipped`: not running, not cancelled, and its
result branch on the base branch as `isShipped` reads it. Its steps saying they are done does not count. The engine is untouched: waiting on a run is
a fact of the layer above it.

What was built:

- `wf start <brief> --workflows <dir> --repo <r> --after <runId> [--after <runId> ...]` freezes
  `after: string[]` on the record, the way the workflow is frozen. The field is written only when given, so
  a run without `--after` writes the record it always did. Every record from before reads as waiting on
  none.
- `runReady(run, shipped)` in `run.ts` is pure and sits beside `assess`. It rests on `waitingOn`, which
  returns the runs in `after` that have not shipped. `shipped` is never called for a run that is not
  `gated`: one with no `after`, a cancelled run, or a run with any step filed on any try (`hasStarted`: a
  step a round moved behind counts). That is how a started run's parents are never read again.
- `parentOf(e, id)` in `runner.ts` reads a parent on every pass that asks, once per pass (`parentsOf`). It
  counts the parent shipped exactly when `decision`, the function behind the parent's own `wf decide`, says
  `shipped`: not running, not cancelled, and every result branch on the base branch. Git is asked first;
  the engine's view of the parent's tasks is read only once its branches are on the base. A result branch
  git no longer has is `gone`, and not shipped. `wf start` reads only the record and git (`parentRecord`).
- `advance` files a run's roots only when `runReady` holds, and nothing else is gated. In the pass that
  files the roots of a run that waited, it reads the tip of the base branch into `baseRef`. Every worktree,
  check and diff of that run is then cut from a base that has its parents' work.
- A finished run's own tick records its result branches' tips on its record, as `tips` (`tipBranches` and
  `tipsSeen`, pure): only for a run that succeeded or failed, never one running or cancelled, and written only
  when a tip moved. A branch git no longer has keeps the tip last seen. When a branch is gone, `isShipped`
  asks git whether its recorded tip is on the base, so a parent merged and cleaned up still ships. That
  reading is the same for the parent's own `wf decide`, the board's decide and the gate.
- `wf start` reads `--after=<runId>`, `--repo=<r>` and `--workflows=<dir>` as well as the spaced forms, and
  refuses any other argument: a flag it does not take, a misspelt one, a value flag with no value or given
  twice, and a second brief. Before this, a misspelt `--after` was dropped, and the run waited on nothing.
- What each command shows for a waiting run:
  - `wf ls` shows `waiting on <run>` on each root, through `listing`'s new `waits` argument; a step that
    waits on a root still says `waiting`. A parent that will never ship without a person gets a reason in
    brackets: `(cancelled)`, `(no such run)` or `(<branch> gone)`. For those it also prints
    `→ waiting on you: … — yours to resolve: wf cancel <run>, or start the work again without --after <parent>`
    (`waitAdvice`).
  - `wf decide` says the same two lines and offers nothing else.
  - `wf tick` adds the wait to the run's line.
  - The same list is available to code as `Advanced.waiting`, `Listing.waiting` and `decide().waiting`.
- `wf start` refuses before anything is written, and the refusal names the fix (`afterRefusal`, pure):
  - an id given twice;
  - a run the store does not have;
  - a run on another repository;
  - a run started `--no-worktree`, which has no result branch to ship;
  - a run on another base branch, since the child would never start from a base that has its work;
  - a cancelled run, which `wf decide` never calls shipped, or one whose result branch is gone and whose tip
    git cannot find on the base.

  The CLI also refuses `--after` with no run after it.

What was measured:

- Pure tests in `test/run.test.ts`:
  - a legacy record and a run with `after: []` read as ready without a parent being read;
  - an unshipped parent is not ready, pass after pass, and one shipped parent of two is not enough;
  - a started run, including one a round left with no step filed, is ready without a parent being read;
  - a cancelled run reads no parent;
  - the words, including `waitAdvice`, compared whole;
  - `listing` on a fan-in's roots, on a cancelled run and on a started one;
  - each refusal of `afterRefusal`, by name;
  - which branches a pass records tips for (a finished run's result branches only), that an unchanged tip
    writes nothing, and that a tip is kept once its branch is gone.
- Store tests in `test/store.test.ts`, on a real git repository in a temp dir with `start` and `advance`
  run for real against a fake engine board:
  - A child of a parent whose step is still running files nothing, pass after pass, with and without a
    commit on the parent's branch. `wf ls` says `waiting on <parent>`, and `decide` returns the wait with no
    offers. Merged with `--no-ff` while the parent still runs, the parent's `wf decide` says running and the
    child files nothing. Once the parent signs off, its `wf decide` says shipped and the next pass files the
    roots: `baseRef` is the merge commit, and the child's worktree holds the parent's file.
  - A parent whose step signs off with no commit past its base: its `wf decide` says shipped, the child's
    next pass files its roots, and `wf start --after` it is accepted. Parent and child share one board, as
    they share one engine.
  - A parent merged, its tip recorded by its own pass, then its worktree removed and its branch deleted with
    `git branch -d`: its `wf decide` still says shipped, a child that started on the merge files `review`, one
    that had not files its roots, and `wf start --after` it is accepted.
  - The diamond's D, after B and C: B is merged and its branch deleted while C is still running. D says
    `waiting on C` alone, pass after pass. Once C signs off and is merged, the next pass files D's roots on a
    base with both parents' files.
  - A parent dropped with `git branch -D` after its tip was recorded, and one merged and deleted before any
    pass saw it finish: both read `(<branch> gone)`, the child files nothing, and `wf start --after` either one
    is refused.
  - Through the CLI, `wf start` refuses `--after=` with no run, `--afer`, `-a`, `--repo` twice and a second
    brief, with nothing written, and writes `--after=<runId>` as `--after <runId>`.
  - A cancelled parent: nothing is filed, and still nothing once its branch is merged. Through `main`,
    `wf ls` and `wf decide` print exactly the lines above. Then `cancel` on the child leaves it waiting on
    nothing.
  - Every `wf start` refusal, through `start` and through the CLI, leaves the store's file count unchanged.
    `--after` twice with different runs is written in order, and a run without it has no `after` key.
- `npm test && npm run typecheck` from the root exited 0. agent-workflows ran 313 tests, 11 of them new: 312
  passed, and one was skipped, the live browser test that needs `AE_LIVE=1`. agent-engine ran 239 (235 passed,
  4 live tests skipped), api 89 and web 116, all passing.
- The CLI itself, in a throwaway `WF_ROOT` over a throwaway repository, with the parent's branch recorded
  and committed to by hand. It covers `wf start --after=<runId>` with `--workflows=` and `--repo=`, `wf ls`,
  `wf decide`, six refusals (a duplicate, an unknown run, `--after` with no id, `--afer`, `--after=`, an
  unquoted brief) that leave no record, the merge, and a cancelled parent. The parent's step was never filed,
  so after the merge its own `wf decide` says
  `still running: implement` and the child still says `waiting on` it. Kept as `wf-start-after.txt` in the
  step's artifacts. No tick ran there: a real engine would have filed real sessions, so the gate's filing is
  measured on the fake board only.
- Found while building: a result branch is cut at its run's base, which is on the base branch, so `isShipped`
  answers yes for a branch nobody has committed to. Read that way, a child of a one-step run would start the
  moment the parent's step was filed. Round 1 guarded it with a rule of its own, work past the base, and
  review found that rule stricter than `wf decide`. A parent that finished with nothing to commit read
  `shipped` on its own `wf decide`, while its child waited for ever under a plain `waiting on <parent>` with no
  reason and no way out, and `wf start --after` it was accepted. The gate now asks `decision` itself, so the
  two cannot disagree, and a store test signs a parent off with no commit.
- Found while building: whether a deleted branch was merged cannot be read.
  - `git merge-base --is-ancestor` on a branch that no longer exists exits 128.
  - `git branch -d` refuses a branch a worktree uses.
  - This repository's merges carry their own messages ("Merge Q1: …"), so neither the merge commit nor main's
    reflog names the branch.

  Rounds 1 and 2 stopped there: a branch deleted before a child's roots were filed read not shipped. Round 3's
  review found that strands the diamond's D, whose last parent can take hours in review while the first is
  cleaned up, and the request's own test said a parent merged and then deleted still files. So each finished
  run's tick records its tips. That is a fact about the parent, written by the parent's own tick, and the gate
  still asks git about it on every pass.
- No real session has run as a child. A real merge has never released a real step.

What it leaves:

- **The Factory's graph of cards** — done by P2 (apps, 2026-09-14): `RunSummary` and `RunDetail` carry `after`
  and `waiting` (`waitsOf`, `waitWord`, `waitAdvice`, read once per request off the same views), `moving` is false
  for a run waiting on a run that never ships, the Factory draws the edges and keeps a group joined by `after`
  layered, and the start form takes *after*, with `afterRefusal`'s sentence as its refusal. The api reads whether
  a waited-on run never ships off `Wait`'s contract because `neverShips` is not exported: export it, and that
  becomes an import.
- **A tip is recorded only by a tick.** A run whose branch is merged and deleted before any `wf tick` or `wf up`
  pass saw it finish has no tip, and its children read `(<branch> gone)` until a person starts them again
  without that `--after`. The same happens to a result branch rewritten after its tip was recorded and then
  deleted. With `wf up` running, a run is seen within a pass of finishing.
- **A parent that finished failed with nothing committed has shipped.** Fixed in `decision`, below (*Shipped: three
  guards made to hold*): a branch with nothing past its base ships only a run whose steps all succeeded, so such a
  parent is decided, and its child waits.
- **A parent's tasks are viewed twice a pass** while a child waits on it and its branches are on the base: once for
  its own pass, and once for the gate.
- **A parent is read once, on the way in.** A parent that ships a second change after its child started is
  not waited on again, by design. Later work is a new run with its own `--after`.

## Shipped: three guards made to hold

Plan §6 item 10 and two findings of §4b. Each was a guard that was inert or wrong.

### A session the harness blocked can be tried again

On 2026-09-13 and again on 2026-09-14, a `--bg` session stopped on "Could not refresh your login because another
Claude Code process is refreshing it". The engine read it `needs-human`, and the step had no closeout. `stepStatus`
called it `running`, `retryable` offered nothing, and `wf retry` refused it as still running. The only remedy was a
hand `ae stop` and then `wf retry`, and the board could only print those two commands.

What was built:

- `retryable` takes the harness's word: `harnessBlocked`, the engine's `needs-human`, read off the views the pass
  already has. A step that reads `running`, whose session is blocked and which signed nothing, may be asked
  `--nudge` or `--fresh`, with a model or an answer if you like. `--recheck` stays refused, in words of its own,
  since nothing of the step was checked. A session still working, and one that signed off and runs on, are refused
  as before. `stepStatus` and the vocabulary are unchanged: the step still reads the engine's `needs-human`.
- `wf retry` writes the ask as it writes any other. The tick reads the try as due, with `stopFirst`. It calls
  `e.stop` on the step's task, unless the engine already holds a stop request for it, and files nothing. On a later
  pass the engine has settled the task `stopped`, the same ask is due as a stopped step's, and the try is filed. A
  nudge continues the session, since the settled task keeps the session's id. Nothing is carried between the passes:
  the stop request is on the engine's record, and the ask is in its file.
- What each command says:
  - `wf ls` puts `try 2 asked (--nudge) — stopping its blocked session, then the tick files it` beside the step's
    `needs-human`.
  - The pass that asks for the stop says so in its notes, once.
  - `wf retry` prints that the next tick stops the session and files the try once it has stopped.
  - `wf decide` names the step once in `still running`.
- **A caller opts in.** `retry()` takes the harness's word only when its caller passes `{ stopBlocked: true }`. The
  CLI does, and since B8 (apps, 2026-09-14) so does the board's `POST …/retry`, whose `held` test now expects the 202
  and `stopFirst: true`; a caller that leaves the option out is refused as before, and a test holds that.

### `decision` no longer says `shipped` for a branch with nothing past its base

A result branch is cut at the run's base, so git calls a branch nobody committed to "on the base branch". A terminal
step that ended failed, blocked or unsigned with nothing committed left its branch there, and `decision` called the
run shipped. `wf decide` hid the failure, and a run waiting on it with `--after` started.

- `isShipped` now says which yes it is (`Shipped`). It returns `false` when the branch is not on the base branch,
  `true` when commits past the run's base are on it, and `'unchanged'` when there are none. The last is asked with
  `git merge-base --is-ancestor <branch> <baseRef>`, and a base git cannot read counts as `'unchanged'`, so such a
  run goes to a person. A deleted branch is asked by its recorded tip, as before.
- `decision` calls a run shipped on `true` whatever its steps said: a person merged real work. On `'unchanged'` it
  calls it shipped only when the run's outcome is `succeeded`. It stays pure, and asks each branch once, stopping at
  the first that is not on the base.
- The api's call, `(branch) => isShipped(run, branch)`, compiles unchanged and gets the fix: the board's decide, a
  parent's own `wf decide` and a child's gate read the same.

### An ask file that is not an ask is refused by name

A file at `runs/<id>.asks/retry-<step>-<n>` that does not read as an ask, such as `{}`, is honoured by no pass, and
`wf ls` shows nothing asked. Yet `retry()` refused to write over it with "try n of step is already asked for. Wait
for it", and the wait would have been for ever. Now `retry()` names the file, says why it is not an ask, and says to
delete it and ask again. `wf round` had the same shape with `round-<step>-<n>` and got the same fix.

What was measured:

- Pure tests in `test/run.test.ts`:
  - A step whose task runs, harness-blocked and unsigned, is accepted for `--nudge`, `--fresh`, `--model` and
    `--message`, and refused for `--recheck` with the exact sentence.
  - Refused as before: a session still working, one that signed off and runs on, and a caller that gives no word
    of the harness.
  - `assess` has the try due with `stopFirst`, and without the harness's word nothing is due. `decision` names the
    step once. `listing` says the words above for `needs-human` and nothing for `running (working)`.
  - Once the task is `stopped`, the same ask is due without `stopFirst`.
  - `decision` on a branch with nothing past its base reads failed for a step failed or stopped, and blocked for one
    that signed off blocked or ended unsigned. It reads failed for a check that refused, and shipped once every step
    succeeded. Merged work is shipped though a step failed.
  - A fan-out with one branch merged and one unchanged is decided when a step failed, and shipped when none did.
    Git is asked once per branch, and not past the first branch off the base.
- Store tests in `test/store.test.ts`, at shipped defaults on the fake board, with `start`, `advance`, `retry` and
  `main` run for real:
  - A step whose view says `needs-human`, with no closeout: `retry()` without the option refuses it as still running,
    and writes nothing. `wf retry` through `main` writes the ask and prints that the tick stops the session first, and
    `wf ls` carries the note.
  - The first pass stops the task once, files nothing, leaves the record byte for byte, and keeps the ask.
  - Two more passes, one on a board read afresh as after a restart, stop nothing more and file nothing.
  - Settled `stopped`, the next pass files try 2 with `resumeFrom` the session, a brief that starts `## Try 2` and
    says `wf retry --nudge`, and the ask consumed. A fourth pass files nothing.
  - Through `main`, `wf retry` refuses a session still working (nudge and fresh), `--recheck` on a harness-blocked
    step, and one that signed off and runs on. Each is exit 2, with no ask and no stop.
  - A one-step parent whose step failed with nothing committed: git says its branch is on the base, and its
    `wf decide` says `failed`. `parentOf` says not shipped, and its child files nothing for three passes.
  - A parent whose step failed after committing, merged by a person with `--no-ff`: its `wf decide` says
    `shipped`, and its child files its roots. The existing test of a parent that signed off with nothing to commit
    still passes: shipped, and its child starts.
  - `{}` at `retry-implement-2`: `wf ls` shows nothing and a pass honours nothing. `retry()` refuses with the file's
    path, why and `rm`, and leaves the file as it was. Once the file is deleted, the ask is written and honoured. `[]`
    at `round-review-2` on a loop out of rounds is refused by `round()` the same way.
- `apps/api`'s decision and asks tests pass against these changes, and `apps/api` typechecks unchanged.
- `npm test && npm run typecheck` from the root exited 0. agent-workflows ran 323 tests, 6 of them new: 322 passed,
  and one was skipped, the live browser test that needs `AE_LIVE=1`. agent-engine ran 239 (235 passed, 4 live tests
  skipped), api 98 and web 126, all passing. The log is `root-check.txt` in the step's artifacts.
- No real session has been blocked and then tried again: the refresh race cannot be reproduced on demand. So the
  stop and the filing are measured on the fake board only, with a view that carries `stopRequested` once a stop is
  asked. Nobody has measured what `claude-bg` reports between `claude stop` and the engine's settle. If its word is
  not `needs-human` for a pass, the ask is not due on that pass, `wf ls` shows no note, and the pass after it files
  the try.

What it leaves:

- ~~**The board refuses what `wf retry` takes.**~~ Done by B8 (apps, 2026-09-14): the POST passes the option, the
  banner offers Continue, and `judge` hands `assess` and `decision` the package's `harnessBlocked(views)`.
- **`wf decide` offers no `wf retry` for such a step.** A run it keeps running reads `still running`. In a fan-out
  whose sibling failed, `retryLines` is not given the harness's word, so `wf ls` is where the step says it can be tried.
- **`waitingOnYou` does not name a harness-blocked step.** The board says "blocked by the harness" from its own field.
- **The try's brief says its session "was stopped before it signed off".** On the pass that files it, the tick cannot
  tell that the harness had blocked the session, since nothing is carried.
- **Only a person's ask stops a blocked session.** The tick does not recognise the login message and resume the
  session by itself, which was §4b's first idea, and nobody has filed a Claude Code report on the refresh race.
- **A child of a failed parent with nothing committed waits with no reason given.** It says `waiting on <parent>`
  and "nothing to decide yet", though the parent's own `wf decide` has something to decide: `waitAdvice` does not
  read a parent's outcome.

## Shipped: a plan as a folder of cards — `wf plan` — and a waiting run handed its parents' closeouts

Plan §4 P, its second half. A person who describes a plan in prose (A, then B and C, then D) writes it as files and
starts it whole. The tick does the waiting, and every card is still a decision at its own `wf decide`. A run that
waited is told what its parents concluded, without a person pasting it. Nothing in the engine, and nothing in apps/.

What was built:

- **A card is a markdown file.** `parsePlan(files)` in the new `src/plan.ts` is pure. Handed the folder's entries, it
  reads each `<card>.md` as a card named for its file, with exactly two frontmatter keys, `workflow:` and `after:`
  (card names, comma-separated), and its body as the brief. `README.md` is skipped. It refuses by name, with the fix:
  - a key a card does not have, set twice or to nothing, and a line that is not `key: value`;
  - no `workflow:`, and an empty body;
  - an `after:` naming no card, or one card twice;
  - a file that is not `.md`, a folder inside the plan, and a folder with no card.

  The frontmatter is split as a step's is (`splitFrontmatter`, now shared), so a byte-order mark, `\r\n` and a block
  that never closes read the same for both.
- **`planOrder(cards)`**, pure, puts parents first, and goes by name among the cards that may go next. It refuses an
  `after:` naming a card the plan does not have or the card itself, and a cycle, named round:
  `a.md, d.md, b.md wait on each other — a after d, d after b, b after a`.
- **`workflowFolder(given, from, repo)`** in `workflow.ts` finds a workflow by a path from where it is written, or,
  when nothing is there and the value is a bare name, under `<repo>/workflows/`. `wf start --workflows` used to take
  only a path. It now takes a name too (`--workflows dev`), and a card's `workflow:` is read the same way, from the
  plan folder. A name found nowhere is refused, naming both places and the workflows the repository has.
- **`wf plan <folder> --repo <r>`** calls `startPlan` in `runner.ts`:
  - It reads the folder (`readPlan`).
  - Before the first `start()`, it finds every card's workflow and asks of it what `start` refuses (`stepsToStart`,
    split out of `start`). A refusal comes back behind the card: `b.md: \`workflow: deb\` — no workflow folder at …`.
    A `.worktreeinclude` that `start` would refuse is refused once, up front.
  - It starts each card in order, `after` the run ids of its parents' runs. That is the record `wf start --after`
    writes, so the tick, `wf ls`, `wf decide` and the board need nothing new, and nothing else is written.
  - It prints one line per card (`planLines`): the card, its run, its workflow as the card names it, and what it waits
    on, by card and by run. Then `wf start`'s `run 'wf tick'` line.
  - A `start()` that refuses part-way stops the plan (`PlanStarted.stopped`). The runs it started stand.
    `planStopped` names them, the card and the refusal, and prints `wf start <card> --workflows <folder> --repo <r>
    --after <id>` for each card left, parents first, with `<c's run id>` for a parent not started yet.
- `wf plan` takes `--repo`. It refuses `--after`, `--workflows` and `--no-worktree` by name, since the folder says
  each, and anything else as `wf start` refuses it: `startHow`'s loop became `readFlags`, which both verbs read their
  flags with. `wf start`'s refusals read as they did, and their tests pass unchanged. `wf plan --help` shows a card.
- **`## From run <id>`.** On the pass that files a gated run's roots, the pass that reads `baseRef`, `advance`
  gathers `parentCloseouts`: for each parent, its record, the first line of its brief, and each terminal step's
  closeout off the engine's view of its current try, read as `wf decide` reads one (`closeoutOf`). `composeBrief`
  takes them as its last argument and stays pure.
  - Each root's brief gains a section per parent, right after *What was asked for*: the first line, then for each
    terminal step its `summary` and the fields its `output:` declares, as `## From <step>` prints them. Each is fenced
    (`fenced`).
  - A parent whose record or workflow cannot be read, a step never filed, a task holding no closeout (a failed step
    whose work a person merged) and a closeout that does not parse each say so and why, and the roots are filed all
    the same.
  - Steps after a root, tries, rounds, and runs without `after` are composed as before.
- **Whether a summary may travel**, which the list of what to build had left open: it does, and `fromRunSection` says why. Between steps
  the summary is the author's account of work nobody has judged, and it would anchor whoever judges it. A shipped
  parent's summary was read by a person beside its diff before they merged the work, so one run later it is the record
  of what is already in the workspace.

What was measured:

- Pure tests in `test/plan.test.ts` (7):
  - the diamond, parsed from its files in any order, with the README skipped, and a Windows file read as the same card;
  - `planOrder` parents first, and by name among the cards that may go next;
  - each refusal above by name, including a cycle of three with a card waiting on it and a root beside it, named
    without either, and `planOrder` refusing a cycle on its own;
  - `planLines` compared whole, and `planStopped` compared whole, with runs started and with none.
- `test/boundary.test.ts` holds `plan.ts` to reading no disk, spawning nothing and not importing `runner.ts`.
- `test/workflow.test.ts` (2): `workflowFolder` by name, by a relative path from the right folder, by an absolute path,
  and a folder where it is written found before the repository's of that name. Refused, each message compared whole: a
  name the repository does not have, a path that is not there, a path that is never read as a name, a file, and a
  repository with no `workflows/`.
- `test/run.test.ts` (1): `composeBrief` handed three parents — one whose summary holds a fence and whose step declares
  a field, one whose step has no closeout, and one whose record cannot be read — compared as text. With none, and with
  `[]`, the brief is exactly what it was; with them, nothing before or after the sections changes.
- Store tests in `test/store.test.ts` (7), on a real git repository, with `start`, `advance`, `startPlan` and `main`
  run for real against the fake board:
  - `wf plan` on the diamond through `main`: four runs and no other file in the store, printed parents first, each
    `after` the right ids in the card's order, the briefs the cards' bodies, and workflows found by name and by a path
    from the plan folder. `wf ls` says D is `waiting on <B's run>, <C's run>`, and a pass files A's step and none of the
    others'.
  - A folder whose second card's workflow does not load: refused with the workflow's own refusal behind `b.md`, and no
    run written, not even A's. The same for a workflow that is not there, a cycle, a folder inside the plan, a folder
    with only a README, and no folder.
  - `--after`, `--after=`, `--workflows`, `--no-worktree`, `--repos`, `--repo` twice, `--repo` and `--repo=` with no
    value, and a second folder: each refused by name, with no run written.
  - `wf start --workflows <name>` starts `<repo>/workflows/<name>`, and a misspelt name is refused whole.
  - A `start()` that throws on the third card: A and B stand with their edges, and `stopped` names C, its error, and D.
  - A child of two parents, merged, one of them with a terminal step that declares `output:`. The child's root brief
    has `## From run <parent>` right after the child's brief: the parent's first line, its summary, and `findings` as
    JSON. The second parent's section has its summary and no declared block. The first parent's own root brief, a run
    without `after`, has no such section, and neither has the child's `review`, filed after its root.
  - Two parents a person merged after their steps failed, one with no closeout and one whose closeout does not parse:
    the child's roots are filed, and each section says why nothing can be given.
- Each of the three code commits was typechecked and tested on its own tree: 332, 337 and then 340 tests in
  agent-workflows, 17 of them new, all passing but the live browser test, which is skipped without `AE_LIVE=1`.
- The CLI itself, in a throwaway `WF_ROOT` over a throwaway repository with a `workflows/dev`. `wf plan` refused
  `--after`, a cycle of three and a misspelt `workflow:`, with no run written. It then started the diamond and printed
  its four lines, and `wf ls` read D as waiting on B and C. Kept as `wf-plan.txt` in the step's artifacts. No tick ran
  there, so no real session was filed, and no real child has been handed a real parent's closeout.
- `npm test && npm run typecheck` from the root exited 0. agent-workflows ran 340 tests, 17 of them new: 339 passed,
  and one was skipped, the live browser test. agent-engine ran 239 (235 passed, 4 live tests skipped), api 98 and web
  126, all passing. The log is `root-check.txt` in the step's artifacts.

What it leaves:

- **The Factory's graph is P2's** (apps): the api does not carry `after` yet (the `--after` section above says what it
  needs), and a plan is drawn only once it does. **A plan's own page on the board** is later: today a plan is its runs,
  and nothing groups them.
- ~~**A card started by hand carries its frontmatter.**~~ Done by the six small items (§6 item 25, below): `wf start` on a card
  file starts its body, and `planStopped` quotes the paths it prints.
- **A card cannot wait on a run outside its folder.** `after:` names cards; to wait on a run already started, start that
  card by hand with `--after`, as the refusal of `wf plan --after` says.
- **The parents' closeouts reach only each root's first try.** A try `wf retry --fresh` files later, or a new session a
  round files, is not given `## From run <id>`: the parents are read once, on the pass that files the roots.
- **Only a parent's terminal steps are read.** What an earlier step of the parent declared, a plan its implementer
  consumed say, is not handed on.
- **Starting a plan twice starts every card twice.** Nothing records that a folder was started.

## Shipped: six small items

Plan §6 items 6, 7, 8, 9, 24 and 25, one commit each, with the §4b findings they came from. Nothing in the engine, and
nothing in apps/.

### `radius` reads the base's `workspaces` as npm does

G's round-2 review found that the decider screen took the base's `workspaces` globs as written. `./packages/*` became a
regexp that no path git prints could match, so every package's changes fell into one `packages` group, and nothing under
`./packages/*/docs/` counted as a lesson. This repository writes `packages/*`, so it never showed here.

What was built:

- `workspaceGlob` drops a leading `./` and a trailing `/`, and everything in `radius.ts` that reads a workspace goes through
  it: `groupOf` (now `packageOf`, then a top-level directory), `lessonGlobs` and the new `isLesson`.
- A glob with `**` is not refused, since the repository's `package.json` is not ours. `deepWorkspaces` names such globs as
  written, `radius` carries them, and `radiusLines` adds a `workspaces` line under the branch that names each one. Each file
  still counts once. Its group is the outermost directory a glob names. It counts as a lesson only in that package's own
  `docs/`, since `packages/**/docs/` would also take a `docs/` in a package's source, or one directly under `packages/`.
- `wf decide --help` says both, under the lists.

What was measured:

- Two pure tests in `test/radius.test.ts`:
  - `./packages/*` groups `packages/x/src/a.ts` under `packages/x` and counts `packages/x/docs/notes.md` as a lesson, but not
    a `docs/` in a package's source. `./packages/*`, `./packages/*/`, `.//packages/*` and `packages/*/` each group exactly as
    `packages/*` does. No `workspaces` line is printed.
  - `['packages/**', 'apps/*']`: five files in three groups, the group counts summing to five. The one lesson is the
    package's own `docs/`. The screen's last line names `packages/**`, once per branch.
- Each guard was broken on purpose and the tests rerun: leaving `./` in place fails the first test, and turning a `**`
  glob into a `docs/` glob fails the second.
- agent-workflows: 351 tests, 350 passed, and one was skipped, the live browser test that needs `AE_LIVE=1`. Typecheck clean.

What it leaves:

- **The board does not draw the `workspaces` line.** The api hands on the package's radius, `deepWorkspaces` included, but
  the decide panel on the run page draws only the groups and the chips.
- **A package nested inside another counts in the outer one**, with or without `**`, as before: `packages/*` plus
  `packages/x/plugins/*` puts `packages/x/plugins/p/src/a.ts` under `packages/x`. A lesson in the inner package's `docs/`
  still counts, through `lessonGlobs`; with `**` it does not.

### A run lists its steps in the order they run

`run.steps` was keyed in the folder's file order, which is alphabetical. So `wf start` printed `3 step(s): implement → plan →
review` for `plan → implement ⇄ review`, and `wf ls`, `wf decide` and the board's step list read that workflow backwards.

What was built:

- `orderSteps(steps)` in `workflow.ts`, pure. Each step comes after every step its `after` names, and otherwise keeps the
  order it was given. `loadWorkflows` hands it a folder's files sorted by name, so a folder's siblings come by name, as §6 asked.
  A workflow frozen in an order that already runs forward is kept as frozen: the board lists a run's steps in its record's
  order, and apps/api holds that to `list`'s. `resume:` is already in `after`, and `loop:`, the edge back, orders nothing. It
  ends on any input, since a record read back is not validated again: an `after` naming a step that is not there orders
  nothing, and steps waiting on each other go last, as given.
- `loadWorkflows` returns steps in that order. So `start` freezes `workflow` and keys `run.steps` in it, and the api's
  Workflows page gets it too.
- `stepsOf` orders what it reads back, so a record keyed alphabetically lists in run order, whether its workflow was frozen
  alphabetically or never frozen.
- `namesInOrder(run, steps)` in `run.ts`, pure: the record's steps in that order, then any the workflow no longer has. `wf
  decide` prints each step's section in it, and reads the branches steps worked on in it when no terminal step has one yet.

What was measured:

- `test/workflow.test.ts` (2):
  - `orderSteps`: `plan → implement ⇄ review` given alphabetically; a fan-out's siblings by name as a folder lists them; two
    roots and a follower whose name sorts first; an order that already runs forward kept as given, `r-20`'s shape among them;
    a fan-out given out of order, which comes out root first, siblings as given, join last; `resume:`; an `after` naming a step
    that is not there; a cycle last, as given; and its input left as it was.
  - A folder `plan → implement ⇄ review` loads as plan, implement, review.
- `test/planned-workflow.test.ts`: the repository's `workflows/dev-planned` is now held to plan, implement, review. Before, it
  was sorted, then compared.
- `test/run.test.ts` (1): `namesInOrder` on a record keyed alphabetically, with a step the workflow no longer has.
- `test/store.test.ts` (2), on a real repository with `start`, `advance` and `main` run for real:
  - `wf start` prints `3 step(s): plan → implement → review`, and freezes the workflow and keys the record in that order.
    `wf ls` prints the rows in it.
  - Two records rewritten in the folder's order, one frozen that way and one with no workflow: `stepsOf`, `list` and
    `wf ls` read plan, implement, review.
  - `wf decide` on a run waiting on you, its review unsigned, prints the plan, implement and review sections in that order,
    before and after its record is rewritten in the folder's order.
- Each guard was broken on purpose and the tests rerun. With `loadWorkflows` and `stepsOf` unordered, 4 tests fail. With
  `stepsOf` alone unordered, 2 fail: the old records. With `wf decide` reading the record's keys, 1 fails. With ties broken by
  name again, 1 fails: the order kept as given.
- The first version broke ties by name, and the root suite failed one apps/api test, *the api's words, and who it says is
  waited on, are `list`'s*. Its fixture `r-20` froze seven roots and then `ship`, out of name order. The api lists them as
  frozen, and `list` had sorted them. Ties now go by the order given, and apps/ is unchanged.
- agent-workflows: 356 tests, 355 passed, and one was skipped, the live browser test. Typecheck clean.
- `npm test && npm run typecheck` from the root exited 0. agent-engine ran 267 (262 passed, 5 live tests skipped), agent-workflows 356 (355 passed, 1 skipped), api 114 and web 158, all passing.

What it leaves:

- **The board reads an old record in its keys' order.** The api takes a run's steps from `run.workflow`, else the folder, else
  the record's keys, and does not order them. A run started before this lists alphabetically on its page, though `wf ls` lists
  it in order. Every run started since is keyed in order, so it lists in order everywhere.
- **`wf cancel` names what it asked to stop in the record's order.** `inFlight` has no workflow to order by, and `wf show`
  prints the record as it was written.

### `wf start --input`: files a person gives the run

§4b's *inputs for a step*: a brief is text, and nothing told a step where a file for it was. For one run, reference
screenshots were copied by hand, and their paths sent to the running session.

What was built:

- `wf start --input <file>`, once per file, also as `--input=<file>`. `start()` takes `inputs`, paths from where `wf start`
  is typed. Before anything is written, it looks at each and asks the pure `inputRefusal` in `run.ts`, which refuses by name,
  with the fix:
  - a file that is not there;
  - a directory, or anything else that is not a regular file;
  - two inputs with the same name, which would share `inputs/`;
  - one file given twice.

  `readFlags` already refuses `--input` with no value, as it does every value flag.
- The files are copied into `runs/<id>/inputs/` (`inputsDir`), the run's own directory beside `artifacts/`. The copy happens
  before the record is written, so a record never names a file that is not there. The names are frozen on the record as
  `inputs`, in the order given. A run given none has no key and no directory.
- `composeBrief` takes the directory as its last argument. Every brief that carries *What was asked for* gains one line under
  the request (`inputsLine`), and the tick passes it on every filing: a step, a try, a round. A brief that continues a session
  carries neither the request nor the line, since that session was handed both. A run given none composes byte for byte as
  before.
- `wf start` prints where the inputs went, and `wf decide` names them under the run's line on every screen (`inputsNote`).
- `wf plan` refuses `--input` by name: a card's inputs are later.

What was measured:

- `test/run.test.ts` (3):
  - `inputRefusal`'s refusals, compared whole, and a missing file named before a clash of names; files that are there, each
    of its own name, pass.
  - `composeBrief` with no `inputs`, with `[]`, and with inputs but no directory: exactly the plain brief. With both, the
    plain brief with the one line under the request. A step after another, a fan-in and a fresh try carry the line once; a
    `resume:` step and a nudge do not.
  - `inputsNote`, with names and without.
- `test/store.test.ts` (2), on a real repository through `main`:
  - `--input` and `--input=`, one name holding a space: both copied byte for byte, the names on the record in order, and
    `git status` in the workspace empty. The `implement` and `review` briefs carry the line under the request, and
    `wf decide` prints it under the run's line. A run with none has no `inputs` key, no run directory and no line.
  - Refused by `start()` with nothing written to the store: a missing file named after a good one, a directory, two
    `notes.md` from two folders, and one file given twice as `b/../a/notes.md`. Through `main`: `--input` with no value,
    `--input=`, `--input` followed by a flag, a directory, `--inputs`, and `wf plan --input`.
- Each guard was broken on purpose and the tests rerun: `inputRefusal` refusing nothing fails 2 tests, `composeBrief` ignoring
  inputs fails 2, `--input` taken only once fails 1, and `wf plan` without its own refusal of `--input` fails 1.
- agent-workflows: 361 tests, 360 passed, 1 skipped. Typecheck clean.
- `npm test && npm run typecheck` from the root exited 0. agent-engine ran 267 (262 passed, 5 live tests skipped), agent-workflows 361 (360 passed, 1 skipped), api 114 and web 158, all passing.

What it leaves:

- **The board neither starts a run with files nor shows them.** Its start form takes none, and for a step not yet filed the
  api previews `composeBrief(step, run, workflows)`, with no directory, so the preview has no line. The api would pass
  `inputsDir(run)`.
- **The files are copied once, whole, and kept.** A file changed after `wf start` is not seen, nothing limits a file's size,
  and nothing removes `runs/<id>/`, as nothing removes a run's artifacts.
- **A card has no inputs** (`wf plan`), as §6 left it.

### Artifacts collected from the workspace

§4b's *the artifacts directory and Codex*, from U1's review. Every brief names `runs/<id>/artifacts/<step>/`, and a Codex step
in `workspace-write` cannot write there: it writes only its worktree and tmp, and the engine passes no `--add-dir`. The fix is
the one hkb's `exports` had. The step names a path in its workspace, and the run collects it.

What was built:

- `artifactPlace` tells four places apart, reading only the path:
  - `workspace`: a path from the workspace root;
  - `escapes`: one that climbs out of it, such as `../notes.md`;
  - `files`: an absolute path in the step's directory;
  - `outside`: any other absolute path.
- `collectArtifacts` in `runner.ts` runs on every pass that hands a step off: before its check is filed, and before a step after it
  works in its workspace. It copies each `workspace` file into the step's directory at the same path, and the pass's note names
  what it copied. It is level-triggered, so a pass that dies halfway loses nothing: the next copies only what changed, by size
  and by time within a millisecond. Nothing is copied for:
  - a path that climbs out of the workspace, which is never read;
  - a link that leads out of the workspace, which is not followed;
  - a directory, or a file that is not there.

  Nor is a copy ever written through a link a step made in its files directory, whether on the way to it or in its place.
- `missingArtifacts` now says why, as `MissingArtifact`. A file named from the workspace is read from the directory first. Where
  it is not there, the workspace names a link that leads out of it and a directory, and names `not collected` for a file whose
  copy something the step made in its files directory refused (`copyBlocked`), even when the file is on the branch. Any other
  file is the branch's to answer, as before collection, so a run from before it reads as it did. `artifactLines` gives each reason its own line on `wf decide`'s screen: not in the
  workspace, a directory, not collected, not in the directory, outside the workspace, outside the directory.
- `artifactsContract`, on every brief, says both ways. Put a file in the directory and name it by absolute path, or leave it in
  the workspace and name it by its path from the root.

What was measured:

- `test/run.test.ts`:
  - `artifactPlace` on workspace paths, `docs/../RESPONSE.md` and `..notes.md` among them, and on five spellings of climbing out;
  - `artifactLines` with every reason, compared whole;
  - the contract's two ways and its refusals.
- `test/store.test.ts` (4 new), on a real repository with `start`, `advance` and `main`:
  - A step names `RESPONSE.md`, `./.e2e/shot.png` (which git ignores) and an absolute path in its directory. A pass hands off,
    collects both workspace files, and dies filing the check. `RESPONSE.md` is then amended, and the next pass copies only it,
    files the check, and `missingArtifacts` is empty. Once the check is filed, a change in the workspace is not collected.
  - A path that climbs out to a real file, a link in the workspace to that file, a directory, and a file never written. Nothing is
    collected. With `fs` spied, neither the tick nor `wf decide` passes the outside file's path to any call. `wf decide` prints
    the three lines under the step.
  - A link in the files directory on the way to a copy, and another in a copy's place. What they lead to is left as it was, and
    `wf decide` names both files not collected, though both are on the branch.
  - A run from before collection, its step past hand-off with its check on the record, its worktree still there, `docs/RESPONSE.md`
    committed on the branch and nothing in its files directory: `missingArtifacts` names only a file git ignores, which is on no
    branch, as `not collected`, and a pass collects nothing.
  - The earlier tests of absolute paths inside and outside the directory now expect a reason, `missing` or `outside`, and are
    otherwise unchanged.
- Each guard was broken on purpose and the tests rerun:
  - collecting nothing fails 1 test;
  - reading a climbing path as the workspace fails 3;
  - following a link out of the workspace fails 2;
  - copying on every pass fails 1;
  - passing a link on the way to a copy fails 1;
  - writing through a link in a copy's place fails 1.
- The collection test at first failed intermittently. A copy's time, set through a `Date`, read back a fraction of a millisecond
  off its source's, so an unchanged file was copied again, and its pass's note named it. The comparison is now within a
  millisecond, and the store tests passed five runs in a row.
- The first version counted a file as present whenever it was on the branch, and the link test showed that hid a file the run
  had refused to copy. The second asked the branch only when the workspace had nothing at the path, and round 2's review found
  what that broke: no code removes a worktree, so every run from before collection would print `not collected`, for good, for
  each file its steps named from the workspace root. Those steps are past hand-off, and nothing collects for them. The branch
  now answers unless the copy was refused. The reviewer proposed asking the branch only once hand-off is past. I left that
  condition out: a step whose engine task is gone never hands off, and would still read `not collected` for good.
- Round 2's guards, each broken on purpose: round 1's rule back fails the new legacy test; passing over a refused copy that is on
  the branch fails the link test; a link on the way to a copy, or in its place, written through each fail the link test; copying
  on every pass fails the collection test.
- After round 2, `npm test && npm run typecheck` from the root exited 0: agent-engine 267 (262 passed, 5 live tests skipped),
  agent-workflows 369 (368 passed, 1 skipped), api 114 and web 158, all passing. The log is `root-check-round2.txt` in the step's artifacts.
- agent-workflows: 364 tests, 363 passed, 1 skipped. Typecheck clean.
- `npm test && npm run typecheck` from the root exited 0. agent-engine ran 267 (262 passed, 5 live tests skipped), agent-workflows 364 (363 passed, 1 skipped), api 114 and web 158, all passing.

What it leaves:

- **The board serves only a file directly in the directory, named by an absolute path.** The api's artifacts route requires
  `artifactPlace(...) === 'files'`, so a collected file named from the workspace shows as a bare path on the Output tab. The api
  would look for it at `path.join(dir, file)`.
- **A directory is not collected.** A step names each file in it, and a directory named whole is named on the screen.
- **A copy that fails for another reason is not named when the file is on the branch.** `collectArtifacts` swallows the error
  (a full disk, a permission), and the branch then answers. The file is there to read, on the branch.
- **A file rewritten at the same size within a millisecond of its copy is not copied again.** Collection runs once the step has
  finished, so only something else writing the workspace could do that.

### A stale ask on a harness-blocked step is honoured

From W4's review. `wf retry` on a step whose session the harness had blocked writes the ask, and the tick stopped that session
only while the engine said `needs-human`. A session can work again before a tick stops it, told something by a peer with no
`wf up` running. The ask was then neither due nor spent, and `wf ls` said nothing of it. When the step later failed or stopped,
it filed try 2 at once, ahead of `retries:`.

What was built:

- `retriesDue` reads the engine's record of the task, not what the harness said when the ask was written. An unspent `--nudge`
  or `--fresh` ask for a step whose task has not settled (`pending` or `running`) is due with `stopFirst`, whether or not the
  harness still says blocked, and `runsOn` marks a session the harness no longer calls blocked. The tick then does what W4
  built: it asks the engine to stop the session once, since a task with `stopRequested` is not asked again, and files the try
  once the task has settled.
- `wf ls` notes it: `try 2 asked (--nudge) — stopping its session, then the tick files it`. While the harness still says blocked,
  the words stay `stopping its blocked session`, which apps/api and apps/web pin. The pass's note says the session runs on.
- `listing` now reads `unknown`, a task the engine has no record of, as that and not as running: the tick stops nothing of such a
  task, and `wf ls` does not say it would.
- `wf retry` is unchanged, and `retryable` still refuses a working step at the verb. A `--recheck` ask on a working step is not
  honoured, since no session could have been asked for one.

What was measured:

- `test/run.test.ts` (1 new):
  - Due, with `stopFirst` and `runsOn`: an ask for a step whose task runs, whether the harness's word is left out or given as
    no, for `--nudge` and for `--fresh --model`; and likewise a task still `pending`, and one signed off and running on.
  - Still blocked by its harness, the ask is due exactly as before, without `runsOn`, and `decision` names the step once.
    `listing` gives each wording, beside `running (working)` and beside `needs-human`.
  - Not due: an ask on a task the engine has no record of, a `--recheck` ask, and an ask for a try past the next.
  - Settled `stopped`, the ask is due as any stopped step's.
  - `retryRefusal` still refuses a working step, with the harness's word and without it. With no asks, nothing is due of a
    working step, and a refused check `retries:` covers is due as before.
- W4's test had held the old behaviour in two assertions: "without the harness's word, nothing is due", and nothing said beside
  `running (working)`. Both now expect the ask due and noted.
- `test/store.test.ts` (1 new), with `main` and `advance` run for real. `wf retry` on a `needs-human` step, then the task reads
  `running`, and `wf ls` says `stopping its session`. The first pass stops the task once, files nothing, leaves the record byte
  for byte, and keeps the ask. Two more passes, one on a board read afresh, stop nothing more. Once settled `stopped`, the next
  pass files try 2, continuing the session, and consumes the ask; a later pass files nothing more.
- Each rule was broken on purpose and the tests rerun:
  - the old rule, due only while the harness says blocked, fails 3 tests;
  - the note always saying `blocked` fails 3;
  - `wf ls` reading an unknown task as running fails 1.
- agent-workflows: 366 tests, 365 passed, 1 skipped. Typecheck clean.
- `npm test && npm run typecheck` from the root exited 0. agent-engine ran 267 (262 passed, 5 live tests skipped), agent-workflows 366 (365 passed, 1 skipped), api 114 and web 158, all passing.

What it leaves:

- **A session that works again and settles with no tick in between still leaves its ask.** The ask is not due while the step
  is verified, and it files try 2 the moment the step waits on a person. Nothing in `wf ls` says an ask is waiting on a verified
  step.
- **The web's own words say `stopping its blocked session` for both.** The api's `note` is `listing`'s and tells them apart, but
  the web words a try asked from `stopFirst` alone.

### `wf start` on a card file

From P3's review, and recorded as left in the plan section above. A plan that stops part-way prints `wf start <plan>/<card>.md
--workflows … --after …` for each card left, and `wf start` took the file's whole text as the brief. The run's id, and every
step's brief, then carried the card's `workflow:` line.

What was built:

- `cardToStart(file, text, after)` in `plan.ts`, pure. A file is a card when every line of its frontmatter, comments aside, is
  `workflow:` or `after:`. It is held to what `wf plan` holds a card to, through checks `parseCard` now shares (`bodyOf`,
  `afterOf`): a key set twice or to nothing, an empty body, an `after:` naming no card or one twice. A card whose `after:` names
  cards is refused when `wf start` was given no `--after`, and the refusal gives an `--after <card's run id>` per card, from
  `wf ls`.
- Any other file gives null, and its whole text stays the brief: no frontmatter; one with any other key, or a line of prose; an
  empty block; and a `---` that never closes, which `splitFrontmatter` refuses for a step or a card but a brief may start with.
- `wf start` uses a card's body as the brief, so the run's id comes from the body. `--workflows` comes from the flag or else from
  the card's `workflow:`, found from the card's folder as `wf plan` finds it. The `--after` ids given are checked as any
  `--after` is.
- `planStopped` quotes each path it prints for the shell, with a quote inside closed, escaped and opened again.

What was measured:

- `test/plan.test.ts`:
  - `cardToStart` reads three cards: one with both keys and a body of two paragraphs, one saved on Windows with a comment, and
    one with only `after:`.
  - It gives null for six briefs that are not cards.
  - It refuses by name an `after:` with no `--after`, naming one card, two and three, and each thing `wf plan` refuses of a card.
  - `planStopped` compared whole with quoted paths, and with a space and a quote in them.
- `test/store.test.ts` (1 new), through `main` on a real repository with a `workflows/dev`:
  - A card naming `workflow: dev` starts its body, its id from the body, on `<repo>/workflows/dev`. One naming a path from its
    plan folder starts on that folder, and `--workflows` wins over a card.
  - A card with `after: a, b` and no `--after` is refused by name and writes no run; with both `--after`s, it starts.
  - A brief whose frontmatter has `title:` beside `workflow:` is taken whole, and so is one that opens with a `---` it never
    closes.
- Each guard was broken on purpose and the tests rerun:
  - starting a card with `after:` and no `--after` fails 2 tests;
  - reading any frontmatter as a card's fails 2;
  - refusing a `---` that never closes fails 2;
  - `wf start` taking a card's whole text fails 1;
  - ignoring the card's `workflow:` fails 1;
  - printing the paths bare fails 1.
- agent-workflows: 368 tests, 367 passed, 1 skipped. Typecheck clean.

What it leaves:

- **Which runs `--after` names is not checked against the card.** `wf start` refuses a card with `after:` and no `--after`, but
  given ids, it checks each as any `--after` is, not whether they are the runs of the cards the card names.
- **A card's `workflow:` is read from the folder the card is in.** A card copied out of its plan folder reads a relative
  `workflow:` from where it is now.
- **The board's start form takes no card.** `wf plan` and `wf start` are how a card is started.

## Shipped: quiet without a closeout is `unsigned` again

From agent-engine's open issues, *Quiet without a closeout* (bug 1, fixed by E7). The engine used to settle a session that went
quiet `succeeded`, closeout or not, and `stepStatus` read one that gave none as `unsigned`. Since E7, a task with a closeout schema
whose session goes quiet without its closeout ends that attempt `failed` with reason `unsigned`, is nudged if it has attempts left,
and settles `failed`. `stepStatus` returned a failed task's phase before it looked at the closeout, so the same step read `failed`,
and three things moved with the word. The run's outcome was `failed` instead of `blocked`. `wf ls` dropped the step from "waiting
on you". And a nudged try was told its session "ended `failed` before it signed off", not that it gave no closeout, which is the
one thing it has to fix.

What was built:

- `closeoutAsked` in runner.ts now answers `CloseoutAsked`: `false` for a task never asked for a closeout, `true` for one asked,
  and `unsigned` for one asked whose last attempt ended with that reason. It is still the one reading of the engine's view, so the
  tick, `wf ls`, `wf decide` and apps/api, which hands `closeoutAsked(views)` to `listing`, `assess` and `decision`, all get the
  third answer with no change of their own. The type is exported beside the package's other types.
- `stepStatus` reads a task settled `failed` with no closeout whose answer is `unsigned` as `unsigned`, before it returns the
  engine's phase. It stays pure. Only `failed`: a task a person stopped while it was being nudged reads `stopped`, one not settled
  reads `running`, and a closeout that says `blocked` still reads `blocked` first.
- Every `askedCloseout` parameter in run.ts takes the wider type. A caller with only a yes or a no still passes one.
- The comment on `stepStatus` says what the engine does now. `StepStatus`'s doc and the README's table say an `unsigned` step
  *ended* without its closeout, where they said it *succeeded* without one: both ways still reach the word.

What was measured:

- `test/run.test.ts` (1 new), pure. A failed task whose answer is `unsigned` reads `unsigned`, and one only asked reads `failed`.
  With the `unsigned` answer, a stopped task reads `stopped`, a running one `running`, and a closeout saying `blocked` reads
  `blocked`. `decision` calls the first run `blocked`, its step under `unsigned`, and the second `failed`, under `failed`.
  `listing` puts only the first step in `waitingOnYou`. The nudge's brief says "ended without the closeout the run asked for" for
  the first, and "ended `failed` before it signed off" for the second.
- `test/store.test.ts` (1 new): `start`, `advance`, `list`, `decide` and `retry` for real, over the fake engine view. The fake's
  `settle` now takes an attempt's reason, and an attempt given one ended `failed`. Implement's task settles `failed` with no
  closeout, its attempt ended `unsigned` in one run and `harness` in the other, and `phaseOfView` says `failed` for both while
  `closeoutAsked` says `unsigned` and `true`. In the first run, review is blocked, `wf ls` says `unsigned` with implement waiting
  on you, `wf decide` is `blocked` with implement unsigned, and `wf retry --nudge` files try 2 told it gave no closeout. In the
  second, the same pass blocks review, `wf ls` says `failed` with nobody waited on, `wf decide` is `failed`, and try 2 is told its
  session ended `failed`.
- Each rule was broken on purpose and the tests rerun:
  - `stepStatus` ignoring the `unsigned` answer fails 2 tests;
  - `closeoutAsked` never giving it fails 1;
  - a stopped task read as `unsigned` too fails 1.
- `npm test && npm run typecheck` from the root exited 0: agent-engine 284 (278 passed, 6 skipped), agent-workflows 371 (370
  passed, 1 skipped), api 114 and web 158, all passing. Typecheck clean in all four.

What it leaves:

- **A step's line does not say which way it went unsigned.** `wf ls` and `wf decide` say `unsigned` for a session settled
  `succeeded` with nothing said and for one that went quiet and settled `failed`. The engine's note on the task says which
  (`1 attempt(s), none succeeded: the last went quiet without the closing statement it was asked for`), and nothing here prints it.
- **At defaults the engine's nudge is not spent on a step.** agent-workflows files one attempt unless a step declares
  `maxAttempts`, so a quiet session's task settles `failed` at once, and a person's `wf retry --nudge` is the nudge.

## Shipped: cost measured and a budget set — `budget:`, and dollars where a person decides

Plan §6 item 29, the workflow half; E8 was the engine's. The old hkb had a budget per worker and a cost per piece of work, and
`wf decide` said `cost not measured` on every step. E8 made the engine read what a session cost from its harness (`usage.costUsd`,
`apiMs`, `toolMs`) and take `budgetUsd` on a task. This carries a budget from the folder to the task, and shows the cost where a person
decides. Read from this workspace, where E8 had merged (`1944644`): agent-engine's README (*What a session may spend*, *What an attempt
consumed*), `src/domain.ts`, and its open issues 17 and 18.

What was built:

- **`budget:` on a step**, in dollars (`5`, `2.50`). Refused at load for 0, a negative, a word, an amount with its unit and an empty
  value, each naming the fix. Refused on codex in the engine's words, which `test/vocabulary.test.ts` holds the copy to. Frozen on the
  run.
- **Two words in the status vocabulary.** `over budget` (`stepStatus`, still pure) means the step's ended tries have together cost
  the cap in force or more, so nothing is left, and another session of it is the way on: a try, from a status a try is taken from (a
  check that refused, not one that did not finish), or a round its loop asks for. `budget exhausted` means its harness ended its session at the cap, the engine's reason `budget`. Both stop what follows
  and wait on a person. `decision` lists them under `overBudget` and `budgetExhausted`, and calls the run `blocked`.
- **The run's own word spends nothing past the cap.** `retries:` files no try of such a step. A looping step whose round would file a
  step of its loop over its budget reads `over budget` itself, so no round goes and nothing after the loop is filed.
- **A person raises it**, with `wf retry <run> <step> --budget <amount>` or `wf round <run> [<step>] --budget <amount>`. `retryable`
  carries `raise` for the two statuses, and for a step whose check did not finish past its budget, whose free recheck is offered first. `retryRefusal` and `roundAsk` refuse, by name, a try or a round of them without
  `--budget` or with one not above what was spent, and `--budget` anywhere else. The amount rides on the ask file, which the tick
  also refuses to honour when it is not dollars or rides on a recheck. The tick keeps it on the try the ask replaced
  (`EarlierTry.budget`), and `budgetOf` reads the cap in force off the record, so it holds after a restart.
- **On `claude-detached` what is left of the cap goes to the engine as `budgetUsd`**: the cap less what the step's tries have cost, on
  the first filing, every try and every round (`budgetUsdFor`), so the harness holds the tries together to it. On `claude` it never
  does, since the engine refuses it there.
- **A try's brief says how its last try ended on its own work** (`ownStatus`: unsigned, failed, its check). Beside that it says the
  budget was reached and raised, and never in its place.
- **Cost on the screens.** `wf ls` puts each step's tries' cost beside its word (`$3.01`, or `≥$3.01` where an ended attempt has
  none) and the run's total on its line. On `wf decide`, `used` gains `api 8m06s · tools 2s`. `cost` prints the dollars, the tries
  together where there were several, and the cap in force. The run's total follows the steps, and each try's cost is on the
  timeline. `Consumed` and `sumUsage` carry `apiMs` and `toolMs`. `taskSpend`, `stepSpend`, `runSpend` and `spendReader` read the
  cost off the engine's views. `taskPhases` now views each earlier try's session task too. A settled `claude` task's view reads its
  journal and asks no registry; a detached one's reads the worker's run files.

What was decided, and why:

- **One rule on both Claude harnesses: the tries together, against the cap.** On `claude-detached` the harness also ends each session
  at the cap. That per-session cap alone would let `retries: 3` spend nearly four caps, which is not what `budget:` on a step says.
- **A step that did the work keeps its word.** A verified step over its budget still lets what waits on it run. Nothing more is
  filed for it, so there is nothing to hold, and holding its followers would fail a run over work that passed.
- **A round is held by any step of the loop over its budget**, not only the one `loop:` names, since the round files each of them again.
- **A recheck needs no `--budget`.** It runs the check, which costs nothing.
- **Held at the cap, not only past it.** With nothing left, any session spends past the cap; and a `claude-detached` step with nothing
  left would be handed a `budgetUsd` of 0, which the engine refuses at `file()`.
- **A check that did not finish holds nothing.** It is no verdict on the work (CLAUDE.md), and its way on is the check again, for
  nothing. So the step reads `failed (check)` past its budget, as without one. A new session of it still needs `--budget`, since that
  would spend past the cap.

Round 2's review found three of these missing, and each was fixed: an unfinished check held as `over budget`, which hid
`CHECK DID NOT FINISH` and offered a raise where a free recheck was the way on; each `claude-detached` filing handed the whole cap, so
`retries: 2` could spend nearly three; and a try's brief told the budget sentence in place of why its last try ended.

Round 3's review found the person's screen still hid it. A step past its budget whose session failed, was stopped or ended unsigned
was filed under `overBudget` alone: `wf decide` printed neither `FAILED:` with its logs nor `UNSIGNED:`, and the run's outcome read
`blocked`. `decision` now names each step by how it ended on its own work, with `overBudget` beside that, so a refused check past its
budget reads `failed` too. The offer says `over budget (failed)`. The OVER BUDGET line (`overBudgetLine`) gives each step its own
reason: it had given one reason for every step, and so said a looping step held on implement's budget had spent its own. And `wf ls`
puts such a looping step's own cost beside its word, which shows only implement's.

What was measured:

- `test/workflow.test.ts` (2 new) and `test/vocabulary.test.ts` (1 new): the amounts taken, each refusal's words, and the codex
  refusal held to the engine's.
- `test/run.test.ts` (12 new), all pure:
  - `taskSpend` over ended, running and unstartable attempts;
  - a claude step over its budget reads it with the amounts, files no `retries:` try, and is offered `--budget`; at the cap it is
    held too; under it, or without a measured cost, it reads as before;
  - a step whose check did not finish past its budget, stopped or at its deadline, reads `failed (check)`: `wf decide` says its check
    did not finish, offers `--recheck` first, and a session is refused without `--budget`;
  - a try's brief past a budget keeps why its last try ended, for each status, with the budget sentence beside it;
  - an ask needs a `--budget` above what was spent, the record keeps it, and a try past the new cap is held again;
  - each `wf retry` refusal, by name;
  - `budget exhausted` and its refusals, including a session cut off before its cost was written;
  - `budgetUsdFor`: what is left, to the millionth, never 0;
  - a loop held on implement's budget, `wf round --budget`, and the cap the round keeps; the same at the cap;
  - a step signed off blocked, before and after its session settles;
  - `wf ls`' cost words, `costLine` and `runCostLines`, and a try's cost on the timeline.
- `test/store.test.ts` (5 new), over the fake engine, whose attempts now carry a usage once settled and not before:
  - the frozen key;
  - a claude step whose check refused past its budget is not re-filed, is refused `wf retry` without `--budget` or under what it
    spent, is filed with a larger one, and is held again past the new cap;
  - a `claude-detached` step's `budgetUsd` on its filings, `budget exhausted`, and a try whose larger cap is carried less what was spent;
  - a `claude-detached` step's tries sharing its cap: `retries:` files try 2 with what is left, and at the cap files none;
  - a nudge of an unsigned step past its budget told that it gave no closeout, beside the budget;
  - a loop held on implement's budget, and `wf round --budget`;
  - the CLI's `--budget` refusals.
- `test/radius.test.ts` (1 new) and `test/decide.test.ts` (2 new): `used` with the api and tool time, the `wf decide` screen of a step
  that failed or ended unsigned past its budget (`FAILED:` or `UNSIGNED:` beside the OVER BUDGET line), and both screens with a
  measured cost and with none.
- Each guard was broken on purpose and the tests rerun:
  - `over budget` never read: 6 failing;
  - an ask without `--budget` honoured: 2;
  - `--budget` not above what was spent taken: 4;
  - a round asked without it honoured: 1;
  - `budget exhausted` read as `failed`: 2;
  - `budgetUsd` handed to every harness: 3, and to none: 2;
  - `budget:` on codex taken: 1;
  - `budget: 0` taken: 2;
  - the raised cap not kept on the record: 2;
  - round 2's guards: a check that did not finish held as over budget, 1; the whole cap handed each filing, 3; held only past the cap,
    2; the budget offer before the recheck, 1; the brief's budget sentence dropped, 3; the brief handed the masked status, 2;
    `wf decide`'s offers read with no verdict, 1;
  - round 3's guards: `decision` naming a step past its budget by its masked status, 4 failing; the offer without why it stopped, 4;
    the cost dropped beside every over-budget word, 1; the OVER BUDGET line losing a looping step's reason, 1; `wf decide` printing
    no OVER BUDGET line, 1.
- From the root, `npm test && npm run typecheck` exited 0: agent-engine 307 (299 passed, 8 skipped), agent-workflows 406 (405 passed,
  1 skipped), api 129 and web 164. Typecheck was clean in all four.

What it leaves:

- **The board.** `apps/api` passes `listing`, `assess` and `decision` no `spendOf`. So it reads a step over its budget by the status
  underneath, and shows a `retries:` try as due that the tick holds. The board shows no cost and no `over budget`, and `apps/web`'s
  `stepState` knows neither word. `ONCE_MORE` cuts `wf retry <run> <step>` out of an over-budget offer without its `--budget`, and
  the retry route's body carries no `budget`, so the board's Continue on such a step is refused. Each fix is `spendReader(views)`
  handed where `closeoutAsked(views)` already goes, plus a field. That is the next apps run. The api's tests pin `usedLines`' words
  (`$0.004`, and a used line with no times), so the format keeps three figures under a cent and says nothing of time nobody measured.
- **A `claude` step is capped between tries, not during one.** Until Claude Code writes what a running `--bg` session has spent
  (agent-engine's open issue 17), a step can overrun its budget by one try, and one long try is not bounded at all.
- **A cost lands after its session ends** — for a `claude` session, once the engine has let it go. A `wf retry` of a step whose last
  try ended moments earlier can be filed before that cost is on the view, without the `--budget` it would have needed. That try is
  the overrun.
- **The cap is per step.** Nothing sets a budget for a run or a workflow: the run's total is shown, and held to nothing.
- **`maxAttempts:` on a `claude-detached` step hands each attempt what is left.** The engine starts an attempt that failed under its cap
  again within one filing, with the same `budgetUsd`, and counts no spend of its own. So `maxAttempts: 3` can spend nearly three times
  what was left. The run's own default is one attempt.
- **Only what was measured counts.** An attempt killed before its harness wrote a cost, or run on a model it could not price, adds
  nothing to what a step has spent. `wf ls` marks such a step's cost `≥`, and a step that such an attempt took past its cap is not
  held.

## Shipped: an inbox — cards parked before they are started

An idea about the project had nowhere to be parked. The unit for one already existed: a card, a workflow and a brief. But a card lived only
in a plan folder, started whole by `wf plan`, or was started by hand and left where it was. The old hkb parked such a note with
`hkb new --triage` and listed them with `hkb ls --phase triage`, and its ADR-015 records that triage became a phase in the machinery
because a person needed an inbox. Here an unstarted card is a file in a folder, and a run is what it was. Read first: CLAUDE.md, the
README's plan and inputs sections, `plan.ts`, and `start`, `readPlan` and `startPlan` in `runner.ts`.

What was built:

- **The folder.** `$WF_ROOT/inbox/`, beside `runs/`, holds one `<name>.md` per card (`inboxDir`). A card is a plan's card with two
  differences. `workflow:` is optional. `repo:` is a key of its own, also optional: the absolute path of the repository the idea is about.
  `parseInboxCard` in the new `src/inbox.ts` is pure and closes the keys through `frontmatterKeys`, which a plan's card now uses too. It
  refuses `after:` by name, saying where a wait is given instead (`wf start --after`). It refuses a `repo:` that is not absolute, or that
  names no directory, asking a predicate so the module reads no disk. `test/boundary.test.ts` holds `inbox.ts` to that.
- **A plan's card refuses `repo:`** by name, since a plan's repository is `wf plan --repo`. `cardToStart` reads `repo:` as a card's line,
  so an inbox card carried out of the inbox is refused by `wf start`. It is no longer taken as a brief with its frontmatter in it.
- **`wf inbox`** lists the cards through `readInbox`, which hands the folder's entries and every run record to `inboxListing`, pure. Each
  card gets its name, first line, and workflow and repo when set. A card whose name a record's `from` carries gets `started as <runId>`,
  composed on read. An entry that does not read as a card is listed with its refusal, as the board lists a workflow folder that does not
  load. `inboxLines` words the list.
- **`wf inbox add "<idea>"` or `<file>`** files a card through `addToInbox`, which writes what `ideaCard` returns. The card is named by
  `runId` of its first line, suffix included, and written `wx`, so a taken name is drawn again. `--workflow` and `--repo` write the keys
  over a file's own. A file whose frontmatter is an inbox card's gives its keys; any other text is the body whole. A repo, and a workflow
  given as a path, are written absolute (`workflowAt`): the flag's from where it is typed, a file's own `workflow:` from the file's folder. The card written is parsed back before it is written, so nothing lands in the inbox that
  `wf inbox` would list as refused.
- **`wf inbox rm <name>`** drops a card through `dropFromInbox`. A name with no card exits 0 and names the cards there are (`noCardLine`).
  The request lists this among the refusals, but also says a name with no card is normal. The more specific sentence was kept, as
  `wf cancel` says "already finished" and exits 0.
- **Starting a card.** `startFromInbox` in `runner.ts` is the one function the CLI calls and the board will call. It takes the card's name,
  a brief to replace the body, the workflow (the given one, else the card's `workflow:`, else refused naming the repository's workflows),
  the repository (the given one, else `repo:`, else the caller's), and `after`, `isolate` and `inputs`. It calls `start()`, which now
  takes `from` and writes `from: { inbox: <name> }` on the record. Then it removes the card. `wf start` on any path under the inbox goes
  through it — `<inbox>/<name>.md`, or `<inbox>/<name>` as `wf inbox` lists it — recognised by `inboxNameAt` (links resolved, then
  `inboxNameOf`, pure), with `--brief "<brief>"` as text or a file. `wf decide` prints
  `from inbox card <name>` under the run's line (`fromNote`). A card's `workflow:` is found from the inbox folder, as a plan card's is
  from its plan folder.
- **One refusal the request did not name:** a card that a record already names. That card's removal failed after its run was written.
  Started again, it would run the idea twice, so the start is refused, naming the run and `wf inbox rm`.
- **From review, round 2**, three findings, each fixed:
  - `wf start <inbox>/<name>`, the name copied from `wf inbox`, was not a card's path: only `<name>.md` was. No file of that name exists,
    so the path's text became the brief of a run that was written, and the card stayed. Every path under the inbox now goes to the
    start, and one that names no card — a name not there, a file that is not a card, one in a folder inside the inbox — is refused by name.
  - `wf inbox add <file>` copied a relative `workflow:` as written, and the start read it from the inbox. `../workflows/dev` in
    `<repo>/plans/idea.md` then named the store's `workflows/dev`, used silently if it existed. It is now written absolute against the
    file's folder, as the flag's is against where it is typed.
  - `after:`'s refusal for a file `wf inbox add` is given built `wf start <inbox>/./ideas/d.md`, a command naming no card. It now says
    to delete the line, file the idea, and give `--after` when starting the card.

What was measured:

- `test/inbox.test.ts` (11 tests, pure):
  - the card with each key and neither, saved on Windows, and a comment-only frontmatter over a body that opens with a rule;
  - every refusal of a card: an unknown key, `after:`, a key set to nothing or twice, a relative `repo:`, one naming no directory, an
    empty body, and a frontmatter that never closes;
  - the listing, with records naming a card twice, a card that does not read, a stray file, a folder, a hidden file and a README;
  - the lines, and `noCardLine` with and without `.md`;
  - the name refusals: `../runs/r-1`, `..`, `.`, a slash, a backslash, a NUL, a hidden name and an empty one;
  - `ideaCard`: keys from a file, flags over them, text taken whole, and a refusal for an empty idea, a key on two lines or given empty,
    and a relative or missing repo;
  - `inboxNameOf` for every path under the inbox (with `.md`, without, a file that is not a card, a folder inside it) and for seven outside
    it or the inbox itself; `workflowAt`, and `ideaCard` writing a file's relative `workflow:` absolute against its folder — a name, an
    absolute path and the flag's left as given; the no-workflow and already-started refusals, and `fromNote`.
- `test/inbox-store.test.ts` (10 tests, a temporary `WF_ROOT`, through `main`):
  - `wf inbox` on no folder;
  - `add` of text, of text with flags, of a file with the flag over its key, by the function with a workflow path, and of text with
    `--workflow` given as a relative path, written absolute;
  - `add` of `<repo>/plans/idea.md` with `workflow: ../workflows/dev`, while the store has a `workflows/dev` of its own: the card names
    the repository's, and the run starts on it;
  - `wf start <inbox>/<name>` without `.md` starts the card and leaves the other; a name with no card, `<inbox>/notes.txt` and
    `<inbox>/drafts/idea.md` are refused by name, and no run is written;
  - `wf inbox` listing started, refused, stray, hidden and README entries;
  - `rm`, including a name with no card and one given with `.md`;
  - the CLI's refusals for add and rm. A `../runs/…` name is refused, and the record it would reach is still there;
  - a start from a card with `workflow:` and `repo:`: the brief, repo, workflow and `from` on the record, the card gone, and `wf decide`'s
    line. A typed run has no `from`, and a plan's card started by `wf start` stays;
  - flags over the card, the caller's `.` found by `process.chdir`, the board's call with an absolute folder, `--brief` as a file, and
    `--after`;
  - every start refusal, each writing no run and leaving the card: no card, three bad names, no workflow (with workflows and without),
    `workflow: nope`, `--workflows nope`, a hand-edited `after:`, a `repo:` gone, an empty `--brief` (CLI and function), `--brief`
    twice and on a typed brief, and an `--after` `start()` refuses;
  - a removal made to fail with a read-only inbox. The run is written, the start says the card is still there, `wf inbox` lists
    `started as`, a second start is refused through the CLI and the function, and `wf inbox rm` clears it. The test skips as root, which
    removes the file anyway; here it ran.
- `test/plan.test.ts` refuses `repo:` on a plan's card, and on a card `wf start` is given. `test/store.test.ts` has one refusal's wording
  updated: `wf start`'s unknown-flag message now names `--brief`.
- Each guard was broken on purpose and the four test files rerun. 29 breaks, each failing at least one test:
  - `repo:` not read as a card's line: 1; `repo:` taken on a plan's card: 2;
  - on an inbox card, `after:` taken: 5; any key taken: 6; a relative `repo:`: 3; a `repo:` naming no directory: 4; an empty body: 2;
  - in `add`: an empty idea taken: 2; a key on two lines: 1; a file's keys over the flags: 2; the card not parsed back: 2;
  - a slash or `..` in a name: 3; a hidden name: 2; `rm` not checking the name: 1; a start not checking it: 1;
  - an inbox path taken as a brief: 5; no workflow falling back to `./workflows`: 1; a card already started started again: 1;
  - the card removed before the record: 2; never removed: 2; `from` not on the record: 3; the card's `repo:` ignored: 4; its
    `workflow:` over the flag: 1; an empty brief taken: 1; the brief ignored: 1; `--brief` on any start: 1;
  - `wf decide` naming no card: 1; `started as` not composed: 4; a stray entry hidden: 3.
  - round 2's: only `<inbox>/<name>.md` a card's path, as before: 2; a path outside the inbox taken as a card's: 9; a file's
    `workflow:` path not written absolute: 2; the CLI giving no folder for a file: 1; the flag's path left relative: 1; a bare name
    resolved as a path: 2; the filing `after:` refusal naming the given path: 2.
- The verbs were run by hand in a scratch `WF_ROOT` on this repository: add twice, list, a start refused for no workflow, a start with
  `--brief`, the list after, `rm` of a name with no card, and `wf decide`'s head. The README shows that output.
- From the root, `npm test && npm run typecheck` exited 0: agent-engine 307 (299 passed, 8 skipped), agent-workflows 427 (426 passed,
  1 skipped), api 137 and web 174. Typecheck was clean in all four.

What it leaves:

- **Two starts of one card at once both start.** Each reads no record naming the card before the other writes one. The CLI and the board
  together could do it. A claim file taken `wx` before `start()` would close it, but a claim left by a crash would then need clearing.
- **A card's `workflow:` is not checked when it is filed.** A name is found in a repository, and that may not be known until the start.
  `wf inbox add --workflow nope` files, and the start refuses by name.
- **Every record is read for `from`.** Both `readInbox` and `startFromInbox` read them all, as `wf ls` does. A record that does not parse
  breaks all three.
- **A card filed by hand under a name a record carries** lists as `started as` and is refused a start. `wf inbox add` names carry a
  random suffix, so this takes a hand-named file.
- **`wf ls` does not say a run came from the inbox.** Only `wf decide` does.
- **`bin/wf.ts` exits 1 on every refusal**, whatever `exitCode` it carries. This was here before the inbox, and was not changed. The tests
  read `exitCode` off what `main` throws.
- **The board had no inbox.** The next run, `the-inbox-on-the-board-a-pag-ryny`, gave the api its routes and the board its page: *The board
  half*, below.

The exports that run should call, from `agent-workflows` (`src/runner.ts`) unless noted:

- `readInbox(): InboxListing[]` lists the inbox, `started as` included.
- `addToInbox({ text, from?, dir?, workflow?, repo? }): { card: InboxCard; file: string }` files a card. `repo` must be absolute, and
  `workflow` a name or an absolute path: `workflowAt(given, dir)` makes one. `from` is what a refusal calls the idea; `dir` is the folder
  a relative `workflow:` inside `text` is read from, and without it such a path is written as it is.
- `dropFromInbox(name): InboxDropped` drops one. It returns `{ removed: true, file }`, or `{ removed: false, cards }` for a name with no
  card: a 404, worded by `noCardLine(name, cards)`.
- `startFromInbox(opts: InboxStart): InboxStarted` starts one. Pass the workflow folder the api's own `folderOf` found as `workflow`,
  absolute; the board's repository as `callerRepo`; and `brief` and `after` from the body. `removed: false` carries `why`.
- `inboxNameRefusal(name)` refuses a name in the route before anything is read.
- `inboxDir()`, `workflowAt`, `fromNote(run)` for the run page, `INBOX_KEYS`, `parseInboxCard`, and the types `InboxCard`, `InboxListing`, `InboxStart`,
  `InboxStarted` and `InboxDropped`.
- From `agent-workflows/run`: `Run.from`, `{ inbox: string }` or absent.
- Refusals in the card's or the start's words throw with `exitCode` 2. `start()`'s own refusals, for `--after` and `--input`, do too. A git
  failure has none.

### The board half

An idea is had where the project is looked at, so the inbox got a page of the board's own. Whether its cards belong on the Factory canvas is
left for later. Read first: the apps/web lines of CLAUDE.md, the exports above, and `POST /api/runs`, `folderOf` and `guard.ts` in apps/api.

What was built:

- **`GET /api/inbox`** (`apps/api/src/inbox.ts`) lists `readInbox()` as it is, read from disk on each request. Each entry also carries `body`,
  parsed again from its file with `parseInboxCard`, since the listing has only the first line and a start's brief is prefilled with the whole
  body. It carries `filedAt` too, the file's mtime, since a card has no time of its own and the page orders cards newest first.
- **`POST /api/inbox`** takes `{ "body", "workflow"?, "from"?, "repo"? }` and files through `addToInbox`. The request named `body`, `workflow`
  and `repo`. `from` was added beside `workflow`, as a start takes it, for a name both the repository and yours have. `workflow` must be a
  name, found among the api's folders with `folderOf` (404, 409): a card filed from the board never names a path that was sent. It is written
  by name when it is the repository's and the card is about the api's repository. Otherwise it is written as the absolute folder `folderOf`
  found: a name on a card is looked for under the card's repository at start, where yours is not, so `wf start <card>` from a terminal would
  refuse it. An absolute `repo` is written as `wf inbox add --repo` writes it (`path.resolve`): no trailing slash, `.` or `..`. Written as
  sent, `/code/app/` would be recorded on the card's run, and the board, which matches runs to a repository by string, would list that run
  with none of the others. A relative `repo` is passed on as sent, for the package to refuse. The package's refusals are 422s, word for
  word. The body's shape is the api's own, 400.
- **`DELETE /api/inbox/:name`** drops through `dropFromInbox`. `inboxNameRefusal` is a 400 before anything is read, and a card that is not
  there is a 404 worded by `noCardLine`.
- **Both writes pass the guard** (`refusedBeforeReading`), with guard words of their own. `guard.ts` now counts six writes. A drop sends no
  body, but its content type is held to `application/json` all the same, as every guarded write's is.
- **`POST /api/runs` takes `card`** beside `workflow`, `brief` and `after`, and starts through `startFromInbox`. The workflow is the folder
  `folderOf` found, the caller's repository is the api's, and the card's `repo:` is over it. With a card, `brief` may be left out, for the body.
  A blank one is the package's to refuse. `card` is shaped first (400, `inboxNameRefusal` for a name), before any folder is read. The
  package's refusals (`exitCode` 2) get a status by what is on disk once refused: 404 when the card's file is not there, 409 when a record
  names the card, 422 for the rest (a card that does not read, a blank brief, `afterRefusal`). The answer is
  `{ id, card, removed, why? }`: a card whose removal failed started all the same.
- **The page** (`apps/web/src/routes/inbox.tsx`, Inbox first in the sidebar):
  - a box that files a card: the idea, a workflow among those that read (none by default), and the repository, the api's own
    (`GET /api/repository`) until a person changes it;
  - the cards, newest first (`newestCardsFirst`), each with its first line, name, workflow, repository and filing time, and Start and Remove;
  - a card a record names links to its run and offers Remove only;
  - an entry that does not read shows its refusal, and offers Remove when it is a `.md`;
  - an empty inbox says to file an idea in the box, or with `wf inbox add`.
- **Start** opens the start form: the workflow preset by `presetOf`, the brief prefilled from the body, and `StartRun` with its `AfterPicker`.
  `presetOf` finds the card's workflow as `workflowFolder` does: a name is the repository's workflow, never yours, and an absolute path is
  that folder. A name on a card whose `repo:` is another repository presets nothing (`namedElsewhere`). The start would look for it in that
  repository, so the api's workflow of the same name is another workflow. The page says whose workflow the card names. From review, round 3:
  it preset the api's `dev`, and Start ran it on the card's repository. A start the api took opens the run's page. A start whose card could not be removed stays on the page: the start form goes,
  and the card says it was started as the run, with the api's `why`. The page keeps that `why` itself (`kept`), since the inbox read again
  after the start names the run and not why. From review, round 2: the form showed `why` at first, but the re-read unmounted it at once. `StartRun` and `AfterPicker`
  moved from the Workflows page into `components/StartRun.tsx`, and that page behaves as before. For a card, the picker lists the runs of
  the card's `repo:`.

What was measured:

- `apps/api/test/inbox.test.ts`, 15 tests: the listing (none, bodies, filing times, a refused entry with no body, `started as`, a card
  dropped between requests); filing by name, yours by folder, one both have by `from`, one about another repository by folder; every shape
  refusal; the package's refusals compared with `addToInbox`'s own message; a drop, and a drop's 404 and 400s (a hidden name, and `/` and `\`
  sent encoded, which the route decodes); the guard on both writes (three content types and none, three sites, three hosts), then the board's
  own headers taken; a card started with an edited brief, a workflow over the card's, and `after`, with `from` on the record and the card gone;
  a start with no brief, from the body; a card not there (404, the package's sentence compared with `startFromInbox`'s own), with `.md` too;
  started already (409), a blank brief, a card that does not read and an `after` that does not exist (422); `card` and `brief` of the wrong
  type; the guard on a card start, the card kept. From review, round 2: a `repo` with a trailing slash, two slashes, `/./` and a `..` is
  written as the api's repository, and a card filed with one records the run's `repo` without it; and a start with the inbox read-only (skipped
  as root) answers 201 with `removed: false` and the package's `why`, writes the record, lists the card as started, and refuses a second start.
- Each api guard was broken on purpose and the file rerun. 22 breaks, each failing 1 or 2 tests: either write unguarded; the drop's name not
  refused in the route; a drop of no card answered 200; a workflow path taken; `from` without a workflow taken; a non-string idea or repo
  taken; yours written by name; the repository's by folder; another repository's by name; the package's filing refusal as 500; the body not
  read; the card's name not refused in the route; a non-string card or brief taken; a missing card as 422; a started card as 422; every card
  refusal 422; and the card start dropping `after`, `brief` or the workflow found. From round 2, two more, each failing 1: the `repo` written
  as sent, and a relative one resolved against the api's directory.
- `apps/web/test/inbox.test.ts`, 7 tests: the order, including ties and an unknown time; the preset for a name, a path, and a path with a
  trailing slash; no preset for none, an unknown name, one that does not read, a name only yours has, relative paths, and `.` and `..`;
  `fileCard`, `dropCard` and `startRun` with `card`: what is sent, and the api's refusal verbatim. From round 3: no preset for a name on a card
  about another repository, one whose path starts with the api's included, and a preset for the api's own written with a trailing slash, and for
  an absolute path whatever the card's repository. Three breaks, each failing 1 or 2: the card's repository ignored, a trailing slash read as
  another repository, and a path treated as a name. Eight breaks: seven failed a test. The one
  that did not was the relative-path check in `presetOf`, which was dead code, since no such path is a workflow's name. It was removed.
- `npm run e2e`, the `inbox` page, in both themes:
  - the seed writes two cards into the store's `inbox/` (`seedInbox`), one with `workflow:` and `repo:` and one with neither, dated apart;
  - the page lists both newest first, each by its first line alone, and only the first names a workflow;
  - a card filed from the box, with a workflow and the prefilled repository, is written as `wf inbox add` writes it, listed first, then
    removed with its Remove, both through the proxy;
  - the start form shows the preset workflow, the prefilled brief and the six runs to wait on;
  - in pages of their own: a card started with an edited brief, which opens the run's page, writes `from`, `brief`, `workflowDir` and `repo`,
    and removes the card, all taken back; a card a record names, linked, with no Start; an empty inbox; and a start refused because the card was
    dropped behind the page's back, whose 404 and its console line are all its watch sees, with the sentence beside the form verbatim and no
    record written; and, from round 2, a start with the inbox read-only, which stays on the inbox and whose card says it was started as the
    run, with the api's `why` word for word, after the inbox is read again, with no Start and no form. That case was run against the page as
    it was before the fix, and failed on the missing `why`; and, from round 3, a card written by hand about another repository that names
    `dev`, whose start form presets nothing, names that repository, and has no Start until one is picked;
  - the pictures (`inbox`, `inbox-start`, `inbox-started-as`, `inbox-kept`, `inbox-elsewhere`, `inbox-empty`, `inbox-refused`, each in both
    themes) were read. They showed the
    box's workflow option cut short, and a rule drawn twice in a card's start form. Both were fixed and photographed again. Then, in a browser
    on a scratch store: a filing refused for a relative repository, and a card filed with `wf inbox add` and started with another workflow,
    which opened its run and left the inbox.
- From the root, `npx turbo run test --force && npm run typecheck && npm run build && npm run e2e` exited 0: agent-engine 307 (299 passed,
  8 skipped), agent-workflows 427 (426 passed, 1 skipped), api 150 and web 180. After round 2, the same: api 152, the rest unchanged.

What it leaves:

- **Only the run's page says a run came from a card.** `RunDetail` carries the record's `from` and `fromNote`'s sentence, which the page
  shows under the brief, as `wf decide` prints it under the run's line (three small items, 2026-09-16). The Runs list and the Factory's card
  do not, as `wf ls` does not.
- **The board lists the api's repository's workflows alone.** A card about another repository that names its workflow by name presets
  nothing. The page names that repository and offers `wf start`, which finds the workflow there. A workflow picked from the list runs its
  folder on the card's `repo:`.
- **A card whose workflow is not listed** (a relative path, a folder elsewhere, one that does not read) presets nothing, and the page says so.
  The board starts only a workflow it lists, as a start from the Workflows page does.
- **Why a card's removal failed is shown once.** Only the start's answer carries it. The next visit says the card was started, and not why.
- **A refused Start or Remove is kept by the page, and by nothing else.** The page reads the inbox again after any answer to a start or a
  drop (three small items, 2026-09-16; the board half's last review found a 404 or 409 left the card listed with its refusal until a reload).
  A card gone behind the page's back leaves the list, and the api's sentence stays in its place, dashed, until Dismiss; one a run started
  behind its back stays listed as started, with the sentence at its foot and no form. A reload, or the next visit, shows neither. The e2e
  makes each refusal: a start of a card dropped (404), a drop of one (404), and a start of one a record names (409).
- **A card written by hand with `repo: /code/app/`** is not normalised: `parseInboxCard` takes the path as written, and its run records it so.
  The board's filings and `wf inbox add` write it resolved. The package could resolve `repo:` when it parses a card.
- **The filing time is the file's mtime.** A card edited by hand moves up the list. The package has no filing time to give.
- **The listing does not carry the body.** The api reads every card twice a request: once in `readInbox`, once for its body. A card that is
  gone, or no longer reads, between the two is listed as `readInbox` saw it, with no body.
- **Two starts of one card at once both start**, as the package half left it. The board's Start is disabled while its request is pending,
  which covers one page, not two.
- **Remove asks nothing first.** A card dropped is gone, as with `wf inbox rm`.
- **The page is not polled.** A card filed or dropped in a terminal shows on the next visit.
- **The Capabilities page reads ask rules, and no rule written with a glob tool name.** `permissions.ask` is listed beside the deny rules, and what it covers — a read-only command, an allow, a server's tool — is marked asking, and denied on a dontAsk step — the read-only command struck, a server's tool shown amber as asking (two findings, 2026-09-16); `*` or `mcp__*` in a deny or an ask rule is read as nothing.
- **The read-only commands are 2026-09-15's measurement, under that day's settings, and are not measured again.** A guard refuses the list without a day, a version or a source, and no test holds it to today's `.claude/settings.json` (two findings, 2026-09-16).

## Shipped: forgetting a run — `wf rm`

Item 1 of this list, built a second time. The first build (`add-a-wf-rm-runid-verb-to-th-sd0s`) was deleted unmerged on 2026-09-12:
it predated the structured closeout and conflicted with master in three files. One bug it found was kept as `0e7b02a`, and its review's
seven lessons were carried into this one. The store only grew. Every run left its record, `runs/<id>/`, its asks, sometimes a
cancellation, a worktree per step with a `node_modules` of its own (one on this machine is 1.1 GB), and a branch per step. Removing any of
it by hand left git's worktree list stale and a record pointing at nothing.

What was built:

- **`wf rm <runId> [<runId> ...]`**, each run judged on its own, one line each (`forgetLine`). A run refused, or held by a worktree git
  would not remove, makes the verb exit 2 once every run has had its line. The CLI refuses `--force-unmerged` without `--delete-branches`,
  a flag it does not take, and flags with no run, before any run is read.
- **The pure part, in run.ts.** `forgetRefusal` names every reason at once, each with what to do. It refuses a task in flight (a step or its
  check, pending or running), anything a pass would file (a step ready, a check, try or round due, roots waiting on runs), an ask no pass
  has spent, and a run another run waits on and has not started on (`gated`), naming the runs it would strand. The last two apply to a run
  nobody called off: a cancelled run whose tasks have settled is forgettable. `runWorktrees` takes only what git lists inside
  `worktrees/<id>/`, with the step a hand-off commits under: the last step on the record that works in the directory, or its directory's
  name. `branchFates` takes only `wf/<id>/…` branches. `checkLogsOf` takes `<id>-<step>[-try<n>]-check.stderr` for the record's steps,
  or, with no record, any under the id that could be no other stored run's, whose id is longer or shorter. `idRefusal` takes only what
  `runId` mints: lowercase letters, digits and dashes.
- **`forget` in runner.ts**, in an order a `wf rm` that dies can finish when run again. It reads the run as `cancel` does, adopting a check,
  try or round a pass filed and never wrote down, and a step too (`unrecordedSteps`), on a cancelled run as well. Then the worktrees: each
  handed off (`handOff`, now answering with the commit it made, or git's words when it could not make one) and removed with
  `git worktree remove`, never `--force`, then `git worktree prune`. What holds the run, with nothing else removed: a worktree locked or on
  no branch (`heldWorktree`, pure: detached, unless clean with its HEAD on a branch), a hand-off git refused, a removal git refused, and a
  directory in the run's own that git does not know. Then the branches as asked, the record, and
  every file under the id, the record first so a run is never read without its cancellation. The engine's tasks are not touched.
  Paths are compared as git names a worktree, with every link followed (`resolved`). Git lists a worktree by its real path, so a store
  under a link, such as macOS's `/var` in `/private/var`, would otherwise read each worktree as a stray and hold the run for ever.
- **A pass that finishes after the removal does not recreate the record.** `advance` writes back through `rewriteRun`, which opens the
  record `r+`: that never creates a file, and a record unlinked after it is opened takes the write with it. `consumeAsks` makes `done/`
  without `recursive`, so it never makes the asks directory again. `listRuns` skips a record removed between listing the directory and
  reading it, which used to throw out of `tick` for every run on the machine. `writeRun` is `start`'s alone.
- **Nor does a pass file into a run called off or forgotten while it worked.** `advance` reads the record and the cancellation again before it
  cuts a worktree, after the cut, and before each try, round and check it files (`mayFile`), and once either says so it files nothing more
  on that pass. A cancelled run's pass stops a step a pass filed and died before writing down, as it stops what the record names. It hands
  a step off and collects its files only while the record is there, read at each.

What was decided, and why:

- **An ask no pass will file still refuses**, with the `rm <file>` that takes it back. Forgetting it silently would drop a person's word,
  and `wf cancel` does not help: `cancelPlan` reads a run with nothing due as finished and marks nothing.
- **A held run keeps everything but what git removed.** Its record is what `wf rm` finds it by. Removing `.cancelled` while the record
  stays would make a cancelled run read as live, and the tick file its next step.
- **A record with no run is swept of its files, never of worktrees.** A `wf rm` that died after removing the record is finished that way;
  nothing says whose worktrees are in a directory with no record, so it is named and left.
- **The hand-off commits leftovers as the tick does**, including a check's untracked litter. Keeping a failed step's work outweighs a
  commit a person can see on the line and on the branch.
- **A hand-off git refuses is reported, not bypassed.** Committing with `--no-verify` and signing off would keep the work, but a hook may be
  what keeps a secret off a branch, and the tick's hand-off honours it too. The work stays in the worktree, staged, and the line says so.
- **A detached worktree that loses nothing is removed.** Clean, with its HEAD's commit on some branch, it holds only a rebase's or a bisect's
  state, and its commits are where they were.
- **Merged means git's `merge-base --is-ancestor` against the run's base branch**, and `git branch -D` only after that answer. `git branch -d`
  judges against whatever is checked out.

Round 2's review found three ways to lose work or strand a session, and each was fixed. A pass that read a run before `wf cancel`, still
cutting its step's worktree, filed the step after `wf rm` had removed the worktree and the record: `wf cancel` then `wf rm` is what the
refusal tells a person to type, and on a cancelled run nothing judged a ready step. A hand-off git refused was swallowed, and the line passed
on git's `--force` for the dirty tree. And a worktree on no branch was handed off and removed, its commits with it.

Round 3's review found an id that could name another run's files, and a pass that made a forgotten run's files directory again; both
were fixed. `idRefusal` took dots, so `wf rm r-xyz.json`, as `ls runs/` gives it, found no record at `runs/r-xyz.json.json` and swept
`runs/r-xyz.json` as that id's own directory: a live run's record, with nothing asked, exit 0. `.cancelled` and `.asks` did the same to a
cancellation and a person's asks. Its sibling without a dot: with no record, `wf rm r-xyz-implement` took `r-xyz`'s check logs. And a pass
that read a `--no-worktree` run before `wf rm` handed its step off and collected its files after: the repository was still there, so
`runs/<id>/` came back with no record, and a person's edits were committed under the step's name.

**The lesson a record that never froze its workflow taught.** Five runs from 2026-09-13 predate the run freezing its workflow, so every
pass reads their folder from disk (`stepsOf` falls back to `loadWorkflows(run.workflowDir)`). Measured 2026-09-16: with that folder renamed
away, `wf ls`, `wf decide` and `wf tick` all died with `no workflow folder`, the tick for every run on the machine. So such a folder cannot
be deleted until those runs are forgotten: `wf rm` them first, then delete it. `wf rm` still forgets one whose folder is already gone. No
pass can file anything of it, so nothing ready needs judging: `forgetRefusal` takes `steps` undefined and judges its tasks in flight, its
asks and the runs that wait on it. The line ends `its workflow was never frozen, and no workflow folder at <dir>`.

What was measured:

- `test/run.test.ts` (12 new), pure: a run that is over is forgotten (finished, failed, cancelled and settled, tasks the engine no longer
  knows); refused in flight, cancelled or not; refused on a step ready, a check, try or round due and roots waiting on runs, each
  forgotten once cancelled; an ask due, one no pass files, one spent, and asks on a cancelled run; a run waiting on it, and children that
  started, were cancelled or wait on another; every reason at once; a record whose folder does not read; `parseWorktrees` and
  `runWorktrees` against the repository, a longer id's directory and the run's own, with `HEAD` and `detached`; `heldWorktree`;
  `branchFates`; `checkLogsOf`, sparing a stored run whose id the given one starts with; `idRefusal`, an id with a file's suffix told the id;
  `forgetLine`'s words, for a detached worktree and a hand-off refused too.
- `test/store.test.ts` (14 new), over real git and the fake engine: a failed step's run forgotten through the CLI, its file left after the
  last pass committed on its branch and nothing git ignores, a link in `node_modules` not followed, the record and every file under its id
  removed, another run's check log left, the board untouched, and a second `wf rm` saying `no such run`, exit 0. Four refusals in one `wf rm`
  beside a run forgotten, exit 2, then each forgotten once cancelled. A check filed and never written down holding a cancelled run until it
  settles. A locked worktree and a stray directory holding a run, then finished. `--delete-branches` and `--force-unmerged`, a
  `--no-worktree` run's base branch untouched, and the CLI's refusals, `..` among them. A pass held on the engine across a `wf rm`, writing
  nothing back; asks removed as a pass reaches them; a record gone between listing and reading. An unfrozen record whose folder is gone,
  and a run with no record whose files are left. Round 2's: a pass held inside `npm ci` by an `npm` first on PATH that waits, while
  `wf cancel` and `wf rm` run, filing nothing and making nothing of the run again; the same with `wf cancel` alone, the worktree then
  forgotten; a step filed and never written down on a cancelled run, refused, stopped by the next pass, then forgotten; a pre-commit hook
  refusing the hand-off, in its words (on stderr, on stdout, and silent), the work staged in place, then forgotten once a person committed
  it; a detached worktree with a commit held, the same with uncommitted work at a commit on a branch, forgotten once on a branch that keeps
  the commit, and a clean detached one at a branch's commit removed. Round 3's: `wf rm <id>.json`, `.cancelled` and `.asks` on a live run,
  and ids with uppercase, an underscore or a dot, refused with exit 2 and the record, cancellation and ask left; `wf rm <id>-implement`
  leaving the live run's check log; a pass held across `wf rm` of a `--no-worktree` run, making no `runs/<id>/` and committing no edit.
- `test/forget-linked.test.ts` (1 new, a file of its own since `WF_ROOT` is read as the package loads): a store under a link, whose
  worktree git lists by its real path, forgotten with its work handed off.
- Each guard was broken on purpose and the tests rerun: the tick writing a whole record, 1 failing; `done/` made `recursive`, 1; `listRuns`
  throwing on a vanished record, 1; nothing in flight read, 3; nothing due read, 3; a waiting run not held, 1; unspent asks not held, 2; a
  cancelled run's asks held, 2; stranded runs not read, 3; a started child counted, 1; any listed worktree taken, 1; any `wf/<id>…` branch
  taken, 1; an unmerged branch deleted without `--force-unmerged`, 2; check logs by prefix, 1; no hand-off before removal, 1; strays not
  looked for, 1; `--force-unmerged` alone taken, 1; no adoption, 1; any id taken, 3 (and the test root deleted with it); paths
  compared as written, 1 (the run held, its worktree read as a stray). Round 2's: no re-read after the cut, 1; the re-read ignoring the
  cancellation, 1; no unrecorded step adopted by `wf rm`, 1, or stopped by a cancelled run's pass, 1; a detached worktree removed like any,
  2, or when clean whatever its commit, 2; a hand-off git refused passed over, 1; a silent refusal given no words, 1. A fallback to a hook's
  stdout failed nothing when broken — git hands a hook's stdout on as its stderr — and was taken out. Round 3's: dots taken in an id, 2;
  check logs sparing only longer ids, 2; a hand-off and collection with no record, 1.
- On a copy of this machine's `node_modules` (684 MB, 27,488 files) in a throwaway `WF_ROOT`: `wf rm` refused the running run in 2 ms, and
  once its step failed, forgot it in 550 ms, committing the file left in the worktree and leaving git's list with the repository alone.
- From the root, `npm test && npm run typecheck` exited 0: agent-engine 307 (299 passed, 8 skipped), agent-workflows 433 (432 passed,
  1 skipped), api 137 and web 174. Typecheck was clean in all four.

What it leaves:

- **A person's word in the moment `wf rm` works.** The judgement comes before the worktrees go. A `wf retry` or `wf round` typed on a run
  judged over, in the half-second its worktrees take to remove, can have a pass file a try into a worktree that is going, and the pass's
  write can land before `wf rm` removes the record. Closing it needs a mark of its own that `wf retry`, `wf round` and the tick read, such as
  `runs/<id>.forgetting`. The cancel-then-`wf rm` case is narrow, not closed: after its last re-read (`mayFile()`) a pass still awaits the engine's views and makes
  the artifacts directory before `e.file`, a few milliseconds in which a scripted `wf cancel x && wf rm x` could land (the last review).
- **`npm ci` still running when `wf rm` removes its worktree.** The pass files nothing after it, but an install writing by absolute path may
  put a `node_modules` back under `worktrees/<id>/`. Not measured with a real `npm`. A `wf rm` of the id then names the directory, and leaves
  it for a person.
- **`wf cancel` does not look for a step filed and never written down.** It says nothing was in flight; the next pass stops it.
- **The engine's board keeps a forgotten run's tasks.** `ae ls` lists them for ever, and the engine has no verb to drop a task.
- **A hand-off can make a merged branch read unmerged.** What a check left untracked is committed under the step's name as its worktree
  goes. `--delete-branches` then keeps the branch and says so, and the line names the commit.
- **`wf ls`, `wf decide` and the tick still die on an unfrozen record whose folder is gone.** Only `wf rm` reads past it.
- **The board.** `apps/api` has no route to forget a run. A run forgotten from the terminal leaves the Factory's list, since it reads
  `listRuns`.
- **A directory of worktrees with no record** is named, not removed: nothing says which repository holds them.

## Shipped: two small items from the plan's queue

- **Plan §6 item 28: `unsigned` is the last attempt's word.** `closeoutAsked` already read the last attempt's `reason`, and no test held it
  to that. Now two do, with a task of `maxAttempts: 2` whose attempt 1 went quiet (`unsigned`) and attempt 2 was `lost`: it reads `failed`,
  and one lost then quiet reads `unsigned`. The pure one hands `closeoutAsked` a fake view and reads `stepStatus`, `decision` and `listing`
  off it (`test/run.test.ts`); the store one files the step with `maxAttempts: 2` on the fake board and reads `wf ls`, `wf decide` and the
  try's brief (`test/store.test.ts`). Reading any attempt's reason instead fails both.
- **Plan §6 item 31: a round asked past a budget holds nothing on the pass before it is filed.** After `wf round --budget`, `wf ls` and
  `wf decide` still said the run waited on you for one tick (W7's last review): `assess` marked only the looping step running, so the target
  held on the round read `over budget`, and the run read failed. Now `roundSpans` names every step of each due round's loop, and `assess`,
  `listing` and `decision` read each by its own status, never held. Tested pure, with a round asked with a raise, beside a step that failed
  too, and with no round asked, one without `--budget` and one not above what was spent, which still read held; and on the store, through
  `wf ls` and `wf decide` between the ask and the tick. Breaking the fix in `assess`, `listing` or `decision`, or taking only the looping
  step, fails a test each.

## Shipped: the queue — a cap on runs in flight, and cards that start themselves

Item 3 of this list, registered 2026-09-16 by the operator: a Factory canvas filled for a week, cards queued, picked whenever a slot frees.
The workflow layer built its engine with `WF_MAX_CONCURRENT`, named in no document: a cap on sessions per harness, not on runs. Every run
started was filed on the next pass, however many were at work, and the inbox parked cards and started none. Now a cap holds runs in flight,
and a card marked to start on its own is started by the tick when a run slot is free.

What was built, the cap:

- **`WF_MAX_RUNS`**, read beside `WF_MAX_CONCURRENT` (`ceilings` in runner.ts), unset or 0 for no cap, today's behaviour. Anything but a
  whole count is refused by name, exit 2 (`runCapOf`), by `wf up`, `wf tick` and `wf ls`: read as no cap, a typo would lift the cap.
- **A pure admission gate beside `runReady`.** `slotNeed` says what a run asks of the cap: in flight — a step's or a check's task filed and
  not settled, or a started run nobody called off that the pass files something of — and whether it wants a slot: nothing filed, not called
  off, its `--after` runs shipped, a root ready. `runAdmitted` files a run's roots only while fewer runs than the cap are in flight, and never
  holds a run that has started. `admissionOrder` is oldest by `createdAt`, then id. `heldRuns` judges a whole store as a pass would.
- **`tick` in two halves.** Every started run is advanced first, and counted in flight once its pass is done (`Advanced.inFlight`: in flight
  when read, or it filed something). Then each run with nothing filed, oldest first, is advanced with the slot as counted so far (`advance(e,
  run, slot)`), and counted once it filed. Results come back in the store's order. Nothing is carried between passes.
- **The words.** `wf ls` says `waiting for a run slot (2 of 2 in flight)` on a held run's roots (`listing`'s `slot`, `slotWord`), judged over
  the store by `runSlots` with the cap the last pass ran with (`$WF_ROOT/tick.json`, `lastCeilings`); `wf tick` on the run's line; `wf decide`
  in place of `still running`. `wf up` prints both ceilings in words when it starts (`ceilingLines`).
- **The wait on the timeline.** The first pass that holds a run writes `slotHeldAt` on its record, and says so once in its notes. `timeline`
  then counts `createdAt` → first filing as the run's `slot` (`SlotWait`) and in its total's `queued`, on a `run slot` row of `wf decide`'s
  timeline: `still waiting` while nothing is filed, `not known` where the feed has no filing.

What was built, the cards:

- **`queued:`**, a third key in `INBOX_KEYS`: the ISO time the card was queued, which orders the queue. `parseInboxCard` refuses by name a
  value that is not such a time, and a `queued:` on a card with no `workflow:`, since nothing would say what starts it. `wf inbox add` refuses
  a `queued:` carried in by a file: a card is queued once it is in the inbox.
- **`wf inbox queue <name> [--workflow <w>] [--off]`** (`queueInInbox`) writes the key, `--workflow` writing `workflow:` too, and `--off`
  takes it back, the file written whole through a hidden file renamed over it (`queuedText`). Refused by name, exit 2 (`queueRefusal`): a name
  with no card, a card with no workflow and no `--workflow` — which writes both — one already queued, one a run was started from, and `--off`
  beside `--workflow`. `wf inbox rm` takes a card back too.
- **The tick starts the next card** once every run has been advanced, while a run slot is free — always, with no cap (`slotFree`): the
  oldest by `queued:`, then name (`queueOrder`), a card a record names as started left out, through `startFromInbox` with the card's
  `workflow:` and its `repo:` or else the daemon's repository (`tick(e, { repo })`; `wf up` and `wf tick` hand it `.`). One card a pass, so
  the next pass counts its run before another starts. `tick` now answers with a `Pass`: the runs, and what it did with the queue
  (`QueueStarted`), which `wf up` and `wf tick` log (`queueLine`): `started <card> as <runId>`.
- **A start that did not happen is written down** (`startQueued`, `QueueTry`): `$WF_ROOT/queue/<name>.json`, the tick's own file, holds when,
  the card's text, the repository it was tried on, why, and whether the package refused it (exit 2). `nextQueued` passes over a card refused
  as it stands — its text, and the repository it would be tried on — so the card behind it has its turn; an edit, `--off` then a new queue,
  or a daemon in another repository for a card that names none makes it a card to try again, and the pass removes the try that no longer
  reads. A failure that is not a refusal is tried again on the next pass, where the card keeps its place, and `wf up` says it once
  (`again`). `wf inbox` shows `queued 2 of 3`, and `not started at <time>: <why>` or `failed at <time>: <why>` beside the card (`inboxListing`,
  `inboxLines`).

What was decided, and why:

- **In flight includes a started run between two steps.** The spec's words were a task not settled, or a check running. But a run whose step
  just settled has nothing filed for the length of one pass, and judged then, a held run took its slot and the pass filed both. So a started
  run with something due counts, and `tick` advances started runs before it judges any other, which makes `wf ls` between passes and the pass
  itself agree.
- **A cancelled run counts until the engine has stopped what it had in flight.** The engine settles a stop on its tick, which `tick` asks for
  first, so a slot frees on the pass after `wf cancel` for a task that had not started, and a pass or two later for a live session.
- **Waiting on runs is from the hold, not from `createdAt`.** The time a run waited on its `--after` runs is not a wait for a slot, so on such
  a run the slot wait runs from `slotHeldAt`.
- **The record, and nothing else, says the cap held a run.** One field, written once by the tick, the record's one writer. A run the cap never
  held has no `slot` on its timeline at all, rather than `not known` on every run from before the cap.
- **No new field on a shape the board compares whole.** `TimelineTotal` keeps its keys (the slot wait goes into its `queued`), and `Listing`'s
  `slot` is there only on a held run, since `apps/api`'s tests compare those objects whole. So is an `InboxListing`'s `queued` and `tried`.
- **A refused card is written down and passed over, not tried every pass.** The brief's *one try per pass, no hot loop* read literally is a
  refused card tried again on every pass: it logged a refusal every four seconds and, one card a pass, held every card behind it for good.
  Nothing in memory could say it was tried, so the tick writes it down, in a file of its own outside the inbox, which is a person's; the card
  itself is left as it is. Keyed on the card's text and the repository it was tried on, so no verb has to clear it. This is a reading, and
  round 2's review asked a person to confirm it: a queue that stops at a refused card instead is one line in `nextQueued`.
- **Only the package's refusal lasts.** A start can also fail for reasons that say nothing of the card — git on the repository, a file
  that cannot be read — and those pass; so such a card is tried again on the next pass and keeps its place, and is said once.
- **The queue is in the order a person queued, and a refused card loses nothing but its turn.** Order by name would start `a-…` before a card
  queued an hour earlier. A card queued again is at the back.
- **`queued:` with no `workflow:` is refused by the parser, not only by the verb.** A card hand-edited into the queue with nothing to say
  what runs it would otherwise be tried, refused, and written down on every card like it.

What was measured:

- `test/run.test.ts` (7 new), pure: `WF_MAX_RUNS` refused as a word, a negative, a fraction and a unit, and unset, empty and 0 read as no cap;
  `slotNeed` for a task pending, running, between two steps, finished, waiting on a person, a check running, cancelled and still stopping or
  stopped, nothing filed, called off first, and waiting on a run before and after it ships; `runAdmitted` refusing at 2 of 2 and 3 of 2, and
  admitting below it, at cap 0, with no slot and for a started run; `heldRuns` oldest first with ties by id, a run in flight counted, a run
  waiting on runs neither counted nor held, and none with no cap; `listing` on a held run's roots and followers, and not on one started,
  called off, or waiting on a run; `ceilingLines`; the timeline's slot wait — measured, from the hold on a run that waited on runs, `not
  known` with no feed, `still waiting` with nothing filed, and none on a run never held.
- `test/queue-store.test.ts` (6, a file of its own since `tick` reads every run under `WF_ROOT`), over a fake engine that settles a stop on
  its tick: at a cap of 2, a third run not filed, and `wf tick`, `wf ls`, `wf ls <run>` and `wf decide` saying so, the hold written once; at a
  cap of 1, a run finishing and a run cancelled each freeing a slot on the next pass, taken by the run held longest, whose `wf decide`
  timeline shows the `run slot` wait; a run waiting on `--after` not counted, and the one after it held at 2 of 2; no cap and cap 0 filing
  all three at once; the oldest by `createdAt` admitted first against the id order; `wf up`'s two ceilings, and `WF_MAX_RUNS=two` refused by
  `wf up`, `wf tick` and `wf ls`.
- `test/inbox.test.ts` (4 new), pure: a queued card read, and `queued:` refused as a word, a date, a local time, an offset, an impossible date
  and a number, on a card with no `workflow:`, twice, and in a file given to `wf inbox add`; `queuedText` writing and taking off the key, a
  body that opens with a rule, and a text that would not read; `queueRefusal` on a started card, a queued one, and one with no workflow;
  `inboxListing`'s places by time then name, a started card out of the order, a refusal only while the text is the same, `nextQueued` passing
  over it, and `inboxLines`; `queueLine`'s three words. Two tests changed their expected words, for the new key and the new hint line.
- `test/queue-store.test.ts` (7 more): a card queued by the verb, started on the next pass with no cap on its workflow and repo, the card
  removed, `wf tick` and `wf up` logging `started <card> as <runId>`, and its roots filed on the pass after; a card with no repo started on the
  daemon's; at a cap of 1 a queued card waiting on a run in flight, started on the pass that sees it finish, and a second card held while its
  run waits for the slot; the oldest by `queued:` started first against the name order, one a pass, and a card not queued never; every
  refusal of `wf inbox queue` by name, `--workflow` writing both, `--off` and `wf inbox rm` taking a card back; a card queued and started by
  hand not started twice, nor, with its removal failed, by any pass after; a refused start named on `wf tick` and in `wf inbox`, the card as it
  was, not tried on the next pass while the card behind it starts, and tried and started once its workflow is back and it is queued again.
- Each guard broken and the suites rerun: no gate, 5 failing; started runs not counted, and the rest admitted in the store's order, 4;
  admission by id, 2; a run with nothing filed counted in flight for what is due, 4; a run waiting on runs wanting a slot, 1; the hold written
  on every pass, 1. For the cards: a refused card not passed over, 2; a card started with no slot asked, 1; the queue by name, 3; a started
  card kept in line, 2; `queued:` with no `workflow:` parsed, 2; a refusal matched whatever the text, 2; a queued card queued again, 2; any
  `queued:` value taken, 1.

Round 2's review found three things, each fixed:

- **`wf ls` and `wf decide` read the cap from their own shell.** The README's own example sets `WF_MAX_RUNS` on `wf up` alone, and from
  another shell a run the daemon held read plain `waiting`, and `wf decide` said still running; a shell with another value printed a wrong
  count. Each pass now writes the ceilings it ran with to `$WF_ROOT/tick.json` when they change (`recordCeilings`), the tick its one writer,
  and `runSlots` reads the cap there, falling back to the shell's own only before any pass has written it. Tested in
  `test/queue-store.test.ts` through `wf ls` and `wf decide`, run with no `WF_MAX_RUNS`, with `5`, `1` and `two`; with the file removed, the
  shell's own; and a pass with no cap writing `0`, which a shell setting `1` reads. Reading the shell again, and a pass not writing, fail it.
- **A queued card whose `repo:` folder was deleted left the queue with nothing said.** `parseInboxCard` refuses a `repo:` that names no
  directory, so the listing had no `queued` for it, and no pass tried it: `wf up` said nothing, though the brief names the repository gone as
  a refusal said there. `inboxListing` now reads such a card's `queued:` without the directory check, so it keeps its place beside why it
  does not read; the tick tries it, `startFromInbox` refuses it by name, and the refusal is written down as any. `--off` takes it back without
  the check. Tested pure in `test/inbox.test.ts` — a card with another fault is in no queue — and in `test/queue-store.test.ts`, deleting a
  queued card's repository: named on `wf tick` and in `wf inbox`, the card behind it started on the next pass, and taken back. Leaving it out
  of the queue fails two; `--off` with the check, one.
- **Every failure of a start stuck as a refusal**, and a refusal stuck wherever the daemon ran. The catch wrote down any error — git failing
  once while `start()` read the repository — and a card with no `repo:` refused because `wf up` ran in the wrong repository stayed refused
  from the right one. Now only an error with exit code 2 is a refusal (`QueueTry.refused`), and it is keyed on the repository it was tried on
  as well as the card's text; any other failure is tried again on the next pass, in its place, said once. Tested pure — a card refused on
  one repository tried on another, a failed card not passed over, both on `wf inbox` — and in `test/queue-store.test.ts`: a queued card on a
  directory with no git failing with git's words, tried on every pass while the card behind it waits, said once over two passes of `wf up`,
  and started once git is there; and a card with no `repo:` refused on a repository with no such workflow, passed over there, and started in
  one that has it. Every error lasting fails one; a try not keyed on the repository, two; failures passed over, three; a failure said, or
  written, on every pass, one each.

What it leaves:

- **The board.** `apps/api` passes no slot to `listing`, so the Factory and the run page say `waiting` on a held run; its inbox page has no
  queue button and shows no place; and the Factory draws no ghost for a queued card. Left for the board.
- **A refused card stays refused when the world changes and the card does not.** Put the workflow back, and the tick still passes over it
  until a person edits it or queues it again: the refusal is keyed on the card's text and the repository it was tried on, and nothing else
  about the world is written down.
- **A failure that persists holds the queue behind it.** A card whose start keeps failing without a refusal — a `repo:` that is a directory
  with no git — is tried on every pass and keeps its place, so the cards behind it wait until a person fixes the repository, or takes the
  card back. It is said once on `wf up`, and in `wf inbox`.
- **A card with no `repo:` starts on wherever `wf up` runs.** `wf inbox` cannot know that directory, so a refusal that turns on it is seen
  only once the tick has tried.
- **`wf inbox queue --off` in the moment the tick starts the card** can write the card back after the start removed it. The record names it,
  so `wf inbox` lists it `started as` its run, and nothing starts it again: the guard that exists.
- **`wf ls` and `wf decide` read every run twice** when a cap is set and some run has nothing filed: once to judge the cap, once to list. Each
  view of a task in flight observes its harness.
- **`WF_MAX_CONCURRENT` is still read with `Number() || 2`**: a value that is not a number is 2, silently. Not asked; left as it was.
- **The cap counts runs, not sessions.** A run fanning out to three steps is one run in flight and three sessions against
  `WF_MAX_CONCURRENT`.
- **The ceiling that matters over a week is still the merge.** A child waits on its parent's merge, and every later run is cut from a main
  missing unmerged results: the operator merges daily, or a workflow's last step merges on a green trial merge. Not decided here.
## Shipped: markdown on the board, and a card's page with its keys explained

The board showed every piece of prose as preformatted text: a run's brief, a step's body, a closeout's summary and needs, each reply, a
question on the Decide section. Agents, folders and cards write all of it in markdown. A card was its first line on the Inbox page and a
step its spec on a node, and nothing on the board said what a key does. Only the conversation rendered markdown, through streamdown 2.6.0,
which rendered raw HTML through a sanitizer and drew code blocks unhighlighted without `@streamdown/code`. Read first: CLAUDE.md's apps/web
lines, `components/Markdown.tsx`, and `KeyTable` and `AsWritten` in `components/FilePage.tsx`.

**The study, and the renderer chosen.** The plan step compared the candidates on `WebSearch` and `WebFetch`, signed off `blocked` with its
recommendation, and the operator approved it: **react-markdown 10.1.0 with remark-gfm 4.0.1.** It is the only candidate that is safe as it
ships *and* hands the board React elements, so a fenced block goes to the shiki `CodeBlock` already there as a component, with no HTML
string set anywhere.

| | react-markdown + remark-gfm | marked | markdown-it | micromark and mdast by hand | streamdown (what was there) |
|:--|:--|:--|:--|:--|:--|
| Output | React elements | an HTML string | an HTML string | hast, to React through `hast-util-to-jsx-runtime` | React elements |
| Raw HTML, as shipped | turned into text | rendered: "Marked does not sanitize the output HTML", DOMPurify recommended | escaped (`html: false`) | as the glue decides | rendered, through `rehype-sanitize` and `rehype-harden` |
| Links, as shipped | `defaultUrlTransform` empties any protocol but http(s), irc(s), mailto, xmpp | as written | `validateLink` refuses `javascript:`, `vbscript:`, `file:`, most `data:` | as the glue decides | a link modal |
| Code through `CodeBlock` | `components.pre` | a string, or a renderer that returns one | `highlight` is synchronous and returns a string | a component, glue owned here | its own block, plain without a plugin |
| GFM | all five with remark-gfm | built in, footnotes by extension | tables and strikethrough; autolinks with `linkify`, off as shipped; task lists and footnotes are plugins | micromark-extension-gfm | remark-gfm |
| Size, gzipped (bundlephobia) | 34,090 + 9,811 B | 13,250 B, + 10,739 for DOMPurify | 40,507 B | 14,568 + 7,136 + 14,971 + 5,340 + 9,977 B | 147,624 B |
| Last release | 10.1.0, 2025-03-07 | 18.0.13, 2026-09-12 | 15.0.2 | micromark 4.0.2, 2025-02-27 | 2.6.0, 2026-08-24 |
| Licence | MIT | MIT | MIT | MIT | Apache-2.0 |

What it cost against the others: about 44 kB gzipped where marked with DOMPurify is about 24 kB; two dependencies added for the one removed;
and a last release eighteen months old, where marked and streamdown released this month. Why not the others: marked renders raw HTML and
needs a sanitizer over a string; markdown-it is safe as it ships but gives a string, and its synchronous `highlight` cannot wait for shiki's
lazy grammars; micromark and mdast by hand is react-markdown's own pipeline with its glue owned here; keeping streamdown meant overriding
four of its defaults (raw HTML, the link modal, plain code, a streaming mode the board never uses) on 147.6 kB. The GFM claims are the
projects' own: nothing here ran the GFM spec against a renderer. Sources, fetched 2026-09-16 by the plan step unless marked: github.com/remarkjs/react-markdown,
raw.githubusercontent.com/remarkjs/react-markdown/main/lib/index.js (its `safeProtocol` and the raw-to-text transform, read again in
`node_modules/react-markdown/lib/index.js` by implement), its `changelog.md`, registry.npmjs.org/react-markdown/latest,
api.github.com/repos/remarkjs/react-markdown and its `releases/latest`; github.com/remarkjs/remark-gfm; github.com/micromark/micromark
and its `releases/latest`; cdn.jsdelivr.net/npm/markdown-it@15.0.2/dist/markdown-it.d.mts (the `html`, `highlight` and `validateLink`
lines fetched again by implement), cdn.jsdelivr.net/npm/markdown-it@15/README.md, registry.npmjs.org/markdown-it/latest;
marked.js.org (its sanitizing sentence fetched again by implement), marked.js.org/using_advanced,
api.github.com/repos/markedjs/marked/releases/latest; streamdown.ai/docs/security, /docs/configuration, /docs/code-blocks,
/docs/plugins/code, raw.githubusercontent.com/vercel/streamdown/main/packages/streamdown/package.json and its releases;
bundlephobia.com/api/size for each package (dompurify 3.4.15).

What was built:

- **One `Markdown` component** (`components/Markdown.tsx`) on react-markdown with remark-gfm. Raw HTML stays text and a link's address
  passes react-markdown's own check, both as it ships; nothing adds `rehype-raw` or a `urlTransform`. A link opens in a new tab with
  `rel="noreferrer noopener"`; one whose address was emptied is its words, and a footnote link stays in the tab. A fenced block is the
  shiki `CodeBlock`, its fence mapped to the six grammars it loads by `languageOf` (`lib/markdown.ts`, pure), anything else shown as text.
  Two rules the request did not name: an image is a link to it, never fetched, since an agent's text can name any address; and headings
  go two levels down (`#` is an h3), so a text never stands level with the page's h1 and h2, which the e2e's section locators read. Each
  text's footnotes get a prefix of their own, the label's id included (`labelFootnotes`), so two closeouts on one page link each to its
  own. Tailwind classes per element for both themes, sizes in `em`, so a text takes the size of the box it is in. Memoized on the text.
- **Where it renders:** a run's brief, each step's body and its closeout's summary and needs on the run page; the Output tab's summary,
  needs, and each reply's finding and why; a question on the Decide section's answer and raise rows, under `asks:`, in a box that scrolls
  where it was clamped to four lines; the conversation's said turns, thoughts and closeout; a workflow's description on the Workflows
  page; a card's body and a step's body on their pages; and each key's meaning. A reply reads finding, then `→ answer · why` beneath it,
  where it was `finding → answer (why)` on one line: the finding and why may be more than a line.
- **What stays plain:** the run page's banner and the Factory's cards and nodes, one-line clamps by the operator's decision on the plan;
  `wf decide`'s screen; a person's own words (`Told`, `your answer`); declared output values; refusals.
- **Streamdown is gone.** `ai-elements/response.tsx` is deleted, `reasoning.tsx` renders `Markdown`, and `styles.css` loses its `@source`.
- **A card's page, `/inbox/<name>`**, from the card's title on the Inbox page: the body rendered, then a row per key an inbox card may
  set — its value or `not set`, and one line of what it means — and **Source**, a toggle to the file as written, frontmatter included. A file in
  the inbox that is not a card has a page too, its refusal and its text; a folder, whose name `sub/` the api refuses, has none (`hasPage`).
  **A step's page, `/workflows/<repo|yours>/<workflow>/<step>`**, the
  address the operator gave in approving the plan, from its block on the Workflows canvas and from a line of step links under each graph:
  the same, for every key a step may set, its value as the loader reads it, which the page says (`after` names the step `resume:` names; a
  loop that sets no `rounds` runs 3). Neither page writes. The menu lights the Inbox and Workflows on them.
- **The package's lines of meaning**, the one thing added to the package: `STEP_KEY_MEANINGS` beside `STEP_KEYS` in `workflow.ts`, a
  count's line being `COUNTS`' own (so `COUNTS` moved up beside the keys), and `INBOX_KEY_MEANINGS` beside `INBOX_KEYS` in `inbox.ts`,
  re-exported from runner.ts. A key without a line does not typecheck.
- **The api**, a route per page, each finding what it reads among what the package lists and never by a path joined from the request.
  `GET /api/inbox/:name`: the card as the inbox lists it, `source`, and `keys` (null for an entry that does not read); a name that is not a
  card's is 400 in `inboxNameRefusal`'s words, a card not there 404 in `noCardLine`'s, naming the `.md` files as `wf inbox rm` does; a card is found before a
  stray file of its name. `GET /api/workflows/:from/:name/:step`, the page's own address: the step's body, `source`, and `keys`
  (`keyRows`); a `from` other than `repo` or `yours` is 400, a workflow `folderOf` does not find its 404, a folder the loader refuses 422
  in its words, and a step it did not load 404, naming the steps.
- **From review, round 2**, three findings, each fixed:
  - The step's page was first built under `steps/`, as a run's step is, against the operator's answer, which named
    `/workflows/<repo|yours>/<workflow>/<step>`. It moved there, its api route with it.
  - A folder in the inbox linked to a page that refused its name, `sub/`. Only an entry whose name the api takes is linked now.
  - A card's page refused for a name not there named every entry, a stray file and a folder among them. It names the cards, as the
    package does.

What was measured:

- From the root, `npx turbo run test --force`: agent-engine 313 (305 passed, 8 skipped), agent-workflows 458 (457 passed, 1 skipped), api 161
  and web 201, from 313, 455, 156 and 189. `npm run typecheck` clean in all four.
- New tests. agent-workflows: each table's keys in order with one line each, the count lines as `countOf` refuses in, and the check
  refusing a key missing, out of order, extra, empty or on two lines. web: `languageOf`, `fencedCode` and `labelFootnotes`; `Markdown`
  rendered to markup for GFM, links, fences, and two texts' footnotes on one page; raw HTML inline and as a block (`<b>`, `<img onerror>`,
  `<script>`, `<div onclick>`, `<a>`) shown as text, `javascript:`, `vbscript:` and `data:` links refused, and an image never an `<img>`;
  the menu lighting a card's and a step's page, and not `/inboxes`; `hasPage` refusing a folder, a backslash, a hidden name and
  none. api: both routes' answers, a card with keys, with none and one that
  does not read; a step setting seven keys, one setting counts and one setting none; and every refusal above, `..%2F` in a name and a
  step, `README` and `review.md` as a step; a 404 in an inbox holding a
  stray file and a folder, held to DELETE's sentence for the same name; `notes.md` beside a stray `notes`.
- Each guard broken on purpose and the tests rerun: `rehype-raw` added, the raw HTML test failing; `urlTransform` passing every address,
  the link test; no image rule and no `target`, two; no footnote label prefix, one; the api's name refusal skipped, a missing card answered
  200, any `from` taken, a step found by a path joined from the request, a loader refusal answered 500, the 404 naming every entry, no card found before a stray file, and `hasPage` taking a slash, one
  each; a meaning deleted and one
  on two lines, the package's tests. In the e2e, `urlTransform` passing every address failed the card page: "no link on the page runs
  script — expected 0, found 1"; every inbox entry linked failed the inbox page: "has no page … expected 0, found 1".
- `npm run e2e`: a third seeded card in markdown (a heading, a list, a table, a bash block, a line of raw HTML, a link and a `javascript:`
  one) and review.md with a heading and a list. The card page and the step page, in both themes: each renders; the raw HTML is text with
  no `b`, `img` or `script` made of it; no link runs script; the link opens in a new tab; a row per key in the api's order with the api's
  value and meaning; Source equal to the file on disk, and back; the inbox and the checkout's `workflows/dev` unchanged. The Workflows page:
  the step links, and a link and a block each opening the step's page. The Inbox page with a stray file and a folder in it: the folder
  unlinked, and the file's link opening its refusal and Source. The PNGs were read. From them, markdown tables were narrowed to
  their content, the key table's value column narrowed, inline code kept whole across a line break, and card titles underlined.
- `vite build`: the lazy Conversation chunk went from 529.8 kB (160.8 kB gzipped) to 41.7 kB (12.8 kB), and a shared `Markdown` chunk of
  160.1 kB (48.2 kB) is loaded by the run page, the Workflows page, both new pages and the conversation. The run page's own chunk is
  35.4 kB (10.0 kB), as before.

What it leaves:

- **Text never meant as markdown now renders.** A brief or closeout typed before this with `**/*.ts`, `__init__`, a line opening with `#`,
  or an indented line (a code block) reads differently. The run page has no Source toggle for a brief; the record keeps the text.
- **The run page loads the markdown chunk on first visit**, 48 kB gzipped it did not load before. Lazy-loading `Markdown` would flash
  plain text on every run page; not done, not measured on a slow link.
- **The banner and the Factory still clamp a question to its lines**, as plain text: a question that is a list reads flat there.
- **Streaming is reasoned, not measured.** A said turn is one event's whole text, and the component is memoized on it; nobody has timed a
  long conversation.
- **react-markdown's last release is 2025-03-07.** A React or Vite change could wait on it; its pipeline packages built here through
  streamdown before, which lowers that and does not remove it.
- **A step's page shows the loader's values**, which can read as disagreeing with Source. The page says why.
- **Keyboard.** A block on the Workflows canvas is not focusable (`nodesFocusable` is off); the step links under the graph are the way by
  keyboard.
- **Neither page starts, drops or edits anything.** Starting a card is the Inbox page's; editing a step is §4's builder.

## Shipped: a gate — a step's handoff that waits for a person

§6 below, in full. `dev-planned`'s plan paused by prose: a brief that said to wait made it sign off `blocked`, a person answered with
`wf retry --message`, which cost a try, and a plan that signed off `done` started implement at once. The shape §6 chose held: the
handoff is the gate, not a step of its own. Package only; the board's Approve is the apps run after this one. Read first: the README's
*A gate*, `hasGate`, `atGate`, `approvalRefusal` and `approvedSection` in `run.ts`, `approve` and `readApprovals` in `runner.ts`.

What was built, four commits:

- **`gate: true` on a step**, in `STEP_KEYS` after `retries` with its line in `STEP_KEY_MEANINGS`; `gate: false` and any other word
  refused with the fix. **`wf start --gate <step>`**, once per step, and **`gate: <step>` on an inbox card**, in `INBOX_KEYS` (last) with
  its line, one step — a list and a step's `true` refused — carried by the listing, `wf inbox`'s line, `wf inbox queue` and
  `wf inbox add <file>`. Both freeze into `gates` on the record (`start({ gates })`, `startFromInbox({ gates })` with the card's first);
  the step's own `gate: true` is frozen with the workflow, and `hasGate` reads both. A step the workflow does not have, and a `--gate`
  given twice, are refused at start with nothing written (`gateRefusal`), in the card's words for a card's gate. `wf plan --gate` is
  refused by name. `workflows/dev-planned*` are unchanged, as §6 says.
- **Held by the tick.** In `standing`, after `held`: a gated step whose own work reads verified or unverified, with no approval of the
  try it is on (`approvalOf`), reads `awaiting approval` (`atGate`). It is in `stopsFollowers`, so what follows is `blocked` on every
  pass and `assess` reads the run `failed`, as a step signed off blocked does; `decision` gives it `awaitingApproval`, outcome `blocked`,
  and never `shipped` while one holds — not on work a person merged either — so `runReady` treats such a parent as not shipped. A
  looping step that asks for another round is not held. `listing` says the word, a note with `wf approve` and the send-back, and
  `onYouWords` makes `wf ls` say `waiting on you: approve plan`. Nothing is in flight while it waits (`slotNeed`).
- **An approval is a person's file**, `runs/<id>.asks/approve-<step>-<try>`, JSON `{ step, try, at, message? }`. §6 wrote
  `approve-<step>`; the number is the try it approves, as a retry ask's is, which is what lets a send-back spend it. `readRun` composes
  the live ones onto `run.approvals`, as it composes `cancelledAt`, and `rewriteRun` strips them, so the record keeps none and
  everything handed a run — `assess`, `listing`, `decision`, `composeBrief`, and the api, which reads runs through `listRuns` — sees
  them with no new parameter. An approval is never consumed while it opens the gate; one a later try spent (`spentApprovals`) moves
  into `done/` with the spent asks. A file named as one that does not read as one opens nothing, and the pass notes it.
- **`wf approve <run> <step> [--message "<words>"]`** (`approve` in runner.ts): writes the file whole and exclusively (`writeAsk`) and
  nothing else. Refused by name, exit 2, nothing written (`approvalRefusal`, pure): a run not there, a step the run does not have, a
  cancelled run, a step not gated, one not signed off yet — waiting, running, checking, blocked, unsigned, its check refused, failed,
  stopped, out of rounds, or asking for a round — the try already approved, empty words (`approvalWordsRefusal`, which the CLI asks
  before a run is read), and one §6 did not list: a send-back already asked for, which would spend the approval at once. A stray file at
  the name is named, with `rm`.
- **Sending back** is `wf retry --message`: `retryable` gives `nudge` and `fresh` to a step at its gate, or approved with steps after
  it and none of them filed (`sendsBack`) — not to an approved step nothing waits on, whose run is over (found in review, round 2), and `retryRefusal` refuses one without words, and `--recheck`. The try's brief says its handoff waited at its
  gate and was sent back (`triedFrom`, `retrySection`). `retryLines` offers a gated step nothing: `gateLines` does. `cancelPlan` calls
  a run at its gate off rather than finished; `forgetRefusal` holds it, naming the `wf approve`; `roundAsk` on a loop at its gate says
  to approve or send back, with `--budget` or without it (review, round 2). From review, round 3: the tick files no wordless ask at a
  gate (`heard` in `retriesDue`) — one taken while the harness blocked the session that then signed off would have sent the step back
  with nothing to change, before anyone read it — and `wf approve` and `wf retry` name such an ask and say to delete it; `wf approve` on
  a step already approved and handed on says so, rather than offer a send-back that is refused.
- **What the next steps are told**: `## Approved` (`approvedSection`), in every brief composed for a step after an approved gate,
  directly or through another (`upstreamOf`, now exported) — which step, which try, when, and the words, fenced — beside `## From run
  <id>` under what was asked for, and in a resumed step's brief. **`wf decide`** prints `AWAITING APPROVAL` among the verdicts and, under
  a gated step's name, `gate  approved 23:10Z — "<words>"` or `gate  awaiting approval:` with both commands (`gateLines`, on `decide`'s
  `gates`). `wf ls`'s vocabulary in the help, the keys line, `wf decide --help` and the README (*A gate*, the table, the closeout's part)
  say it.
- **One line outside the package**: `apps/api/test/inbox.test.ts` pinned three key rows, and the api lays out one per `INBOX_KEYS` entry;
  it gains the `gate` row. Nothing in `apps/*/src`.

What was measured:

- From the root, `npx turbo run test --force`: agent-workflows 517 (516 passed, 1 skipped), from 490; api 166 and web 203, unchanged;
  agent-engine 313 (305 passed, 8 skipped), unchanged. `npm run typecheck` clean in all four.
- New tests. `workflow.test.ts`: `gate: true` read, and `false`, other words, no value and twice refused. `inbox.test.ts`: a card's
  `gate:` through the listing, its line, `queuedText` and `ideaCard`; a list, `true`, no value and twice refused. `run.test.ts`: the
  hold over three passes, whatever the closeout; no approval but the try's own opens it; check first; the round not held; `wf ls`'s
  word, note and `approve plan`; `decision` blocked and not shipped, merged or not, and `runReady` on such a parent; no slot held;
  `gateRefusal`; every `approvalRefusal`; the send-back allowed with words and refused without or with `--recheck`, and refused once
  what follows is filed; `triedFrom` and the brief; `spentApprovals`; `cancelPlan`, `forgetRefusal` and `roundAsk` at a gate; `## Approved`
  to the next step and the one after, not before the gate or its approval, fenced, two gates, a resumed step; `gateLines`.
  `gate.test.ts`, new, on disk with a settled board: `--gate` and the card's gate frozen, and refused with nothing written; the hold
  across passes with `wf ls`'s line, another try's approval, another step's and a stray file opening nothing, and the approval never in
  the record; check then hold; a merged parent at its gate not shipped for `--after` until approved; `wf approve`'s file and every
  refusal, CLI flags included; approve, then send back before the tick — the approval spent into `done/`, the gate holding again for
  three passes, the approval copied back by hand opening nothing, and a new `wf approve` of try 2 filing implement; `wf cancel` and
  `wf rm` at a gate; `wf decide`'s lines and `## Approved` reaching implement and review.
- Each guard broken on purpose and the two gate test files rerun, each failing at least one test: no gate at all (9), an approval of any
  try (3), a merged gated run shipped (2), approvals written into the record (1), a round held (1), a gate before the check (2), no
  start refusal (2); in `approvalRefusal` no gate check, no already-approved, no pending send-back, no status check, no cancelled check
  (2 each); a send-back with no words (1); cancel at a gate called finished (2); `wf rm` at a gate (2); spent approvals not consumed (1);
  an approved step not sendable back (2); the round refusal (1); no `## Approved`, only direct dependents given it, the words unfenced (2
  each).
- The screens were printed and read at a gate: `wf ls`, `wf decide`, `wf approve`, and implement's brief. The `## Approved` paragraph was
  reflowed from them.

What it leaves:

- **The board.** The Factory's card saying `approve plan`, the run page's Approve with a box for the words beside the answer box that
  sends back, and `POST …/approve`. The api's words should already say `awaiting approval` for a gated step, waiting on you, since it
  reads runs through `listRuns` — reasoned from the code, not looked at; its `commandsOf` offers no approve line.
- **Approving costs a pass, not a try.** Nothing is filed until the tick after `wf approve`; the approval is read on every pass after,
  so a long-lived gated run reads one more small file per pass.
- **A gate on every round.** A gated step inside a loop — `--gate implement` on `implement ⇄ review` — is on a new try each round, so it
  waits for an approval each round. That follows from an approval naming its try; nobody has run a loop so.
- **An approval of a future try** written by hand opens that try's gate when it comes; the verb writes only the try the step is on.
- **The time on `wf decide`'s gate line** is `HH:MMZ`, with no day, as §6 wrote it.
- **Plan cards** (`wf plan`) take no `gate:`; a card's run is gated by its workflow's own `gate: true`, or by starting that card by hand
  with `--gate`.

What the board's run should call:

- **`approve(e, runId, step, message?)`** from `agent-workflows` (runner.ts): resolves `{ run, approval: { step, try, at, message? },
  file }`, or rejects with `exitCode: 2` and the refusal's words — `no such run: <id>. …`, and every `approvalRefusal` sentence: a step
  the run does not have, a cancelled run, `<step> has no gate: …`, `<step> has not signed off yet: …` (and its siblings, one per status),
  `try <n> of <step> is already approved, at …`, `try <n+1> of <step> is already asked for …`, `--message is empty, …`. A rejection
  without `exitCode` is not a refusal. Ask `approvalRefusal(steps, run, step, message, phaseOf, closeoutOf, askedCloseout, verdictOf,
  asks, spendOf)` from `agent-workflows/run` to grey the button out, with the same words.
- **Send back** is `retry(e, runId, step, { mode: 'nudge', message })`, as the answer box already calls it; without a message it is
  refused for a step at its gate.
- **A record carries** `gates?: string[]` (start-time gates; a step's own `gate: true` is on `run.workflow`), and, as read by `readRun`
  and `listRuns`, `approvals?: Approval[]` — `{ step, try, at, message? }`, composed from `runs/<id>.asks/approve-<step>-<try>`, never
  in the JSON. `hasGate(step, run)`, `gatesOf(steps, run)` and `approvalOf(run, step)` say what gates a step and whether its current try
  is approved.
- **What to show**: `stepStatus` and `listing`'s word `awaiting approval`; `listing(...).waitingOnYou` names the step, and `onYouWords`
  says it `approve <step>`; `decision(...)`'s `awaitingApproval` on an `awaiting` run, whose outcome is `blocked`; `gateLines(steps, run,
  phaseOf, closeoutOf, askedCloseout, verdictOf, spendOf)` for the line under the step. The closeout to render beside Approve is the
  gated step's own, as `closeoutOf` reads it.

## 1. A run that grows steps from a plan

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

## 2. Remote Control on a step, and a supervisor session

**Registered** 2026-09-16, by the operator: not now, but the ability has to exist. The aim is a session supervising the
whole workload — an orchestrator — that the operator can reach from a phone whenever something waits on a person: a
merge to accept, an answer to give.

**Measured** (2026-09-16, Claude Code 2.1.273, three throwaway Haiku sessions, each stopped and removed): a `claude --bg`
session is listed in the web's agents view only when its registration under `~/.claude/sessions/` carries a
`bridgeSessionId`, and it gets one only when started with `--remote-control`. Without the flag none appears, from a clean
environment or from the daemon's; with it, one appears at once. The engine's Claude runner passes no such flag, so every
worker it spawns is invisible there. A worker of the old hkb from 2.1.266 (2026-09-08) carries a bridge id, so Claude Code
used to bridge background sessions on its own. The docs do not say when that changed; an open Claude Code issue on
auto-registration with Remote Control fits.

**What it needs.**

- Engine: a field on the task — `remoteControl: true`, say — read by the Claude runner and passed as `--remote-control` on
  the spawn. A knob on the workload as a field carried on the task, never a default: Remote Control lets the session be
  driven from claude.ai or a phone, not only seen. Refused on a harness that has no such flag. A live measurement that a
  spawned worker lands in the agents view.
- agent-workflows: a step key — `remote:`, say — carried on every filing of the step as `budget:` is. Later, the
  supervisor: a session of its own, not a step of any run, that watches the store and acts, with Remote Control on. What it
  is told and what it may do is its own design; nothing here decides it.
- Board: the run page says a step's session is reachable from the phone when it is.

## 3. The queue: a cap on runs in flight, and cards that start themselves

Shipped 2026-09-17 as *Shipped: the queue — a cap on runs in flight, and cards that start themselves*, above, which says what was
built, measured and left. Left there for the board: the Factory drawing queued cards as ghosts. Which pending step gets a freed
session is the engine's (Engine-side work, below: filing order and `priority`). The number kept so §4–§7 keep theirs.

## 4. The workflow builder: steps and their edges drawn on the board, written back as the folder

**Registered** 2026-09-16, by the operator: define a step on the board, draw the workflow by dragging arrows between
blocks, and have the builder amend the folder's files to match. To be written as an inbox card.

**What exists.** The Workflows page draws a folder with React Flow (`apps/web/src/components/WorkflowCanvas.tsx`:
`SpecNode`, `stepEdges`, `nodesDraggable` off), read-only: no handles, no `onConnect`. The api lists folders from two
sources, the repository's `workflows/` and the store's (`sourcesOf` in `apps/api/src/workflows.ts`), and writes nothing
into the checkout; its six writes all go through the package. The package parses a folder (`loadWorkflows`, `STEP_KEYS`
the closed list of a step's keys, `COUNTS` what each count means, every refusal by name) and has no writer: nothing in
the packages renders a step back to markdown.

**What it needs.**

- **Package, small.** A pure `renderStep(step)` — frontmatter in `STEP_KEYS` order, then the body — the inverse of the
  parser, and a round-trip test: load, render, parse again, equal. `writeWorkflow(dir, steps, readme?)` in runner.ts:
  renders every step, parses the rendered folder in memory before a byte is written, so every parser refusal surfaces
  first (a key it does not have, `after:` naming no step, a cycle, a loop that is not a back edge), then writes the
  files, removes a step's file that is no longer in the set, and leaves `output:` schema files and the README as they
  are. Nothing in `assess`, `advance` or the run model changes: a run still freezes its folder at `wf start`.
- **Api, small.** `PUT /api/workflows/:name`, the seventh guarded write, the steps in the listing's own shape. Written
  to the store's folder ("yours") by default; the repository's only with `"from": "repo"`, which is a write into the
  person's checkout that git will show as changed — the one new kind of write on the board, and a decision to make
  before it is built. Read back after the write; refusals are the parser's sentences with a 422.
- **Board.** The Workflows page gains a builder mode: handles on the blocks; dragging from A to B writes `after: A` on
  B; a second handle for the loop edge (`loop:`, with `rounds:`); an edge deleted takes the key with it; a block added
  is a step with a name and a body; a step's inspector is a form drawn from `STEP_KEYS` and `COUNTS` (harness, model,
  effort, permission mode, tools, disallow, deadline, attempts, budget, check, retries, output, loop, rounds) and the
  body; Save puts the folder and shows a refusal by the step it names; unsaved changes are marked; a new workflow is a
  name and a first step. An `output:` names a schema file: point at one beside the step, or paste JSON to write one.
- **e2e.** A builder page on the temporary store: add a step, drag an edge, save, read the folder back through the
  api, and take the write back before the page ends.

About one package run and one or two `dev-build` runs; the second if the inspector's form is its own piece of work.

## 5. Markdown rendered on the board, and a card's page with its keys explained

Shipped 2026-09-17 as *Shipped: markdown on the board, and a card's page with its keys explained*, above, with the study's conclusion
and its sources. The number kept so §6 and §7 keep theirs.

## 6. A gate: a step's handoff that waits for a person

Shipped 2026-09-17 in the package as *Shipped: a gate — a step's handoff that waits for a person*, above, which says what was built,
measured and left, and what the board's run should call. The board half below — the Factory's card, Approve on the run page,
`POST …/approve` — is still to build. What was registered is kept as it was asked.

**Registered** 2026-09-16, by the operator: a card, then a plan, then a person reads the plan before anyone implements
it — and the same pause placeable in any workflow. Asked as a design question: is the gate the handoff, or a step of
its own that could go anywhere?

**What exists.** `dev-planned`'s plan step pauses by prose: a brief that says to wait for approval makes it sign off
`blocked` with the plan in `needs`, and a person answers with `wf retry --message` or the run page's answer box. Nothing
in the machinery holds it — a plan that signs off `done` lets implement start — and approving costs a try, since the
answer continues the agent's session so it can sign off again. The plan's §5 "no mid-run human gate; the run boundary
is the gate" predates the inbox and the board's answer box. A run already has one state a person owns, *waiting on
you*, with an ask file behind it and a box on the board; that state has three reasons today (blocked, unsigned, over
budget).

**The shape: the handoff is the gate.** Argo Workflows made suspension a step (`suspend`), Tekton a custom task; here a
step is a session on a harness, and a person is not a harness — a gate step would need a runner whose "session" is a file
that fills when someone answers, and a step whose body nobody writes. The handoff already has everything a gate needs.

**What it needs.**

- **`gate: true` on a step** — this step's closeout waits for a person before anything after it is filed. It composes
  with `check:`: verified first, then held. **And `wf start --gate <step>`**, or `gate:` on an inbox card naming a step,
  for a run gated at a step its folder does not gate. Both freeze into one field on the record, `gates`, read by `assess`;
  a step named that the workflow does not have is refused at start.
- **Held by the tick, level-triggered.** A gated step that signed off reads `awaiting approval`; nothing after it is
  filed on any pass until an approval is on disk, whatever the agent wrote. No session runs and no budget is spent while
  it waits. `wf ls`: `waiting on you: approve plan`; the run's outcome is `blocked` for `--after` and the Factory.
- **`wf approve <run> <step> [--message "<words>"]`** writes `runs/<id>.asks/approve-<step>` beside the retry asks — one
  writer, composed on read — with the time and the words; refused for a step that is not gated, not signed off, or
  already approved. Sending back is `wf retry <run> <step> --message`, as today: the session continues with the
  objection, signs off again, and the gate holds again; an approval given before the send-back is spent by it.
- **What the next step is told.** The approval and its words reach every step after the gate as data, `## Approved`
  under the brief, as a parent run's closeout does (`## From run <id>`): a person's decision on the record, read by the
  implementer and by the reviewer after.
- **`wf decide`** prints the gate under the step (`approved 23:10Z — "ship the second reading"`), and a run cancelled
  while gated is cancelled as any run is. `wf rm` refuses a run at a gate: something is due to be asked for.
- **Board.** The Factory's card says `approve plan`; the run page shows the gated step's closeout, rendered as markdown,
  with Approve (a box for the words) and Send back (the answer box that exists); `POST …/approve`, the seventh
  guarded write. From a phone once Remote Control (§2) lands.
- **`dev-planned` and `dev-planned-build`** put `gate: true` on `plan`? No: a folder decides for every run of it, and a
  plan that reads one way should start implement at once. Keep the folders as they are and let the card or the start
  say `--gate plan`; a `dev-gated` folder is not needed.

One agent-workflows run (the key, the record field, `assess`, the verb, the brief section, README, tests that refuse:
a gated step's dependents never filed without the file, an approval for the wrong step refused, a send-back spending
the approval) — about $40; then one apps run (the button, the card's need, the e2e) — about $30.

## 7. The web app's components on React Aria, not Radix

**Registered** 2026-09-17, by the operator: the shadcn base for `apps/web` should be React Aria rather than Radix.

**What exists.** `apps/web/components.json` says `"style": "radix-nova"`; `radix-ui` 1.6.7 and `shadcn` 4.21.0 are in
`apps/web/package.json`; the board's own components and the `ai-elements` ones compose Radix primitives (`asChild`
triggers, Radix menus and dialogs). The repository carries the `shadcn` skill (`.claude/skills/shadcn`, installed
2026-09-17), whose rules distinguish the bases (`base-vs-radix.md`, and the toast rule that names React Aria projects).
The e2e visits every page in both themes and finds elements by role and name, so a base switch that keeps the roles
keeps the checks.

**What it needs.** A study first, on `workflows/dev-planned-build` with the shadcn skill in hand: which bases the
installed shadcn CLI offers and the exact name of the React Aria one (`npx shadcn@latest info`, `docs`, and the
preset builder), which of the app's installed components exist for that base and which do not, and what the app's
own compositions must change (`asChild` and the like). Then the switch: `components.json` on the new base, each
component re-added with `--dry-run` and `--diff` and the local edits carried over, the app's compositions adapted,
`npm run build` and `npm run e2e` green in both themes, every page looked at (the `look` skill). What the base does
not offer is named, not worked around. The lockfile committed with the dependency changes.

One `dev-planned-build` run, the plan waiting for approval; likely the largest apps change so far.

## Engine-side work

Not agent-workflows features, listed so nothing is lost:

- waking the tick loop on harness registry changes instead of a timer (agent-engine README);
- the hkb migration ([agent-engine/docs/hkb-migration.md](../../agent-engine/docs/hkb-migration.md));
- ~~a task field for Remote Control~~ *done, engine `92d6783`: `remoteControl: true` on the task* (§2 above; the step key is W10's);
- ~~a `blocked` session holding a concurrency slot~~ *done, engine `912d537`*: count `working` only toward the ceiling and keep the wider
  set for what else `LIVE` guards; the README's sentence that a deadline is the only thing that frees such a slot, and the
  comment in `decide`, change with it; a test that refuses — two blocked sessions at a cap of two, and a third task starts.
  A session on a permission prompt makes no API calls, so it costs nothing against the rate limit the ceiling exists for:
  reasoning, not a measurement;
- ~~pools by subscription~~ *done, engine `912d537`*: `claude` and `claude-detached` counted as one pool, a harness declaring its
  pool with its own name as the default. The workflow layer's README, banner and `wf --help` say pools since `00d4c06`'s follow-up;
- ~~**admission in filing order, and a task's priority.**~~ *done, engine `92d6783`; the workflow layer's `priority: 1` on later filings is W10's.* The tick walks tasks in `journal.list`'s order, which is the ids
  sorted (`readdirSync(...).sort()`), and admits each pending one while `used < max`: so which of two pending tasks gets a
  slot is decided by the alphabet of their run ids, and a run never keeps its slot across its own steps — its next step is
  filed a check and a pass after the last ended, and any task pending in that gap takes the slot (measured 2026-09-16:
  a card's run filed at 23:53:07Z took the slot the engine lane's implement released at 23:53:18Z, and that lane's review,
  filed 23:54:44Z, then waited behind four sessions). Fix, engine: pending tasks admitted oldest `filed` first (the
  journal has the time), the ids' order kept only as a tiebreak; and a `priority` field on the task, a number read at
  admission and nowhere else, higher first and filing order within — a knob on the workload, carried on the task, so the
  workflow layer can give a run in flight its momentum by filing every step after its first above a new run's first
  (Kubernetes: a pod's `priorityClassName`). Tests: two pending tasks, the later-filed one alphabetically first, the
  earlier admitted; a higher priority admitted before an older lower one. agent-workflows then: `priority` on every
  filing after a run's first step, and the run cap (§3) unchanged.
