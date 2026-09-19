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
- [x] attempts, stop, logs — as text, and as the conversation to follow (`transcript`)
- [x] a person's words into a session while it runs, on the record (`say`)
- [x] concurrency ceiling, per pool — one subscription is one pool, however many harnesses run on it
- [x] the feed — a cursored stream of everything that happened
- [x] resume — an attempt continues the one before it, by policy
- [x] deadline — wall clock across attempts; also the only thing that ends a `blocked` session,
      which waits on a person forever — and holds no slot while it waits
- [x] isolation — `--worktree`, declared per task, cut by the harness

**The engine is finished.** The next thing to build is a consumer of it, not more of it. If a
change seems to belong in here, check it against the boundary above first: it almost certainly
knows about a second workload. A knob on the workload — `model`, `tools`, `disallowedTools`, `effort`, `mcp`, `budgetUsd`, `contextTokens`, `remoteControl` — is a field
carried on the task and read by a runner, never a callback into `decide`; so is `priority`, read by the pass that orders the board.

### The one real decision in here: resume policy

`resume:` on a task, default `interrupted`:

| | continues when |
|---|---|
| `interrupted` *(default)* | the last attempt was **lost** — the session vanished, or a worker stopped beating — or **unsigned**: it ended — quiet, or `done` by its harness — without the closing statement it was asked for |
| `always` | any failure, including one the harness reported — but a session that spent its budget |
| `never` | nothing; every attempt starts clean |

The default distinguishes *lost* from *failed* because they are different facts. A lost session's
transcript is real work that nobody judged. A failed one is a conclusion — and dropping a model
back into the context that produced a conclusion tends to reproduce it. `EndReason` is recorded on
the `ended` event rather than inferred later, because by the time the next attempt starts, the
evidence is gone.

An attempt its harness ended at its spend cap — reason `budget`, below — is followed by no attempt under any policy: its
task settles `failed`. A budget spent is spent.

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
effectful is the four verbs of `Runner`, and four optional ones: one that finds a session by its name for less than observing them all, one that lets a finished session go, one that reads its conversation, and one that hands a running session a person's words. Kubernetes' control plane for the loop, durable
execution's journal for the memory, and the local harness as the kubelet.

**The engine never holds a session.** `claude --bg` hands it to the harness, which already owns
resume, stop, logs and a registry that outlives us. So a three-hour session is not a three-hour
process here — the engine can be killed, upgraded or restarted at any point in it.

### Letting a finished session go

Claude Code keeps every `--bg` session in `claude agents` until something removes it, and one that
has given its closeout stays there `working/idle` for good — every run used to leave its sessions
behind, to be cleared by hand. So once an attempt's end is on the record, the engine **releases** its
session: `claude stop` if it still runs, then `claude rm`. Whether it still runs is the registry's
word: a session whose end is on the record because it went quiet, or gave its closeout, is still
working as far as `claude agents` is concerned. It is I/O applied to the record, not a
decision — `decide` is not asked — and it is level-triggered: asked on every pass that still sees such
a session, so a crash between writing the end and releasing is repaired by the next pass, and a
release the harness refuses is asked again. A session listed `done` whose process still runs is stopped before it is
removed too, and what it cost is read once it is stopped: Claude Code writes a session's cost only as its process exits
([What an attempt consumed](#what-an-attempt-consumed)).

**Measured before relying on it** (`test/live.test.ts`, Claude Code 2.1.270): a session told a word
settled and was released in the same pass; it was gone from `claude agents`, `ae logs` still read its
transcript, and a second task filed with `resumeFrom` its id said the word back. `ae logs` finds a released session by the id recorded when its attempt ended, or when its task
settled with the attempt still open, and asks the task's own harness for it.

A task stopped by a person, or past its deadline, ends its open attempt — reason `operator` or `deadline` — before it
settles, and that end carries its session's id (since 2026-09-19; below). A journal from before settled over the open
attempt, and has the id on its `settled` entry instead, so that session is released like any other and `ae logs` still
reads it. One kind is left listed: a task that asked for a `worktree` has its session
stopped and not removed, because `claude rm` deletes the worktree with the session and the task's work
is in it. (So is a session whose task settled before its id was recorded: removed, it could not be
read.) `release` is optional on `Runner`: the detached runner has none, because its run files are the
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
| a `PromiseRunner` | four async methods, and four optional ones, `find`, `release`, `transcript` and `say`, for anything else at all |

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
optionally the words it refuses, a reader of what it prints, where it keeps its conversation, and
the pool it is counted in under the ceiling:

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
| `budgetUsd` | the most one attempt may spend, in dollars, digits only — `claude-detached` only; see below |
| `contextTokens` | the session's context window, in tokens, digits only — `claude` and `claude-detached`, 100000 to 1000000; see below |

**Refused, with exit code 2 and a sentence naming the fix, before anything is filed.** `ae start`
refuses a key not in that list (`afer: implement` is `` `afer` is not a key a brief has ``, with
the list), a key given twice, a line that is not `key: value`, an empty value, a count or a number
of seconds that is not one (`deadlineSeconds: 5m` used to become `NaN`, be journalled as `null`,
and stop its task on the first pass), a `budgetUsd` that is not dollars in digits (`$5` is refused), a `contextTokens` that is not tokens in digits (`200k` is refused, and written back as `200000`), a `resume` that is not a policy, a `cwd` or schema file that
is not there, and a brief with no prompt.

**`file()` refuses the same values at the API**, so the CLI is not the only door that checks:
a harness the engine does not have (it used to run on the fallback, silently), counts and seconds
it cannot use, an unknown policy, an empty brief, cwd, model, resumeFrom or effort, a `cwd` that is
not absolute (the process that ticks a task need not be the one that filed it, and a detached worker
once resolved a relative one twice; `ae start` resolves it for you), a `tools` that
is not a list of names, a `disallowedTools` that is not a list of permission rules, an `mcp` that is not a map of `.mcp.json` servers (below), a `budgetUsd` that is not dollars above 0 or that its harness would not keep (below), a `contextTokens` that is not a whole number of tokens its harness takes, or any on a harness with no window to set (below), a `remoteControl` that is not true or false or that its harness has no flag for (below), a `priority` that is not a finite number (below), and a word the
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

All four are fields on the task, carried on the `filed` event and `State` and read only by a runner.
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

**`disallowedTools` is the other half of the fence.** `tools` says which tools a session has;
`disallowedTools` says what it may not use of them, in Claude Code's permission rules, one per entry:
`SendMessage`, `Bash(npm run build)`. Claude Code is given the list as `--disallowedTools`, right after
`--tools` and ended by the same flag, and a deny beats every allow: the checkout's
`.claude/settings.json`, `--allowedTools`, the permission mode. So a step in `dontAsk` can be kept from
a command the settings allow for another step's sake. `file()` refuses an entry that is not one rule:
a space or a comma outside the parentheses is two rules to the harness. An empty list denies nothing
and passes no flag. Codex refuses a list that denies anything: it has no tool to take away, and the list
would be dropped without a word.

**Measured on `claude --bg` in `dontAsk`, beside a control** (`test/live.test.ts`, `AE_LIVE=1`, Claude Code
2.1.270): two sessions with `tools: Bash`, each in a checkout whose `.claude/settings.json` allows
`npm run build` and `npm run e2e`, told to run both. The control ran both. The one filed with
`disallowedTools` naming the two ran neither, refused by the deny's own message ("Permission to use Bash
with command npm run build has been denied"), and still gave its closeout. So the engine's one argument
reads as two rules, and the deny beat the settings' allow. **Run it from a checkout Claude Code trusts:**
the test makes its checkouts inside this package, because in a temporary directory a `--bg` session was
not given the directory's settings, and the control was refused too (the directory is untrusted, the
likely reason). By hand on `claude -p`, `--disallowedTools "SendMessage,CronCreate,CronDelete,RemoteTrigger"`
took those four from a session's tools, 30 to 26; no test holds that.

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

## What a session may spend: `budgetUsd`

`budgetUsd: 0.25` is the most one attempt's session may spend, in dollars: a field on the task like `tools`, carried on
the `filed` event and `State` and read only by a runner. `decide` never reads it, nor a cost — a test reads `decide` to keep
it so. What `decide` learns is that a harness *ended* a session on its cap, a fact the harness printed:

| harness | given | a session that reaches the cap |
|---|---|---|
| `claude-detached` | `--max-budget-usd 0.25` | ends: exit 1, and a result whose `subtype` is `error_max_budget_usd`. Its attempt ends `failed`, reason **`budget`**, with what it cost, and its task settles `failed` |
| `claude` | refused at `file()`: a `--bg` session keeps no cap | — |
| `codex` | refused at `file()`: `codex exec` has no spend cap, and its stream no cost | — |

**Measured before it was built** (Claude Code 2.1.272, haiku, a $0.01 cap, a session told to read a file forty times).
`claude -p` stopped after two responses: exit 1, `is_error`, `terminal_reason: budget_exhausted`, "Reached maximum budget
($0.01)", and `total_cost_usd` $0.018 — the cap is checked after the response that crosses it, so a session spends past it
by up to one response. `claude --bg` took the same flag without a word, read the file 42 times, spent $0.19 and was listed
`done`; neither the registry nor its transcript said anything of a budget, and the flag's help says it "only works with
--print". A cap that caps nothing is a guard that is silently inert, so `file()` refuses a budget on `claude`, naming
`claude-detached`. The `--bg` runner still passes the flag to a task that reaches it through the Effect API, which refuses
nothing (open issue 6), and `test/live.test.ts` fails the day a `--bg` session keeps it. What that leaves unbounded is
open issue 17.

**A budget spent is spent.** An attempt that ended on its budget ends its task: it settles `failed`, noting `attempt N
spent its budget`, and no attempt follows — resumed or clean, whatever `maxAttempts` and `resume` say. To run it again,
file the task again with a larger budget; to continue that session, with `resumeFrom` its id: `claude -p --resume` counts
only its own process's spend (measured: a resumed session reported $0.0042 of its own, where the one it continued had
spent $0.018). The harness counts one session's spend, and the engine counts none: an attempt that fails *under* its cap —
the harness's verdict, or lost — is retried under the same cap, so `maxAttempts: 3` can still spend nearly three caps
before one is reached.

`ae start` takes `budgetUsd: 0.25` in a brief, digits only.

## How much a session keeps in mind: `contextTokens`

`contextTokens: 200000` is the context window a task's sessions are given, in tokens: past about it, Claude Code compacts
the conversation — a summary in place of what the session read — and carries on. Absent, the session runs on the model's
whole window, which on this machine was a million tokens, and none of 234 worker sessions ever compacted: every token that
entered one was read again on every call after it (the pivot measurement of 2026-09-18, open issue 26). A field on the task like
`budgetUsd`, carried on the `filed` event and `State` and read only by a runner, on every attempt's spawn — a continuation
included, since a resumed session keeps only the flags it is given. `decide` never reads it. The Kubernetes neighbour is
`resources.limits`: what a workload may hold, set by whoever files it and kept by the node, not the scheduler.

| harness | given | refused at `file()` |
|---|---|---|
| `claude` | `--autocompact 200000` | outside 100000 to 1000000, which the CLI refuses while it parses: a spawn would fail on every pass |
| `claude-detached` | `--autocompact 200000` | the same |
| `codex` | — | any: `codex exec` has no such knob |
| a `HarnessSpec` | its `command` is handed `contextTokens` | any, unless it declares the windows it takes (`contextTokens: { least, most }`), and outside them |

**Measured before it was built** (Claude Code 2.1.278, sonnet, open issue 26). A `--bg` session at `--autocompact 100k`
compacted at 64k to 84k tokens of context, wrote a `compact_boundary` line and the summary into its transcript, read on
from where it was, and — continued with the same flag — signed off through `StructuredOutput`; `claude -p` did the same
and gave its `structured_output`. The window is not part of the cached prompt: a resume given the same one, another or none
read the whole prompt from the cache. **A window too small for one turn's reads stalls a session**: reading 22k tokens a
call on a 100k window, Claude Code said "Autocompact is thrashing" after three compactions in a row and ended the turn,
and the session was listed `blocked`, which the engine leaves to a person. An attempt that compacted takes its tokens from
the `cost-state` Claude Code writes as it exits, which counts the summary's calls its transcript does not.

`ae start` takes `contextTokens: 200000` in a brief, digits only, and `ae show` prints it.

## Reachable from a phone: `remoteControl`

`remoteControl: true` bridges a task's Claude Code session to claude.ai: `claude --bg` is given `--remote-control`, and
the session is listed in the web's agents view, where it can be **driven** — typed into, its prompts answered, stopped —
from a browser or a phone, by anyone signed in to the account, and not only seen. That is why it is never a default. A
field on the task, carried on the `filed` event and `State`, read only by the Claude runner, on every attempt's spawn;
`decide` never reads it. The Kubernetes neighbour is a container's `stdin` and `tty`: whether anything may attach to the
workload, declared on the workload.

| harness | `remoteControl: true` |
|---|---|
| `claude` | `--remote-control`, on every attempt |
| `claude-detached` | refused at `file()`: `claude -p` runs a prompt and exits, and its help offers Remote Control only to an interactive session |
| `codex`, and any other `HarnessSpec` — agent-workflows' `check` | refused at `file()`, naming the harness and the one to file on |
| a `PromiseRunner` | asked nothing: handed `remoteControl` on the spawn, to honour or not |

**Measured before it was built** (2026-09-16, Claude Code 2.1.273, three throwaway haiku sessions): a `claude --bg`
session is listed in the agents view only when its registration under `~/.claude/sessions/` carries a
`bridgeSessionId`, and it gets one only when started with `--remote-control`. Without the flag none appeared, from a
clean environment or from a daemon's. A worker of 2.1.266 carried one unasked, so Claude Code used to bridge background
sessions on its own. **Measured again under the engine** by `test/live.test.ts` (2.1.274): a session filed with
`remoteControl: true` registered with a `bridgeSessionId`, and an identical one filed without it registered with none.

**`--remote-control [name]` takes an optional value** — the `--worktree` trap: directly before the prompt, it would take
the prompt as the session's name. So it goes before `--permission-mode`, which always follows, and no name is given;
Claude Code names the session itself. `remoteControl: false` asks for nothing and is filed on any harness; a value that
is not true or false is refused. It is not a key a brief has. What it leaves open — nothing reads whether a session was
bridged, and what a person types into it from the web is not journalled — is open issue 23.

## Which waiting task starts first: `priority`

`priority: 1` says which waiting task a free slot goes to first when its pool is at its ceiling: higher first; within one
priority, the oldest filing; and between two filed at the same instant, the ids' order. Absent is 0, and a negative number
is below that. A field on the task, carried on the `filed` event and `State`, and read by the pass when it orders the board
(`admissionOrder` in `src/engine.ts`) and nowhere else: no runner is told it, and `decide`, which is handed one task, never
reads it — a test reads `decide` to keep it so. Kubernetes' `priorityClassName`, without the preemption: nothing running is
stopped for a higher priority, which waits for a slot like any task.

**What it is for: a run in flight keeping its momentum.** A run's next step is filed a check and a pass after its last
ended, so in filing order any task filed in that gap goes first, and the run waits behind work that arrived after it
started. A workflow layer that files every step after a run's first above a new run's first keeps that slot with the run.

`file()` refuses a `priority` that is not a finite number — `NaN`, `Infinity`, `"high"` — naming the fix. The Effect door
refuses nothing (open issue 6), and a value it journalled that is not a finite number is read as 0. `ae ls` shows
`priority 2` beside a task filed with one. It is not a key a brief has, so `ae start` files at 0.

## What "done" means, and who decides it

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

So `claudeOps` answers the half of the question that is its harness's vocabulary — whether a session has stopped:

```
done   ⟸  state = done
quiet  ⟸  state = working AND not busy AND nothing written for 90 seconds,
          counted from its last write or its own start, whichever is later
quiet  ⟸  state = working AND busy AND the last word in its conversation is its OWN
          closeout's tool result, with nothing written since for those 90 seconds
```

and reports quiet as a fact, `quietMs`, with the state left `working`. What quiet means is `decide`'s (below).

**The second quiet rule is for a session held by something that is not the work.** A step signed off with
`StructuredOutput`, every commit in, and left a `run_in_background` loop running; its registration read `status: shell`,
the registry listed it busy, and seventy-seven minutes later nothing had read its closeout — no end, no check, no
review — until a person killed the shell by hand (issue 24, measured 2026-09-17; its journal shows the gap, and its
transcript not one line in it). `busy` is what held it: it stops the runner reading a statement at all, and stops the
engine acting on one. So `busy` no longer answers the question by itself. When a busy session's transcript has been
cold for the floor, the runner reads it: if the conversation ends with the result of that session's own
`StructuredOutput` call, the work is over, whatever its process is still doing, and the attempt ends on the statement.
Three things have to hold, and each has a test that makes it refuse — the floor (a session mid-turn writes something),
the last word (a session that spoke after its closeout is still going), and *its own* (a resumed session inherits its
parent's closing turn, and has said nothing of its own until it writes). Everything else about a busy session is
unchanged: with no statement it is left to the deadline exactly as before.

**What that read costs, and why it is kept.** A busy session costs its transcript's mtime and nothing else until that
has been cold for ninety seconds — which every tool call longer than ninety seconds is, `npm ci` and this repository's
own suite included. The read that follows is then kept for as long as the transcript stays as it found it, by the same
mtime machinery a finished session's read uses, so a long call costs one read rather than one per pass: measured on a
39.5 MB transcript, a read is 174–282 ms against 17–60 ms for the mtime. Keeping it changes no answer, because the
branch is only reached while nothing has been written — which is exactly the condition under which reading again would
say the same thing.

**What the registry's words are.** `status` is one of `busy`, `shell`, `idle` and `waiting` (2.1.274's own list), and
Claude Code's view renders `busy` and `shell` alike as working. The engine reads only `busy` as busy: `shell` is not a
turn, so the first quiet rule already ends such a session. The reading rests on a registry field and a transcript's
shape, which is [issue 13's caveat](docs/open-issues.md) — a release that renames either makes the rule silent, and
`AE_LIVE=1` is what would notice. A background loop with a bound is the courtesy that keeps it from mattering.

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

### Quiet, when a closing statement was asked for and none came

Quiet used to be `done`, for every task. A task that had asked for a closeout, and whose session ended its turn
without one — a crash, a rate limit, a model that forgot — settled `succeeded` with nothing said, and whatever waited
on it ran: a false completion, the one failure worse than a stall. Measured at shipped defaults before the fix, with a
fake `claude` listing the session working and idle over a transcript quiet for ten minutes: `ended: done`, `reason:
harness`, `settled: succeeded`, no closeout. Only the journal knows whether a statement was asked for, so the runner
reports how long a session has been quiet, and `decide` says what that means:

| the task | quiet ends the attempt | and then |
|---|---|---|
| asked for no `closeoutSchema` | `done`, reason `harness` | `succeeded`, as before: quiet is all such a task has |
| asked for one, and this attempt gave one | `done`, with the statement | `succeeded` |
| asked for one, and none came — or only one made before the attempt began | `failed`, reason **`unsigned`** | the resume policy: continued with a nudge while attempts remain, `failed` when they run out |

**The harness's `done` is the second door, and it is shut the same way.** A session its harness lists `done` with no
statement was journalled `done`, reason `harness`, and settled `succeeded` until 2026-09-19: of the 344 tasks filed with a
schema in this machine's store that day, 5 had ended so. For a task that asked for a statement, `done` without one is
now `unsigned` too, recorded `failed` — one condition in `decide`, held by `test/decide.test.ts` and a fake `claude`
listing the session `done` in `test/unsigned.test.ts`. A task that asked for nothing still succeeds on `done`, and a
journal written before the rule folds as it did: `fold` reads an end as recorded, never re-derives it.

`unsigned` is continued under `interrupted` and `always`, as `lost` is: the work in the transcript is real, and nobody
has judged it, the session included. Its session is stopped first if it still runs — quiet is not gone — and the next
attempt `--resume`s it, told why it is back instead of the brief it already has: *"You ended without calling
StructuredOutput, and this task asks for a closing statement. Change nothing: the work you did stands, and nothing is
being asked of it. Call StructuredOutput now with your closeout. If the work is not finished, finish it first and then
call it; if you cannot finish it, call it anyway, saying what stops you."* The nudge is journalled on the attempt's
`starting` entry, and read as `state.attempts[n].nudge`. Out of attempts, the task settles `failed` with the note
`N attempt(s), none succeeded: the last ended without the closing statement it was asked for`.

**The nudge names the tool, and its words are pinned by a test.** It asked for "your closing statement" and named
nothing until 2026-09-17, and twice that did not get a finished step to sign off: each had done all its work and ended
its turn with a prose summary, and each signed off within thirty seconds of a person's `wf retry --message` naming
`StructuredOutput` and saying to change nothing (issue 25). The tool's name is Claude Code's, and that is the only
harness a quiet end reaches — quiet is reported by the `claude --bg` runner alone, though `done` without a statement is
`unsigned` on any runner. Whether the wording
alone closes the next such session is not measured.

Quiet is counted from the later of the transcript's last write and the session's own start in `claude agents`: a
continuation `--resume`s a transcript that may have been cold for an hour, and measured by the transcript alone it
would end the moment the registry listed it idle.

**What is not measured.** `test/unsigned.test.ts` holds all of this with a fake `claude`; no live session has gone
quiet unsigned under it. On the record on the machine this was written on, 144 Claude Code tasks asked for a closeout,
and 2 of their attempts ended `done` without one — both the read fixed in `00e301b`, not a session that said nothing —
so the case has not been seen live either way. Claude Code 2.1.271's bundle has a retry count for structured output
(`MAX_STRUCTURED_OUTPUT_RETRIES`) and an error for running out of it. Whether a `--bg` session is nudged by the harness
when its turn ends without the call, and whether it then ends itself `done` with nothing said — a way to a success
without a statement that quiet does not cover — is what `test/live.test.ts` measures (`AE_LIVE=1`), and it has not been
run.

### Every ended attempt carries its statement or the reason it has none

The contract, over every runner and every way an attempt ends: an `ended` entry carries **the agent's statement** —
`closeout`, the payload its session gave, untouched — or **the machine's reason** it has none, in `reason`. Never
neither, and never words the machine wrote in the agent's name: the engine writes no `closeout` of its own, and a
statement it read is recorded as read.

| `reason` | recorded | the attempt |
|---|---|---|
| `harness` | the harness's own state | its harness ended it: `done` with the statement, where one was asked for; `failed` or `stopped` as the harness said; `done` with nothing, on a task that asked for nothing |
| `unsigned` | `failed` | ended — quiet, or `done` — without the statement it was asked for (above) |
| `lost` | `failed` | vanished, or its worker stopped beating: nobody said anything |
| `unstartable` | `failed` | its spawn was refused, and nothing ran |
| `budget` | `failed` | its harness cut it at the task's spend cap — `failed` whatever state it was left in |
| `operator` | `stopped` | a person stopped its task, and the session was stopped before its harness ended it |
| `deadline` | `failed` | its task ran past `deadlineSeconds`, and the session was stopped before its harness ended it |

A statement given before the cut is carried on `operator` and `deadline` ends too; a session its harness had already
ended when the cut came is recorded as its harness ended it.

**Two ends left neither, until 2026-09-19.** A stop and a deadline settled the task over its open attempt, with no
`ended` at all: 4 of the 511 settled tasks in this machine's store, all stopped by a person, every one on a task that
had asked for a statement. `decide` now ends the attempt first (`cut`, beside `endOf`), and the task settles on the next
step as before. And an attempt its harness cut at its budget while listing it `done`, or quiet, was recorded `done`,
reason `budget` — and its task settled `succeeded`, past the rule that a spent budget settles `failed`. None is on the
record here; the contract test found it. `test/decide.test.ts`'s CONTRACT walks every sighting, with and without a
schema, a statement, a spent budget and a cut, to its settle, and fails on either.

A check (agent-workflows' `check:`) keeps its verdict in its exit code, not a statement: one cut at its deadline is
`deadline`, and its exit code, if its process left one, says how it died, not what it found.

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

Claude Code's runner reads the statement from the transcript on every idle pass while a session
works. What it read from a finished one it keeps for that attempt only — the row's name, its session,
and the start `claude agents` gave it — and only while the transcript has not been written since.
Kept by session id, for good, a read went wrong twice on one step. A `view` saw the session listed
final at least ten seconds before its — inferred from the pinned usage, not observed — `StructuredOutput`, and "nothing said" was kept. Then a nudged retry,
which `--resume` runs under the same id, was handed that nothing and its first try's usage, to the
byte. A resume changes both facts, so neither may live in a daemon's memory (`test/resume.test.ts`).

It replaced a file the workload wrote into its own directory (`doneFile`), and that file is why the
design looks like this. A file in the workspace travels down a git branch: the next step was cut a
worktree that already said it was finished, two steps settled `succeeded` in six seconds each having
done nothing, and the board called the run healthy. A statement made to the harness lives in the
session, not in the repository.

It layers UNDER the harness's own answer rather than replacing it. [Hermes
Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban) solves the same
problem with a terminal tool call, `kanban_complete(...)`, which it can require because every worker
is its own. Here a structured final answer is the fast path and observation is the floor: a workload
that never gives one ends by quiet — unsigned, where one was asked for (above).

**It lives in the runner, not in `decide`.** `working` and `idle` are one harness's vocabulary; the
engine's is `working | blocked | done | failed | stopped`, and translating between them is the whole
job of a runner. What a quiet session means is `decide`'s, since only the journal knows whether a statement was
asked for. Codex, which ends by exiting, needs none of this and gets
none of it. And because it is a translation rather than a judgement, it tests with an injected clock
and an injected transcript (`test/completion.test.ts`) — no harness, no spend.

## What an attempt consumed

Every attempt records `usage` — `{ turns?, toolCalls?, inputTokens?, uncachedTokens?, cacheWriteTokens?, cacheReadTokens?,
peakContextTokens?, firstContextTokens?, firstCacheWriteTokens?, compactions?, outputTokens?, costUsd?, apiMs?, toolMs?, unpricedModel? }` — and `exitCode`, copied from the sighting that ended it, or, for what a harness writes only as its
session exits, read once the session was let go (`measured`, below). **Each is `null` when nothing measured it,
never `0`**: a zero that means "nobody counted" reads as "cost nothing". A count its runner could not
see is absent from `usage` in the same way, and `ae show` names it not measured. `decide` reads neither.
An attempt also keeps when it ran — `startedAt` and `endedAt`, the times of its `starting` and
`ended` entries, `endedAt` being `null` while it runs — so how long it took is on the record.

| runner | `usage` | `exitCode` |
|---|---|---|
| `claude` | from the transcript it already reads: responses, tool calls, tokens in their three classes and the peak context since the session's own start; its cost, API time and tool time from the `cost-state` Claude Code writes as the session's process exits, read once the engine has let it go | `null` — the process is the harness's |
| `codex` | from its `exec --json` stream, as the worker captured it: tool calls, and tokens and their classes from `turn.completed`; no peak, no turns — a Codex turn is a prompt, not a model response — and no cost: the stream carries none (seventeen runs of codex-cli 0.154.0 read) | the worker's record of the process |
| `claude-detached` | its cost and API time, from the result `claude -p` prints (`total_cost_usd`, `duration_api_ms`), and its tokens in their classes from the same result's `usage`; no peak, turns or tool calls ([open issue 4](docs/open-issues.md)) | the worker's record of the process |
| `sdkRunner()` | from the SDK's result message: tokens, their classes when it gives all three, and cost when it gives one; no peak | `null` |

**What a session cost is the harness's figure, never a price worked out here.** Claude Code writes it into a `--bg`
session's transcript as a `cost-state` line — `totalCostUSD`, `totalAPIDuration`, `totalToolDuration`, `startTime`,
`hasUnknownModelCost` — and, measured on this machine's transcripts from 2.1.246 to 2.1.272 and by stopping sessions by
hand, writes it **twice as the session's process exits, and never per turn**; `claude stop` returns once it has. A session
that gives its closeout or goes quiet still has its process when the engine writes its end — so does one listed `done` —
so that end has no cost. The engine's release of the session stops it and reads the transcript again, and the pass
journals what it read as a **`measured`** entry for the attempt, which `fold` merges into its `usage`. Once: a session left
listed is released on every pass, and a second read says nothing the record lacks. A session that had exited before its end
was written has its cost on the end itself.

**A resumed attempt's cost is its own.** `--resume` carries a session's count on: one session continued twice wrote
$28.32, $43.04 and $47.21, each under its first process's `startTime`. So an attempt records the total its session exited
with, less the total it had when the attempt began — the last `cost-state` before the attempt's first line — and not the
session's total. That makes a cost mean what the attempt's tokens already mean, only what came after its start, and what a
resumed `claude -p` reports, its own process's spend. A `cost-state` has no time of its own, so it belongs to the attempt
whose lines it follows, and lines after the session was continued under another name (an `agent-name` line) are not the
attempt's. No cost is given, rather than a wrong one: while no line has been written since the attempt began; when the
count was carried on from a total the transcript does not show; and, for `costUsd` alone, when Claude Code could not price
a model the session used — `unpricedModel: true`, since a total too low reads as the whole.

**What a session read, by price.** Measured over 234 worker sessions on 2026-09-18: 96.9% of input tokens were read
from the cache, 3.1% written to it, almost none uncached — a read priced $0.50 a million and a write $10, a
twenty-fold spread that `inputTokens` adds into one number. So an attempt records its input in its three classes as its
runner measured them, and `inputTokens` stays their sum, so a journal written before they were still folds:

| field | Claude Code's count | `claude --bg` (transcript) | `claude -p` (result) | `codex exec` (stream) |
|---|---|---|---|---|
| `cacheReadTokens` | `cache_read_input_tokens` | each response's, summed | its `usage`'s | `cached_input_tokens` |
| `cacheWriteTokens` | `cache_creation_input_tokens` | each response's, summed | its `usage`'s | `cache_write_input_tokens`: 0 in every run |
| `uncachedTokens` | `input_tokens` | each response's, summed | its `usage`'s | `input_tokens` less the cached |
| `peakContextTokens` | the three on one response | the largest response, or compaction | **absent** | **absent** |
| `firstContextTokens`, `firstCacheWriteTokens` | the first response's | its first response's three, and its write | **absent** | **absent** |
| `compactions` | `compact_boundary` lines | the attempt's own, absent when none | **absent** | **absent** |

Measured by running each on this machine, 2026-09-19. `claude -p` (2.1.278) prints its session's totals in `usage` —
the process's own, for a `--resume` too — and in `usage.iterations` the last response alone, which is not the largest: no
peak. `codex exec` (0.154.0) counts `cached_input_tokens` inside `input_tokens`, and a `turn.completed` totals a prompt's
responses: no peak, though its rollout's `token_count` events carry each response's, unread. A class a runner cannot see
is absent, never 0, and a Codex turn whose cache writes are not 0 gives no input count at all, as before.

**How large a session's context got** is `peakContextTokens`: the largest input — the three classes together — any one
of the attempt's responses read. A compaction's summary call writes no response line, and Claude Code writes the context
it summarised on the boundary (`compactMetadata.preTokens`, at or a few thousand past the last response before it on 25
boundaries read), so that counts as one. It is what a task's `contextTokens` caps: the median worker of 2026-09-18
peaked at 173k tokens and the largest at 831k. It does not say a session reached its window: Claude Code compacts well
short of it — at 173,584 and 173,254 tokens under `--autocompact 200000`, and 63k to 84k under 100k (open issue 26) —
and a compaction's context is the peak. So an attempt counts its own compactions, `compactions`, and that is what says it
got there.

**A resumed attempt's numbers are its own**, as its cost is: its classes and its peak are counted over its own lines.
Its first response reads its parent's whole conversation, so its peak starts where its parent ended, and nothing is
taken off it — that is the context it carried. That first response is kept apart, `firstContextTokens` and
`firstCacheWriteTokens`: a continuation whose cache still holds its parent's conversation reads it there and writes only
what is new, and one whose cache missed writes the whole of it again, at twenty times a read — 43 did on 2026-09-18, 200k
to 640k tokens each, and one number hid it for a week. The attempt's writes in all cannot tell them apart: a warm
continuation that grows from 60k to 150k writes some 90k over its responses. The engine records the counts; the reading
is a caller's (`wf`, the board).

**None of it is priced here.** `costUsd` is the harness's own figure; the engine turns no token into a dollar.

Two measured traps shape the transcript count. A response is written as one line per content block,
each repeating its message id and usage, so responses are counted once, by id. And a resumed
transcript holds its parent's conversation with the parent's timestamps, so only what came after
the session's `startedAt` in `claude agents --json` is counted; a row with no start reports no
usage rather than a wrong one. A count read from a finished session is kept as its statement is: for
that start, while the transcript is unchanged. `ae show` prints one line per attempt — when it ran, then what it
consumed, naming what was not measured, and its cost to the cent (`<$0.01` under one: `$0.00` would read as free) — and an
attempt still running as `running since <start>`. After the cost, what the attempt read by class and its peak context, each named not measured where its runner could not see it. `ae ls` prints the latest attempt's cost beside its turns, `$3.01 · 12t`:

```
attempt 1  done  09:00:01 → 09:05:00 (4m 59s)  <turns> turns · <calls> tool calls · <in> in · <out> out · $4.87 · read <r> · wrote <w> · uncached <u> · peak <p>
attempt 2  failed  09:05:02 → 09:05:40 (38s)  exit 1  usage not measured
attempt 3  failed (budget)  09:05:41 → 09:05:44 (3s)  exit 1  turns not measured · tool calls not measured · tokens not measured · $0.02
```

Codex's stream is read by the same rule. Tokens are given only when every turn that started completed
with them, and tool calls only while every item in the stream is of a type seen before —
`command_execution` and `file_change` are calls, `agent_message` is not. Nothing is added to
`input_tokens` or `output_tokens`: in every run measured (codex-cli 0.154.0), cached tokens were a part
of the first and reasoning tokens a part of the second. `cache_write_input_tokens` was 0 in all of
them, so whether `input_tokens` counts it is unknown, and a stream where it is not 0 gives no input
count:

```
attempt 1  done  09:00:01 → 09:02:10 (2m 09s)  exit 0  turns not measured · <calls> tool calls · <in> in · <out> out · cost not measured · read <r> · wrote 0 · uncached <u> · peak not measured
```

## Following a session: `transcript`

`logs` flattens a session to lines of text. `transcript` gives the same session's conversation as
events a board can draw — messages, thinking, tool calls and their results — in one shape for every
harness:

```ts
const { events, cursor } = await engine.transcript(taskId)   // from the start
const since = await engine.transcript(taskId, cursor)        // only what was written after

type TranscriptEvent = {
  id: string                                   // the harness's own; a tool_result carries its call's
  at: string                                   // ISO 8601: the time on the harness's record
  role: 'assistant' | 'user' | 'system'
  kind: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'system'
  text?: string
  tool?: { name: string; input: unknown }      // on a tool_use
  result?: { text: string; isError: boolean }  // on a tool_result
}
```

**Pull-only, like everything here.** Nothing is pushed and nothing is remembered between reads: the
caller polls with the cursor the last read returned, and something that streams to a browser does that
polling itself (the api, in plan §4 S). The cursor is a byte offset after the last whole line read, and
a hash of the bytes before it. A line still being written waits for the next read. A cursor from a file
that shrank or was replaced — or from an attempt whose session has since changed — reads again from the
start, rather than from the middle of something else, or nothing for ever; so a caller keys what it
holds by `id` and `kind`, and one handed an event it already has has been read from the start.

**A result pairs to its call by `id`**, so the two can fold into one line, and an event is unique by `id`
and `kind` together. A tool result is `user`, as the model receives it. **The closeout is not hidden:**
Claude Code's `StructuredOutput` is a `tool_use` like any other, and Codex's final answer is its last
message. **Times are the record's**, never the read's: a resumed Claude Code session's transcript holds
its parent's conversation with the parent's times, `at` keeps them, and the caller — which knows when
the attempt began — decides what to show.

| harness | read from | what it cannot give |
|---|---|---|
| `claude` | the session's transcript: the raw JSONL the closeout is read from, not `getSessionMessages`, whose messages carry no time | the text of thinking Claude Code wrote empty — three blocks in four, in the transcripts measured — which is a thinking event with no `text` |
| `codex` | the thread's rollout, `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-…-<thread id>.jsonl`, found by the thread id the worker reads off `exec --json` | below |
| `claude-detached` | the same transcript as `claude` | anything before the session exits: its id is in the one object `claude -p --output-format json` prints, last |
| a `PromiseRunner` | its own `transcript`, when it has one | — |

Claude Code's lines are read as it writes them, measured on the 150 transcripts last written on this
machine: one event per content block; a `system` line as a `system` event; a line Claude Code put into
the conversation itself (`isMeta` — "Continue from where you left off.") as `system` too; a subagent's
lines left to its own transcript, as the SDK leaves them; a block of a type not read named, as `logs`
names one.

**Codex, as far as its records allow** (codex-cli 0.154.0, read on the 34 rollouts on this machine). A
rollout says most things twice — as the model was given them, and as the thread items Codex itself
shows — and the items are read: the prompt without the instructions and context Codex puts around it,
each command with its exit code, each file change with its status. The model's own call is an `exec`
script that runs commands, and its output said "Script completed" around a command that exited 2, so it
could not say whether a result was an error. What the records do not give, and so is not given:

- **Thinking text.** Reasoning is written encrypted, and every summary was empty: a thinking event with no `text`.
- **When a command began, or one still running.** An item is written once it has completed, so a
  command's `tool_use` and `tool_result` carry that one time, and a command in flight is not there yet.
- **A Claude Code tool name.** A call is named for its item, `CommandExecution` or `FileChange`, not
  `Bash` or `Edit`; its input is the command and its cwd, or the changes.
- **Anything before the worker has the thread id**, and any item of a type not in those rollouts beyond
  a `system` event naming it.

**Which session is read.** An attempt that has ended — or whose task settled with it open — is read by the
session id the journal recorded, and no registry is asked: a board that re-reads a finished step costs no
`claude agents`, and a registry that cannot be read does not stop it. An attempt in flight is found by
name when its task's harness can `find` it — for Claude Code, from the session's registration, with no `claude
agents` call — and by observing that harness alone when it cannot, or finds none (below). A registry that cannot be read this time counts as nothing observed,
as a pass counts it. So does a session not started yet: no events, and the cursor asked with (or one from
the start). Neither is a refusal: ask again.

**Refused, with exit code 2** and the fix in the sentence: a task the engine has no record of, a harness
that keeps no conversation this engine can read — a `PromiseRunner` or a `HarnessSpec` without
`transcript` — whose tasks have `logs`, and, for the engine's own readers (`claude-bg` and a
`HarnessSpec`), a cursor none of them gave. **A `PromiseRunner`'s cursor is its own**: the engine passes it
through as the runner gave it, and hands the runner none of its own. The start a read of no session
returns reaches the runner as no cursor at all.

## Telling a running session something: `say`

`kubectl attach` speaks to a running container and leaves an audit line; `say` is that. It hands a person's
words to the session of a task's attempt in flight, through the task's own harness, and journals them:

```ts
const said = await engine.say(taskId, 'Widen the scope to apps/api too.')
// { at: '2026-09-14T16:06:19.851Z', attempt: 1, text: 'Widen the scope to apps/api too.' }
;(await engine.view(taskId)).state.said   // every one, in the order said
```

```bash
node bin/ae.ts say <id> Widen the scope to apps/api too.   # the words are everything after the id
```

**Why it exists.** A step steered mid-flight by cross-session message left nothing on its run, so its reviewer
could not tell a change a person had authorised from a step overstepping. Now the words are a `said` entry on
the task's journal — `at`, `attempt`, `text` — in the feed, in `ae show`, and on `state.said`. **`decide` never
reads it**, and a test pins that: what was said to a session is a fact for whoever reviews the work, not a
judgement on it.

**The words go first, the entry after.** A `said` on the record is words a harness took, and a `say` that
rejects has journalled nothing. The price is a crash window: a process killed between the two has delivered
words and left no trace. The other order leaves a trace of words that may never have been delivered, on a
record whose whole use is to be believed.

**How the words reach a Claude Code session**, measured on 2.1.270 before relying on it. Every session listens
on its own inbox socket: the one another session's `SendMessage` reaches, and the one Claude Code documents for a
script to post into. The runner finds it through the session's registration, `~/.claude/sessions/<pid>.json` and
its `messagingSocketPath`, by the pid `claude agents` lists, and posts one line —
`{"type":"user","session_id":…,"message":{"role":"user","content":…}}` — with the words as given. No token: on
macOS and Linux the inbox does not ask for one, and the key beside the registration is another session's
credential, not the engine's. The `session_id` makes the inbox drop the words if the socket has passed to
another session since it was observed. A registration this user does not own, a socket path that is a symlink
or not a socket, or a socket another user owns, is refused before anything is sent. A busy session reads the
words between tool calls; an idle one starts a turn with them. Either way Claude Code tells the model they came
from another session and not from its user — so words cannot approve a permission prompt, and a session may
decline what it judges out of bounds. `transcript` gives them as a `system` event.

**Taken is not read.** The inbox writes nothing back. A `crossSessionInbound` of `hold` or `refuse` in the
operator's settings, a burst past its rate limit, or the same words twice inside its repeat window, set them
aside where the engine cannot see, and the entry is written all the same: `said` means handed over.

**A `blocked` session is told, and may never read.** Measured on 2.1.270: a `--bg` session waiting on a
permission prompt queued the words and did not read them while it waited; stopped, it had not read them; and
continued as B8's Continue and `wf retry` continue one — a new session resuming its id — its conversation did not
have them. So words said to a session blocked on a prompt nobody answers are on the record for that attempt and
reached no model: say them again to the attempt that continues it, or carry them in its brief. A session the
harness itself holds up is another matter — one stalled on a login refresh (2026-09-13) moved on when a
cross-session message reached it — and `claude agents` does not say which wait a session is in, so neither is
refused (`docs/open-issues.md`, issue 16).

| harness | how | refused |
|---|---|---|
| `claude` | a line on the session's inbox socket | a task in `bypassPermissions` — Claude Code holds a message into such a session for a person to approve, and a background session nobody attached to holds it for ever; and words that make a line longer than the inbox reads (1,048,576 characters) |
| `codex` | — | always: `codex exec` reads its prompt once and takes nothing while it runs |
| `claude-detached` | — | always: its session's id is known only once `claude -p` exits |
| a `PromiseRunner` | its own `say`, when it has one | when it has none |

**Refused, with exit code 2**, nothing sent and nothing journalled, and the fix in the sentence: empty words; a
task the engine has no record of; a harness with no channel, in its own words; what the harness cannot carry; a
task that has settled, or has been asked to stop; one with no attempt in flight; and one whose attempt its
harness does not list running — `working` or `blocked`, since a session waiting on a person is running, and is told (above). Where
the fix is to continue a session that has ended, the sentence says so: a new task with `resumeFrom`, which is
what `wf retry --message` does. A registry that cannot be read, or words the harness did not take, reject
without an exit code: nothing was said, so ask again.

## What a read asks of the harness: `observe` and `find`

`observe` lists every session a harness has, and for Claude Code that is `claude agents --all --json`: about a third
of a second a call on the machine this was measured on (2.1.271, 231 rows). A pass needs it, since it decides for every
task at once. A person's read needs less, and used to pay the same: every `view` observed, so a board's open stream on a
running step made two such calls a second (its `view` and its `transcript`), and the api's list of runs one for every
step on every poll (plan §4 S2).

So a harness may also answer `find(name)`: the one session running under a name the engine chose, found without
observing every other — which session it is, and nothing of its state. Claude Code's runner reads it off the session's
registration, `~/.claude/sessions/<pid>.json`, which a running session writes for itself with its `pid`, `sessionId`,
`name` and `kind`: the file `say` finds an inbox through. Each read asks only what it needs:

| read | needs | Claude Code asks |
|---|---|---|
| `tick` | every session's state | `observe`, once a pass |
| `list()` | every task's phase | `observe`, once |
| `view(id)`, attempt in flight | its session's state — working, idle, blocked | `observe` |
| `view(id)`, any other task | its phase, and its session's id once an attempt has ended: both on the record | nothing; `find` for a session whose id the record lacks |
| `logs(id)` | the session's id | as `view(id)` |
| `transcript(id)`, attempt in flight | which session it is | `find`; `observe` when no registration names it |
| `transcript(id)`, attempt ended | the id on the record | nothing |
| `say(id)` | its state, and its process | `observe`, then the registration by the pid listed |

A view of a task with no attempt in flight carries no `usage`: an ended attempt's is on `state.attempts`. Measured on
a loop of twenty reads each against that machine's board (236 tasks), before and after:

| read | before | after |
|---|---|---|
| `view` of a settled task | 320 ms | 0.2 ms |
| `transcript` of a running task, read whole | 334 ms | 14 ms, most of it the transcript |
| `view` of a running task | 323 ms | about the same: it observes |
| `list()` | 339 ms | about the same: it observes |

So the open stream on a running step makes one `claude agents` call a second, not two, and a list of runs asks
`claude agents` only for the Claude Code steps still running. Every read asks the task's own harness and no other —
`view` as `transcript` and `logs` do — so a view of a `check` or a Codex task, whose harnesses cannot `find`, observes
that harness's run files and never runs `claude agents`. Until plan §6 item 27 such a view observed every harness, and
so cost a `claude agents` call and a Codex listing on every read, settled or not. `find` itself took about 2 ms to find
a session and 6 ms to find none among the 21 registrations there.

**A registration outlives its process** — 18 of those 21 had none — so one is taken only when it is a file this user
owns, named for the pid it holds, of a `bg` session (an interactive one is never the engine's); a process this user may
signal runs under that pid; and, where there is `/proc`, that process started when the registration says
(`procStart`), so a pid another process has taken since is not the session. Without `/proc` (macOS) that last check is
not made. A registration refused, or not there, refuses nothing: the read observes, as it did before.

**Where a registration and the registry disagree, every read that observes takes the registry's word** — a view's phase
and session, `say`, and the pass, which never uses `find`. `transcript` of an attempt in flight is the one read that
takes a registration's, and only for which session to read: every live registration on that machine named the session
`claude agents` listed for its pid, under the same name. A `PromiseRunner` without `find` is observed as it always was,
on its own and no other harness; a task whose harness the engine no longer has is viewed on the fallback, where its
`logs` are read (`test/find.test.ts`).

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
| usage | turns, tool calls and tokens from the transcript, once the session is idle; its cost once the engine lets it go, from the `cost-state` Claude Code writes as the process exits | from the SDK's result, cost included |
| narrow the tools | `tools` → `--tools`: a tool not in the list does not exist for the session; `disallowedTools` → `--disallowedTools` | not wired: it passes only `model` and `permissionMode` |
| a spend cap | refused: a `--bg` session keeps no `--max-budget-usd` (measured) — `claude-detached` keeps one | not wired |
| MCP servers | `--strict-mcp-config`: the checkout's `.mcp.json` and the task's `mcp`, never the operator's | not wired |
| the conversation as events | `transcript`, from the session's transcript | not wired: no `transcript` |
| one session by its name | `find`, from the session's registration | not wired: every read observes |
| telling a running session something | `say`, a line on the session's inbox socket | not wired: no `say` |
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
| `src/runner.ts` | the compute seam — `spawn`/`observe`/`stop`/`logs`, and the optional `find`, `release`, `transcript` and `say` — Claude Code's runner, words and usage, its registrations and inbox, and the one transcript reader |
| `src/runner-detached.ts` | a runner for any harness that runs a prompt and exits; the Codex and `claude -p` specs, and Codex's rollout read as a transcript |
| `src/runner-composite.ts` | dispatch by harness, merge what they all see |
| `src/runner-sdk.ts` | the same four verbs on the Agent SDK, with the tradeoff written down |
| `bin/ae.ts` | the `ae` entry point: a refusal prints its sentence and exits 2 |
| `bin/ae-worker.ts` | the detached worker: babysits one harness process, keeps the run file |
| `test/decide.test.ts` | every branch of the decision, no harness needed |
| `test/engine.test.ts` | the crash cases, the ceiling, what it counts and which waiting task a free slot goes to, the fields carried, against a fake harness |
| `test/completion.test.ts` | Claude Code's "done" and "quiet", its argv and its usage, with a fake `claude` on `PATH` |
| `test/unsigned.test.ts` | a session gone quiet without the closing statement its task asked for: unsigned, continued with a nudge, then failed saying why; quiet with none asked for still succeeds — a fake `claude` that keeps a registry, at shipped defaults |
| `test/shell.test.ts` | a session held busy by a background shell it left running: its own closeout as the last word in a cold transcript ends the attempt, an advancing one or no statement does not — a fake `claude` that keeps a registry, at shipped defaults |
| `test/resume.test.ts` | a resumed session read as its new attempt's, and a final read taken again once its transcript grows — a fake `claude` that keeps a registry, at shipped defaults |
| `test/detached.test.ts` | the worker, the lease, the composite, each spec's argv and refusals — `sh` as the harness |
| `test/mcp.test.ts` | what each harness is given for MCP, at shipped defaults — fake `claude` and `codex` on `PATH` |
| `test/facade.test.ts` | the Promise API, and every refusal at `file()` at shipped defaults |
| `test/release.test.ts` | letting a finished Claude Code session go, and reading what it cost once stopped, at shipped defaults — a fake `claude` that keeps a registry and writes a `cost-state` as it stops a session |
| `test/budget.test.ts` | a spend cap, at shipped defaults — fake `claude`s: a `claude -p` that stops at its cap ends its attempt `budget` and settles its task, with attempts left; the flag reaches both Claude runners on every attempt |
| `test/pool.test.ts` | pools by subscription, at shipped defaults — fake `claude` and `codex` whose sessions run until the test lets them go: a `claude-detached` session counted against `claude`'s ceiling, `codex` and a `check` each in their own |
| `test/journal.test.ts` | the store and the feed's cursor |
| `test/brief.test.ts` | the brief parser, made to refuse; `ae start` exits 2 |
| `test/usage.test.ts` | the transcript count and cost — a resumed session's own share, from its `cost-state` lines — and "not measured" rather than 0 |
| `test/transcript.test.ts` | a session's conversation as events, from a transcript file and a rollout the test writes: the cursor, words sent in, and each refusal at shipped defaults |
| `test/say.test.ts` | telling a running session something, at shipped defaults — a fake `claude` that keeps a registry, a real socket for the inbox: the words and the entry, every refusal, the inbox's guards, `ae say` |
| `test/find.test.ts` | finding one session by its name, at shipped defaults — a fake `claude` that counts its `agents` calls, and registration files: found, gone, not registered, and the registry's word taken where the two disagree; a view that asks its task's own harness and no other |
| `test/readme.test.ts` | this file, held to the code |
| `test/live.test.ts` | the `--tools` fence, the `--disallowedTools` deny (run from a checkout Claude Code trusts), `--strict-mcp-config`, what a released session still has, `say` into a working session, a session that ends its turn without its closing statement, a `claude -p` session stopped at its budget, a `--bg` session spending past one, its cost read once let go, and a session bridged by `remoteControl` beside one that is not, against real Claude Code — `AE_LIVE=1` only |
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
node bin/ae.ts show <id>         # the journal, then one line per attempt, with what it cost
node bin/ae.ts logs <id>         # the session's own output
node bin/ae.ts say <id> "…"      # tell its running session something; journalled
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
`AE_MAX_CONCURRENT` (default 3) is how many sessions may be at work at once in **each pool** — the
ceiling is per pool because your rate limits are, and a rate limit is a subscription's, however many harnesses
run on it. A harness declares the pool it is counted in — `pool` on a `HarnessSpec` or a `PromiseRunner` — and
is a pool of its own, under its own name, when it declares none. `claude` and `claude-detached` both run Claude
Code on one subscription, so the engine counts both in `claude`'s pool without being told: a ceiling of 2 is
two Claude Code sessions, not four. `codex` keeps its own, and so does a harness you add, such as
agent-workflows' `check`, unless it names another. Only a session at work is counted: a `blocked` one is
not. A session on a permission prompt makes no API calls, so it costs nothing against the rate limit the
ceiling exists for — reasoning, not a measurement. It is counted again on the pass after it moves again, so
blocked sessions that all move at once can put a board past its ceiling for a while; nothing is stopped for
that, and nothing more is admitted until the count is back under. Admission is serial within a pass, so the
count is true rather than approximately true. **Which waiting task a free slot goes to** is the order the pass walks
the board in: the highest `priority` first (a field on the task, 0 when absent — *Which waiting task starts first*,
above), then the oldest `filed` entry, and the ids' order only between two filed at the same instant. A retry keeps
its task's place, since its task was filed when it was. It used to be the ids' order alone, so which of two waiting
tasks started was the alphabet of their names. `decide` does not know there is an order: it is handed one task and
two numbers.

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
management (the harness cuts worktrees; the engine only asks for one), no pull requests, no spend
ceilings across tasks (one attempt's own cap is a field on its task, `budgetUsd`), no approvals, no multi-machine anything. Each is a kind built **on** this one, the way
`tekton.dev` is built on `batch/v1`. None of them requires changing `decide`, which is the test of
whether this core is the right size.

## What is left

**Watch instead of poll.** `ae up` ticks on a timer. The harness's registry changing is the hint
that skips the wait; the tick stays as the fallback that makes missing one free. Worktrees and
sequencing, once listed here, are done — sequencing as `agent-workflows`, a consumer of this engine.
Everything else that is still wrong or only half-verified is in `docs/open-issues.md`.

Anything that makes `decide` longer than a screen is a second kind wearing a disguise.
