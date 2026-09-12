# wf — workflows of agent steps

A workflow is **a folder of markdown files**. One file is one step. It runs on
[`agent-engine`](../agent-engine), and it is the proof that the engine's boundary is real: this
package uses `createEngine`, `file`, `tick`, `view`, `logs` and nothing else.

```bash
wf start ./brief.md --repo ~/code/myapp --workflows ./workflows
wf up
wf ls
```

## Where this stops

**A workflow orders steps and hands them a workspace. Anything that decides *whether the work is
good* belongs in a step, not here.** That is the same line the engine draws one layer down, and it
is why there is no condition, loop or expression in the format.

Definition of done — a closed list, so there is a finish line:

- [x] a folder of markdown is a workflow — `after`, `resume`, one prose body per step
- [x] fan-out isolates (a worktree per concurrent step), fan-in merges
- [x] what one step knows of another: intent and artifacts, never process
- [x] a finished run names the branch its work is on
- [ ] **the decider** — today nobody settles after `RESPONSE.md`. A review and a reply are two
      opinions; something has to say what ships. That role is a person's, and the run should end
      by putting the choice in front of them rather than trailing off.
- [ ] **rounds** — `after` is a DAG and cannot loop, so a second round is a *new run* over the same
      worktree, started by the decider. That keeps rounds countable and deliberate.
- [ ] **the splitter** — the step whose job is producing tasks that touch disjoint files, and which
      is allowed to answer "these cannot be split, run them in sequence".

## The format

```md
---
harness: codex        # claude (default) | codex
after: implement      # what must SUCCEED first
---
Review the changes on this branch. Be specific about correctness, not style.
```

**There is exactly one non-prose key: `after`.** No conditions, no loops, no expressions, no
templating. That is the design, not a missing feature.

The interesting decisions in this kind of work — *is this good enough*, *did it do what was asked*
— are not predicates a workflow language could evaluate. They are judgements, and a judgement
belongs to a step with an agent in it. **The workflow is a team, not a program.** The prose is the
logic; `after` is the only thing the runner needs to know.

## What one step knows of another

A run cuts one git worktree and every step works in it, so the handoff is the workspace — the way
it is between two engineers. A later step is told:

- its own prose
- **the original request** (the spec — you cannot judge completeness without it)
- where to look: `git diff <baseRef>`, and who was there before it

And deliberately **not** told: the previous step's transcript, reasoning, or self-assessment.

The reason is what a pull request already demonstrates. A PR description is not the author's
transcript — it is an artifact the author *chose* to produce, and the reviewer judges the diff
rather than the author's account of it. Passing the implementer's reasoning to the reviewer would
anchor it on the very context that produced the work, and would put unverifiable claims next to
verifiable evidence. So: **intent and artifacts travel, process does not.** A step that wants to
say something to the next one writes a file, deliberately, like a person would.

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

| file | lines | |
|---|---|---|
| `src/workflow.ts` | 100 | the format: parse a folder of markdown, refuse a cycle or a dangling `after` |
| `src/run.ts` | 120 | **`assess`** — pure: which steps are ready, blocked, done — and what a step is told |
| `src/runner.ts` | 140 | the I/O: run store, git worktree, and the engine |
| `src/cli.ts` | 120 | the verbs |

`assess()` is pure and has no idea the engine exists; `runner.ts` is the only file that imports it.
Same split as the engine, one layer up.
