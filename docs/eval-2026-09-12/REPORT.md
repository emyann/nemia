# hkb-v2 against the bar — evaluation for the maintainer

Paths relative to `/home/yrnd1/projects/hkb-v2` unless prefixed `hkb:` (`/home/yrnd1/projects/harness-kanban-board`).
Every cited line was read on 2026-09-12; `npm test` 109 + 72 + 3 pass, `npm run typecheck` 4/4. Claude Code 2.1.270, codex-cli 0.154.0.

## 1. Verdict

**agent-engine: the core is well designed for this bar; the edges are overclaimed.** `decide` is pure and a screen long
(`packages/agent-engine/src/domain.ts:238-302`); the boundary "one workload, one harness" has held — everything proposed below
is built on `file`/`tick`/`view`/`stop`/`logs` plus a `HarnessSpec` the run supplies (`src/facade.ts:64-70`, `:139-150`), and
`decide` changes by zero lines. But the README states things the code does not do: "Both are wired. `AE_RUNNER=sdk`"
(`README.md:361`, `:499`) with no reader anywhere (`facade.ts:169-173` always builds claude-bg/codex/claude-detached; `sdkRunner`
exported at `src/index.ts:42`, used nowhere); "refuse a tool call | no" (`README.md:371`) when the CLI has `--tools`,
`--allowedTools`, `--disallowedTools` and `src/runner.ts:174-199` never passes them; "25 tests" (`:9`) for 109; a file table
2-3x off (`:412-424`). And one runner *judges* instead of observes: 90 s of transcript silence becomes `done` whether or not a
closeout was asked (`src/runner.ts:73`, `:247-250`; bug 1, `docs/open-issues.md:11-34`).

**agent-workflows: the same discipline, not a worse design — incomplete in one specific way.** `assess` is pure
(`packages/agent-workflows/src/run.ts:60-107`), one writer plus `.cancelled` (`src/runner.ts:21-45`), the closeout contract is
mechanism (`run.ts:251-253`), `wf decide` is read-only. What it lacks is *any fact the run establishes without believing the agent*:
it files on the engine's `succeeded` (`run.ts:97`), reads `{}` as `done` (`run.ts:240`), and its parser accepts any key (`workflow.ts:52-58`).

**The sentence:** the engine's `succeeded` means "the session ended", the run treats it as "the work is done", and neither
layer runs a command over the tree in between (`domain.ts:269`; `run.ts:97`; `runner.ts:317-322` hands off, then assesses).

## 2. Critical gaps, ranked

### G1 (critical, workflows; points 1+2). No behavioural definition of done — nothing runs a command after a step.

- **Missing.** A `check:` the run executes in the step's workspace after `succeeded`, whose non-zero exit reads `failed` for
  the DAG and is quoted to a retry; and a declared-artifact shortfall that changes anything.
- **Exists.** `succeeded` is reached three ways, none evidence: harness `state: done` or 90 s quiet
  (`agent-engine/src/runner.ts:139-142`, `:247-250`; pinned by `test/completion.test.ts:52-64`), or any non-busy StructuredOutput
  (`engine.ts:88-92`). Only `blocked` alters a phase (`run.ts:84`); followers file on `succeeded` alone (`run.ts:96-97`) after
  `handOff` committed the leftovers (`runner.ts:317-320`). `missingArtifacts` (`runner.ts:458-464`) has one caller, `wf decide`
  (`cli.ts:153-154`), after the follower ran. `Run.steps[name]` is `{taskId, workspace?, branch?}` (`run.ts:44`) — no verdict
  field. Verification is prose: `workflows/implement.md:6`, `wf-examples/fanout/integrate.md:5`, `run.ts:265-266`. The only real
  exit code is the detached harness *process*'s (`bin/ae-worker.ts:69`) — 0 whenever the agent finishes talking.
- **Precedent.** hkb `check`: "an agent session always finishes successfully, because finishing talking is what it does"
  (`hkb:src/check.ts:1-19`); command never from the workspace (`:21-28`); retry briefed with command, exit, both tails
  (`hkb:src/brief.ts:173-230`). Kubernetes: a Job is Complete on exit 0. The packages' own note places it here: "two verdicts, two
  records. A failed check files a *new* engine task" (`docs/hkb-migration.md:116-121`).
- **Exclusion argued with.** "Exactly one non-prose key" (`workflow.ts:14-18`; README.md:61-67) is about judgements and control
  flow; an exit code branches nothing — it refines `succeeded` for one step, the class of the five constraint keys already
  admitted (`workflow.ts:39-43`). Both refuters confirmed.
- **Corrections.** Detached harnesses settle `failed` on a non-zero *process* exit (`ae-worker.ts:69`) — not a check of the
  work; the shipped default must stay "nothing runs" — a `check:` line is the workflow author's, through the user door.

### G2 (critical, both; points 1+3). "What must it not touch" has no carrier and no enforcer; the reviewer writes.

- **Exists.** `SpawnRequest` (`runner.ts:25-40`), `TaskSpec` (`facade.ts:76-99`), `Workflow` (`workflow.ts:23-44`): no
  tools/paths field. `permissionMode` is `string` (`domain.ts:154`), passed unvalidated to `claude --permission-mode` default
  `auto`, "approves everything with background safety checks" (`runner.ts:177-182`); Codex gets only `workspace-write` or
  `danger-full-access` (`runner-detached.ts:236`), `read-only` named in the comment (`:223`) and never emitted. Grep for
  allowedTools/disallowedTools/canUseTool/--settings/PreToolUse: one comment (`runner-sdk.ts:16`). The shipped `review`
  (`workflows/review.md:1-12`) is a writable worktree forked from `implement` (`run.ts:478-490`; `runner.ts:195-201`); `handOff`
  commits what it left (`runner.ts:267-276`); `respond` is cut as merge(implement, also review). The workflow folder is re-read
  from an unfenced path every tick (`runner.ts:288`). The only permissionMode test asserts forwarding (`test/detached.test.ts:178-187`).
- **Precedent.** hkb admission gate, "the only layer that held when `permissionMode` did not" (`hkb:docs/workflow-study.md:137`);
  founding failure a prompt instruction ignored (`hkb:docs/wiki/concepts/admission-control.md:37-48`); ADR-018:243-244 puts
  `allowedTools` in the core as serviceAccountName + RBAC. Kubernetes: a validating webhook refuses and never mutates — the
  definition of a reviewer. Hermes' reviewer answers with `kanban_request_changes`, not a commit.
- **Corrections.** A handOff commit is authored `wf` with `review: hand off…` (`runner.ts:270-273`), so "under the implementer's
  name" overstates; the accurate claim is that `wf decide` shows only the terminal branch's `--shortstat` (`cli.ts:158-160`).
  Codex `workspace-write` is a real fence *outside* the worktree; absent is any restriction *inside* it and any fence for the
  default Claude harness under `auto`. `docs/hkb-migration.md:57-58` (hkb's `src/runtime/` deleted) covers the in-process
  `canUseTool` form only, not the argv form beside `--permission-mode`.
- **Contested in shape only** — engine field (tekton) vs `.claude/settings.json` content (minimal). Minimal's "~1,000-line
  reimplementation" does not hold: `permissionMode` is exactly such a pass-through, one argv element (`runner.ts:182`;
  `runner-detached.ts:236`); hkb's 1,000 lines were worktree/lease/registry code (`hkb:adr-018:113-131`); a deny list in the
  checkout is content the step can rewrite. Verdict: the field goes on the engine's task (§4); the run refuses the key until then.

### G3 (important, above; points 2+4). Nothing above the packages holds the bar; the READMEs state checks wrongly.

- **Exists.** `find` for CLAUDE.md, AGENTS.md, .claude, skills, hooks, .github, .husky, SKILL.md, eslint/biome/prettier →
  only `.git/hooks` samples. No `lint` script (`package.json:13-18`; `turbo.json:4-22`; every package); `apps/web/package.json:5-10`
  has no `test`; nothing runs the checks on a change; the only agent-facing file is `.codex/rules/git-commit.rules:7-13`, a
  grant. Drift: `agent-engine/README.md:6,9,361,412-424,499,517-524`; `agent-workflows/README.md:397-402` (run 120→490,
  runner 140→524); ledgers hand-stamped (`open-issues.md:7`; `features.md:7`); no test reads a doc.
- **Corrections (accepted; severity medium).** No remote (`git remote -v` empty), PRs excluded (`README.md:512`; `implement.md:10`),
  so CI attaches to nothing — the run-on-change check is G1's. `typecheck` = `tsc --noEmit` is hkb's `lint` verbatim. Rejections
  already become tests and mechanism (`test/store.test.ts:147-151`; `run.ts:251-253`; `open-issues.md:99-117`). Both harnesses
  load a root CLAUDE.md/AGENTS.md from the worktree with no code change (`runner.ts:199`; `runner-detached.ts:246-276`), so only
  content is missing: rules that cannot be tests ("no `if` in engine.ts", `engine.ts:4-6` — nine already; the export boundary,
  `index.ts:12-25`), and README claims that are false, not stale.
- **Precedent.** `hkb:CLAUDE.md:93-94` "Run `npm run lint && npm test` before finishing"; `hkb:test/readme.test.ts:49` refuses a
  README verb the CLI lacks; `guide: CLAUDE.md` in `hkb:.hkb/workflows/implement.md:4`.

### G4 (important, both; all four points). Both frontmatter parsers accept any key and any value.

- **Exists.** `parseWorkflow` collects every line into `meta` (`workflow.ts:52-58`), reads seven keys (`:66-76`), `Number()`
  unguarded (`:74-75`); `parseBrief` the same (`agent-engine/src/cli.ts:14-38`), `resume` an unchecked cast (`:29`). Reproduced:
  `check:`, `tools:`, `effort:`, `guide:` vanish; `afer: implement` → `after: []`, `validate` (`:94-125`) accepts, the reviewer
  starts at once as a concurrent root with write access (`run.ts:478-480`); `deadlineSeconds: 5m` → NaN → journalled `null`
  (`journal.ts:86`) → `domain.ts:259-263` stops it on the first tick after `starting`. Unknown `harness:` falls silently to the
  fallback (`runner-composite.ts:16`). No unknown-key test; `parseBrief` imported by no test.
- **Corrections.** `permissionMode: banana` on Claude is refused *at spawn* by the CLI and the RunnerError rejects the whole
  tick (`engine.ts` has no per-task catch; `wf up` `cli.ts:76-84` exits) — one bad step stalls the board (hkb lesson 15). On
  Codex it is silently `workspace-write`. The deadline note reads "after Ns", not 0 s — loud but misnamed.
- **Precedent.** `hkb:src/templates.ts:291-298` refuses an unknown key by name with the legal list; `:351-363` `check: none`;
  "the third time this project has shipped a declaration with no enforcement behind it" (`hkb:adr-010:153-157`). This is the
  precondition for G1/G2: a `check:` that can be silently dropped is not a constraint.

### G5 (important, workflows; point 1). `--no-worktree` makes `decision()` read `shipped` for undecided work.

`isolate: !rest.includes('--no-worktree')` (`cli.ts:56`); every step then works on `run.branch` (`runner.ts:188`); `handOff`
commits onto it; `isShipped` is `git merge-base --is-ancestor main main` (`runner.ts:472-477`); `run.ts:324` tests `shipped`
*before* `:329-338` classifies failed/stuck — so a failed or BLOCKED terminal step prints "shipped — main is already on main"
(`cli.ts:135`) with no closeout, while `wf ls` sends the person to `wf decide` (`cli.ts:101`). Only guard: fan-out refusal
(`runner.ts:234-239`); the one `isolate:false` fixture is "not about git" (`test/store.test.ts:31`); README never names the flag.
Refuters: the "shortstat only" half is stated design (README.md:254-256); residue is printing `git diff <baseRef>...<branch>`
(the agent is told it, `run.ts:440`). Precedent: `hkb:README.md:509-512` `--no-isolate` "is hostPath … nothing to revert".

### G6 (important, workflows; point 4). A rejection has nowhere to go; "no" is not recorded.

`wf decide` prints `merge --no-ff` / `branch -D`, runs neither (`cli.ts:124-127`, `:176-177`). REVIEW.md/RESPONSE.md live only on
those branches (`review.md:10`; `respond.md:22-23`; `runner.ts:489-499`). `Run` has no round/follows/decision (`run.ts:20-46`);
answers to `needs` (`run.ts:272`) have no verb; "the link to the previous round is lost" (`features.md:16-18`). Probe: after
`branch -D`, `wf ls` still names the deleted branch and `wf decide` still says "every step succeeded" (`runner.ts:519-524`,
`:472-477` swallows git's error) — only "yes" has a representation. Corrections: git refuses the printed `-D` while the worktree
exists; `summary`/`needs` survive in the journal; the `wf rm` "contradiction" (`features.md:52-56`) is overstated — what `wf decide`
fails is to say what deleting loses. The author's own plan is the shape (`wf round`, `features.md:9-40`).

### G7 (narrowed to minor; points 3+4). Usage has no field: the seam can carry cost, the journal cannot hold it.

`Sighting.costUsd/turns` (`domain.ts:60-61`) are filled by no wired runner (`runner.ts:214`; `runner-detached.ts:157`);
`ended`/`Attempt` have no usage field (`domain.ts:125`, `:131-146`), so even SDK values die with the registry (`engine.ts:247`);
`claudeOps` already parses the transcript carrying `usage` (`runner.ts:98-114`). Refuters: attempts and end reason *are* on `ae ls`/`ae show`
(`agent-engine/src/cli.ts:42`, `:54-59`; `settled.note` unprinted at `:55`); exit code stays Observed by design.

### G8 (narrowed to important, workflows; point 4). No guide reaches a step by any mechanism the packages own.

CLAUDE.md/AGENTS.md reach a step only through each harness's own cwd loading — undeclared, untested, unfenced (argv
`runner.ts:174-199`; `runner-sdk.ts:41-48` passes no `settingSources`; `composeBrief` `run.ts:409-451` prepends no guide). A
same-harness successor reads a CLAUDE.md its predecessor edited, unmerged (worktrees cut `from` the parent, `runner.ts:196-200`;
the shipped pair is fenced only by accident, `review.md:2` is codex), while the step prose *is* fenced (`runner.ts:250`, `:288`).
Skills half collapses into G1/G2/G3. Minimum: a README sentence in both packages.

### G9 (contested; point 4). A retry is the byte-identical brief; no effort knob; the run never re-files.

Facts hold: `engine.ts:120-128` re-spawns `state.brief/model/permissionMode`; no effort argv although `claude --effort <level>`
and codex `-c model_reasoning_effort=` exist; `composeBrief` has no previous-attempt section; `run.ts:94-97` blocks a failed
predecessor for ever. **Design refuter, fairly:** point 4 is a human loop and so is the design's — `wf decide` puts the miss
before a person (`cli.ts:138-155`), rounds are "started by the decider" (README.md:41-42; `features.md:24-25`); `model:` is
verified (README.md:307-311); the blind retry is inert at shipped defaults (`engine.ts:36`; `runner.ts:350`), a clean start is
hkb lesson 11 (`README.md:46-49`; `test/engine.test.ts:271`), and a "previous attempt" section has no measured content without
G1's check (`hkb:src/brief.ts:163-166`). **Counter, fairly:** a knob is "a field on the workload" (`index.ts:48-50`), so `effort`
is a one-line pass-through nothing excludes; under the README's own `maxAttempts: 2` (`:436`) attempt 2 starts cold in a dirty
worktree with no word it is a retry. Re-scoped: `effort` field (§4); the nudge folds into G1; escalation stays the decider's.

### G10 (refuted; point 3). "A person can be placed before the merge, never before a step."

Facts hold (no gate key; `blocked` is agent-chosen, `run.ts:84`; `harness: person` silently runs on the default harness,
`runner-composite.ts:16`). Refuted on design: the human boundary *is* the run boundary — only `wf start` files a run
(`cli.ts:47-57`), so "review, then a person, then migrate" is two folders, as the splitter already gates (README.md:46-49); the
post's human sits at the PR. Residue → G6 (lineage), G2 (deny push). A `person` harness would first need `validate` to refuse
unknown harness names and `engine()` (`runner.ts:74-77`) to pass `harnesses`.

## 3. What the workflow package should look like — one shape

Skeleton **shape-minimal** (one key, the engine gains nothing, `assess` pure, the gate where a workflow ends) with the grafts
both judges named; they disagreed on the winner (tekton 8/7/5 vs minimal 8/7/6) and converged on the grafts.

### 3.1 The step format — every key, who enforces it

```md
---
harness: claude                       # claude | codex | claude-detached — RUN refuses a name the engine's table lacks
after: implement                      # RUN: files when every dep is `verified` or `unverified`; failed/stopped/blocked/unsigned block for ever
resume: implement                     # RUN picks the session (runner.ts:325-329); implies after; same harness (workflow.ts:101-109)
model: opus                           # HARNESS
permissionMode: auto                  # HARNESS; RUN refuses a value outside the harness's enum at load
deadlineSeconds: 900                  # ENGINE (domain.ts:259-265); RUN refuses a non-finite value at load
maxAttempts: 1                        # ENGINE (domain.ts:271-273); same refusal
check: npm test && npm run typecheck  # RUN: an engine task on the `check` harness after handOff; exit 0 = verified. Absent = nothing runs. Empty = refused.
retries: 1                            # RUN: re-filings after a refused check, default 0; briefed with command, exit, both tails
tools: Read, Grep, Glob               # REFUSED by name until the engine carries `tools` (§4) — never accepted silently
---
```

Unknown key → `WorkflowError('<step>: \`afer\` is not a key a step has. A step's keys are: …')` (`hkb:src/templates.ts:291-298`);
a test walks the key list against `TaskSpec` (`facade.ts:76-99`); `parseBrief` gets `BRIEF_KEYS` and `.exitCode 2`. The one-key
rule kept in its real meaning: no key evaluates a judgement, none routes on one — `after` orders, `resume` continues, `check`
measures, `retries` counts. No `when`, no ladder, no `gate`, no `guide:`. The run appends, as mechanism (`run.ts:251-253`):
"## Before you sign off — this must exit 0 in this workspace: `<check>`. The run executes it afterwards. Do not weaken it: the
command comes from the run, not from this checkout" (`hkb:src/brief.ts:233-243`).

### 3.2 The run model

**Record** (`runs/<id>.json`, one writer — `runner.ts:21-34`) gains: `workflow: Workflow[]` frozen at `wf start` (ticks never
read the folder again; today `loadWorkflows` runs every pass, `runner.ts:288,388,418,513,520`; old records fall back);
`follows?: {run, round, because}` (origin, admitted by `features.md:37-39`); `steps[name].tries: [{taskId, filedAt, checks[]}]`
with derived ids (`<run>-<step>`, `-try2`, `-check`, `-try2-check2`) so a tick that died between `e.file` and `writeRun` adopts
what it finds; `taskId` stays the current try (`app.ts:21-25`). Person-written facts get own files: `runs/<id>.asks/retry-<step>-<n>` (`wx`).

**The `check` harness** — a `HarnessSpec` the run supplies (`facade.ts:64-70`, `:169-174`, `:268`; `runner-detached.ts:28-43`;
`ae-worker.ts:41`, `:69` maps exit 0 → done, else failed):
```ts
const CHECK: HarnessSpec = { name: 'check',
  command: (r) => ({ cmd: 'sh', args: ['-c', `( ${r.brief} ) 2>"$WF_STDERR"; c=$?; printf '\n[wf check] exit %d\n' $c; exit $c`] }) };
```
Filed with `cwd` = the try's workspace, env `WF_RUN/WF_STEP/WF_BASE_REF/WF_WORKSPACE/WF_STDERR`, `deadlineSeconds: 600`,
`maxAttempts: 1`, `resume: 'never'`; `engine()` (`runner.ts:74-77`) passes `harnesses: { claude: 'claude-bg', codex,
'claude-detached': claudeDetached, check: CHECK }` (passing `harnesses` replaces the default map). Buys: durability across a
tick's death; `wf cancel` → `e.stop` kills the suite's process group (`runner-detached.ts:160-172`); an own pool (`engine.ts:196-219`)
so a ten-minute suite never stalls another run's filing or a cancel (hkb's `spawnSync` freeze, `hkb:src/check.ts:306-321`).
stderr to its own file: the worker's log is one 8000-byte stream (`ae-worker.ts:53-54`; `runner-detached.ts:183`) and hkb measured
stderr evicting the verdict (`hkb:src/check.ts:48-52`). `readVerdict(log)` is pure: last `[wf check] exit N`, else `unfinished`.

**Tick order** (`advance`, `runner.ts:287-362`): 1 `e.tick()`; `readRun` composes json + `.cancelled` + `.asks/*`. 2 cancel
enforcement every pass (`runner.ts:300-306`), over agent *and* check tasks. 3 **hand off every FINISHED try** — succeeded,
failed, stopped (closes bug 2) — before its check is filed, never after, so suite litter never rides the branch.
4 `assess(steps, run, phaseOf, closeoutOf, verdictOf, askOf, askedCloseout)` — pure — `{check, retry, file, blocked, status}`.
5 apply: file due checks; file retries (`resumeFrom` = last `nativeId`, brief = the verdict as data, `hkb:src/brief.ts:155-171`);
file ready steps as today (`runner.ts:336-355`) plus the contract. Write once.

**Step status**, one pure vocabulary shared by `assess`, `listing`, `decision`, the API:
```
waiting · pending|running|needs-human|working (quiescent) · blocked (closeout, run.ts:84)
unsigned   succeeded + closeoutSchema asked (views.get(id).state.closeoutSchema, domain.ts:164) + no closeout → does NOT satisfy after
checking · verified (exit 0 → satisfies after) · unverified (no check declared → satisfies after; SHOUTED on every screen)
retrying (tries.length ≤ 1 + retries) · failed (check) · failed · stopped   — final; the decider
```
`unsigned` closes the run-side half of bug 1 with one predicate; it blocks every `claude-detached` step until bug 4
(`runner-detached.ts:280-291` takes no `io`) — documented, not hidden.

**Where a gate goes.** End of every run (`wf decide`); inside a step (`blocked` with `needs`); between two runs (cut the folder
where the person belongs; `wf round` links them). No `gate:` key, no approver seat, no `suspended` state (G10).

### 3.3 The decider

`wf ls`: `implement  verified ✓ (try 2)` · `review  checking` · `respond  unverified · done` · `implement  failed ✗ check (exit 1,
try 2 of 2)` · `review  unsigned`; run line `round 2 of <id>`; `→ waiting on you` names unsigned and check-failed steps.

`wf decide <run>`, verdicts first: (1) short-circuits as today, except `shipped` is never read for a terminal branch equal
to `run.branch` (G5) — "worked directly on <branch>; nothing to merge; the base was <baseRef>". (2) `FAILED CHECK:` /
`UNSIGNED:` / `UNVERIFIED:` / `BLOCKED, waiting on you:` / `every step verified`. (3) Per step: `check  <cmd> → exit 1 (try 2 of
2)` + last 20 lines per stream; `summary`/`needs`/`!! declared but not on the branch` as today (`cli.ts:146-155`); `cost: not
measured` until a runner fills it, never 0. (4) Per terminal branch: `git diff --stat` per file grouped by top-level directory
(`radius()` pure over `--numstat`); only when true `touches agent-facing files: CLAUDE.md, .claude/…, .codex/…, package.json`
and `check-affecting: package.json ← npm test resolves through it`; the full diff of every `--sensitive` file (default
`package.json,**/package.json,**/*.test.*,tsconfig*.json`); root `.md` in full; the exact `git diff <baseRef>...<branch>`.
(5) Four commands, none run here (`cli.ts:124-127` stays true): `ship it git merge --no-ff …` · `drop it git branch -D …
(deletes the only copy of REVIEW.md, RESPONSE.md)` · `again wf round <run> "why"` · `one step wf retry <run> <step> --nudge|--fresh|--model m|--recheck`.

### 3.4 The feedback loop

- **Machine miss.** The verdict is the lesson, appended to the retry's brief as data — command, exit, both tails, "do not
  weaken it". `nudge` resumes the session; `fresh`/`model=` start cold; `recheck` re-runs the check, no tokens. `retries: n` is
  the unattended count; `wf retry` is the decider's hand on the same path (an ask file honoured once).
- **Human miss.** `wf round <run> "because"`: a new run with `follows`, cut from the previous result branch, `baseRef` at the
  result tip so the reviewer's diff shows only this round, refused while the previous run is `running` or ends in several
  terminal branches; `composeBrief` adds `## Previous round` (branch, root `.md` files) and the person's words under `## What
  was asked for` (`features.md:20-27`). `drop it` is no longer the only no.
- **Durable lesson** goes into the repository — CLAUDE.md, a skill, a test — by an agent, merged by a person. Every retry and
  round brief asks the step to record the missed rule in the guide; the decider prints `lesson: CLAUDE.md +2 −0` or `lesson:
  nothing written where the next agent reads` — `missingArtifacts` (`runner.ts:458-464`) applied to the guide. With the
  agent-facing-files line, an unmerged guide edit is visible before it steers a successor (G8).
- **A repeat miss** is three ✗ lines in one place: tries on the record, rounds chained by `follows` in `wf ls`. No aggregate verb.

### 3.5 What stays out, in the packages' words

Conditions/loops/`when` — "a judgement belongs to a step with an agent in it. The workflow is a team, not a program"
(`workflow.ts:14-18`); the ladder shrinks to `retries: n` for the same reason. An LLM in the controller or `wf decide` acting —
"The role is a person's" (README.md:247-249); "Read-only on purpose" (`cli.ts:124-127`). A stored status — "`shipped` is ASKED,
not stored" (`run.ts:289-292`). Transcript downstream — "intent and artifacts travel, process does not" (README.md:78-85).
Budget/cost the runner did not measure (`README.md:512-513`). A run-level `--check` default or `check: ''` opt-out — hkb's argv
traps (`hkb:src/spec.ts:52-54`). The check or a person runner in the engine (`index.ts:13-15`; `facade.ts:175`). `guide:`,
`inputs:`, `produces:`, `labels:`, `risk:`; `wf watch`; a run that grows steps; the splitter filing.

## 4. What the engine must gain

**Required for §3: nothing.** The `check` harness is a `HarnessSpec` the run passes (batch/v1: a `sh -c` Job is an ordinary
Job; `decide` unchanged). `unsigned` reads `state.closeoutSchema` already on the view (`domain.ts:164`; `engine.ts:23`). The
briefed retry is the `e.file({resumeFrom})` call `runner.ts:351` already makes, honoured for attempt 1 regardless of policy (`domain.ts:313-316`).

**One field, if G2 is to be enforced rather than left as content** — `tools?: string[]` on `TaskSpec` (`facade.ts:76-99`),
`SpawnRequest` (`runner.ts:25-40`), the `filed` event and `State` (`domain.ts:103-119`, `:148-168`); claude-bg emits `--tools
<list>` (or `--allowedTools`/`--disallowedTools`) beside `--permission-mode` (`runner.ts:182`); claude-detached the same
(`runner-detached.ts:282-291`); codex `-s read-only` when the list omits Bash/Write/Edit (`:236`). batch/v1: `securityContext`/
`serviceAccountName` are Pod fields (`hkb:adr-018:243-244`). `decide`: carried, never read, like `closeoutSchema`. Owes two
tests — argv at shipped defaults (`test/detached.test.ts:178-187` pattern) and a live-gated one that a `tools: Read, Grep, Glob`
`--bg` session cannot write a file (the flag is unverified beyond `--help`). `effort?: string` → `claude --effort <level>` /
codex `-c model_reasoning_effort=` is the same one-line shape as `model` and rides the same PR.

**On the engine's own account, independent of §3:** (a) `file()` refuses `permissionMode` outside the harness's enum (per
harness — the engine never learns harness vocabulary, `runner.ts:45-47`), non-finite `deadlineSeconds`/`maxAttempts`, `resume`
outside `interrupted|always|never`; a spawn `RunnerError` ends the attempt (`record-end`, `failed`, `unstartable`) instead of
rejecting the tick. (b) `Sighting.usage?: {turns, toolCalls, inputTokens?, outputTokens?, costUsd?}` from the transcript
`claudeOps` already parses (`runner.ts:98-114`), `exitCode` from the run file (`ae-worker.ts:69`), carried on `ended`, folded onto
`Attempt`, null when unmeasured. (c) Bug 1 as proposed (`open-issues.md:26-33`): the runner reports quiet-for-N as a fact, `decide`
ends the attempt *stalled* when a schema was asked and nothing came — the one change to `decide`, the one place a runner judges.
(d) The README: delete or make true `AE_RUNNER` (`:361`, `:499`), "refuse a tool call | no" (`:371`), "25 tests" (`:9`), the file
table (`:412-424`), "three next things" (`:517-524`); pin with a readme test (`hkb:test/readme.test.ts:49` style).

## 5. Above both packages, and the first three steps

**Root `CLAUDE.md`** (and `AGENTS.md`, a symlink, for Codex), loaded by both harnesses from the worktree with no code change:
`npm test` (turbo → `node --test test/*.test.ts` per package; run from the root or the package — the bare `node --test` from the
root fails 2, `facade.test.ts:211` is cwd-relative), `npm run typecheck` (`tsc --noEmit`, hkb's `lint`), the plain statement
that there is no lint script; the rules the code keeps as comments — pure module + exhaustive test, I/O at the edges
(`run.ts:4-7`; `engine.ts:4-6`), every guard gets a test that makes it refuse at shipped defaults, level-triggered
(`runner.ts:281-286`), no command from a checkout, `.exitCode 2` naming the fix, the export boundary (`index.ts:12-25`); and
"when you miss, add the lesson here in the same commit; when a step fails its check twice, the fix is content or a stricter
folder, not a hand edit". A root `.claude/settings.json` denying `git push`/`git branch -D`, plus the one test a repository
that ships a deny list owes: live, gated, a step at shipped defaults is refused `git push`.

**Skills:** `.claude/skills/verify/SKILL.md`, the same command as the `check:` — the agent runs early what the run runs after;
the check is the enforcement, the skill the convenience; review rejections become a line in it or a test.

**Refusal tests wf owes**, at shipped defaults: no `check:` → nothing spawns; a `check:` planted in the worktree's copy of the
folder is ignored; a refused check leaves `review` unfiled; `afer:`, `deadlineSeconds: 5m`, `harness: banana` refused by name;
an `isolate:false` run with `shipped = () => true` reads `awaiting`; a round's brief names the previous branch and files; a step
in `workflows/` with neither a `check:` nor a documented reason is refused; `test/boundary.test.ts` — only `runner.ts` imports
`agent-engine`, `run.ts` imports no `node:fs`/`child_process`, `cli.ts` only `runner.ts`/`workflow.ts` (README.md:404 says it in prose).

**"Start with one check you already run today on every PR."** It is `npm test && npm run typecheck`, run by hand at every
trial-merge (merge `ee2988e`). Three days, in order, each leaving 109/72/3 green:

1. **Write the check where the harness reads it; make the READMEs true.** Root `CLAUDE.md` + `AGENTS.md`; `.claude/settings.json`
   deny list; in `agent-engine/README.md` delete the `AE_RUNNER` sentences and the "refuse a tool call" row or make them
   true, replace the numbers with a readme test; fix the workflows layout table; mark bug 5 fixed. No package code; every step
   spawned from now on reads the commands.
2. **Close the parser, freeze the workflow.** `STEP_KEYS` + unknown-key/empty-`check:`/non-numeric/unknown-harness/
   permissionMode-enum refusals in `workflow.ts` with hkb-style messages; `BRIEF_KEYS` and a `test/brief.test.ts` in the
   engine; `run.workflow` frozen at `wf start` with the `?? loadWorkflows` fallback; `test/boundary.test.ts`. Pure functions
   and tests; the 72 existing tests join, none edit. A `check:` can no longer be silently dropped.
3. **The check, without retries.** `CHECK` in `engine()`; `check:` parsed; `readVerdict`; `tries[].checks`; `assess` gains
   `verdictOf` and `askedCloseout`; `after` waits on `verified | unverified`; `unsigned`; handOff for every finished try before
   its check; the contract appended; `wf ls`/`wf decide` words. Ship `check: npm test && npm run typecheck` on this repo's own
   `workflows/implement.md` and `respond.md` through the user door. Refusal tests: nothing spawns without a check; a planted
   check is ignored; a refused check files no follower.

Then: `retries:` + `wf retry`; the decider screen (radius, sensitive diffs, lesson line, the G5 fix); `wf round`; engine `tools` + `effort`.

## 6. Refuted findings and deliberate exclusions — do not re-propose

- **f10 mid-run human gate** — refuted: the run boundary is the placeable gate (`cli.ts:47-57`; README.md:46-49); residue → G6, G2.
- **f8 blind retry / auto-escalation** — design-refuted: escalation is the decider's (README.md:41-42; `features.md:24-25`);
  a nudge has no content without a check (→ G1); `effort` kept as a one-line field.
- **f1 as critical / CI / lint** — narrowed (G3); **f5** — narrowed to usage (G7); **f6(a)** shortstat-only decide — stated
  design (README.md:254-256), residue is printing the diff command; **f7 skills half** — collapses into G1/G2/G3.
- Budget ceilings, approvals, worktrees, PRs, multi-machine in the engine (`README.md:510-515`) — accepted; the cost *record* (G7) is not covered by that sentence.
- An LLM judge, an agent decider, `wf decide` auto-merging (README.md:247-249, :269-270) — accepted, the post's own stance.
- Conditions/`when`/loops (`workflow.ts:14-18`); a stored status (`run.ts:289-292`); transcript downstream (README.md:78-85); `decide`
  unexported and the closeout unread by the engine (`index.ts:48-50`; `engine.ts:71`); cross-session messaging as a nudge
  (README.md:353-363); bugs 3 and 4 (`open-issues.md:51-64`) — all accepted as stated; §3.5 says where each lands.
- A `risk:` tag (a label enforces nothing, `hkb:src/labels.ts:28-30`) and "refactor or reuse" as a machine check (a judgement) — the radius is shown instead.
- Splitter filing steps, `wf rm`, watch-instead-of-poll, hkb migration (`features.md:42-117`) — planned, off the four points;
  `--no-worktree` as an escape in itself — opt-in, refused on fan-out; only its false `shipped` is kept (G5).
