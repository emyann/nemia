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
- Refused with a message naming the fix: an empty `check:`; `deadlineSeconds`, `maxAttempts`,
  `retries` that are not a positive finite integer (`5m` is the case that shipped); a `harness`
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
One test.

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

### H — `wf round` · wave 2 · after C

A new run with `follows: { run, round, because }`, cut from the previous result branch,
`baseRef` at the result tip; refused while the previous run is `running` or ends in several
terminal branches; `composeBrief` adds *## Previous round* and the person's words; `wf ls` shows
`round 2 of <id>`; `wf decide` offers `again wf round <run> "why"`. Owns `run.ts`, `runner.ts`,
`cli.ts`, tests, README, `docs/features.md`. Refusal tests: round on a running run; round on a
fan-out.

### I — `tools:` and `effort:` pass-through · wave 2 · after A, B, C

`workflow.ts` accepts both (A refused them by name); `runner.ts` passes them to `e.file`;
`workflows/review.md` gets `tools: Read, Grep, Glob, Bash` with the note that Bash is there for
`git diff` and the check. Owns `workflow.ts`, `runner.ts`, their tests, README. Refusal test: a
step with `tools:` reaches the engine with exactly that list.

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
