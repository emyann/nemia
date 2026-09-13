# agent-workflows as Tekton on batch/v1 — the shape

Paths are relative to `/home/yrnd1/projects/hkb-v2` unless prefixed `hkb:` (= `/home/yrnd1/projects/harness-kanban-board`).
Every hkb-v2 claim below was checked against the code; hkb claims cite the ADR or module read for this document.

## 1. Thesis

agent-workflows is already the second kind: a controller (`advance`, `packages/agent-workflows/src/runner.ts:287-362`) over the engine's task, with a pure decision function (`assess`, `src/run.ts:60-107`) and I/O at the edges — exactly the Tekton-on-`batch/v1` split the engine README asks for (`packages/agent-engine/README.md:510-515`). What it lacks is not a run model but an **exit code**: a step is filed on `succeeded` (`run.ts:97`), and `succeeded` means only that a session ended (bug 1, `packages/agent-engine/docs/open-issues.md:11-34`; `run.ts:240` reads anything not `blocked` as `done`). hkb spent eighteen ADRs learning that determinism belongs at the lowest layer that can *refuse* (`hkb:docs/workflow-study.md:94-96`), and that for an agent session the refusing layer has to be reconstructed as a post-mortem check beside the declared outputs, never as a hook and never as prose (`hkb:docs/wiki/decisions/adr-016-the-pod-spec-is-the-map.md` §3; `hkb:src/check.ts:1-19`). So the shape is: keep the format a folder of markdown with `after` as its one edge, keep the engine untouched, and give the **run** the three things a Pipeline has and a Job does not — a per-step completion check whose non-zero exit refuses the step and briefs the retry (`check:`, `retries:`), a step a person runs (`harness: person`) so the human gate is placed by the author and not only at the end, and a tool ceiling passed down to the harness (`tools:`), which is the one field the engine's task must gain because the PodSpec has it. Everything else in hkb's map — inputs, results, artifacts, guide, labels, proposals, budgets — either already lives here in a cheaper form (the closeout, the branch, the brief), stays content, or stays out.

## 2. The step format

A step is still `workflows/<name>.md`: frontmatter, then prose. Parsed by `parseWorkflow` (`src/workflow.ts:50-77`). Three keys are new, one value is new, and the parser's silence on unknown keys ends.

| key | meaning | enforced by | status |
|---|---|---|---|
| `after: a, b` | file only when every named step is **accepted** (below); `a, b` also means "merge me both" (`run.ts:478-490`) | RUN — `validate` refuses dangling/self/cycle before spend (`workflow.ts:94-125`); `assess` gates (`run.ts:91-98`) | unchanged in syntax; the gate word moves from the engine's `succeeded` to the run's `accepted` |
| `resume: x` | continue x's session; implies `after: x` (`workflow.ts:63-64`) | RUN picks the session (`runner.ts:325-329`, `:351`), ENGINE journals it, HARNESS `--resume` | unchanged; **refused** when x is a `person` step (no session to continue) |
| `harness:` | `claude` (default) \| `codex` \| `claude-detached` \| **`person`** | ENGINE dispatches the first three (`facade.ts:169-173`); RUN owns `person` — no task is filed, the step is accepted when `runs/<id>/<step>.approved` exists | value added; `model`, `permissionMode`, `check`, `tools`, `deadlineSeconds`, `maxAttempts`, `retries` are refused by name on a `person` step |
| `model:` | pass-through | HARNESS `--model` / `-m` | unchanged |
| `permissionMode:` | pass-through, engine default `auto` (`runner.ts:182`) | HARNESS | unchanged; `dontAsk` documented as right only beside `tools:` (README.md:387-389 already says so) |
| `deadlineSeconds:` | wall clock across the engine's attempts of one try | ENGINE (`domain.ts:259-265`) | unchanged |
| `maxAttempts:` | how many **sessions** the engine may spend on one try before it settles `failed` — lost or failed sessions, i.e. before any closeout | ENGINE (`domain.ts:271-273`) | unchanged; meaning clarified against `retries` |
| **`check:`** | one shell line. After the step's task settles `succeeded` and its tree is committed, the run executes it in the step's workspace; exit 0 accepts the step, anything else **rejects** it. Absent = nothing runs (the shipped default) | RUN, post-mortem (hkb layer 4) — never the engine, never the harness | **new** |
| **`retries:`** | how many times a rejected step is re-filed (Tekton `PipelineTask.retries`); default 0 | RUN — files task `<run>-<step>.<k>` with `resumeFrom` and the failure briefed | **new** |
| **`tools:`** | the tool surface ceiling: a comma list; anything else does not exist for the session | HARNESS, via one engine field (§7) — until the engine carries it, **nobody**, and the run refuses the key with a message naming that fact rather than accepting it silently | **new** |
| unknown key | — | RUN — refused by name with the list of legal keys (`hkb:src/templates.ts:291-298` is the model); today `meta` swallows anything (`workflow.ts:53-57`) so `afer: implement` makes a silent root step | **changed** |
| non-numeric `deadlineSeconds`/`maxAttempts`/`retries` | — | RUN — refused; today `Number('abc')` is `NaN` and travels (`workflow.ts:74-75`) | **changed** |

Still not declarable per step, on purpose and unchanged: `cwd` (the run's workspace, `runner.ts:343`), `worktree` (the run owns worktrees, `runner.ts:149-155`), `closeoutSchema` (always `CLOSEOUT_SCHEMA`, `runner.ts:354`), artifacts (a file the step wrote; "No frontmatter key to declare them", README.md:251-254). A step that must produce a file writes `check: test -f REVIEW.md` — the exit code covers files as well as behaviour, which is why there is no `produces:` key (hkb:workflow-study §4: "without [check] a declared output is satisfied by one `echo`").

**The row-by-row verdicts** (ADR-016 decision 1 table; ADR-008..018):

| Pod-spec / hkb row | verdict here | why |
|---|---|---|
| Job, Pod, `backoffLimit`, `activeDeadlineSeconds`, concurrency ceiling | already on the engine's task (`maxAttempts`, `deadlineSeconds`, per-harness ceiling) | nothing to add |
| the container's exit code (`check`, ADR-016 §3, `hkb:src/check.ts`) | **run**: `check:` | the engine's word is "the session ended"; the run is the layer that knows what one step must satisfy before the next |
| `serviceAccountName`+RBAC / `allowedTools` / admission (ADR-011 d.1, ADR-018 audit: core) | **engine task field** `tools`, set from the step | it is a Pod field; hkb measured the tool surface as "the only layer that held when `permissionMode` did not" (hkb:workflow-study:137). The run cannot add a `PreToolUse` hook without re-growing a harness (hkb lesson: ~1,000 lines reimplemented) |
| ConfigMap→**env** / inputs (ADR-016 §7; `hkb:src/inputs.ts`) | **content**, plus env for the check only | a model's input is the workspace and the brief (`composeBrief`, `run.ts:409-451`); a *script's* input is env, so the check runs with `WF_RUN`, `WF_STEP`, `WF_BASE_REF`, `WF_WORKSPACE`. No `inputs:` key |
| Tekton `results` / the closeout (ADR-008 d.1) | already here: `CLOSEOUT_SCHEMA` (`run.ts:189-199`), read by the run, carried never read by the engine (`domain.ts:145`) | one schema for every harness; a per-step result schema is "a type system … a model can satisfy by assertion" (ADR-008) |
| declared outputs / `artifacts` (ADR-008 rule: a shortfall fails the attempt) | closeout `artifacts` stay agent-volunteered; a declared file missing from the branch becomes a **shortfall** that rejects the step (today reported only at `wf decide`, `runner.ts:458-464`) | it is already computed; hkb's caveat holds — presence is satisfiable by `echo`, so the strong guard is `check:` |
| `exports` (ADR-008) | out | the branch is the export; `wf decide` prints the merge command (`cli.ts:176`) |
| `emptyDir` / workspace (ADR-018 d.2) | run-owned worktree, unchanged (`runner.ts:174-217`) | the engine's `worktree:` field stays unused by this package; which tree a step gets is a fact about the workflow's shape |
| `initContainers`/sidecars (ADR-016 §2) | out; the one built-in init stays a constant (`node_modules` link, `runner.ts:129-133`) | a step with `Bash` can run `npm ci` itself; a `setup:` key needs env projection and failure semantics — the third vocabulary ADR-016 warns against |
| `startupProbe` | engine grace window (`engine.ts:16`) | already |
| `lifecycle.preStop`, TTL sweep | out (`wf rm`, `docs/features.md:42-93`) | separate feature |
| `resources.limits` — `maxBudgetUsd`, `maxTurns`, `effort` | out | the engine excludes budget ceilings (README.md:512) and no CLI runner reports cost (`runner-sdk.ts` only); a cap that cannot be measured is a report. `effort` passes the Pod test and is a one-line pass-through, but this package does not need it — see §7 |
| the gate (ADR-010 "a field"; ADR-018 audit: "a step in somebody's process → Step") | **a step**: `harness: person` | ADR-018's own last word, and ADR-017 d.3 ("an effect is a step with no agent in it"). The DAG does not change; the seat is filled by `wf approve`; the words travel as intent |
| the guide (ADR-013: read from `repoPath`, prepended) | **harness-owned**; no `guide:` key | the CLI reads `CLAUDE.md` from its cwd itself. That cwd is the *worktree*, so a step can edit what the next step obeys — the run therefore names edits to agent-facing files in `wf decide` (§4) and a repo can pin them with a check (`git diff --quiet $WF_BASE_REF -- CLAUDE.md .claude`) |
| skills by grant (ADR-012) | harness-owned; out | `claude` loads `.claude/skills` from cwd; nothing for the run to grant |
| labels (ADR-017 d.4: grouping, never enforcement) | out | the run id carries the slug, the step name the part, `workflowDir` the workflow; `wf misses` groups on those |
| proposals (ADR-011) | out; the splitter proposes, does not file (README.md:46-49) | "grows steps from a plan" stays deferred (`features.md:95-111`) |
| workflow templates: "the keys are the flags", refusals (ADR-015 d.3, `hkb:src/templates.ts`) | **in**: unknown keys refused; a test walks the frontmatter keys against `TaskSpec` (`facade.ts:76-99`) plus the run's own three | the cheapest of hkb's refusal tests and the one this package lacks |
| the record per Attempt (cost, turns, denials, check tails) | the run record gains the check verdict and shortfall per try; `costUsd`/`turns` come from `TaskView` (`engine.ts:22`) when a runner fills them | measured-not-reported; null means not measured |
| `isolationShortfall` | not needed — the run cuts the worktree itself and knows its path | |
| the boundary as a test (ADR-018) | **in**: `test/boundary.test.ts` — only `runner.ts` imports `agent-engine`; `run.ts`/`workflow.ts` import no `node:fs`/`child_process`; `cli.ts` imports nothing but `runner.ts`/`workflow.ts` | README.md:404 says it in prose; hkb re-argued its line three times until it was a test |

## 3. The run model

**What a run records.** Two writers, two files, composed on read — the existing rule (`runner.ts:21-45`). A third person-owned file is added for approvals.

```
runs/<id>.json               written by the tick only
runs/<id>.cancelled          written by `wf cancel` only (unchanged, runner.ts:35, :53-62)
runs/<id>/<step>.approved    written by `wf approve` only — { at, words }   (new)
```

```ts
Run = {
  id, repo, baseRef, branch, isolate, brief, createdAt,
  workflowDir,                 // kept: old records, and `wf misses` groups on it
  workflow?: Workflow[],       // NEW: the parsed steps, frozen at `wf start`. Ticks read this,
                               // never the folder — "a run's steps come from a folder that is
                               // fixed when the run starts" (README.md:46-49) becomes true by
                               // construction (today loadWorkflows runs every tick, runner.ts:288),
                               // and the check command can only come from the record — never the
                               // workspace (hkb:src/check.ts:21-28). Old records fall back to workflowDir.
  steps: Record<name, {
    taskId: string | null,     // unchanged meaning: the CURRENT try's task (apps/api reads it, app.ts:21-25)
    workspace?, branch?,
    tries?: Array<{            // NEW, one per filing; tries[k].taskId === `<run>-<step>` for k=0, `.<k+1>` after
      taskId, filedAt,
      check?: Verdict,         // written once, never rewritten
      shortfall?: string[],    // closeout artifacts not on the branch, found before the check
    }>,
    askedAt?: string,          // person step: when it became ready and was put to the person
  }>,
  cancelledAt?,                // composed from .cancelled
  approvals?: Record<name, { at: string; words: string }>,   // composed from <step>.approved
}
Verdict = { command, kind: 'exit' | 'unfinished' | 'unstartable', exitCode: number | null,
            stdout: string, stderr: string,   // the LAST 4 KB of each, separately (hkb:src/check.ts:48-52)
            startedAt, endedAt }
```

The engine's journal keeps everything it keeps today; the run's record adds only what the engine cannot know. There is no run journal: every event below is a timestamp already in the record, so a feed is derived, not stored.

**Events** (derivable): `started` (createdAt) · `filed <step> try k` (tries[k].filedAt) · `handed-off <step>` (the commit `"<step>: hand off what was left uncommitted"`, git's) · `checked <step> try k → exit n | unfinished | unstartable` (check.endedAt) · `rejected <step>` (a verdict ≠ exit 0, or a shortfall) · `asked <step>` (askedAt) · `approved <step>` (approvals[step].at) · `cancelled` (cancelledAt) · `shipped` (asked of git, `runner.ts:472-477`, never stored).

**A step's status** — one pure function over four facts (engine phase, closeout, verdict, approval), replacing the inline `phase()` in `assess` (`run.ts:78-86`):

```
stepStatus(name) =
  person step:   approved → accepted · askedAt set → needs-you · else waiting
  no task:       waiting
  engine failed/stopped:              failed / stopped            (unchanged)
  closeout.outcome === 'blocked':     blocked                     (unchanged, run.ts:84)
  engine succeeded, check declared, no verdict:  checking
  shortfall non-empty, or verdict.kind ≠ 'exit', or exitCode ≠ 0:
       tries.length < 1 + retries → retry      else → rejected
  otherwise:                          accepted
```

`after` files on `accepted`; `failed`, `stopped`, `blocked`, `rejected` block successors for ever (as `run.ts:96` does today). A step that went quiet without a closeout and has no `check:` is still `accepted` — that is bug 1, it is the engine's to fix (its proposed fix is in `open-issues.md`), and this package does not paper over it; what it does is make every step that matters checkable.

**What a tick does, in order** (`tick`, `runner.ts:401-409`, and `advance`):

1. `await e.tick()` — the engine first, unchanged.
2. Per run: `readRun` composes json + `.cancelled` + `<step>.approved`.
3. Cancel enforcement, every pass (`runner.ts:300-306`) — unchanged.
4. **Hand-off**: commit what every `succeeded` task left (`runner.ts:317-320`) — unchanged, and still before anything merges.
5. **Shortfall**: for a succeeded try with a closeout and no `shortfall` recorded, `missingArtifacts` (`runner.ts:458-464`) is computed once and written.
6. **Check**: `dueChecks(run, phaseOf)` (pure) names tries that are `succeeded`, have a `check:`, and have no verdict. For each, `runCheck` spawns `sh -c <command>` with `cwd` = the try's workspace, env as in §2, a 10-minute cap and 4 KB tails per stream (hkb's numbers, `hkb:src/check.ts:56-59`, and its reasons), then writes the verdict. The command string comes from `run.workflow`, never from disk under the step. Async spawn, awaited — the event loop is free (`wf cancel` is another process) but this run's filing waits; see §9.
7. `assess(steps, run, stepStatus)` — pure — returns `ready`, `retry`, `ask`, `blocked`, `status`.
8. For each `retry`: file `<run>-<step>.<k>` with `cwd` = the same workspace, `resumeFrom` = the previous try's last `nativeId` (the engine honours it for attempt 1 regardless of policy, `domain.ts:313-316`), and brief = `withCheckFailure(...)` — the command, the exit, both tails framed as data, and the instruction not to weaken it (`hkb:src/brief.ts:173-230`). If there is no session to resume (lost), the full brief plus the failure.
9. For each `ask`: set `askedAt`; nothing is filed. For each `ready`: `workspaceFor` + `e.file` as today (`runner.ts:332-358`), with the closeout contract **and**, when the step has a `check:`, `withCheck` appended by the runner — "This command must exit 0 in your checkout when you finish … Do not weaken it" (`hkb:src/brief.ts:245-268`). Mechanism, not prose an author remembers, for the same reason `closeoutContract` is (`run.ts:251-253`). A `person` step's workspace record is inherited from its single predecessor (`validate` refuses a person step with several `after`).
10. Write the record once, if anything changed.

Level-triggered throughout: a verdict, once written, is never recomputed; a tick that dies mid-check leaves no verdict and the next tick runs the check again (checks are assumed idempotent — `npm test` is; a check that is not belongs in the step's prose, not in `check:`).

**Where checks run and where results go.** In the step's worktree, after its commit, with the tick's privileges. The verdict goes to `tries[k].check` in the run record; to the retry's brief; to `wf ls` as one word; to `wf decide` with the tails. Nowhere else — the engine never sees it.

**Where a human gate goes, and how an author places it.** Anywhere in the DAG, as a step:

```md
---
harness: person
after: review
---
Read REVIEW.md on this branch. Say whether respond should go ahead, and anything the
reviewer got wrong about what was asked.
```

Then `respond.md` has `after: approve` and `resume: implement`. The step's body is the question `wf ls`/`wf decide` put to the person; `wf approve <run> approve "the second finding is wrong, the flag is optional"` writes the file; the words travel to every successor as `## What approve said` — a person's words are intent, and intent travels (README.md:78-85). The end of every run is still `wf decide`; a `person` step is `wf decide` placed where the blast radius earns it (ADR-010: "any Job whose blast radius earns a second pair of eyes"). Rejection is `wf cancel` (already exists) or a new run; rounds stay unbuilt (`features.md:9-40`). The approver is a seat: a person at a terminal, or whatever writes the file.

Two counters, said plainly because they compose: `maxAttempts` is the engine's — sessions spent before the workload said anything (lost, failed); `retries` is the run's — filings spent after the workload said "done" and the check said otherwise. Kubernetes has the same pair: a Pod's `restartPolicy` under `backoffLimit`, and Tekton's `retries` above it.

## 4. What `wf ls` and `wf decide` show

`wf ls` — one line per step, still (`run.ts:362-364`): the engine's phase word, the closeout word, and the verdict word.

```
fix-the-parser-k2q9  Fix the parser so a trailing comma is not an error
   implement   succeeded · done · check ✓ 41s            wf/fix-the-parser-k2q9/implement
   review      succeeded · done · check ✗ exit 1 · try 2/2 (rejected)   wf/fix-the-parser-k2q9/review
   approve     needs you                                  wf approve fix-the-parser-k2q9 approve
   respond     waiting
   → waiting on you: approve  —  wf decide fix-the-parser-k2q9
```

`checking` while a check runs; `shortfall: REVIEW.md` when a declared artifact is not on the branch; `$0.42 · 31 turns` beside a step only when the runner measured it (`TaskView.costUsd/turns`, `engine.ts:22`; today the CLI runners leave them undefined, and the column is absent rather than zero).

`wf decide <run>` — the short-circuits stay (`cli.ts:133-135`); then:

1. `FAILED:` / `REJECTED:` / `BLOCKED, waiting on you:` / `NEEDS YOU:` (a `person` step, with its body printed) / `every step accepted`.
2. Per step: the closeout summary and `needs` as today (`cli.ts:146-155`); for a rejected try, the verdict — `check: npm test — exited 1 (try 2 of 2)` and the two tails, labelled by stream.
3. Per terminal branch: `git diff --stat base...branch` (per file, not `--shortstat`, `runner.ts:502-504`) — the reader sees *which* files, which is what "blast radius decides how much you read" needs; then one line, only when true: `touches agent-facing files: CLAUDE.md, .claude/settings.json, .codex/rules/git-commit.rules, package.json` (a fixed list; a repository that wants more pins it with a check). Root `.md` printed in full as today (`cli.ts:164-171`). `--diff` prints the full diff, because the person rejecting should not have to leave the screen to see the code.
4. `this workflow, last 10 runs: shipped 6 · dropped 2 · open 2 · check refused implement×3, review×1` — `misses()`, pure, over the records of every run with the same `workflowDir`, with "shipped"/"dropped" asked of git (ancestor of base / branch gone and not an ancestor).
5. `ship it` / `drop it` commands, unchanged and still not executed (`cli.ts:124-127`, `:176-177`).

`wf approve <run> <step> ["words"]` — the one new verb. `wx` semantics like `markCancelled`: the first approval stands. `wf show` prints the frozen workflow and each try's verdict. `wf misses [--workflows dir]` prints §4.4 as a table per (workflow, step).

## 5. The feedback loop

Where a lesson goes when a step misses, in the order the evidence arrives:

1. **Into the retry, mechanically.** The rejected try's next filing carries the command, exit code and tails (§3 step 8). This is the only loop with no person in it, it is bounded by `retries`, and hkb measured it as "the practice that has actually worked" (`hkb:docs/rebuild-plan.md:466-471`; `hkb:src/brief.ts:155-171`).
2. **Into the branch, by a step.** The post says "have it write the lesson into CLAUDE.md or a skill". Here that is a step with an agent in it — `after: respond`, prose: *read REVIEW.md and RESPONSE.md; if a finding was a missing rule, propose the rule in CLAUDE.md or a test in `workflows/<step>.md`'s check; change nothing else* — whose edit lands on the run's branch and reaches the repository only through the person's `git merge`. Tekton's `finally` slot, with the human merge as the boundary (ADR-012 d.5, ADR-013 d.2: "a worker that could write the guide its own next attempt obeys would be steering itself"). No new machinery; `wf decide` already prints the root-level `.md` a step wrote.
3. **Into the workflow folder or `check:`, by the person.** A rejection at `wf decide` that was the *brief's* fault is a PR to `workflows/<step>.md`; one that was a *missing check* is a `check:` line; one that was the *repository's* is `CLAUDE.md`. All three are content, all three travel through a merge, none needs a verb.

**How a repeat miss becomes visible.** `wf misses` (§4.4): the same step of the same workflow refusing its check across runs, or the same run shape being dropped, is arithmetic over records and git — no model in the loop. A rising `check refused implement×N` with a flat ship rate is the signal the post's point 4 names ("if it still misses"): raise `model:` on that step, or pay the debt the check keeps finding. The record makes that a number a person can read in `wf decide`'s header instead of a memory.

## 6. What stays deliberately out, and why

- **No condition, loop, `when`, or expression.** `after` is still the only edge; `retries` re-files the same step, `person` is a step, `check` is a command. "The interesting decisions … are judgements, and a judgement belongs to a step with an agent in it" (`workflow.ts:14-18`) — and the check is exactly the class of decision that is *not* a judgement.
- **No LLM in the controller.** `assess`, `stepStatus`, `dueChecks`, `misses` are pure functions over records; the check is a shell exit code; the approver is a file. Hermes runs a decomposer in the dispatcher every tick; this package does not (map-inspirations §A3).
- **No `PreToolUse` hook, no package-owned runner.** The ceiling is one flag on the harness, passed through the engine (§7). A `PromiseRunner` written here to add flags would be the ~1,000-line harness reimplementation hkb deleted (ADR-018 "What the runtime already provides").
- **No budget ceiling, no cost column the runner did not fill.** Excluded by the engine (README.md:512); the run displays `costUsd`/`turns` only when a runner measured them.
- **No `guide:`, `inputs:`, `setup:`, `produces:`, `labels:`, `gate:` keys.** Each is either harness-owned (guide, skills), already the workspace (inputs, produces → `check:`), or grouping the run id already gives (labels). A `gate:` field would be a second way to say `harness: person`.
- **No engine task for a person step.** A `person` `PromiseRunner` inside the engine would count against `maxConcurrent` — one number for every harness (`facade.ts:175`, `engine.ts:19`) — so two open gates would block a third; and it would put questions to people on the engine's board beside sessions. The run owns the seat.
- **`wf decide` stays read-only; rounds stay unbuilt; the run holds no status but cancellation.** The approval file is a decision *about a step*, composed on read like `.cancelled`; whether a run shipped is still asked of git (`run.ts:4-12`). `wf approve` is not `wf round`.
- **No artifact repository, no exports, no per-step result schema, no watch verb, no proposals-that-file.** All explicit exclusions the maps quote, and none is needed by the three additions.

## 7. The boundary with the engine

**What the engine must gain: one pass-through field, `tools?: string[]`** on `TaskSpec` (`facade.ts:76-99`), `SpawnRequest` (`runner.ts:25-40`), the `filed` event and `State` (`domain.ts:101-119`, `:148-168`), carried by `claudeOps` as `--tools <list>` beside `--permission-mode` (`runner.ts:182`) and by the `codex` spec as `-s read-only` when the list names no `Bash`/`Write`/`Edit` (a lossy translation, which is the runner's job: "translating between them is the whole job of a runner", README.md:326-328; codex has sandbox modes, not a tool list — `runner-detached.ts:236`). `decide` does not change — the test the README sets (README.md:514-515). It passes the Kubernetes test: `securityContext`/`serviceAccountName` are Pod fields, and hkb's field audit puts `allowedTools` in the core column (ADR-018 "The audit"). It is the same shape as `closeoutSchema`: declared on the task, passed verbatim, never interpreted (`domain.ts:112-118`). It owes two tests, because it rides an untyped flag (hkb lesson: "anything wired through the untyped `extraArgs` owes a test that fails when the flag stops working"): the argv one at shipped defaults (the pattern of `detached.test.ts:178-187`), and a live-gated one that a `tools: Read, Grep, Glob` session cannot write a file. Without this field the `tools:` key is prose, and the package says so by refusing it.

**What the engine may gain, and this package does not ask for: `effort?: string`** → `claude --effort <level>` (the CLI has the flag; grep finds no `effort` in either package). It is a `resources`-shaped Pod field and a one-line pass-through like `model`; the post's "turn effort to higher" would then be a frontmatter edit. Deferred because `model:` is already the lever and nothing here needs a second one.

**What the engine should still fix on its own account: bug 1** (`open-issues.md:11-34`) — a step that asked for a closeout and went quiet should not settle `succeeded`. The package's shape does not depend on it; the check is what makes a false completion cost one refused try instead of a shipped defect.

**What belongs above the package:**

- A root `CLAUDE.md` for this repository with the exact commands — `npm test` (109 + 72 + 3), `npm run typecheck` (4/4), and the sentence "there is no lint script" until there is one (map-v2 §1h) — plus the rules the code already keeps as comments: level-triggered ticks, pure module + refusal test, every error names the fix. The harness reads it from the worktree; the package does not prepend it.
- This repository's own workflows, through the user door (ADR-015 d.4): `packages/agent-workflows/workflows/implement.md` gains `check: npm test && npm run typecheck` and `retries: 1`; `review.md` gains `tools: Read, Grep, Glob, Bash` once the engine carries it, or `check: git diff --quiet $WF_BASE_REF -- src/` until then (a reviewer that changed source is refused).
- Skills a repository ships (`.claude/skills`) — loaded by the harness from the worktree; nothing in the package.
- `apps/api`: `GET /api/runs` already summarises the record (`apps/api/src/app.ts:15-26`); the verdict and approvals ride along in `steps[].tries` with no package change. A `POST /api/runs/:id/approve` is the api's first write and is the same file `wf approve` writes — one module, two consumers (ADR-015 d.5).

## 8. Migration, five steps, each green

`npm test` in `packages/agent-workflows` runs `test/{workflow,run,store}.test.ts` (72 tests) against pure functions and a fake engine (`store.test.ts:39-59`). Each step below adds tests and breaks none.

1. **Refuse, then freeze.** `parseWorkflow` refuses unknown keys by name and non-numeric numbers (tests: `'a step with an unknown key is refused, and told the legal ones'`, `'deadlineSeconds: soon is refused'`; `'the shipped examples are valid workflows too'` at `workflow.test.ts:116` keeps passing). `start` stores `run.workflow`; `advance`/`list`/`decide` read `run.workflow ?? loadWorkflows(run.workflowDir)`. Existing tests construct `Run` with `workflowDir` only and still pass. Add `test/boundary.test.ts` (import fences). Green.
2. **`check:` and the verdict, no retries.** Parse the key; `Verdict`, `verdictOf` (pure: exit/unfinished/unstartable → accepted/rejected), `dueChecks` (pure), `runCheck` (I/O, timeout, tails); `stepStatus` replaces the inline `phase()`; `withCheck` appended at filing. `tries` appears on the record with `taskId` kept in step. Refusal tests at shipped defaults: no `check:` → nothing spawns; a `check` planted in the worktree's own copy of the workflow is ignored because the command comes from `run.workflow`; a refused check blocks successors; a shortfall rejects; a verdict is written once. Old runs (no `tries`) list unchanged. Green.
3. **`retries:`.** `assess` returns `retry`; `advance` files `<run>-<step>.<k>` with `resumeFrom` and `withCheckFailure`. Tests: the retry brief carries command, exit and both tails and no transcript; the cap holds; a lost session retries cold; `wf ls` shows `try 2/2`. Green.
4. **`harness: person` and `wf approve`.** `validate` accepts the value and refuses `resume:` onto it, several `after`, and every task-only key by name; `readRun` composes `<step>.approved`; `stepStatus` handles `needs-you`/`accepted`; the words are appended to successors' briefs; `listing`/`decision` print the question and the command. Store test: an approval landing mid-tick survives the tick (the `.cancelled` test at `store.test.ts:77` is the template). Green.
5. **The screens and the tally.** `wf decide`: `--stat`, the agent-facing-files line, `--diff`, verdict tails; `misses()` pure over records with `shipped`/`dropped` injected, and `wf misses`. `tools:` is parsed and **refused** with the message "the engine does not carry a tool surface yet; see facade.ts TaskSpec" until the engine field lands — a declaration nothing enforces is the failure hkb named five times (`hkb:…/adr-015-machinery-and-consumer.md:95`), so the key is not accepted silently. Green. The engine's `tools` field is a separate change in `packages/agent-engine` with its own two tests; when it lands, step 5's refusal becomes a pass-through and one test flips.

## 9. Risks, and what would prove the shape wrong

- **The check is gamed through the tree it runs in.** `npm test` resolves through `package.json`, which the step can edit — hkb's own honest note (`hkb:src/brief.ts:222-223`); the fence is on the command *string* only. Signal: a rejected-then-accepted retry whose diff touches `package.json`, test config, or the tests themselves. `wf decide`'s agent-facing-files line and `git diff --stat` are the reader's defence; if this is common, the check needs to run in a *second* worktree cut from the branch with the repository's own test files restored — cheap to add, not done first.
- **A ten-minute suite serialises the tick.** Step 6 of §3 awaits the check; other runs' *filing* waits (their sessions do not — the engine ticked first). If fleets stall on this, spawn checks detached with a verdict file and a pid, the engine's own detached-worker pattern (`runner-detached.ts`); it is the same ~40 lines hkb paid (`hkb:src/check.ts:306-344`).
- **`--tools` does not hold under `claude --bg`.** Unverified on this machine beyond `--help`. The live-gated test is the proof; if it fails, the row falls back to prose and the package keeps refusing the key rather than accepting a decoration.
- **Retries reproduce the tree.** hkb measured this without briefing; this shape briefs. Measure retry pass-rate on real runs; if resumed retries pass no more often than cold ones, make the retry cold by default (the engine's own reasoning about failed contexts, README.md:47-49) and keep the briefing.
- **Person steps sit for days.** No deadline applies (a person is not a session). `wf ls`'s `waiting on you` is the only nag; if runs rot, a `person` step needs an `askedAt` age in `wf ls` and nothing more.
- **The thesis's own falsifier.** If in practice every step of every workflow ends up carrying `check:`, the exit code wanted to be on the *task*, not the step — `successPolicy` is a JobSpec field and hkb marked `check` "borderline — leave until Step exists, then decide" (ADR-018 audit). The evidence to watch: `check:` on `review`-shaped steps (a reviewer's exit code is the reviewer's judgement, which no command expresses). If checks stay on implement/integrate-shaped steps and off review-shaped ones, the field is the run's and this shape is right; if every step needs one, move it down and let the engine settle `failed` on a non-zero check, which changes `decide` — the line the engine README says not to cross.
- **Freezing the workflow bloats records or surprises authors.** A run's steps are a few KB; the surprise ("I edited the folder and the running run ignored it") is the documented intent (README.md:46-49) made real, and `wf show` prints what was frozen.
