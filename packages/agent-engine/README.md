# ae — an engine for agent sessions

A scheduler for agent sessions on your own machine. It does **one thing**: take a brief, run one
agent session to completion, and let you follow it — surviving its own death while it happens.

1,285 lines. The part you must read to understand it is `src/domain.ts`, and it is 180 of them.

```bash
npm test        # 25 tests, no money spent
npm run typecheck
node bin/ae.ts  # the verbs
```

## Where this stops

**The engine runs one workload on one harness. Anything that knows about a *second* workload is
the upper layer.** "Implement, then review" knows about two — so do DAGs, boards, columns and
pull requests. They are built *on* this, through `src/index.ts`, and none of them needs `decide`
to change.

Definition of done — a closed list, and it is closed:

- [x] run a workload on a harness: durably, observably, to completion
- [x] any harness, chosen per task (`claude`, `codex`, `claude-detached`)
- [x] attempts, stop, logs
- [x] concurrency ceiling, per harness — two subscriptions are two pools
- [x] the feed — a cursored stream of everything that happened
- [x] resume — an attempt continues the one before it, by policy
- [x] deadline — wall clock across attempts; also the only thing that frees a slot a `blocked`
      session would hold forever
- [x] isolation — `--worktree`, declared per task, cut by the harness

**The engine is finished.** The next thing to build is a consumer of it, not more of it. If a
change seems to belong in here, check it against the boundary above first: it almost certainly
knows about a second workload.

### The one real decision in here: resume policy

`resume:` on a task, default `interrupted`:

| | continues when |
|---|---|
| `interrupted` *(default)* | the last attempt was **lost** — the session vanished, or a worker stopped beating |
| `always` | any failure, including one the harness reported |
| `never` | nothing; every attempt starts clean |

The default distinguishes *lost* from *failed* because they are different facts. A lost session's
transcript is real work that nobody judged. A failed one is a conclusion — and dropping a model
back into the context that produced a conclusion tends to reproduce it. `EndReason` is recorded on
the `ended` event rather than inferred later, because by the time the next attempt starts, the
evidence is gone.

Verified against the live harness: attempt 2 resumed attempt 1 under **its own name**, got a fresh
session id from the harness, and genuinely continued the conversation (`COUNT.txt` came back
`1\n2`). Two rows on the board, one thread of work.

## The model

```
DESIRED   what you asked for      →  the journal, append-only JSONL      (ours)
OBSERVED  what the machine does   →  claude agents --all --json          (the harness's)
JOIN KEY  a name we choose        →  claude --name ae/<task>/<attempt>
                                        ↓
                            decide(desired, observed) → one action
```

That's the whole engine. `decide()` is pure, total, and returns exactly one step; everything
effectful is the four verbs of `Runner`. Kubernetes' control plane for the loop, durable
execution's journal for the memory, and the local harness as the kubelet.

**The engine never holds a session.** `claude --bg` hands it to the harness, which already owns
resume, stop, logs and a registry that outlives us. So a three-hour session is not a three-hour
process here — the engine can be killed, upgraded or restarted at any point in it.

### Why there are no leases

Because we do not own the thing being leased. "Is it still running" is a question we *ask*
(`observe`) rather than a claim we *hold*. That deletes the lease table, the renewal timer, the
liveness probe, the expiry reclaim and the abort plumbing — about 800 lines in the version of this
that tried to own the process.

## Using it without Effect

Effect is how this engine is written, not how it is used. The default entry point has **no Effect
in any signature**:

```ts
import { createEngine, codex } from 'agent-engine'

const engine = createEngine({ harnesses: { claude: 'claude-bg', codex } })

const id = await engine.file({ brief, cwd, harness: 'codex' })
await engine.tick()
const { entries, cursor } = await engine.feed(0)
```

Bring your own store — plain async, no `Effect.tryPromise` anywhere:

```ts
createEngine({
  journal: {
    append: async (taskId, event) => { await db.event.create({ data: { jobId: +taskId, payload: event } }) },
    read:   async (taskId) => (await db.event.findMany({ where: { jobId: +taskId } })).map(r => r.payload),
    list:   async () => (await db.job.findMany()).map(j => String(j.id)),
    feed:   async (after) => { /* WHERE id > after ORDER BY id */ },
  },
})
```

Bring your own harness — three ways, in order of how much you have to write:

| | |
|---|---|
| `'claude-bg'` | Claude Code's background sessions; it keeps the registry |
| a `HarnessSpec` | any CLI that runs a prompt and exits — a command and an exit code |
| a `PromiseRunner` | four async methods, for anything else at all |

**`src/cli.ts` imports `createEngine` and nothing else from the engine.** That is deliberate and
it is the test: if the Promise API were not enough to write the CLI with, it would not be enough
for anyone. `grep "from 'effect'" src/cli.ts` returns nothing.

The Effect API is still there under `agent-engine/effect` — `Layer` composition, typed error
channels, the lot. Keep your `effect` version aligned with this package's if you use it: Context
tags are identity-based, and two copies in one tree do not see each other's services. A consumer
who never imports Effect can never have that problem.

## Several harnesses, one board

A task picks its harness in the brief. Verified live, concurrently, on one board:

```
t-mtxodj74  claude    succeeded  1/1  Write a JavaScript function isPalindrome(s)
t-mtxodjd4  codex     succeeded  1/1  Write a file REVIEW.md containing three bullet
```

```md
---
cwd: /path/to/repo
harness: codex        # claude (default) | codex | claude-detached
---
Review the diff on this branch for race conditions.
```

Three are wired:

| harness | how it runs | who keeps the registry |
|---|---|---|
| `claude` | `claude --bg --name` | **the harness** — `claude agents --json`, free |
| `codex` | `codex exec --json`, in a worker we detach | **us** — a directory of run files |
| `claude-detached` | `claude -p`, same worker | us (there to compare the two paths) |

**Why two mechanisms and not one.** Claude Code keeps a registry of background sessions and will
answer questions about them from any process. Codex has no such thing: `codex exec` runs in the
foreground and exits. So for Codex we detach a worker per session and keep the registry ourselves
(`bin/ae-worker.ts` writes it, `src/runner-detached.ts` reads it).

That costs exactly one thing: **a heartbeat**. A worker that gets killed leaves a run file saying
`working` forever, and nothing on disk tells that apart from a session thinking hard. So the worker
beats every 5s and `observe` calls a stale beat dead — which is a lease, in the only form a lease
has ever taken. It is the price of not having somebody else's registry to read, and therefore the
price of running more than one harness. It is ~15 lines, because the engine already had a journal
and a seam.

**Adding a harness is a value, not code** — `HarnessSpec` is a command and an optional regex:

```ts
export const codex: HarnessSpec = {
  name: 'codex',
  command: (r) => ({ cmd: 'codex', args: ['exec', '--json', '-C', r.cwd, ..., r.brief] }),
  nativeIdPattern: '"(?:thread_id|session_id)"\\s*:\\s*"([0-9a-f-]{16,})"',
}
```

Exit 0 is success, anything else is failure. That is all a generic harness has to say, and it is
enough. `decide` never learns that harnesses exist — adding all of this changed it by zero lines,
which is the test of whether the seam was in the right place.

## What "done" means, and why the harness decides it

**`state: done` is not a reliable completion signal for the work this engine is for.** Measured
across four sessions:

| session | task | attached? | outcome |
|---|---|---|---|
| probe 1 | short, one deliverable | no | **`done/idle` in 67s** |
| probe 2 | long, four steps | **yes** | stuck `working/idle`, 20 min |
| control | long, four steps | no | stuck `working/idle`, 7 min |
| two eval runs | medium | yes | stuck `working`, 11 min |

The controlled pair — same task, one attached and one not — rules out the obvious suspect: **being
watched changes nothing.** The docs agree ("attaching does not change the session's recorded
state"), and a snapshot taken mid-attach showed `kind`, `state` and `status` all unmoved. What
correlates is task shape: short single-deliverable work reaches `done`; long multi-step work stops
at `working` and stays there with its transcript frozen and its files written. That fits the
documented meaning — `working` also covers *"between steps of work it drives on its own"*.

**`status` is the signal that holds.** It flipped to `idle` at the exact second the transcript took
its final write, in every probe. Claude Code's own web UI tracks `status` for its liveness dot
rather than `state` — the same conclusion, reached independently by the people who wrote it.

Two fields, two questions. Reading them as `state ?? status` discarded the useful one, and also let
an interactive session's `status: idle` be recorded as a *failure*, since `idle` is not a state at
all. `busy` is likewise a status, and no longer sits in `Observed` pretending otherwise.

So `claudeOps` answers the question itself:

```
done  ⟸  state = done
      ⟸  state = working AND not busy AND transcript quiet, for 90 seconds
```

A transcript that moves restarts the clock. That is what keeps a pause between self-driven steps
from being mistaken for an ending — the one direction where this predicate is dangerous, because a
false completion is invisible and a stall is not.

**It lives in the runner, not in `decide`.** `working` and `idle` are one harness's vocabulary; the
engine's is `working | blocked | done | failed | stopped`, and translating between them is the whole
job of a runner. `decide` did not change. Codex, which ends by exiting, needs none of this and gets
none of it. And because it is a translation rather than a judgement, it tests with an injected clock
and an injected transcript — six tests, no harness, no spend.

## Which runner: CLI or Agent SDK

Both are wired. `AE_RUNNER=sdk` swaps one for the other and **the engine does not change** — only
what is true after a crash does. That is the whole reason `Runner` is a seam and not an import.

| | `Runner.claude()` (default) | `Runner.sdk()` |
|---|---|---|
| how | `claude --bg --name …` | Agent SDK `query()` |
| owns the session | the **harness** | **this process** |
| engine dies mid-session | session runs on, next tick adopts it | session dies with it |
| run state | `claude agents --json` | an in-memory map |
| cost / turns / tool calls | not visible | **live** (`$0.1054  4 turns`) |
| refuse a tool call | no | `canUseTool`, hooks, MCP |
| good for | the fleet, long work, unattended | one task in the foreground, with a human watching |

The Agent SDK is a typed wrapper around the same CLI, but the wrapping is over **stdio
stream-json**: `query()` owns a child process and streams from it for the life of the iterator.
The docs say so directly:

> The SDK does **not** support detached or background sessions that outlive the calling process.
> All `query()` and `startup()` sessions are foreground and tied to the calling process lifecycle.
> **No background process API.**

Measured here too: `extraArgs: { bg: null }` does not escape it — the flag detaches the child, the
SDK waits for messages that never arrive, and nothing is created at all. Streaming-input mode
("persistent, interactive") is persistent *within your process* — multi-turn with interruption, not
detached. So `--bg` has no SDK equivalent, and neither does the background-session registry.

**What the SDK is used for regardless of which runner is selected**: `getSessionMessages` reads a
transcript as typed messages and works on sessions it never started — including the `--bg` ones.
That is `ae logs`. `getSessionInfo` also sees our join key, as `customTitle`.

**The missing piece, if you want the SDK runner for real work**: `options.resume`. The transcript
is durable even when the execution is not, so a lost attempt can be resumed at its last completed
turn rather than restarted. That is a policy decision — which failures resume and which start
clean — so `decide` does not make it yet.

### Why the name is the key

We choose it before the session exists, so a crash cannot lose it. Three cases, one rule:

| crashed after | next tick finds | does |
|---|---|---|
| journalling `starting` | no session named `ae/t/1` | spawns it |
| the spawn call | a session named `ae/t/1` | **adopts it** |
| journalling `spawned` | a session named `ae/t/1` | adopts it |

Verified live: kill the journal entry that records a spawn, restart, tick three times — one
session, adopted, ran to completion. This is Kubernetes adopting an orphaned Pod by label
selector, and it is why no attempt can ever run twice.

## Files

| file | lines | what |
|---|---|---|
| `src/domain.ts` | 180 | events, `fold`, **`decide`** — pure, no I/O, the whole judgement |
| `src/engine.ts` | 133 | applies one decision, then the pass over every task |
| `src/cli.ts` | 101 | the verbs: parse, call, print |
| `src/runner.ts` | 103 | the compute seam — `spawn`/`observe`/`stop`/`logs`, and nothing else |
| `src/runner-sdk.ts` | 97 | the same four verbs on the Agent SDK, with the tradeoff written down |
| `src/runner-detached.ts` | 172 | a runner for any harness that runs a prompt and exits; the Codex spec |
| `src/runner-composite.ts` | 53 | dispatch by harness, merge what they all see |
| `bin/ae-worker.ts` | 78 | the detached worker: babysits one harness process, keeps the run file |
| `src/journal.ts` | 118 | append-only JSONL per task, plus the board-wide feed |
| `test/decide.test.ts` | 16 tests | every branch of the decision, no harness needed |
| `test/engine.test.ts` | 9 tests | the crash cases, against a fake harness |

If a change wants an `if` in `engine.ts`, it probably belongs in `decide`. That line is what keeps
this small, and it is the one rule worth defending.

## Use it

```bash
cat > brief.md <<'MD'
---
cwd: /path/to/repo
permissionMode: acceptEdits
maxAttempts: 2
---
Fix the failing test in src/foo.test.ts. Do not change the test.
MD

node bin/ae.ts start brief.md    # file it
node bin/ae.ts up                # reconcile on a timer — this is the daemon
node bin/ae.ts ls                # every task, desired vs observed
node bin/ae.ts logs <id>         # the session's own output
node bin/ae.ts stop <id>
```

```bash
node bin/ae.ts feed 0            # everything that has happened; prints the next cursor
node bin/ae.ts watch             # the same, followed
```

**The feed is the engine's API to whatever is built on top of it.** A workflow layer files a task,
watches for its `settled` event, and files the next one — it never reads a task journal and never
learns what `decide` is:

```ts
import { file, Journal } from 'agent-engine'

const { entries, cursor } = yield* journal.feed(lastCursor)
for (const { taskId, event } of entries) {
  if (event.kind === 'settled' && event.outcome === 'succeeded') {
    yield* file({ brief: `Review what ${taskId} did`, cwd, harness: 'codex' })
  }
}
```

The cursor is a byte offset into `feed.jsonl` and never expires: a consumer that was away for a
week replays rather than being told to start over.

`AE_ROOT` points at a different board, the way a kubeconfig points at a different cluster.
`AE_MAX_CONCURRENT` (default 3) is how many sessions of **each** harness may run at once — the
ceiling is per harness because your rate limits are. Admission is serial within a pass, so the
count is true rather than approximately true:

```
$ ae tick
4 action(s) over 4 task(s)  [claude:2]
t-mtxp3z06  claude  running (working)  1/1  Write the number 1 into N1.txt
t-mtxp3z5p  claude  running (working)  1/1  Write the number 2 into N2.txt
t-mtxp3zb3  claude  pending            0/1  Write the number 3 into N3.txt
t-mtxp3zgs  claude  pending            0/1  Write the number 4 into N4.txt
```

`AE_RUNNER=sdk` swaps the compute (see above); note that the SDK runner must stay in one process,
so use `ae up` rather than repeated `ae tick`.

A brief is markdown: `key: value` frontmatter (`cwd`, `model`, `permissionMode`, `maxAttempts`),
body is the prompt. No YAML dependency, no schema, no template language — yet.

## Deliberately missing

Not "todo" — *excluded*, so the core stays legible: no board, no DAG or dependencies, no git
worktrees, no pull requests, no budget ceilings, no approvals, no multi-machine anything. Each is
a kind built **on** this one, the way `tekton.dev` is built on `batch/v1`. None of them requires
changing `decide`, which is the test of whether this core is the right size.

## The three next things, in order

1. **Watch instead of poll.** `ae up` ticks on a timer. The harness's registry changing is the
   hint that skips the wait; the tick stays as the fallback that makes missing one free.
2. **Worktrees.** `claude --worktree <name>` already isolates a session. One field on the brief,
   one flag in `Runner.claude` — the engine does not learn a new concept.
3. **Sequencing.** A `Run` of steps that files the next task when the previous one settles. A
   second kind with its own `decide`, reading this one's journal and writing its own.

Anything that makes `decide` longer than a screen is a second kind wearing a disguise.
