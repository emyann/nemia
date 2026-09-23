# Evaluation: a thin runtime

Written 2026-09-23, on the owner's question: *the runtime should be a thin wrapper around a harness or an agent — start a
session, stop it, cancel it, resume it, attach to it and stream what it says — like `docker run` for a container. Everything
else is an argument to the harness or the agent. Why does it hold so much more?* Measured on main at `89dbc95`, just after
the packages were renamed on 2026-09-23 (`agent-engine` → `agent-runtime`, `agent-workflows` → `agent-orchestrator`).

**The answer in one paragraph.** The runtime is 4,928 lines. About 1,300 of them are the core the owner describes: a session
record with a lifecycle, a durable journal, a feed of events, and the verbs to start, stop, inspect, follow, attach and resume.
About 2,300 are drivers — Claude Code, Codex, a detached worker, the SDK — which are needed, but are plug-ins, not the runtime.
The rest is two kinds of thing that grew into the core and should leave it: **orchestration policy** (retries, judging whether
the agent signed its result, nudging it, budgets, concurrency and priority), and **harness arguments the core knows by name**
(model, permission mode, effort, tools, MCP servers, context size, remote control, worktree). The first goes up to the
orchestrator; the second becomes opaque arguments each driver owns. What remains is a small state machine over one driver
interface, shaped like A2A.

---

## 1. What the runtime holds today

| File(s) | Lines | What it is |
|---|---|---|
| `domain.ts` | 617 | the vocabulary, `fold`, and `decide` — the lifecycle, and the policy that grew into it |
| `engine.ts` | 475 | applies one decision per task per pass: file, tick, view, stop |
| `facade.ts` | 640 | the Promise API, `TaskSpec`, and the refusals of its fields |
| `journal.ts` | 158 | append-only task files and the feed |
| `cli.ts`, `bin/` | 495 | `ae`, and the detached worker |
| `runner.ts` | 666 | the driver contract (`RunnerOps`) and the `claude --bg` driver |
| `runner-claude-*.ts`, `runner-transcript.ts`, `runner-mcp.ts` | 843 | Claude's transcript, vocabulary, inbox (`say`), MCP; a shared transcript cursor |
| `runner-codex*.ts`, `runner-detached*.ts`, `runner-claude-detached.ts` | 794 | Codex and `claude -p`, run detached by a worker |
| `runner-sdk.ts`, `runner-composite.ts` | 188 | the Agent SDK in-process; one driver per harness name |

### Where the policy and the harness arguments live — counted

Mentions of each concept in the pure core (`domain.ts`), the applier (`engine.ts`), the API (`facade.ts`) and the drivers
(`runner*.ts`), on 2026-09-23:

| Concept | domain | engine | facade | drivers | Belongs |
|---|---|---|---|---|---|
| `unsigned` (no closing statement) | 17 | 0 | 0 | 0 | orchestrator |
| `nudge` (ask again for it) | 10 | 3 | 0 | 1 | orchestrator |
| `closeout` (the statement's schema) | 12 | 7 | 2 | 41 | orchestrator judges; driver carries |
| `budget` | 18 | 5 | 5 | 17 | orchestrator (a driver may enforce a hard cap) |
| `maxAttempts`, resume policy | 6 | 4 | 3 | 0 | orchestrator |
| `pool`, `priority` (admission) | 8 | 23 | 20 | 10 | a scheduler: the orchestrator |
| `deadline` | 15 | 7 | 2 | 3 | runtime (a stop, on a timer) |
| `resumeFrom` | 13 | 6 | 3 | 7 | runtime (resume is a verb) |
| `permissionMode`, `effort`, `tools`, `mcp`, `contextTokens`, `remoteControl` | 33 | 33 | 36 | 150 | the driver, as opaque arguments |

The last row is the clearest: arguments only a harness understands are read by the pure lifecycle function and by the
applier. In Docker's terms the core should carry *image and args* and never read the args.

## 2. The segmentation

1. **The core — keep.** A session: `start`, `stop` (and `cancel`: a stop the caller does not mean to resume), `resume`,
   `inspect`, `attach` (the stream of what it says, and `say` into it), and `follow` (the feed of lifecycle events). A
   durable journal, so a restarted runtime knows every session. A deadline, as a stop the runtime makes on a timer. And the
   lifecycle as a state machine (§4).
2. **Policy — up to the orchestrator.** Retries and how a retry continues; whether a session gave the statement it owed, and
   asking it once more; budgets; concurrency ceilings, pools and priority. These judge or schedule *work*; the runtime runs
   *sessions*. The orchestrator already decides everything else about a run, level-triggered, in `assess`.
3. **Harness arguments — opaque.** A session is started with a driver name, an input and an `args` object the driver
   validates and understands. The runtime stores it and hands it over. Each driver keeps its vocabulary and refusals (most of
   it already lives in `runner-claude-vocabulary.ts` and the Codex files).
4. **Drivers — plug-ins behind one interface.** Today's Claude Code and Codex drivers keep working behind it; new drivers
   are added behind it. Later, each in a package of its own, as Substrate keeps each sandbox class in its own binary behind one
   gRPC service.

## 3. One interface, shaped like A2A

The owner's choice (2026-09-23): **A2A first.** A2A (Agent2Agent) is a protocol between agents, now under open governance, and
the one the owner expects to be adopted broadly for agent communication. It already names what the core needs:

- **A task's states:** `submitted`, `working`, `input-required`, `completed`, `canceled`, `failed`, `rejected`,
  `auth-required`.
- **Its calls:** send a message (start, or continue), stream (Server-Sent Events), get, cancel, and resubscribe (reattach to
  a stream).

So the runtime's interface becomes A2A's shape, whatever the driver behind it:

```
start(driver, input, args) → session        stop(session) · cancel(session)
resume(session, input?)                     attach(session) → stream: messages, output, status
inspect(session) → state                    say(session, text)
```

**Drivers, in order:**
1. **The two there are**, behind the new interface: Claude Code `--bg`, and Codex / `claude -p` detached. Their harness
   arguments become their `args`.
2. **A2A**: any A2A agent, local or remote — an ADK agent, an agent hosted in a cloud provider's agent service, another team's
   agent. The runtime maps A2A's task states onto its own and relays the stream.
3. **Later, and only if wanted:** a plain process driver (any CLI, stdout and stderr streamed), and ACP. The owner's reading of
   ACP (the Agent Client Protocol) is that it standardises an editor talking to a coding agent — the local, IDE-side case — so
   it is not the first driver.

Later still, the runtime could *speak* A2A as well as call it: a hosted runtime would then be an A2A endpoint for its own
sessions (the pivot's P6).

### A2A is the interface, not only its shape

The owner's decision (2026-09-23, later the same day): adopt A2A itself as the way the runtime talks to every harness and agent,
and fill the gap for those that do not speak it. Grounded in two sources a session can read (planners and reviewers carry
`WebFetch`, and `.claude/settings.json` allows it):

- **The specification, v1.0.0** — <https://a2a-protocol.org/v1.0.0/specification/>. A `Task` has an `id`, a `contextId`, a
  `status` (`TaskState`: `TASK_STATE_SUBMITTED`, `_WORKING`, `_COMPLETED`, `_FAILED`, `_CANCELED`, `_REJECTED`,
  `_INPUT_REQUIRED`, `_AUTH_REQUIRED`), `artifacts` and `history`. A `Message` (role user or agent) carries `Parts` — `text`,
  `raw`, `url` or `data`. Operations: send a message, send a streaming message, get, list, cancel, subscribe to a task; push
  notifications; the Agent Card. Bindings: JSON-RPC, gRPC, HTTP+JSON. A follow-up message with the same `taskId` and
  `contextId` answers `TASK_STATE_INPUT_REQUIRED`.
- **The SDK, `@a2a-js/sdk`** — <https://github.com/a2aproject/a2a-js>, v1.0, implementing spec v1.0.0, Apache-2.0. Client:
  `ClientFactory` → `Client` with `sendMessage`, `sendMessageStream` (an async generator of task events), `getTask`,
  `cancelTask`. Server: an `AgentExecutor` publishing to an `ExecutionEventBus`, run by a `DefaultRequestHandler` — usable
  in-process, or mounted as JSON-RPC, REST or gRPC.

What we have maps onto it:

| Ours today | A2A v1.0.0 |
|---|---|
| a task, its attempts | `Task`, `TaskState` |
| `needs-human` / blocked | `TASK_STATE_INPUT_REQUIRED`, answered by a follow-up `Message` on the same `taskId` |
| resuming a session | a follow-up in the same `contextId` |
| the brief; `say` | a user `Message` and its `Parts` |
| the closeout (typed result) | an `Artifact` with a `data` Part |
| collected files | `Artifact`s with `url` or `raw` Parts |
| `transcript`, attach | `sendMessageStream` / subscribe: `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent` |
| stop | `cancelTask` |

**The runtime, then:** a durable journal and the lifecycle (XState, on `TaskState`), whose driver interface *is* an A2A client.
A remote A2A agent — an ADK agent, a cloud-hosted one — needs nothing but its URL. A harness that does not speak A2A gets an
**adapter**: an `AgentExecutor` wrapping it, run in-process with no HTTP. Claude Code and Codex become A2A agents that way; the
same adapters, mounted over HTTP later, make them A2A agents others can call (P6).

**The pattern to follow for an adapter:** <https://github.com/jcwatson11/claude-a2a> (the owner's pointer). An
`agent-executor.ts` bridges A2A to a `claude-runner.ts` pool; each session is one long-lived `claude` process speaking
`--input-format stream-json --output-format stream-json` (messages in on stdin, events out on stdout); A2A's `contextId` is a
Claude session; `--resume` recovers one after a restart. Three cautions: it targets A2A v0.3.0 (we target v1.0.0); it states no
licence, so we take its shape, not its code; and it holds each session in a child process, where our `claude --bg` driver
deliberately does not (a three-hour session is not a three-hour process of ours). Which of the two the Claude adapter uses is
that card's design question.

**The one thing to design in:** the SDK's server side is event-driven with an in-memory task store; the runtime is
level-triggered and survives restarts. So no adapter holds the truth in memory: the journal stays the record, each adapter
re-derives its task's state from the harness (`claude agents`, Codex's run files) and the journal, and the SDK's store is a view
over them.

## 4. Why `decide` stays — smaller

`decide(desired, observed) → one action` is the runtime's version of a Kubernetes controller's reconcile. The runtime README
says so: *"Kubernetes' control plane for the loop, durable execution's journal for the memory, and the local harness as the
kubelet."* It exists for three reasons, and all three survive a thin runtime:

- **A restart must not lose or repeat a session.** The runtime writes its intent (`starting`) to the journal *before* it asks a
  harness to start anything, under a name it chose (`ae/<task>/<attempt>`). If it dies between the two, the next pass finds the
  session by that name and adopts it instead of starting a second one. That is a state machine over the journal and what the
  harness reports, and it has to be decided the same way on every pass.
- **Level-triggered, not event-driven.** Each pass reads what was asked and what the harness says, and takes the one step that
  brings them together, carrying nothing between passes. An event missed while the runtime was down is not lost: the next
  pass sees the state it left. The orchestrator is built the same way.
- **Pure, so it is tested as data.** The judgement is one function over plain values, so every transition is a test without a
  harness. The reason is the project's own history: the board this replaced had its reconcile as one 1,390-line effectful
  function (`packages/agent-runtime/docs/hkb-migration.md`), where one change meant holding fifteen phases in mind at once.

### The lifecycle as a statechart, with XState

The owner's decision (2026-09-23): the loop keeps its job, and the machine it drives becomes explicit, as a statechart in
XState. Today the allowed moves live only in `decide`'s `if`s; Substrate has the same weakness (its states are drawn in a doc,
its edges checked in separate steps). With the policy moved out (§2), the lifecycle is small, and its states are A2A's, so an
A2A driver maps onto it with no second vocabulary:

```
                 file
   [submitted] ───────▶ [starting] ──spawn ok──▶ [working] ◀──input given──┐
                            │  ▲                    │   │                   │
          spawn refused     │  │ crash: adopt       │   └─needs a person──▶ [input-required]
                            ▼  │ by name            │
                        [failed]                    ├── harness says done ───▶ [completed]
                                                    ├── harness says failed ─▶ [failed]
   any live state ──stop / cancel──▶ [stopping] ────┴──────────────────────▶ [canceled]
   any live state ──deadline passed──▶ [stopping] ─────────────────────────▶ [failed: deadline]
   [completed | canceled | failed] ──resume(input)──▶ [starting]   (continues the same session)
```

`decide` splits in two, and stays level-triggered:
1. **Observe** — from the journal and what the driver reports, work out the event: spawned, done, failed, needs a person, stop
   asked, deadline passed, found by name after a crash. Recomputed from the whole state on every pass, never remembered.
2. **Transition** — hand that event to the XState machine: it gives the next state and the one action, or refuses an event
   with no edge from the current state (as Substrate refuses "MarkSuspending prerequisite not met").

What XState brings: the diagram is the code (its visualiser draws the machine the runtime runs, so the doc cannot drift), the
editor for changing it, guards and actions named on the edges, and a machine the board could draw per session. What to design
in: XState is used as a pure transition function (`machine.transition(state, event)` or its current equivalent — check the
version), never as a running interpreter holding state in the process, because the runtime carries nothing between passes; the
journal stays the state. Guards (deadline past, a session under this name) stay plain functions the machine names. A test holds
that every move the runtime makes is an edge of the machine, and that an event with no edge is refused. XState is a
dependency of the runtime alone; nothing above it sees the library.

What leaves `decide` is the policy (§2): who retries, whether the statement came, the nudge, budgets, admission. What stays is
the lifecycle — start, spawned, observed ended, stop asked, deadline, settle, adopt after a crash. With an A2A driver the remote
agent owns much of that state, and `decide` mostly maps it and still guards the one thing only the caller can: not starting the
same task twice.

## 5. Staged plan

Re-cut 2026-09-23 when A2A became the interface. Each stage its own card, chained, every plan read by the owner at its gate,
each ending green; the orchestrator's runtime client (`the-orchestrator-reaches-the-mlxm`) lands first, as the one place the
orchestrator's calls to the runtime change.

1. **A2A is the driver interface.** The runtime's driver contract becomes an A2A client (`@a2a-js/sdk`, spec v1.0.0) over
   in-process A2A agents; today's drivers are wrapped as adapters unchanged in behaviour; harness arguments become each
   adapter's configuration; `decide` and `engine.ts` read none of them. The journal stays the record.
2. **The Claude Code adapter, done properly:** the stream, `TASK_STATE_INPUT_REQUIRED` for a blocked session, the closeout as an
   `Artifact`, `contextId` as the session; `--bg` or a long-lived `stream-json` process (the claude-a2a pattern) — the owner's
   call at the gate.
3. **The Codex adapter.**
4. **Policy up, in three cards:** retries, the signed statement and its nudge; budgets; pools and priority.
5. **The lifecycle as an XState statechart on `TaskState`.**
6. **Remote A2A agents by URL** (and their Agent Card); later, the adapters mounted over HTTP.
