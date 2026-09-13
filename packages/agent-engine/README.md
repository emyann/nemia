# ae — an engine for agent sessions

A scheduler for agent sessions on your own machine. It does **one thing**: take a brief, run one
agent session to completion, and let you follow it — surviving its own death while it happens.

The part you must read to understand it is `src/domain.ts`, and `decide` in it is a screen long.

```bash
npm test                 # no money spent
AE_LIVE=1 npm test       # adds the one test that runs a real Claude Code session, and spends some
npm run typecheck
node bin/ae.ts           # the verbs
```

`test/readme.test.ts` holds this file to the code: it fails when this README names an environment
variable nothing reads, a file that does not exist, an `ae` verb the CLI lacks, or a count of tests
or lines — and when a source file or a brief key goes unmentioned here.

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
knows about a second workload. A knob on the workload — `model`, `tools`, `effort`, `mcp` — is a field
carried on the task and read by a runner, never a callback into `decide`.

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
effectful is the four verbs of `Runner`, and a fifth, optional one that lets a finished session go. Kubernetes' control plane for the loop, durable
execution's journal for the memory, and the local harness as the kubelet.

**The engine never holds a session.** `claude --bg` hands it to the harness, which already owns
resume, stop, logs and a registry that outlives us. So a three-hour session is not a three-hour
process here — the engine can be killed, upgraded or restarted at any point in it.

### Letting a finished session go

Claude Code keeps every `--bg` session in `claude agents` until something removes it, and one that
has given its closeout stays there `working/idle` for good — every run used to leave its sessions
behind, to be cleared by hand. So once an attempt's end is on the record, the engine **releases** its
session: `claude stop` if it still runs, then `claude rm`. It is I/O applied to the record, not a
decision — `decide` is not asked — and it is level-triggered: asked on every pass that still sees such
a session, so a crash between writing the end and releasing is repaired by the next pass, and a
release the harness refuses is asked again.

**Measured before relying on it** (`test/live.test.ts`, Claude Code 2.1.270): a session told a word
settled and was released in the same pass; it was gone from `claude agents`, `ae logs` still read its
transcript, and a second task filed with `resumeFrom` its id said the word back. `ae logs` finds a
released session by the id its end was recorded with, and asks the task's own harness for it.

Two kinds of session are left listed. A task that asked for a `worktree` has its session stopped and
not removed: `claude rm` deletes the worktree with the session, and the task's work is in it. And a
task settled with no end on the record — stopped by a person, or past its deadline — never journalled
its session's id, so removing that session would leave `ae logs` nothing to read; it is not running by
then. `release` is optional on `Runner`: the detached runner has none, because its run files are the
record `logs` reads.

### Why there are no leases

Because we do not own the thing being leased. "Is it still running" is a question we *ask*
(`observe`) rather than a claim we *hold*. That deletes the lease table, the renewal timer, the
liveness probe, the expiry reclaim and the abort plumbing — most of the version of this that tried
to own the process.

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
| a `PromiseRunner` | four async methods, and an optional fifth, `release`, for anything else at all |

**`src/cli.ts` imports `createEngine`, and types, and nothing else from the engine.** That is
deliberate and it is the test: if the Promise API were not enough to write the CLI with, it would
not be enough for anyone. `grep "from 'effect'" src/cli.ts` returns nothing, and a test says so.

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
| `claude-detached` | `claude -p --output-format json`, same worker | us (there to compare the two paths) |

**Why two mechanisms and not one.** Claude Code keeps a registry of background sessions and will
answer questions about them from any process. Codex has no such thing: `codex exec` runs in the
foreground and exits. So for Codex we detach a worker per session and keep the registry ourselves
(`bin/ae-worker.ts` writes it, `src/runner-detached.ts` reads it).

That costs exactly one thing: **a heartbeat**. A worker that gets killed leaves a run file saying
`working` forever, and nothing on disk tells that apart from a session thinking hard. So the worker
beats every 5s and `observe` calls a stale beat dead — which is a lease, in the only form a lease
has ever taken. It is the price of not having somebody else's registry to read, and therefore the
price of running more than one harness. It is a handful of lines, because the engine already had a
journal and a seam.

**Adding a harness is a value, not code** — `HarnessSpec` is a command, an optional regex, and
optionally the words it refuses and a reader of what it prints:

```ts
export const codex: HarnessSpec = {
  name: 'codex',
  command: (r) => ({ cmd: 'codex', args: ['exec', '--json', '-C', r.cwd, ..., r.brief] }),
  refuses: (task) => /* a sentence when the task asks for a sandbox or effort Codex lacks */,
  nativeIdPattern: '"(?:thread_id|session_id)"\\s*:\\s*"([0-9a-f-]{16,})"',
}
```

Exit 0 is success, anything else is failure. That is all a generic harness has to say, and it is
enough. `decide` never learns that harnesses exist — adding all of this changed it by zero lines,
which is the test of whether the seam was in the right place.

## What a task may say, and what is refused

A brief is markdown: `key: value` frontmatter, one line per key, and the body is the prompt. `#`
after a space starts a comment. The keys are a closed list:

| key | what |
|---|---|
| `cwd` | the directory the session works in; default, where you run `ae` |
| `harness` | `claude` (default), `codex`, `claude-detached` |
| `model` | the harness's model name |
| `permissionMode` | the harness's own words — see below; default `auto` for Claude Code, `workspace-write` for Codex |
| `maxAttempts` | a whole number from 1; default 1 |
| `deadlineSeconds` | wall clock across all attempts, above 0; absent, no deadline |
| `resume` | `interrupted` (default), `always`, `never` — the retry policy |
| `resumeFrom` | a session id to continue, instead of starting cold |
| `worktree` | `true`, `false`, or a name — the harness cuts it |
| `closeoutSchema` | a JSON Schema file — the workload ends by answering in that shape |
| `tools` | `Read, Grep, Glob` — the only tools the session has; see below |
| `effort` | how hard the harness thinks, in its own words — see below |

**Refused, with exit code 2 and a sentence naming the fix, before anything is filed.** `ae start`
refuses a key not in that list (`afer: implement` is `` `afer` is not a key a brief has ``, with
the list), a key given twice, a line that is not `key: value`, an empty value, a count or a number
of seconds that is not one (`deadlineSeconds: 5m` used to become `NaN`, be journalled as `null`,
and stop its task on the first pass), a `resume` that is not a policy, a `cwd` or schema file that
is not there, and a brief with no prompt.

**`file()` refuses the same values at the API**, so the CLI is not the only door that checks:
a harness the engine does not have (it used to run on the fallback, silently), counts and seconds
it cannot use, an unknown policy, an empty brief, cwd, model, resumeFrom or effort, a `cwd` that is
not absolute (the process that ticks a task need not be the one that filed it, and a detached worker
once resolved a relative one twice; `ae start` resolves it for you), a `tools` that
is not a list of names, an `mcp` that is not a map of `.mcp.json` servers (below), and a word the
task's harness does not have. Those words belong to the
harness, so each harness says them — `refuses` on a `HarnessSpec`, the lists beside `claudeOps` —
and `domain.ts` never learns them:

| harness | `permissionMode` | `effort` |
|---|---|---|
| `claude`, `claude-detached` | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `manual`, `plan` | `low`, `medium`, `high`, `xhigh`, `max` |
| `codex` | `read-only`, `workspace-write`, `danger-full-access` (and `bypassPermissions`, meaning the last) | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |

Claude Code's permission modes are what 2.1.270 accepts when it parses its arguments (`default` is
taken though its help no longer lists it). Its efforts are refused here because the CLI does not
refuse one: an unknown `--effort` gets a warning and the default. Codex's efforts are the ones its
API named when refusing a bad one, for the default model; Codex itself checks none, and a bad one
fails the session. A harness brought as a `PromiseRunner` is asked nothing.

**A spawn that fails** is answered by what the harness can vouch for. When nothing can have
started — the OS would not create the process, a detached worker was never launched, or a
`PromiseRunner` rejects with `refused: true` — the attempt ends `failed`, reason `unstartable`, in
the harness's words, and `decide` settles or retries it like any failure. Any other failure may
have left a session behind (a launcher can create one and lose its acknowledgement), so the call is
recorded as spawned, with its error, and the grace window decides: the session is adopted if it
appears, the attempt `lost` if it never does. Either way the tick goes on; it used to reject, and
every task behind the failed one stalled on every pass.

## Narrowing a session: `tools`, `effort` and `mcp`

All three are fields on the task, carried on the `filed` event and `State` and read only by a runner.
`decide` never reads any of them, and a test reads `decide` to keep it so.

| harness | `tools: Read, Grep, Glob` | `effort: high` |
|---|---|---|
| `claude` | `--tools Read,Grep,Glob` | `--effort high` |
| `claude-detached` | the same | the same |
| `codex` | `-s read-only` when the list has none of Bash, Write or Edit; otherwise not narrowed | `-c model_reasoning_effort="high"` |

**`--tools`, not `--allowedTools`.** A tool that is not in the session's set does not exist for it;
an unapproved one is still there to try. The flag is variadic, so it is emitted just before
`--permission-mode`, which always follows and ends the list — directly before the prompt it would
take the prompt as a tool name, the same trap as a bare `--worktree`. An empty list is no tools.

**Verified live, not only by `--help`:** `test/live.test.ts` (`AE_LIVE=1`) files two real `--bg`
sessions told to write a file, one with `tools: Read, Grep, Glob` and one without. On Claude Code
2.1.270 the fenced one wrote nothing and still gave its closeout — `--tools` does not take away
the tool a closing statement is made with — and the control wrote the file.

**Codex has no tool list**, only one shell and three sandboxes, so the list can only take writing
away: a list with none of Bash, Write or Edit runs `read-only` whatever sandbox the task named,
and a list with any of them leaves the sandbox as the task named it.

### MCP servers: `mcp`, and never the operator's

A Claude Code session spawned with no MCP flags loads every server the operator has: user scope
(`~/.claude.json`) and their claude.ai connectors — mail, calendar, drive — beside the checkout's
`.mcp.json` (measured on 2.1.270, from the `init` event of `claude -p`). An unattended step could
reach whatever the person who started the engine can. So every `claude` and `claude-detached` spawn
is `--strict-mcp-config`, which loads only what `--mcp-config` names — and `--no-chrome`, below. The
runner names:

| the task | `--mcp-config` | the session has |
|---|---|---|
| no `mcp`, no `.mcp.json` in its `cwd` | nothing | no MCP server at all |
| a `.mcp.json` in its `cwd` | `<cwd>/.mcp.json` — strict alone would drop it | the repository's servers |
| `mcp: { … }` | that, and a file the runner writes under its root | the repository's and the task's |

— and in no row the operator's. `mcp` maps a name (letters, digits, `-`, `_`) to a server in a
`.mcp.json` entry's shape: `{ "command": "npx", "args": [...], "env": {...} }`, or
`{ "type": "http", "url": "https://...", "headers": {...} }` (`"sse"` too). `file()` refuses any other
shape, with the fix in the sentence: a key an entry does not take, an argument or a value that is not
a string, and a `url` with no `type`, from which Claude Code loads nothing and says nothing. The
runner's file is outside the workspace, owner-only, and rewritten or cleared on every spawn; the map
itself is journalled as filed, like every field on the task, so a secret in it is on disk there too.
A `.mcp.json` that is not JSON ends the attempt `unstartable`, naming the file: named on the command
line, it stops Claude Code before a session exists. With `worktree`, the file named is the `cwd`'s
own, not the worktree's copy of it. Both files are named by absolute path: Claude Code resolves the
flag's path from inside the session's `cwd`.

**Strict is not the whole fence.** Claude in Chrome — which drives the operator's own browser, and
whatever they are signed in to there — is switched on by a user setting
(`claudeInChromeDefaultEnabled`), named in no MCP config, and was still connecting in a `--bg` session
spawned strict. So every Claude Code spawn also passes `--no-chrome`, and a step that needs a browser
names one in `mcp` or its `.mcp.json`. A plugin can bring MCP servers too; whether strict holds those
back was not measured, because the one plugin on the machine that found this is disabled.

**Verified live:** `test/live.test.ts` (`AE_LIVE=1`) files two `--bg` sessions, each told to wait
while any MCP server is still connecting and then to name every server and MCP tool it has. On
2.1.270, on a machine with user-scope servers, claude.ai connectors and Chrome switched on, the one
with no `mcp` in an empty directory had none, and its transcript was told of no server at all; the
control, given one stdio server, had that server and its tool, and nothing else. The first run
asked without waiting, and both sessions answered while their servers were still connecting — which
is how Chrome was found.

**Codex is given the servers, but not fenced.** `codex exec` takes them per invocation as one config
override, `-c mcp_servers={"name"={"command"=...,"args"=[...],"env"={...}}}` — one value with every
name quoted, because Codex splits a dotted `-c` key on every dot, quotes or none. A `url` server's
`headers` become `http_headers`; an SSE server is refused, since Codex connects only to stdio and
streamable HTTP servers. But the override is merged into the operator's `~/.codex/config.toml`, not
put in its place — `-c mcp_servers={}` leaves every server there loaded (codex-cli 0.154.0) — and
Codex has no strict flag. **A Codex task still has the operator's Codex servers**
([open issue 9](docs/open-issues.md)). A task's server named like one in that `config.toml` is
refused at spawn, `unstartable`: Codex would merge the two, and run the task's command with the
operator's args and env.

`ae start` has no `mcp` key: a brief's values are one line each, so the map is the API's for now.

## What "done" means, and why the harness decides it

**`state: done` is not a reliable completion signal for the work this engine is for.** Measured
across five sessions:

| session | task | attached? | outcome |
|---|---|---|---|
| probe 1 | short, one deliverable | no | **`done/idle` in 67s** |
| probe 2 | long, four steps | **yes** | stuck `working/idle`, 20 min |
| control | long, four steps | no | stuck `working/idle`, 7 min |
| two eval runs | medium | yes | stuck `working`, 11 min |
| live run | long, 9m24s, 5 files + tests | no | **`done/idle`**, straight from `working/busy` |

Twelve sessions in, sorted by how long they ran:

| session | harness | resumed | seconds | outcome |
|---|---|---|---|---|
| split/respond | claude | **yes** | 6499 | **stalled at `working`** |
| cancel/implement | claude | no | 563 | `state: done` |
| cancel/respond | claude | **yes** | 532 | **stalled at `working`** |
| split/implement | claude | no | 131 | `state: done` |
| cancel/review | codex | no | 69 | `state: done` |
| split/review | codex | no | 45 | `state: done` |
| probe a1 a2 c1 c2 | claude | no | 8–17 | `state: done` |
| probe b1 b2 | claude | **yes** | 12 | `state: done` |

`probe a/b/c` was built to test one hypothesis — *resumed sessions never reach `done`* — with four
byte-identical briefs, two carrying `resumeFrom` and two cold. **It is refuted:** both resumed
sessions reached `done` in twelve seconds.

That left an *interaction* standing — both stalls were resumed AND ran for minutes — so a second
probe went after that cell directly: a stack VM with an assembler, a disassembler, twenty tests and
three example programs, four ways, two of them resuming a session that had just built something
else. It is refuted as well:

| session | resumed | seconds | outcome |
|---|---|---|---|
| split/respond | yes | 6499 | **stalled** |
| VM e2 | no | 943 | `state: done` |
| VM e1 | no | 722 | `state: done` |
| **VM d1** | **yes** | **569** | **`state: done`** |
| cancel/implement | no | 563 | `state: done` |
| cancel/respond | yes | 532 | **stalled** |
| VM d2 | yes | 473 | `state: done` |

`VM d1` was resumed and ran 569 seconds — longer than the stalled `cancel/respond`, longer than the
succeeding `cancel/implement` — and reached `done` cleanly. Over 300 seconds the score is: resumed
n=4, stalled 2; cold n=3, stalled 0.

**Twenty sessions in, nothing we have tested predicts it.** Not resume, not duration, not the two
together. Two resumed long sessions stalled and two did not, under briefs that differed in nothing
but their working directory. That intermittency is the finding, and it reads more like a race in
how the harness records a terminal state than like a rule about the work.

Which is the case for the predicate, made better than an argument could make it: **a trigger you
cannot characterise is a trigger you cannot design around.** The only untested cell left is
resumed × git worktree — both stalls were workflow steps in one, and no probe has been — but that
is fitting a shape to two points, and a timeout already covers it either way.

The controlled pair — same task, one attached and one not — rules out the obvious suspect: **being
watched changes nothing.** The docs agree ("attaching does not change the session's recorded
state"), and a snapshot taken mid-attach showed `kind`, `state` and `status` all unmoved. Task
shape looked like the correlate — short single-deliverable work reaching `done`, long multi-step
work stalling at `working` with its transcript frozen and its files written. **The fifth session
refutes that**: nine and a half minutes, five files, tests written and run, and it went
`working/busy → done/idle` directly, never once passing through `working/idle`. So the stall is
real but not predicted by task shape, and we still cannot say what triggers it. The predicate below
is therefore a **safety net, not the normal path** — this run settled on `state: done` and never
started the clock.

Which is the honest reason to keep it: `working` also covers *"between steps of work it drives on
its own"*, so a session that stops there is indistinguishable from one that is thinking. Something
has to break the tie, and only the harness's own vocabulary can.

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

**The clock is the transcript's, not the observer's.** A session that speaks pushes its own
deadline out, which is what keeps a pause between self-driven steps from being mistaken for an
ending — the one direction where this predicate is dangerous, because a false completion is
invisible and a stall is not. The first version instead remembered when *we* first saw a session
idle, and that was wrong in a way tests could not see: the verdict depended on the observer living
long enough to reach it. Measured, with a one-second window and a month-cold transcript —

| driver | verdict |
|---|---|
| one long-lived process (`wf up`) | `working` → `done` |
| three one-shot processes (`wf tick`, cron, a shell loop) | `working`, `working`, `working` — forever |

— so anyone driving the engine a tick at a time got a predicate that could never fire. Reading the
transcript's own mtime needs no memory, survives a restart by construction, and gives every driver
the same answer.

What that costs: the rule no longer requires 90 seconds of *observed* idleness, so a single `idle`
sighting over a cold transcript is enough. Only `busy` stands between that and a session in the
middle of a long tool call — which writes nothing for minutes at a time (35 seconds, on a live
session we sampled). It is one gate rather than two, held deliberately, and pinned by a test. A
session whose transcript cannot be read gets no verdict at all; the deadline is for those.

The quiet rule still ends a task that asked for a closeout and never gave one as `succeeded` —
open issue 1 in `docs/open-issues.md`, deferred, with the reason there.

### The workload's own word

Everything above is us guessing from outside. A task may instead declare `closeoutSchema` — a JSON
Schema — and the harness asks the workload for a final answer in that shape. **The moment it gives
one, the attempt is over:** no ninety-second wait, no stall to characterise, because the workload
said so. That holds when the harness then marks the session `blocked` as much as when it stays
`working` — a step that called `StructuredOutput` and ended its turn has been seen `blocked`, idle,
and until that was fixed it waited on a person for ever and held its slot.

How each harness is asked — `claude` and `codex` verified live:

| harness | how | where the answer lands |
|---|---|---|
| Claude Code | `--json-schema`: the session gets a `StructuredOutput` tool and calls it to finish. Works under `--bg`, though documented only for `-p` (2.1.270). | the session's transcript |
| `claude-detached` | `-p --json-schema --output-format json`: `claude -p` prints one `result` object, and the answer is its `structured_output` (one live `-p` call, 2.1.270; under the engine, a fake `claude` only) | the worker's capture of its output, stamped with when that was last written |
| Codex | `exec --output-schema`, with `-o` at a file the runner chose outside the workspace (0.154.0, strict schema) | that file |

A detached run's end is written only once the harness's pipes have closed and its output is in the
log. `exit` can come first, and the pass that records the end would then miss an answer still in the
pipe — for good, since an end is written once. Two seconds at most: a child the harness leaves behind
can hold a pipe open for as long as it likes.

Runners report the statement **and when it was made**. The engine decides whether it belongs to this
attempt, records it on the attempt (`state.attempts[n].closeout`), and never reads it. Two rules
guard that decision, both learned from real runs:

- **Made before the attempt began, it was inherited, not said.** A resumed Claude Code session's
  transcript holds its parent's entire conversation under the child's own session id — 460 entries,
  measured — so the parent's `StructuredOutput` call arrives looking exactly like the child's. Only
  the time tells them apart, and only the journal knows when the attempt started.
- **From a busy session, it is not final.** A step once declared itself done, carried on, found it
  could not commit, and revised its verdict eleven seconds later.

It replaced a file the workload wrote into its own directory (`doneFile`), and that file is why the
design looks like this. A file in the workspace travels down a git branch: the next step was cut a
worktree that already said it was finished, two steps settled `succeeded` in six seconds each having
done nothing, and the board called the run healthy. A statement made to the harness lives in the
session, not in the repository.

It layers UNDER the harness's own answer rather than replacing it. [Hermes
Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban) solves the same
problem with a terminal tool call, `kanban_complete(...)`, which it can require because every worker
is its own. Here a structured final answer is the fast path and observation is the floor: a workload
that never gives one ends exactly as it did before.

**It lives in the runner, not in `decide`.** `working` and `idle` are one harness's vocabulary; the
engine's is `working | blocked | done | failed | stopped`, and translating between them is the whole
job of a runner. `decide` did not change. Codex, which ends by exiting, needs none of this and gets
none of it. And because it is a translation rather than a judgement, it tests with an injected clock
and an injected transcript (`test/completion.test.ts`) — no harness, no spend.

## What an attempt consumed

Every attempt records `usage` — `{ turns?, toolCalls?, inputTokens?, outputTokens?, costUsd? }` — and
`exitCode`, copied from the sighting that ended it. **Each is `null` when nothing measured it,
never `0`**: a zero that means "nobody counted" reads as "cost nothing". A count its runner could not
see is absent from `usage` in the same way, and `ae show` names it not measured. `decide` reads neither.
An attempt also keeps when it ran — `startedAt` and `endedAt`, the times of its `starting` and
`ended` entries, `endedAt` being `null` while it runs — so how long it took is on the record.

| runner | `usage` | `exitCode` |
|---|---|---|
| `claude` | from the transcript it already reads: responses, tool calls and tokens since the session's own start; no cost | `null` — the process is the harness's |
| `codex` | from its `exec --json` stream, as the worker captured it: tool calls, and tokens from `turn.completed`; no turns — a Codex turn is a prompt, not a model response — and no cost | the worker's record of the process |
| `claude-detached` | `null` — not measured ([open issue 4](docs/open-issues.md)) | the worker's record of the process |
| `sdkRunner()` | from the SDK's result message, cost included when the SDK gives one | `null` |

Two measured traps shape the transcript count. A response is written as one line per content block,
each repeating its message id and usage, so responses are counted once, by id. And a resumed
transcript holds its parent's conversation with the parent's timestamps, so only what came after
the session's `startedAt` in `claude agents --json` is counted; a row with no start reports no
usage rather than a wrong one. `ae show` prints one line per attempt — when it ran, then what it
consumed, naming what was not measured — and an attempt still running as `running since <start>`:

```
attempt 1  done  09:00:01 → 09:05:00 (4m 59s)  <turns> turns · <calls> tool calls · <in> in · <out> out · cost not measured
attempt 2  failed  09:05:02 → 09:05:40 (38s)  exit 1  usage not measured
```

Codex's stream is read by the same rule. Tokens are given only when every turn that started completed
with them, and tool calls only while every item in the stream is of a type seen before —
`command_execution` and `file_change` are calls, `agent_message` is not. Nothing is added to
`input_tokens` or `output_tokens`: in every run measured (codex-cli 0.154.0), cached tokens were a part
of the first and reasoning tokens a part of the second. `cache_write_input_tokens` was 0 in all of
them, so whether `input_tokens` counts it is unknown, and a stream where it is not 0 gives no input
count:

```
attempt 1  done  09:00:01 → 09:02:10 (2m 09s)  exit 0  turns not measured · <calls> tool calls · <in> in · <out> out · cost not measured
```

## Letting a sandboxed Codex step commit

Codex's `workspace-write` sandbox keeps `.git` read-only on purpose — including the real git
directory behind a worktree's `.git` pointer — because a writable `.git/hooks` would let an agent
plant code that runs outside the sandbox the next time anyone runs git. No writable-root flag
changes that: `--add-dir` was tried against a real run and removed ([openai/codex#27418](https://github.com/openai/codex/issues/27418)).

What does work is a Codex **rule** plus **trust**. A repository that ships
`.codex/rules/git-commit.rules`

```
prefix_rule(pattern = ["git", ["add", "commit"]], decision = "allow")
```

lets exactly `git add` and `git commit` run outside the sandbox. `git push`, `git -c … commit` and
`rm -rf .git` do not match and stay inside it. Codex loads a project's rules only when the project is
trusted, and the one configuration measured to let a step commit from a worktree had the repository
**and** the worktree trusted.

So the Codex spec **extends trust and never grants it.** When a worktree's repository is already
trusted in your own `~/.codex/config.toml`, the worktree is trusted for that run too
(`codex.prepare`). A repository you have not trusted gets nothing, because trusting it would also
load whatever other Codex settings it ships — not a decision an engine gets to make for you.

A step that still cannot commit is not stuck. Committing is the workflow layer's job: it commits
what a step leaves behind. The rule is what lets Codex do it itself.

## Which runner: CLI or Agent SDK

**`createEngine` and `ae` always use the CLI runners.** No environment variable selects another.
`sdkRunner()` exists, but only as a `Layer` for the Effect API: you compose it yourself, and tick
in the same long-lived process that spawned the sessions, because they die with it.

```ts
import { Effect, Layer } from 'effect'
import { Journal, sdkRunner, file, tick } from 'agent-engine/effect'

const board = Layer.mergeAll(Journal.layer(Journal.filesOps(root)), sdkRunner())
await Effect.runPromise(file({ brief, cwd }).pipe(Effect.provide(board)))
// then, in this same process: tick() on a timer, provided the same `board`
```

The engine does not change between them — only what is true after a crash does. That is the whole
reason `Runner` is a seam and not an import.

| | `Runner.claude()` (what `createEngine` uses) | `sdkRunner()` |
|---|---|---|
| how | `claude --bg --name …` | Agent SDK `query()` |
| owns the session | the **harness** | **this process** |
| engine dies mid-session | session runs on, next tick adopts it | session dies with it |
| run state | `claude agents --json` | an in-memory map |
| usage | turns, tool calls and tokens from the transcript, once the session is idle; no cost | from the SDK's result, cost included |
| narrow the tools | `tools` → `--tools`: a tool not in the list does not exist for the session | not wired: it passes only `model` and `permissionMode` |
| MCP servers | `--strict-mcp-config`: the checkout's `.mcp.json` and the task's `mcp`, never the operator's | not wired |
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

| file | what |
|---|---|
| `src/domain.ts` | events, `fold`, **`decide`** — pure, no I/O, the whole judgement |
| `src/engine.ts` | applies one decision, then the pass over every task |
| `src/facade.ts` | `createEngine`: the engine in Promises, and what `file()` refuses |
| `src/index.ts` | the Effect API's export list — the boundary; `decide` is not on it |
| `src/cli.ts` | the verbs, and the brief: parse (closed keys), call, print |
| `src/journal.ts` | append-only JSONL per task, plus the board-wide feed |
| `src/runner.ts` | the compute seam — `spawn`/`observe`/`stop`/`logs` — and Claude Code's runner, words and usage |
| `src/runner-detached.ts` | a runner for any harness that runs a prompt and exits; the Codex and `claude -p` specs |
| `src/runner-composite.ts` | dispatch by harness, merge what they all see |
| `src/runner-sdk.ts` | the same four verbs on the Agent SDK, with the tradeoff written down |
| `bin/ae.ts` | the `ae` entry point: a refusal prints its sentence and exits 2 |
| `bin/ae-worker.ts` | the detached worker: babysits one harness process, keeps the run file |
| `test/decide.test.ts` | every branch of the decision, no harness needed |
| `test/engine.test.ts` | the crash cases, the ceiling, the fields carried, against a fake harness |
| `test/completion.test.ts` | Claude Code's "done", its argv and its usage, with a fake `claude` on `PATH` |
| `test/detached.test.ts` | the worker, the lease, the composite, each spec's argv and refusals — `sh` as the harness |
| `test/mcp.test.ts` | what each harness is given for MCP, at shipped defaults — fake `claude` and `codex` on `PATH` |
| `test/facade.test.ts` | the Promise API, and every refusal at `file()` at shipped defaults |
| `test/release.test.ts` | letting a finished Claude Code session go, at shipped defaults — a fake `claude` that keeps a registry |
| `test/journal.test.ts` | the store and the feed's cursor |
| `test/brief.test.ts` | the brief parser, made to refuse; `ae start` exits 2 |
| `test/usage.test.ts` | the transcript count, and "not measured" rather than 0 |
| `test/readme.test.ts` | this file, held to the code |
| `test/live.test.ts` | the `--tools` fence, `--strict-mcp-config`, and what a released session still has, against real Claude Code — `AE_LIVE=1` only |
| `docs/open-issues.md` | what is still wrong or half-verified |
| `docs/hkb-migration.md` | notes toward moving hkb onto this engine |

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
Fix the failing parser test. Do not change the test.
MD

node bin/ae.ts start brief.md    # file it
node bin/ae.ts up                # reconcile on a timer — this is the daemon
node bin/ae.ts ls                # every task, desired vs observed
node bin/ae.ts show <id>         # the journal, then one line per attempt
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
import { createEngine } from 'agent-engine'

const engine = createEngine()
const { entries, cursor } = await engine.feed(lastCursor)
for (const { taskId, event } of entries) {
  if (event.kind === 'settled' && event.outcome === 'succeeded') {
    await engine.file({ brief: `Review what ${taskId} did`, cwd, harness: 'codex' })
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

### `tick` and `up`, and why both

`up` is `tick` on a timer — `engine.start()`, with a guard so a slow pass never overlaps the next.
So the question is not why `tick` exists but why `up` does, and the answer is only convenience:
somewhere has to hold the timer, and a shell loop pays a Node start per pass.

**`tick` is the one that earns its place, because it is the conformance test for level-triggering.**
A level-triggered engine reads the world, decides, and acts — carrying nothing between passes. If
repeated one-shot `tick` cannot drive a task to completion but `up` can, some state is hiding in
the process, and that is a bug however well the suite passes. It is not a hypothetical: the
quiescence clock was exactly this, and `up` hid it completely.

So: `up` for a daemon, `tick` for cron, CI, a git hook, or one deterministic pass while debugging —
and `tick` in a loop as the thing that must keep working, or the claim at the top of this file is
not true. The **one** exception is `sdkRunner()`, whose sessions live in the process that started
them; there a long-lived ticking process is required and one-shot `tick` genuinely cannot work.

`ae watch` follows the journal. It is `engine.watch` — the store pushes (the file journal watches
the feed) and the timer is only a backstop — not a poll loop, which is what it used to be while
the *workflow* layer above it used the good API. A CLI should be the best consumer of its own
engine, not the worst.

## Deliberately missing

Not "todo" — *excluded*, so the core stays legible: no board, no DAG or dependencies, no worktree
management (the harness cuts worktrees; the engine only asks for one), no pull requests, no budget
ceilings, no approvals, no multi-machine anything. Each is a kind built **on** this one, the way
`tekton.dev` is built on `batch/v1`. None of them requires changing `decide`, which is the test of
whether this core is the right size.

## What is left

**Watch instead of poll.** `ae up` ticks on a timer. The harness's registry changing is the hint
that skips the wait; the tick stays as the fallback that makes missing one free. Worktrees and
sequencing, once listed here, are done — sequencing as `agent-workflows`, a consumer of this engine.
Everything else that is still wrong or only half-verified is in `docs/open-issues.md`.

Anything that makes `decide` longer than a screen is a second kind wearing a disguise.
