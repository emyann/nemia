# Features to build

The features agent-workflows is still missing, in the order I would take them. Each says what exists
today, what the feature has to settle, and what earlier work already taught about it. Bugs and open
questions live in [agent-engine/docs/open-issues.md](../../agent-engine/docs/open-issues.md).

State as of 2026-09-14: the check (package C of `docs/plan-hold-the-bar.md`, hkb-v2), declared
outputs (package J), a step's files directory with `workflows/ui/` (U1), a browser for every Claude
step (the repository's `.mcp.json`), a worktree's own `node_modules` with `.worktreeinclude`,
trying a step again with `retries:` and `wf retry` (§4 F), going round again with `loop:`,
`rounds:` and `wf round` (§4 R), a step's `tools:` and `effort:` (§4 I) and its `disallow:` (§4b), the decider screen
(§4 G), looking as a skill with `workflows/ui/` as implement ⇄ review (§4 U2), an answer for a step
that asks (`wf retry --message`) beside a step that plans (`workflows/dev-planned/`, §4 Q), a run
that waits on a run (`wf start --after`, the first half of §4 P), and three guards made to hold (a session
the harness blocked tried again, `shipped` with nothing past the base, an ask file that is not an ask), and a plan as a folder of cards whose waiting runs are handed their parents'
closeouts (`wf plan`, the rest of §4 P), and telling a running step something (`wf say`, with its route and the session page's
prompt box: the steering channel's upper half) have shipped.

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
  is still §2 below.

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
- **A card started by hand carries its frontmatter.** After a part-way stop, the commands `wf plan` prints give the card
  file to `wf start`, which reads a file's whole text as the brief, the `workflow:` and `after:` lines included.
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
- Since `--after` shipped: a run another run waits on, and has not started on, is not forgotten
  quietly. The waiting run would read `waiting on <run> (no such run)` for ever. Refuse, or name the runs
  it strands.

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
