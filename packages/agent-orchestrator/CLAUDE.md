# packages/agent-orchestrator — `wf`

Runs of steps from folders of markdown, a tick that files and admits them on the runtime, and the verbs a person uses. Its files are
pure, store, controller or the client (`test/boundary.test.ts`), and its folders are held by `test/layout.test.ts`.

## Folders

- **A file in `src/<feature>/` says its kind by its name**: `x.store.ts`, `x.verb.ts`, else pure; only a top-level file is listed in
  `boundary.test.ts`. A test beside its file reaches the helpers one folder further up (`../../test/scratch.ts`).

## Keys, agents and folders

- **A key added to `STEP_KEYS` has three sites outside the package**: `KINDS` in `apps/api/src/workflows/builder.ts`, `WorkflowStepSpec` and
  `specOf` in `apps/api/src/workflows/workflows.ts`, and the web's mirror with `UNSET` (`apps/web/src/lib/builder.ts`).
- **A key renamed in `STEP_KEYS` is still read under its old name**: `FORMER_KEYS` (`workflow.ts`), `formerStepFields` and the agent's
  `keys` in `FrozenStepSchema` (`workflow-store.ts`, held by `test/frozen-step.test.ts`), `asNamed` in `readRun`,
  `formerOf` in `apps/api/src/agents/agents.ts`, `formerKeyWritten` in the renders, `formerKeyLines` at `wf start`.
- **A key added to `AGENT_KEYS` that is no role key is excluded in three places** (`ROLE_KEYS` in the api's `builder.ts` and `agents.ts`,
  the web's `lib/agents.ts`); a key naming a file beside the agent is digested by `agentVersion` and by the api's `versionOf`.
- **A folder is read with its places** (`lookupRoots`): a reader outside `wf start` passes `Places` (`placesOf(repo)`), and a version is
  checked with the places it was listed with (`skillsAt`). Who names an agent is read in every place that falls back to it (`repoUsers`),
  and a guard added at load goes on every verb that sets the same thing (`autoDropped`).
- **A key one function refuses is refused by every function that writes it**: grep for the key before trusting "one writer" in a comment.
- **A shipped folder is whole with `workflows/agents/` and `workflows/skills/`**: a test that copies a folder copies both; the ui agents
  and skills are copied into the package's `workflows/`, held byte for byte; a sentence a step is told is read with `toldIn`.
- **A Claude Code step's instructions are in `runs/<id>/agents/<step>/prompt.md`** and its brief is its own note (`briefBody`); a step
  whose rendered folder is gone is told its skills whole in the brief (`unrendered`, `skillsAgain`).
- **The board's listing of a step is resolved; its file is not**: write a step's own keys (`ListedStep.own`). A key the parser converts
  is written back in the form the file has (`contextText`). Code outside the package reads frontmatter as the parser does
  (`splitFrontmatter`, trimmed; `frontmatterValue`).
- **`fixtures/argv-shipped.json` pins dev's implement argv**: after changing what a shipped agent gives, record it with `ARGV_RECORD=1`
  and read the diff. `fixtures/git-runs-before.json` is refreshed with `everything()` of `git-runs-pin.ts`; read its diff line by line.
- **The api reads `agent-orchestrator/run`, `agent-orchestrator/workflow` and `agent-orchestrator/effect`**, its tests with
  `await import`: the api's typecheck fails on a name a subpath no longer exports, so before moving a name out of `run.ts` or
  `workflow.ts`, re-export from `run.ts` what the api reads there.

## Refusals

- **A refusal is thrown as `Missing`, `Conflict` or `Invalid`** (`src/refusal/refusal.ts`, `exitCode` 2): no such run, a state that
  forbids the verb, an input that is wrong. `test/refusal.test.ts` refuses `exitCode: 2` set by hand anywhere under `src`.
- **A new refusal chooses its kind, never a status**: the api reads the kind off `agent-orchestrator/effect` and answers it from one
  table (`REFUSAL_STATUS` in `apps/api/src/app.ts`); a plain `Error` there is a 500.

## Runs, phases and asks

- **The runtime's phase is free text compared exactly** (`needs-human` in `harnessBlocked`, the api's `needsOf`, the web's `stepState`,
  `listing`): put a new word beside it (`waitingOf`), never into it. A new runtime phase is read in `listing` (`settledOf`) and in
  `phaseOfView`, and on the board.
- **A new step status is `working` on the board until `stepState` knows it**, and `git-runs-before.json` pins every `Decision`.
- **A word from outside is made one line before it is measured into a column** (`waitingWords`).
- **A person's fact that stops a run's asks is read by `assess`**, not only by the verbs and the tick; a line that offers a verb says that
  verb's refusal itself (each producer in `run.ts` reads `run.pruned`).
- **A level-triggered ask cannot simply be deleted once acted on**: the verb it would let through refuses the state the deletion makes.
- **A fake closeout is flat, as a harness writes it** (`parseCloseout` nests fields under `output`); one written by hand carries every
  field its agent's `output:` schema requires.
- **`wf decide` of a shipped run prints no step's closeout**: a test of a step's artifact lines reads a run still awaiting a decision.
- **A seeded finished step with a worktree on disk owes a hand-off until its record says `handedOff`** (`handOffOwed`).
- **What the store reads back is decoded by a schema in a store file, never a pure one** (`boundary.test.ts` refuses Effect in a pure file
  but `effect/Data`: the api loads `./run` and `./workflow`, whose modules `test/refusal.test.ts` pins). A run record, a person's ask,
  `daemon.json`, `tick.json`, `tick-stats.json`, a queue try and a line of the feed each have one, a `StructWithRest` where the file is
  written back (a `Struct` strips the keys it does not name, and a record written by a newer tick keeps them). `Struct({})` accepts an
  array; a struct with a key refuses one. A record that does not decode is refused by `readRun` with exit 2, naming the file and its first
  wrong field (`UnreadableRecord`), and left out of `listRuns`, said once on stderr, so one bad file stops no other run. A frozen step is
  decoded by `FrozenStepSchema` (`workflow-store.ts`), a field per `StepKey` (a key added without one fails the typecheck): the shape, not
  the words.

## The tick

- **A command that lives as long as its process is an Effect run by `runMain`** (`src/cli/run-main.ts`): what it holds is taken with
  `acquireRelease` in its scope, never let go in a signal handler, and a signal exits 128 + its number once the scope is closed.
- **Admission reads the views the runtime's pass hands back** (`toAdmit`, `e.admit`), never a read of its own. A new engine verb goes
  into `ENGINE_PHASES` and `ENGINE_WRITES`; an admitted task starts on the runtime's next pass.
- **A finished run is answered from memory while what it was judged on stands** (`restMemo`, `atRest`, `restStamps`): a new input of its
  pass goes into the stamps. Every test file that ticks a store sets `WF_VERIFY_REST=1`.
- **A pass on a copy of the store acts on the real repositories** its records name: measure with a fixture store of scratch repositories,
  or a fake runtime whose tasks are all `pending`.
- **Git refuses a whole `for-each-ref` for one base it cannot read**: `branchReader` lists again without it (pinned against `oneByOne`).
- **A step on a remote agent is filed with its local fields left out, never `undefined`** (`localFields`).
- **What `engine()` reads, it reads without throwing** (`readRemote`): a bad file is left out and said on stderr.
- **A task journal that does not read stops its own run, never the pass**: `pass` in tick.ts leaves the run unjudged, in flight and out
  of the feed's `removed` (`unreadableJournal`); `test/unreadable-journal.test.ts` walks it on the runtime itself.
- **A step's fence is read through `modeOf`**: Claude Code's is `permissionMode`, Codex's `sandbox`.
- **The ending's check is the run's**: the shipper stages the merge; the tick commits on the check's exit 0 or aborts (`landingDue`),
  level-triggered off `MERGE_HEAD`, reading conflicts with `ls-files --unmerged` (never `git diff`, which takes the index lock). A landed
  ending keeps no pictures of the merged tree but those its closeout names (`dropLandedPictures`).

## Checks and worktrees

- **A `check:` tells the run's check from a hand run by `WF_BASE_REF`**, never `WF_STEP`: the ship's check runs on the merged tree with
  none (`web-check.test.ts` runs each line both ways). A check starts at low priority (`CHECK_NICENESS`); sessions do not.
- **A check logs its stdout; a person is shown the tail of its stderr**, whole at `WF_STDERR`.
- **A worktree gets a `node_modules` of its own**, the third-party packages hardlinked from main's; a lockfile that differs from main's
  costs an `npm ci`. Commit the lockfile with a new dependency, and run `npm install` on main after merging one by hand. `du` counts a
  hardlinked file once per invocation (`diskBytes`).
- **An ending's check installs what the staged merge's lockfile asks for, in the checkout**, first (`checkoutParts`, `checkScript`):
  compared in place, never with `lockfileParts(repo, repo)`, which parts on every package nested in a workspace. A failed install is
  ended by a signal: only the process's exit code is a verdict (`exitVerdicts`), not the log's trailer.
- **`execFileSync` with no `stdio` copies the child's stderr onto yours**: pass `stdio: ['ignore', 'pipe', 'pipe']`.
- **A `readdirSync` entry for a symlink is not `isFile()`, and every write follows it**: refuse a link by name where a folder's files are
  its own (`writeWorkflow`).

## Claude Code, as the steps meet it

- **A job (`claude -p`) never waits on a prompt; a background session in a folder nobody opened blocks in any mode that can ask**:
  `validateFolderMode` judges only `background: true`, which must run `dontAsk` or `bypassPermissions`.
- **A job reads no user settings** (`--setting-sources project,local`): what a step needs goes on the step, its agent or the checkout's
  `.claude/settings.json`.
- **A write is matched against `Edit` rules only**: write `allowedTools: Edit(**)`, never `Write(path)` (`fileRuleRefusal`).
- **A project's allow rules are dropped in a directory Claude Code has not trusted**: measure a rule in a trusted checkout.
- **A session under `~/.claude/` cannot write there in any mode**: put a probe store elsewhere.
- **A path a fenced step's brief names is inside its own folder** (`givenPlan`, `folderPlace.make`); a rule offered for the next run names
  no path of this one (`allowRuleOf`, `disallowedBy`).
- **A job's turn cannot end to wait for background work**: run long work in the foreground, or block on it
  (`timeout 580 bash -c "while kill -0 <pid>; do sleep 5; done"`).
