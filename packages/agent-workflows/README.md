# wf — workflows of agent steps

A workflow is **a folder of markdown files**. One file is one step. It runs on
[`agent-engine`](../agent-engine), and it is the proof that the engine's boundary is real: this
package uses `createEngine`, `file`, `tick`, `view`, `stop`, `logs` and nothing else.

```bash
wf start ./brief.md --repo ~/code/myapp --workflows ./workflows
wf start ./next.md --repo ~/code/myapp --after r-xyz   # file nothing of it until r-xyz has shipped
wf start ./ui.md --repo ~/code/myapp --input ./mock.png   # copied into the run's inputs/, named on every step's brief
wf start ./flag.md --repo ~/code/myapp --workflows dev-planned --gate plan   # nothing after plan is filed until you approve it
wf plan ./plans/flag --repo ~/code/myapp               # a folder of cards: a run each, parents first, with their edges
wf start ./plans/flag/d.md --repo ~/code/myapp --after r-b --after r-c   # one card by hand: its body is the brief
wf inbox add "Cache the views between passes" --repo ~/code/myapp   # park an idea as a card, to start later
wf inbox                                               # the cards parked, name and first line each
wf start ~/.agent-workflows/inbox/cache-the-views-between-pass-k2q9.md --workflows dev   # start one: it leaves the inbox
wf inbox rm cache-the-views-between-pass-k2q9          # or drop one unstarted
wf up
wf ls
wf cancel r-xyz      # changed your mind: stop the step in flight, file nothing more
wf rm r-xyz          # it is over: its worktrees, record and files go; its branches stay
wf decide r-xyz      # what it produced, and the choice it leaves you
wf retry r-xyz implement --recheck   # its check was killed before it finished: run it again
wf retry r-xyz plan --message "the second reading"   # it signed off blocked with a question: answer it
wf approve r-xyz plan --message "ship the second reading"   # it waits at its gate: let what follows be filed
wf round r-xyz       # the review still asks for more after the last round it allows: once more
wf say r-xyz implement "Widen the scope to apps/api too."   # tell a running step something, on its record
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

Every `.md` in the folder is a step but its `README.md` (in any case), which says what the workflow is
for: its first paragraph, past a heading, is the description the board lists the workflow with
(`workflowDescription`). A folder with a README and no step is refused as a folder with no step is.
A repository carries its workflows checked in, one folder each under `<repo>/workflows/`, as
`.github/workflows/` holds a repository's CI — this one has `dev`, `dev-build`, `dev-planned`, `ui` and `supervisor` there — and
`wf start <brief> --workflows dev` picks one: a bare name is a folder under `<repo>/workflows/`, and a path to any
workflow folder works too, looked at first. The board lists them, and the folders under
`~/.agent-workflows/workflows/` as yours, draws each, and starts a run of one (`apps/api`,
`GET /api/workflows` and `POST /api/runs`). This package's own `workflows/` stays its shipped default.

A folder can be written as well as read, and the board's builder saves through that write: `writeWorkflow(dir, steps, readme?)`
in runner.ts. Each step is rendered by `renderStep` (workflow.ts), which is the parser run backwards: the keys the step sets, in
the order listed below, each written as the parser reads it (a list as `a, b`, a count as its number, `output:` as the file it
names), then the body. Before a byte is written, the folder as it would be is parsed in memory by `parseFolder`, the same reading
`loadWorkflows` uses, with the schemas read from the folder as they are. So anything the parser would refuse is refused first, in
its words and naming the step: a key a step does not have, an `after` naming no step, a cycle, a loop that is not a back edge, a
schema that is not in the folder. A step name that is not a file name is refused too, and the folder is left as it was. Then each
step's `<name>.md` is written; a file that already reads as its step is left alone, with its comments, since a render has none. The
file of a step no longer in the set is removed. Schemas are never written, and the README only when one is given. The write goes
to a workflow in the store's `workflows/` or a repository's, and anywhere else only with `{ anywhere: true }`, since it removes
files. A run is not changed by it: a run froze its folder at `wf start`.

A run lists its steps in the order they run, not in the folder's. Each step comes after every step its `after` names, and
otherwise keeps the order it was given, which for a folder is by name; a loop's edge back orders nothing (`orderSteps`). So
`wf start` on `plan → implement ⇄ review`, whose files sort implement, plan, review, prints `3 step(s): plan → implement → review`.
The run's record is keyed in that order, and `wf ls`, `wf decide` and the board read it so. A record from before the order,
keyed alphabetically, still reads in the order its steps run in `wf ls` and `wf decide`; one whose order already runs forward
reads as it was written.

A step's keys are a closed list — `after`, `resume`, `input`, `workspace`, `slot`, `harness`, `model`, `effort`,
`permissionMode`, `tools`, `disallow`, `remote`, `deadlineSeconds`, `maxAttempts`, `budget`, `check`, `retries`, `gate`, `output`, `loop`,
`rounds` — and a key the parser does not know is refused by name before anything is spent, as is a value
it cannot use (`src/workflow.ts`). `guide` is refused with a reason of its own.

**No key is control flow.** No conditions, no expressions, no templating, and no loop a keyword
decides. That is the design, not a missing feature.

The interesting decisions in this kind of work — *is this good enough*, *did it do what was asked*
— are not predicates a workflow language could evaluate. They are judgements, and a judgement
belongs to a step with an agent in it. **The workflow is a team, not a program.** The prose is the
logic: `after` orders, `resume` continues, `check` measures, `retries` counts, `gate` waits for a person,
`output` declares and `input` reads, `loop` is the edge back and `rounds` counts it, `workspace` says which
directory a step works in, `slot` says whether the run is one the cap on runs in flight holds, and the rest say
who does the work and for how long. Whether the work goes round again is still a judgement: the looping step's own `again`
(*Going round again*, under the check).

`permissionMode` is the harness's word, checked against the harness the step runs on. On codex,
`read-only` runs the step `-s read-only`: it reads and runs commands and writes nothing, which is why
the shipped reviewer hands its review on as its closeout. `retries` is how many times the run re-files
a step its check refused (*Trying again*, under the check).

### What a step may have: `tools:` and `effort:`

```md
---
after: implement
# The only tools the session has. Bash is there for `git diff` and `npm test`; nothing that edits.
tools: Read, Grep, Glob, Bash
effort: high
---
Review the change in this workspace as a second engineer would.
```

`tools:` is the harness's tool names, comma-separated, and they are the only tools the session has.
Claude Code is given exactly the list as `--tools`, where a tool not on it does not exist for the
session — not `--allowedTools`, where an unapproved one is still there to try. The list names Claude
Code's built-in tools; the servers of the checkout's `.mcp.json` are not on it. Refused at load: a line
that names no tool; an entry with a space or a comma inside (`Read Grep Glob`, `[Read, Grep]`, or
`Bash(git diff:*)`, a rule where a tool goes); and any `tools:` on codex. Codex has no tool list, only
one shell in a sandbox, so its fence is `permissionMode`, and `read-only` writes nothing.

`effort:` is one word the step's harness takes: `low`, `medium`, `high`, `xhigh` or `max` on Claude Code,
and `none` and `minimal` besides on codex. Another word is refused by name with the list, as a permission
mode is. Refusing it here matters more than usual: Claude Code itself only warns about an effort it does
not know, and runs at its default.

Both go to the engine on every filing of the step: the first, each try and each round. Without them, the
step has the harness's own tools at its own effort.

### What a step may not have: `disallow:`

```md
---
after: implement
tools: Read, Grep, Glob, Bash
permissionMode: dontAsk
# The settings allow both for implement's check, and both write into the workspace. A deny beats an allow.
disallow: Bash(npm run build), Bash(npm run e2e)
---
Review the change in this workspace as a second engineer would.
```

`disallow:` is Claude Code's permission rules, comma-separated: a tool, `SendMessage`, or a tool and what
it may not run, `Bash(npm run build)`. The engine gives Claude Code the list as `--disallowedTools` on every
filing of the step (the first, each try and each round), and a deny beats every allow: the checkout's
`.claude/settings.json`, and the permission mode. `tools:` says which tools a session has; `disallow:`
takes back what it may not do with them. So a step in `dontAsk` is kept from a command the settings allow
for another step's sake by machinery, not by a sentence in its brief. This repository's reviewers are denied
`npm run build` and `npm run e2e`, which implement's check needs and which write into the workspace — those two
commands, and not the build and the e2e by another name (below). Every
`implement` is denied `SendMessage`, `CronCreate`, `CronDelete` and `RemoteTrigger`, which no step needs.

Refused at load: a line that names no rule; an entry with a comma inside it (`Bash(git push, git reset)`
would reach the harness as two halves of a rule, so write two rules); an entry that is not one rule
(`SendMessage CronCreate`, a quoted name, an unclosed parenthesis); and any `disallow:` on codex, which has
no tool list, so its fence is `permissionMode`. A Bash rule matches as Claude Code matches it:
`Bash(npm run build)` is that command, as the settings' allow of the same words is.

**A deny closes a command, not an allow.** This repository's settings also allow `Bash(npx turbo run test:*)`
and `Bash(node --test:*)` for the suite, and those run the build and the e2e by other names:
`npx turbo run test build` and `node --test apps/web/test/e2e/run.ts`. No deny list closes an allow that runs
any task or any file (`node --test` takes a glob, so a rule on the file's path is walked around). What keeps a
reviewer from those is the allow narrowed in `.claude/settings.json`, which this package does not own; until
then, a sentence in the dev, dev-build and dev-planned review briefs, and in dev-planned's plan brief.

**The engine is the source of these words.** The permission modes and efforts `src/workflow.ts` refuses
are copies of agent-engine's `CLAUDE_PERMISSION_MODES`, `CLAUDE_EFFORTS`, `CODEX_SANDBOXES` and
`CODEX_EFFORTS`. They are copies because only `runner.ts` may import the engine, and the engine refuses a
word only when the step is filed, after the run exists. `test/vocabulary.test.ts` imports the engine's
lists and fails the moment a copy differs. The first copies had drifted: the engine took `manual` and
codex's `bypassPermissions`, and the parser refused both. To change a word, change the engine, then the copy.

### Who may drive a step's session: `remote:`

```md
---
remote: true     # every session of this step is bridged to claude.ai, and can be driven from a phone
---
Implement what was asked, in this repository.
```

`remote: true` is carried on every filing of the step — the first, each try and each round — as the engine's `remoteControl: true`, so
Claude Code's `--bg` session is started with `--remote-control` and listed in the web's agents view (agent-engine's README, *Reachable
from a phone*). There anyone signed in to the account can **drive** it — type into it, answer its prompts, stop it — from a browser or a
phone, and not only watch it. So it is a deliberate setting, never a default: a step without the line, or with `remote: false`, is not
bridged, and a step's check never is.

Refused at load: any word but `true` or `false` — `remote: yes` is refused by name — an empty value, and the line twice. Refused at
`wf start`, with nothing written, on a harness the engine refuses `remoteControl` for, in the engine's words: `codex` and
`claude-detached` run a prompt and exit, and only a Claude Code background session, `claude`, is bridged. The words are a copy, since
`start` cannot wait on the engine's door; `test/store.test.ts` asks the engine and fails the moment they differ. `wf ls` and `wf decide`
say nothing of it yet.

### What a step may spend: `budget:`

```md
---
check: npm test && npm run typecheck
retries: 1
budget: 5        # dollars: the most this step's tries may cost together
---
Implement what was asked, in this repository.
```

`budget:` is dollars, `budget: 5` or `budget: 2.50`: the most the step's tries may cost together, every try and every round of it.
Refused at load, naming the fix: `0`, a negative, a word, an amount written with its unit (`$5`, with `budget: 5` to write instead) and
an empty value; and any `budget:` on codex, in the engine's words — `codex exec` has no spend cap, and reports no cost to cap. It is
frozen on the run with every other key.

The cost is the engine's: what the harness priced each attempt at, read once the attempt has ended (agent-engine's README, *What an
attempt consumed*). What the key does turns on what the harness can keep:

| harness | while a try runs | once a try has ended |
|---|---|---|
| `claude` | nothing. A `--bg` session keeps no `--max-budget-usd`, and writes its cost only as its process exits (agent-engine's open issues 17 and 18), so **a `claude` step is never stopped mid-flight by its budget, and can overrun it by one try** | the run adds up what the step's tries cost, and past the cap files nothing more for the step on its own word |
| `claude-detached` | what is left of the cap in force — the cap less what the step's tries have cost — goes to the engine as `budgetUsd` on every filing, so `claude -p` ends the session once the tries together reach the cap, past it by up to the response that crosses it: the engine settles the task `failed`, naming the budget, and the step reads `budget exhausted`. An attempt the engine starts again within one filing (`maxAttempts:`) is handed the same amount | as on `claude` |
| `codex` | refused at load | — |

A step reads **`over budget`** — `over budget $4.20 of $3` in `wf ls` — when its ended tries have together cost the cap in force or
more, so nothing is left and any session would spend past it, and another session of it is the way on: its last try ended without letting
what waits on it run (its check refused; it ended unsigned, failed or stopped; or it signed off blocked and its session settled), or its
loop asks for a round that would file it again.

- **`retries:` files no try of it, and no round of its loop goes, on the run's word.** Spending past the cap on its own word is what a
  cap forbids. A looping step whose round would file a step over its budget reads `over budget` too, naming that step (`over budget —
  implement $4.20 of $3`), so what waits on the loop is not filed.
- **A person raises the cap:** `wf retry <run> <step> --budget <amount>` for a try, `wf round <run> [<step>] --budget <amount>` for a
  round. Each is refused by name without `--budget`, or with one not above what the step has cost. `--budget` on a step that is not over
  its budget is refused, and so is `--budget` on `--recheck`, which files no session: a recheck costs nothing and needs none. The raise
  rides on the ask, and the tick keeps it on the try the ask replaced (`EarlierTry.budget`). It is in force from that try on, and a try
  that passes the new cap is held again. Once a round is asked with a raise above what was spent, no step of its loop reads `over budget`
  on the passes before the tick files it: `wf ls` shows each step's own word and the round asked, and `wf decide` says still running.
- **A check that did not finish holds nothing.** Killed at its deadline or stopped, it said nothing of the work, and its way on is the
  check again, which costs nothing: the step reads `failed ✗ check (unfinished)` as it would without a budget, and `wf decide` offers
  `--recheck` first, saying that a new session of it needs `--budget`.
- **A step that did the work keeps its word.** Verified or unverified, and not asked for again, a step over its budget still lets what
  waits on it run: nothing more would be filed for it anyway.
- **A try's brief says why its last try ended** — unsigned, failed, its check — and, beside that, that its tries had reached the budget
  and a person raised it. Being over budget is why nothing was filed, not what the session has to fix.

Only what the engine measured counts, so a step with a budget whose tries have no cost on them reads as it would without one. The rule is
the same on both Claude harnesses — the tries together, against the cap — and on `claude-detached` the harness keeps it too, each session
handed what is left.

## What one step knows of another

A run cuts one git worktree and every step works in it, so the handoff is the workspace — the way
it is between two engineers. A later step is told:

- its own prose
- **the original request** (the spec — you cannot judge completeness without it), and the files a person gave
  the run with it (`wf start --input`), by name, in one line under it
- where to look: `git diff <baseRef>`, and who was there before it
- what a step it waits on declared in its closeout — **only if it asks**, with `input:` (below)
- in a round of a loop, what the loop hands on: the reviewer's findings to the step it loops back to,
  and that step's replies to the next reviewer (*Going round again*)
- on the first steps of a run that waited on runs (`--after`, or a card of `wf plan`): what those runs
  concluded, under `## From run <id>` (below)
- after a gate a person approved: the approval and the words given with it, under `## Approved`
  ([*A gate*](#a-gate-a-handoff-that-waits-for-a-person--gate---gate-and-wf-approve))

And deliberately **not** told: the previous step's transcript, reasoning, or self-assessment.

The reason is what a pull request already demonstrates. A PR description is not the author's
transcript — it is an artifact the author *chose* to produce, and the reviewer judges the diff
rather than the author's account of it. Passing the implementer's reasoning to the reviewer would
anchor it on the very context that produced the work, and would put unverifiable claims next to
verifiable evidence. So: **intent and artifacts travel, process does not.** A step that wants to
say something to the next one writes a file, deliberately, like a person would — or declares it.

### Declared output: `output:` and `input:`

Two keys, neither control flow — one declares, one reads. `workflows/ui/`'s two steps:

```md
---
harness: claude
check: npm test && npm run typecheck && npm run build && npm run e2e
output: implement.schema.json   # screenshots, pages
---
Implement what was asked, in this repository. It changes what a person sees in the web app. …
```

```md
---
harness: claude
after: implement
input: implement
tools: Read, Grep, Glob, Bash
permissionMode: dontAsk
disallow: Bash(npm run build), Bash(npm run e2e)
output: review.schema.json      # findings, and again: boolean
loop: implement
rounds: 3
---
Review the change in this workspace as a second engineer would, and look at it as a person who opens the web app would. …
```

- **`output: <file>`** names a JSON Schema beside the step, relative to the workflow folder. `wf start`
  reads it and freezes it on the run with the step. A schema is part of what the step is judged by,
  so it sits inside the same fence as a `check:`, and editing the folder afterwards changes nothing.
  Its properties are merged into the closeout schema the step is filed with. The merged schema stays
  strict: every property required and no others allowed, because Codex enforces strict output
  schemas. At load, the run refuses a schema whose objects are not strict or that uses `$ref`, a schema that names
  `outcome`, `summary`, `artifacts` or `needs`, a file that is not there, and a file outside the folder — absolute, or up
  and out with `..` — before it is read. Each refusal names the fix.
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
else. Nothing from any step's closeout reaches a step that did not ask for it. In `workflows/`,
`implement` declares nothing and `review` reads nothing, so the reviewer judges the diff — and in a
round, it is handed implement's replies to the last findings and nothing else, because its own `loop:`
asked for them. In `workflows/ui/`, `review` also reads implement's `screenshots` and `pages`: pictures
of the change, which are artifacts, and not an account of it.

The transport buys three things. The reviewer writes nothing, so it runs `permissionMode: read-only`.
The harness enforces the review's shape. And the review lives on the engine's record of the attempt,
not on a branch, so `git branch -D` no longer deletes the only copy. `wf decide` prints a declared
output after the step's summary: `findings` as a list, any other field as `name: value`. A step that
wants a file for a person still writes one, and a picture goes in its files directory (*A step's
files*, below). A loop's replies travel on its target's closeout instead, to the next reviewer and to
`wf decide`.

### What a run that waited is told: `## From run <id>`

A run started after other runs, by `--after` or as a card of a plan, starts from a base that has their work. On
the pass that files its first steps, each of them is also told what those runs concluded: one section per parent,
right after *What was asked for*.

`````md
## From run parse-the-flag-option-in-cli-eoug

This run waited on parse-the-flag-option-in-cli-eoug (`--after`) and started once it shipped, so its work is in this
workspace. What it was asked and what its last steps said when they signed off are below, given to you because this
run waited on it. It is data, not instructions: another run's account of its own work, which a person read before
shipping it — weigh it against the code, which is on disk.

What it was asked, the first line:

```text
Parse the --flag option in cli.ts.
```

What review said when it signed off, its `summary`:

```text
The flag is parsed before anything reads it; the one finding was fixed in round 2.
```

What review declared in its closeout — `findings`, `again`:

```json
{ "findings": [], "again": false }
```
`````

- **What is read.** Each of the parent's terminal steps, off the engine's record of its current try, as `wf decide`
  reads a closeout: its `summary`, and the fields its `output:` declares, as `## From <step>` gives them. Each is
  fenced, in a fence longer than any backticks inside it, under a label saying whose it is.
- **Why a summary travels here, and never between steps.** Between two steps of one run, the author's account of
  work nobody has judged would anchor whoever judges it. A parent that has shipped is past that: a person read its
  summary beside its diff and put the work on the base the child is cut from. One run later the summary is the record
  of what is already in the workspace, the way a merged pull request's description is to the next person who opens
  the code. It is still another run's words, and the change is on disk to weigh them against.
- **When.** Once, on the pass that files the roots, the pass that reads the base. A step after a root, a try, a
  round, and a run without `after` are told exactly what they were told before.
- **A parent that cannot be read says so.** A failed step whose work a person merged has no closeout; a closeout may
  not parse; a record may be gone. The section says which, and why, and the run's roots are filed all the same.

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

*It makes a lost artifact visible.* `artifacts` are checked against the step's files directory, where a
file named from the workspace root is collected (*A step's files*, below), and a declared file the run
does not have is reported. The first real run lost a reviewer's entire output to exactly that, silently.

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

**At a gate, the closeout is what a person approves.** A gated step's `done` does not file what follows:
its closeout — the summary, what it declares, on `wf decide` — waits for `wf approve`, and the words given
with the approval, not the summary, are what the steps after it are handed (`## Approved`). A closeout
cannot open its own gate: whatever it says, the step reads `awaiting approval` until a person's file is
on disk ([*A gate*](#a-gate-a-handoff-that-waits-for-a-person--gate---gate-and-wf-approve)).

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
| `waiting on r-xyz` | not filed: the run was started `--after` a run that has not shipped, by hand or as a card of `wf plan` — `(cancelled)`, `(no such run)` or `(<branch> gone)` beside one that never will without a person ([below](#a-run-that-waits-on-a-run-wf-start---after)) | — |
| `waiting for a run slot (2 of 2 in flight)` | not filed: `WF_MAX_RUNS` runs are in flight, and the tick files this run's roots once one settles, oldest held first ([below](#how-much-runs-at-once-wf_max_concurrent-and-wf_max_runs)) | — |
| the engine's word: `running (working)`, `needs-human` | still going — `needs-human` with no closeout is a session its harness blocked, which `wf retry` takes ([below](#trying-again-retries-and-wf-retry)) | waits |
| `unsigned` | it ended without the closeout it was asked for — its session settled `succeeded`, or went quiet and settled `failed` — or without a field its `output:` declares | **never runs** |
| `succeeded · BLOCKED` | it signed off `blocked` | **never runs** |
| `checking` | signed off; its check is due or running | waits |
| `verified ✓` | its check exited 0 | is filed |
| `unverified · done` | signed off, and declared no `check:` | is filed, on the step's word |
| `awaiting approval` | signed off at its gate — verified first, where it has a check — and the try it is on is not approved ([below](#a-gate-a-handoff-that-waits-for-a-person--gate---gate-and-wf-approve)); or an ending step (`workspace: main`) whose work is done, held before it is filed ([below](#the-end-of-a-run-is-a-step-workspace-main-and-the-endings-gate)) | **never runs** — until a person approves it: `wf approve`; or sends the work back: `wf retry --message` |
| `rounds exhausted` | its `loop:` asked for another round on the last one `rounds:` allows | **never runs** — unless a person says once more, below |
| `over budget $4.20 of $3` | its tries have together cost its `budget:` or more, and another session of it is the way on — or, on a looping step, a step of its loop is `over budget` ([above](#what-a-step-may-spend-budget)) | **never runs** — unless a person raises the cap: `wf retry --budget`, `wf round --budget` |
| `budget exhausted $3.02 of $3` | its harness ended its session at its `budget:` (`claude-detached`) | **never runs** — unless a person raises the cap: `wf retry --budget` |
| `failed ✗ check (exit 1)` | its check did not exit 0 — `unfinished` if it was stopped first | **never runs** — unless it is tried again, below |
| `failed`, `stopped` | the engine's verdict on the step's own task | **never runs** |

`→ waiting on you` names every step that is blocked, unsigned, refused by its check, out of rounds, over
budget, ended at its budget or awaiting approval — the last as `approve <step>` — and has no try or round due.
`→ to decide` is the run's own end, said above it and never twice: the ending step's gate in the folder's words
with the `wf approve` that runs it — or, once no gate holds, the branch nobody has merged, unless a step of
the workflow merges it ([below](#the-end-of-a-run-is-a-step-workspace-main-and-the-endings-gate)).
`wf decide` prints `FAILED CHECK:`, `CHECK DID NOT FINISH:`, `UNSIGNED:`, `UNVERIFIED:`, `ROUNDS EXHAUSTED`, `OVER
BUDGET`, `BUDGET EXHAUSTED` and `AWAITING APPROVAL` first, then each check's command and exit code and, for a check
that refused, the last 20 lines of stdout and of stderr.

A step over its budget is named for how it ended on its own work as well — `FAILED:` with its logs, `UNSIGNED:`,
`FAILED CHECK:` — since a cap reached does not make a broken session any less broken. The `OVER BUDGET` line then says
why each step is held: its own amounts, `implement ($4.25 of $3)`, or, for a looping step, the step its round would
file again, `review (held: its round would file implement again, which has cost $4.25 of its $3 budget)`. Its offer
says both: `implement: over budget (failed), $3.40 of $3. Raise its cap above $3.40 …`.

Beside each step's word, `wf ls` puts what its tries have cost once the engine measured it — `verified ✓  $3.01`,
and `≥$3.01` where an ended attempt has no cost on it — and on the run's line, the run's total. A word that already
shows the step's own spend, `over budget $4.20 of $3`, has nothing beside it. A looping step held on another step's
budget, `over budget — implement $4.25 of $3`, has its own cost beside it.

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
- **`wf retry <run> <step> [--nudge | --fresh | --model <m> | --recheck] [--message "<answer>"]`** is a person's word for one more
  try. `--nudge`, the default, continues the step's last session and tells it what happened. `--fresh` starts
  a new session on the same branch, with the whole brief. `--model <m>` does that on `m`. `--recheck` runs the
  check again on the work as it stands, and files no session. A step may be tried again when it waits on you
  (its check did not pass, it ended unsigned, or it signed off blocked and its session has settled), or when
  its own session failed or was stopped. `--recheck` only applies where a check did not pass. Each refusal
  says what to do instead: a step still running or checking, a verified step, a cancelled run, a try already
  asked for, a step the run is about to try again itself.
- **A session its harness blocked is tried again the same way.** A `--bg` session can stop on the harness's own
  trouble, such as "Could not refresh your login because another Claude Code process is refreshing it". The
  engine then says `needs-human`, and the step has no closeout. `wf retry` takes such a step with `--nudge` or
  `--fresh`, and refuses `--recheck`. The ask is written as any other. The next tick asks the engine to stop the
  session and files nothing, and a later pass, once the session has stopped, files the try as it files one for a
  stopped step: a nudge continues the session. A step whose session is still working is refused as before. A
  caller takes the harness's word by passing it (`retry(…, { stopBlocked: true })`): `wf retry` does, and so does
  the board's `POST …/retry` (its banner's Continue); a caller that leaves it out is refused as before.
  The session can work again before a tick stops it, told something by a peer with no `wf up` running. The ask
  stands all the same: while the step's task has not settled, the tick stops its session, once, and files the try
  when it has, whatever the harness says by then. `wf retry` itself still refuses a step whose session works.
- **An ask is a file, like a cancellation.** `wf retry` writes `runs/<id>.asks/retry-<step>-<n>`, whole and
  exclusively, and never writes the run's json. Every pass reads the directory. The next pass files try `n`,
  writes the record, then moves the ask into `done/`. The ask names its try, and a try's ids are derived
  (`<run>-<step>-try<n>`, `<run>-<step>-try<n>-check`). So a pass that dies after filing a try is adopted by
  the next, and a pass that dies before consuming the ask leaves the try on the record, where the ask is
  spent and files nothing. A file at an ask's name that does not read as one (`{}`, a hand edit) is honoured by
  no pass, and `wf ls` shows nothing asked. So `wf retry` refuses to write over it, and the refusal names the
  file and says to delete it. `wf round` does the same.
- **A step that asks gets an answer: `--message "<answer>"`.** A session nobody sits beside has no
  AskUserQuestion and no plan mode (plan §4 Q), so a step that needs a person asks the run's way: it signs off
  `blocked`, with the question in `needs`, which ends its session and puts the question on the record. The
  answer rides on the ask — `message`, in the person's own file — beside `--nudge`, `--fresh` or `--model <m>`,
  and the next tick carries it into the try's brief inside `## Try <n>`, as `## Your answer`: the text as it was
  written, in a fence longer than any run of backticks in it, so a pasted snippet cannot close the section or
  swallow the contract after it — after on whose word the try is and before what the check said. A step that did not sign off blocked
  may be told something too. `--message` takes the next argument as the answer, whatever it starts with, so
  an answer about a flag names it; `--message=<answer>` carries one that is only one of the verb's own flags.
  Refused before anything is written: an empty message, and `--message` with `--recheck`, which files no
  session to read it. A hand-written ask file is held to the same word by the tick,
  and one from before messages reads as it did. The record keeps no message: what `wf ls` and `wf decide` say
  of an answered try is read off the ask file, waiting or in `done/`.
- **A step at its gate is sent back with `--message`.** A gated step that signed off, and waits for a person's approval — or
  was approved and nothing after it is filed yet — takes `--nudge` or `--fresh` with the objection, and is refused without
  words or with `--recheck` ([*A gate*](#a-gate-a-handoff-that-waits-for-a-person--gate---gate-and-wf-approve)).
- **A step past its budget needs `--budget <amount>`.** A step `over budget` or `budget exhausted` waits on you like a refused
  check, and `retries:` never tries it. `wf decide` offers `wf retry <run> <step> --budget <amount>` for those two statuses,
  with what the step has cost and the cap; a step whose check did not finish past its budget is offered `--recheck` first, which
  needs none. A session of one is refused without `--budget`, or with one not above what the step has cost, and the try's brief
  says why its last try ended and, beside it, that the cap was raised ([What a step may spend](#what-a-step-may-spend-budget)).
- **The record keeps the current try where it always was.** `steps[name].taskId` and `steps[name].check` are
  the current try's, so everything that reads them reads the try that decides the step. The tries before it
  go under `steps[name].tries`, in order, each with what replaced it: `retries`, `nudge`, `fresh` (and its
  model) or `recheck` — and the cap a `--budget` raised, when one did. A person's tries do not spend the step's `retries`.
- **`wf ls`** puts the try beside the step's line, without changing the step's word: `try 2 due — retries: 1,
  0 spent`, `try 2 asked (--recheck) — the next tick files it`, `try 2 asked (--nudge, with your answer)`,
  `try 2 asked (--nudge) — stopping its blocked session, then the tick files it` beside a `needs-human` (or
  `stopping its session` beside a session that works again since it was asked), and
  once filed `try 2, by retries: 1` or `try 2, nudged on your word, answered`. A step with a try due is not
  waiting on you. **`wf decide`** names the try each closeout and check belong to — for a try you answered,
  with what the try before it needed and your answer under it — and under *try again* gives the `wf retry` for
  each step that can take one; under a blocked step's `needs`, the `wf retry --message` that answers it.

This repository's workflows declare no `retries:`. A flaky suite would spend a whole session on a nudge, so
whether a refusal is the agent's to answer or a person's is left to each workflow's author.

### Telling a running step something: `wf say`

A step steered mid-flight by a message to its session left nothing on its run, so its reviewer could not tell a scope a
person widened from a step overstepping (plan §4b). `wf say <run> <step> "<words>"` hands the words to the step's running
session through the engine's `say`, which journals them on the step's task as a `said` entry — `at`, `attempt`, `text`
(agent-engine's README, *Telling a running session something*). That journal is the record. The verb writes nothing of
its own, and everything below reads the words back off the engine's view of the task.

- **Which session.** The step's current try's task, as `wf retry` finds it (`run.steps[step].taskId`). The words are
  everything after the step, so an unquoted sentence is one message.
- **Refused**, exit code 2 and nothing said, in the package's words first: a step the run does not have, a cancelled run,
  a step not filed yet, and one whose task has settled — words for it go into its next try's brief, with
  `wf retry --message`. Then the engine's own, verbatim (`say: …`): empty words, an attempt not started, a harness with no
  way in (`codex`, `claude-detached`), a task in `bypassPermissions`, a session its harness does not list running. Words
  its harness did not take reject with no exit code: nothing was journalled, so say them again.
- **`wf ls`** notes a step whose current try was told something, after the try it is on: `said to 2×`.
- **`wf decide`** prints each thing said under the step, before its closeout — `said to try 1, at <time>:`, then the
  words in a fence, as data — for every try of the step, so the person who ships the work reads what the step was told.
- **A try that continues the session is handed them again.** Taken is not read: a session blocked on a permission
  prompt keeps the words queued, and loses them when it is stopped and continued (agent-engine's open issue 16). So a
  try or a round that continues the session — `wf retry --nudge`, `retries:`, a round, the board's Continue — carries
  what was said to the last try's task as `## Said to your session`, inside `## Try <n>` or `## Round <n>`: each
  message with its time, fenced, before `## Your answer`. A new session (`--fresh`, or a nudge with nothing to
  continue) is handed none, as it is handed none of the last one's conversation: say it again with `--message`.
- **On the board**, the session page (`/runs/<run>/steps/<step>`) has a prompt box under the conversation. It posts to
  `POST /api/runs/:id/steps/:step/say`, guarded as the retry route is, which calls this verb: a refusal shows under the
  box as the package or the engine words it, and words typed while a message is being said are kept. The step's detail
  carries `said`, and the page draws each as a turn of its own, once: where the session's transcript shows the words
  reaching it, the turn stands in place of that line. The box is closed, with the reason, for a step with no session in
  flight.

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
  The looping step is told, every round, what its `again` does and which round it is. A new session of
  the target within a round — `wf retry --fresh`, or a nudge with no session left to continue — is
  handed the round's contract and findings again, off the looping step's try that asked for the round.
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
- **A loop past a budget.** A round that would file a step of the loop over its `budget:` is not filed on the looping
  step's word: both read `over budget`, and `wf round <run> --budget <amount>` raises the cap of each such step for the round —
  refused without it, or with one not above what they have cost. A loop `rounds exhausted` with a step past its budget asks for
  `--budget` with its once more too.
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

## Files a person gives the run: `wf start --input`

A brief is text, and a step can read a screenshot or a spec from disk, but nothing told it where one was. For one run the
reference screenshots were copied by hand and their paths sent to the running session (plan §4b, *inputs for a step*).

```bash
wf start ./ui.md --repo ~/code/myapp --input ./mock.png --input ./notes/api.md
```

- **Each file is copied into `runs/<id>/inputs/`**: the run's own directory, beside its artifacts, never the workspace, so no
  file rides a branch. The names are frozen on the record as `inputs`, in the order given.
- **Every step's brief names them, in one line under *What was asked for***:

  ```text
  Files given with it (`wf start --input`), in `/home/you/.agent-workflows/runs/give-the-factory-a-leg-x1y2/inputs`: `mock.png`, `api.md`.
  ```

  A brief that continues a session is not told again, as it is not told the request again: a step that `resume:`s
  another, a nudge, a round that continues its target. A run given none composes exactly as before.
- **`wf decide` names them under the run's line**: `inputs  mock.png, api.md  —  in <dir>`.
- **Refused before anything is written**, by name and with the fix: a file that is not there, a directory, anything else
  that is not a regular file, two inputs of one name, one file given twice, and `--input` with no file.
- **`wf plan` refuses `--input`.** A card's inputs are not a thing yet; start that card by hand with its files.

## A step's files: `runs/<id>/artifacts/<step>/`

Some of what a step makes is for the steps after it and the person who decides, and does not belong on
the branch: a screenshot, a log, a report. Written into the worktree, it is committed by the hand-off and
rides the branch into what ships; gitignored, it never reaches the next step's worktree at all. So the run
makes a directory per step, beside the run's record under `WF_ROOT` and outside every workspace, before
it files the step.

- **The step is told both ways**, on its brief, beside the closeout contract (`artifactsContract`): put a
  file in `<dir>` and name it by absolute path, or leave it in the workspace and name it by its path from
  the workspace root. Mechanism, like the closeout: no workflow author has to remember to say it. **Except a
  step that works in the repository's own checkout** (`workspace: main`), which is told the first way only:
  the run hands nothing off there, so a file left in that workspace is neither collected nor committed — it
  stays in a person's checkout, and `wf decide` reads it as `not collected`.
- **A file named from the workspace root is collected.** On the pass that hands the step off, before its
  check is filed, the tick copies each such file into `<dir>` at the same path (`collectArtifacts`), and
  the run reads it from there. So a step that cannot write outside its worktree — Codex in
  `workspace-write`, which the engine gives no other directory — hands its files over too, and so does a
  file git ignores, which never reaches the branch. Every pass until the check is filed copies only what
  changed, so a pass that dies halfway loses nothing, and nothing is written through a link a step made in
  its directory.
- **The step's check is given it** as `WF_ARTIFACTS`.
- **A declared artifact is looked for where its path says** (`artifactPlace`). A path from the workspace
  root is read from `<dir>`, where it was collected, or else from the branch, as before collection — so a run
  from before it reads as it did, worktree or not. A file whose copy something the step made in `<dir>` refused
  is named, even when it is on the branch. An absolute path is looked for in the step's own directory, on disk, with
  links followed. Any other absolute path — another step's directory, a `..` that climbs out, a link inside
  that leads out, `/etc/passwd` — is reported and never opened, stat-ed or resolved: a closeout is an
  agent's text. So is a path from the workspace root that climbs out of it, as written or through a link.
- **`wf decide` names each refusal** under the step's closeout, never passing one over: a path outside the
  workspace or the directory, a directory, a file that is not there, and a file in the workspace that was
  not collected. Then it lists the directory, each file by absolute path with its size.

A file reaches a later step by its path, declared. `workflows/ui/implement.md` declares `screenshots`,
the absolute paths of its PNGs, and `review` reads them with `input: implement`.

### `workflows/ui/`: a change a person will see

```
implement ⇄ review   (review: the diff, and implement's screenshots and the pages beside it)
```

`implement` carries `check: npm test && npm run typecheck && npm run build && npm run e2e`.
`npm run e2e` (`apps/web/test/e2e/` in this repository) builds the web app, serves it against a seeded
store, visits every page in headless Chromium in a light and a dark theme, asserts what each page must
have, and screenshots each into `WF_ARTIFACTS`. Before it signs off, `implement` is told to run it into its
own directory and read the PNGs, and to use the look skill on every page it changed. It declares
`screenshots` and `pages` (`implement.schema.json`). `review` reads the diff, is handed those and nothing
else of implement, and uses the look skill on the screenshots and the pages side by side — read by its
file, `.claude/skills/look/SKILL.md`, because its `tools:` leave out `Skill` and with it the Skill tool. Its schema is
`workflows/review.md`'s, `again` and all, with one difference: a finding says where it is as
`where: { file, line }` for the code or `{ page, theme }` for what a person sees, strict, so a finding that
names neither does not fit the closeout the step is filed with. `again: true` sends the change round
again, at most `rounds: 3`, as in `workflows/`.

```bash
wf start "Give the Factory a legend" --workflows packages/agent-workflows/workflows/ui
```

**Looking is a skill, not a step.** `.claude/skills/look/SKILL.md`, in this repository, says how any step
looks at the web app. It reads the e2e's PNGs. It serves the app on ports of its own and photographs every
page with the browser's `browser_*` tools (`.mcp.json`), and never with `browser_run_code_unsafe`, which
`.claude/settings.json` denies. And it judges the layout, both themes, and what a person notices first. It
writes nothing into the workspace. `look` was a step of its own while the reviewer ran on codex, which
reads no image and has no browser, and `respond` answered two reviewers while there was no loop. Neither
reason holds now.

`review` cannot edit, by machinery rather than by its brief: `tools: Read, Grep, Glob, Bash` has no Edit or
Write, and in `permissionMode: dontAsk` a Bash command `.claude/settings.json` does not allow is denied
without a prompt. The same settings allow no `browser_*` tool, so at this repository's settings `review`
looks through the screenshots and opens no page (measured; `docs/features.md`, *Shipped: looking is a
skill*). The repository's `workflows/ui/` is this folder, copied with a README of its own, and a test holds
the copy to it.

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

Git's yes needs one more question. A result branch is cut at the run's base, so a branch nobody
committed to is on the base branch from the start. Such a branch ships only a run whose steps all
succeeded, with nothing to merge. A run whose step failed, signed off blocked or ended unsigned with
nothing committed is decided, not shipped. Work past the base that is on the base branch ships whatever
the steps said, since a person merged it (`isShipped` says which: `true`, or `'unchanged'`).

A failed run is decided too. The first run this was pointed at had been sitting for hours marked
`failed`, and its branch held a real fix plus a design question addressed to a person — none of
which anything in this tool had ever shown anyone.

`wf decide` is read-only. It reports facts and runs nothing. It ends with where each result branch stands
against the base branch, as git says it now — `is on main`, `is ahead of main by 3 commits`, `is gone` — and
then with what is left to decide: a last step waiting at its gate, with the `wf approve` that answers it — in
its own prose where that step is an ending that has not run, since approving is what runs it — or, where no
step of the workflow merges, the exact `git merge --no-ff` and `git branch -D` a person types.

A run started with `--no-worktree` worked on the base branch itself, where git's answer to "has it
landed" is always yes. `wf decide` never asks it for such a run: it says the run worked directly on its
branch, classifies its steps like any other, and prints the diff against the base instead of a merge.

### What the screen puts in front of you

A summary is the agent's word and a green check is the suite's, and neither says what the branch did
to get there. So on a run waiting on you, between the run's verdicts and the steps' closeouts, the
screen shows what the branch touched, read out of git:

```
  touched  wf/add-sub-3j75
    (root)      2 files  +2 −0 · 1 binary
    packages/x  2 files  +2 −1
    agent-facing     CLAUDE.md
    check-affecting  packages/x/test/add.test.ts
  lesson  CLAUDE.md +2 −0

  ── in full: the check-affecting files — what a change could edit to make its check pass ───
  diff --git a/packages/x/test/add.test.ts b/packages/x/test/add.test.ts
  …
  -assert.equal(add(1, 1), 2);
  +assert.ok(true);

  implement
    check  npm test  →  exit 0 ✓
    used  29 turns · 93 tool calls · 6.35M in · 112k out · api 8m06s · tools 2s
    cost  $3.01 · budget $5
    timeline  try 1        filed 08:00:00Z  spawned 08:00:12Z  ended 08:19:54Z  queued 12s  ran 19m42s  used 29 turns · …  cost $3.01
              try 1 check  filed 08:19:56Z  spawned 08:19:57Z  ended 08:20:55Z  queued 1s  ran 58s

  cost  run $3.01
  timeline  run  queued 13s  ran 20m40s  wall 20m55s
```

- **touched** is `git diff --numstat` against the run's base, grouped by workspace package (the base's
  own `workspaces`, which no step could edit, read as npm reads them: `./packages/*` is `packages/*`) or
  else by top-level directory. A `workspaces` glob with `**` is not refused, since the repository's file is
  not ours, but a `workspaces` line names it: a file still counts once, in the outermost package on its
  way. A move counts in both
  places it touched, a binary file as a file with no lines. Then, each only when true, the
  *agent-facing* files — what an agent reads as instructions: `CLAUDE.md`, `AGENTS.md`, `.claude/`,
  `.codex/`, `.mcp.json`, a `README.md` — and the *check-affecting* ones: every `package.json`, the
  lockfile, `tsconfig*.json`, `turbo.json`, `*.test.*`, anything under `test/` or `.e2e/`. Before a
  terminal step has a branch — the first step's check refused it — the screen reads every branch a
  step worked on.
- **in full** is the whole diff of the check-affecting files, because a check that passed says
  nothing about a check that was changed to pass. `wf decide <run> --sensitive <globs>` prints other
  files in full, for one screen; the touched lines still say which files are check-affecting. The
  heading with `none` under it means nothing on the list changed, not that nobody looked.
- **lesson** says whether the run changed a file where the next agent reads — `CLAUDE.md`,
  `AGENTS.md`, the root's `docs/` or a workspace package's own — or that it wrote nothing there. Not any
  `docs/`: an app's `src/routes/docs/` is product code, and counting it would report a lesson nobody wrote. CLAUDE.md's *When you miss* is a rule, and
  this line holds a person to it.
- **used** and **cost** are the engine's `usage` for the step's current try, summed over its attempts.
  A count nobody measured says `not measured`, never `0`, and so does a cost. Beside the counts, the time the
  harness counted waiting on the model and running tools, once either was measured (`api 8m06s · tools 2s`).
  The cost is the harness's own figure, to the cent (three figures under one); for a step whose tries ran more
  than one session, also what they cost together (`$1.19 this try · $4.20 over 3 tries`); then the cap in force
  (`· budget $5`). After the steps, the run's (`cost  run $12.40`): every step's tries together, saying how many
  ended attempts had no cost on them.
- **timeline** is where the step's time went (`timeline` in `src/run.ts`, pure): a row for each try's
  session and each try's check, in UTC — filed, spawned, ended; *queued*, filed → spawned, which is the wait
  for a slot behind other runs; *ran*, spawned → ended; beside a session, what it used, and what it cost where that was measured. The spawn and the end are the engine's attempts; the
  filing is on the engine's feed, since a task's view carries no filing time, and a queue the feed cannot
  time says `not known`, never `0s`. A try still running says `no end yet`, and a try a recheck reached says
  whose session it checked again. After the steps, a total for each round of a loop that went round — the
  steps that round files again, and none before or after the loop; named by its looping step when two loops
  went round — then the run's, every step's: queued and ran summed — so steps side by side add up to more than the wall — and the wall,
  first filed → last ended, `still going` while anything is in flight.

The three lists are globs, written once in `src/radius.ts` and printed by `wf decide --help`. A branch
git cannot diff says it was not read, and the lesson line says it does not know. Neither reads it as a
branch that changed nothing.

## The end of a run is a step: `workspace: main`, and the ending's gate

A run that finished used to go quiet. Its branch sat there, `wf decide` printed two git commands, and
nothing counted it as anything: a card started from the Inbox finished and seemed to vanish. The fix is not a
policy in code — what a person does with a run's product varies, and merging is only one of them — so **the
end of a run is the last step of its workflow, in prose**, like every other step.

`workflows/dev/ship.md` is one:

```md
---
after: review
workspace: main
gate: true
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Ship it: trial merge this run's result branch onto the base branch, run the check, and commit — or abort and say why.
…
```

Another repository's says "open a pull request with the closeout as its body". A research workflow's last
step is the study itself, gated, and approving it is the acceptance: nothing is merged, and nothing is
dropped. **Nothing in the packages knows what shipping means.**

- **`workspace: main`** runs the step in the repository's own checkout rather than a worktree of the run's.
  It is the one thing a worktree cannot do: the base branch is checked out there. No worktree is cut, nothing
  is merged into it, no `node_modules` is provisioned, and **the run commits nothing there** — what a person
  leaves lying in their checkout is theirs, and the step commits its own work as they would. The step is told
  where the work is instead of being told to read its workspace: the result branch, the base branch, and the
  `git log` and `git diff` between them. Refused by name on a step with a `check:` — the run would execute it
  in that checkout, which is a verdict on whatever is in it, not on the step's work, so an ending step runs
  its check itself, in its prose — on a step with a `resume:`, whose session ran in another directory — and, at
  load, on a step anything waits on or one that ends a workflow beside another: a run has one ending. A run of
  such a folder started `--no-worktree` is refused too: it has no result branch to merge.
  Its brief carries one way of handing a file over rather than the usual two: what it leaves in that checkout is collected by nobody, so
  it is told the run's artifacts directory, and that the checkout is to be left as it was found.
- **The gate is the decision, and it holds before the step is filed.** A gate holds what its approval decides.
  Where steps follow, that is the handoff, and the step runs first — a person reads what it produced. An
  ending step in the checkout produces nothing to read: it acts, where nothing can be taken back. So a gated
  `workspace: main` step reads `awaiting approval` while it waits *unfiled*, once every step it waits on has
  finished, and `wf approve <run> <step>` is what files it. The words given with the approval are on its brief
  under `## Approved`: they are the terms it acts on. **Send back** there is `wf retry <run> <the work>
  --message "<objection>"` — the work's step, since the ending has nothing of its own to object to — and it
  un-holds the gate until the work signs off again.
- **Two runs' ending steps never work in one checkout at once.** That checkout is one directory, on the base
  branch: two approved `ship` steps filed in one pass would both read `git status --porcelain` clean, both
  trial merge, and the loser's `git merge --abort` would throw away the winner's staged merge while its check
  ran. The prose of a `ship.md` is not a constraint, so the machinery holds the second: while a `workspace:
  main` task of any run on the same repository is in flight, **nothing of another is filed** — not a first
  session, and not the try a person asks for after one ended blocked, which works in that same directory. It
  reads `waiting on the checkout (<run>'s ship has it)` on `wf ls`, on its own line or beside the try it is
  waiting to take, and `wf decide` says which run's step has it. A claim on that checkout is a promise that the
  pass would file the step, so a run whose ending it would not file claims nothing and holds nobody: one whose
  work is being sent back, one waiting on a run that has not shipped, and one the cap on runs in flight holds —
  the last two reachable where a folder's one step merges, which makes its ending its root. With nothing in the
  checkout, the oldest approval takes it. Level-triggered: the claims are read from the world on the pass that
  asks, including what that pass has already filed, so the order a pass reads the runs in decides nothing, and
  a restart changes nothing.
- **A run's result is the work the ending acts on**, not the ending's own branch: `resultSteps` reads the steps
  before it, so *has it shipped*, *what did it touch* and *what is there to decide* are asked of
  `wf/<run>/implement`, never of `main`, which would answer yes to everything.
- **`→ to decide`**, the fifth reason a run waits on a person, beside blocked, unsigned, over budget and at a
  gate. A run is one to decide when it is at its result and a last step's gate has nobody's approval — said in
  that step's own prose where it is an ending that has not run, and by its name where it is a step that has
  (approving that one accepts what it did) — or, where no step of the workflow merges, when every step
  finished and a result branch is ahead of the base branch and not gone. Level-triggered: the branches are
  read off git on the pass that asks and nothing is stored, so a run whose branch a person merged by hand
  stops being one to decide without anybody telling the run. A run whose work is going round again, or whose
  work a person has just sent back, has nothing to decide: the gate holds on what the work says, and the work
  is being said again.
- **`--no-worktree` is refused** on a workflow whose last step merges: such a run works on the base branch
  itself, so it has no result branch for an ending to merge, and the refusal says so at `wf start`, before
  anything is spent.

```text
$ wf ls add-sub-8imz
add-sub-8imz  add sub
   implement      verified ✓            wf/add-sub-8imz/implement
   review         unverified · done     wf/add-sub-8imz/implement
   ship           awaiting approval                                 · approve it: wf approve add-sub-8imz ship — or send it back: wf retry add-sub-8imz review --message "<objection>"
   → to decide: Ship it: trial merge this run's result branch onto the base branch, run the check, and commit — or abort and say why. — wf approve add-sub-8imz ship
   → result: wf/add-sub-8imz/implement  —  wf decide add-sub-8imz
```

**`--after` is unchanged.** A child run starts when its parent has shipped as git sees it — the result branch
on the base branch, or nothing committed on it — which a run's `ship.md` makes true when it merges, and a run
with no ending makes true when a person merges. A run waiting at any gate has not shipped, merged or not: the
gate is a person's word on the record, and a merge is not that word.

## A gate: a handoff that waits for a person — `gate:`, `--gate` and `wf approve`

A plan read before anyone implements it was held by prose. `dev-planned`'s plan signs off `blocked` when its brief says to wait,
and a person answers with `wf retry --message`; but nothing in the machinery held a plan that signed off `done` — implement started
at once — and approving cost a try, since the answer continued the plan's session so it could sign off again. A gate holds the
handoff itself, and a person's word opens it.

```bash
wf start ./flag.md --workflows dev-planned --gate plan          # plan runs; nothing after it is filed until you approve
wf decide r-xyz                                                 # the plan, and its gate under it
wf approve r-xyz plan --message "Ship the second reading."      # what follows is filed on the next tick, with your words
wf retry r-xyz plan --message "Store the flag before you parse it."   # or send it back: it plans again, and waits again
```

```text
$ wf ls r-xyz
parse-the-flag-option-in-cli-idk2  Parse the --flag option in cli.ts
   plan           awaiting approval    wf/parse-the-flag-option-in-cli-idk2/plan  · approve it: wf approve parse-the-flag-option-in-cli-idk2 plan — or send it back: wf retry parse-the-flag-option-in-cli-idk2 plan --message "<objection>"
   implement      waiting
   review         waiting
   → waiting on you: approve plan  —  wf decide parse-the-flag-option-in-cli-idk2
```

**The handoff is the gate, not a step of its own.** A step is a session on a harness, and a person is not a harness: a gate step
would need a runner whose session is a file that fills when someone answers, and a body nobody writes. The handoff already has
what a gate needs — a closeout to read, and a run that files nothing until it may.

- **Where the gate holds.** On a step with steps after it, the handoff: the step runs, and what follows waits for the approval. On an
  ending step in the repository's checkout (`workspace: main`), the step itself: nothing of it is filed until a person approves it —
  [above](#the-end-of-a-run-is-a-step-workspace-main-and-the-endings-gate), which is the whole of what the `dev*` folders' `ship` is.
- **Where a gate is set.** On a step, `gate: true`, for every run of its workflow; `gate: false` and any other word are refused,
  with the fix. At start, `wf start --gate <step>`, once per step, for this run. On an inbox card, `gate: <step>`, one step, for
  the run the card starts, beside any `--gate` its start gives. The last two freeze into `gates` on the run's record, as the
  workflow does. A step named that the workflow does not have is refused at start, naming the steps it has, with nothing written —
  in the card's words for a card's gate — and so is a `--gate` given twice; `wf plan --gate` is refused by name. `dev-planned` and
  `dev-planned-build` gate their plan at nothing: a folder decides for every run of it, and a plan that reads one way should start
  implement at once. Say `--gate plan`, or `gate: plan` on the card, for the run that should wait. Their `ship` is gated, as every
  `dev*` folder's is: the run's end is a person's every time.
- **What it holds, on every pass.** A gated step that signs off — verified by its check first, where it has one — reads `awaiting
  approval`, and nothing after it is filed, whatever its closeout says, until an approval of the try it is on is on disk. It stops
  what follows as a step signed off `blocked` does: the run's outcome is `blocked`; `wf ls` names it waiting on you as `approve
  plan`, with the two commands beside it; `wf decide` says `AWAITING APPROVAL`; and a run `--after` it has not shipped — a person
  merging its branch is not the approval. No session runs, no run slot is held (`WF_MAX_RUNS`) and nothing is spent while it
  waits. A step that signs off blocked or unsigned, or that its check refuses, is not at its gate: it reads what it reads. Nor is a
  looping step that asks for another round (`again: true`): the gate is on what comes after it, and a round is its loop's.
- **`wf approve <run> <step> [--message "<words>"]`** writes `runs/<id>.asks/approve-<step>-<try>`, whole and exclusively, beside
  the retry asks: the try it approves, the time and the words — and nothing else. The tick reads approvals with the run on every
  pass, as it reads a cancellation, and never copies one into the record; the file stays where it was written while it opens the
  gate, and the next tick files what waits. Refused by name, exit 2, with nothing written: a run not there, a step the run does not
  have, a cancelled run, a step not gated — naming the gates there are — one not signed off yet, each status with what to do instead,
  the try already approved, empty words, and a send-back already asked for, which would spend the approval at once. A file at the
  approval's name that is not one opens no gate: the pass says so, and `wf approve` names it and says to delete it.
- **Sending back is `wf retry <run> <step> --message "<objection>"`**, as for a step that signed off blocked, on a step at its gate
  or one approved with nothing after it filed yet — never on an approved step nothing waits on, whose run is over and may be merged. `--nudge` continues its session, told under `## Try <n>` that its handoff waited
  at its gate and was sent back, with the objection as `## Your answer`; `--fresh` starts a new one. It signs off again, and the gate
  holds again. Refused without words, and with `--recheck`: an objection with nothing to change would sign off as it did. The tick
  holds an ask to the same word: a wordless one — taken while the step's harness blocked its session, which then signed off, or
  written by hand — is not filed at the gate, and `wf approve` and `wf retry` name it and say to delete it. An
  approval names the try it approves, as a retry ask names its try, so one given before the send-back is spent by it — the tick
  moves it into `done/` with the spent ask — and the new try is approved with a new `wf approve`.
- **What the steps after it are told.** Every step after an approved gate — the one after it and each after that one, the
  implementer and then the reviewer — is filed with `## Approved` beside what was asked for, as a run that waited is handed
  `## From run <id>`: which step, which try, when, and the words, fenced, as data. The summary still goes nowhere but to the person;
  the words are theirs.
- **`wf decide`** prints the gate under the step's name: `gate  approved 23:10Z — "Ship the second reading."`, or `gate  awaiting
  approval:` with the `wf approve` to give and the `wf retry --message` that sends it back.
- **`wf cancel` calls a run at its gate off**, as any run: it is not finished, since an approval would file what follows.
  **`wf rm` refuses a run at its gate**, naming the `wf approve` it waits for, and forgets it once it is called off. `wf round` on a
  loop whose step waits at its gate says to approve it or send it back.
- **On the board**, a gated step's section on the run page shows what it handed on, with Approve — a box for the words — and Send back,
  the answer box, beside it. The banner and the Factory's card say `approve plan`, and `POST /api/runs/:id/steps/:step/approve` calls
  `approve()`, refused in its words.

## The supervisor: a session that watches the runs — `workflows/supervisor/` and `slot: none`

The three sections above are the machinery a person needs to run this board by hand: the gate says when a
run wants them, the ending step says what shipping means, and `→ to decide` counts the runs nobody has
decided. The supervisor is that person's first reader. It is **a workflow of one step that never ends**:

```md
---
workspace: main       # the repository's own checkout: it reads the store and the runs' branches
slot: none            # not one of the runs the cap holds — it watches them
harness: claude
remote: true          # bridged to claude.ai, so the person it asks can answer from a phone
disallow: SendMessage, CronCreate, CronDelete, RemoteTrigger
---
Watch this repository's runs, and put what needs a person in front of the person.
```

**What it is.** A session whose loop is `wf ls`: a run at its result to decide, a step that signed off
`blocked` with a question, a session that has stalled — idle after a lost connection, `unsigned`, or held by
a background shell of its own. For a run to decide it reads that run's workflow folder first — the README
and the last step's file, which say what *that* workflow's ending is — then `wf decide`, the diff, and the
screenshots through the look skill, and prepares the brief a person decides from. **It decides nothing
itself, and it never types git for a run**: on a yes it says `wf approve <run> <step>`, and the run's own
ending step does the shipping, in its folder's words, with the person's words on its brief.

**How to start it**, once, and leave it running:

```bash
wf start "supervise this repository" --workflows workflows/supervisor
```

**How to answer it.** Its questions are gates on its own run: it signs off `blocked` with the brief in
`summary` and the question and options in `needs`, so `wf ls` says `→ waiting on you: supervise` and the
board draws the closeout with the answer box. The answer is a try of that step, which **continues the same
session** — it keeps everything it had read:

```bash
wf decide <run>                                         # its brief, and its question under `needs`
wf retry <run> supervise --message "Merge it."          # the answer; the session carries on
```

There is no cap on how many times that happens. A step with no `output:` signs off, is answered, and is
filed again for as long as a person keeps answering — each answer a try, each try resuming the session
before it, with the words under `## Your answer` (*Trying again*, under the check). What ends the run is
`wf cancel <run>`.

**`slot: none`** keeps its run out of the cap on runs in flight (`WF_MAX_RUNS`, below). The cap holds the
work this machine does at once; a supervisor behind it would be held by the very runs it exists to answer.
The key is refused at load on a step of a workflow that has another — a slot is a run's, not a step's, so
the work beside it would run outside the cap too. Nothing else about such a run differs: it is started,
cancelled, listed and answered as any other.

**It still takes a session slot, and holds it nearly all the time.** `WF_MAX_CONCURRENT` is 2 unless set,
counted per harness pool, and the supervisor is on `claude` — the pool `dev`'s implement, review and ship
share. A session that is watching is a session at work, so at the default a supervisor leaves one slot for
the work it watches, freeing its own only between signing off and being answered. Raise the ceiling before
starting one: `WF_MAX_CONCURRENT=3 wf up`.

## A run that waits on a run: `wf start --after`

```bash
wf start ./a.md --repo ~/code/myapp                                  # a-1x2y
wf start ./b.md --repo ~/code/myapp --after a-1x2y                   # nothing of it filed until a-1x2y ships
wf start ./c.md --repo ~/code/myapp --after a-1x2y
wf start ./d.md --repo ~/code/myapp --after b-3z4w --after c-5v6u
```

This is the sequencing a person used to do by hand, starting B once A is on main, held by the run as a
fact. `--after <runId>`, given once for each run to wait on, is frozen on the record as `after`. The tick
files none of the run's steps until every one of those runs has **shipped**, meaning its own `wf decide`
says so: finished, and its result branch on the base branch. Steps saying they are done does not count. The run boundary
is where a person decides what ships, so every run stays a decision. The diamond above is today's flow,
with the tick doing the waiting: A ships, B and C start from a main that has A, and D starts once both
have shipped. A conflict between B and C is still a person's to resolve, at the second merge.

- **Shipped is what the parent's `wf decide` says, read on every pass**, and nothing is carried between
  passes: the parent is not running, it was not cancelled, and every result branch is on the base branch.
  Git is asked first, and the engine's view of the parent's tasks only once its branches are on the base.
  A result branch is cut at its run's base, so a branch nobody has committed to is on the base branch from
  the start. A parent still running has not shipped for that, nor one that ended failed, blocked or unsigned
  with nothing committed; one whose steps all signed off with nothing to commit has, as its `wf decide`
  says, and its child starts. A branch merged while its run still runs waits for
  the run to finish. `runReady(run, shipped)` is the pure half, beside `assess`.
- **The base is read when the roots are filed.** A run that waited starts from its base branch as it is on
  that pass, with its parents' work on it, not as it was at `wf start`. Every worktree, check and diff of
  the run is cut from that commit. A run without `--after` keeps the base `wf start` recorded.
- **Once a step is filed, the parents are never read again.** Deleting a parent's branch after the merge,
  by `git branch -d` or by `wf decide`'s *drop it*, cannot un-ready a run that has started. The gate
  applies only to a run with nothing filed.
- **A branch deleted after its run finished is still read.** Git keeps no record of which commits a deleted
  branch named: a merge may carry any message, and `git branch -d` needs the branch's worktree removed
  first. So each run's own tick records its result branches' tips once it has finished (`tips` on its
  record: what `wf decide` offers to ship), and when a branch is gone, git is asked whether that commit is on
  the base. D can wait on B and C while B is merged and cleaned up and C is still in review: once C ships,
  D starts. A branch dropped unmerged reads `waiting on a-1x2y (wf/a-1x2y/implement gone)`, and so does one
  deleted before any tick saw its run finish (`wf up` not running). Either is a person's to resolve.

`wf ls` shows the wait on each root, where `waiting` would be: `waiting on a-1x2y`, naming every parent
that has not shipped. A parent that will never ship without a person gets a reason in brackets:
`(cancelled)`, `(no such run)` or `(<branch> gone)`. The run then also gets a `→ waiting on you:` line
with the two ways out: `wf cancel` the child, or start it again without that `--after`. `wf decide` on
a waiting run says the same and offers nothing else, and `wf tick` adds the wait to the run's line.

`wf start` refuses the following before anything is written, and names the fix for each:

- an id given twice
- a run the store does not have
- a run on another repository, or one that ships onto another base branch; the child would never start
  from a base that has its work
- a run started `--no-worktree`, which has no result branch to ship
- a cancelled run, which `wf decide` never calls shipped, or one whose result branch is gone and not found
  on the base

It reads `--after=<runId>` as `--after <runId>`, and refuses any argument it does not take: a misspelt
flag, a value flag with no value or given twice, and a second brief. Dropped, a misspelt `--after` would
start a run that waits on nothing, and the tick would file it at once.

A record written before `after` existed waits on nothing.

A run that waited is told what its parents concluded, under `## From run <id>` (*What one step knows of another*,
above). To start a whole graph of runs at once, write it as a folder of cards: `wf plan`, below.

## A plan as a folder of cards: `wf plan`

A person who describes a plan in prose (parse the flag, then store it and document it, then show it) writes it as
files, one card per run, and starts it whole:

```text
plans/flag/
  README.md   what the plan is for; not a card
  a.md        workflow: dev
  b.md        workflow: dev   after: a
  c.md        workflow: ui    after: a
  d.md        workflow: dev   after: b, c
```

```md
---
workflow: dev
after: b, c
---
Show the flag on the settings page. It is parsed and stored by now: read it from the settings file, and add the toggle.
```

```bash
$ wf plan plans/flag --repo ~/code/myapp
a  parse-the-flag-option-in-cli-eoug  dev  waits on nothing
b  store-the-flag-in-the-settin-lx98  dev  waits on a (parse-the-flag-option-in-cli-eoug)
c  document-the-flag-in-the-rea-m4ja  ui   waits on a (parse-the-flag-option-in-cli-eoug)
d  show-the-flag-on-the-setting-rlp0  dev  waits on b (store-the-flag-in-the-settin-lx98), c (document-the-flag-in-the-rea-m4ja)
run 'wf tick' (or 'wf up') to start them
```

- **A card is one markdown file.** Its name, without `.md`, is what another card's `after:` names. Its frontmatter
  takes two keys: `workflow:`, a workflow by name under `<repo>/workflows/` or by a path from the plan folder (as
  `wf start --workflows` takes one from where it is typed), and `after:`, the cards whose runs must ship first. The
  body is the run's brief. `README.md` says what the plan is for, and is not a card.
- **The runs and their `after` are the plan.** `wf plan` starts every card with `start()`, parents first, each
  `after` the runs of the cards it names: the record `wf start --after` writes. Nothing downstream is new. The tick
  files a card's run once its parents have shipped (*A run that waits on a run*, above), `wf ls` says what each
  waits on, each card's first steps are told what its parents concluded (`## From run <id>`), and every card is a
  decision at its own `wf decide`. Nothing else is written: no plan record, and no file of its own.
- **Refused before any run is started**, by name and with the fix:
  - a key a card does not have, or one set twice or to nothing;
  - a card with no `workflow:`, or with an empty body;
  - an `after:` naming a card the folder does not have, the card itself, or one card twice;
  - cards that wait on each other, named round the cycle: `a.md, d.md, b.md wait on each other — a after d, d after b,
    b after a`;
  - a file that is not `.md`, a folder inside the plan, and a folder with no card;
  - a card whose workflow does not load, with the workflow's own refusal behind the card: `b.md: \`workflow: deb\` —
    no workflow folder at …/plans/flag/deb, nor a workflow named deb in ~/code/myapp/workflows. The repository's
    workflows are: dev, ui — …`.
- **`--repo` is its one flag.** `--after`, `--workflows` and `--no-worktree` are refused by name, since the folder
  says each, and anything else is refused as `wf start` refuses it.
- **A `wf start` that refuses part-way stops the plan.** Every card was checked first, so this is something that
  changed underneath, or git. The runs it started stand, and it names them. Then it prints a `wf start --after` for
  each card left, parents first, with the run ids it has and `<c's run id>` for a parent not started yet, each path
  quoted for the shell.
- **`wf start` on a card file starts the card**, as the stopped plan's commands do. The brief is the card's body, below its
  frontmatter, so neither the run's id nor any step's brief carries a `workflow:` line. `--workflows` defaults to the
  card's `workflow:`, found from its plan folder as `wf plan` finds it. A card whose `after:` names cards is refused
  without `--after`, and the refusal names the ids to give; `wf start` checks the ids given, as it checks any `--after`.
  A file is a card only when every line of its frontmatter is `workflow:` or `after:` — or an inbox card's `repo:`, which a
  plan's card refuses by name, since its repository is `--repo`. A brief with any other key, or one that opens with a `---`
  it never closes, is taken whole, as before.

## An inbox: cards before they are started — `wf inbox`

An idea about the project had nowhere to be parked. The unit already existed — a card: a workflow, a brief — but a card
lived only inside a plan folder, started whole by `wf plan`, or was started by hand and left where it was. The old hkb
filed such a note with `hkb new --triage`, and `hkb ls --phase triage` was the inbox; its ADR-015 records that triage was a
phase pushed into the machinery because a person needed an inbox. Here an unstarted card is a file in a folder, and nothing
about a run changes.

```text
$ wf inbox add "Cache the engine's views between passes" --workflow dev --repo ~/code/myapp
cache-the-engine-s-views-bet-9prl  Cache the engine's views between passes  workflow: dev  repo: /home/me/code/myapp
filed: /home/me/.agent-workflows/inbox/cache-the-engine-s-views-bet-9prl.md — start it with wf start /home/me/.agent-workflows/inbox/cache-the-engine-s-views-bet-9prl.md
$ wf inbox add "Show what a step cost on the board"
$ wf inbox
cache-the-engine-s-views-bet-9prl  Cache the engine's views between passes  workflow: dev  repo: /home/me/code/myapp
show-what-a-step-cost-on-the-c3cw  Show what a step cost on the board

start one: wf start /home/me/.agent-workflows/inbox/<name>.md [--workflows <w>] [--repo <r>] — drop one: wf inbox rm <name>
$ wf start ~/.agent-workflows/inbox/show-what-a-step-cost-on-the-c3cw.md --repo ~/code/myapp --workflows dev \
    --brief "Show each step's cost beside its status on the run page, in dollars."
show-each-step-s-cost-beside-42g6  2 step(s): implement → review
from inbox card show-what-a-step-cost-on-the-c3cw — removed from the inbox
workspace: /home/me/code/myapp
run 'wf tick' (or 'wf up') to start it
```

- **The inbox is `$WF_ROOT/inbox/`**, in the store beside `runs/`, not in a repository: one card per file, `<name>.md`. A
  person has one inbox, whatever repository an idea is about.
- **A card is a plan's card with two differences**, and its keys are a closed list all the same:

  ```md
  ---
  workflow: dev                  # optional: what runs it, chosen at start when the card does not say
  repo: /home/me/code/myapp      # optional: the repository the idea is about, as an absolute path
  ---
  Cache the engine's views between passes. The tick reads each task twice.
  ```

  `workflow:` is optional, since an idea often does not know its workflow. `repo:` is a key of its own. An inbox card has no
  `after:`: what it waits on is said at start, with `--after`, once the runs it could wait on are known. A plan's card keeps
  its rules, and refuses `repo:`: a plan's repository is `wf plan --repo`. A third key, `queued:`, marks a card to start on its
  own, and `wf inbox queue` writes it ([below](#cards-that-start-themselves-wf-inbox-queue)). A fourth, `gate: <step>`, names
  the step of its workflow whose closeout waits for a person in the run it starts, one step, refused as a list or as a step's
  `true` ([*A gate*](#a-gate-a-handoff-that-waits-for-a-person--gate---gate-and-wf-approve)).
- **`repo:` is what makes one inbox serve several repositories.** A card that names its repository starts on it from
  wherever `wf start` is typed, and a board that one day serves more than one repository can group its inbox by it. A card
  without one is about the repository its start names: `--repo`, else `.`.
- **`wf inbox add "<idea>"`, or `wf inbox add <file>`, files one.** Its name is the slug a run id makes of the idea's first
  line, suffix included, so two ideas alike are two cards. `--workflow <name>` and `--repo <path>` write the keys, over a
  file's own. A file whose frontmatter is an inbox card's gives its keys and its body. Any other text is the body whole, as
  `wf start` takes a brief that is not a card. A repo, and a workflow given as a path, are written absolute: the flag's from
  where `wf inbox add` is typed, and a file's own `workflow:` from the file's folder, as a plan card's is read from its plan
  folder. Left relative, `../workflows/dev` in `~/code/myapp/plans/idea.md` would be read from the inbox at start, and name
  the store's `workflows/dev`.
- **`wf inbox` lists the cards**: name, first line, workflow and repo when set, `queued 2 of 3` for a queued card, and
  `started as <runId>` for a card whose name a run's record carries in its `from`, composed on read. An entry that does not read as a card is listed with its
  refusal, never hidden. A hidden file and a README are not listed.
- **`wf inbox rm <name>` drops a card** without starting it. A name with no card is normal: it says so, names the cards
  there are, and exits 0.
- **`wf start <inbox>/<name>.md` starts one**, or `wf start <inbox>/<name>`, the name as `wf inbox` lists it, through the
  function the board calls too (`startFromInbox`):
  - every path under the inbox goes through it, and one that names no card is refused by name, never started as a brief
    whose text is the path;
  - the brief is the card's body, or `--brief "<brief>"` in its place, as text or a file: the note rewritten into work at
    the moment of starting, as hkb let `queue` rewrite it;
  - the workflow is `--workflows`, else the card's `workflow:`, else refused, naming the repository's workflows. A card's
    `workflow:` is found from the inbox folder, as a plan card's is from its plan folder: a name is `<repo>/workflows/<name>`,
    and a relative path written into a card by hand is read from the inbox, so `../workflows/mine` is one of yours in the store;
  - the repository is `--repo`, else the card's `repo:`, else `.`;
  - `--after`, `--input` and `--no-worktree` are `wf start`'s, as for any brief.
- **The record is written first, then the card is removed.** The record carries `from: { inbox: <name> }`, and `wf decide`
  prints `from inbox card <name>` under the run's line. A removal that fails leaves a card `wf inbox` lists as
  `started as <runId>` — never a run with no trace of its card — and `wf start` refuses that card, naming its run, until
  `wf inbox rm` drops it. A plan's card started with `wf start` is never removed.
- **Refused by name**, exit 2, with the fix, before anything is written:
  - a key an inbox card does not have, `after:` among them, with where what it waits on is said instead: for a file
    `wf inbox add` is given, delete the line, file the idea, and give `--after` when starting the card;
  - `workflow:` or `repo:` set to nothing or twice, a `repo:` that is not an absolute path to a directory, a `queued:` that is
    not an ISO time or is on a card with no `workflow:`, and an empty body; and a `queued:` in a file given to `wf inbox add`;
  - `wf inbox add` with no idea, or one with nothing in it;
  - a name that would leave the folder — a slash, `..` — or a hidden one, given to `wf inbox rm` or a start;
  - a start naming a card that is not there, with the cards that are: any path under the inbox, a file there that is not a
    card and one in a folder inside it included;
  - a start with no workflow from the card or the flag, and a card's workflow that does not load, behind the card;
  - an empty `--brief`, and `--brief` on anything but an inbox card.

## How much runs at once: `WF_MAX_CONCURRENT` and `WF_MAX_RUNS`

Two ceilings, both read from the environment `wf up` runs in, and both said in words when it starts:

```text
$ WF_MAX_CONCURRENT=4 WF_MAX_RUNS=2 wf up
up — every 4000ms, ^C to stop
   sessions at work per pool: at most 4 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)
   runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)
```

- **`WF_MAX_CONCURRENT`, 2 unless set, counts sessions at work, not runs.** It is the engine's ceiling (`maxConcurrent`), per pool:
  `claude` and `claude-detached` share one, since they share one subscription; `codex` has its own; and a step's check runs on the
  `check` harness, a pool of its own, so a suite never waits behind a session (engine `912d537`). Both steps of `dev` are on `claude`, so one run's
  review competes with another run's implement for the same slots. A task filed past the ceiling waits for a slot, `pending`; the timeline
  counts that wait as queued. A session its harness lists `blocked` holds no slot: it makes no API calls, so the engine counts only `working` sessions (engine `912d537`).
- **A run in flight keeps its momentum.** Every filing after a run's first steps — a step after another, a try, a round, a check — carries
  the engine's `priority: 1`, and a run's first steps none, so a run's next step waiting for a slot goes before a newer run's first step
  (`MOMENTUM`, `priorityOf`); nothing running is stopped for it, and `WF_MAX_RUNS` and the queue are unchanged.
- **`WF_MAX_RUNS`, unset or 0 for no cap, counts runs in flight.** A run is in flight while a task of it — a step's or a check's — is filed
  and not settled, or while it has started and the tick files something of it on the pass: a run between two steps is still in flight. One
  that waits on a person, or has finished, is not; one called off is, until the engine has stopped what it had in flight. A run with nothing
  filed files its roots only while fewer runs than the cap are in flight (`runAdmitted`, pure, beside `runReady`). Anything else is refused by
  name, exit 2, by `wf up`, `wf tick` and `wf ls`: read as no cap, `WF_MAX_RUNS=two` would lift the cap it was set to hold.
- **A pass admits serially, oldest first, and carries nothing.** The tick advances every run that has started first — the cap never holds
  one — and counts those in flight once each pass is done. Then it takes the runs with nothing filed by `createdAt` (`admissionOrder`), each
  judged against the count so far and counted, once it has filed, for the next — as the engine admits its tasks. The next pass counts again,
  so a run finishing, or called off and stopped, frees its slot on the pass that sees it.
- **A run of a one-step workflow that says `slot: none` is not counted, and never waits.** It is a session that watches the runs the
  cap holds — the supervisor, above — so it files its step at a full cap, counts against nothing and holds nobody behind it
  (`takesNoSlot`, read by `slotNeed`, `runAdmitted` and the pass's count). It takes a session slot like every session. A queued inbox
  card of such a workflow still waits for a free slot to be started, since the queue starts one card a pass whatever it is.
- **A run waiting on `--after` counts only once it is filed.** Until its parents ship it wants no slot, and a run started after it takes one;
  once they have, it waits for a slot in `createdAt` order like any other.
- **`wf ls` says it on the roots**, where `waiting` would be: `waiting for a run slot (2 of 2 in flight)`, judged over the whole store as the
  next pass would judge it (`heldRuns`). `wf tick` puts it on the run's line, `wf decide` says it and nothing else, and the first pass that
  holds a run writes when on its record (`slotHeldAt`) and says so once.
- **`wf ls` and `wf decide` judge by the cap the last pass ran with, not their own shell's.** `WF_MAX_RUNS=2 wf up` sets the cap on the daemon
  alone, so every pass writes the ceilings it ran with to `$WF_ROOT/tick.json`, when they change, and `wf ls` and `wf decide` read the cap
  there. Only before any pass has written it do they read their own `WF_MAX_RUNS`.
- **The wait is on the timeline.** A run the cap held counts `createdAt` → its first filing as queued — from the pass that first held it, on a
  run that waited on runs — on a `run slot` row of its own, and in the run's `queued`: `still waiting` while nothing is filed, `not known`
  where the engine's feed does not say when its first task was filed. A run the cap never held has no such row.

### Cards that start themselves: `wf inbox queue`

```text
$ wf inbox queue cache-the-engine-s-views-bet-9prl
cache-the-engine-s-views-bet-9prl  queued at 2026-09-16T10:00:00.000Z, 1 of 1  workflow: dev  repo: /home/me/code/myapp
the tick starts it on its own once its turn comes and a run slot is free — take it back with wf inbox queue cache-the-engine-s-views-bet-9prl --off
$ wf up
up — every 4000ms, ^C to stop
   sessions at work per pool: at most 2 at once — claude with claude-detached, codex, checks each a pool (WF_MAX_CONCURRENT)
   runs in flight: no cap (WF_MAX_RUNS)
10:00:04  started cache-the-engine-s-views-bet-9prl as cache-the-engine-s-views-bet-k2q9
10:00:09  cache-the-engine-s-views-bet-k2q9  filed implement
```

- **`wf inbox queue <name>` marks a card to start on its own.** It writes `queued:` on the card, the ISO time it was queued,
  which orders the queue; `--workflow <w>` writes `workflow:` too. `wf inbox queue <name> --off` takes the mark back, and
  `wf inbox rm` drops the card. The card's file is written whole, through a hidden file renamed over it, so a pass never reads
  half a card.
- **Each pass, after every run has been advanced, the tick starts the oldest queued card** while a run slot is free — always,
  with no cap. By `queued:`, then by name (`queueOrder`), through `startFromInbox`, the start any card has: its `workflow:`,
  its `repo:` or else the repository `wf up` runs in, as `wf start` takes `.`. Its base is its base branch as it is at that
  moment, and its brief is frozen then. One card a pass: its run has nothing filed, and the next pass counts it against the cap
  before another card is started. `--after` stays for cards that depend on one another.
- **Started, the card leaves the inbox** as any start removes it, and `wf up` and `wf tick` log `started <card> as <runId>`. A
  removal that fails leaves a card `wf inbox` lists as `started as <runId>`, which neither a pass nor a person starts again.
- **A start the package refuses is written down, not tried again.** The workflow gone, the repository gone, whatever
  `startFromInbox` refuses by name (exit 2): `wf up`'s line names it, `wf inbox` says `not started at <time>: <why>` beside
  the card's place, and the card is left as it is. The tick keeps the refusal in `$WF_ROOT/queue/<name>.json` with the card's
  text and the repository it was tried on, and passes over the card while both are the same: one try, no hot loop, and the card
  behind it has its turn. Edit the card, or take it back and queue it again — or, for a card that names no `repo:`, run `wf up`
  in another repository — and the next pass tries it again.
- **A start that fails otherwise is tried again.** Git failing on the repository, a file that cannot be read: no verdict on the
  card, so the next pass tries it again, where it keeps its place and the card behind it waits. `wf up` says it once, and again
  only if it fails differently; `wf inbox` says `failed at <time>: <why>`. A card whose `repo:` folder was deleted after it was queued no
  longer reads as a card, and keeps its place all the same: `wf inbox` lists why beside `queued 1 of 2`, the tick tries it and
  names the refusal, and `--off` takes it back.
- **Refused by name**, exit 2, before anything is written: a name with no card, naming the cards there are; a card with no
  `workflow:` and no `--workflow` — `--workflow <w>` writes both; a card already queued, with its place, and `--off` to take it
  back first; a card a run was started from; and `--off` beside `--workflow`. `--off` on a card not queued says so, exit 0.

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
normal things for a person to do, so none of them is an error and each says which it was. A run
waiting at a gate is not finished — an approval would file what follows — so it is called off. A
finished run is deliberately **not** relabelled — a run that succeeded succeeded, and stamping it
cancelled would make `wf ls` lie about work that actually landed. Cancelling twice keeps the first
time and re-asks for whatever is *still* in flight, because the engine carries a stop out on its
next tick: running it again is how a person deals with one that slipped through, not a no-op.

## Forgetting a run: `wf rm`

The store only grows. Every run leaves its record, a directory of its files, sometimes asks and a
cancellation, a worktree per step with a `node_modules` of its own (one installed by `npm ci` on this
machine is 1.1 GB), and a branch per step. Removing them by hand leaves git's worktree list stale and a
record pointing at nothing. `wf rm <runId> [<runId> ...]` forgets runs that are over. Each run is judged
on its own and gets one line saying what happened. A run not forgotten makes the verb exit 2, once every
run has had its line.

**What it removes, through git first.** Each worktree git lists inside `worktrees/<id>/`, and nothing
outside it: never the repository a `--no-worktree` run worked in, never another run's directory. What a
worktree holds uncommitted is committed first under its step's name, as the hand-off does, since a failed
or stopped step's work lives only there. What git ignores (`node_modules`, `.e2e/`) is not work. Then
`git worktree remove`, never with `--force`, and `git worktree prune`. Some worktrees are left as they are,
each named with what to do:

- **locked**: git refuses, and so does `wf rm`. The line gives the `git worktree unlock` that frees it.
- **on no branch**: a session stopped in a rebase, a bisect or a checkout of a commit leaves HEAD detached.
  Removing it would leave its commits, and a hand-off onto it, on no branch. It is held unless it is clean
  and its HEAD is on a branch already.
- **a hand-off git would not commit**: a pre-commit hook refused it, or a signature failed. The line gives
  git's words; commit it there yourself. The repository's hooks are honoured, since one may be what keeps
  a secret off a branch.
- **a directory in `worktrees/<id>/` git does not know**, for a person to look in.

Any of these holds the run: its record, files and branches stay, so `wf rm` finds it again and finishes
once the worktree is dealt with.
Then the record, and every file under `WF_ROOT` keyed by the run's id (the table below). The engine's
tasks, journal and sessions are the engine's, and are not touched.

**What it keeps.** Branches, by default, and the line says so: a branch is where the work is.
`--delete-branches` deletes each one merged into the run's base branch, as git says it. One that is not
merged is kept, and the line says why, unless `--force-unmerged` is given beside it. Alone,
`--force-unmerged` is refused. Only `wf/<id>/…` branches are ever named.

**What it refuses**, naming every reason at once and what to do about each:

- **a task in flight**: a step or its check, filed and not settled, including one a pass filed and died
  before writing down. Forgetting is not cancelling, and `wf rm` never stops anything: `wf cancel` first,
  then `wf rm` once the tasks have settled. A cancelled run whose tasks have settled is forgettable.
- **anything a pass would file**: a step ready, a check, a try or a round due, on a run nobody called
  off. A pass may be filing it at that moment, into a worktree about to go. A run waiting on runs
  (`--after`) is held the same way, since it files its roots once they ship.
- **an ask no pass has spent** (`wf retry`, `wf round`), on a run nobody called off. One the next pass
  files is the case above. One no pass files as the run stands is taken back by deleting its file, which
  the refusal names.
- **a step waiting at its gate**, on a run nobody called off: an approval would file what waits on it. The refusal names the
  `wf approve` it waits for; `wf cancel` first, to forget the run instead.
- **a run another run waits on and has not started on**, naming the runs it would strand. Forgotten,
  each would read `waiting on <id> (no such run)` for ever. Let them start, or `wf cancel` them.

**A pass halfway through a run it forgets writes nothing back.** The tick reads a run, spends seconds on
the engine and git, and writes the record back. A pass that wrote a new file would bring back a record
`wf rm` had just removed. So the tick opens the record `r+`, which never creates one, and moves an ask
into `done/` without making the asks directory again. A record removed between the tick listing the store
and reading it is skipped, where it used to fail the pass for every run on the machine.

**Nor does it file into one.** A pass that read a run before `wf cancel` may be cutting a step's worktree
when the cancel lands, and `npm ci` takes a minute. `wf rm` then sees a cancelled run with nothing in
flight. So the pass reads the record and the cancellation again before it cuts a worktree and before each
filing, and files nothing once either says the run is called off or gone. Nor does it hand a step off or
collect its files once the record is gone: a `--no-worktree` run's workspace is a person's checkout. A step a pass filed and died
before writing down is looked for on the engine, as a check, try or round is: `wf rm` counts it in flight,
and a cancelled run's pass stops it.

**Normal, not errors:** a run the store has no record of (`no such run`, and whatever is left under its
id is removed and named), a worktree or branch already gone, and a run whose tasks the engine no longer
knows. An id that is not one `wf start` mints — lowercase letters, digits and dashes — is refused before
anything is read. `r-xyz.json`, as `ls runs/` gives it, would name another run's record as a run's own
directory, and `..` or a path a directory that is not the run's; one with a file's suffix is told the id.

**A record from before runs froze their workflow reads its folder on every pass**, so that folder cannot
be deleted while the record exists. With it gone, `wf ls`, `wf decide` and the tick die with `no workflow
folder`, the tick for every run on the machine. Forget such runs first, then delete the folder. `wf rm`
still forgets one whose folder is already gone, since no pass can file anything of it: its tasks in
flight, its asks and the runs that wait on it are judged as any run's, and its line says the workflow
never froze.

What is under `WF_ROOT` (`~/.agent-workflows` by default), and what `wf rm` does with it:

| path | what it is | written by | `wf rm` |
|---|---|---|---|
| `runs/<id>.json` | the run's record | `wf start`; the tick, while it exists | removed, first of its files |
| `runs/<id>.cancelled` | when it was called off | `wf cancel` | removed |
| `runs/<id>.asks/`, `…/done/` | asks for a try or a round, approvals at a gate, and those spent | `wf retry`, `wf round`, `wf approve`; the tick moves them | removed |
| `runs/<id>/inputs/` | files given with `wf start --input` | `wf start` | removed |
| `runs/<id>/artifacts/<step>/` | a step's files | the step; the tick collects into it | removed |
| `checks/<id>-<step>[-try<n>]-check.stderr` | a check's stderr | the check | removed |
| `worktrees/<id>/<step>/` | a step's worktree, with its own `node_modules` | the tick (`git worktree add`) | committed, then removed through git |
| `engine/` | the engine's board: tasks, journal, feed | the engine | not touched |
| `wf/<id>/<step>`, in the repository | a step's branch | the tick | kept; `--delete-branches` |

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
| `src/workflow.ts` | the format: parse a folder of markdown, from disk or from text (`parseFolder`), and render a step back to it (`renderStep`); refuse an unknown key, a word the step's harness does not take, a `gate:` that is not `true`, a cycle, a dangling `after`, a loose `output:` schema, an `input:` on work that has not finished, or a loop a round could not run; find a workflow folder by a path or by its name under `<repo>/workflows/` |
| `src/plan.ts` | a plan — pure: parse a folder of cards, and refuse a key a card does not have, a card with no workflow or no brief, and an `after:` that dangles or goes round; the order `wf plan` starts the cards in, and what it prints |
| `src/inbox.ts` | the inbox — pure: an inbox card, and refuse a key it does not have, a key set to nothing, a `repo:` that is not an absolute directory and a `queued:` that is not a time or has no workflow; the card `wf inbox add` writes, and the one `wf inbox queue` writes (`queuedText`, `queueRefusal`); a name that would leave the folder; what `wf inbox` lists, `started as` composed from the records and a queued card's place and refusal; the queue's order (`queueOrder`, `nextQueued`); and which path is a card of the inbox |
| `src/run.ts` | **`assess`** and **`stepStatus`** — pure: which steps are ready, due a check, another try or another round, blocked, done — **`runReady`**, whether a run's roots may be filed yet (`--after`), **`runAdmitted`**, whether the cap on runs in flight leaves them a slot, and which runs it holds (`heldRuns`), **`forgetRefusal`**, whether `wf rm` may forget a run and which worktrees, branches and check logs are its own, **`approvalRefusal`**, whether `wf approve` may approve a step at its gate, and what a step is told, `## From <step>`, `## From run <id>`, `## Approved`, `## Try <n>` and `## Round <n> of <N>` included |
| `src/check.ts` | the check — pure: the harness the run hands the engine, the verdict, the contract |
| `src/deps.ts` | what a worktree is given — pure: the `node_modules` plan, `.worktreeinclude`, and the line a step is told |
| `src/radius.ts` | what `wf decide` shows of a branch — pure: the numstat grouped by blast radius, the agent-facing, check-affecting and lesson lists, the lesson line, and what a step consumed |
| `src/runner.ts` | the I/O: run store, git worktree and what it is given, the engine and the two ceilings (`ceilings`), a pass over every run, started runs first and the rest admitted oldest first (`tick`), a run forgotten (`forget`), a plan's cards started (`startPlan`) with their parents' closeouts gathered for the first steps (`parentCloseouts`), and the inbox read, filed, queued, dropped and started from (`readInbox`, `addToInbox`, `queueInInbox`, `dropFromInbox`, `startFromInbox`), a queued card started by the tick (`startQueued`), a workflow folder written from its steps (`writeWorkflow`) — and, for a consumer that words a step as `wf ls` does off the views it already has, with no `logs` call: `phaseOfView`, `closeoutAsked`, `exitVerdicts` |
| `src/cli.ts` | the verbs |

The store, under `WF_ROOT` (`~/.agent-workflows` unless it is set):

| path | |
|---|---|
| `runs/<id>.json` | a run's record, the tick's to write — `slotHeldAt` among it, once the cap on runs in flight held the run, and `gates` from its start; beside it, a person's facts in files of their own: `<id>.cancelled`, `<id>.asks/` — retry and round asks, and approvals at a gate |
| `runs/<id>/` | the run's own files, outside every workspace: `inputs/` (`wf start --input`) and `artifacts/<step>/` |
| `inbox/` | cards before they are started, one `<name>.md` each (`wf inbox`); a card started leaves it |
| `queue/` | a queued card's last start that did not happen, `<name>.json`, the tick's to write: the card's text, the repository tried, why, and whether it was a refusal |
| `tick.json` | the ceilings the last pass ran with, the tick's to write: what `wf ls` and `wf decide` judge the cap on runs in flight by |
| `worktrees/<id>/<step>/` | each step's workspace |
| `checks/` | each check's stderr |
| `engine/` | the engine's board: `AE_ROOT` for `ae watch` |
| `workflows/` | your workflows, beside the repository's, as the board lists them |

`assess()` is pure and has no idea the engine exists; `runner.ts` is the only file that imports it,
and `test/boundary.test.ts` fails the suite the day another file does — a type import included. Same
split as the engine, one layer up.
