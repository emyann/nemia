# Design, 2026-09-28: feature folders and size limits

> **Status (2026-10-23): landed.** The packages were put into feature folders on 2026-09-28 (`05da9c41e`, `f23438191`,
> `742d857ee`), and the orchestrator's last slices, 3 to 7, followed on 2026-09-29 (`c82e9b81e` to `a52928fc4`).

A design note for the owner to approve. It changes no code. It rests on the owner's decisions of 2026-09-28 and on measurements taken on
`694f45c` with oxlint 1.86 and eslint-plugin-sonarjs 4.2.2.

## In one paragraph

**The packages do not move.** `packages/agent-runtime`, `packages/agent-orchestrator` and `apps/api` stay where they are, with the same
names, the same `package.json` exports and the same imports from outside. What changes is the inside of each package's `src/`: the code is
organised **by feature**, one folder per feature — `src/retry/`, `src/forget/`, `src/feed/`, `src/workflow/`, `src/tick/`, `src/cli/` in the
orchestrator; `src/core/`, `src/harness/claude/`, `src/a2a/` in the runtime; `src/runs/`, `src/asks/`, `src/agents/` in the api. **Each
feature folder holds all of that feature's parts**: its pure judgement, its store, its verb, its sentences, and its tests. Size and
complexity limits come on in oxlint as a ratchet: new code meets them, and today's offenders sit on a list that only shrinks.

## Decided (owner, 2026-09-28)

1. Feature folders, not folders by kind, inside each package's `src/`. The packages themselves do not move.
2. **Tests live beside the code**, in the feature's folder (`src/retry/retry.test.ts` next to `src/retry/retry.ts`).
3. A feature folder holds a few small files **split by kind first** (pure, store, controller), with a face other features import from. The
   owner's guide is two to six files a folder, each within the limits.
4. The limits: lines per function (80), cyclomatic complexity (20) and **cognitive complexity at 15 per function**
   (`sonarjs/cognitive-complexity`, through oxlint's `jsPlugins`, with `eslint-plugin-sonarjs` as a dev dependency) shape the code. Lines
   per file are held at **500 code lines, a ceiling against giant files, never a target**. No Halstead.
5. **Against fragmentation.** An agent reads by grep and in chunks, so a decision split across many files costs it more than one long file.
   These rules follow:
   - a decision's steps stay in one file;
   - a helper used once sits beside its caller;
   - a split follows the feature (rules, store, verb), never a generic `utils` module;
   - a file of up to 500 code lines is never split for size, so one read takes a decision whole.
6. **Each restructure's closeout compares the tokens its agents read per step** with a similar card from before, using the runs' own meter.
7. **File names follow the feature**: a folder's pure file is named after it (`say/say.ts`), and stores and verbs carry a suffix
   (`retry/retry.verb.ts`, `record/record.store.ts`).
8. **A folder's `index.ts` re-exports its pure files only**; stores and verbs are imported by their own path.
9. **About 39 folders in the orchestrator**, small features included, and the client rule of `boundary.test.ts` **read through
   imports** (see "The kinds, by path").

## What was measured

The brief's counts (orchestrator 18/49/39 as files/functions/complexity, runtime 12/38/21, api 13/22/10, web 16/69/17) are **raw lines**
at ESLint's defaults. Run again with raw counts, the file and function numbers come out the same. Once blank lines and comments are
skipped, the counts change. The house wants JSDoc, and about 40% of `run.ts` is JSDoc and blank lines (3,618 code lines of 6,062).

The scope is `src` and `bin` of the runtime, the orchestrator and the api, plus the web's `src`: 238 files, 2,679 functions.

| measure | p50 | p90 | p95 | p98 |
|---|---|---|---|---|
| code lines per file | 100 | 388 | 491 | 620 |
| code lines per function | 8 | 35 | 52 | 92 |
| cyclomatic complexity | 3 | 10 | 16 | 25 |
| cognitive complexity (1,206 functions above 1) | 4 | 16 | 22 | 42 |

**File density.** Among files of 150 code lines or more, raw lines per code line are 1.17 (p25), 1.38 (p50) and 1.54 (p75). So 500 code
lines is about 690 lines on screen (585 to 770).

Offenders at the thresholds chosen below:

| package | files over 500 code lines | functions over 80 lines | cyclomatic over 20 | cognitive over 15 |
|---|---|---|---|---|
| runtime | 3 | 12 | 21 | 27 |
| orchestrator | 5 | 18 | 39 | 64 |
| api | 2 | 4 | 10 | 17 |
| web | 2 | 31 | 17 | 15 |
| **total** | **12** | **65** | **87** | **123** |

The twelve files over 500 code lines:

- orchestrator: `run.ts` 3,618, `workflow.ts` 1,987, `cli.ts` 1,531, `tick.ts` 1,189, `authoring.ts` 519;
- runtime: `a2a-remote.ts` 620, `facade.ts` 578, `engine.ts` 520;
- api: `agents.ts` 549, `builder.ts` 521;
- web: `Decide.tsx` 753, and the vendored `components/ui/sidebar.tsx` 556.

The owner counted 20 files over 500. The same scope read other ways gives 32 on raw lines, 24 with only blank lines skipped, and 16
with only comments skipped. 12 is the count the rule makes as it will run, with both skipped.

**Cognitive complexity.** This count is 123 over 15 and 60 over 22. The owner measured 131 over 15, most likely over a wider tree than
`src` and `bin`. The 60 over 22 and the worst functions agree:

- `main` in the orchestrator's `cli.ts`: 726
- `advanceRun`: 197
- `forgetRefusal`: 156
- `retryRefusal`: 83
- the `decision` step of `list`: 70

84 files carry at least one offence: runtime 18, orchestrator 21, api 13, web 32. One of the web's is the vendored `sidebar.tsx`, which
has an override of its own (see "Not limited"). That leaves 83 files for the baseline, 31 of them the web's. At 500 the union is the same
as it was at 350: every file between 350 and 500 code lines also has a function over one of the three function limits.

The worst in every measure are the same few:

| function | lines | cyclomatic |
|---|---|---|
| `main` (orchestrator `cli.ts`) | 806 | 366 |
| `advanceRun` (`tick.ts`) | 463 | 136 |
| `retryRefusal` | 183 | 80 |
| `forgetRefusal` | 150 | 91 |
| `parseBrief` (runtime `cli.ts`) | 118 | 58 |

**Speed.** `sonarjs` through `jsPlugins` lints the whole tree in about 2 s, against about 1 s for today's `oxlint`.

## The limits

Every size rule skips blank lines and comments, so JSDoc is never a reason to split.

| rule | threshold | why this number |
|---|---|---|
| `max-lines` (per file) | **500** code lines | The owner's number: a ceiling against giant files, never a target. It is about 690 lines on screen at this code's density (see "File density"). 11 files on the baseline, and the vendored `sidebar.tsx` in its own override. |
| `max-lines-per-function` | **80** code lines | One screen at 140 columns; p98 is 92. At 50, 150 functions would offend, most of them web components whose JSX is one render. 65 on the baseline. |
| `complexity` (cyclomatic) | **20** | ESLint's default; p95 is 16. It counts paths, so it says how many tests a function needs. 87 on the baseline. |
| `sonarjs/cognitive-complexity` | **15** | The owner's number and Sonar's default; p90 is 16. It weighs nesting, which cyclomatic does not, so it catches the nested `if` in a loop in a `case` that makes `main` unreadable. 123 on the baseline. |

**The function rules shape the code; the file rule only stops a giant.** Lines per function (80), cyclomatic (20) and cognitive (15)
are the rules that make code readable, and they are what a card works to. A file under 500 code lines is never split for its size, and
the file limit must not push a cohesive decision apart: a decision's steps stay in one file, even a long one. Below 500, a file splits only
where the kinds part (pure, store, verb) or where a feature's own sections already break.

**Cyclomatic and cognitive both stay.** They disagree where it matters. A flat `switch` of 30 verbs is 30 cyclomatic and about 1 cognitive
(`KeyInput`, 51 cyclomatic). A 12-line triple-nested loop is low cyclomatic and high cognitive.

**Not limited:**

- **Test files** (`**/*.test.ts` and `**/test/**`). A test file is a list of cases, and its length is its coverage (p50 is 251 code lines).
  Tests beside the code are split along their feature, which keeps them near their code's size without a rule.
- **Vendored and generated files.** The shadcn components under `apps/web/src/components/ui/**` are written by the shadcn CLI and pinned
  by `skills-lock.json`. `routeTree.gen.ts` is generated. Each gets an override with the reason beside it, as `.oxlintrc.json` already asks
  of every rule turned off.

### The ratchet

**In `.oxlintrc.json`.** The four rules are on at the thresholds above for every file. After them, one override block per baselined file
sets that file's **own ceiling**: its measure today, rule by rule, and nothing higher. A rule the file does not break is left at its
threshold. For example:

```jsonc
{
  "files": ["packages/agent-orchestrator/src/tick.ts"],
  "rules": {
    "max-lines": ["error", { "max": 1189, "skipBlankLines": true, "skipComments": true }],
    "max-lines-per-function": ["error", { "max": 463, "skipBlankLines": true, "skipComments": true }],
    "complexity": ["error", { "max": 136 }],
    "sonarjs/cognitive-complexity": ["error", 197]
  }
}
```

I checked that oxlint 1.86 reads such an override: globs are relative to the config's folder, and with a ceiling one below `tick.ts`'s
measure (1,188 against its 1,189 code lines) lint fails with "Maximum allowed is 1188". At 1,189 it passes, and the 1,190th code line fails
in the same way. So **lint itself refuses a baselined file that grows**. A ceiling is safer than turning the rule off, which
would let an offender grow for free.

**A test, `limits.test.ts`.** It lives in the orchestrator's `test/`, beside `suite.test.ts`, which already reads the whole repository. It
spawns oxlint over the baselined files with the four rules at their thresholds and refuses:

- **A ceiling above the measure.** When a file or its worst function shrinks, its ceiling must come down in the same commit.
- **More offenders in a file than its record allows.** A ceiling holds only the worst function, so without this a second function could
  grow up to it unseen. The record is a map in the test: file → offenders per rule, 83 entries on the first day.
- **An override for a file the record does not know.** A new file never joins the list.
- **A record entry with no override**, and **a file with no offender left**: that entry must come off.

When a card moves a baselined file, it renames the file's entry and override in the same commit, and the counts may not grow.

The record is editable, like any test. A diff that grows it is what a reviewer looks for, and the root `CLAUDE.md` already calls weakening
a test a finding. The list only shrinks, and each restructure card below says which entries it removes.

## A feature folder

**A feature** is one thing the package does that a person or another feature asks for by name: retrying a step, forgetting a run, the
feed, the workflow format, the tick, the CLI. Its folder holds everything that thing needs and nothing another feature owns.

**Split by kind first.** A pure file, a store and a controller never share a file. In the orchestrator the kind is read from the name:

| name | kind (as `boundary.test.ts` has them today) |
|---|---|
| `<name>.store.ts` | store: the disk and git; imports pure files and stores below it |
| `<name>.verb.ts` | controller: a verb that reads, decides and writes through stores and the client |
| `index.ts` | the folder's face: pure, re-exports its folder's pure files by name, and nothing else |
| `<name>.test.ts` | a test: no kind; nothing but a test imports it |
| any other `<name>.ts` | pure |

The runtime and the api have no kinds test today and do not get one. Their files take plain names; their rules are by folder (below).

**Within a kind, split only past the limit, and only along the feature's own sections.** A feature under 500 code lines of pure code has
one pure file, named after its folder (`say/say.ts`). A larger one splits where its sections already break: the brief and its sections
(`brief/brief.ts`, `brief/brief-sections.ts`), the key readers and the tool rules (`keys/keys.ts`, `keys/tools.ts`). A file that is
already its own file today, and whose feature would pass 500 with it, stays apart (`retry/retry-ask.ts`). It never splits into a `utils.ts`, `helpers.ts`, `common.ts`, `shared.ts` or `misc.ts`, and a
test refuses those names. A helper used once moves with its caller. A decision — `retryRefusal`, `decide`, one phase of the tick — stays in
one file with its steps, even at 300 lines. When its function passes 80 lines, it becomes a short sequence of named steps **in the same
file**.

**The face.** Another feature imports a folder's pure code **through its face**:

- `index.ts` when the folder has two pure files or more;
- the one pure file when it has one (no `index.ts` then: a re-export of one file is a hop for nothing).

A store or a verb is imported by its own path, and only where the kinds allow. The face re-exports only pure files, so that a pure file that
imports a face never reaches a store through it: `boundary.test.ts` reads direct imports, and a face that re-exported a store would make
every pure file that imports it impure.

**Size of a folder.** Up to six source files, index included, with the tests beside them on top. A folder with one source file is a
feature whose test sits beside it. The layout test refuses a seventh source file: a folder that needs one holds two features.

### No import cycles

Splitting a file can turn one module into several that need each other. A `const` read before its module has run is then a
`ReferenceError` the typecheck does not see. **A test refuses any cycle of value imports among a package's files**; type-only imports are
erased and may cycle. Today's state:

- orchestrator: no value cycle (a type-only one among `retry.ts`, `run.ts` and `timeline.ts`);
- api: none;
- runtime: one value cycle, `domain.ts` ↔ `lifecycle.ts`. `domain.ts` imports `transition`, and `lifecycle.ts` imports `endOf` and
  `phaseWordOf`. It is broken first (see "The runtime").

**`run.ts` cut along today's section markers is one tangle.** A declaration-level graph of `run.ts` (value references, parsed with
TypeScript, comments and strings excluded) shows the reason. `held`, `standing` and `ownStatus` — the step's status — are read by
nearly every section, and themselves read the gate, loop, spend and landing facts of those sections.

The fix is a few moves, not a different design:

- the facts the status reads go down into `status/`;
- `assess` goes up into `tick/`;
- about 20 small shared words (`andList`, `fenced`, `oneLine`, `prunedWords`, …) go down to `record/`.

With those moves, the 21 folders `run.ts` becomes have **no cycle**. Leaf first:

`record` → `status` → `wait`, `artifacts`, `prune`, `ending` → `gate`, `round` → `retry` → `tick` (assess), `cap`, `branches`,
`workspace`, `say`, `cancel` → `list`, `forget`, `start` → `decide`, `feed` → `brief`

The same check on `workflow.ts` gives nine folders, also acyclic once the parse error, `refuse` and the frontmatter split go to the bottom:

`step` → `harness`, `closeout` → `keys` → `former` → `workflow` → `agents`, `skills`

## The orchestrator

37 files, 23,558 lines today. About 39 folders after. Four files stay at the root of `src/`: the three entries and the client.

| path | kind | what |
|---|---|---|
| `src/runner.ts` | controller, entry `agent-orchestrator` | re-exports by name, as today; its paths change |
| `src/run.ts` | pure, entry `agent-orchestrator/run` | a barrel: re-exports by name exactly today's names |
| `src/workflow.ts` | pure, entry `agent-orchestrator/workflow` | a barrel: re-exports by name exactly today's names |
| `src/runtime-client.ts` | client | unchanged: the one door to the runtime |

### Folders

Pure layering, leaf first. "code" is today's code lines moving in, from the declaration-level count.

| folder | files | from today |
|---|---|---|
| `record/` | `record.ts`, `record.store.ts`, `places.store.ts` | the record's shape (`run.ts` 1–479 without `assess`; `StepRecord`, `Landed`, `refusedCheck`, `TRIED_FROM`, `SETTLED`, task ids; the shared words): ~130 code. `store.ts` without its agent and inbox parts (~430 code: the run folder, the record, and a person's files — asks, approvals, acceptances, holds, the cancel and prune marks) → `record.store.ts`. `places.ts` → `places.store.ts`, the bottom of the store tree. |
| `status/` | `status.ts` | the step's status and the facts it reads: gate facts, loop facts, landing facts, `held`, `standing`, `ownStatus`, `stepStatus`; spend (`run.ts` 1825–2064); `radius.ts`'s usage words (`Consumed`, `sumUsage`, `dollars`, `durationWord`, `usedLines`, …): ~305 + 106 = ~410 code, one file |
| `wait/` | `wait.ts`, `wait.verb.ts` | `run.ts` 1175–1211 and 1322–1573 (waits, holds, their advice and refusals); `verbs.ts`'s `hold`, `unhold` |
| `artifacts/` | `artifacts.ts`, `artifacts.store.ts` | `run.ts` 4187–4344; `artifacts.ts` |
| `prune/` | `prune.ts`, `prune.verb.ts` | `run.ts` 3922–4132; `forget.ts`'s `prune` |
| `ending/` | `ending.ts`, `ending.verb.ts` | `run.ts` 803–1175 (landing, one checkout, `toDecide`, `gateRefusal`) without the facts that went to `status/`; `tick.ts`'s `landEnding`, `checkoutHold`, `mainClaim` |
| `gate/` | `gate.ts`, `gate.verb.ts` | `run.ts` 479–803's refusals (`approvalRefusal`, `approvalWordsRefusal`, `holdsOpen`); `verbs.ts`'s `approve` |
| `round/` | `round.ts`, `round.verb.ts` | `run.ts` 2817–3347 without the loop facts (`roundsDue`, `roundAsk`, `acceptAsk`, notes, `roundLines`: ~310); `verbs.ts`'s `round`, `accept` |
| `retry/` | `retry.ts`, `retry-ask.ts`, `retry.verb.ts`, `index.ts` | `run.ts` 2064–2761 (`retryable`, `retriesDue`, `retryRefusal` and their words `tryNote`, `retryLines`, `deniedOffer`, `answerLines`: ~470 code) → `retry.ts`; today's `retry.ts` (85) → `retry-ask.ts`, since together they pass 500; `verbs.ts`'s `retry` |
| `tick/` | `assess.ts`, `tick.verb.ts`, `advance.verb.ts`, `file.verb.ts` | `run.ts`'s `assess`; `tick.ts` (see below) |
| `cap/` | `cap.ts` | `run.ts` 1211–1320, `heldCheckouts`, `inFlight` (84 code); `admission.ts` (58) |
| `branches/` | `branches.ts`, `branches.store.ts` | `run.ts` 1574–1670 (result tips, 31 code) and `radius.ts` without the usage words (~220) → `branches.ts`; `branches.ts` and `tick.ts`'s `resultTips` (it reads refs from git and takes no engine: a store, beside `refsOf`) → `branches.store.ts` |
| `workspace/` | `workspace.ts`, `worktree.store.ts` | `run.ts` 5979–end plus `handOffDue`, `downstreamOf` (63 code) and `deps.ts` (140) → `workspace.ts`; `worktree.ts` whole (352) → `worktree.store.ts` |
| `say/` | `say.ts`, `say.verb.ts` | `run.ts` 2761–2817; `verbs.ts`'s `say`, `strayAsk` |
| `cancel/` | `cancel.ts`, `cancel.verb.ts` | `run.ts` 3347–3442 (`cancelPlan`); `verbs.ts`'s `cancel` |
| `list/` | `list.ts`, `list.verb.ts` | `run.ts` 4572–4980 (`wf ls`'s words); `decide.ts`'s `list` |
| `forget/` | `forget.ts`, `forget.verb.ts` | `run.ts` 3442–3922 (~335); `forget.ts`'s `forget` |
| `start/` | `inputs.ts`, `start.verb.ts` | `run.ts` 4132–4187 (files a person gave); `start.ts`'s `start`, `placesOf` |
| `decide/` | `decide.ts`, `decide.verb.ts` | `run.ts` 4344–4572 (`decision`); `decide.ts`'s `decide` |
| `feed/` | `feed.ts`, `feed.store.ts` | `run.ts` 4980–5114 (52 code) and `feed.ts` (40) → `feed.ts`; `feed-store.ts` → `feed.store.ts` |
| `brief/` | `brief.ts`, `brief-sections.ts`, `index.ts` | `run.ts` 5114–5979 (~614 code): `composeBrief`, `remoteBrief`, the from-run sections → `brief.ts`; the retry, said, round, loop, replies, approved and accepted sections and `gateLines` → `brief-sections.ts` |
| `timeline/` | `timeline.ts` | `timeline.ts` |
| `check/` | `check.ts` | `check.ts` (its one path, `checkStderr`, stays in `record.store.ts` with the run folder's layout) |
| `closeout/` | `closeout.ts` | `closeout.ts`; `workflow.ts` 2046–2115 (output schema looseness) |
| `step/` | `step.ts` | `workflow.ts` 1–370 (the step's shape and key meanings); `WorkflowError`, `refuse`, `splitFrontmatter`, `isObject`, `isReadme`, `AGENTS_FOLDER`, `SKILLS_FOLDER` |
| `harness/` | `harness.ts`, `a2a.store.ts` | `workflow.ts` 376–530 (harness names, remote refusals); `a2a-agents.ts` |
| `keys/` | `keys.ts`, `tools.ts`, `index.ts` | `workflow.ts` 1015–1130, 1252–1537, 1636–1749 (readers of each key; `keepsAuto`, `composedRefusal`) → `keys.ts`; 1130–1252 and 1537–1636 (tool rules, `toolsOf`) → `tools.ts` |
| `former/` | `former.ts` | `workflow.ts` 897–1015, 2658–2721, 2926–3040 (former names, in text and on records) |
| `workflow/` | `step-file.ts`, `validate.ts`, `index.ts` | `workflow.ts` 531–897 (parse and render of one step file) → `step-file.ts`; 2737–3160 (validation, order, loops, graph) → `validate.ts` |
| `folder/` | `folder.ts`, `folder.store.ts` | `workflow.ts` 2115–2203 and 2721–2737 (a folder of markdown is a workflow); `workflow-store.ts`'s roots and loading; `authoring.ts`'s `writeWorkflow` |
| `agents/` | `agents.ts`, `agents.store.ts` | `workflow.ts` 2203–2658 (253 code) and `rendering.ts` (78) → `agents.ts`; `workflow-store.ts`'s `agentsFor`, `loadAgents`, `agentUsers`, `agentVersion`, `store.ts`'s `agentFilesDir`, `writeAgentFiles`, `skillsAgain` and `authoring.ts`'s agent half (~415 code together) → `agents.store.ts` |
| `skills/` | `skills.ts`, `skills.store.ts` | `workflow.ts` 1749–2046; `workflow-store.ts`'s skill reads; `authoring.ts`'s `copySkill`, `writeSkill` |
| `inbox/` | `inbox.ts`, `inbox.store.ts`, `inbox.verb.ts` | `inbox.ts` (319 code, kept whole); `inbox-store.ts`, `inboxDir`; `start.ts`'s `startFromInbox`, `startQueued` (they start a run through `start/start.verb.ts`) |
| `plan/` | `plan.ts`, `plan.store.ts`, `plan.verb.ts` | `plan.ts`; `start.ts`'s `readPlan` (a folder read, no engine) → `plan.store.ts`; `startPlan` (it starts each card through `start/start.verb.ts`) → `plan.verb.ts` |
| `daemon/` | `daemon.ts`, `daemon.store.ts` | `daemon.ts`; `daemon-store.ts` |
| `meter/` | `meter.ts`, `tally.store.ts`, `meter.verb.ts` | `meter.ts`; `tally.ts`; `tick.ts` 1568–1671 (what the pass cost) |
| `rest/` | `rest.ts` | `rest.ts` (the runs-at-rest memo goes with the tick, below) |
| `views/` | `views-words.ts`, `views.verb.ts` | `views.ts`: its words (`phaseOfView`, `waitsForWord`, `endWords`, `engineWord`, `wordOfView`) and its engine reads |
| `cli/` | `main.ts`, `flags.ts`, `start.ts`, `runs.ts`, `decide.ts`, `asks.ts` | `cli.ts` (see below); `bin/wf.ts` imports `../src/cli/main.ts` |

Every file of today, where it goes:

| today | goes to |
|---|---|
| `a2a-agents.ts` | `harness/a2a.store.ts` |
| `admission.ts` | `cap/cap.ts` |
| `artifacts.ts` | `artifacts/artifacts.store.ts` |
| `authoring.ts` | `folder/folder.store.ts`, `agents/agents.store.ts`, `skills/skills.store.ts` |
| `branches.ts` | `branches/branches.store.ts` |
| `check.ts` | `check/check.ts` |
| `cli.ts` | `cli/` |
| `closeout.ts` | `closeout/closeout.ts` |
| `daemon.ts` | `daemon/daemon.ts` |
| `daemon-store.ts` | `daemon/daemon.store.ts` |
| `decide.ts` | `list/list.verb.ts`, `decide/decide.verb.ts` |
| `deps.ts` | `workspace/workspace.ts` |
| `feed.ts` | `feed/feed.ts` |
| `feed-store.ts` | `feed/feed.store.ts` |
| `forget.ts` | `forget/forget.verb.ts`, `prune/prune.verb.ts` |
| `inbox.ts` | `inbox/inbox.ts` |
| `inbox-store.ts` | `inbox/inbox.store.ts` |
| `meter.ts` | `meter/meter.ts` |
| `places.ts` | `record/places.store.ts` |
| `plan.ts` | `plan/plan.ts` |
| `radius.ts` | `branches/branches.ts`, `status/status.ts` (the usage words) |
| `rendering.ts` | `agents/agents.ts` |
| `rest.ts` | `rest/rest.ts` |
| `retry.ts` | `retry/retry-ask.ts` |
| `run.ts` | the folders above; `src/run.ts` stays as the barrel |
| `runner.ts` | stays |
| `runtime-client.ts` | stays |
| `start.ts` | `start/start.verb.ts`, `plan/plan.store.ts`, `plan/plan.verb.ts`, `inbox/inbox.verb.ts` |
| `store.ts` | `record/record.store.ts`, `agents/agents.store.ts`, `inbox/inbox.store.ts` |
| `tally.ts` | `meter/tally.store.ts` |
| `tick.ts` | `tick/`, `ending/ending.verb.ts`, `branches/branches.store.ts`, `meter/meter.verb.ts` |
| `timeline.ts` | `timeline/timeline.ts` |
| `verbs.ts` | `cancel/`, `retry/`, `gate/`, `say/`, `round/`, `wait/` — one `.verb.ts` each |
| `views.ts` | `views/` |
| `workflow.ts` | the folders above; `src/workflow.ts` stays as the barrel |
| `workflow-store.ts` | `folder/folder.store.ts`, `agents/agents.store.ts`, `skills/skills.store.ts` |
| `worktree.ts` | `workspace/worktree.store.ts` |

### `run.ts`, section by section

| lines | section | goes to |
|---|---|---|
| 1–479 | the record: `TaskPhase` … `RunBase`, `Hold`, `Pruned`, `Approval`, `Acceptance`, `StepStatus`, `satisfiesAfter`, `stopsFollowers`, `stoppedOnWord` | `record/record.ts`. `assess` → `tick/assess.ts` |
| 479–803 | a gate | facts (`hasGate`, `gatesOf`, `approvalOf`, `acceptanceOf`, `askedAgain`, `atGate`, `approvedFirst`, `waitsAtGate`, `notHandedOn`, `unheld`, `endingStopped`, `sentBack`, `sendBackTo`, `gateWords`, spent approvals and acceptances) → `status/status.ts`. `approvalRefusal`, `approvalWordsRefusal`, `holdsOpen` → `gate/gate.ts` |
| 803–961 | an ending that lands on its check | `landsOnCheck` → `status/status.ts`; the rest → `ending/ending.ts` |
| 961–1175 | one checkout, one ending step | `heldByCheckout`, `resultOnBase` → `status/status.ts`; `heldCheckouts` → `cap/cap.ts`; `firstLine` → `record/record.ts`; the rest (`toDecide`, `merges`, `gateRefusal`, …) → `ending/ending.ts` |
| 1175–1211 | waiting on a run | `wait/wait.ts` |
| 1211–1320 | a cap on runs in flight | `cap/cap.ts` |
| 1322–1573 | (same marker) waits and holds | `wait/wait.ts` |
| 1574–1670 | (same marker) result tips | `branches/branches.ts` |
| 1670–1825 | (same marker) step status | `status/status.ts`; `TRIED_FROM`, `SETTLED` → `record/record.ts` |
| 1825–2064 | what a step may spend | `status/status.ts`; `checkTaskId`, `stepTaskId`, `namesInOrder` → `record/record.ts`; `handOffDue`, `downstreamOf` → `workspace/workspace.ts` |
| 2064–2761 | trying again | `StepRecord`, `Landed`, `refusedCheck` → `record/record.ts`; the rest → `retry/retry.ts` |
| 2761–2817 | saying something | `say/say.ts` |
| 2817–3347 | going round again | the loop facts (`capOf`, `roundOf`, `roundIn`, `loopOf`, `owedFields`, `owesReplies`, `askingTry`, `roundSpans`, `roundWord`) → `status/status.ts`; the rest → `round/round.ts` |
| 3347–3442 | calling one off | `inFlight` → `cap/cap.ts`; `cancelPlan` → `cancel/cancel.ts` |
| 3442–3922 | forgetting | `forget/forget.ts`; `andList` → `record/record.ts` |
| 3922–4132 | pruning | `prune/prune.ts`; `prunedWords`, `filesPrunedWords` → `record/record.ts` |
| 4132–4187 | files a person gave | `start/inputs.ts` |
| 4187–4344 | files for the steps after | `artifacts/artifacts.ts` |
| 4344–4572 | handing it back | `decide/decide.ts` |
| 4572–4980 | what `wf ls` says | `list/list.ts`; `oneLine`, `DENIED_SHOWN`, `DENIED_CAP` → `record/record.ts` |
| 4980–5114 | what the feed says | `feed/feed.ts` |
| 5114–5979 | (same marker) the brief | `brief/brief.ts`, `brief/brief-sections.ts`; `fenced`, `dataBlock` → `record/record.ts` |
| 5979–6062 | where a step works | `workspace/workspace.ts` |

Each placement is checked by the declaration graph above; the card that makes the move runs the cycle test, which has the last word.

### `workflow.ts`, section by section

`workflow.ts` has no section markers; these are its sections by content.

| lines | section | goes to |
|---|---|---|
| 1–370 | the step's shape: `Workflow`, `StepAgent`, `STEP_KEYS`, `STEP_KEY_MEANINGS`, `CLOSEOUT_FIELDS` | `step/step.ts` |
| 376–530 | harness vocabulary, remote refusals | `harness/harness.ts` |
| 531–766 | parse: `WorkflowError`, `refuse`, `splitFrontmatter` (→ `step/step.ts`), `parseWorkflow`, `stepFrom`, `agentOf`, `autoRefusal` | `workflow/step-file.ts` |
| 765–897 | render, loops: `renderStep`, `writtenValue`, `loopOf`, `roundsOf`, `unknownKey` | `workflow/step-file.ts` |
| 897–1015 | former names | `former/former.ts` |
| 1015–1130, 1252–1537, 1636–1749 | key readers (`harnessOf`, `wordOf`, `contextOf`, `budgetOf`, `workspaceOf`, `denialsOf`, `slotOf`, `outputOf`, …) | `keys/keys.ts`; `isObject` → `step/step.ts` |
| 1130–1252, 1537–1636 | tool rules | `keys/tools.ts` |
| 1749–2046 | skills on an agent | `skills/skills.ts` |
| 2046–2115 | output schema looseness | `closeout/closeout.ts` |
| 2115–2203, 2721–2737 | the folder, `readmeDescription` | `folder/folder.ts` |
| 2203–2658 | agents: keys, parse, render, card | `agents/agents.ts`; `keepsAuto`, `DEFAULT_PERMISSION_MODE`, `composedRefusal` → `keys/keys.ts` |
| 2658–2721 | former keys in text | `former/former.ts` |
| 2737–2926 | validation | `workflow/validate.ts` |
| 2926–3040 | order, former names on records | `orderSteps` → `workflow/validate.ts`; `asNamed` → `former/former.ts` |
| 3040–3160 | graph: `upstreamOf`, `validateLoops`, `fansOut`, `terminalSteps` | `workflow/validate.ts` |

### `cli.ts`, section by section

`main` (849–1852, 806 lines, cognitive 726) becomes **a table from a verb to its handler** in `cli/main.ts`. Each handler lives in the file of
its family, with its flag parser and its paragraph of help. `main.ts` composes `HELP` from those paragraphs, so a verb's help sits beside
the verb.

The imports run one way: `main.ts` → the families → `flags.ts`. The flag reader every family calls (`readFlags`) sits in `flags.ts`, below
the families, and never in `main.ts`, which imports them: that would be a value cycle, refused by the `cycles` rule and the cycle test. The
daemon's own verbs (`tick`, `up`, `feed`, `watch`, about 190 lines with their parsers) stay in `main.ts` beside the table, rather than in a
seventh file: `main.ts` is then about 290 code lines, and the folder keeps to six.

| lines | section | goes to |
|---|---|---|
| 1–144 | imports | each file's own; `cli/` still reaches only `src/runner.ts` and `src/workflow.ts` |
| 144–311 | `HELP`, `usage`, `exitCodeOf`, `PLAN_HELP`, `INBOX_HELP`, `DECIDE_HELP` | `exitCodeOf`, the composed `HELP` → `main.ts`; `usage` → `flags.ts` (a family throws it); each `*_HELP` beside its verb |
| 311–849 | flag parsers: `readFlags`, `FlagRules`, `confirmed`, `amountOf` | `flags.ts` |
| | `startHow`, `START_TAKES`, `planHow`, `inboxQueueHow`, `inboxAddHow` | `start.ts` |
| | `rmHow`, `pruneHow`, `holdHow`, `agentsHow` | `runs.ts` |
| | `decideHow` | `decide.ts` |
| | `retryHow`, `RETRY_FLAGS`, `approveHow`, `roundHow`, `acceptHow` | `asks.ts` |
| | `feedCursor`, `watchPrinted` | `main.ts` |
| 853–1039 | cases `start`, `plan`, `inbox` | `start.ts` |
| 1040–1198 | cases `tick`, `up`, `feed`, `watch` | `main.ts` |
| 1199–1387, 1784–1852 | cases `ls`, `cancel`, `rm`, `prune`, `hold`, `show`, `logs`, `agents` | `runs.ts` |
| 1388–1703 | case `decide` (about 316 lines) | `decide.ts`, as named steps under 80 lines each |
| 1704–1783 | cases `retry`, `approve`, `round`, `accept`, `say` | `asks.ts` |

`cli.ts` holds `//` comments against the house rule; they become JSDoc or go as the code moves.

### `tick.ts`, section by section

`advanceRun` (428–1090, 463 lines, cognitive 197) is one pass over one run: read, decide, act. It becomes a short sequence of named
phases in `advance.verb.ts`, so the order of a pass reads in one place. The four filing phases are each a decision of their own ("file a
retry?", "file this step?"), and together they are `file.verb.ts` (~380 code), each with its steps whole. What is left of the tick
(~200 code: the pass over live runs and runs at rest, the slots) is `tick.verb.ts`. `tick.ts` is 1,189 code lines today, so the tick
passes 500 in any one file; it splits along these three sections and no further.

| lines | what | goes to |
|---|---|---|
| top | `underBudget` | `tick/advance.verb.ts` |
| 162–301 | `adoptChecks`, `adoptTries`, `adoptRounds`, `unrecordedSteps` (the read phase) | `tick/advance.verb.ts` |
| 301–428 | `Advanced`, `advance`; `checkoutHold`, `mainClaim` | `advance` → `tick/advance.verb.ts`; `checkoutHold`, `mainClaim` → `ending/ending.verb.ts` |
| 433–594 | `advanceRun`: read, cancelled, hand-off and artifacts, landing, checkout hold, hold lift, `assess`, waiting tasks closed, parents and admission, feed words | `tick/advance.verb.ts`, one named phase each |
| 595–867 | retries filed, rounds filed | `tick/file.verb.ts` |
| 868–1017 | checks filed, ready roots filed with their parents' closeouts | `tick/file.verb.ts` |
| 1018–1090 | slot held first, tips, record written, rest facts | `tick/advance.verb.ts` |
| 1090–1300 | `handOffOwed`, `closeHeld`, `closeWaitingTasks`, `answerHeld` | `tick/advance.verb.ts` |
| | `resultTips` | `branches/branches.store.ts` |
| | `landEnding` | `ending/ending.verb.ts` |
| | `localFields`, `toldOf`, `parentCloseouts` | `tick/file.verb.ts` |
| 1300–1430 | `Pass`, `refusalLines`, `tick`, `pass`; `runSlots` (1671) | `tick/tick.verb.ts` |
| 1430–1568 | runs at rest: `RestMemo`, `restingPass`, `advanceResting` | `tick/tick.verb.ts` |
| 1568–1671 | what the pass cost: `ENGINE_PHASES`, `ioOf`, `engineCall`, `meteredEngine`, `costOf` | `meter/meter.verb.ts` |

### The kinds, by path

`boundary.test.ts` keeps its four kinds and every refusal it makes. What changes is how it finds a file's kind, and two rules that name
single files today (`CLI_REACHES`, and every controller importing the client) read the new tree as below.

- **It walks `src` and `bin` recursively.** Today `packageSources()` reads each folder flat, so a file in a folder would go unseen and
  every rule would pass for nothing.
- **The kind comes from the name** (the table above). Exceptions are named exactly:
  - `src/runner.ts`: controller;
  - `src/run.ts`, `src/workflow.ts`: pure;
  - `src/runtime-client.ts`: client;
  - `src/cli/*.ts`: controller, the door, reaching only `src/runner.ts`, `src/workflow.ts` and each other (`CLI_REACHES`: the two
    files and the folder `src/cli/`). A plant of `src/cli/start.ts` importing `src/record/record.store.ts` is refused, as `src/cli.ts`
    importing `src/store.ts` is today;
  - `bin/wf.ts`: reaching only `src/cli/main.ts` (`BIN_REACHES`); a plant importing `src/cli/flags.ts` is refused.

  Any other file at the root of `src`, or any `.ts` it cannot place, is of no kind and fails `unsorted` as today.
- **`STORE_BOTTOM` becomes** `record/places.store.ts`, `folder/folder.store.ts`, `meter/tally.store.ts`. **`STORE_SHARED`:**
  `record/record.store.ts` may import only the bottom; `workspace/worktree.store.ts` only the record's store, the places and the tally.
- **A controller reaches the client through controllers.** Today `clientBreaks` refuses any controller beneath the CLI that does not
  import `runtime-client.ts` itself. Every `*.verb.ts` in the map above does, because each takes an `Engine`, whose type comes from the
  client, with two exceptions that start a run by calling `start`: `plan/plan.verb.ts` and `inbox/inbox.verb.ts`, both importing
  `start/start.verb.ts`. Two files that would have had nothing of the runtime are not verbs: `resultTips` is a store
  (`branches.store.ts`) and `readPlan` is a store (`plan.store.ts`). The rule becomes: **every controller beneath the CLI imports the
  client, or imports a controller that reaches it**, followed through controller imports. What it refuses is unchanged:
  - a file other than the client importing `agent-runtime`;
  - `CLIENT` naming a file that imports no `agent-runtime`;
  - a file named as a verb that reaches no runtime at all. Under kinds by name this is the refusal that matters, since it stops a disk file
    named `x.verb.ts` to escape the store tree. Its plant is `plan/plan.verb.ts` with its import of `start/start.verb.ts` taken out, which
    must be refused.

  The alternative that keeps the rule word for word puts the plan's and the inbox's starters in `start/` with `start`, or gives each
  verb an import of the client it does not use. The first takes a verb out of the feature a person asks for by name (`wf plan`,
  `wf inbox`); the second is an import that says something false. The owner approved the rule read through imports on 2026-09-28.
- **Each rule's REFUSED plant is rewritten at a new path** and still makes its rule refuse. The test's own checks on its plants stay.
- **Two rules join it:**
  - a pure file outside a folder imports that folder's pure code only through its face;
  - no file but a test imports a `*.test.ts` or anything under `test/`.

## The runtime

29 files, 10,252 lines. The natural lines hold: the core, each harness's driver, the A2A seam, and the doors. The two entries stay at the
root.

| path | from today |
|---|---|
| `src/facade.ts` | stays, entry `agent-runtime`: a barrel of today's names, and its "vocabulary" section (932–951) |
| `src/index.ts` | stays, entry `agent-runtime/effect`; its paths change |
| `core/session.ts` | `domain.ts` 47–130: `SESSION_STATES`, `isLive`, `endOf`, `phaseWordOf`, `formerStateOf`, `Outcome`. **This breaks the `domain` ↔ `lifecycle` cycle**: both import `session.ts`, and `lifecycle.ts` no longer imports `domain.ts`. |
| `core/domain.ts` | the rest of `domain.ts`, and `nameParts` from `a2a-map.ts` (the inverse of `nameFor`, which is here: it reads a session name, and the Claude driver and the A2A map both use it): sightings, the journal's events and `fold`, a task held open, the decision (`decide`, `observe`, `lifecycleOf`). It stays **the whole judgement** in one file, as the root `CLAUDE.md` says (~330 code lines). The states move out to break the cycle, not for size. |
| `core/lifecycle.ts` | `lifecycle.ts` |
| `core/index.ts` | the core's face |
| `core/engine/filing.ts` | `engine.ts` 83–342: filing, admitting, answering, closing, and their refusals |
| `core/engine/engine.ts` | `engine.ts` 1–83 and 373–861: step, settle, tick, view |
| `core/engine/journal.ts` | `journal.ts` |
| `core/engine/memo.ts` | `tick-memo.ts` |
| `core/engine/tally.ts` | `io-tally.ts` |
| `core/engine/index.ts` | the engine's face |
| `harness/seam.ts` | `runner.ts` 1–225 (`RunnerError`, `SpawnRequest`, `Transcript`, `Observation`, `RunnerOps`, the `Runner` service), `testOps`, `sh`; `runner-composite.ts` (several harnesses, one seam) |
| `harness/args.ts` | `harness-args.ts` |
| `harness/mcp.ts` | `runner-mcp.ts` (read by the detached runner and Codex, not only Claude) |
| `harness/transcript.ts` | `runner-transcript.ts` |
| `harness/sdk.ts` | `runner-sdk.ts` |
| `harness/index.ts` | the seam's face |
| `harness/claude/bg.ts` | `runner.ts` 226–770 (`claudeOps`: `claude --bg`) |
| `harness/claude/code.ts` | `runner-claude-code.ts` and `runner-claude-detached.ts` (the `-p` spec it composes) |
| `harness/claude/inbox.ts` | `runner-claude-inbox.ts` |
| `harness/claude/transcript.ts` | `runner-claude-transcript.ts` (372 code, under the file limit; on the baseline for its functions: two over 80 lines, cognitive up to 70) |
| `harness/claude/vocabulary.ts` | `runner-claude-vocabulary.ts` |
| `harness/claude/index.ts` | the face |
| `harness/codex/codex.ts`, `harness/codex/transcript.ts` | `runner-codex.ts`, `runner-codex-transcript.ts` |
| `harness/detached/detached.ts`, `harness/detached/output.ts` | `runner-detached.ts`, `runner-detached-output.ts` |
| `a2a/client.ts`, `a2a/handler.ts`, `a2a/map.ts`, `a2a/remote.ts`, `a2a/index.ts` | `a2a-client.ts`, `a2a-handler.ts`, `a2a-map.ts`, `a2a-remote.ts` (620 code: baseline; its split card cuts the card and config refusals, 77–343, from `remoteOps`) |
| `facade/consumer.ts` | `facade.ts` 63–512: what a consumer implements, the adapters and what the door refuses |
| `facade/engine.ts` | `facade.ts` 512–932: `createEngine` (330-line function: on the baseline, split into named steps in the same file). `facade.ts` is 578 code lines, so it splits once, between what a consumer writes and the engine it gets. |
| `facade/promise.ts` | `runner-promise.ts`: a harness a consumer writes in Promises is a door concern |
| `cli/main.ts` | `cli.ts` whole (425 code, under the file limit): `BRIEF_KEYS`, `parseBrief`, `main` and its line formatters. `parseBrief` (118 lines) and `main` become named steps in the same file. `bin/ae.ts` imports it. |

`facade/` has no `index.ts`: `src/facade.ts` is its face.

**Rules by path**, in a new `test/layout.test.ts`. Each gets a plant that makes it refuse:

- `core/**` imports from `harness/` only `seam.ts`, `args.ts` and `index.ts`, and nothing from `a2a/`, `facade/` or `cli/`;
- `harness/**` imports nothing from `a2a/`, `facade/` or `cli/`;
- `cli/**` imports only `src/facade.ts` and other files of `cli/`, as `cli.ts` imports only `facade.ts` today.

They hold on today's imports, mapped to the new paths, but for one edge: `runner-claude-code.ts` imports `nameParts` from `a2a-map.ts`,
which would be `harness/claude/code.ts` → `a2a/map.ts`. `nameParts` moves to `core/domain.ts` beside `nameFor` in the card that makes the
core, before the harness moves, and both callers import it from the core's face.

## The api

30 files, 8,567 lines. The api has no kinds. It is routes over readers, so its folders are the pages and the verbs a person uses. `main.ts`,
`app.ts`, `port.ts`, `guard.ts` and `store.ts` stay at the root: the process, the mount, the guard every route passes, and the shared store.

| folder | files | from today |
|---|---|---|
| `runs/` | `runs.ts`, `judged.ts`, `resting.ts`, `graph.ts`, `index.ts` | the runs list and its memo |
| `detail/` | `detail.ts`, `tries.ts`, `usage.ts`, `index.ts` | one run's page (`detail.ts` 470 code, under the file limit; on the baseline for one function's length and complexity) |
| `steps/` | `steps.ts`, `logs.ts`, `artifacts.ts`, `index.ts` | a step's transcript, logs, files |
| `decide/` | `decision.ts`, `merge.ts`, `index.ts` | what is on a person to decide |
| `asks/` | `asks.ts` | retry, approve, round, accept, say |
| `inbox/` | `inbox.ts` | the inbox and its queue |
| `factory/` | `ceilings.ts`, `daemon.ts`, `feed.ts`, `quota.ts`, `index.ts` | the floor's gauges |
| `capabilities/` | `capabilities.ts`, `reach.ts`, `index.ts` | mounted together at `/api/capabilities` |
| `workflows/` | `workflows.ts`, `builder.ts`, `index.ts` | `builder.ts` (521 code) is over the file limit; `workflows.ts` (442) is on the baseline for its functions' complexity only |
| `agents/` | `agents.ts`, `skills.ts`, `try.ts`, `index.ts` | agents, skills, trying an agent. `agents.ts` (549 code) is over the file limit; `skills.ts` (462) is on the baseline for one function's cognitive complexity only |

`app.ts` mounts each folder's routes through its face. `capabilities.ts` builds `HOME_REPO` from its own place
(`path.resolve(import.meta.dirname, '..', '..', '..')`); one folder deeper, it needs one more `..`, and `skills.ts`'s `SHIPPED_SKILLS` reads
it. A test pins `HOME_REPO` to the folder holding the root `package.json`, so a missed `..` fails there and not in a person's browser.

## The web app: limits, no restructure

The web is already foldered, and by its stack's rules rather than by habit:

- `routes/` is TanStack Router's file-based routing: one file per page, and a page *is* the web's feature;
- `components/ui/` is written by the shadcn CLI through `components.json`'s aliases;
- `lib/` is the pure logic the components render, paired with them by name (`lib/decide.ts` with `components/Decide.tsx`).

Moving to feature folders would fight the router's generator and the shadcn CLI, and buy no boundary: the web has no store or verb kinds
to keep apart.

What it needs is the limits. 31 of its files are on the baseline (the vendored `sidebar.tsx` has its own override), most for long components (`Decide.tsx` 753 code lines, `Floor` 315
lines in one function). A component is cut into its sub-components. Where a page's parts outgrow `components/`, they go into a folder
named for the page (`components/decide/`). That work is ordinary, card by card, under the same ratchet. The web's tests stay in `test/`,
where its `tsconfig` and the e2e under their own config expect them.

## The boundaries by path

| rule (`docs/architecture.md`) | test | how it reads the new tree |
|---|---|---|
| Between packages, only the public contract | runtime and orchestrator `contract.test.ts` | Already recursive (`git ls-files -co`). They pin the exports map, which does not change. Nothing to do but prove it still refuses a deep import, with a plant at a new path. |
| | runtime `xstate-boundary.test.ts` | `LIFECYCLE` becomes `src/core/lifecycle.ts`. Its walk is already recursive. Its `import('../src/lifecycle.ts')` and `'../src/domain.ts'` move to the core's paths. |
| | runtime `a2a-boundary.test.ts` | "Only `src/a2a-*.ts` imports `@a2a-js/sdk`" becomes "only `src/a2a/*.ts`", with a recursive walk (flat today) that skips `*.test.ts`. The asserted list becomes the four files under `a2a/`. |
| Inside the orchestrator, every file is pure, store, controller or the client | `boundary.test.ts` | Recursive, kinds by name, bottom and shared stores re-keyed, the face and test-import rules added (above). |
| The runtime is reached through one client | `boundary.test.ts` (`clientBreaks`) | Unchanged: `src/runtime-client.ts` stays where it is. |
| No value-import cycle | new, in each package's `layout.test.ts` | Tarjan over every file's relative value imports; refuses a strongly connected set of two files or more. |
| Layout: folder size, face imports, no `utils`, no test imported by source | new `layout.test.ts` (orchestrator, beside `suite.test.ts`, over the three packages) | Recursive over `src`. Each rule with a plant that makes it refuse. |

Other tests that read the tree flat, and would pass for nothing once files move into folders, become recursive in the first card:

- the runtime's `readme.test.ts`, in two places:
  - `filesIn` (every source file named in the README) walks recursively and skips `*.test.ts`, or every test beside the code would have
    to be named in the README;
  - `missingFiles` matches a README path with `(?:src|bin|test|docs)\/[\w.-]+\.(?:ts|md)`, which cannot cross a `/`: a README naming a
    gone `src/core/x.ts` would pass unseen. The pattern takes nested paths (`(?:src|bin|test|docs)(?:\/[\w.-]+)+\.(?:ts|md)`), and its
    plant, a README naming a missing `src/core/gone.ts`, is refused;
- the api's `harness.test.ts`.

Tests that read source text by path follow their file, each slice ending on a name that must exist:

- `core-reads.test.ts` (`CORE`);
- `engine.test.ts` (the text of `domain.ts` and `lifecycle.ts`);
- `deps.test.ts` (`src/deps.ts`).

## The public faces do not move

The five entries resolve as today: `agent-runtime` → `src/facade.ts`, `agent-runtime/effect` → `src/index.ts`, `agent-orchestrator` →
`src/runner.ts`, `agent-orchestrator/run` → `src/run.ts`, `agent-orchestrator/workflow` → `src/workflow.ts`. Where an entry's content
moves into folders, the entry becomes a barrel that re-exports **by name**, exactly today's names, and no `export *`. No import outside a
package changes: not the api's, not the web's, not a test's.

Before the first move, one test per package pins **the runtime names each entry exports**, read with `Object.keys(await import(entry))`.
A barrel that drops a name then fails there, not in the api. Types are held by the api's typecheck, which reads the orchestrator's
subpaths, and by each package's own test typecheck.

No package export includes a test file: the exports map names five source files and `./package.json`, and the layout test refuses a
non-test file that imports a `*.test.ts`.

## Tests beside the code

**How `npm test` finds them.** Each package's `test` script becomes:

```
node --test 'test/*.test.ts' 'src/**/*.test.ts'
```

The quotes matter: Node expands the glob itself and finds nested files. A glob with no match is not an error, so a package can adopt the
layout folder by folder. I checked this in a scratch tree: nested tests found, an empty `src` passes. Turbo's `test` task already
takes its inputs from the package, so nothing changes in `turbo.json`.

**The typecheck.** Each `tsconfig.json` already includes `src`, so `src/**/*.test.ts` is typechecked. `suite.test.ts`, which refuses a test
file no typecheck reads, extends its walk from `test/` to `src/**/*.test.ts`.

**What moves beside the code, what stays in `test/`:**

- **A test about one feature moves into that folder**, even when it reaches the feature through the package's door. `run.test.ts`
  (9,023 lines) and `workflow.test.ts` (2,819) split with their files: each card moves the cases of the section it moves. `radius`, `meter`,
  `plan`, `inbox`, `daemon`, `rest`, `admission`, `deps` and the runtime's `lifecycle`, `decide`, `journal` and `remote-map` move whole.
- **A test across features stays in `test/`:** the orchestrator's `store.test.ts` (it drives the CLI's `main` 27 times), `ship.test.ts`;
  the runtime's `detached.test.ts`, `live.test.ts`; the api's `app.test.ts` and the other tests that drive `app` over HTTP through several
  pages.
- **The package-wide tests stay in `test/`:** `boundary`, `contract`, `suite`, `limits`, `layout`, `readme`, `scratch`, `source`,
  `harness`, `xstate-boundary`, `a2a-boundary`, `core-reads`, the entry pins.

**`scratch()`** stays in each package's `test/scratch.ts`, the one helper for temporary folders. A test beside its code imports it by a
relative path (`../../test/scratch.ts` from `src/retry/`). Each package's `scratch.test.ts` walks `test/` recursively today; it extends to
`src/**/*.test.ts`, so a test beside the code cannot call `os.tmpdir(` either. The runtime's `test/scratch.ts` stays the copy the others are
held to.

**The api's harness becomes machinery.** Today every api test must import `test/harness.ts` first, and `harness.test.ts` reads each file's
first import to hold it. That is a rule about text, which a test beside the code in `src/` would have to follow too. The api's script
instead loads it before any test:

```
node --import ./test/harness.ts --test 'test/*.test.ts' 'src/**/*.test.ts'
```

I checked that `--import` reaches every test process `node --test` spawns: a value it sets is seen in the test. A test that needs the
harness's exports (`registry`, `observations`, …) still imports it, and gets the same module instance. `harness.test.ts` then refuses a
`test` script without the `--import`, in place of reading first lines.

**Other test support stays in `test/`**, imported by relative path:

- the orchestrator's `a2a-server.ts`, `git-runs-pin.ts`, `repo-files.ts`, `told.ts`;
- the runtime's `lifecycle-corpus.ts`, `remote-server.ts`;
- every `fixtures/`.

**Lint.** The override that relaxes two rules for `**/test/**` gains `**/*.test.ts`, and the size rules are off for both (see "Not
limited").

## How each restructure lands without breaking what runs

**History follows the file.** A card first moves whole files with `git mv`, in a commit that changes nothing else but import paths. It
splits files in the next commit. Git's rename detection needs a file's content mostly unchanged, so `git log --follow` and `git blame -C`
find it. When a big file is cut into several, the largest part keeps the `git mv` and the others are new files, and the commit message
names where each section went.

**Paths inside the package.** An import changes only inside its package:

- `../src/…` in tests;
- `bin/wf.ts` → `../src/cli/main.ts`, `bin/ae.ts` → `../src/cli/main.ts`;
- `runner.ts` and `index.ts` re-exports.

The typecheck finds every one it reads. The ones it does not read are:

- `await import('../src/…')` with a computed path;
- paths in strings;
- **paths built from a file's own place**, which move silently:
  - the runtime's `runner-detached.ts:149` builds the worker's path (`'..', 'bin', 'ae-worker.ts'`); at `src/harness/detached/detached.ts`
    it is two folders deeper and needs two `..` more (`'..', '..', '..', 'bin', 'ae-worker.ts'`);
  - the api's `HOME_REPO` needs one too.

  Each gets a test that resolves the path and checks the file exists.

**Docs, `CLAUDE.md` and JSDoc.** File names appear in:

- the `CLAUDE.md` files (12 in the root one, 15 in the orchestrator's, 7 in the runtime's, 9 in the api's);
- the READMEs (114 and 142);
- `docs/architecture.md` (42), `features.md` (326), `open-issues.md` (108);
- the JSDoc of `src`.

Each card updates the names of the files it moves in the same commit. `grep -rn '<old name>\.ts'` over `*.md` and `src` is empty
before it commits. The runtime's `readme.test.ts` already refuses a source file its README does not name, and with the two changes above (a
recursive walk that skips tests, a pattern that takes nested paths) it holds the new paths both ways: a file not named, and a name with no
file. The dated docs (`night-*.md`, `eval-*`, `design-*`) are records and keep the names they were written with. `architecture.md`'s
store list, which omits `a2a-agents`, is corrected when that file moves.

**Order within a package**, in cards small enough to review. Each card is one or a few features, green on its own:

1. **Tests first, no file moved:**
   - `boundary.test.ts`, `readme.test.ts`, `harness.test.ts` and `a2a-boundary.test.ts` walk recursively;
   - the entry pins;
   - the cycle test;
   - `layout.test.ts`;
   - `limits.test.ts` with the baseline;
   - `eslint-plugin-sonarjs` and the four rules in `.oxlintrc.json`;
   - the test scripts' globs and the api's `--import`.

   Everything passes on today's flat tree, and every new rule has a plant that makes it refuse.
2. **The runtime**, which is smaller and has the clearest lines:
   1. `core/session.ts`, which breaks the cycle;
   2. `core/` and `core/engine/`;
   3. `harness/` and its three drivers;
   4. `a2a/`;
   5. `facade/` and `cli/`.
3. **The orchestrator, leaf first**, whole files before splits:
   1. the files that move whole into their folder: `check`, `closeout`, `daemon`, `meter`, `plan`, `inbox`, `feed`, `timeline`, `deps`,
      `rest`, `admission`, `places`, `tally`, `a2a-agents`;
   2. `store.ts` split into the record's stores and the features' stores;
   3. `workflow.ts` into its nine folders, leaf first;
   4. `run.ts` into its 21 folders, in the leaf-first order above, `record/` and `status/` first;
   5. `verbs.ts`, `decide.ts`, `forget.ts`, `start.ts`, `authoring.ts`, `workflow-store.ts`, `worktree.ts`, `views.ts` into their features;
   6. `tick.ts`;
   7. `cli.ts` last. `main`'s split reaches every verb, and by then every verb has its folder.
4. **The api**: the folders, `HOME_REPO`, the tests beside.

Each card also removes the baseline entries of what it cut under the limits. `advanceRun`, `main`, `retryRefusal` and `forgetRefusal` are
each split as their own card, after their file has moved: a move and a rewrite never share a diff.

**What a run in flight meets.**

- **A worktree cut before a move** has the old paths. Its step works on them, and the merge of its result with a restructured main is a
  conflict of moved files, which git resolves by rename where the content is close. A card that restructures a package should not be
  in flight at the same time as a card that changes the same files. The inbox holds cards touching one package while that package's
  restructure is open.
- **A run's workflow folder is frozen at `wf start`**, and its `check:` comes from there. Nothing in `workflows/` names a `src` path
  (checked: `grep` finds none), so a frozen check keeps working.
- **The daemon (`wf up`) runs the orchestrator from the checkout it started in.** After each restructure merges, it must restart, as after
  any merge that changes `src`. The entries do not move, so the api keeps importing the same paths across the restart.
- **The runtime's detached worker** is found by a path built from its caller's place. Once the runtime moves, a worker spawned by the
  old code still runs the old file until its task ends, and a new spawn finds the moved one. That is why the path test above exists.

## Measuring the change

Each restructure card's run reports, at its ship gate, **the input tokens its implement step read** (in the cache classes the runtime
measures), its turns and its tool calls. `wf decide <run>` prints them per step from the run's own meter: the journal's `Usage`, folded per
step. The report sets them beside the same numbers for a **similar card from before** — same workflow, a diff of similar size — named in
the card's brief.

The implement step cannot report its own final meter, which is known only once it ends. So the comparison is made by the step after it, or
by the person at the gate, and filed in the card's closeout.

The lasting measure is not the restructure's own cost, which is mostly moving files. It is **what later cards in a restructured area
read**: after each package lands, the next three cards touching it are compared the same way with three before it. If an agent reads more
per step after the split than before, the anti-fragmentation rules are wrong somewhere, and the numbers say where.

## Decided at review (owner, 2026-09-28)

The choices this note first left open were settled by the owner on 2026-09-28 and are in "Decided" above:

1. **File names follow the feature** (`say/say.ts`, `retry/retry.verb.ts`), not `rules.ts`, `store.ts` and `verb.ts` in every folder:
   grep, stack traces and editor tabs show a file name first.
2. **`index.ts` re-exports pure files only.** A face that re-exported a store would make every pure file that imports it reach the disk,
   under the boundary test's direct-import reading.
3. **`max-lines` is 500 code lines**, a ceiling against giant files, never a target. The function rules shape the code.
4. **About 39 folders in the orchestrator**, small features (`say`, `cancel`, `timeline`) included: each is a verb a person asks for by
   name.
5. **The client rule of `boundary.test.ts` is read through imports** (see "The kinds, by path"). Every refusal it makes today is kept.
