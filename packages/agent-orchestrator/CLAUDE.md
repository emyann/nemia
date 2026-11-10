# packages/agent-orchestrator — the in-process `nemia` (`wf`, its alias)

Workflows as folders of markdown, runs of their steps, a tick that files and admits them on the runtime, and the verbs a person uses:
run slots, worktrees and landing, what a check means, budgets across tries, gates, the inbox, factories, stats, agent definitions. What
it holds today that is a candidate for the runtime is in `docs/architecture.md`, *Who owns what*.

The `nemia` a person types is the client in `apps/cli` (`apps/cli/CLAUDE.md`): it asks the api for the moved reads and spawns this
package's CLI for everything else — every write, `decide`, a help, and a read typed with `--local` — with the same words. `bin/nemia.ts`
and `bin/wf.ts` are that in-process CLI, the old path: exported as `agent-orchestrator/bin` and `/bin/wf`, resolved and spawned by
`apps/cli/src/local.ts` alone, and no package declares them as its bins. A change to a moved read's output changes the client's printer
too, which holds parity with this one until the in-process reads retire.

## Folders

- **The source (`src`, `bin`, `place`) is under `noUncheckedIndexedAccess`, and lint refuses a `!`** there (`.oxlintrc.json`, held by
  `packages/agent-orchestrator/test/index-reads.test.ts`): say what an absence means (the refusal or the miss the code already gives),
  never a cast or a default the contract does not give. A dictionary read stays a plain read, its `undefined` handled, with no
  `Object.hasOwn` guard put in front of it: that changes what a prototype key reads. The tests' own `test/tsconfig.json` leaves the
  flag off. `text.split(sep)[0]` is `firstPiece` (`src/piece/piece.ts`).
- **A test beside its file reaches the package's helpers one folder further up** (`../../test/door-walks.ts`), and the shared ones by the
  test kit's entries (`test-kit/scratch`, `test-kit/checkpoints`), never by a path.
- **The store's root is a service, `StoreRoot` (`src/config/root.store.ts`), given where a program is composed** —
  `src/cli/main.ts` and the api's `app.ts`, each from `WF_ROOT` through `storeConfigLayer(env)`, which gives the store's settings beside it (`StoreConfig`) — and a store function takes it as a
  required `home: string` with no default. `test/root-given.test.ts` refuses by name a new module-level root, a parameter defaulted to
  one, and a new line of a body that reads one — the shape most of the debt is in, since such a function takes no root at all;
  `test/global-roots.baseline.ts` counts the lines that still do, per file, and only shrinks.
- **`src/factory/servers/` is the store that already takes its root by parameter**: `servers.store.ts`'s functions take a required
  `home: string` first, read from `StoreRoot` by `servers.verb.ts`'s handlers, which take their input alone, and by
  the pass, which `advanceRun` hands to `filedAt` (`src/tick/told.verb.ts`). Copy it, not `level.store.ts`, for a new
  per-factory file: it is in no line of `test/global-roots.baseline.ts`, and the baseline only shrinks.
- **Every test process starts with `WF_ROOT`, `AE_ROOT` and `HOME` pointed at throwaway folders** (`test/ambient.ts`, loaded with
  `--import`), and the throwaway home carries a test git identity: a module that pins a root as it loads pins a throwaway one, and
  `os.homedir()` answers a throwaway too. A test that needs the person's own home reads `REAL_HOME`.
- **A test is given its place by name**: `const stand = eachTest(testPlace);` with `runOver(runEngine, () => stand().layer)`
  (`test/placed.ts`), new for each test, and a verb it answers itself it answers with `placeOver` (`test/place-over.ts`), never a
  planted folder. The test place's merge is by file, with no rename, ignore rule, hook, lock or deadline: a test that needs one of
  those keeps `gitPlaceLayer`, in a boundary file.
- **A git place verb is a generator that yields each git command**, so one body answers `ask` (off the loop) and `askNow`
  (`spawnSync`); it reads its request first (`asked.ts`), and a throw is unread in one sentence.
- **A person's hand on a repository is on the handle** (`World`, `place/memory/world.ts`): `staged`, `takeBack`, `putBack` beside
  `stage` and `commit`, and `changed`, the paths a commit changed; `gitWorld` (`test/git-world.ts`) is its git side, and a test reads
  no `.git` path.
- **A test names its engine with `const engine = eachTest(testEngine);` (`agent-runtime/testing`) and `engineOf(engine().layer)`**:
  `settle(id, phase, end)` takes what the attempt ended with as an object (`{ closeout, exitCode }`), and a `say` or a `stop` is
  refused as the runtime refuses it (say to a task settled `running` first).
- **A person's story is told as one test, on `story` and its stage** (`test/story.ts`): `const stage = staged({ runWith, main, engineOf })`
  at the file's head, after its environment is set, and in a test `const s = story(t)`, each checkpoint `await s.test(name, body)`, so
  a citation of its name resolves; once one fails the rest are filed skipped, naming it. The stage is new for each test: the test
  place, the engine's stand-in with `settle` and `e`, `runWith`, `runPlaced`, `main`, and `clock()`. A table is one test whose rows
  are `t.test` subtests, beside its feature (`src/<feature>/<feature>.test.ts`), or in `test/assess-<area>.test.ts` for `assess`
  across features, its builders from `test/assessed.ts`.

## Keys, agents and folders

- **A key is added to objects' `STEP_KEYS` first** (`packages/objects/src/workflow.ts`), with its Schema in `StepKeys` and its form in
  `STEP_KEY_FORM`, each typed so that one left out does not compile; then to `STEP_KEYS` in `src/step/step.ts`, the parser's copy, typed
  `typeof` objects' list, and the tables typed by its `StepKey` (`STEP_KEY_MEANINGS`, `frozenStepFields`, `COUNTS` for a count). The api
  reads objects' (`WorkflowStepSpec`, `specOf` and the builder's form in `apps/api/src/workflows/`); the board's mirror with `UNSET`
  (`apps/web/src/lib/builder.ts`) and its schemas with `StepKeySchema` (`apps/web/src/lib/api/library.ts`) are lists still to go, counted
  in `tools/guards/test/step-keys.test.ts`, which refuses any other list of the keys. A template places it too, or its export
  refuses it by name: `PLACED` and `stepOf` (`template/draft.ts`), `OVERRIDES` (`template/layout.ts`), `stepFile` (`factory/applied/render.ts`).
- **A key renamed in `STEP_KEYS` is still read under its old name**: `FORMER_KEYS` (`former/former.ts`), which the agent's `keys` in
  `FrozenStepSchema` read, `formerStepFields` (`folder/folder.store.ts`), `asNamed` in `runRecord`, `keysWritten` in `src/roster/roster.ts`,
  `formerKeyWritten` in the renders, `formerKeyLines` at `wf start`.
- **An agent's own key renamed is read through `FORMER_OWN_KEYS`, and its words through `harnessPromptNamed`** (`former/former.ts`):
  in `parseAgent`, `asNamed`, `unreadReading` (`src/roster/roster.ts`) and `formerKeyLines`; `FORMER_KEYS` is typed
  to step keys and cannot hold one.
- **A key added to `AGENT_KEYS` that is no role key is excluded in three places** (`ROLE_KEYS` in the api's `builder.ts` and in
  `src/roster/roster.ts`, the web's `lib/agents.ts`); a key naming a file beside the agent is digested by `agentVersion` and by
  `workflowVersion` (`src/folder/version.store.ts`).
- **A folder is read with its places** (`lookupRoots`): a version is checked with the places it was listed with (`skillsAt`), and who
  names an agent is read in every place that falls back to it (`repoUsers`).
- **A team is whole with its `agents/` and `skills/`**: a test that copies a workflow folder copies both, as `teamCopy` copies the
  tests' team (`test/fixtures/team/`); a sentence a step is told is read with `toldIn`.
- **A Claude Code step's instructions are in `runs/<id>/agents/<step>/prompt.md`** and its brief is its own note (`briefBody`); a step
  whose rendered folder is gone is told its skills whole in the brief (`unrendered`, `toldOf`).
- **A step's `body` opens with the heading of its agent's instructions** (`LAYER_HEADINGS`, one per layer `headedLayers` composes): a
  screen that quotes the step reads its own words, `ownNote` (`ending/ending.ts`), as `toDecide` and `wf decide` do.
- **The board's listing of a step is resolved; its file is not**: write a step's own keys (`ListedStep.own`). A key the parser converts
  is written back in the form the file has (`contextText`). Code outside the package reads a step's frontmatter by calling the
  package's readers (`splitFrontmatter` for the block, `readFrontmatter` for its YAML, both from `agent-orchestrator/workflow`), never a
  parser of its own.
- **A test that needs a realistic folder reads the tests' team** (`test/fixtures/team`, `test/team.ts`), never a shipped one: a
  person's factories get no workflow or agent from the package.
- **The api reads `agent-orchestrator`, `agent-orchestrator/run` and `agent-orchestrator/workflow`**, its tests with
  `await import`: the api's typecheck fails on a name a subpath no longer exports, so before moving a name out of `run.ts` or
  `workflow.ts`, re-export from `run.ts` what the api reads there.

## Refusals

- **A new refusal chooses its kind, never a status**: the api reads the kind off `agent-orchestrator` and answers it by one
  map (`refusedAs` and `statusOf` in `apps/api/src/objects/refused.ts`), its status the one its `objects` error class declares; a
  plain `Error` there is a 500.

## Runs, phases and asks

- **The runtime's words stop here**: the orchestrator translates a runtime phase into its own status (`harnessBlocked`, `waitingOf`,
  `blockedWord`, `phaseOfView`), and the listing reads a session's block off the run's one read (`sessionBlocked`, `RunRead`), and the api and the board read only the orchestrator's words: the board compares no
  `needs-human` (`apps/web/test/structure.test.ts` refuses one). A new runtime phase is translated in `listing` and
  `phaseOfView`; put a new word beside a phase (`waitingOf`), never into it.
- **A new step status is `working` on the board until `stepState` knows it**.
- **A new step status is a state of the step machine, and its moves are edges a walk takes** (`src/step-machine/step-machine.ts`): a word
  with no state fails the typecheck, and a move `stepStatus` makes that no edge draws, or an edge no walk takes, fails
  `src/step-machine/step-machine.test.ts`; add the walk and the edge, then regenerate the README's `diagram:step` block.
- **A revision answered for a kind nobody has resolved has no ledger entry, and the ledger's last entry is not what the files hold**:
  compare against a fresh resolve (`driftNow`, which numbers without a write), by digest, never against the ledger's top, or an edit
  reads as no drift and a reverted one as behind.
- **A run's labels are a person's file, `runs/<id>.labels`, composed on read and never written into the record** (`src/record/files.store.ts`): `runs.create` drops them, so a start writes them with `runs.labels.put` after it, and a test plants them the same way.
- **A person's fact that stops a run's asks is read by `assess`**, not only by the verbs and the tick; a line that offers a verb says that
  verb's refusal itself (each producer reads `run.pruned`).
- **A level-triggered ask cannot simply be deleted once acted on**: the verb it would let through refuses the state the deletion makes.
- **A fake closeout is flat, as a harness writes it** (`parseCloseout` nests fields under `output`); one written by hand carries every
  field its agent's `output:` schema requires.
- **`wf decide` of a landed run prints no step's closeout**: a test of a step's artifact lines reads a run still awaiting a decision.
- **A seeded finished step with a worktree on disk owes a hand-off until its record says `handedOff`** (`handOffOwed`).
- **A run is read and written through the Run door (`RunDoor`, `src/runs/runs.store.ts`), a `Context.Reference` whose default is
  the files**: a test that only needs a run to exist gives its programs one `runDoorMemory()` (`src/runs/memory.store.ts`, imported
  by path, after the file sets `WF_ROOT`) and plants the run through it; code that reads the door at once (`runsAtOnce`) reads
  the files whatever door a program was given, so a test whose verb reaches it stays on files. A write breaking the model's `Run` is
  refused `Invalid`: build a fixture's task ids with `stepTaskId`. A run from a card is refused `Conflict` while another run from it
  stands: the files hold it by an exclusive claim, `<root>/started/<card>.json`, removed with the run that it names (`runs.forget`),
  and taken over where its run has no record. A test that removes a run's files by hand removes its claim too, as the e2e's
  `takeBackRuns` does.
- **A factory is read and written through the Factory door (`FactoryDoor`, `src/factory/door/factories.store.ts`), whose default is rooted**:
  it reads the files at the `StoreRoot` a program is given, and is refused `Invalid` where none was, so a handler that yields it is run
  with `StoreRoot` given where its program is composed (`storeConfigLayer`). A test that only needs a factory to exist gives its program one
  `factoryDoorMemory()` (`src/factory/door/memory.store.ts`) and plants the factory through it (`aFactory`, `test/factory-walks.ts`); no file
  of `src` but the door's calls the stores it is over (`src/factory/door/factories.store.test.ts`, with no baseline); a synchronous caller
  names its root (`doorAtOnce`). A change of a factory's wiring is judged by `wiringRefusal` (`src/factory/wiring/wiring.ts`), whose contract a new rule of the wiring
  is a law of, not a row of a test.
- **A card is read and written through the Card door (`CardDoor`, `src/cards/cards.store.ts`), rooted as the Factory door is**: the
  inbox's verbs are programs that yield it, so a test runs one with its root given (`Effect.provideService(program, StoreRoot, root)`;
  `Effect.runSync` throws the refusal itself), or gives it `cardDoorMemory()` (`src/cards/memory.store.ts`) and files the card through
  it (`aCard`, `test/card-walks.ts`). A verb left unyielded still typechecks and does nothing: run each one. No file of `src` but the
  door's calls `cardFiles` (`src/cards/cards.store.test.ts`).
- **A workflow is read and written through the Workflow door (`WorkflowDoor`, `src/workflows/workflows.store.ts`), rooted as the
  Factory door is**, and addressed by a `WorkflowDir` minted where a folder is resolved (`workflowFolder`, `workflowDirAt`), never
  branded from a plain string with `WorkflowDir.read` outside the model and a stored record. A test that only needs a workflow to exist
  gives its program one `workflowDoorMemory()` (`src/workflows/memory.store.ts`) and writes it through the door (`aWorkflow`,
  `test/workflow-walks.ts`); no file of `src` calls the folder's stores, which read the disk whatever door was given
  (`src/workflows/workflows.store.test.ts` refuses one). A
  run's steps are a program (`stepsOf`, `src/steps/steps.verb.ts`): a frozen record's need no door and no root, and an unfrozen one's
  folder is read through the door at the program's `StoreRoot`, refused `UnloadedFolder` where it does not load. A
  write's version is judged by `workflowVersionRefusal` (`src/folder/folder.ts`), whose contract a new rule of the version is a law of.
  The door's read and write find a workflow's agents and skills through the Agent and Skill doors, so a program given
  `agentDoorMemory()` and a store's root reads a files workflow's agents from the memory; `workflowDoorMemory(defs?)` takes the agent
  and skill doors it reads through (`doorFrom`, `test/door-walks.ts`), and given none yields the program's, rooted. The version
  (`workflowVersion`, a program) finds them through the same doors, an agent's skills counted as found beside the workflow
  (`AgentAt.skills`), and so do the pass's revisions (`passRevisions`, a `Cache` per read) and the start: a test that runs a start,
  a pin or a version gives it `StoreRoot` or the doors' memory. Its digest is the files' reader's but in two cases, each pinned run
  reading as drifted once: an `agent:` name `AgentName` refuses reads as missing, and an added skill whose `SKILL.md` is no regular
  file as null.
- **An agent and a skill are read and written through the Agent and Skill doors (`AgentDoor`, `src/agents/agent-door.store.ts`;
  `SkillDoor`, `src/skills/skill-door.store.ts`), rooted as the Factory door is**: a handler that yields one is given `StoreRoot` where its program is composed, and a
  test that only needs an agent or a skill to exist gives its program `agentDoorMemory()` or `skillDoorMemory()` (`anAgent`,
  `test/agent-walks.ts`; `aSkill`, `test/skill-walks.ts`). No file of `src` calls their stores, which read the disk whatever door was
  given (`src/agents/agent-door.store.test.ts` refuses one). A new rule of which root wins is a law of `contracts/lookup.contract.ts`, and of a definition's version a
  law of `contracts/definition-version.contract.ts`, not a row of a test.
- **A template is read and written through the Template door (`TemplateDoor`, `src/template/door/templates.store.ts`), whose default is
  rooted** as the Factory door's: a program that yields it — the template verbs, `nemia factory apply`, diff, upgrade and resolve, the
  factory controller (`reconcileFactory`) — is given `StoreRoot`, and a test runs it with one
  (`test/templated.ts`) or gives `templateDoorMemory()` (`src/template/door/memory.store.ts`). The door checks a tree's name and paths
  (`TemplateTreeWrite`), never the template's lint: a verb that must refuse a template that does not pass checks it first (`checkedTree`).
  A `--template <name>` and a factory's recorded name are resolved by `templatePlace` at `BuiltinTemplates`, before the door: a test
  gives a scratch folder of its own (`withBuiltins`, `test/templated.ts`), never `packages/templates`.
- **A subscription and its delivery are read and written through the Subscription door (`SubscriptionDoor`,
  `src/subscription/subscription.store.ts`), the revision ledger through the Ledger door (`LedgerDoor`, `src/revisions/revisions.store.ts`)
  and the feed through the Feed door (`FeedDoor`, `src/feed/feed.store.ts`), each rooted as the Factory door is**: a program that yields
  one is given `StoreRoot`, or a test gives it `subscriptionDoorMemory()`, `ledgerDoorMemory()` or `feedDoorMemory()` (each a
  `memory.store.ts` beside its store). A synchronous caller still on the module spellings (`listSubscriptions`, `ledgerOf`, `readFeed`, …)
  reads the module's root whatever door was given, counted per door in `test/ledger-door.baseline.ts` and `test/feed-door.baseline.ts`;
  none is left on the subscriptions' (`src/subscription/subscription.store.test.ts` refuses one). The feed's fold memo is `emitFeed`'s, never the layer's.
- **A file written back is decoded by a `StructWithRest`**: a `Struct` strips the keys it does not name, and a record written by a newer
  tick keeps them. `Struct({})` accepts an array; a struct with a key refuses one. A frozen step is decoded by `FrozenStepSchema`
  (`folder/folder.store.ts`), a field per `StepKey`: a key added without one fails the typecheck.

## The feed

- **Build a line's fields, never spread another's**: the fold keys on `involved`, not on `run`/`step`, so a hand-built fixture that
  spreads a run's line and adds a `step` keeps the run's `involved` and folds under the run.
- **A one-shot is counted off the feed's own lines**, under its reason, what it is about, its try and its note (`onceKey`, `oncePast`),
  never remembered and never a thing's last word: counting by place cannot tell two offers of one fact from two facts. A run's new
  one-shot is offered from `word-feed.verb.ts`, off what the pass already read, the store's from `storeOnce` (`feed.ts`), off the pause
  the pass read (`readPause`, handed to `emitFeed` as `pause`), and the note is what tells one occurrence from another.

## The tick

- **A command that lives as long as its process is an Effect run by `runMain`** (`src/daemon/up.verb.ts`, run by `wf up` and the api's
  `src/main.ts`): what it holds is taken with `acquireRelease` in its scope, never let go in a signal handler, and a signal exits 128 +
  its number once the scope is closed.
- **A controller is a program over `EngineService`**, run by its caller with `runWith` (`runtime-client.ts`), and reads the engine with
  `asked`. `await e.view(id)` compiles and answers the Effect itself, unrun: only `typescript/await-thenable` in `npm run lint`
  refuses it.
- **Admission is the runtime's**: the orchestrator files a task `queued` with its `priority` (`stepMomentum`, `MOMENTUM`), and `engine(env)`
  hands the runtime the ceiling and the pools. A new engine verb is a row of `ENGINE_VERBS`, its phase and what it changes of a task
  (`src/engine-verbs/engine-verbs.verb.ts`), which the typecheck demands; an admitted task starts on the runtime's next pass.
- **Every test file that ticks a store sets `WF_VERIFY_REST=1`**, and a new input of a finished run's pass goes into `restStamps` (and
  into the informer's read of it, `informerRead` in `src/rest/informer.verb.ts`, whose `informedOf` decides): what the stamps miss is
  missed for good. The informer beside it (`src/rest/`) holds every
  run's judgement for a daemon, filled by the pass and read by the api's run object, list and sub-resources, checked against the same
  inputs before it is served and rebuilt on a restart: a new input of a run's judgement goes into what it checks too. Beside a run's
  judgement it keeps the RunList's object built on it (`keepObject`), served exactly while that judgement is (`keptObject`); the
  object's parts no stamp watches — `onDisk`, a folder run's step files, the workflow folder's `warning` — are read on every request
  (`diskPartsOf`, `src/object/run.verb.ts`). A new input of a run's object goes into what the informer checks, or into those parts.
- **A test that starts a daemon and reads a finished run's worktree afterwards sets `WF_KEEP_WORKTREES=1`**: the daemon frees a finished
  run's worktrees on a sweep beside its passes (`freeOnce`, `src/forget/prune/free.verb.ts`).
- **The daemon measures the store's disk on a sweep beside its passes** (`diskOnce`, `src/disk/disk.verb.ts`): a test daemon walks its
  scratch store once, a pass is handed the reading and never the walk, and a test of the sweep plants sizes on the stand-in
  (`engine().keeps`).
- **A duration a program decides on is never on `Date`**: the daemon's silence is `elapsedMs` over `instantNow()`, a place verb's grace
  on `performance.now()`.
- **A controller's rest or deadline is steered with `steeredClock()` (`test/steered.ts`), at its shipped duration written as a literal**:
  wait for the rest asked (`asked`, on `bell`) before `adjust`, a millisecond short, then the millisecond. A wall decision keeps its
  `now` on `Date`.
- **A pass on a copy of the store acts on the real repositories** its records name: measure with a fixture store of scratch repositories,
  or a fake runtime whose tasks are all `pending`.
- **A step on a remote agent is filed with its local fields left out, never `undefined`** (`localFields`).
- **A landed ending keeps no pictures of the merged tree but those its closeout names** (`dropLandedPictures`).

## Checks and worktrees

- **A `check:` tells the run's check from a hand run by `WF_BASE_REF`**, never `WF_STEP`: the ending's check runs on the merged tree with
  none.
- **A check's stdout and stderr are the runtime's, each kept whole**, read through the engine's `output` (`checkStreams` in
  `views/views.verb.ts`): `reported` reads the whole stdout, a person the tail of each; the engine's `logs` is a tail, read only for
  a check filed before the runtime kept streams.
- **Commit the lockfile with a new dependency**, and run `npm install` on main after merging one by hand: a worktree's lockfile that
  differs from main's costs an `npm ci`.
- **A test that spawns a `wf` child waits on it with `nodeChild`** (`test/child.ts`): for what it says or writes, or its exit, which fails
  the wait at once with its output — never under a deadline, which the CLI's import alone can pass on a loaded machine.
- **A test that lets a deliverer's `say` through first waits until each line it expects gathered is handed on by the reader**
  (`FEED_FOLLOW_LINES`), not only taken off the hub.

## Claude Code

- **Claude Code's facts as the steps meet it, a step's fence among them, are the runtime's**: `packages/agent-runtime/CLAUDE.md`,
  *Claude Code, as a harness*.
