# wf — workflows of agent steps

A workflow is **a folder of markdown files**. One file is one step. It runs on
[`agent-engine`](../agent-engine), and it is the proof that the engine's boundary is real: this
package uses `createEngine`, `file`, `tick`, `view`, `stop`, `logs` and nothing else.

```bash
wf start ./brief.md --repo ~/code/myapp --workflows ./workflows
wf up
wf ls
wf cancel r-xyz      # changed your mind: stop the step in flight, file nothing more
wf decide r-xyz      # what it produced, and the choice it leaves you
wf retry r-xyz implement --recheck   # its check was killed before it finished: run it again
wf round r-xyz       # the review still asks for more after the last round it allows: once more
```

To follow it live, use the engine rather than this package — a run's task ids carry the run and the
step, so the engine's own output already names the work:

```bash
AE_ROOT="$HOME/.agent-workflows/engine" ae watch
```

`wf` had a `watch` verb once. It was the better implementation of the two, which was the problem:
observing the engine is the engine's job, and a workflow layer that owns it is a workflow layer
that has to be installed before you can see anything. Moving it down made the sentence above —
*`file`, `tick`, `view`, `logs` and nothing else* — true again.

## Where this stops

**A workflow orders steps and hands them a workspace. Anything that decides *whether the work is
good* belongs in a step, not here.** That is the same line the engine draws one layer down, and it
is why there is no condition or expression in the format — and why its one loop turns on a step's
word, not on a keyword.

Definition of done — a closed list, so there is a finish line:

- [x] a folder of markdown is a workflow — `after`, `resume`, one prose body per step
- [x] fan-out isolates (a worktree per concurrent step), fan-in merges
- [x] what one step knows of another: intent and artifacts, never process
- [x] a finished run names the branch its work is on
- [x] **the decider** — `wf decide` ends the run by handing the choice to a person, because a
      review and a reply are two opinions and something has to say what ships.
- [x] **the check** — a step's `check:` is executed by the run after the step signs off, and its
      exit code, not the agent's word, decides whether what follows is filed.
- [x] **declared outputs** — a step's `output:` schema adds fields to its closeout, and a step that
      names it in `input:` is handed those fields as data. The review travels this way, not as a file.
- [x] **rounds** — `loop:` on a step runs an earlier step again while the step's closeout says
      `again: true`, at most `rounds:` times, then a person, whose `wf round` is the once more.
      `after` stays a DAG: a round is one more try of the steps the run already has, counted.
- [x] **the splitter** — `wf-examples/split` proposes parts that touch disjoint files, and is
      allowed to answer "these cannot be split, run them in sequence".

**The splitter proposes; it does not file.** It writes `PLAN.md` and stops. A run's steps come from
a folder that is fixed when the run starts, so turning a plan into concurrent steps would mean
letting a run grow steps while it is running — a decision about the run model, not something to
slip in with an example. For now a person reads `PLAN.md` and starts a run per part.

## The format

```md
---
harness: codex             # claude (default) | codex | claude-detached
after: implement           # what must finish first: verified, or unverified if it has no check
permissionMode: read-only
output: review.schema.json # what its closeout declares for a later step: a JSON Schema beside it
---
Review the changes on this branch. Be specific about correctness, not style.
```

A step's keys are a closed list — `after`, `resume`, `input`, `harness`, `model`, `permissionMode`,
`deadlineSeconds`, `maxAttempts`, `check`, `retries`, `output`, `loop`, `rounds` — and a key the parser
does not know is refused by name before anything is spent, as is a value it cannot use
(`src/workflow.ts`). `tools`, `effort` and `guide` are refused with reasons of their own.

**No key is control flow.** No conditions, no expressions, no templating, and no loop a keyword
decides. That is the design, not a missing feature.

The interesting decisions in this kind of work — *is this good enough*, *did it do what was asked*
— are not predicates a workflow language could evaluate. They are judgements, and a judgement
belongs to a step with an agent in it. **The workflow is a team, not a program.** The prose is the
logic: `after` orders, `resume` continues, `check` measures, `retries` counts, `output` declares and
`input` reads, `loop` is the edge back and `rounds` counts it, and the rest say who does the work and
for how long. Whether the work goes round again is still a judgement: the looping step's own `again`
(*Going round again*, under the check).

`permissionMode` is the harness's word, checked against the harness the step runs on. On codex,
`read-only` runs the step `-s read-only`: it reads and runs commands and writes nothing, which is why
the shipped reviewer hands its review on as its closeout. `retries` is how many times the run re-files
a step its check refused (*Trying again*, under the check).

## What one step knows of another

A run cuts one git worktree and every step works in it, so the handoff is the workspace — the way
it is between two engineers. A later step is told:

- its own prose
- **the original request** (the spec — you cannot judge completeness without it)
- where to look: `git diff <baseRef>`, and who was there before it
- what a step it waits on declared in its closeout — **only if it asks**, with `input:` (below)
- in a round of a loop, what the loop hands on: the reviewer's findings to the step it loops back to,
  and that step's replies to the next reviewer (*Going round again*)

And deliberately **not** told: the previous step's transcript, reasoning, or self-assessment.

The reason is what a pull request already demonstrates. A PR description is not the author's
transcript — it is an artifact the author *chose* to produce, and the reviewer judges the diff
rather than the author's account of it. Passing the implementer's reasoning to the reviewer would
anchor it on the very context that produced the work, and would put unverifiable claims next to
verifiable evidence. So: **intent and artifacts travel, process does not.** A step that wants to
say something to the next one writes a file, deliberately, like a person would — or declares it.

### Declared output: `output:` and `input:`

Two keys, neither control flow — one declares, one reads. `workflows/ui/`'s review and its reply:

```md
---
harness: codex
after: implement
permissionMode: read-only
output: review.schema.json
---
Review the change in this workspace as a second engineer would. …
```

```md
---
after: review, look
resume: implement
input: review, look
check: npm test && npm run typecheck && npm run build && npm run e2e
---
Two reviewers have been through your change. One read the code: its findings are below, under *From review* …
```

- **`output: <file>`** names a JSON Schema beside the step, relative to the workflow folder. `wf start`
  reads it and freezes it on the run with the step. A schema is part of what the step is judged by,
  so it sits inside the same fence as a `check:`, and editing the folder afterwards changes nothing.
  Its properties are merged into the closeout schema the step is filed with. The merged schema stays
  strict: every property required and no others allowed, because Codex enforces strict output
  schemas. At load, the run refuses a schema whose objects are not strict or that uses `$ref`, a schema that names
  `outcome`, `summary`, `artifacts` or `needs`, and a file that is not there. Each refusal names the fix.
- **`input: <step>`** hands this step the producer's declared fields, under `## From <step>` in its
  brief, as JSON labelled as data. It gets those fields only, never the producer's summary, needs or
  artifacts. The producer must be a step this one waits on, directly or through `resume`, and must
  declare an `output:`. Anything else is refused at load: a step cannot read the product of work that
  has not finished.
- **A producer whose closeout lacks a declared field, or cannot be read, is `unsigned`.** It did not
  say what it was asked to say, and nothing that waits on it is filed.

**The anchoring rule stands, and it is why both ends are declared.** *Intent and artifacts travel,
process does not* was written against handing the implementer's account to the reviewer. A declared
output is an artifact: the step's deliberate product, exactly what `REVIEW.md` used to be. What
changed is the transport, not the rule. The summary still goes to the person who decides and nowhere
else. Nothing from any step's closeout reaches a step that did not ask for it. `implement` declares
nothing and `review` reads nothing, so the reviewer judges the diff — and in a round, it is handed
implement's replies to the last findings and nothing else, because its own `loop:` asked for them.

The transport buys three things. The reviewer writes nothing, so it runs `permissionMode: read-only`.
The harness enforces the review's shape. And the review lives on the engine's record of the attempt,
not on a branch, so `git branch -D` no longer deletes the only copy. `wf decide` prints a declared
output after the step's summary: `findings` as a list, any other field as `name: value`. A step that
wants a file for a person still writes one: `workflows/ui/respond.md` writes `RESPONSE.md`, because a
reply is for the person who decides. In `workflows/`, implement's replies travel on its closeout
instead, to the next reviewer and to `wf decide`.

## It works, and here is the run that proved it

A deliberately naive `slugify()`, a two-step workflow, two different subscriptions:

```
r-mtxsaocn-du861i  2 step(s): implement → review
   implement      succeeded      (claude)
   review         succeeded      (codex)
```

Claude implemented it — NFKD folding, transliteration for `ß`/`æ`/`ø`, separator collapsing, 10
passing tests. Then Codex, which had never seen a word of Claude's reasoning, read the diff and
wrote:

> `src/slug.js:52`: The explicitly supported `´` apostrophe is never removed: the earlier NFKD
> normalization converts it to a space plus a combining mark. Consequently,
> `slugify('Bob´s Burgers')` returns `bob-s-burgers` instead of `bobs-burgers`.

Verified:

```
"Bob's Burgers"  -> bobs-burgers     ← the ASCII apostrophe works
"Bob´s Burgers"  -> bob-s-burgers    ← the one its own comment claims to handle does not
```

A real bug, in code whose own author documented the case and whose own tests missed it. That is
what an independent reviewer is *for*, and it is why the reviewer runs on a different harness and
is handed the artifact rather than the argument.

## Concurrent steps: isolate, then merge

Two agents editing one directory is the arrangement to avoid, so **each step that could run beside
another gets its own git worktree and branch**, and a step that waits on several gets them merged.
The rule is git's, and `assess` decides it as a pure function:

| the step | gets |
|---|---|
| the only thing following its only predecessor | **inherit** — same directory, same branch. The line of work continues, and `resume:` still makes sense. |
| one of several siblings | **fork** — its own worktree, branched from where it starts |
| waiting on several steps | **merge** — its own worktree with all of their branches merged in |

**`after: a, b` already meant "wait for both". It now also means "and give me both."** No new key:
the thing the author asked for is the thing they get.

### Why engineers talk, and why agents shouldn't have to

Two engineers on overlapping files coordinate by talking because isolation is expensive *for them*
— a branch left alone for a week diverges, rebasing hurts, and you can't ask three people to work
sealed off for days. Agents have none of those constraints: a worktree costs nothing and a task
finishes in minutes. So the cheap option inverts, and **short-lived isolation plus an explicit
merge beats coordination**. Copying the human protocol would be cargo-culting the workaround
instead of the reasoning behind it.

A conflicting merge is left conflicted on purpose, and the step is told so in its brief. Resolving
it is the work that a fan-in step exists to do.

### What a worktree is given

A worktree holds tracked files only. When the run cuts one, after any merge and before the step is
filed, it fills in the rest:

- **A `node_modules` of its own.** It used to be one link to the main checkout's tree. npm workspaces
  are links whose real path is the main checkout, so through that link a branch's app imported main's
  packages: the branch was tested against code it did not contain. Now the worktree gets a directory in
  which each workspace package (`packages/*`, `apps/*`) links to the worktree's own copy. Every
  third-party package links to the main checkout's, one inode and no install. `.bin` and each `@scope`
  are directories of the worktree's own, so installing into the worktree never writes main's tree, and a
  workspace package's bin runs the worktree's file. npm's and tools' dot files (`.package-lock.json`,
  `.vite-temp`) are left out. `src/deps.ts` decides from names, and `provisionDeps` in `src/runner.ts`
  does the work.
- **An install of its own, when the lockfile asks for more.** For each package the worktree's
  `package-lock.json` names, the run looks at what is on disk at that path in the main checkout's
  `node_modules`, because that is the tree the links point at. Main's own `package-lock.json` can be
  ahead of it: a lockfile merged in with no `npm install` since. npm's record of the tree,
  `node_modules/.package-lock.json`, can be too, because `npm install --package-lock-only` rewrites it.
  The trees part when main lacks a package, has another version, or links it elsewhere, or when a package
  sits in a workspace's own `node_modules`, which links cannot give — a parent step added a dependency,
  or main moved on. Links would then be the wrong tree, so the run runs `npm ci --no-audit --no-fund` in
  the worktree instead. That takes about a minute, and the step's brief says so under *Where to look*,
  so the step knows why it started late; `wf up` prints it too. An optional package main does not have
  is not a difference: it is another machine's platform build. If `npm ci` fails, the step is told what
  npm said and to run it itself.
- **What `.worktreeinclude` lists.** This is the file at the root of the main checkout that Claude Code's
  `--worktree` reads, taken as paths rather than as its gitignore patterns: one path per line, file or
  directory, relative to the root, with blank lines and `#` comments skipped. A leading `/` anchors a
  line at the root, as it does in gitignore. A path is copied from the main checkout only if git ignores
  it there, as Claude Code copies only ignored files. Anything else would land in the worktree untracked,
  and the hand-off's `git add -A` would commit it onto the run's branch, so it is refused and named.
  Nothing already in the worktree is overwritten. A path the main checkout does not have is skipped and
  named in the run's log line, never an error. A path outside the repository (`../x`, a drive path, or
  one that leads out through a link) is refused by name: by `wf start`, and again at the cut.
  **`node_modules` is never copied**, listed or not: it is provisioned as above, because a copy costs
  minutes per step.

All of it is idempotent. A tree npm installed is left alone, a linked tree gains only what it lacks,
and nothing already there is replaced. A pass that dies after cutting a worktree, in the minute
`npm ci` takes for instance, leaves the worktree for the next pass to take up. Before, `git worktree
add` would have refused the branch on every pass after.

### A merge carries commits, not working trees

The first bug this design produced, and it was silent. A `review` step wrote `REVIEW.md` and never
committed it. While every step shared one directory that was harmless — a file written was a file
the next step could read. The moment steps fork it is not: `respond` merged review's *branch*,
which did not contain the file, and answered a review it had never seen.

Asking each step's prose to remember to commit is not a contract. The run now commits whatever a
finished step left behind — failed and stopped steps included, so their work stays on their branch —
before anything merges it, so **the workspace a step hands on is the
workspace it made** — true by construction rather than by instruction. It is idempotent: a clean
tree commits nothing.

### It caught a conflict that talking is supposed to prevent

A run with two concurrent steps — one adding a JSDoc comment to `src/slug.js`, one adding a test to
`test/slug.test.js` — then an `integrate` step waiting on both. Different files, so git merged them
cleanly. The integrate step wrote:

> The merge was textually **clean but semantically conflicting**: the tests branch asserted that
> slugify trims padding while the docs branch documented the untrimmed behavior, and neither
> touched the implementation — so I made slugify trim and collapse whitespace, updated the JSDoc
> to match, and `npm test` now passes (2/2).

That is exactly the failure two engineers would have used a conversation to avoid, caught after the
fact by a step whose job is to look — with no coordination, no lock, and no declared paths.

## The closeout: how a step signs off

Every step ends by giving a structured final answer, and that answer is how the run knows it is done:

```json
{ "outcome": "done",
  "summary": "one to three sentences, for the person who decides what ships",
  "artifacts": ["RESPONSE.md"],
  "needs": null }
```

There is no file to write. The run files each step with `CLOSEOUT_SCHEMA`, plus whatever fields its
`output:` declares (`closeoutSchemaOf`), and the harness asks for
the answer in that shape — Claude Code as a `StructuredOutput` tool the agent calls to finish, Codex
as `--output-schema`. The engine records the answer on the step's task without reading it; this
package reads it (`closeoutOf`). The schema is strict — every property required, `needs` nullable
rather than optional — because Codex enforces strict structured outputs, and one schema has to
satisfy the strictest harness it is handed to.

**It used to be a file, and the file is why it is not one now.** Each step wrote
`.wf/<step>.done.json` into its worktree and committed it, and three things went wrong in real runs.
It travelled down the git branch, so the next step was cut a worktree that already said it was
finished: `review` and `respond` settled `succeeded` in six seconds each having done nothing, and
`wf ls` called the run healthy. Its path had to be told to the engine in one place and to the agent in
another. And a step wrote it, kept going, found it could not commit, and rewrote its verdict after the
next step had already started on the first. A statement made to the harness lives in the session,
belongs to the attempt that made it, and needs no path.

**Three things, one answer.**

*It is how the run knows a step is finished* — the moment the answer is given, not ninety seconds of
quiet later. This is [Hermes Kanban's](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)
`kanban_complete(...)`, in the form every harness here already supports.

*It stops a step claiming success it did not have.* `"outcome": "blocked"` ends the session honestly,
and the DAG treats it as final — nothing downstream runs — while `wf decide` says **waiting on you**
rather than **failed**. A thing that stopped and said why is not a thing that broke.

`wf ls` says so as well, one line per step. A step that signed off blocked ended its session as
cleanly as one that finished, so the engine's phase alone read `succeeded` for both, and the step
waiting on you looked like one you could ignore. The outcome now sits beside the phase:

```
fix-the-parser-k2q9  Fix the parser so a trailing comma is not an error
   implement      verified ✓           wf/fix-the-parser-k2q9/implement
   respond        waiting
   review         succeeded · BLOCKED  wf/fix-the-parser-k2q9/review
   → waiting on you: review  —  wf decide fix-the-parser-k2q9
```

A step with no closeout — still running, never filed, or from a run older than closeouts — is credited
with nothing: a settled one reads `unverified`, never `succeeded · done`. The summary is left off that
screen on purpose: it was written for `wf decide`.

*It makes a lost artifact visible.* `artifacts` are checked against the branch, and a declared file
that is not there is reported. The first real run lost a reviewer's entire output to exactly that,
silently.

**Committing is the run's job.** Every brief tells the step that the run commits whatever it leaves,
and that being unable to commit is not a reason to block. That is not generosity. Codex's sandbox
keeps git's metadata read-only, and two runs stopped dead because a review — told its artifacts
*must* be committed — honestly signed off `blocked`, over a `REVIEW.md` that `handOff` then committed
anyway. A repository can still let Codex commit its own work by shipping a rule
([`.codex/rules/git-commit.rules`](.codex/rules/git-commit.rules); the engine's README says how and
why): the run's commit is the floor, not the ceiling.

**The contract is appended by the runner, not written by workflow authors.** One step's prose once
forgot to say "commit this", and fixing that prose would have left the next workflow free to repeat
it.

**`summary` goes to the decider and nowhere else.** The reviewer still gets the diff and no account of
the work — *read the change, not an account of it* is unchanged. Hermes injects the parent's summary
into the child's prompt; this is the one place worth diverging. The only part of a closeout that
reaches another step is what its `output:` declares, and only a step that asks with `input:` gets it.

## The check: a fact the run does not take on trust

The engine settles a step `succeeded` when its session ends, and a session always ends successfully —
finishing talking is what it does. A run that files the next step on that word is believing the agent.
`check:` is the fact the run establishes for itself:

```md
---
check: npm test && npm run typecheck
---
Implement what was asked, in this repository.
```

After the step signs off, the run commits what it left and executes the command **in the step's
workspace**. Exit 0 is `verified`, and the next step is filed. Anything else is `failed (check)`, and
nothing that waits on the step ever runs. A step with no `check:` has nothing run for it and reads
`unverified` wherever it appears, so it cannot pass for a step somebody checked.

- **The command comes from the run, never from a checkout.** `wf start` freezes the workflow onto the
  run record (`run.workflow`) and every pass reads that copy. A `check:` written into the folder
  afterwards — by a step working in it, say — never reaches the run.
- **It tests the branch.** The command runs in the step's worktree, so it resolves that worktree's
  `node_modules`: the branch's own workspace packages, and its own install when its lockfile differs
  (*What a worktree is given*, above). Nothing about the check changed for this; the tree under it did.
  A check no longer passes or fails on what `main` holds.
- **A step is told before it is judged.** Every brief with a check says the command must exit 0 in the
  workspace, that the run executes it afterwards, and not to weaken it.
- **It is an engine task,** on a `check` harness the run hands the engine (`src/check.ts`): `sh -c` with
  the command in a subshell, stderr to a file of its own, and the exit code printed last. So a check
  outlives a tick that dies, is stopped by `wf cancel`, ends at a ten-minute deadline, runs once and is
  never resumed, and has a concurrency pool of its own. Its task id is `<run>-<step>-check`, recorded as
  `steps[name].check` — beside the step's own `taskId`, never in place of it. The engine is unchanged.
- **The gate is the exit code the engine recorded.** The `[wf check] exit N` line in the log is the
  number shown to a person; a command that prints one of its own changes that number and nothing else.
- The command sees `WF_RUN`, `WF_STEP`, `WF_BASE_REF`, `WF_WORKSPACE`, `WF_STDERR`, and `WF_ARTIFACTS` — the
  step's files directory, where a check that takes screenshots puts them (*A step's files*, below).
- The run commits what a step left **before** filing its check and never after, so what a suite leaves
  behind is not committed under the step's name.

This repository's own `workflows/implement.md` carries `check: npm test && npm run typecheck` — the
check a person used to run by hand at every trial merge — and every round of it is checked again.
`workflows/ui/`, for a change to the web app, adds `npm run build && npm run e2e`. Point the folder at
another repository and change that line.

### What a step's line says

| `wf ls` | means | what waits on it |
|---|---|---|
| `waiting` | not filed yet | — |
| the engine's word: `running (working)`, `needs-human` | still going | waits |
| `unsigned` | it succeeded without the closeout it was asked for, or without a field its `output:` declares | **never runs** |
| `succeeded · BLOCKED` | it signed off `blocked` | **never runs** |
| `checking` | signed off; its check is due or running | waits |
| `verified ✓` | its check exited 0 | is filed |
| `unverified · done` | signed off, and declared no `check:` | is filed, on the step's word |
| `rounds exhausted` | its `loop:` asked for another round on the last one `rounds:` allows | **never runs** — unless a person says once more, below |
| `failed ✗ check (exit 1)` | its check did not exit 0 — `unfinished` if it was stopped first | **never runs** — unless it is tried again, below |
| `failed`, `stopped` | the engine's verdict on the step's own task | **never runs** |

`→ waiting on you` names every step that is blocked, unsigned, refused by its check or out of rounds,
and has no try or round due. `wf decide` prints `FAILED CHECK:`, `CHECK DID NOT FINISH:`, `UNSIGNED:`,
`UNVERIFIED:` and `ROUNDS EXHAUSTED` first, then each check's command and exit code and, for a check
that refused, the last 20 lines of stdout and of stderr.

**`unsigned` blocks every `claude-detached` step** until engine open issue 4 is fixed: that harness
never hands the closeout schema on, so its steps never sign off. `claude` and `codex` steps do.

### Trying again: `retries:` and `wf retry`

A check can refuse for a reason that is not the work. On one day on this repository it did four times: a
flaky parallel suite, a leaked `WF_STDERR`, a package missing from the worktree, and three checks the
harness killed for "low memory" with 16 GB free. The only remedy each time was editing the engine's journal
and the run's record by hand, with the daemon stopped, which nobody recorded. Now the run tries a step again,
on the workflow's word or a person's.

```md
---
check: npm test && npm run typecheck
retries: 1
---
```

- **`retries: n`.** When a step's check *refuses* it, the next tick re-files the step, continuing the step's
  own last session (`resumeFrom` the try before, as `resume:` does between steps). Its brief says what became
  of the last try, and carries the check's verdict as data: the command, the exit code, the last 20 lines of
  stdout and of stderr, and the sentence that it must not weaken the check. At most `n` times. Past that the
  step waits on you, as before.
- **A check that did not finish did not refuse.** A check refuses when it runs to its end and exits non-zero:
  the engine settles it `failed`, with an exit code. One that was `stopped` (killed, never started), or
  `failed` without an exit code (stopped at its deadline, or lost), said nothing about the work. `retries`
  spends no try on it. `wf ls` already says `failed ✗ check (unfinished)`, and `wf decide` says its check did
  not finish and offers `wf retry <run> <step> --recheck`.
- **`wf retry <run> <step> [--nudge | --fresh | --model <m> | --recheck]`** is a person's word for one more
  try. `--nudge`, the default, continues the step's last session and tells it what happened. `--fresh` starts
  a new session on the same branch, with the whole brief. `--model <m>` does that on `m`. `--recheck` runs the
  check again on the work as it stands, and files no session. A step may be tried again when it waits on you
  (its check did not pass, it ended unsigned, or it signed off blocked and its session has settled), or when
  its own session failed or was stopped. `--recheck` only applies where a check did not pass. Each refusal
  says what to do instead: a step still running or checking, a verified step, a cancelled run, a try already
  asked for, a step the run is about to try again itself.
- **An ask is a file, like a cancellation.** `wf retry` writes `runs/<id>.asks/retry-<step>-<n>`, whole and
  exclusively, and never writes the run's json. Every pass reads the directory. The next pass files try `n`,
  writes the record, then moves the ask into `done/`. The ask names its try, and a try's ids are derived
  (`<run>-<step>-try<n>`, `<run>-<step>-try<n>-check`). So a pass that dies after filing a try is adopted by
  the next, and a pass that dies before consuming the ask leaves the try on the record, where the ask is
  spent and files nothing.
- **The record keeps the current try where it always was.** `steps[name].taskId` and `steps[name].check` are
  the current try's, so everything that reads them reads the try that decides the step. The tries before it
  go under `steps[name].tries`, in order, each with what replaced it: `retries`, `nudge`, `fresh` (and its
  model) or `recheck`. A person's tries do not spend the step's `retries`.
- **`wf ls`** puts the try beside the step's line, without changing the step's word: `try 2 due — retries: 1,
  0 spent`, `try 2 asked (--recheck) — the next tick files it`, and once filed `try 2, by retries: 1`. A step
  with a try due is not waiting on you. **`wf decide`** names the try each closeout and check belong to, and
  under *try again* gives the `wf retry` for each step that can take one.

This repository's workflows declare no `retries:`. A flaky suite would spend a whole session on a nudge, so
whether a refusal is the agent's to answer or a person's is left to each workflow's author.

### Going round again: `loop:` and `rounds:`

The shipped workflow used to be implement, review, respond, and then a person read the reply beside
the findings. When the reply changed code, nobody reviewed the change; when a finding was wrong, the
argument reached the person cold. The edge back closes that: implement ⇄ review until the reviewer says
the change is done, at most a few rounds — more is the sign of a design question or a decision — then a
person.

```md
---
harness: codex
after: implement
permissionMode: read-only
output: review.schema.json   # findings, and again: boolean
loop: implement
rounds: 3
---
```

- **`loop: <step>`** names a step this one waits on, through `after`, to run again. **`rounds: N`**
  caps the rounds, the first included, and is 3 when it does not say. The looping step's `output:`
  must declare `again` as a boolean.
- **The judgement stays the reviewer's.** When the looping step is verified — or unverified, with no
  check — and its closeout says `again: true` with rounds left, the next tick files a round: the target
  again, its last session continued and handed what the looping step declared, as data, under *From
  review* — the findings, never `again` or the summary. Then every step between them, then the looping
  step, each a new session. `again: false` lets what waits on the looping step start, or ends the run
  succeeded. It is the rule `blocked` already follows: an agent's word the run routes on, and a count,
  with no condition and no expression.
- **The loop contract is the run's, not the folder's.** The target is told `respond.md`'s three honest
  answers: fix it; say why not, in `replies`, which the run adds to its closeout from round 2 (`fixed`
  or `won't fix`, and why) and hands the next reviewer as data, under *Replies from implement*; or
  sign off `blocked`, which stops the run for a person. A target that answers nothing is `unsigned`.
  The looping step is told, every round, what its `again` does and which round it is.
- **At the cap, a person.** `again: true` on the last round files nothing: the step reads
  `rounds exhausted`, nothing that waits on it runs, and `wf decide` says `ROUNDS EXHAUSTED`, prints
  the last findings and offers `wf round <run>` — the person's once more. Like `wf retry`, it writes an
  ask, `runs/<id>.asks/round-<step>-<n>`, which the next tick honours once. It is refused while a round
  is running, while the run would go round itself, on a loop that ended with `again: false`, on a
  step of the loop that stopped (that is `wf retry`'s), and on a cancelled run.
- **A round is a try.** Each step of the loop moves its current try behind it with `then: 'round'`, so
  `steps[name].taskId` and `.check` stay the current try's and ids stay `<run>-<step>-try<n>`. A pass
  that files a round and dies before writing the record is adopted by the next, as a try is. `wf ls`
  says `round 2 of 3` beside each step of the loop, and `round 2 of 3 due` while the next tick has it
  to file.
- **A loop is a chain.** At load the run refuses a `loop:` that names no step this one waits on, a
  looping step without a boolean `again`, `rounds:` without `loop:`, a step in the loop that forks or
  merges a worktree of its own (cut once, off round 1's branch, it would judge work that is no longer
  the change), a step in it that `resume:`s, a step in two loops, and a target whose `output:` already
  declares `replies`.

**`retries:` and `loop:` answer different questions.** `retries:` is the run's answer to a *check*
refusing one step: that step again, nudged with what the check said, because the work did not pass.
`loop:` is the answer to a *reviewer* asking for more: an earlier step again, handed the findings, then
the steps back to the reviewer, because the work passed and a second engineer is not done with it. A
check that refuses the target inside a round is still `retries:`'s, and `retries:` counts within a
round: a round is new work, and its check may refuse it afresh.

This repository's `workflows/` is implement ⇄ review: `review.md` loops back to `implement` with
`rounds: 3`. `respond.md` is gone, and its three answers are the loop contract.

## A step's files: `runs/<id>/artifacts/<step>/`

Some of what a step makes is for the steps after it and the person who decides, and does not belong on
the branch: a screenshot, a log, a report. Written into the worktree, it is committed by the hand-off and
rides the branch into what ships; gitignored, it never reaches the next step's worktree at all. So the run
makes a directory per step, beside the run's record under `WF_ROOT` and outside every workspace, before
it files the step.

- **The step is told where it is**, on its brief, beside the closeout contract (`artifactsContract`):
  *put them in `<dir>`; name them in `artifacts` by absolute path*. Mechanism, like the closeout: no
  workflow author has to remember to say it.
- **The step's check is given it** as `WF_ARTIFACTS`.
- **A declared artifact is looked for where its path says** (`artifactPlace`). A path from the workspace
  root is looked for on the branch, as before. An absolute path is looked for in the step's own
  directory, on disk, with links followed. Any other absolute path — another step's directory, a `..`
  that climbs out, a link inside that leads out, `/etc/passwd` — is reported and never opened, stat-ed or
  resolved: a closeout is an agent's text.
- **`wf decide` lists the directory** after the step's closeout, each file by absolute path with its
  size, below whatever it declared that is not where it says.

A file reaches a later step by its path, declared. `workflows/ui/implement.md` declares `screenshots`,
the absolute paths of its PNGs, and `look` reads them with `input: implement`.

### `workflows/ui/`: a change a person will see

```
implement ──► review (codex, read-only: the code)       ──┐
          └─► look   (claude: implement's screenshots)   ──┴─► respond (resumes implement)
```

`implement` and `respond` carry `check: npm test && npm run typecheck && npm run build && npm run e2e`.
`npm run e2e` (`apps/web/test/e2e/` in this repository) builds the web app, serves it against a seeded
store, visits every page in headless Chromium in a light and a dark theme, asserts what each page must
have, and screenshots each into `WF_ARTIFACTS`. `implement` is told to run it into its own directory and
read the PNGs before it signs off, and declares `screenshots` and `pages` (`implement.schema.json`).
`look` is handed those and nothing else of implement, reads the images, and declares `findings` by page
and theme (`look.schema.json`). `review` is `workflows/review.md` and its schema, copied, and a test holds
the copy to the original. `respond` is the fan-in: it reads both reviews, continues implement's session,
and answers them in `RESPONSE.md`.

```bash
wf start "Give the Factory a legend" --workflows packages/agent-workflows/workflows/ui
```

`look` is told to write nothing, and nothing enforces that until the engine carries `tools:`
(`docs/plan-hold-the-bar.md` §4 I).

## Deciding what ships

A run used to end by going quiet. The last step settled `succeeded`, `wf ls` named a branch, and
that was it — which is fine until you have six runs and no idea which of them is waiting on you.
`wf decide <runId>` is the other end of the run: what it produced, and the choice it leaves you.

**The role is a person's, and that is the design, not a shortcut.** An agent grading the exchange
would be a third opinion with no more standing than the first two, and the one thing it could not
do is the thing the moment is for — commit the repository to an answer.

It needed no new concept. A step already talks to whoever reads next by writing a file — *intent
and artifacts travel, process does not* — and a person is just the next reader, so **the artifacts
are the files the run added**, which git names exactly (`--diff-filter=A`). No frontmatter key to
declare them, and a workflow that writes different files needs no change here. Markdown added at
the root is printed in full, because that is a step writing to a human; source it added is in the
diff, where source belongs. All of it is read out of git rather than off disk, since the worktree
is gone by the time anyone decides and the branch is exactly as it was left.

**Whether a run shipped is asked, not stored.** Git already knows — is the result branch an
ancestor of the base branch — so a `decidedAt` field would be a second copy, wrong the moment
somebody merges by hand. A run still holds no status of its own; cancellation stays the single
exception, and only because nothing else can know it. A fan-out is shipped when *every* terminal
branch has landed, not when one has.

A failed run is decided too. The first run this was pointed at had been sitting for hours marked
`failed`, and its branch held a real fix plus a design question addressed to a person — none of
which anything in this tool had ever shown anyone.

`wf decide` is read-only. It prints the material and the exact `git merge` / `git branch -D`
commands, and does not decide anything itself.

A run started with `--no-worktree` worked on the base branch itself, where git's answer to "has it
landed" is always yes. `wf decide` never asks it for such a run: it says the run worked directly on its
branch, classifies its steps like any other, and prints the diff against the base instead of a merge.

## Calling a run off

A run could be started and watched but never stopped: the only recourse was killing the session by
hand, which left the run's own record insisting it was still running. `wf cancel <runId>` asks the
engine to stop the step in flight and writes the cancellation on the **run**.

That last part is the whole decision. Everywhere else a run holds no status of its own — whether it
is finished is a question about its steps' tasks, and the engine can answer it, so copying the
answer here would just go stale. Cancellation is the exception because there is nothing to copy:
the engine has tasks, not runs, and "file nothing further" is not a fact any one task can hold.
Stopping the session ends the work burning right now; the mark on the run is what stops the next
tick cheerfully filing the step after it.

The mark is a file of its own — `runs/<id>.cancelled`, not a field in the run's json — and that
is not fussiness. The json has a writer that rewrites it constantly: a tick reads the record,
spends seconds observing sessions and cutting worktrees, then writes back what it filed. `wf
cancel` is a second writer, and the whole point of it is to be typed while that daemon is running.
Two writers doing read-modify-write on one file lose updates, and this one did — a cancel landing
mid-pass was overwritten by the tick's stale copy, and the run went on filing steps as if nobody
had said anything. Re-reading before writing narrows that window rather than closing it. Two
writers, two files, composed on read: the tick owns the steps, a person owns the cancellation, and
neither can erase the other.

For the same reason the mark is enforced by **every** tick, not only by the verb that wrote it.
`wf cancel` stops what it can see in flight, and a pass already underway may file a step a moment
later; the next tick finds it and stops it too. The mark is the desired state and each tick
reconciles toward it — the same level-triggered rule the engine runs on one layer down.

Cancelling a run with nothing in flight, one already finished, or one already cancelled are all
normal things for a person to do, so none of them is an error and each says which it was. A
finished run is deliberately **not** relabelled — a run that succeeded succeeded, and stamping it
cancelled would make `wf ls` lie about work that actually landed. Cancelling twice keeps the first
time and re-asks for whatever is *still* in flight, because the engine carries a stop out on its
next tick: running it again is how a person deals with one that slipped through, not a no-op.

## Choosing the model per step

Verified against the transcripts: `claude --bg --model haiku` really does run Haiku
(`claude-haiku-4-5-20251001`), while the default was `claude-opus-5`. So `model:` on a step works,
and the transcript records what actually ran.

**But the model and the permission mode are coupled, and getting it wrong stalls the step.** With
`model: haiku`, the session printed `auto mode unavailable for this model` and fell back to
**manual** — then sat asking permission for a one-line edit. Both concurrent steps did, and the
board showed them as `needs-human` within seconds, which is the system working: the wrong
combination is visible rather than mysterious. Check that a cheaper model supports the permission
mode you are relying on before you put it in a workflow.

## Measured: what a handoff actually costs

Before optimising the handoff, we measured it. From the three-step run above, and from two
trivial sessions run to isolate the floor:

| | |
|---|---|
| `claude --bg` spawn call returns | **0.45s** |
| cold session, spawn → done, smallest possible turn | **4.5s** |
| **resumed** session, spawn → done, same turn | **3.0s** |
| engine tick detection (configurable; default 3–4s) | **~3s** |
| **fixed overhead per handoff** | **≈ 6–7s** |
| work steps in the real run | 36s, 56s, 121s |
| overhead as a share of the 266s run | **~4.5%** |

So a session is cheap: the whole lifecycle of spawning one, doing a turn and finishing is under
five seconds, and continuing an existing one is three.

**And then we measured cross-session messaging itself**, rather than inferring it:

| | |
|---|---|
| message → recipient acts (idle recipient), sample 1 | **7.9s** |
| same, sample 2 | **18.8s** |
| for comparison: cold session, spawn → done | 4.5s |
| for comparison: resumed session, spawn → done | 3.0s |

**Messaging an idle session is slower than starting a new one.** The docs say why: *"When the
receiving session is idle, Claude Code starts a new turn with the message."* A message to an idle
peer is not a cheap wake-up — it is a prompt, and it costs a whole turn. Same-machine delivery
travels over a per-session Unix socket and never touches a server, so the transport is not the cost;
the turn is.

That reverses the conclusion and, more usefully, reframes the capability:

- **Not** a faster handoff between sequential steps. It is measurably slower than `resume:`.
- **Yes** a way to reach a session that is *already working*: *"The receiving Claude reads the
  message between tool calls during an active turn, so a running tool is never interrupted."*
  Messaging a **busy** session is nearly free, because it rides a turn that is happening anyway.

So cross-messaging is for **mid-flight steering**, not for review loops. And the docs prescribe our
design for the other case outright: *"A message is a piece of text one Claude writes to another,
never the sender's conversation history or files. To move a whole conversation or its context,
resume the session instead."*

Three operational notes for anyone who does wire it up later:

- A session in `bypassPermissions` **holds** inbound messages for human approval. Sessions in
  `auto`, `acceptEdits` or `dontAsk` receive them. A fleet on bypass would stall silently.
- A `claude -p` worker needs `crossSessionInbound: accept` in its `--settings` to take messages
  unattended.
- Message loops are rate-limited, identical repeats are dropped and the queue caps at 50, so a
  ping-pong between two sessions stops on its own.

## Permission modes, the hard-won part

The first run of this workflow **stalled waiting for a human**, because the default was
`acceptEdits`: it approves file edits and `mkdir`/`mv`/`cp`, but not `npm test`. An agent that
wants to run its own tests stops and waits for someone who, in a fleet, is not there.

| mode | runs without asking | use for |
|---|---|---|
| `acceptEdits` | reads, edits, common filesystem commands | work you are watching |
| **`auto`** *(default)* | everything, with background safety checks | **long unattended tasks** |
| `dontAsk` | reads + pre-approved tools; anything else is **denied** | locked-down CI, where you enumerate the tools |
| `bypassPermissions` | everything | isolated containers only |

`auto` is now the engine's default. `dontAsk` never stalls either, but it *denies* instead of
asking — which fails quietly rather than visibly, and is right only when you have enumerated the
tools a step may use. Set `permissionMode:` on a step to choose.

Whichever you pick, the engine makes the consequence visible rather than mysterious: a session
waiting on a person is reported as `needs-human`, and a step's `deadlineSeconds` is what stops one
holding a concurrency slot forever.

## Layout

| file | |
|---|---|
| `src/workflow.ts` | the format: parse a folder of markdown; refuse an unknown key, a cycle, a dangling `after`, a loose `output:` schema, an `input:` on work that has not finished, or a loop a round could not run |
| `src/run.ts` | **`assess`** and **`stepStatus`** — pure: which steps are ready, due a check, another try or another round, blocked, done — and what a step is told, `## From <step>`, `## Try <n>` and `## Round <n> of <N>` included |
| `src/check.ts` | the check — pure: the harness the run hands the engine, the verdict, the contract |
| `src/deps.ts` | what a worktree is given — pure: the `node_modules` plan, `.worktreeinclude`, and the line a step is told |
| `src/runner.ts` | the I/O: run store, git worktree and what it is given, and the engine |
| `src/cli.ts` | the verbs |

`assess()` is pure and has no idea the engine exists; `runner.ts` is the only file that imports it,
and `test/boundary.test.ts` fails the suite the day another file does — a type import included. Same
split as the engine, one layer up.
