# Design, 2026-09-29: Git out of the packages

> **Status (2026-10-23): landed.** The git place's skill came first (`80f653573`, 2026-09-29); its cards followed on 2026-10-06,
> among them D (`abda36a04`), F (`3aae49afb`), C1b (`6fcfde23b`), I1 (`0b227e441`) and I2 (`e3592abe8`). The banner below says what
> changed since: the seam became a service on 2026-10-11, and the freeze of a place was given up.

A design note for the owner to approve. It changes no code. It rests on the owner's words of 2026-09-29 and on the source as it is at
`8b6e1077` (line numbers are that commit's). Where it reads a file that a feature-folder slice is about to move, it names today's path.

> **Since 2026-10-11 the seam is a service, not a script.** What this note calls a place skill's scripts (`scripts/<verb>.ts`, run as one
> Node process a question, declared by `place.json`, frozen with the run) is now code beside the skill: `PlaceService`
> (`packages/agent-orchestrator/src/place/place.store.ts`) is what `src` asks, required and with no default, and the git place
> (`packages/agent-orchestrator/place/git/place.ts`) answers each verb by running git itself, given as `gitPlaceLayer` by whoever
> composes a program. The rule below stands as written: no `src` names git (`test/git-calls.test.ts`, which also refuses a script
> started from a `src`), and the place's code stays outside `src`, behind one door (`placeBreaks` in `test/boundary.test.ts`). The
> contract's requests, answers, refusals and deadlines are unchanged; `place.json`, the freeze of a place and `placeSkill` on a new
> record are gone, and sections *How a verb is run*, *`place.json`* and *Freezing* describe what was.
>
> **Two things are given up on purpose.** *A team's own place as a folder of scripts*: the card this note waits for twice, "the card
> that lets a team supply its own place", will not come in that form. A team cannot bring a place as a skill's scripts; another place
> is code that implements `PlaceService`, given as a layer where a program is composed. *A place frozen per run*: no copy under
> `WF_ROOT/places/`, no version compared, no `nemia refreeze`. A run in flight is answered by the place of the process that asks,
> the release installed, and a change to the place reaches it at the next restart.

## The rule

The owner, 2026-09-29: "we should not take a dependency on Git because it is related to the user environment … all the Git ceremonial can
be done through prose, like using skills. Git could be a simple skill or it can be diluted into prose … everything that we do here related
to Git needs to end up in the UI … have the data that we have from Git go through a contract. For example when in the UI we display a
diff, we are not running `git diff` in the code." And: "I don't want to be too religious about 'prose is not a constraint' … sometimes
prose can do the job as well."

So: **the packages and apps know workspaces, commands and contracts, never Git.**

- It binds `packages/*/src` and `apps/*/src`. It does not bind a workflow folder: a `check:` line is the workflow's, and
  `dev-planned/ship.md`'s may call `git diff` as it does today. It does not bind tests that build a scratch repository to prove a skill.
- A repository, a base, a named line of work and a result stay words the code may hold (`repo`, `baseRef`, `branch` on the record keep
  their names). They are opaque strings a place hands the code. The code never makes them, reads them off disk, or asks git about them.
- **A skill** here is Claude Code's Agent Skill: a folder with a `SKILL.md` (frontmatter and prose) and whatever sits beside it, such as a
  `scripts/` folder. The repository already finds, versions and freezes skills (`lookupRoots`, `skillsFor` and `skillVersion` in
  `workflow-store.ts`; `writeAgentFiles` in `agents/agents.store.ts`). This design adds one skill, `git`, and one use of a skill's folder:
  its scripts are the machinery's measurements.

## In one paragraph

A run's steps work in a **place**. The code has one place of its own, `folder`, which needs no version control and runs no command. Every
other place is a **skill** the workflow names (`place: git`). The skill carries three things in one folder: the prose agents load (commit
as you go, resolve a fan-in, stage a landing), a `place.json` the machinery reads (the verbs it answers, the commands a landing session is
denied, the words a person is shown), and one script per verb. At `wf start` the skill is copied whole into the store under its version, and
the version goes on the record, as a workflow's `check:` is frozen today. From then on, the orchestrator runs only that frozen copy:
`node <copy>/scripts/<verb>.ts`, one JSON request in, one JSON answer out, decoded by Effect Schema in a store file. What the board
shows of a diff, a trial merge or a branch's standing is a decoded answer the tick wrote down, never the output of a git command our code
ran. The guarantees stay machinery: a check on the merged tree before anything lands, a run that waits on another until it has shipped, a
step that never works in the person's checkout. The facts they read now come through the contract.

## Measured: every use of git today

The `git` executable is spawned by 14 calls in 5 files. Behind them, the two helpers `git` and `gitSays` (`worktree.ts:321`, `:453`) are
called from about 40 places. Two more sites read git's files off disk with no process. The table groups them by what they answer.

| where (today) | what it answers | becomes |
|---|---|---|
| `worktree.ts:335` `makeWorkspace` (`rev-parse HEAD`, `--abbrev-ref HEAD`) | the run's base commit and base branch, at `wf start` | `open` |
| `worktree.ts:362` `workspaceFor`: `worktree add -b` (`:388`), `merge --no-edit` of each fan-in parent (`:394`) | a step's worktree, cut from its parent or the base; a fan-in's merges and whether they conflicted | `make` |
| `worktree.ts:126` `ignored` (`check-ignore`), used by `includeFiles` (`:279`) | which `.worktreeinclude` paths git ignores, to copy them into the worktree | `make` |
| `worktree.ts:423` `handOff` (`status --porcelain`, `add -A`, `commit`, `rev-parse`) | commit what a finished step left, idempotently | `handoff` |
| `worktree.ts:465` `mergeHeadFile`, `:480` `mergeInProgress` (reads `.git`, `MERGE_HEAD` off disk) | whether a merge is staged in the checkout, with no process | `status` |
| `worktree.ts:492` `mergeState` (`merge-base --is-ancestor`, `rev-parse`, `ls-files --unmerged`) | whose merge is staged, conflicted paths, result branches left out, HEAD (`MergeState`, `run.ts:778`) | `status` |
| `worktree.ts:514` `commitMerge`, `:524` `abortMerge` | land the ending's staged merge, or take it back | `land` |
| `branches.ts:43` `askGit`, `:34` `isShipped` (`merge-base --is-ancestor`) | whether a result branch is on its base, and whether it holds work past the run's base | `standing` |
| `branches.ts:122` `oneByOne`, `:140` `branchReader` (`rev-parse --verify`, `rev-list --count`, `for-each-ref` with `ahead-behind`) | has git the branch; commits ahead of the base; the batched reader for `wf ls` and the board | `standing` |
| `branches.ts:265` `parentRecord`, `:284` `refsOf`, `:405` `headsOf` | a parent run's gone branches (`--after`); result tips (`tipsSeen`, `tick.ts:923`); every head, for the memo of runs at rest (`tick.ts:1424`, the api's `runs/resting.ts:85`) | `standing` |
| ~~`branches.ts:305` `artifacts`, `:317` `readArtifact`, `:326` `diffStat`, `:339` `touchedBy`, `:354` `workspacesOf`, `:368` `sensitiveDiff`~~ moved to the place's `report` verb (`changesOf`), read live (open question 2) | files added, one file's text, the shortstat, the numstat behind `radius`, the base's npm workspaces, the diff of check-affecting files | `report` |
| ~~`artifacts.ts:62` `workspaceArtifact` (`cat-file -t branch:path`)~~ moved to `report`'s `present` (`presentOn`), read live | whether a declared artifact is on the step's branch when its workspace no longer has it | `report` |
| `forget.ts:163`, `:288` (`worktree list --porcelain`, parsed by `parseWorktrees`, `run.ts:3576`); `:174-176` (`status`, `for-each-ref --contains`); `:204` (`for-each-ref refs/heads/wf/<id>/`); `:211` (`merge-base --is-ancestor`) | what the run left on disk and in the repository, and what of it is safe to remove | `inventory` |
| `forget.ts:191`, `:383` (`worktree remove`), `:197` (`worktree prune`), `:220` (`branch -D`) | remove it (`wf rm`, `wf prune`) | `remove` |
| `tick.ts:827` `WF_BASE_REF`; `run.ts:768` `LANDING_DENIED` (`Bash(git commit:*)`, `Bash(git merge --continue:*)`) | the base a round's check diffs against; what a landing session is denied | `open`'s answer; `place.json` |
| `run.ts:5037`, `:5078`, `:5100`; `check/check.ts:239-241`; `run.ts:3799-3808`, `:3950-3960`, `:4014`; `cli.ts:1580`, `:1600-1601`; `keys/keys.ts` (`workspaceOf`'s codex refusal) | git commands printed to agents and people: how to read the diff, resolve a conflict, stage a landing, unlock a worktree, ship or drop a branch | `place.json` `say`, and the skill's prose |
| `meter/meter.ts:16`, `meter/tally.store.ts:195` | the pass's `git` phase, counted by the command's name | the `place` phase |
| `authoring.ts:152`, `:628` (`.git` beside `workflows/`) | whether a folder is a repository's, for the board's lookup of workflows, agents and skills | open question 5 |
| ~~api `decide/merge.ts:21` `mergesOnto` (`merge-tree --write-tree`)~~ moved to the place's `trial` verb (`trialMerges`), read live (open question 2) | the board's trial merge: does a result still merge onto the base as it is now | `report` |
| api `decide/decision.ts:333-359` (~~`touchedBy`, `sensitiveDiff`, `diffStat`~~ read live through `changesOf`, `branchStandings`), `:246`, `:253-254` (`git -C … diff`, `merge --no-ff`, `branch -D`) | the decision page's diff, standings and offered commands | `report`, read live; `place.json` `say` |
| runtime `harness/codex/codex.ts:41-53` `repositoryOf` (`rev-parse --git-common-dir`), used at `:202-204` | the repository a Codex worktree belongs to, to extend the operator's trust to it | a task field (below) |

A count of spawn sites understates the dependency. The api spawns git once, but it reaches git through the package in six more files
(`decide/decision.ts`, `detail/detail.ts`, `runs/judged.ts`, `runs/resting.ts`, `runs/runs.ts`, and `branchReader` through them). The web
spawns nothing and mirrors the vocabulary: `PlaceKind = 'git' | 'folder'` (`lib/api/runs.ts:9`), `run.place === 'git'`
(`lib/prune.ts:44`), the `git` pass phase (`lib/pass.ts:9`, `lib/api/ceilings.ts:7`), and `ToDecide`'s `kind: 'git'`
(`lib/api/judged.ts:22`, from `run.ts:1073`).

What stays, and why:

- The runtime's `worktree` task field (`harness/claude/code.ts:82`, `harness/codex/codex.ts:130`) hands `--worktree` to the harness,
  which cuts and removes its own. The runtime spawns no git for it and knows nothing of what the harness does.
- `workspace/workspace.ts:249` refuses to copy a `.git` segment. It moves into `make` with `includeFiles`.
- `apps/api/src/workflows/workflows.ts:359` lists no hidden folder. `.git` is named in its JSDoc as an example; the rule is the dot.
- `provisionDeps` (`worktree.ts:203`) and the pure plan behind it (`workspace/workspace.ts`) are npm's, not git's. They stay in the
  package and run on the directory `make` answers (open question 4).

## Three starting points, challenged

### 1. The harness's own worktree does not do the job

Claude Code and Codex both take `--worktree`, and the runtime already passes it (`code.ts:82`, `codex.ts:130`). The orchestrator cannot
use it for a step's place:

- **The place must exist, and be known, before the step is filed.** `workspaceFor` runs before `e.file` (`tick.ts:855`). Its answer is
  the task's `cwd`, the brief's *Where to look*, and the step record's `workspace`. The check is another task, on the `check` harness, filed
  with `cwd: workspace` and `WF_WORKSPACE` (`tick.ts:812-835`). A harness-cut worktree has a path the orchestrator learns only after
  the session starts, and the `check` harness has no worktree of its own.
- **A fan-in is a merge of parents.** `make` cuts from the first parent's branch and merges the others (`worktree.ts:390-398`). Neither
  harness takes a starting branch or merges a second parent.
- **A result outlives the session.** The hand-off commits what a step left after its session ended (`tick.ts:507-512`), and `inherit`
  resumes a session in the directory its parent ran in. A harness may remove the worktree it cut when the session is released
  (`harness/seam.ts:147`).
- **Two harnesses, two spellings.** `makeWorkspace`'s JSDoc (`worktree.ts:325-334`) already says why the workflow owns the workspace.
- **A folder team has no repository**, and `--worktree` needs one.

So `make` is the orchestrator running the place's script, before the step is filed. It is never an agent's job and never the harness's.

### 2. What a step changed is measured, not reported

The brief's example contracts were closeout fields an agent fills in (`changes`, `mergeCheck`, `landed`). A closeout cannot carry them:

- **It is the step's own account.** `radius`'s *check-affecting* list and `sensitiveDiff` exist so a person sees when a step edited what
  judges it: the tests, the lint config, the check itself. A step reporting that is a step marking its own homework. The frozen
  `workflow` on the record exists for the same reason (`run.ts`, `RunBase.workflow`).
- **The closeout is read forgivingly on purpose.** `parseCloseout` (`closeout/closeout.ts:102`) turns odd answers into defaults so that a
  run never becomes unreadable. `declaredOutput` (`:133`) checks that a field is present, not what it holds.

So `Changes` comes from the place's `report` script, run when a decision is read, decoded strictly. `landed` is the tick's own record of what `land`
answered. The closeout keeps what only the agent knows: its summary, its artifacts, and a landing's commit message.

### 3. Strict decoding is new, and it has a place

Today a git failure often reads as nothing. `diffStat` answers `''` (`branches.ts:326-332`), `artifacts` answers `[]` (`:305-314`), and
`workspacesOf` answers `[]`. Under the contract, **an answer that is not there is not an empty answer.**

- Every answer is decoded by an Effect Schema struct in `src/place/place.store.ts`. The package's `CLAUDE.md` puts what the store reads
  back in a store file, and `boundary.test.ts` refuses Effect in a pure file.
- A missing field, or one of the wrong type, fails the decode. Unknown fields are ignored, so a skill may say more than the code reads.
- A script that exits non-zero, times out, or prints what does not decode has given **no answer**. The place is *unread* for that verb.
  An unread place is never a verdict, the same as a check that did not finish: the tick writes it down, shows it, and asks again on the
  next pass (level-triggered).
- A place may also **refuse**: `{ "refused": "<words>" }`, exit 0. For example, `open` on a directory that is no repository, or `land`
  when a hook refused the commit. A refusal is an answer, and its words reach the person whole.

## The seam

`Place` (`record/places.store.ts:16`) is `{ make, handOff }` today, with `folderPlace` as its one implementation. It grows into the verbs
below. `folderPlace` stays in code and answers each verb a folder has, which is most of them with nothing. `skillPlace(frozenDir)`, in
`src/place/place.store.ts`, answers each by running the frozen script.

The code calls a verb only where no plan of its own answers. `inherit`, `workspace: main` and `--no-worktree` (`isolate: false`) are
worked out in code today with no git: the parent's workspace, the checkout, the checkout (`worktree.ts:369-379`). They stay that way.

| verb | when the code calls it | request | answer (decoded) | replaces |
|---|---|---|---|---|
| `open` | `wf start`, once | `{ root }`: the directory `--repo` names | `Opened { repo, baseRef, branch }` | `makeWorkspace` |
| `make` | before filing a `fork` or `merge` step of an isolated run | `{ repo, at, name, from, also[] }`: `at` is `WF_ROOT/worktrees/<id>/<step>`, `name` is `wf/<id>/<step>`, `from` a branch or the base | `Made { workspace, branch, conflicts[], notes[] }` | `workspaceFor`'s git half, `includeFiles` |
| `handoff` | each pass a finished step's hand-off is due, and before `wf rm` removes a workspace | `{ workspace, step, why }` | `HandedOff { commit: string \| null }` | `handOff` |
| `report` | live, each time a decision is read: `nemia decide`, the api's decision, a declared file's branch (below) | `{ repo, baseRef, onto, branches[], diffOf[], present[], atBase[] }` | `Changes` (below) | `touchedBy`, `diffStat`, `artifacts`, `readArtifact`, `sensitiveDiff`, `workspacesOf`, `artifacts.ts:62` |
| `standing` | by the tick, each pass: one call per repository and frozen copy, over every result branch the store's records name there; written to a snapshot the api and `wf ls` read (below) | `{ repo, branches: [{ branch, tip?, baseRef }], base }` | `Standing { heads, branches: [{ branch, tip, onBase, pastBase, ahead }] }` | `isShipped`, `branchReader`, `refsOf`, `headsOf`, `parentRecord`'s reads |
| `status` | only while an ending that lands on its check holds the checkout (`landingOpen`) | `{ checkout, tips }` | `Status { merging, conflicted, missing[], head? }` | `mergeInProgress`, `mergeState` |
| `land` | when `landingDue` says `commit` or `abort` | `{ checkout, act: 'commit', message }` or `{ checkout, act: 'abort' }` | `Landed { commit }` or `{ aborted: true }` | `commitMerge`, `abortMerge` |
| `inventory` | `wf rm`, `wf prune` | `{ repo, under, prefix }`: the run's worktrees root and branch prefix | `Inventory { workspaces[], branches[] }` | the listings in `forget.ts` |
| `remove` | `wf rm`, `wf prune`, after the pure refusals pass | `{ repo, workspaces[], branches[] }` | `Removed { removed[], left[], deleted[], kept[] }` | `worktree remove`, `worktree prune`, `branch -D` |

The code still decides; the place only reports facts and acts when told. `landingDue` stays pure over `Status`. `shippedBy`
(`branches.ts:43-58`) becomes pure over `Standing`. `heldWorktree`, `branchFates` and `forgetRefusal` stay pure over `Inventory`.
`parseWorktrees` moves into the skill, since it parses git's own output format.

The code keeps naming the directory (`at`) and the line of work (`name`). The layout of `WF_ROOT/worktrees` is the store's: `wf prune`
counts its bytes and `wf rm` refuses a stray under it. And a worktree cut before the migration must be found where it is.

### How a verb is run

- `node <frozen>/scripts/<verb>.ts`, `cwd` the frozen copy, with `stdio: ['pipe', 'pipe', 'pipe']`. The request is one JSON document on
  stdin, always carrying `v: 1`, the contract's version. The environment is the daemon's, like a check's.
- **Exit 0 with one JSON document on stdout is an answer.** It is either the verb's struct or `{ refused }`. Stderr is kept for the
  person when the verb is unread, and is never parsed.
- **Anything else is unread.** That covers a non-zero exit, a signal, the deadline passing (2 minutes; `make` gets 10, since a fan-in
  merge in a large repository is slow), or output that does not decode. The tick records `unread: { verb, said, at }` on the run. The
  record is the tick's to write, so there is one writer. The note goes to the daemon's log, and the board shows it on the run like a
  check that did not finish. The next good answer of that verb clears it.
- **The scripts are standalone.** A frozen copy has no `node_modules`, and a skill cannot import a package. So each script uses node's
  built-ins alone, `node:child_process` to run git included. It is `.ts`, run with node's type stripping, as the repository's own tests are.
- **The machinery trusts only the frozen copy.** An agent that lists `git` in its `skills:` gets the same scripts in its plugin copy and
  may run `report` to see its own diff. What the tick records comes from the run's frozen copy (*Freezing*).
- **A batched verb is batched per copy.** `standing` asks about many runs at once. Runs on one repository whose records name the same
  copy share one call. Runs that froze different versions get one call each, and each run is judged by its own copy's answer, the
  heads that stamp its memo at rest included. In practice every run on a machine froze the same version, and the batch is one call.

### `place.json`

What the skill declares to the machinery. It is decoded strictly at `wf start`, and a copy that does not decode refuses the start.

```json
{
  "v": 1,
  "verbs": ["open", "make", "handoff", "report", "standing", "status", "land", "inventory", "remove"],
  "denyWhileLanding": ["Bash(git commit:*)", "Bash(git merge --continue:*)"],
  "say": {
    "look": ["git diff {baseRef}", "git status"],
    "readResult": "git -C {repo} diff {baseRef}...{branch}",
    "ship": "git -C {repo} merge --no-ff {branch}",
    "drop": "git -C {repo} branch -D {branches}",
    "conflicts": "…",
    "unlock": "git -C {repo} worktree unlock {path}"
  }
}
```

- **`verbs`** is what the place can do. A workflow that needs a verb its place lacks is refused at `wf start`, naming the verb. An
  ending with `workspace: main` and a `check:` needs `status` and `land`. A fork or fan-in in an isolated run needs `make`. This
  capability check replaces today's git-shaped refusals.
- **`denyWhileLanding`** replaces `LANDING_DENIED` (`run.ts:768`), read by `filedDenies` from the frozen copy. `workspaceOf`'s
  refusal of a codex landing (`keys/keys.ts`) keeps its reason, since codex takes no deny list. It names the place's denies instead of
  `git commit`.
- **`say`** holds every sentence the code prints that names a version-control command. The code fills the placeholders and quotes the
  result verbatim. A placeholder the code does not know is refused at `wf start`. The templates reproduce today's words exactly, so
  `git-runs-before.json` pins the move (see the migration).

## How a workflow names its place

A new step key, **`place:`**. It says `folder` (the place in code) or the name of a skill that `lookupRoots` finds. Every step of a
workflow gives the same value, the rule `workspace: folder` follows today (`isFolderTeam`, `workflow/validate.ts:11`).

- **There is no default.** A step with no `place:` is refused, naming both fixes: `place: git` to work on a repository, `place: folder`
  to work in folders the run makes. Today the default is git (`placeOf`, `run.ts:86`), so the code knows git by default. Making `folder`
  the default instead would silently turn a person's own git workflow into a folder run. Refusing with the fix is permanent and costs a
  folder team nothing: its steps already say `workspace: folder` on every line.
- **`workspace: folder`** becomes a former spelling of `place: folder`. It is still read, and `formerKeyLines` prints the rewrite, as it
  does for other renamed keys (`workflow-store.ts:155`). `workspace:` keeps `main`, the plan kind for an ending in the checkout.
- **`--repo`**, `workspace: main` and `--no-worktree` with `place: folder` stay refused as today (`start.ts:201-208`), in the same words.
- The key reaches every reader of a step: `FrozenStepSchema` (a field per `StepKey`), the api's builder `KINDS` (`workflows/builder.ts:72`),
  `WorkflowStepSpec` and `specOf` (`workflows/workflows.ts`), and the web's `lib/builder.ts` `UNSET`.

## Freezing

- At `wf start`, the skill `place:` names is found by `skillsFor(workflowDir, placesOf(repo))`, the same lookup an agent's skills use.
  Its `version` is `skillVersion`'s digest. Start always freezes under a fresh name: it copies the skill whole, links dereferenced, to
  `WF_ROOT/places/.<skill>@<version>.<pid>.<random>/`, decodes `place.json` and runs `open` from that copy, writes the record, and only
  then renames the copy onto `WF_ROOT/places/<skill>@<version>/`. If a copy is already under that name, the rename fails and the fresh
  one is removed: the same name holds the same bytes, whoever wrote it, and a folder under it is always whole. A start refused before
  the record is written removes its fresh copy and leaves no record behind, as a failed `writeAgentFiles` does (`start.ts:268-279`).
- **The record keeps `place` as it is.** Absent, it is a repository run; `{ kind: 'folder' }`, a folder run. `GitRecordSchema`
  (`record/record.store.ts:90-100`) requires `place` absent, and `placeOf` and `isGitRun` (`run.ts:86-89`) read the kind off it, so a new
  value there would make every record unreadable and every in-flight run a folder run. The frozen skill goes in a field of its own on the
  repository record, **`placeSkill: { skill, version }`**, optional in `GitRecordSchema`. An older build reads a record carrying it
  through the schema's `Rest` and ignores it, and runs its own git code, which is what the record meant then.
- **A repository record without `placeSkill`** was started before the freeze. It is answered by the package's shipped copy of the git
  skill (`packages/agent-orchestrator/place/git/`), run where it is installed, as today's git code in `src` is: it is the
  package's own code, never a checkout's. No reader writes to such a record or freezes anything for it, so `wf ls`, the api, and an
  `--after` check of a parent the tick never passes again all have a script to run.
- `open` runs on the frozen copy. Its `Opened` fills `repo`, `baseRef` and `branch`, the fields a repository run has today.
- **After that, no pass reads the skill from where the lookup finds it.** A frozen copy whose `skillVersion` is no longer the one its
  name says stops the run's passes with a refusal (`Invalid`, exit 2). The refusal names the fix (open question 6). This is the opposite
  of `skillsAgain` (`agents/agents.store.ts:71`), which reads an agent's skill again from the lookup when its rendered folder is gone.
  That is acceptable for prose an agent reads. It is not acceptable for a command the machinery runs: "no command from a checkout". A
  copy that is not there makes the run's verbs unread for that pass, not a stop: `wf prune` may hold it aside for a moment (below). If
  it stays missing, it stays unread, and its words name `wf refreeze`.
- **A frozen copy is removed only by `wf prune`**, and only when no record in the store names it, checked again after the copy is moved.
  `wf rm` of one run leaves it. Prune lists the records, renames a copy none names aside to a fresh name, and lists the records again. A
  copy that a record now names is renamed back, or dropped if a start has put one under the name meanwhile. Any other copy is deleted.
  Prune also removes a fresh `.`-named folder whose process is gone. This leaves no gap for a start:
  - A start whose record the second listing sees gets the copy back.
  - A start whose record it misses wrote that record after the copy was set aside. So its own rename, which comes after its record,
    finds the name free and puts its copy there.
  - Either way the copy is under its name when both are done. At worst, the new run's first pass meets the moment it is aside, and reads
    as unread once.

*Deferred on 2026-10-06, at card C2*: `nemia start` resolves `place: git` to the package's own place (`SHIPPED_PLACE`), reads its
`place.json` (`readPlaceJson`), refuses a workflow whose run needs a verb it does not declare, runs `open` from it (`openPlace` in
`src/place/place.store.ts`), and records `placeSkill: { skill, version }`. No copy is made: the copy under `WF_ROOT/places/`, the
refusal of a copy whose version drifted, prune's part and `nemia refreeze` wait for the card that lets a team supply its own place
(given up on 2026-10-11, with the freeze: the note at the head). Until
then the only place is the package's code, installed as a release that never changes under a run, so `version` is recorded and not yet
compared. `placeDirOf` is the one answer to where a run's place runs from, and that card makes it answer the frozen copy.

## The contracts

Each is an Effect Schema struct in `src/place/place.store.ts`. Its type is re-exported from a pure `src/place/place.ts`, which the pure
judgements (`landingDue`, `shippedBy`, `radius`) take. **The place's script always fills them. No agent ever does.**

| contract | fields | written by, where | read by |
|---|---|---|---|
| `Opened` | `repo`, `baseRef`, `branch` | `wf start`, on the record (as today) | everything that reads a git run's record today |
| `Made` | `workspace`, `branch`, `conflicts: string[]`, `notes: string[]` | the tick, on the step's record (`workspace`, `branch`); `conflicts` and `notes` into the brief | the brief (*Where to look*, the fan-in's conflict section), the check's `cwd` |
| `HandedOff` | `commit: string \| null` | the tick's note; `wf rm`'s `handedOff` | `wf rm`'s words |
| `Changes` | `at: { baseRef, onto, tips }`; `files: [{ path, from?, status, added: int \| null, removed: int \| null }]` per branch; `diffs: { path: text }` for `diffOf`, per branch; `present: { path: 'file' \| 'directory' \| 'absent' }` per branch; `atBase: { path: text \| null }`; a branch git has not is in none of them | nobody: read live by each reader, when a decision is read (`changesOf`, `presentOn` in `branches/changes.store.ts`), and kept nowhere | `radius` (pure, from `files` and the npm workspaces it parses out of `atBase['package.json']`); `nemia decide`; the api's decision, through `changesOf` on `agent-orchestrator`; `workspaceArtifact`'s branch fallback |
| `Standing` | `heads: { branch: commit }`; `branches: [{ branch, tip: string \| null, onBase: 'yes' \| 'no' \| 'unknown', pastBase: boolean \| null, ahead: int \| null }]` | the tick, each pass, to `WF_ROOT/standing.json`: one file, one writer, each repository's answer (or its unread words) with the time it was read; `tipsSeen` writes `run.tips` as today | in the tick, from its own call: `shippedBy`, `parentOf` and `runReady` (`--after`), the memo of runs at rest. From the snapshot, running nothing: `wf ls`, and the api's list, decision page and memo of runs at rest (`runs/runs.ts`, `runs/judged.ts`, `runs/resting.ts`), through a reader the package exports on `agent-orchestrator/run` |
| `Status` | `merging: 'ours' \| 'other' \| 'none'`, `conflicted`, `missing: string[]`, `head?` | not stored | `landingDue`, `landingOpen`, `mainClaim` |
| `Landed` | `{ commit }` or `{ aborted: true }` | the tick, on the step's `landed` (as today) | `landedWords`, `wf ls`, the board |
| `Inventory` | `workspaces: [{ path, step?, branch?, head?, detached, locked?, prunable, clean: boolean \| null, onBranch }]`; `branches: [{ branch, merged }]` | not stored | `heldWorktree`, `branchFates`, `forgetRefusal`, `pruneRefusal` |
| `Removed` | `removed[]`, `left: [{ path, said }]`, `deleted[]`, `kept: [{ branch, said }]` | `wf rm`'s and `wf prune`'s answers | their words |

What the board and `wf decide` render:

- **The diff.** `Changes.files` grouped by `radius`, the counts written in our words, and the check-affecting `diffs` cut as
  `inFullLines` cuts them now (`decide/decision.ts:124-166`). `diffStat`'s git sentence ("3 files changed, …") goes: the counts read
  "3 files: +14 −1", and ", 1 binary" where there is one (`countsLine`). The api reads `report` live, when a decision is read.
- **The trial merge.** The `trial` verb, as `mergeWord` words it, read live (open question 2); `Changes` has no `merges`. `nemia
  merge` takes the base's commit from the trial's `at`, and refuses ("git cannot read <branch>") where the trial read none.
- **The offers.** `ship it`, `drop it` and `read it` are `place.json`'s `say` with the run's names filled in. `ToDecide`'s `kind: 'git'`
  (`run.ts:1073`) is renamed `kind: 'result'`. It is computed, never stored, so the api and the web change with it in one card.
- **Unread.** A report that is unread is shown as such ("what this run changed is not known: <said>"), never as no change.

## Which guarantees stay machinery, and which move to prose

| guarantee today | kept by | what changes, what is lost |
|---|---|---|
| Nothing lands on the base branch unless the run's own check passed on the merged tree | **machinery**: `landingDue`, pure over `Status`; the check's numeric exit (`refusedCheck`); `land` `commit` or `abort` | The facts come from `status`, not from a stat and three git calls. The check is the workflow's command, as today. Nothing is lost. |
| A landing session cannot commit the merge before the check | **machinery**: `filedDenies` with `denyWhileLanding` from the frozen `place.json`; a commit made anyway is recorded (`onHead`) | The deny list is the skill's data, not our literal. It was already a prefix and not a sandbox, and the brief and the skill say it too. |
| A run waits on another (`--after`) until that one has shipped | **machinery**: `runReady` and `parentOf` over `shippedBy`, pure over `Standing`; the tips `tipsSeen` recorded | An unread `standing` reads as not shipped, so the run waits, and the wait shows why. Before, git's silence read the same way, but nothing showed it. |
| A step never works in the person's checkout unless it says `workspace: main` | **machinery**: `workspacePlan` decides; `make` is handed `at`, and a `Made.workspace` whose realpath is not `at`'s is refused as unread | New: the code checks the place's answer, where today it trusted its own `git worktree add`. |
| Only one run's ending holds the checkout | **machinery**: `mainClaim`, `landingOpen` over `Status.merging` | `status` runs a process where `mergeInProgress` was a `stat`. It runs only while an ending holds the checkout, so at most one process per checkout per pass. |
| A finished step's uncommitted work is not lost | **machinery**: `handoff` on each pass it is due, and before `wf rm` removes the workspace | Stays machinery: it is the net under the prose that says "commit as you go". |
| `wf rm` removes nothing that holds work | **machinery**: `forgetRefusal`, `heldWorktree`, `branchFates`, pure over `Inventory` | The words that tell a person how to unlock or inspect a worktree come from `say`. |
| A step commits its own work as it goes | **prose**: the git skill's SKILL.md | Already prose today (CLAUDE.md and the brief). It moves from `composeBrief`'s words into the skill. |
| A fan-in resolves the conflicts `make` left | **prose**: the brief names the conflicted paths from `Made.conflicts` and sends the agent to the git skill | Already prose, and the step's `check:` judges the result. Nothing is lost. |
| An ending stages the merge and writes its message | **prose**: the git skill's landing section, which absorbs `trial-merge-a-branch` | `check/check.ts:239-241`'s git sentences leave the code. The brief keeps the place-neutral part: stage, sign off, do not land it yourself. |

What is lost overall:

- **Speed.** A process per verb instead of an in-process `execFileSync` or a `stat`.
- **A direct hold on git's edge cases.** Examples: reading unmerged paths with `ls-files --unmerged` so as not to take the index lock in
  a person's checkout, and `merge-tree` needing git 2.38. These become the skill's code and the skill's tests. The orchestrator cannot
  see whether the skill keeps them.
- **Bugs in a frozen copy.** A bug in a frozen skill stalls the runs that froze it (visibly, as unread) until a person refreezes them
  (open question 6).

## Skills per team template

- **Software teams** (`dev`, `dev-build`, `dev-planned`, `dev-planned-build`, `ui`) say `place: git` on every step. The implementer, the
  ui-implementer and the shipper list `git` in `skills:`. The shipper drops `trial-merge-a-branch`, whose text becomes the git skill's
  landing section, and keeps `say-why-it-aborted`. The planner and reviewers read diffs through their brief's *Where to look*, whose
  lines are the place's `say.look`, so they need the skill only if they are to run its `report`.
- **The git skill's SKILL.md** has one section per duty: commit as you go; read what changed (and `scripts/report.ts` for the numbers);
  merge the base when a person asks (`nemia merge`); resolve a fan-in; stage a landing and write its message (today's `trial-merge-a-branch` steps 1–4, and its paragraph for an ending with
  no `check:`); clean up by hand what `wf rm` left, with the commands `say` prints.
- **A writing team** (`note`) says `place: folder`. None of its agents lists `git`, its briefs carry no git sentence (they come from a
  place it does not have), and no script runs for it.
- **Where it lives.** One copy, in the package: `packages/agent-orchestrator/place/git/`, shipped as Nemia's own code and covered by its
  `tsconfig` and lint as `src` is. No copy goes in this repository's `.claude/skills/` or `workflows/`, and no test holds two copies. The
  package ships no workflow, agent or skill besides it (`trial-merge-a-branch` lives only in the tests' team, `test/fixtures/team/`). It
  is the copy the package's tests prove and the one a record without `placeSkill` runs. `skillsFor` reads a team's skills and the
  places', then the package's place skills (`PLACE_SKILLS`) for a name none of them has, so a team's own `git` comes first (card D,
  delivery (a)). Appending the skill to every step of a git run instead would collide with a team's own `git`, and give prose to steps
  that never act on git. This repository's Ada and Otto list it.

## The migration

Small cards, in order. The orchestrator's feature-folder slices are filed as a chain: 4a (`run.ts`: the record, the status and the leaf
features), 4b (the rest of `run.ts`, including `brief/`, `ending/` and `branches/` with `radius.ts`), 5 (the controllers: `verbs.ts`,
`decide.ts`, `forget.ts`, `start.ts`, `authoring.ts`, `workflow-store.ts`, `worktree.ts`, `views.ts`), 6 (`tick.ts`) and 7 (`cli.ts`). They
move the very files that hold these calls. **A card that rewrites a file waits (`--after`) on the slice that moves it**, so a move and a
rewrite never share a diff, the rule the feature-folders design keeps. Each card is green on its own and ends with the file's git calls
gone, not moved.

| card | after | what |
|---|---|---|
| A1. The contract and the skill, unused | now | `src/place/place.ts` (all nine verbs' requests and answers, the outcomes, the deadlines, `PlaceDeclared`; pure) and `src/place/place.store.ts` (`runPlaceVerb`, `readPlaceJson`; store), re-exported by `runner.ts`; `packages/agent-orchestrator/place/git/`: SKILL.md, `place.json` declaring the verbs it has scripts for, `scripts/contract.ts`, `open.ts`, `handoff.ts`, `status.ts`, `land.ts`, with tests that run every script against scratch repositories (`scratch(prefix)`): an answer, a refusal and an unread answer per verb. The package's `tsconfig` and oxlint cover `place/`. Nothing calls it yet. |
| A2. `make`, `inventory`, `remove`, unused | A1 | Their scripts and tests, and the verbs added to `place.json`. |
| A3. `report` and `standing`, unused | A1 | Their scripts and tests, and the verbs added to `place.json`. |
| B1. Codex trust, the runtime's half | now | The runtime takes `config.codex.trustFrom`, a directory, like `config.claude`: it extends the operator's trust in that directory to `cwd`, and never grants it (`codex.ts:187-204`). A task without it is prepared as today, through `repositoryOf`, so no codex step in a worktree loses the project's settings before B2. |
| B2. Codex trust, the filing half | B1, 6 | The tick passes `trustFrom: run.repo` for a codex step of a repository run, and `repositoryOf` goes in the same card. An `ae` user of codex in a worktree then names the directory. |
| C. `place:` and the freeze | 4a, 5 | The key, its `FrozenStepSchema` field, the same-value rule, the refusal with no `place:`, `workspace: folder` as a former spelling, `open` at `wf start`, the copy to `WF_ROOT/places/`; `placeSkill` on the repository record and as an optional field of `GitRecordSchema`, with a test that a record carrying it is read, and one that a record without it resolves to the package's copy; `place`, `placeOf`, `isGitRun`, the api's and the web's `PlaceKind` untouched; the shipped folders gain `place: git` or `place: folder`; the api's builder and the web's builder. The tick still calls today's git helpers. Split in two: C1, the key; C2, `open` at `wf start` through `openPlace`, `placeSkill` on the record, `placeDirOf` for `trialMerges`, and `makeWorkspace` gone. C2 left the copy, its prune and `refreeze` to a later card (*Freezing*). C1b made the key required: a step file without `place:` is refused at load (`placeRequired`), naming both words, and the board's New workflow asks a person to choose one, none chosen for them. |
| D. Briefs' words | C, 4b | `composeBrief`'s git sentences (`run.ts:5037`, `:5078`, `:5100`) and the landing section's (`check/check.ts:239-241`) come from `say` and the skill's prose. Done: a later step's look (`say.look`), an ending's look at each result branch (`say.results`, holes `{base}` and `{branch}`) and `nemia merge`'s sections (`say.merge` and `say.mergeUncommitted`, hole `{sha}`; `say.showMerge` and `say.lastMerge`, none) come from the run's place, read with the landing's words once per filing (`placeTold`); each key's holes are `SAY_HOLES` (`src/place/place.ts`), and a template naming another is refused where `readPlaceJson` reads it, so at `nemia start`. A brief told no words prints no command and names the skill's section (*Read what changed*, *Merge the base when a person asks*). The skill reaches a step by delivery (a): an agent that acts on git lists `git` in `skills:`, and `skillsFor` finds the package's place skills last; a folder team whose agent lists one is refused at start. The board's preview of a step to come is composed with the same words (`briefNow`). The prose "some sandboxes keep git read-only" and "unless git ignores it" stays: it names git, and gives no command. |
| E. `inventory` and `remove` | 5 | `wf rm` and `wf prune` (`forget/forget.verb.ts`, `prune/prune.verb.ts`); `parseWorktrees` leaves the package. Done: both read a run's worktrees and branches by `inventory` (`{ repo, under, prefix, base }`, each worktree a `Held`), commit what one holds by `handoff`, and take them away by `remove`, never forced; the api's `DELETE /api/runs/:runId` and `POST …/prune` with them. An inventory refused or not heard refuses the verb in its words and touches nothing, never read as nothing left; a repository that is no longer there answers an empty one. The commands they print are the place's `say` (`attach`, `commit`, `inspect`, `orphans`, `unlock`). |
| F. `make` and `handoff` | 6 | `workspaceFor`'s git half and `handOff` (`workspace/worktree.store.ts`, `tick/`); `includeFiles` and `check-ignore` into `make`; `provisionDeps` stays and runs on `Made.workspace`; the realpath guard. |
| G. The landing | 6 | `status` and `land` in `landEnding` and `mainClaim` (`ending/ending.verb.ts`); `denyWhileLanding` in `filedDenies`; `LANDING_DENIED` goes. As built: the reads and acts in `place/landing.store.ts` (`checkoutStatus`, `landThrough`, `mergeStaged`, `landingWords`); `open` answers `staged`, which `nemia start` records as `stagedFile`; the pause and the tick (`mergeStaged`), `mainClaim`, and `nemia rm` and `nemia prune` (`merging` in `prune/prune.verb.ts`) `stat` it (`stagedHere`), and for a record without one ask `status`, only while a landing is filed and not landed (`mainClaim`: while `landingOpen` holds); the brief's git words come from `say.stage`. |
| H. `report` | 7 | `touchedBy`, `diffStat`, `artifacts`, `readArtifact`, `sensitiveDiff`, `workspacesOf`, `artifacts.ts:62`, read live through `report` (no snapshot); `nemia merge`'s base off the trial's `at`; `wf decide`'s print (`cli.ts`, wherever slice 7 puts it). |
| I. `standing` | 7 | `isShipped`, `branchReader`, `refsOf`, `headsOf`, `parentRecord`; `tipsSeen` over `Standing`; the tick writes `WF_ROOT/standing.json`, and `wf ls` reads it. Split in two: I1, the tick's pass asks one `standing` (`passStanding`) and writes the snapshot; I2, every reader but the tick: `nemia ls` and the board's list read the snapshot (`standingSnapshot`), printing its age when stale and "not read" with none, and a person's one-off verb — `decide`, `approve`, `rm`, `prune`, `start --after`, `hold`, the api's decision — asks `standing` live (`standingNow`, `standingLive`). `branchReader`, `oneByOne`, `isShipped`, `headsOf`, `refsOf` and `gitSays` left `src`, and `GIT_SITES` is empty. |
| J. The api and the web | H, I | The api reads the snapshot `standing.json` (`runs/runs.ts`, `runs/judged.ts`, `runs/resting.ts`) through the package, and reads `report` live as card H left it, with no snapshot; `decide/merge.ts` goes; `ToDecide` `kind: 'result'`; the computed kind's word `'git'` becomes `'repository'` in `PlaceKind` (`placeOf`, the api's detail `place`, the web's `lib/api/runs.ts` and `prune.ts:44`, in one card, since nothing stores it), with `GitRun` and `isGitRun` renamed to match; the meter's phase `git` renamed `place` (`meter/meter.ts`, `meter/tally.store.ts`, the web's `lib/pass.ts` and `lib/api/ceilings.ts`). |
| K. The guard | now | Landed first, as a baseline that only shrinks (`GIT_SITES` in `test/git-calls.test.ts`), each later card lowering its own entries. A test over `packages/*/src` and `apps/*/src` that refuses a `'git'` command handed to a spawn, and a `.git` or `MERGE_HEAD` path, with a plant that makes it refuse. The `.git` probe in `authoring.ts` is settled first (open question 5). |

**The pin.** `test/fixtures/git-runs-before.json` holds what every shipped folder's git runs read as: briefs, plans, decisions, listings
and `wf rm`'s words (`git-before-after.test.ts`). Each card from C to J leaves it unchanged, except for the lines a card says it
changes, checked by script where they repeat: `place: git` in the frozen workflow, and the `trial-merge-a-branch` text that the skill
absorbs. The `say` templates are what make the words match.

**What a run in flight meets.**

- **A record from before card C** has no `place` and no `placeSkill`. It is not rewritten: it reads as a repository run, as today, and
  its verbs run on the package's shipped copy of the git skill (*Freezing*). Its fields (`repo`, `baseRef`, `branch`, `isolate`, each
  step's `workspace` and `branch`, `tips`, `landed`) keep their names and values. Nothing is renamed or added, since a record a build
  cannot read is orphaned, in `WF_ROOT` or after a rollback.
- **A worktree cut before F** is at `WF_ROOT/worktrees/<id>/<step>` on `wf/<id>/<step>`, which is the `at` and `name` that `make` is
  handed. The skill takes up a worktree already there, as `workspaceFor` does (`worktree.ts:388`).
- **A merge staged before G** reads the same through `status`: MERGE_HEAD against the recorded tips.
- **A run already shipped** is judged by `standing` from its recorded tips, as `isShipped` does now, on the package's copy when its
  record predates C. `--after` chains keep their answers, since every record has a script to answer them.
- **The daemon** restarts after each card merges, as after any change to `src`.

## What it costs

- **Processes.** A verb is a node process (tens of milliseconds) where today's call was an `execFileSync` of git or a `stat`. Per pass:
  one `standing` per repository and frozen copy (it replaces a `for-each-ref` per repository), one `handoff` per step whose hand-off is
  due, and one `status` per ending holding a checkout; `report` runs at a decision's read, never in a pass (open question 2). Measured by card A1 on the owner's machine
  (12 cores, WSL), `runPlaceVerb` on a scratch repository, ten runs each, a floor: `open`, `status`, `handoff` and `land` take 50 to 60
  ms at the median, against 1 ms for one `git rev-parse`; node's start is most of it. Card J compares the pass's `place` phase with
  today's `git` phase in `tick-stats.json`. The board's list and memo of runs at rest spawn nothing, reading `standing.json` (card I2);
  its decision page runs the place's `standing`, `report` and `trial`, live.
- **Code.** The git code does not disappear; it moves into the skill's scripts. The package loses `worktree.ts`'s git half, most of
  `branches.ts`, the git calls of `forget.ts`, and the api's `merge.ts`. It gains `place/` and the decoders.

## Open questions, each with a recommendation

1. **`place:` on every step, or once per workflow?** A workflow-level key needs a file the format does not have: a folder's README.md has
   no frontmatter. *Recommend* per step, with the same-value rule, as `workspace: folder` is today. The builder writes it on every step.
2. **The report and the standing: snapshots or live?** *Recommend* snapshots, both written by the tick: `report.json` refreshed when a
   run's tips or base move, `standing.json` each pass. The board and `wf ls` then run nothing, and what they show is at most one pass
   old. When no daemon is ticking, they show the snapshot's age rather than read live. A live read would make the api run the place's
   script, which is our code running a command at a person's click.
   *Departed from, for the trial merges, on 2026-10-05*: the decision's `merges`, `nemia merge`'s trial and a land gate's collisions
   are read live, through the git place's `trial` verb (`trialMerges` in `src/place/place.store.ts`), when a decision is read — never by
   the tick, never on a poll. The decision already ran `merge-tree` live, so nothing new runs at a click; it now runs in the place.
   *Departed from, for the report, on 2026-10-06 (card H)*: `report` is read live too, when a decision is read — by `nemia decide`, the
   api's decision and a declared file's branch — and nothing of it is kept: no `report.json`, no refresh. It costs a decision read two
   node processes and a `git diff` per check-affecting path, 150 to 450 ms where today's git calls took 20 to 120 (card H's measure).
   Card J reads the `standing.json` snapshot, and no snapshot of `report`.
   *Departed from, for a person's verbs, on 2026-10-06 (card I2)*: `nemia ls` and the board's list read the snapshot, but a verb a
   person runs once — `decide`, `approve`, `rm`, `prune`, `start --after`, `hold`, the api's decision — asks `standing` live
   (`standingNow`), since what it refuses or prints must not be a pass old. A run that finished since the last pass shows "not read"
   on a list until the next one.
3. **Codex trust: a task field, or leave `repositoryOf` in the runtime?** *Recommend* `config.codex.trustFrom` (cards B1, B2). The runtime
   is finished, but this is a harness's own flag, the shape `config.claude` already has. batch/v1 has no field for it, and neither does
   it for `config.claude`.
4. **Where `provisionDeps` goes.** It is npm's, not git's. *Recommend* it stays in the package for this migration, running on the
   directory `make` answers. A later `node-deps` skill could take it with its tests. Folding it into `make` would put a 10-minute `npm ci`
   and its well-tested pure plan (`workspace/workspace.ts`) behind a script boundary for no gain to this rule.
5. **The `.git` probe in `authoring.ts`** (`placesAround`, `isWorkflowsDir`): the board decides whether a folder is a repository's by a
   `.git` beside `workflows/`. *Recommend* reading the repositories the store already knows: the `repo` of runs and the api's home
   repository. A folder is a repository's when it is `<one of them>/workflows`. If the owner prefers, keep the probe as the one named
   exception the guard test lists.
   *Settled at card K's gate, on 2026-10-06*: a folder is a repository's when it is `<repo>/workflows` for a `repo` a factory names, or
   the one the caller passes (the api's home repository). The runs' repositories are left out: reading every record on a write cost a
   median of 79 ms over 526 runs, over the 50 ms line set at the gate. `isWorkflowsHolder` and `placesAround` read no `.git`.
6. **Refreezing a run's place.** A frozen skill with a bug stalls its runs as unread. *Recommend* `wf refreeze <run>`. It writes a
   person's file, `runs/<id>.refreeze`, which the tick reads: it freezes the skill again from the lookup and writes the new version into
   the record's `placeSkill`. The person chose the new copy by name, so no command comes from a checkout unasked.
   *Deferred on 2026-10-06, at card C2*: no copy is frozen yet (*Freezing*), so there is nothing to refreeze. It comes with the card
   that lets a team supply its own place (given up on 2026-10-11, with the freeze: the note at the head).
7. **A `staged` marker without a process.** If card J's measure shows `status` costs a pass too much, `open` could answer the path of a
   file whose existence means "something is staged" (for git, the checkout's MERGE_HEAD, which the skill locates), and the code would
   `stat` that path without knowing what it is. *Recommend* not building it until measured.
   *Answered on 2026-10-06, at card G*: built, since `status` would otherwise run on every pass that reads a pause or a run to remove.
   Measured in `ship.test.ts` (*asked only where a landing needs it*): a pause read over ten landed runs asks `status` 0 times, a busy
   ending 0 times, and two holds of one checkout in a pass once; a run started before G, with no `stagedFile`, asks `status`.
