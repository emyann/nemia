# Hold the bar — the handoff plan

Written 2026-09-12 from [`docs/eval-2026-09-12/REPORT.md`](eval-2026-09-12/REPORT.md), for
concurrent Claude Code sessions. Each package below is a brief a session can be handed cold:
what it owns, what it must not touch, what "done" is, and which tests must make something
*refuse*. The plan is itself the first point of the post it answers — agree on the outcome and
the constraints first — applied to the sessions that will do the work.

**Decisions taken before this plan (2026-09-12, operator):**

- the engine gains `tools?` and `effort?` in wave 1 — carried on the task, never read by
  `decide`, the `closeoutSchema` pattern (REPORT §4);
- bug 1 (the `decide()` change: a task that asked for a closeout and went quiet ends *stalled*)
  is **deferred**; the workflow's `unsigned` status (package C) is the run-side fix;
- the engine README's `AE_RUNNER=sdk` claim is made true or deleted — not wired with new code
  unless the reader is a handful of lines with a test.

## 1. How to run this plan

One session per package, one git worktree per session, one branch per package:

```bash
git worktree add ../hkb-v2-A -b bar/A main       # package A
git worktree add ../hkb-v2-B -b bar/B main       # package B
# package C branches from A's FIRST commit, not from main — see C
cd ../hkb-v2-A && claude                          # paste the package's brief (§4) as the first prompt
```

Every session, without exception:

1. Reads `CLAUDE.md` (the commands and the rules), then the REPORT sections its package names,
   then the code it owns. The maps and shape proposals under `docs/eval-2026-09-12/` are
   background, not instructions.
2. Edits only the files its package **owns**. A change that seems to need another package's
   file is a finding for the closeout, not an edit.
3. Ends with `npm test && npm run typecheck` green from the repository root, commits on its
   branch with plain messages (no attribution trailers), and **never pushes, merges, rebases
   onto main, or deletes a branch** — `.claude/settings.json` refuses push and `branch -D`.
4. Closes out with one paragraph in its last message: what changed, what was refused and why,
   what it learned that belongs in `CLAUDE.md`. **Lessons go in the closeout, not in
   `CLAUDE.md` directly** — several sessions appending to one file is the lost-update `wf
   cancel` had; the operator folds them in at merge. One writer per file, like the run record.

**The operator merges, in the order §3 gives.** Before each merge: `git merge --no-ff --no-commit`
into a scratch checkout of `main`, run the suite, then commit or abort. That is the trial merge
already run by hand at `ee2988e`, made a rule.

**Dogfooding, once C lands:** wave 2 can be run through `wf` itself — a `workflows/` folder with
`check: npm test && npm run typecheck` on every step, the package's brief as the run's brief. The
first run that verifies its own steps is the proof that C works.

## 2. The contract every package signs

| | |
|---|---|
| **done** | the package's *definition of done* list is met; `npm test && npm run typecheck` green; every new guard has a test that makes it **refuse** at shipped defaults; the closeout paragraph is written |
| **must not touch** | any file another package owns (§4 lists them); `main`; other branches |
| **checks** | `npm test` · `npm run typecheck` — from the root, or from inside a package; not `node --test` from the root (`facade.test.ts` is cwd-relative) |
| **blast radius** | the closeout names every file changed; the operator reads engine changes in full, workflow changes by diff, doc changes by skim |
| **when you miss** | say so in the closeout; a test you had to delete or weaken is a finding, never a fix |

## 3. Waves and merge order

```
wave 0   P0   above the packages: CLAUDE.md, deny list, the report in docs/        this session
                │
wave 1   A     close the workflow parser        agent-workflows/src/workflow.ts    ~½–1 day
         B     the engine: parsers, fields, README truth                           ~1–2 days
         C     the check                        agent-workflows, everything else   ~2 days
                │  A and B run concurrently from main.
                │  C starts from A's first commit (the type), so the key exists;
                │  C rebases onto main once A and B have merged.
merge    A → B → C
                │
wave 2   F     retries: + wf retry              after C
         G     the decider screen               after C
         H     wf round                          after C
         I     tools:/effort: pass-through       after A, B, C
                │  F/G/H all touch cli.ts and runner.ts: one session in order,
                │  or three sessions that expect small conflicts in cli.ts.
```

Hour-one commits that unblock others: **A commit 1** (the `Workflow` type gains `check`/`retries`;
C branches from it) and **B commit 1** (codex `-s read-only`; C's `review.md` relies on it).

## 4. The packages

### P0 — Above the packages · this session · wave 0

**Owns.** `CLAUDE.md`, `AGENTS.md` (a symlink to it, for Codex), `.claude/settings.json`,
`docs/eval-2026-09-12/`, this file.

**Done when.** Committed to `main`; every later session reads the commands from `CLAUDE.md`
because both harnesses load it from a worktree with no code change (REPORT G3, G8).

**Not in P0.** Any package code. The README fixes belong to B (engine) and C (workflows).

### A — Close the workflow parser · wave 1 · ~½–1 day

**Owns.** `packages/agent-workflows/src/workflow.ts`, `packages/agent-workflows/test/workflow.test.ts`.
**Must not touch.** `run.ts`, `runner.ts`, `cli.ts`, `README.md`, `workflows/` — those are C's.

**Read first.** REPORT G4 (the reproduced traps: `afer:`, `5m`, `banana`), §3.1 (the key table),
`hkb:src/templates.ts:291-298` for the message shape (`/home/yrnd1/projects/harness-kanban-board`).

**Commit 1, in the first hour — C branches from it.** The `Workflow` type gains `check?: string`
and `retries?: number`; `parseWorkflow` reads both. Nothing else in that commit.

**Definition of done.**

- `STEP_KEYS` is a closed list: `after, resume, harness, model, permissionMode, deadlineSeconds,
  maxAttempts, check, retries`. An unknown key throws `WorkflowError` naming the key and the
  legal list: `` review: `afer` is not a key a step has. A step's keys are: after, … ``.
- `tools:` is refused **by name** with its own message — reserved, not passed through until
  package I — never silently dropped.
- Refused with a message naming the fix: an empty `check:`; `deadlineSeconds` and `maxAttempts`
  that are not a whole number above zero, `retries` that is not a whole number of zero or more
  (`5m` is the case that shipped; `retries: 0` is the documented default and a legitimate explicit
  value — the first wording here said "positive" for all three and A's review caught it); a `harness`
  outside `claude | codex | claude-detached` (and `check`, which is the run's own); a
  `permissionMode` outside the harness's list — claude: `default | acceptEdits | auto | dontAsk
  | bypassPermissions | plan`; codex: `workspace-write | danger-full-access | read-only`
  (`read-only` is emitted by the engine after B commit 1; note it in the README line C writes).
- `validate` still refuses a cycle and a dangling `after`; the 16 existing tests pass unedited.
- Refusal tests, at shipped defaults: unknown key; `afer: implement` (today it makes the reviewer
  a concurrent root with write access); `tools:`; empty `check:`; `deadlineSeconds: 5m`;
  `harness: banana`; `permissionMode: yolo`.

**The brief to paste.**

```text
Close the frontmatter parser in packages/agent-workflows/src/workflow.ts so a key it does not know
is refused by name, and a value it cannot use is refused with the fix in the message. Read
CLAUDE.md, then docs/eval-2026-09-12/REPORT.md G4 and §3.1, then workflow.ts and its test.
You own workflow.ts and test/workflow.test.ts only. First commit, before anything else: the
Workflow type gains `check?: string` and `retries?: number` and parseWorkflow reads them — another
session branches from that commit. Then the closed key list and the refusals in
docs/plan-hold-the-bar.md §4 A, each with a test that makes it refuse. The message shape is
hkb's (/home/yrnd1/projects/harness-kanban-board/src/templates.ts:291-298). Do not touch run.ts,
runner.ts, cli.ts or the README. Finish with npm test && npm run typecheck green from the root,
commit on this branch, and close out in one paragraph: what changed, what you refused, what you learned.
```

### B — The engine · wave 1 · ~1–2 days

**Owns.** Everything under `packages/agent-engine/` (src, test, README.md, docs/open-issues.md).
**Must not touch.** `packages/agent-workflows/`, `apps/`, root files.

**Read first.** REPORT §1 (the engine verdict), G2, G4, G7, §4 in full; `src/index.ts:8-50`
(the boundary); `src/facade.ts:64-100`; `src/runner.ts:170-200` and `src/runner-detached.ts:218-240`
(the argv sites); `test/detached.test.ts:178-187` (the argv test pattern).

**The rule for every item:** `decide` (`src/domain.ts`) does not change. A field is carried on
`filed`/`State` and read only by a runner. Anything that would need `decide` to change goes in
the closeout as a finding.

**Commit 1, in the first hour.** codex: `permissionMode === 'read-only'` → `-s read-only`
(`runner-detached.ts:236` today maps everything but `bypassPermissions` to `workspace-write`).
One test. *Found by A's run, to check at B's trial merge:* `permissionMode: danger-full-access`
passes A's parser (it is in codex's list) but the same line maps only `bypassPermissions` to
`-s danger-full-access` — honour the codex word too, or the parser's list is a declaration
without enforcement.

**Definition of done, in order.**

1. `parseBrief` (`src/cli.ts:14-38`): a closed `BRIEF_KEYS`; unknown key, non-finite
   `deadlineSeconds`/`maxAttempts`, `resume` outside `interrupted | always | never` refused with
   `Error` + `.exitCode = 2` and a message naming the fix. New `test/brief.test.ts` —
   `parseBrief` is imported by no test today.
2. `file()` (`src/facade.ts`) refuses the same values at the API, so the CLI is not the only
   door that checks. `permissionMode` is harness vocabulary: the legal list lives on the runner
   (`claudeOps`, the codex `HarnessSpec`), never in `domain.ts`; `file()` asks the runner's list
   when one exists.
3. `tools?: string[]` and `effort?: string` on `TaskSpec`, `SpawnRequest`, the `filed` event and
   `State` — carried, never read by `decide`. claude-bg emits `--tools <list>` (**`--tools`,
   not `--allowedTools`**: a tool that is absent beats one that is un-approved; verified present on
   2.1.270) and `--effort <level>`; claude-detached the same; codex emits `-s read-only` when the
   list has no `Bash`/`Write`/`Edit`, and `-c model_reasoning_effort=<level>`. Two tests: argv at
   shipped defaults (the `detached.test.ts:178-187` pattern), and a **live, gated** test (skipped
   unless `AE_LIVE=1`) that a `--bg` session with `tools: Read, Grep, Glob` cannot write a file —
   the flag is unverified beyond `--help`.
4. `Sighting.usage?: { turns, toolCalls, inputTokens?, outputTokens?, costUsd? }` from the
   transcript `claudeOps` already parses (`runner.ts:98-114`); `exitCode` from the detached run
   file (`bin/ae-worker.ts:69`); carried on `ended`, folded onto `Attempt`; `null` when unmeasured,
   never `0`. `ae show` prints it.
5. *If time:* a spawn `RunnerError` ends the attempt (`failed`, reason `unstartable`) instead of
   rejecting the whole tick (`engine.ts` has no per-task catch today; one bad step stalls the
   board — hkb lesson 15). If not done, write it into `docs/open-issues.md`.
6. The README made true (REPORT §1, G3): `AE_RUNNER=sdk` "both are wired" (`:361`, `:499`) —
   state the real way to select `sdkRunner` or delete the claim; "refuse a tool call | no"
   (`:371`) now reads `tools`; "25 tests" (`:9`); the file table (`:412-424`); "three next
   things" (`:517-524`). A `test/readme.test.ts` that fails when the README names an env var
   the source never reads, or a file that does not exist.
7. `docs/open-issues.md`: bug 5 fixed; the bug-1 deferral recorded with the reason; item 5 if
   deferred.

**The brief to paste.**

```text
Harden the engine's edges without touching decide(). Read CLAUDE.md, then
docs/eval-2026-09-12/REPORT.md §1, G2, G4, G7 and §4, then packages/agent-engine/src/index.ts,
facade.ts, runner.ts:170-200, runner-detached.ts:218-240 and test/detached.test.ts:178-187. You own
packages/agent-engine only. First commit, first hour: codex emits `-s read-only` for
permissionMode read-only, with a test. Then the seven items of docs/plan-hold-the-bar.md §4 B in
order — closed BRIEF_KEYS with refusals; file() refusing the same; tools?/effort? fields carried
on the task and emitted as `--tools`/`--effort` (claude) and `-s read-only`/`-c
model_reasoning_effort=` (codex), with an argv test and a live gated test; usage on the
sighting, null when unmeasured; the README made true with a test that keeps it true. decide()
does not change; if an item seems to need it, stop and write why in your closeout. Finish with
npm test && npm run typecheck green from the root, commit on this branch, and close out in one
paragraph: what changed, what you refused, what you learned.
```

### C — The check · wave 1 · ~2 days · branches from A commit 1

**Owns.** `packages/agent-workflows/` **except** `src/workflow.ts` and `test/workflow.test.ts`:
`src/run.ts`, `src/runner.ts`, `src/cli.ts`, new `src/check.ts`, `test/run.test.ts`,
`test/store.test.ts`, new `test/check.test.ts`, new `test/boundary.test.ts`, `README.md`,
`docs/features.md`, `workflows/*.md`, `wf-examples/**`.
**Must not touch.** `workflow.ts` (A's), `packages/agent-engine/` (B's), `apps/`.
**Watch.** `apps/api/src/app.ts:21-25` reads `run.steps[name].taskId` — keep that field meaning
"the step's own task"; the check's task id is separate.

**Read first.** REPORT §1, G1, G2, G5, G8, §3 in full (the step format, the run model, the
status vocabulary, the tick order, the decider words); `run.ts` and `runner.ts` in full;
`hkb:src/check.ts:1-52` and `hkb:src/brief.ts:155-243` (the verdict, the contract, the stderr
lesson); `docs/eval-2026-09-12/shape-verify-first.md` for detail the report compressed.

**Definition of done, in order.**

0. **G5 first, thirty minutes.** `decision()` never reads `shipped` for a terminal branch equal
   to `run.branch`; it says "worked directly on `<branch>`; nothing to merge; the base was
   `<baseRef>`" and classifies failed/stuck as for any run. A test with `isolate: false` and
   `shipped = () => true` reads `awaiting`, not `shipped`.
1. `src/check.ts`: `CHECK`, a `HarnessSpec` — `sh -c '( <cmd> ) 2>"$WF_STDERR"; c=$?; printf
   "\n[wf check] exit %d\n" $c; exit $c'`; `readVerdict(log)` pure — the last `[wf check] exit N`,
   else `unfinished`; `checkContract(cmd)` — the text appended to a brief: *"Before you sign off —
   this must exit 0 in this workspace: `<cmd>`. The run executes it afterwards. Do not weaken it:
   the command comes from the run, not from this checkout."*
2. `engine()` (`runner.ts:74-77`) passes `harnesses: { claude: 'claude-bg', codex,
   'claude-detached': claudeDetached, check: CHECK }` — passing `harnesses` **replaces** the
   engine's default map, so the three defaults are named again.
3. The run record freezes its workflow: `run.workflow: Workflow[]` written at `wf start`; every
   later read uses it, with `?? loadWorkflows(run.workflowDir)` for records from before. Today
   `loadWorkflows` re-reads an unfenced folder on every pass (`runner.ts:288,388,418,513,520`) —
   a `check:` planted in a worktree's copy of the folder must not reach the run.
4. Per step: `check?: { taskId }` with the derived id `<run>-<step>-check`, so a tick that died
   between `e.file` and `writeRun` adopts what it finds (the engine's own adoption rule).
5. Tick order in `advance`: tick → cancel enforcement over agent *and* check tasks → **hand off
   every finished try — succeeded, failed, stopped** (closes open issue 2) → file due checks,
   with `cwd` = the step's workspace, env `WF_RUN WF_STEP WF_BASE_REF WF_WORKSPACE WF_STDERR`,
   `deadlineSeconds: 600`, `maxAttempts: 1`, `resume: 'never'` → pure `assess` → file ready
   steps → write once.
6. `assess(steps, run, phaseOf, closeoutOf, verdictOf, askedCloseout)` — pure — returns
   `{ check, file, blocked, status }`. One status vocabulary shared by `assess`, `listing`,
   `decision`: `unsigned` (succeeded, a closeout was asked — `view.state.closeoutSchema` — and
   none came: **does not satisfy `after`**), `checking`, `verified` (exit 0: satisfies),
   `unverified` (no `check:` declared: satisfies, and is shouted on every screen),
   `failed (check)`, and the existing `failed | stopped | blocked`. Note in the README that
   `unsigned` blocks every `claude-detached` step until engine bug 4 is fixed.
7. `composeBrief` appends `checkContract` when the step has a `check:`.
8. `wf ls` / `wf decide` words per REPORT §3.3: `verified ✓`, `checking`, `unverified · done`,
   `failed ✗ check (exit N)` with the last 20 lines of each stream, `unsigned`; `→ waiting on you`
   names unsigned and check-failed steps; `wf decide` prints `FAILED CHECK:` / `UNSIGNED:` /
   `UNVERIFIED:` first. `wf decide` stays read-only.
9. Content through the user door: `check: npm test && npm run typecheck` on this repository's own
   `workflows/implement.md` and `workflows/respond.md`; `permissionMode: read-only` on
   `workflows/review.md` (codex; real once B commit 1 is merged); the README gains the `check:`
   section and the status table; `docs/features.md` records what shipped and points retries and
   rounds at wave 2.
10. `test/boundary.test.ts`: only `runner.ts` imports `agent-engine`; `run.ts` and `check.ts`
    import no `node:fs`/`node:child_process`; `cli.ts` imports only `runner.ts` and `workflow.ts`.
11. Refusal tests at shipped defaults: no `check:` → no check task is ever filed; a planted
    `check:` in the worktree's copy of the folder is ignored; a check that exits 1 leaves the
    follower unfiled and the step `failed (check)`; `unsigned` leaves the follower unfiled;
    handOff runs for a failed step; the G5 test. The 72 existing tests join; edit one only when
    its assertion was the bug.

**The brief to paste.**

```text
Give the run a fact it does not have to believe the agent for: a `check:` command the RUN
executes after a step, whose exit code decides whether the next step files. Read CLAUDE.md, then
docs/eval-2026-09-12/REPORT.md §1, G1, G2, G5, G8 and §3 in full, then packages/agent-workflows
src/run.ts and src/runner.ts in full, then /home/yrnd1/projects/harness-kanban-board/src/check.ts:1-52
and src/brief.ts:155-243. You own packages/agent-workflows except src/workflow.ts and
test/workflow.test.ts (another session's; branch from its first commit, which gives Workflow the
`check` and `retries` fields). apps/api reads run.steps[name].taskId — keep its meaning. Do the
eleven items of docs/plan-hold-the-bar.md §4 C in order, G5 first. assess stays pure; wf decide
stays read-only; the check harness is a HarnessSpec the run passes to the engine, and the engine
does not change. Ship `check: npm test && npm run typecheck` on this repository's own
workflows/implement.md and respond.md. Every guard gets a test that makes it refuse at shipped
defaults. Finish with npm test && npm run typecheck green from the root, commit on this branch,
and close out in one paragraph: what changed, what you refused, what you learned.
```

### F — `retries:` and `wf retry` · wave 2 · after C

`steps[name].tries[]` generalising C's single try and check; `retries: n` re-files after a
refused check with the verdict in the brief as data (command, exit, both tails, "do not weaken
it"); `wf retry <run> <step> --nudge | --fresh | --model m | --recheck` writes an ask file
(`runs/<id>.asks/retry-<step>-<n>`, `wx`, honoured once by the next tick); `resumeFrom` = the
last `nativeId` for `--nudge`. Owns `run.ts`, `runner.ts`, `cli.ts`, `check.ts`, tests, README.
Refusal tests: a retry past `retries` files nothing; an ask file is honoured once.

### G — The decider screen · wave 2 · after C

`radius()` pure over `git diff --numstat` — per top-level directory; an *agent-facing files* line
(`CLAUDE.md`, `.claude/`, `.codex/`, `package.json`) and a *check-affecting* line only when true;
the full diff of `--sensitive` files (default `package.json, **/package.json, **/*.test.*,
tsconfig*.json`); `cost: not measured` until a runner fills it, never `0`; the lesson line —
`missingArtifacts` applied to `CLAUDE.md`: `lesson: CLAUDE.md +2 −0` or `lesson: nothing written
where the next agent reads`; the four commands, none run. Owns `cli.ts`, `check.ts`, tests.

### R — Rounds: implement ⇄ review until the reviewer says done, at most N · after U1

**The question (operator, 2026-09-13, from the canvas):** the workflow is implement → review;
`respond` is not a third kind of work — J already writes it as `resume: implement` + `input:
review` + the check. What is missing is the edge back: a loop until the review finds nothing,
short-circuited after a few rounds because that is the sign of a design problem or a decision.

**Why it does not break "no loops".** The README's reason for excluding loops is that the
decision — is this good enough — is a judgement. Here the judgement stays with the reviewer: its
closeout says `again`, the way `blocked` is already an agent's word the run routes on; the run
files the next round and counts, the way `maxAttempts` is a count. One relationship and one
number, no condition and no expression.

**Shape.** On the looping step: `loop: <step>` — the step to run again (must be an ancestor via
`after`) — and `rounds: N` (default 3). A step with `loop:` must declare `again: boolean` in its
`output:` schema (refused at load otherwise). Round 1 as today. When the looping step is verified
(or unverified) with `again: true` and the round count is below N: the run files the target step
again — resumed from its last session, `input:` the looping step (the findings, as data) — then
the steps between them and the looping step again, fresh sessions except the resumed one. `again:
false` → the run is `succeeded` (or continues to the steps after). Cap reached with `again` still
true → the run ends `awaiting` with **rounds exhausted**, the last findings printed, waiting on
a person; `wf round <run>` is the decider's manual "once more" from there. The loop contract the
run appends to a resumed step's brief carries `respond.md`'s three honest answers: fix it; say why
not (the replies travel as the step's own declared output, so the next reviewer reads them as
data); or sign off `blocked` — needs a decision — which stops the run. Record: derived task ids
`<run>-<step>@<round>` (adoption after a dead tick as for checks); `wf ls` shows `review · round 2
of 3`; the board's canvas draws the loop edge with the round count. The engine does not change.
Refusal tests: `loop:` on a step whose target is not an ancestor; a looping step without `again`
in its schema; `again: true` at the cap files nothing and reads exhausted; a resumed round is
given the findings and not the summary; a fresh reviewer each round. Absorbs H; F's `retries:`
stays the check-failure retry of a single step.

### H — `wf round` · wave 2 · after C — *absorbed by R; kept as the manual "once more" after the cap*

A new run with `follows: { run, round, because }`, cut from the previous result branch,
`baseRef` at the result tip; refused while the previous run is `running` or ends in several
terminal branches; `composeBrief` adds *## Previous round* and the person's words; `wf ls` shows
`round 2 of <id>`; `wf decide` offers `again wf round <run> "why"`. Owns `run.ts`, `runner.ts`,
`cli.ts`, tests, README, `docs/features.md`. Refusal tests: round on a running run; round on a
fan-out.

### J — The review as a closeout: declared outputs and inputs between steps · wave 2 · after C

**The question (operator, 2026-09-13, at C's merge):** instead of the reviewer writing `REVIEW.md`
into the workspace, let the review travel as the step's closeout — its own schema if needed — and
let the run hand that closeout to the next step as input.

**Evaluation — adopt it.** It resolves G2's reviewer half and G6 at once, and it is more in the
packages' own grain than the file was:

- *It is an artifact, not process.* "Intent and artifacts travel, process does not" was written
  against passing the implementer's transcript or self-assessment to the reviewer. A reviewer's
  findings are the reviewer's deliberate product — exactly what `REVIEW.md` is today — and a
  closeout is a statement the step chose to make. What changes is the transport, not the rule.
- *The anchoring rule survives by making the transport declared.* `summary` still goes to the
  decider and nowhere else. A follower gets a predecessor's output only when its file says so —
  `input: review` on `respond.md` — and the run composes it into the brief under a heading, as
  data, the way hkb's `inputs` did (data, never instruction). `implement`'s output does not reach
  `review` unless `review.md` asks, and it must not.
- *A read-only reviewer becomes possible.* The reviewer writes nothing to the workspace; the
  harness enforces the shape (StructuredOutput / `--output-schema`); `permissionMode: read-only`
  and later `tools:` can narrow it without breaking the handoff.
- *It survives `drop it`.* The closeout lives on the engine's record (the journal, append-only),
  not on a branch, so `git branch -D` no longer deletes the only copy of the review (G6). The
  board's inspector and `wf decide` read it from the record, as they already read `summary`.
- *Costs.* A per-step schema: `CLOSEOUT_SCHEMA` is strict (Codex requires every property
  required, no extras), so a step's output schema is merged into the base schema at filing —
  `output: review.schema.json` beside the step, or a conventional `<step>.schema.json`. A review
  must be given in one StructuredOutput call, so the reviewer writes it whole; long reviews are
  fine (the transcript and the journal hold them), but a cap like hkb's 4 KB per result is worth
  stating. A step that wants a file for a person (a report) still writes one; declared output is
  for what the *next step* consumes.

**Shape.** Two keys, neither control flow — one declares, one reads: `output: <schema file>` on
the producer (its closeout gains those fields), `input: <step>` on the consumer (the run appends
`## From <step>` with the producer's declared fields, as data). `REVIEW.md` stays possible and
stops being required; `workflows/review.md` ships with an `output` schema (`findings[]`: file,
line, what would go wrong) and `respond.md` with `input: review`. `wf decide` prints the findings;
the board's Output tab renders them. Refusal tests: a follower with `input:` naming a step it is not
`after` is refused; a producer whose closeout lacks a declared field is `unsigned`; nothing from a
step's closeout reaches a follower that did not ask.

Until J lands, `review.md` keeps write access (the line was dropped at C's merge) and C's test
refuses the read-only pair.

### U1 — The e2e check: a UI step is verified in a browser · after F1

**Why.** W's closeout: "the pages were not viewed in a browser". K's: "a headless-browser check of
the page passed in both themes" — a script it wrote for itself. Whether a UI change is looked at
depends on the agent thinking of it; that is prose-level reliability. The Chrome extension is the
right tool for an interactive session and the wrong one for unattended steps: it drives the
operator's own browser, one window, their logged-in state.

**Shape.** `npm run e2e` at the root: builds; starts the api and the web preview on port 0 and
reads the ports it got (concurrent worktrees must not collide — hkb's `self:slot`, solved locally);
seeds a fake run under a temporary `WF_ROOT`; visits `/`, `/runs`, `/runs/:id` in headless
Chromium (Playwright, pinned; the browser lives in `~/.cache/ms-playwright`, installed once —
worktrees symlink `node_modules`); asserts no console errors and the elements each page must have;
screenshots both themes into **a directory outside the workspace** (a PNG written into a worktree
rides the branch; a gitignored one does not reach the next step's worktree at all) — the run
names that directory: `runs/<id>/artifacts/<step>/`, created by the run, told to the step in the
brief the way the closeout contract is, and to the check as `WF_ARTIFACTS`; exits non-zero on any
of it. A `ui/` workflow folder whose steps carry `check: npm test && npm run typecheck && npm run
build && npm run e2e`. CLAUDE.md: "for `apps/web` changes, run `npm run e2e` and read the PNGs
before you sign off" — the same script, early, as the agent's own eyes; the check is the
enforcement, the line is the convenience. Owns: `apps/web/test/e2e/` (or `scripts/`), the root
`package.json` script, `packages/agent-workflows` for the artifacts dir (small), `workflows/ui/`.
Lightpanda (CDP-compatible, built for agents) is a possible browser behind Playwright's
`connectOverCDP` later; start on Chromium, keep the seam.

### E4 — `mcp:` on the task, and `--strict-mcp-config` by default · engine · after E3

**What it means here.** An MCP server is a process the harness starts beside the session and
whose tools the model can call. Claude Code loads them from three places: user scope
(`~/.claude.json` — every project), project scope (`.mcp.json` at the repo root, a tracked file,
enabled per repo by `.claude/settings.json` → `enabledMcpjsonServers`), and per invocation
(`--mcp-config <file>`, with `--strict-mcp-config` to load *only* that). A `--bg` step in a
worktree sees the tracked `.mcp.json`, so **configuring a browser server in the repository is
enough for every step to have it, with no engine change** — that is the content route, and it is
the first thing to do. Two things it does not give: per-step choice (a reviewer that must not
have a browser; an implementer that must), and — the finding — **today a `--bg` step inherits
the operator's user-scope servers**: nothing passes `--strict-mcp-config`, so an unattended step
can reach whatever connectors the operator has at user scope (mail, calendar, drive). hkb
measured the same and closed it with `strictMcpConfig` (ADR-013). That is a G2-class gap.

**Shape.** `mcp?: Record<string, McpServer>` on `TaskSpec`/`SpawnRequest`/`filed`/`State` —
carried, never read by `decide` (the `tools`/`effort` pattern; a Pod's sidecar). claude-bg and
claude-detached write the map to a file the runner owns and emit `--mcp-config <file>
--strict-mcp-config`; with no `mcp:` they emit `--strict-mcp-config` alone, so a step gets the
repository's `.mcp.json` and nothing of the operator's. codex maps it to `-c
mcp_servers.<name>.command=…` overrides (the spec already passes `-c` for trust and effort). A
`mcp:` key on a step in agent-workflows once the engine carries it (with I). Tests: argv at
shipped defaults; a live gated one that a step without `mcp:` lists no user-scope server.

### The `ui/` workflow · after U1, J and I

```
implement ──► review (codex, read-only: the code)  ──┐
          └─► look   (claude, tools: Read Grep Glob; input: implement.screenshots) ──┴─► respond
```
`implement.md`: `check: … && npm run e2e`, `output: implement.schema.json` (`screenshots`, the
pages visited); told where its artifacts dir is; the browser via `.mcp.json` (or `mcp:` after E4)
so it can drive the page, not only screenshot it. `review.md`: unchanged from J. `look.md`: a
second reviewer, on Claude because it reads images, `input: implement` for the screenshots only,
`output: look.schema.json` (findings against the brief's intent: layout, both themes, what a
person would notice). `respond.md`: `after: review, look`, `input: review, look`, `resume:
implement` — a fan-in the run already knows how to cut; the checks run again on its result.
The board's inspector shows a step's artifacts (a small api endpoint for `runs/<id>/artifacts/`).

### M1 — Playwright MCP in the repository · filed 2026-09-13

Root `.mcp.json` naming Playwright's MCP server from `node_modules` (headless chromium, isolated
context), `@playwright/mcp` pinned at the root, `enabledMcpjsonServers` in `.claude/settings.json`,
one sentence on `workflows/ui/implement.md`; a config test in agent-workflows and a live gated one
that a `--bg` step in the checkout has `browser_navigate` and none of the operator's servers.
Cost per step: one small MCP process at session start; Chromium only when a step uses it. Per-step
`mcp:` (I) stays the tidier surface for later.

### B1 — The capabilities page: what this repository offers a step · later, apps + api

**The ask (operator, 2026-09-13):** a page on the board, like the skills/agents/MCP panels in
VS Code and Cursor, listing the skills, MCP servers (and their tools) and agents available to
this repository, checkable.

**Where the responsibility falls.** Two different questions, two owners:
- *What the repository offers* is content on disk: `.claude/skills/*/SKILL.md` (name, description),
  `.claude/agents/*.md`, `.mcp.json` (servers), `CLAUDE.md`. The api can read the checkout and
  serve an inventory with no engine involvement.
- *What a step was actually given* is on the engine's record already: `tools`, `effort`, `mcp`,
  `permissionMode`, the harness — carried on `State` since B and E4. The api exposes it per step;
  the inspector's Details shows it. That is the engine's whole contribution, and it is done.
- *What tools an MCP server exposes* is the harness's to answer: the Agent SDK's init message lists
  connected servers and tools, and an MCP client can ask a server directly. The api can start a
  configured server and list its tools (an MCP client, cached), which is the "check what tools this
  repository has access to" the ask names.
- *Checking a box* is declaring: per-step `mcp:`/`tools:` in the workflow folder (I) is what a
  toggle writes; the board does not hold configuration of its own.

### I — `tools:` and `effort:` pass-through · wave 2 · after A, B, C

`workflow.ts` accepts both (A refused them by name); `runner.ts` passes them to `e.file`;
`workflows/review.md` gets `tools: Read, Grep, Glob, Bash` with the note that Bash is there for
`git diff` and the check. Owns `workflow.ts`, `runner.ts`, their tests, README. Refusal test: a
step with `tools:` reaches the engine with exactly that list.

### S — The session on the board: a step's conversation, live · after E5, B3 · engine, then api + web

**The ask (operator, 2026-09-13, from the Activity tab and Claude Code web):** the inspector's
Activity tab shows `assistant [Read]` / `user [tool_result]` lines, re-read every 5 s. Claude Code
web shows the same session as a conversation — messages, tool calls folded into "Ran 3 commands, read
3 files", thinking, streamed as it happens — and the operator can open a running session from a phone.
Wanted on the Factory: the same view, or at least a link to it.

**Where each layer stands, and what it gains.**
- *Engine.* `RunnerOps.logs(sessionId)` already reads the transcript typed (the Claude runner via the
  SDK's `getSessionMessages`, the Codex runner off its rollout file) and flattens it to text
  (`renderTranscript`). A structured op beside it is the same kind of thing: **`transcript(taskId,
  after?)`** returns the session's events in one shape for every harness — `{ at, role, kind: 'text' |
  'thinking' | 'tool_use' | 'tool_result' | 'system', text?, tool?: { name, input }, result?: { text,
  isError }, id }` — and a `cursor` to ask again from. Level-triggered and pull-only, like everything
  the engine does: no push, no socket. Reading what a harness wrote is a runner's job; `decide` does not
  change. Codex parity: the same shape from the rollout, as far as its records allow; what it lacks is
  said in the README, not faked.
- *Api.* `GET /api/runs/:id/steps/:step/transcript?after=<cursor>` → `{ events, cursor, live }`, and
  `GET …/transcript/stream`, server-sent events: the api polls the engine with the cursor every second
  while the task is live and pushes what is new, closes when it settles. The api is where streaming
  lives, because the api is the one long-lived process that talks to browsers; the engine stays a
  library. The `/log` route stays for `wf logs` parity.
- *Web.* The Activity tab becomes a conversation, and gets room: a **session page**
  (`/runs/$runId/steps/$step`) with the conversation full-height, linked from the inspector ("Open the
  session"); the inspector's tab shows the tail of the same stream. Rendering: the shadcn-family chat
  components — shadcn/ui's own conversation layer (June 2026: `MessageScroller`, `Message`, `Bubble`,
  `Marker`, `scroll-fade`, `shimmer`) and Vercel's **AI Elements** registry for what it does not cover
  (`Tool` folding a call and its result, `Reasoning` for thinking, `Response` for markdown, `CodeBlock`)
  — installed from their registries into `apps/web/src/components/`, themed by the tokens the board
  already has, read-only (no `PromptInput`). Consecutive tool calls fold into one line ("Ran 3
  commands, searched code, read 3 files"), as Claude Code web does. Fed by an `EventSource` on the
  stream route while live, one fetch when not. No AI SDK runtime, no assistant-ui: the board renders a
  transcript, it does not host a model.
- *A link to Claude Code web.* If `claude agents --json` (or the registry) carries a URL for a session
  that Remote Control shows on claude.ai/code, the inspector shows "Open in Claude Code web". The
  scheme is not documented; the S2 run checks, and adds the link only from a field it can read.

**Not in S, said so:** a prompt input that steers the session from the board. Possible — the harness
has cross-session messaging, and it is how the operator nudged two blocked sessions today — but it is
a write path with no trace on the run (§4b, "steering by message"). It is its own package once the
read path exists, with the message recorded on the run.

**S1 (engine):** `transcript` on `RunnerOps`, both runners, `Engine.transcript(taskId, after?)`, tests
with a real transcript file and a rollout fixture; README. Refusal tests: an unknown task refuses by
name; a cursor from a shorter file does not re-emit; a `StructuredOutput` call is an event like any
tool call (the closeout is not hidden). **S2 (api + web):** the two routes, the page, the components,
the fold, the link if there is one; e2e page in `PAGES` with a seeded transcript; a test that the SSE
route closes when the task settles. S2 after S1 merges.

### D — The decision on the board: G's screen where the run page is · after G, B4 · api + web

**The ask (operator, 2026-09-13):** G put the blast radius, the sensitive diffs, the usage and the
lesson line in `wf decide`. The board has none of it. Where should it show, and how?

**Where.** The run page is the board's decider screen — it carries the "Waiting on you" banner, the
checks and the closeouts — so the decision material is one **Decide** section there, between the
banner and the canvas, shown when the run is waiting on a person or finished and never while it runs.
The Factory card gets one line, for triage among the runs waiting on you: `touched 2 packages · +979 −12`.

**How.** *Touched*: one row per group with a proportional +/− bar, then, only when true, chips for the
**agent-facing** files (amber, "the next agent reads this") and the **check-affecting** ones (red
outline, "could make its check pass") — G's words, so the CLI and the board cannot disagree. *Lesson*:
one chip, `lesson · CLAUDE.md +2 −0` (green) or `nothing written where the next agent reads` (amber).
*In full*: the check-affecting diffs collapsed per file, a coloured unified diff inside, a long one
capped with "N more lines — `wf decide` prints all". *Used / cost*: beside each step's check in the
inspector's Details and the step sections, and a run total in the section; `not measured`, never 0.
*The commands*: ship it, drop it, once more — copyable lines, never buttons: the board shows the
choice and runs nothing, the CLI's rule. A merge from the board is its own question (a trial merge
runs the suite first), not this package's.

**Layers.** `GET /api/runs/:id/decision` → `{ touched: Touched[], lesson, sensitive: [{ branch, files,
diff }], used: Record<step, Usage>, commands }`, built from what G exports (`touchedBy`,
`sensitiveDiff`, `lessonLine`, `consumption`, `branchesToRead`) and read once when the run is
decidable — not on the page's 5 s poll, since it runs `git diff`. Nothing in packages/.

### W — Workflows on the board: a repository's workflows, listed, drawn, started · after B4 · package (tiny) + api + web

**The ask (operator, 2026-09-13):** a Workflows menu with several workflows — the dev one, a UI one,
one that is not CI at all — each with its own steps, that a person can trigger; later, workflows people
write with an agent. And: is `check` a step?

**What holds already.** A workflow is a folder; `wf start <brief> --workflows <folder>` picks one; the
run freezes the steps on its record (`run.workflow`, `workflowDir`). Several exist: the package's
default (implement ⇄ review), its `ui/`, the operator's folders. `implement` and `review` are steps —
agent sessions in a workspace. **`check` is not a step:** it is the run's verdict on a step, a command
executed after the step signs off with no agent judging it, and a key on the step so the DAG stays
about who does the work. A non-agent step a workflow may need (publish, deploy, a script) is a *shell
step* — `harness: shell`, `command:` — on the engine's `HarnessSpec` seam, which the check harness
already uses. Later, its own package.

**What changes.**
- *Convention.* `<repo>/workflows/<name>/` — a repository carries its workflows checked in, as
  `.github/workflows/` does. A `README.md` in the folder describes it (first paragraph = the board's
  description); the loader skips it — today every `.md` is a step. This repo gets `workflows/dev/`
  (implement ⇄ review, `npm test && npm run typecheck`), `workflows/dev-build/` (+ build + e2e) and
  `workflows/ui/`, what the operator's folders are today, and runs are filed from them.
- *Api.* `GET /api/workflows`: each folder under the repo's `workflows/` and, marked *yours*, under
  `~/.agent-workflows/workflows/` — name, where from, description, steps with their specs, the graph
  (B4's `graphOf`), and a folder that does not read as a workflow listed with the loader's refusal, not
  hidden. `POST /api/runs { workflow, brief }` → the package's `start()`, the CLI's own: it writes the
  record and files nothing; the daemon files it. A refused start is a 422 carrying `wf start`'s message.
  The board's first write, and the one a person makes at the CLI today.
- *Web.* A **Workflows** item after Runs: each workflow a card — its DAG drawn with the run canvas's
  nodes in a spec mode (no attempt, no status), its steps' specs (harness, model, check, tools, loop
  and rounds), its description — and **Start a run**: a brief box, the run's id and a link to it on
  success, the refusal in full otherwise. The Runs page and the run page name the workflow a run used.
- *Not now.* A `wf new <name>` scaffold or a "describe your workflow" skill: the keys are a closed
  list refused by name, so an agent already gets told what it wrote wrong.

### P — Cards with edges: a run that waits on a run, and a plan as a folder of cards · later · workflows + board

**The ask (operator, 2026-09-13, talked through, not filed):** the sequencing the operator did by hand
all day — file B once A is on main, keep concurrent runs off the same files — as a fact the system
holds: cards on the Factory with edges between them; the diamond (A, then B and C together, then D).

**In the study's terms.** The run boundary is the human gate (REPORT G10), so a card's dependents start
when the card is **shipped** — its result branch on the base branch, which `isShipped` already reads for
`wf decide` — never when its steps say they are done. Every card stays a decision. The diamond is then
today's flow with the waiting done by the tick: A ships; B and C start from a `main` that has A; D starts
when both are shipped. Conflicts between B and C stay a person's, at the second merge; G's radius makes
them visible beforehand (two concurrent cards touching the same files is one line the Factory can print).

**By layer.** *Engine:* nothing — a run waiting on a run is the upper layer's fact. *agent-workflows:*
`after: [runId]` on the run record, written by `wf start --after <id>`; a pure `runReady(run, shipped)`
beside `assess` — a run's roots are filed only when every run it waits on is shipped; `wf ls` says
`waiting on <run>`; later, a dependent run's brief handed the parents' closeout summaries as data
(`input:` one level up). *Board:* the Factory as a graph of cards — edges between them, the steps'
layering, a card unfolding into its run as today; W3's start form gains "after". *Then the plan:* a
**folder of card briefs** — one markdown file per card, `workflow: dev` and `after: <card>` in its
frontmatter, the closed-key parser refusing the rest — and `wf plan <folder>` starts them with their
edges. The whole graph before it is printed, at the plan level; the shape an agent writes for someone
who describes a plan in prose.

**Considered and set aside:** nesting — a card as a step whose harness runs a workflow, on the
`HarnessSpec` seam, with the step-level fork/merge doing the rest. More powerful (a check or a loop over
cards), but it makes a whole run "one workload on one harness", which stretches the engine's rule, and
the diamond does not need it. Run-level `after` with *shipped* as the edge is the small, honest version.

## 4b. Findings from wave 1, for the packages that own them

Recorded here at merge time so they are not lost; fold each into its ledger when that package's
owner is not mid-run.

- **agent-workflows (`list`, `runner.ts`):** `wf ls` prints `pending` for a task the engine has no
  record of; `phaseOfView` already draws the `unknown` line for the DAG, `listing`'s phase word does
  not. The board (run W) words it `unknown` itself and tests that it matches `list` wherever `list`
  is right. Fix in `list`, then delete the api's copy of the rule. Also: `list` throws when the
  workflow folder is gone, so a consumer must catch it; and each `view` is a `claude agents` call
  (~300 ms), so a consumer reads each task once per request. → F or G, whoever touches `runner.ts` first.
- **agent-workflows and the board (step order):** `run.steps` is keyed in the folder's file order —
  alphabetical — so `wf ls` and the board show `implement · respond · review` for a workflow that
  runs implement → review → respond. Order steps by `after` (a topological sort in `workflow.ts`,
  applied at `wf start`) so a row reads as the DAG runs. → G, with the decider screen.
- **agent-engine ↔ agent-workflows (two copies of the harness vocabulary):** B resolved the codex
  mapping (`sandboxOf` in `runner-detached.ts` honours `read-only`, `danger-full-access` and
  `bypassPermissions`). What remains is that A's `PERMISSION_MODES` in `workflow.ts` is a copy of
  the engine's lists and already differs: the engine takes `manual` for Claude, the parser does
  not; the engine takes `bypassPermissions` for codex, the parser does not. The engine now exports
  `CLAUDE_PERMISSION_MODES`, `CLAUDE_EFFORTS`, `CODEX_SANDBOXES`, `CODEX_EFFORTS` — but `workflow.ts`
  may not import the engine (`runner.ts` is the only importer). Either the run validates modes
  through `e.file()`'s own refusal and the parser stops copying, or a test in agent-workflows pins
  the copy to the engine's exports. → I, with the `tools:`/`effort:` pass-through.
- **the plan:** count fields need their least value stated (A's review); a "definition of done" that
  lists several things in one sentence gets read as one rule.
- **apps/api tests hit the live registry.** Every `e.view` runs `claude agents --json` against this
  machine; under parallel turbo the api test process dies with "Promise resolution is still pending
  but the event loop has already resolved" while other packages' tests run beside it (seen at C's
  merge, twice; serial runs pass every time, ~23 s). The api's `engine()` should take a fake
  harness under test (`createEngine({ harnesses })` accepts a `PromiseRunner`); until then verify
  merges with `npx turbo run test --concurrency=1`. → the next apps package.
- **agent-engine (`fold`, the `ended` case):** the `ended` event carries `at` and `fold` drops it, so
  `Attempt` has no end time and the board cannot say how long a finished attempt ran (K's review;
  the responder recommended the engine keep it — `batch/v1` `JobStatus.completionTime`). One line
  in `fold` plus `endedAt` on `Attempt`, then `endedAt` in the api's `latest` and a duration on the
  node. → a small engine run after E2, then an apps follow-up.
- **the engine, found by C's run:** a session that gives its closeout and is then marked `blocked`
  never ends — `closedOut` handles `working` only. → E2 (`fix-one-gap-in-agent-engine-h35j`).
- **the artifacts directory and Codex (U1's review):** every brief now names
  `runs/<id>/artifacts/<step>/`, and a Codex step in `workspace-write` cannot write there (only the
  worktree and tmp; the engine passes no `--add-dir`). Latent while the reviewer is Opus. The fix is
  hkb's `exports`: a step lists a relative path under `artifacts` and the run *collects* it into the
  directory at hand-off, before the check — then no step needs to write outside its workspace. → with R.
- **the e2e script has no refusal test (U1's review):** nothing proves a page with a console error or a
  failed request makes `npm run e2e` exit non-zero. → F2's brief.
- **the Factory's "in flight" rule (seen on U1's run):** a run whose step failed its check shows in
  flight, because its followers are `waiting` and will wait for ever. The run's overall status is
  already decided by `assess` (`running | succeeded | failed | cancelled`) and the api does not
  expose it; `/api/runs` should carry it and the Factory should read `status === 'running'`. A
  run merged by hand after a refused check stays `failed` on the record — true — until F's
  `wf retry --recheck` exists to re-run a check without a session. → the next apps run.
- **F is next, and `--recheck` first (two refused checks in one day, both environmental):** U1's
  check died in the parallel-turbo api flake; M1's detached-worker test read an empty log with
  exit 4 while the machine was at 12 GB and 22 finished sessions were being stopped. Both times
  the work was fine and the run had no way to re-run the check: done by hand (a raw review for
  U1; for M1 the refused check's journal moved to `engine/refused/` and the record's `check`
  cleared with the daemon stopped, so the next tick re-filed it). That is `wf retry <run> <step>
  --recheck`, and it should not need surgery. Also: bug 3 was measured — finished `--bg` sessions
  at ~370 MB each, 22 of them, 7 GB; E5 fixes it.
- **steering by message leaves no trace on the run (F2's review, finding 2):** the operator widened
  a step's scope and added an ask through cross-session messages; the run's record shows only two
  commit messages and a closeout, and the reviewer rightly could not tell an authorised change from
  a step overstepping. A mid-flight instruction to a step should be written on the run — an
  `asks/` file the tick composes into the record and `wf decide` prints — the same one-writer
  shape as `.cancelled`. → with F's ask files.
- **a branch's new dependency is invisible to its own check (M1, refused three times):** worktrees
  share the main checkout's `node_modules`; a package pinned on a branch is not installed there, and
  every `npm install` at a merge prunes whatever a step unpacked into the shared tree. M1's check
  and tests failed on `ENOENT …/@playwright/mcp/cli.js`. CLAUDE.md's "unpack it into node_modules"
  is fragile for the same reason. The run should give each worktree its own `node_modules` when
  the branch's lockfile differs from main's (`npm ci` in the worktree, ~1 min) — or link
  per-package rather than the whole tree. → with F; until then `npm install --no-save <pkg>` at the
  root before a check that needs it. The same link cuts the other way (M1, a fourth refusal): a
  worktree's `apps/*` tests run against `main`'s packages, so once `main` moves under a branch
  (E5's `logs`), the branch's own check fails on tests it never touched. A step's check should run
  against the branch's packages — its own `node_modules` — or the run should say plainly that the
  check is stale against `main` and re-run it after a rebase.
- **Playwright MCP, from M1's review (Opus, raw):** `browser_run_code_unsafe` is a core tool no
  flag removes — denied by name in `.claude/settings.json` at the merge; the server inherits the
  session's environment (`.mcp.json` sets no `env`, and Playwright reads config from env too);
  `test/mcp-config.test.ts` checks five flags and would pass an added `--cdp-endpoint` or
  `--extension`; `--output-dir /tmp/playwright-mcp` is one directory for every concurrent step
  (a per-step dir needs an `env` on the task, or per-step `mcp:` — I); the live test takes the
  model's own list of its servers as the evidence. → I, and the next M run.
- **inputs for a step:** a `wf` brief is text and the engine's task carries only a brief and a cwd;
  a worker can read an image or a file from disk but nothing tells it where. Reference screenshots
  for K were copied to `~/.agent-workflows/inputs/canvas/` and their paths messaged to the running
  session by hand. A small convention would do: `wf start --input <file>` copies into
  `runs/<id>/inputs/` and every brief gains one line naming the directory. → with J.
- **checks killed by the harness, not by the code (2026-09-13, B2):** three of B2's `respond` checks
  ended `stopped · harness` with 16 GB available and `/proc/pressure/memory` at 0.00 — Claude Code
  2.1.270's "low on memory" rule stopped the `wf up` background task and the check's `claude --bg`
  session at the same instant: first at the e2e's Chromium pass, then 47 s in, then 0 s in (latched).
  The OS never saw pressure (sampled through the trial merge's own suite: min 15.9 GB available).
  Suspect `.wslconfig` `autoMemoryReclaim=gradual`. Each time the only remedy was the hand surgery
  (journal → `engine/refused/`, clear `steps.<step>.check`) that nobody records — that is four
  environmental refusals in a day (M1's flake and WF_STDERR leak before). `wf retry --recheck` goes
  first in F, and a check that ends `stopped` should read as *not run*, distinct from refused. The
  daemon now runs detached (`setsid nohup npx wf up`) so the harness has nothing of it to kill. → F.
- **the api re-derives what the package keeps private (B2):** `phaseOfView`, `closeoutAsked`,
  `readVerdict` and `checkReports` are not exported, so `apps/api/src/app.ts` carries copies of the
  first three (`phaseOf`, `askedOf`, `verdictOf`) and reads a refused check's exit off the engine's
  attempt rather than the log `wf ls` reads — two sources that agree today and a test holds the words
  to `list`'s. Export a log-free verdict and the two predicates; the copies go. → I, with the
  mode-list copies.
- **the board and the api after R (2026-09-13):** `listing` now says `rounds exhausted` for a loop at its cap,
  and `apps/web/src/lib/status.ts` maps a word it does not know to `working`, so such a run reads as working
  on the board; `apps/api`'s `judge` passes `assess` no round asks and `moving` does not count a round due.
  Small apps run: map the word (amber, waiting on you), pass `readAsks(run.id).rounds`, count `round`. → apps.
- **the reviewer cannot run the suite (B1's review, 2026-09-13):** on the operator folders the review step runs
  read-only by prose, and the permission classifier refused `node --test`, so it reviewed by reading. The check
  had run the suite, so nothing was lost; but a reviewer that can run tests finds more. → I: `tools:` on the
  review step naming Bash for `npm test`, and read-only for the rest.
- **a login refresh race blocks concurrent sessions (2026-09-13, B3 and I):** both `implement` sessions
  stopped within two minutes of each other on *"Could not refresh your login because another Claude Code
  process is refreshing it (or exited mid-refresh) · Try again in a minute"* — an OAuth refresh raced between
  the operator's session, two `--bg` steps and the monitor's `claude agents` calls. The engine read them as
  `blocked` (`needs-human`), which is right for the harness and wrong for the work: nothing was asked of a
  person. Nudged by cross-session message (no trace on the run, as noted above); `wf retry` cannot help, the
  step is not final. A tick that recognises this one message on a `blocked` session and resumes it is the
  fix in the run; the harness's is a shared refresh lock across processes. → agent-workflows, small; and
  a Claude Code report.
- **the canvas gate reads the step, the banner reads the api (B3's round-2 review, 2026-09-13):** `isGate`
  in `apps/web/src/lib/status.ts` is decided from the step's state alone, while the api's `waitingOnYou`
  now leaves out a step with a `wf round`/`wf retry` ask pending — so for up to one tick the canvas says
  "waiting on you" and the page's banner does not. Pass `run.waitingOnYou.includes(step.name)` on
  `StepNodeData` and require it in the gate; a component test with a pending ask. Judged not worth a
  round by the reviewer; a small apps run, with the api's swap to I's exports. → apps.
- **the reviewer can run the suite, and nothing else (2026-09-13, after I):** the operator folders' review
  step is `tools: Read, Grep, Glob, Bash` with `permissionMode: dontAsk`, and `.claude/settings.json` allows the
  exact read-only commands (`npm test`, `npm run typecheck|build|e2e`, `npx turbo run test:*`, `node --test:*`,
  `git diff|log|show|status|branch`). In `dontAsk` any other Bash command is denied without a prompt, and there is
  no Edit or Write on the list — so the reviewer is read-only by machinery, not by prose (plan §4 I's aim). The
  shipped `review.md` stays on codex, whose fence is the sandbox. E6 froze the old folder, so the first
  run to test the fence is the next one filed.
- **E6's usage assertion cannot tell the retry's count from the first try's (E6's review):**
  `packages/agent-engine/test/resume.test.ts:134` expects the same usage the first try recorded, so the
  refusal rests on the view assertion alone; have the retry write a different number of responses. → the
  next engine run, with anything else that opens `resume.test.ts`.
- **the fence judges a compound command by its segments (G's review, 2026-09-13):** A2's reviewer ran
  `npm test` fine under `dontAsk`; G's ran `cd packages/agent-workflows && node --test …` and was denied,
  because `cd` matched no allow rule — every segment must. `git log … && git status && git diff …` passed
  for that reason. `Bash(cd:*)` is now allowed (it does nothing on its own), and the operator folders'
  review body says how to run the suite. Verified, not guessed: the denial is in the session transcript.
- **`radius` takes the base's `workspaces` globs as written (G's round-2 review):** `./packages/*` yields a
  regexp that never matches `packages/x`, so every package's changes fall into one `packages` group and
  `./packages/*/docs/` never counts a lesson; `packages/**` would count `packages/x/src/docs/` again. This
  repo uses `packages/*` and `apps/*`, so unaffected. Strip a leading `./` when the workspaces are read,
  refuse or note `**`, and a radius test with `['./packages/*']`. → agent-workflows, small.
- **the fenced reviewer cannot read the run's artifacts (B4's review, 2026-09-13):** under `dontAsk`, a
  `Read` outside the worktree — `~/.agent-workflows/runs/<id>/artifacts/…`, where the implement step's
  screenshots are — is denied, so no reviewer has looked at a screenshot since the fence. Allowed on this
  machine in `.claude/settings.local.json` (`Read(//home/…/.agent-workflows/**)`, a path that is nobody
  else's); the portable fix is an artifacts directory the step is told, carried on the task (§4b, the
  `look` note). → I's follow-up, small.
- **where a run's hour goes is not on the board (operator, 2026-09-13):** measured off the engine journals
  for B4 (two rounds, 40 min wall): implement 19m42s + 5m35s, its checks 58s + 57s, reviews 6m10s + 3m24s;
  sessions and checks 36m47s, slot waits 1m13s, ticks and worktrees 1m56s. S2's implement alone 39m11s
  (54 turns, 146 tool calls, 17M tokens in), and its review waited 8m51s for a slot behind three other
  runs. Nothing shows this: the run page has `#n · took` per node and `wf decide` has `used`, but no
  per-try timeline with queue time, no check durations, no round totals; and the spec rows show neither
  `effort` nor `tools`, so a person cannot see the effort a step runs at (none set here → the harness
  default). A **timeline** on the run page and in `wf decide` — per try and per check: filed, spawned,
  ended, queue and run time, `used` — and `effort`/`tools` in the spec rows. → apps + `wf decide`, small.
- **rounds are invisible in the inspector, defaults read as `—`, artifacts are bare paths (operator,
  2026-09-13):** a step in round 2 shows `attempts 1` (the engine's count for the current try's task)
  beside `round 2 of 3` (the run's tries), and the earlier round's task, closeout, check and replies are
  nowhere on the board; deadline and max attempts show `—` where the engine filed defaults; `effort` and
  `tools` are not rows; the Output tab's artifacts cannot be opened. B7: `tries` on the api's step, effective
  values marked `default`, a Rounds section and per-try Output, and an artifacts route serving a listed
  file by name (inside the run-owned directory, never a path) with images inline. → apps, filed after B6/S2.
- **the session stream after a reconnect (S2's round-2 review):** only a `readable` event clears the retry
  error on the page, and a fresh server stream never sends one, so after an api restart the red "reading
  again" line stays until the task settles while events flow. Clear it on the EventSource `open`. → apps,
  with B7. Also from S2, measured: one open stream on a running Claude step is two `claude agents` calls a
  second (~0.22 s each); the engine's open-issues names the fix (a runner verb that finds one session).

## 5. What the plan does not do

No mid-run human gate (REPORT G10, refuted: the run boundary is the gate). No `guide:`, `inputs:`,
`labels:`, `risk:` keys. No LLM in a tick or in `wf decide`. No `wf rm`, no splitter filing
steps, no hkb migration — planned, off the four points (`packages/agent-workflows/docs/features.md`).
No lint tool: `tsc --noEmit` is the lint until one earns its place.

## 6. What is gained, wave by wave

**After wave 1.** Every step of this repository's own workflows is verified by a command the run
executes — a step that breaks the suite blocks its followers and the decider says `failed ✗ check`
instead of `succeeded`. A step that goes quiet without its closeout is `unsigned`, not done. A
mistyped key refuses instead of silently rerouting the DAG. The reviewer on codex is read-only,
and any step can be narrowed with `tools:` once I lands. Both READMEs describe the code that
exists, and a test keeps it so. Every session, human or agent, reads the commands and the rules
from `CLAUDE.md`. In the post's terms: point 2 is met by machinery; point 1's *done* half is met;
point 3 has its enforcement field; point 4 has the file the lesson goes in.

**After wave 2.** A failed check retries with the verdict as data, then hands the person a
choice rather than a log; `wf decide` sizes the reading by blast radius and shows whether a lesson
was written where the next agent reads; "no" has a representation (`wf round`), so a rejection is
no longer `branch -D` on the only copy of `REVIEW.md`.
