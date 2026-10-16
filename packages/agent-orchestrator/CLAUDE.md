# packages/agent-orchestrator — `nemia` (`wf`, its alias)

Workflows as folders of markdown, runs of their steps, a tick that files and admits them on the runtime, and the verbs a person uses:
run slots, worktrees and landing, what a check means, budgets across tries, gates, the inbox, factories, stats, agent definitions. It
reaches the runtime through `src/runtime-client.ts` alone (`CLIENT` in `test/boundary.test.ts`), and its vocabulary through
`agent-runtime/vocabulary`, from any file (`VOCABULARY`). Its files are pure, store, controller
or the client (`test/boundary.test.ts`), and its folders are held by `test/layout.test.ts`. What it holds today that is a candidate for
the runtime is in `docs/architecture.md`, *Who owns what*.

## Folders

- **A file in `src/<feature>/` says its kind by its name**: `x.store.ts`, `x.verb.ts`, else pure; only a top-level file is listed in
  `boundary.test.ts`. A test beside its file reaches the helpers one folder further up (`../../test/scratch.ts`).
- **The place is a service with no default (`PlaceService`, `src/place/place.store.ts`)**: a controller asks it (`yield* PlaceService`),
  a store helper takes it as an argument, and whoever runs the program gives it by name — `gitPlaceLayer` at the daemon and the api,
  `runOver(runEngine, () => stand().layer)` at a test's head (`test/placed.ts`). A program given none does not compile. A test answers
  a verb itself with `placeOver` (`test/place-over.ts`), never a planted folder.
- **`main` is handed its place as its engine and its demand host, the git place where it is handed none** (`src/cli/main.ts`), and
  each command gives it to its program (`placedIn`, `src/cli/flags.ts`): a test that types a command hands the test's,
  `main(argv, e, undefined, stand().place)`, and `test/cli-place.test.ts` refuses a file of `src/cli` that names the git place.
- **The git place's code is `place/git/` (`place.ts`, `git.ts`, `verbs/`), behind one door, `src/place/shipped.store.ts`**
  (`placeBreaks` in `test/boundary.test.ts`): a verb is a generator that yields each git command, so one body answers `ask` (off the
  loop) and `askNow` (`spawnSync`); it reads its request first (`asked.ts`), and a throw is unread in one sentence.
- **The test place is `place/memory/` (`testPlace()`: a place, its layer, and `world`, a session's and a person's part)**: a test file
  names it with `const stand = eachTest(testPlace);` and `runOver(runEngine, () => stand().layer)` (`test/placed.ts`), new for each
  test. Its merge is by file, with no rename, ignore rule, hook, lock or deadline: a test of one keeps `gitPlaceLayer`, in a boundary
  file. A verb's
  behaviour is a walk in `test/place-walks.ts`, with the one answer both places give.
- **A person's hand on a repository is on the handle (`World`, `place/memory/world.ts`)**: `staged`, `takeBack`, `putBack` beside
  `stage` and `commit`, and `changed`, the paths a commit changed, each walked on both places, `gitWorld` (`test/git-world.ts`) its
  git side; a test reads no `.git` path.
- **A test names its engine with `const engine = eachTest(testEngine);` (`agent-runtime/testing`) and `engineOf(engine().layer)`**:
  `settle(id, phase, end)` takes what the attempt ended with as an object (`{ closeout, exitCode }`), and a `say` or a `stop` is
  refused as the runtime refuses it (say to a task settled `running` first).
- **A test file that runs git, imports what starts a process, names the real place or engine, or makes an engine by hand is named
  `<what>.boundary.test.ts`**, its helpers followed: `test/stand-ins.test.ts` refuses any other, but the files and kinds listed in
  `test/stand-ins.baseline.ts` (`node test/stand-ins.ts` measures it), which only shrinks.
- **A git call belongs to the place's code, never to `src`**: `test/git-calls.test.ts` refuses a `'git'` spawn, a call of `git` or
  `gitSays`, a `.git` or `MERGE_HEAD` path, and a `scripts` path handed to a spawn or to `node:path` (`script`: no process a question)
  in `packages/*/src` and `apps/*/src`; `GIT_SITES` is empty, and stays so.
- **`place.spawned` counts git processes, `place.calls` questions** (`countSpawn` in the git place's runner, `meteredPlace`); a standing
  is keyed by repository and base branch, the place no part of the key. A test place counts no question until a test wraps it in
  `meteredPlace` (`src/tick/rest-store.test.ts`), and starts no process: an equality on `spawned` belongs to a boundary file.
- **A harness's word or a team name in `src` or `bin` is refused by `test/words.test.ts`**, which holds today's per file
  (`HARNESS_WORDS`, `TEAM_NAMES`, each naming its card or move): lower a count in the commit that removes one, and add none.
- **The command is `nemia` in every printed word; a `wf` said in `src` or `bin` is refused by `test/cli-name.test.ts`**, but a value
  stored and read back as written (`by: 'wf up'`, the check's marker `wf <name>:`), listed in its `KEPT` (the api's has none).
- **Git holds `index.lock` through a clean filter under `git add`, not through `git commit`'s pre-commit hook** (it writes the index
  first): a test that holds a lock past a verb's deadline holds it with a filter (`test/git-skill.boundary.test.ts`).

## Keys, agents and folders

- **A key added to `STEP_KEYS` has four sites outside the package**: `KINDS` in `apps/api/src/workflows/words.ts`, `WorkflowStepSpec` and
  `specOf` in `apps/api/src/workflows/workflows.ts`, the web's mirror with `UNSET` (`apps/web/src/lib/builder.ts`), and its schemas with
  `StepKeySchema` (`apps/web/src/lib/api/library.ts`), which refuses a key it does not list. A template places it too, or its export
  refuses it by name: `PLACED` and `stepOf` (`template/draft.ts`), `OVERRIDES` (`template/layout.ts`), `stepFile` (`applied/render.ts`).
- **A key renamed in `STEP_KEYS` is still read under its old name**: `FORMER_KEYS` (`former/former.ts`), `formerStepFields` and the agent's
  `keys` in `FrozenStepSchema` (`folder/folder.store.ts`, held by `test/frozen-step.test.ts`), `asNamed` in `readRun`,
  `keysWritten` in `src/roster/roster.ts`, `formerKeyWritten` in the renders, `formerKeyLines` at `wf start`.
- **An agent's own key renamed is read through `FORMER_OWN_KEYS`, and its words through `harnessPromptNamed`** (`former/former.ts`):
  in `parseAgent`, `asNamed`, `unreadReading` (`src/roster/roster.ts`) and `formerKeyLines`; `FORMER_KEYS` is typed
  to step keys and cannot hold one.
- **A key added to `AGENT_KEYS` that is no role key is excluded in three places** (`ROLE_KEYS` in the api's `builder.ts` and in
  `src/roster/roster.ts`, the web's `lib/agents.ts`); a key naming a file beside the agent is digested by `agentVersion` and by
  `workflowVersion` (`src/folder/version.store.ts`).
- **A folder is read with its places** (`lookupRoots`): a reader outside `wf start` passes `Places` (`placesOf(repo)`), a factory's
  folder is read with its hires and rules too, built by `factoryFills` alone (`rules/rules.store.ts`; a run's by `workflowsOf`), and a version is
  checked with the places it was listed with (`skillsAt`). Who names an agent is read in every place that falls back to it (`repoUsers`),
  and a guard added at load goes on every verb that sets the same thing (`autoDropped`).
- **A skill folder's files are read through `skillFiles`** (`skills/read.store.ts`), never a `readdirSync`, `cpSync` or `lstat` of one's
  own: it follows a link of a checkout's `.claude/skills/` that stays inside the checkout and refuses every other, and `copySkill` alone
  refuses them all (`src/skills/read.store.test.ts`, `test/skill-links.test.ts`).
- **A skill is asked by the name its line writes, through `SkillsFound.at`, and listed through `all`**, which holds no skill named with
  its folder (`folder:name`, `keys/given-skill.ts`): a frozen copy is `skills/<bare>` (`bareSkillOf`), and every record, version and
  count keys the line's name (`test/skill-folders.test.ts`).
- **A key one function refuses is refused by every function that writes it**: grep for the key before trusting "one writer" in a comment.
- **A team is whole with its `agents/` and `skills/`**: a test that copies a workflow folder copies both, as `teamCopy` copies the
  tests' team (`test/fixtures/team/`); a sentence a step is told is read with `toldIn`.
- **A Claude Code step's instructions are in `runs/<id>/agents/<step>/prompt.md`** and its brief is its own note (`briefBody`); a step
  whose rendered folder is gone is told its skills whole in the brief (`unrendered`, `skillsAgain`).
- **A step's `body` opens with its agent's instructions** ("You are …"): a screen that quotes the step reads its own words, `ownNote`
  (`ending/ending.ts`), as `toDecide` and `wf decide` do.
- **The board's listing of a step is resolved; its file is not**: write a step's own keys (`ListedStep.own`). A key the parser converts
  is written back in the form the file has (`contextText`). Code outside the package reads a step's frontmatter by calling the
  package's reader (`splitFrontmatter`, from `agent-orchestrator/workflow`), never a parser of its own `(no test yet)`.
- **A test that needs a realistic folder reads the tests' team** (`test/fixtures/team`, `test/team.ts`), never a shipped one: a
  person's factories get no workflow or agent from the package, and a guard over what ships reads `shippedFolders()`.
- **The api reads `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`**, its tests with
  `await import`: the api's typecheck fails on a name a subpath no longer exports, so before moving a name out of `run.ts` or
  `workflow.ts`, re-export from `run.ts` what the api reads there.

## Refusals

- **A refusal is thrown as `Missing`, `Conflict` or `Invalid`** (`src/refusal/refusal.ts`, `exitCode` 2): no such run, a state that
  forbids the verb, an input that is wrong. `test/refusal.test.ts` refuses `exitCode: 2` set by hand anywhere under `src`.
- **A new refusal chooses its kind, never a status**: the api reads the kind off `agent-orchestrator` and answers it from one
  table (`REFUSAL_STATUS` in `apps/api/src/app.ts`); a plain `Error` there is a 500.

## Runs, phases and asks

- **The runtime's words stop here**: the orchestrator translates a runtime phase into its own status (`harnessBlocked`, `waitingOf`,
  `settledOf` in `listing`, `phaseOfView`), and the api and the board read only the orchestrator's words `(no test yet)`; today
  `needsOf` (`summary/judged.verb.ts`) and the web's `stepState` still compare `needs-human`. A new runtime phase is translated in `listing` and
  `phaseOfView`; put a new word beside a phase (`waitingOf`), never into it.
- **A new step status is `working` on the board until `stepState` knows it**.
- **A run's kinds are resolved from the world, never from a remembered transition** (`pinPass`, `src/revisions/pin.verb.ts`, at the head
  of `advancePass`): while a run has filed nothing it takes the folder's steps and their revisions on every pass, and after that only on
  a person's `nemia refresh`. The ledger is appended by hash (`appendRevision`), so two passes over one edit give it one number.
- **A resolve on a pass stops its own run, never the pass** (`pinPass`): a kind that stops reading, a folder whose steps are a set
  `nemia start` would refuse (`stepSetRefusal`, pure, asked of both), a ledger the store cannot write — the run keeps the revisions, the
  step set and the prompts it had, and the pass says why. The record is changed after the render, which is the write that can throw.
- **A revision answered for a kind nobody has resolved has no ledger entry**: compare against what a fresh resolve returns
  (`refreshedNow`), never `topsOf` of what the record pins, or an edit reads as no drift.
- **A refresh takes new content, never a new step set** (`refreshedNow` keeps a step the folder lost), and re-renders each step's prompt
  (`renderAgain`): `closeoutSchemaOf` reads the frozen step, so a schema that moved starts a fresh session (`resumeOn`, `tick/file.verb.ts`).
- **A word from outside is made one line before it is measured into a column** (`waitingWords`).
- **A person's fact that stops a run's asks is read by `assess`**, not only by the verbs and the tick; a line that offers a verb says that
  verb's refusal itself (each producer reads `run.pruned`).
- **A level-triggered ask cannot simply be deleted once acted on**: the verb it would let through refuses the state the deletion makes.
- **A fake closeout is flat, as a harness writes it** (`parseCloseout` nests fields under `output`); one written by hand carries every
  field its agent's `output:` schema requires.
- **`wf decide` of a shipped run prints no step's closeout**: a test of a step's artifact lines reads a run still awaiting a decision.
- **A seeded finished step with a worktree on disk owes a hand-off until its record says `handedOff`** (`handOffOwed`).
- **A run's record, a person's files beside it and the inbox are read and written through `runStore`** (`src/record/files.store.ts`):
  add the method to `RunStore` (`src/record/record.ts`), never an import of `record.store.ts`'s run functions, nor through `runner.ts`;
  `test/run-store.test.ts` refuses any file of `src` but the store's own that imports them, and `test/store-paths.test.ts` one of `src`
  or the api's that hands `fs` a path from `runsDir()` or `inboxDir()` (an exception in its `EXCEPTIONS`, with why). A person's verb
  writes through `asks.write`, `holds.put`, `runs.cancel`, `runs.forget`, `runs.prune` and the inbox's `add`, `rewrite` and `drop`; the
  tick alone writes a queue try (`inbox.putTry`, `inbox.dropTry`); a message names an ask's file by `asks.where`, a card's by
  `inbox.where`.
- **What the store reads back is decoded by a schema in a store file, never a pure one** (`boundary.test.ts` refuses Effect in a pure file
  but `effect/Data`: the api loads `./run` and `./workflow`, whose modules `test/refusal.test.ts` pins). A run record, a person's ask,
  `daemon.json`, `tick.json`, `tick-stats.json`, a queue try and a line of the feed each have one, a `StructWithRest` where the file is
  written back (a `Struct` strips the keys it does not name, and a record written by a newer tick keeps them). `Struct({})` accepts an
  array; a struct with a key refuses one. A record that does not decode is refused by `readRun` with exit 2, naming the file and its first
  wrong field (`UnreadableRecord`), and left out of `listRuns`, said once on stderr, so one bad file stops no other run. A frozen step is
  decoded by `FrozenStepSchema` (`folder/folder.store.ts`), a field per `StepKey` (a key added without one fails the typecheck): the shape, not
  the words.

## The tick

- **A command that lives as long as its process is an Effect run by `runMain`** (`src/daemon/up.verb.ts`, run by `wf up` and the api's
  `src/main.ts`): what it holds is taken with `acquireRelease` in its scope, never let go in a signal handler, and a signal exits 128 +
  its number once the scope is closed.
- **The packages' entries are Effect, and the api is the system's public interface**: a controller is a program over `EngineService`,
  run by its caller with `runWith` (`runtime-client.ts`), and reads the engine with `asked`. `await e.view(id)` compiles and answers
  the Effect itself, unrun: only `typescript/await-thenable` in `npm run lint` refuses it.
- **Admission is the runtime's**: the orchestrator files a task `queued` with its `priority` (`stepMomentum`, `MOMENTUM`), and `engine()`
  hands the runtime the ceiling and the pools. A new engine verb goes into `ENGINE_PHASES`, and into `ENGINE_WRITES`, or `ENGINE_READS`
  where it changes no task (`views/views.verb.ts`); an admitted task starts on the runtime's next pass.
- **A finished run is answered from memory while what it was judged on stands** (`restMemo`, `atRest`, `restStamps`): a new input of its
  pass goes into the stamps. A run whose stamp holds is not read off disk (`keptOf`), so an input the stamp misses is missed for good;
  `WF_VERIFY_REST` dies on it. Every test file that ticks a store sets `WF_VERIFY_REST=1`.
  pass goes into the stamps. Every test file that ticks a store sets `WF_VERIFY_REST=1`.
- **The daemon frees a finished run's worktrees on a sweep beside its passes** (`freeOnce`, `src/prune/free.verb.ts`): a test that
  starts a daemon and reads a finished run's worktree afterwards sets `WF_KEEP_WORKTREES=1`.
- **The daemon measures the store's disk on a sweep beside its passes** (`diskOnce`, `src/disk/disk.verb.ts`), after its first pass and
  every `DISK_EVERY`: a test daemon walks its scratch store once, and a pass is handed the reading, never the walk. The sweep asks the
  engine `kept`: a test of it plants sizes on the stand-in (`engine().keeps`), and a task is a factory's through its run's `steps`.
- **The test script loads `test/ambient.ts`**, which sets `WF_MAX_RUNS` and `WF_MAX_CONCURRENT` to a value their readers refuse: a
  test file that reads either sets or deletes it at its head, never the daemon's (`test/ambient.test.ts`). It deletes
  `OTEL_EXPORTER_OTLP_ENDPOINT` too: a test that exports sets the address of a collector it made (`test/check-export.boundary.test.ts`).
- **A test of what the tick orders or words by the clock seeds `Date`** (`t.mock.timers`: `fileInOrder` in `test/pool.test.ts`, the ages in
  `daemon.store.test.ts`), and stamps a fake closeout from the attempt's journalled start (`starts` in `test/held.test.ts`). A duration it
  decides on is never on `Date`: the daemon's silence is `elapsedMs` over `instantNow()`, a place verb's grace on `performance.now()`.
- **A controller's rest or deadline is steered with `steeredClock()` (`test/steered.ts`), at its shipped duration written as a literal**:
  wait for the rest asked (`asked`, on `bell`) before `adjust`, a millisecond short, then the millisecond. A wall decision keeps its
  `now` on `Date`; `test/steered.test.ts` refuses `effect/testing` in a file of `src`, `bin` or `place` that is no test.
- **A pass on a copy of the store acts on the real repositories** its records name: measure with a fixture store of scratch repositories,
  or a fake runtime whose tasks are all `pending`.
- **Git refuses a whole `for-each-ref` for one base it cannot read**: the place's `standing` lists again without it (pinned in
  `test/standing.boundary.test.ts` against git asked one branch at a time).
- **The tick reads git through one `standing` a repository, place and base a pass** (`passStanding`, `standingReader`): a question it
  did not ask is `unread`, never asked again, so a new git read in the pass belongs in the ask (`asksOf`), held by
  `test/pass-reads.boundary.test.ts`.
- **The pass tells `standing` what it last read of each branch (`known`, `StandingMemo`)**: a `baseRef` is listed only for a branch told
  nothing, so a column added to the listing comes back on every pass unless the hint covers it (`test/standing.boundary.test.ts`).
- **Only the tick writes `standing.json`**: a reader off the tick (`nemia ls`, the board's list) reads it (`standingSnapshot`), and a
  person's one-off verb asks the place live (`standingNow`, `standingLive`); neither runs git through a reader of its own.
- **A step on a remote agent is filed with its local fields left out, never `undefined`** (`localFields`).
- **What `engine()` reads, it reads without throwing** (`readRemote`): a bad file is left out and said on stderr.
- **A task journal that does not read, or an unfrozen run's folder that does not load (`UnloadedFolder`, `record/steps.store.ts`), stops
  its own run, never the pass**: `pass` in `tick/tick.verb.ts` leaves the run unjudged, in flight and out of the feed's `removed`
  (`unreadableJournal`, `unloadedFolder`); `test/unreadable-journal.test.ts` and `test/unloaded-folder.test.ts` walk it on the runtime.
- **The ending's check is the run's**: the shipper stages the merge; the tick commits on the check's exit 0 or aborts (`landingDue`)
  through the place's `land`, level-triggered off the place's `status`, asked only where `landingOpen` holds, and the `stat` of the file
  `open` named (`stagedHere`, `place/landing.store.ts`); an unread `status` is never a verdict. A landed
  ending keeps no pictures of the merged tree but those its closeout names (`dropLandedPictures`).

## Checks and worktrees

- **A `check:` tells the run's check from a hand run by `WF_BASE_REF`**, never `WF_STEP`: the ship's check runs on the merged tree with
  none. A check starts at low priority (`CHECK_NICENESS`); sessions do not.
- **A check's stdout and stderr are the runtime's, each kept whole**, read through the engine's `output` (`checkStreams` in
  `views/views.verb.ts`): `reported` reads the whole stdout, a person the tail of each; the engine's `logs` is a tail, read only for
  a check filed before the runtime kept streams (`test/check-handed.test.ts`).
- **A worktree gets a `node_modules` of its own**, the third-party packages hardlinked from main's, and so does each workspace whose
  own `node_modules` the lockfile installs into (`workspaceModules`, `depsPlan`); a lockfile that differs from main's costs an `npm ci`. Commit the lockfile with a new dependency, and run `npm install` on main after merging one by hand.
- **A removal asks the place its judgement read (`Ready.place`), never the one its program is given**: a test that counts or holds
  `remove` gives its place to `judging` or `judgingMany` too (`test/prune.test.ts`).
- **What a removal frees is `freedBytes` (`src/prune/freed.store.ts`), a floor: a Node primitive (`lstat`, `readdir`, `fs.rm`,
  `statfs`) before a spawned `du`, `find` or `rm`**, which `test/spawned-tools.test.ts` refuses in any `src`.
- **An ending's check installs what the staged merge's lockfile asks for, in the checkout**, first (`checkoutParts`, `checkArgv`). A
  failed install is ended by a signal: only the attempt's exit code is a verdict (`attemptVerdict`), never what it printed.
- **A test that spawns a `wf` child waits on it with `nodeChild`** (`test/child.ts`): for what it says or writes, or its exit, which fails
  the wait at once with its output — never under a deadline, which the CLI's import alone can pass on a loaded machine.
- **A test waits in its process with `until` (`test/waits.ts`, the runtime's copy, held by `test/waits.test.ts`)**, asked on a `bell`
  its event's source rings or at a pace for a state, its test given `WAITED`: the runner's timeout is its one bound, which the `test`
  script's `--test-timeout` gives a test given none. `DEADLINES` (`test/waits.test.ts`) refuses a hand-written deadline.
- **A test that lets a deliverer's `say` through first waits until each line it expects gathered is handed on by the reader**
  (`FEED_FOLLOW_LINES`), not only taken off the hub; and puts its subscription through `kept`, which drops it in `t.after`: one left by a
  failure is followed by the next test (`src/subscription/deliver.verb.test.ts` refuses a put outside `kept`).
- **`execFileSync` with no `stdio` copies the child's stderr onto yours**: pass `stdio: ['ignore', 'pipe', 'pipe']`.
- **A `readdirSync` entry for a symlink is not `isFile()`, and every write follows it**: refuse a link by name where a folder's files are
  its own (`writeWorkflow`).

## Claude Code

- **Claude Code's facts as the steps meet it, a step's fence among them, are the runtime's**: `packages/agent-runtime/CLAUDE.md`,
  *Claude Code, as a harness*.
