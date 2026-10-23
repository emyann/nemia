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
   are added behind it. Later, each in a package of its own, as a sandbox runtime keeps each sandbox class in its own binary
   behind one gRPC service.

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

**The pattern to follow for an adapter:** an A2A adapter for Claude Code the owner pointed to. An
`agent-executor.ts` bridges A2A to a `claude-runner.ts` pool; each session is one long-lived `claude` process speaking
`--input-format stream-json --output-format stream-json` (messages in on stdin, events out on stdout); A2A's `contextId` is a
Claude session; `--resume` recovers one after a restart. Three cautions: it targets A2A v0.3.0 (we target v1.0.0); it states no
licence, so we take its shape, not its code; and it holds each session in a child process, where our `claude --bg` driver
deliberately does not (a three-hour session is not a three-hour process of ours). Which of the two the Claude adapter uses is
that card's design question.

### Steps are jobs; the observer is the session

The owner's design (2026-09-23), after reading how A2A separates a task from the process that runs it: **a step runs as a job by
default** — `claude -p --output-format stream-json`, followed live, resumed with `--resume` for a round, a retry or a gate's
answer, with a real `--max-budget-usd` cap and exact cost. **A gate is `TASK_STATE_INPUT_REQUIRED`:** the run ends with its
closeout, the task stays open with no process, and the answer resumes the step's own session, so it keeps the context it built.
**Denials fail loud:** a tool a step is not allowed is recorded on the attempt and shown (`denied: Skill(look)`), and a step can
fail on one — the owner prefers `auto`, the harness's judgement given the right tools, to `dontAsk`'s silent denials. **`--bg` is
for the observer:** one long-lived session a person talks to, which watches the system, prepares each gate's decision, and answers
it — what the operator's session did all of 2026-09-22 and 23, and what `workflows/supervisor` drafts. It holds the context across
runs that a step's own session lacks, and can still ask a step to explain itself with one more `-p --resume`.

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
  function, where one change meant holding fifteen phases in mind at once.

### The lifecycle as a statechart, with XState

The owner's decision (2026-09-23): the loop keeps its job, and the machine it drives becomes explicit, as a statechart in
XState. Today the allowed moves live only in `decide`'s `if`s; a sandbox runtime we read has the same weakness (its states are drawn in a doc,
its edges checked in separate steps). With the policy moved out (§2), the lifecycle is small, and its states are A2A's, so an
A2A driver maps onto it with no second vocabulary. The sketch drawn here on 2026-09-23 is gone: the machine the runtime
runs is drawn from its code, in `packages/agent-runtime/README.md` (*The lifecycle: a statechart used as a function*),
generated by `diagram()` in `src/lifecycle.ts` and held to it by a test (stage 5, below).

`decide` splits in two, and stays level-triggered:
1. **Observe** — from the journal and what the driver reports, work out the event: spawned, done, failed, needs a person, stop
   asked, deadline passed, found by name after a crash. Recomputed from the whole state on every pass, never remembered.
2. **Transition** — hand that event to the XState machine: it gives the next state and the one action, or refuses an event
   with no edge from the current state (as that sandbox runtime refuses a suspension whose prerequisite is not met).

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

1. **A2A is the driver interface**, in three parts: the harness arguments into one opaque `config`; the A2A seam over
   in-process agents; the remaining calls (logs, transcript, `say`, release) through the client. The runtime's driver contract becomes an A2A client (`@a2a-js/sdk`, spec v1.0.0) over
   in-process A2A agents; today's drivers are wrapped as adapters unchanged in behaviour; harness arguments become each
   adapter's configuration; `decide` and `engine.ts` read none of them. The journal stays the record.
   Planned 2026-09-23 as three parts, each ending green, and the owner approved the first alone, the others filed as cards of
   their own: **(1) the configuration becomes the adapter's** — the ten harness arguments are one `config: HarnessArgs` on
   the task, the filed event, the state and the spawn; their refusals are the adapter's (`argsRefusalOf`, asked through
   `Runner.layer`) in the same words; a journal written before is read in today's shape (`upgrade` in `Journal.layer`) and
   never rewritten; `test/core-reads.test.ts` refuses a read of one in `domain.ts` or `engine.ts`. Done, on the same day.
   **(2) the A2A seam** — `@a2a-js/sdk` in process, the drivers as adapters behind it, `config` in a message's metadata.
   Done, on the same day: `@a2a-js/sdk` pinned at 1.2.0; each harness an `A2ARequestHandler` of its own
   (`src/a2a-handler.ts`) reached through the SDK's `Client` over an in-process transport (`src/a2a-client.ts`) — a spawn
   is a user message, an observe a listing, a stop a cancel — with the mappings pure in `src/a2a-map.ts`; `engine.ts`,
   `domain.ts` and the journal's words unchanged (`test/journal-words.test.ts`, written first). Not the SDK's
   `DefaultRequestHandler`: it runs an executor against a `TaskStore` it writes, a second record beside the journal. This
   handler holds nothing — every answer is read off the harness and the journal — so a restarted runtime answers for a
   session it never started before its first tick (`test/restart.test.ts`). Only `src/a2a-*.ts` import the SDK
   (`test/a2a-boundary.test.ts`). The Effect door takes the seam through `a2aRunner`, beside `Runner` as `sdkRunner` is.
   **(3) the rest of the calls through the client.** Done, on the same day: `say` is A2A's follow-up, a message on the
   session's Task; `find`, `logs` and `release`, which A2A has no call for, are the runtime extension's methods
   (`urn:agent-runtime:session:v1`), which the harness's card lists as its driver answers them, and a spawn carries the
   same extension as its mark, since a plain message naming a Task continues it. `refuses` stays direct by design: it
   judges a task before any session exists. `test/driver-calls.test.ts` refuses any other driver call made with no A2A
   call in flight (open issue 27). **(4) the transcript through the seam.** Carded as `SubscribeToTask`, and done, on the
   same day, as the extension's `sessionTranscript` instead, by the session's name, with the plan's challenge approved at its
   gate: a transcript is a history read from a cursor, mostly of a session that has ended, and A2A 1.0 refuses a
   subscription to a Task in a terminal state and opens every one with the Task, a listing here. The agent finds the
   session's id as the facade did and holds nothing between calls; `refuses` is the one verb left direct.
   `SubscribeToTask` waits for a consumer of a live stream (stage 2, or the board following a session as it speaks).
2. **The Claude Code adapter runs a step as a job:** `-p` by default, a gate as `TASK_STATE_INPUT_REQUIRED`, denials loud, `auto`
   by default, `--bg` kept for the observer. Also: the stream, `TASK_STATE_INPUT_REQUIRED` for a blocked session, the closeout as an
   `Artifact`, `contextId` as the session; `--bg` or a long-lived `stream-json` process (the pattern of an A2A adapter that keeps one Claude Code process per session) — the owner's
   call at the gate.
   Planned 2026-09-23 and split by the owner at its gate into five parts, each a card of its own: **(1) the runtime's
   Claude Code adapter** — `claude` runs a task as a job, `claude -p --output-format stream-json --verbose
   --permission-prompts none` in the detached worker, and as `claude --bg` only when the task says `config.background:
   true`, a harness argument like the others; one harness, two modes, each verb routed by the session id's shape
   (`src/runner-claude-code.ts`), so a `--bg` session journalled on `claude` before is still observed, stopped, settled and said to.
   `say` and `remoteControl` on a job are refused in words that name `background: true`, a budget beside it is refused as
   `--bg` keeps none, and `background` on any other harness is refused. What a job was denied is on its attempt
   (`denials`) and on `ae show`, and `decide` never reads it. The orchestrator stayed on `claude-bg` until part 2. Done, on
   the same day, measured first on Claude Code 2.1.280 (M1 to M7, `packages/agent-runtime/docs/open-issues.md` issue 28).
   **(2) steps become jobs**, with the orchestrator's `claude` mapped to the adapter. **(3) denials on every surface** — a
   `denied:` line on `wf decide`, `wf ls`, the api and the board — and a `denials: fail` step key. **(4) a gate or a blocked
   sign-off as `TASK_STATE_INPUT_REQUIRED` on one task**, the runtime holding it open; R1, a card of its own. **(5) the A2A
   stream**, the closeout and collected files as `Artifact`s, and `contextId` as the session.

   **A correction to the design above: permission modes follow roles, not `auto` by default.** The planner, the reviewer
   and the observer run in `dontAsk` with an allow list; implement and ship run in `auto`; denials are recorded everywhere.
   Part 1 measured why a role's mode must be named rather than left to a default: `-p` waits on nobody in any mode — a call
   that would ask is denied and the session carries on — and `auto` on haiku ran as `default`, where sonnet kept `auto`.

   **`wf say` to a job (M6).** A `claude -p --input-format stream-json` process given a second user message on its stdin
   while a turn ran took it into that turn, before its one result. So part 2 can keep a job's stdin open and hand it a
   person's words — the long-lived `stream-json` process above — rather than stop the job and resume it with the words,
   which M4 showed also works (SIGTERM or SIGINT, then `-p --resume`, the session intact). Done as part 2a, the same day:
   the worker writes the brief and each word said on the job's stdin, through an inbox only the facade writes, and ends
   its stdin at the job's first result; measured first that `--json-schema`, `--max-budget-usd` and a denial are as under
   a prompt (M8 to M10, 2.1.280), and a word is written on at most once (`packages/agent-runtime/docs/open-issues.md`
   issue 29).

   **Part 2 done, the same day: steps are jobs.** Measured first, as asked at its gate, that a job in `dontAsk` honours the
   checkout's `.claude/settings.json` allow rules as a `--bg` session does (M11, 2.1.280): an allowed command ran, an unlisted
   one was denied and the job's attempt recorded it. Then the orchestrator's `claude` became the runtime's `claude`, and every
   step a job; `background: true`, a step key, files a session as `--bg`, and the shipped supervisor is the one that says it
   (`remote:` needs it). Modes by role, written in the agents: planner and reviewers `dontAsk` on the settings' list,
   implementers and shipper `auto`, the supervisor `dontAsk` with an `allow:` of its own. `validateFolderMode` judges a
   background step alone, since a job asks nobody. **How resume cost is counted:** `budget:` is handed to a job as
   `--max-budget-usd`, what is left of the cap on each filing; a gate's answer, a round or a retry is a new task with
   `resumeFrom`, run as `claude -p --resume`, whose cap caps its own spend (M5) and whose printed cost carries its parent's
   on (M2), which the runtime takes off — so each attempt costs what it spent and the step's tries add up once. A resume of
   a session that was no job of the runtime's (a `--bg` try from before the switch) records no cost (M3, issue 4). Denials
   are recorded on every job's attempt; a background session's are not read, and no surface of the orchestrator says them
   yet — part 3.

   **Part 3a done, the same day: a denial is said everywhere a step is.** What the harness denied a step's current try —
   every attempt of its task, each call once, in the runtime's words (`denialText`, `Skill(look)`) — is a `denied: …` note
   on `wf ls`, beside the status and never in it, a line under the step on `wf decide`, a `denied` field (`{ words, calls }`)
   on the api's steps, a count on the step's node on the board (`denied 2 calls`, the calls on hover: the node's line is
   thirty characters) and a `denied` row on the step's section. The words are made one line and clipped to five calls
   (`deniedWords`), one writer for every surface. Nothing is decided on them: `denials: fail`, a step key that fails a step
   on a denial, is a card of its own.

   **Part 3b done, the same day: a step can be stopped on a denial.** A step that says `denials: fail` is not passed on
   when its signed try was denied a call: it reads `denied`, a status of its own, which stops its followers, runs no check,
   spends no `retries:` and waits on a person. The run's `allow:` is frozen at `wf start`, so a try is denied the same again,
   and the offer says both ways out: the rule for the folder's `allow:` in a new run (`Edit(<path>)` for any file write,
   `Bash(<command>:*)`), and `wf retry <run> <step> --fresh`, whose brief names what was denied. Refused on codex and beside
   `background: true`, where no denial is read. The orchestrator's policy alone: the runtime's `decide` never reads denials.
   Widening `allow:` on a live run is left for later.

   **Part 4a done, the same day: the runtime holds a task open (R1).** A task filed `holdOpen: true` does not settle when an
   attempt signs: `view` says `input-required` — A2A's `TASK_STATE_INPUT_REQUIRED` — and nothing runs, the signed session
   let go as any ended attempt's is. `answer` journals an `input`, and the next pass starts the task's next turn, an attempt
   that `--resume`s the session that signed, told the words in place of the brief; `close` journals `closed`, and the next
   pass settles it `succeeded`. Two events and one optional key on `filed`; `decide` reads a turn — the inputs journalled
   before an attempt's `starting` — and counts `maxAttempts`, the deadline and the budget per turn, so a task may wait on a
   person as long as they take. A journal written before any of this folds to turn 0 and decides as it did. The journal
   held up as the record of an open task: nothing was needed beyond an append, since the wait is read, not remembered. Where
   it bends: no lock serialises two writers of one journal, so two answers before a turn starts are both told to it, in
   order. Measured live on a Claude Code job (M12, 2.1.281, issue 28): it waited with no process, the answer's turn
   remembered what only the signed session was told, under the answer's own `--max-budget-usd`, and a close settled it.
   The A2A seam is unchanged: an attempt is still a Task of its own. **What waits on the owner's reading:** the
   orchestrator filing a gate or a blocked sign-off as a held task and answering it (4b) — `wf ls`, the api and the board
   learn `input-required` beside `needs-human`, never in it — and a step's tries and rounds as attempts of one task (4c, or
   folded into part 5). That 4c is not stage 4c below, which is admission. Since 2026-09-28 it is called *tries as attempts*,
   and it is still open; 4b shipped on 2026-09-24.

   **Part 4b done, 2026-09-24: a gate and a blocked sign-off are the step's held task.** A Claude Code job is filed
   `holdOpen`; the run closes it once nothing waits on a person's word, and a person's answer to a blocked sign-off, or a
   send-back from a gate, is `answer` on it: the next turn, in the session that signed, under the same id. Rounds and every
   other try stay `-try<n>` tasks. `wf ls` reads `input-required` as a signed session, beside the run's word
   (`input-required · BLOCKED`), never in `needs-human`; the board draws it as one. Turns are derived — the record's tries on
   the current task id against the runtime's answers — so no field was added (agent-orchestrator's features.md).

   **Part 5a done, the same day: a Task in A2A's shape.** A Task's `contextId` is the harness's id for the conversation —
   the sighting's or the attempt's `nativeId`, empty until one is seen — so attempts that continued one conversation list
   under one context, and a spawn sends the session it continues as its message's `contextId` rather than `resumeFrom` in
   metadata; a follow-up in another context is refused. The closeout is the Task's one Artifact, `closeout` (a `data` part,
   `text/plain` for prose), carried by a listing only when `includeArtifacts` asks. `getTask` says `INPUT_REQUIRED` of the
   signed attempt of a task held open — reading the journal for a session its harness lists `done`, since a job is never
   let go — while a listing keeps the harness's `COMPLETED`, which `observe` reads. `engine.ts`, `domain.ts`, the facade
   and the journal's words unchanged. **Deferred by the owner at the gate:** the stream — `SubscribeToTask` has no live
   consumer yet, the api polling the facade, and would pay a transcript read per event (open issue 27); the collected
   files as Artifacts, which are the orchestrator's Task's, stage 6; and one A2A Task per runtime task rather than per
   attempt.
3. **The Codex adapter.** **Done, 2026-09-23.** Part 5a had already built the Codex Task in stage 2's shape, since the
   seam is one handler over every driver, so the card proved that shape on Codex rather than building a second one:
   `packages/agent-runtime/test/codex-agent.test.ts` drives the real detached worker through the SDK's client with a fake
   `codex` — the thread id as `contextId` (empty until `thread.started`), the `-o` file as the `closeout` Artifact (a `data`
   part, `text/plain` for prose), a `cancelTask` that ends the harness and what it started, and a held task's answered turn
   running `codex exec … resume <thread>` in the same context. Measured live (M13, codex-cli 0.154.0, open issue 31): a
   resumed thread keeps its id and its rollout, and remembered what only the signed thread was told. What Codex cannot do is
   said rather than faked: no words while it runs (its card says `say: false`, and an A2A follow-up is refused naming a
   spawn in the session's context, once it has ended, as the way on — the only handler change; `wf` and the board keep
   their words), never
   `INPUT_REQUIRED` mid-run, only between a held task's turns, and no spend cap. Found on the way, and fixed in review: a
   cancel landing before the worker had written its pid was answered `CANCELED` and sent nothing, harmless under the
   engine's re-issuing tick and false to a direct A2A caller; the stop is now left on disk for the worker, which starts no
   harness (open issue 30). **The `claude -p` driver stays with stage 2**, unchanged: it shares
   the worker, but its Task shape, its stdin (issue 29) and M12 were stage 2's, and nothing in it moved. **Still deferred**,
   as the owner decided at stage 2's gate: the stream (`SubscribeToTask`).
4. **Policy up, in three cards:** retries, the signed statement and its nudge; budgets; pools and priority.
   **Stage 4a, part 1 done, 2026-09-23: the signed statement is the orchestrator's word.** The runtime reports a fact and
   judges nothing about it: an attempt of a task that asked for a closing statement records `stated: true | false` on its
   `ended` event, and a quiet session that gave none ends `done`, `stated: false`, and settles `succeeded` under every
   resume policy. `NUDGE` is gone, a resume carries the caller's words alone (`turn.words`), and `ae` prints
   `done (no statement)`. The orchestrator reads the fact: `closeoutAsked` and `endWords` (`agent-orchestrator/src/views/`)
   read an end without its statement as `unsigned`, the words `wf` and the board have always said, `retriesDue` files its
   one sign-off nudge (`SIGNOFF`) per step per round as before, and the api's attempt lines go through `endWords`. A journal
   written before keeps its words: an end recorded `reason: 'unsigned'` settles `failed` with its old note, attempts left or
   not, and is read `unsigned` above; an end with no `stated` key is never read as unsigned. **Part 2 is the rest:** retiring
   the runtime's `maxAttempts:` and `resume:`, so a retry is the orchestrator's filing alone.
   **Stage 4a, part 2 done, 2026-09-23: one attempt per start.** `decide` starts one attempt at a task, and any end but
   `done` settles it `failed` — a held-open task's turn included — noting the attempts; nothing is tried again inside a
   task. `file()` and `ae start` refuse `maxAttempts` and `resume` at any value, the sentence naming `resumeFrom`, `retries:`
   and `wf retry`; a journal filed with them still folds. The orchestrator files neither, refuses the `maxAttempts:` step key
   in a step or an agent (the run's own `resume:`, which continues another step's session, stays), and still loads a run
   frozen with it; the board's *max attempts* row is gone. Open issue 5's case — continue what an `unstartable` attempt was
   filed to continue — is the orchestrator's `continuesFrom` now, and so is an attempt its harness lost or never named: each
   continues the session it was started to continue. Held-open steps (stage 2 part 4b) landed first, and part 2 was merged
   over them: an answer's turn that fails, is lost or cannot start settles its task `failed` (the runtime's
   `HELD OPEN: a turn is one attempt` in `decide.test.ts`), the step reads `failed`, nothing is tried inside the task, and a
   `wf retry --message` is a `-tryN` task of its own, held open itself — never an answer to the settled task — continuing
   the failed session, or for a lost or unstartable turn the session that signed the turn before (`an answer's turn that
   FAILED` / `was LOST` / `COULD NOT START` in `agent-orchestrator/test/held.test.ts`). `retries:` still spends nothing on
   such an end.
   **Stage 4b done, 2026-09-25: budgets are the orchestrator's.** The runtime measures a session's spend and reports it, and
   knows no budget: `budgetUsd` is a harness argument under `config`, handed to a harness that keeps a cap as its own flag
   (`claude -p --max-budget-usd`) and refused by the harness that keeps none (`claude --bg`, `codex`), in the same words as
   before. A cut its harness reports is carried on the attempt as `limit: 'budget'` — on the `Sighting`, the `ended` event
   and the `Attempt` — beside an end that is the harness's own (`failed`, reason `harness`), and changes no decision: the
   task settles as any failed end does, noting `1 attempt(s), none succeeded`. `domain.ts` and `engine.ts` name no budget
   (`test/core-reads.test.ts`). An answer's turn gives its cap as `answer(id, text, { config: { budgetUsd } })`, laid over
   the filing's by `configForTurn` and refused for any other key (`TURN_ARGS`); a top-level `budgetUsd` is refused naming
   `config`, at `file` and at `answer`. A journal written before is read in today's shape by `upgrade`, rewriting nothing: a
   filing's and an answer's cap under `config`, and an end `budget` as `harness` with `limit: 'budget'`. The orchestrator
   files the cap under `config`, reads the limit (`taskSpend`), reads a step so cut as `budget exhausted` whether its harness
   called the end failed or done (`ownStatus`), and `endWords` gives the board `failed · budget` as before — the words `wf
   ls`, `wf decide` and the board say about a budget did not change (the api's `app.test.ts` reads both journal shapes).
   What stays out of reach: no harness reports a running session's spend, so the orchestrator judges a budget only once an
   attempt has ended; the live bound is still the harness's own cap (open issue 17).
   **Stage 4c, part 1 done, 2026-09-25: the orchestrator admits.** A task filed `queued: true` starts only once the layer above
   `admit`s it, on the runtime's next pass; `tick()` reports every unsettled task's view (`TickReport.views`, `viewOfState`) and
   `admit` journals the word without observing a harness; a filing with no key, from before, reads as queued, and `ae admit` gives the
   word by hand. The orchestrator files every task `queued` on an engine with no ceiling, and admits per pool under `WF_MAX_CONCURRENT`,
   by momentum (read off the run records, `momentumOf`), filing time and id, off the report's views (`toAdmit` in
   `agent-orchestrator/src/admission.ts`), so a pass makes one `claude agents` call for admission (`pool.test.ts` counts it). A start
   comes one pass (about 4 s) later than when the runtime admitted and started in one. A daemon restarted onto an old store starts
   nothing it has not admitted, counts the sessions at work first, and admits in the old order per pool (`restart.test.ts`); an old
   engine reads the new store as before. **Part 2 retires** the runtime's ceiling (`maxConcurrent`, `decide`'s branch, `Now.used/max`),
   its pools (`poolsOf`, `pool?`, `CLAUDE_POOL`), `priority`, `AE_MAX_CONCURRENT`, `DEFAULT_MAX_CONCURRENT` and `admissionOrder`, each
   refused with a test, and the client's `maxConcurrent: Infinity`.
   **Stage 4c, part 2 done, 2026-09-25: the runtime keeps no ceiling.** `decide` has no ceiling branch, and `Now` is the time and
   the grace. A pass walks the board in the store's order, starts every task not queued, and reports `running` per harness: a
   session counts while its attempt is open and it is `working` or not yet seen. `DEFAULT_MAX_CONCURRENT`, `poolsOf`, `pool?`,
   `CLAUDE_POOL`, `State.priority` and the runtime's `admissionOrder` are gone. Each retired input is refused by name, exit 2,
   each with a test shown to fail without its refusal: `priority` at any value (both doors), `maxConcurrent` on `createEngine`,
   a harness naming a `pool`, any argument to `tick()` (both doors; the Effect door fails `TickRefused`), the old `slots` handed to `step` or `settleTask`
   (`StepRefused`, found in review), and `AE_MAX_CONCURRENT`
   in `ae`, empty too. Each says what to do instead: file `queued: true` and `admit`, which `ae start` can now do (`queued:` is a
   brief key). The client builds its engine with no ceiling. The pass's meter (`TickReport.ms`, `observed`) is unchanged.
   *On a restart.* A `wf up` started before this keeps its old engine until it is restarted. Restarted, it builds none of the
   ceiling, folds an old filing's `priority` unread, and admits by momentum off the run records, as part 1 did. An `ae` from
   before applies its own ceiling to the tasks filed without `queued`. One from after starts them all and refuses to run with
   `AE_MAX_CONCURRENT` set. A tree only half merged fails where the engine is built, exit 2: a client that still passes
   `maxConcurrent`, or a harness that still names a `pool`. It does not run with a ceiling nobody keeps.
5. **The lifecycle as an XState statechart on `TaskState`.** **Done, 2026-09-25.** `decide` is observe → transition:
   `lifecycleOf` reads a state off the journal alone — A2A's `submitted`, `working`, `input-required`, `completed`, `failed`
   and `canceled`, and the runtime's `starting` (the crash window, where a session found under the intent's name is
   adopted), `stopping` (a person's stop) and `ending` (the turn's end is on the record, and the task settles on it);
   `observe` reads one event off the journal and the pass's sightings; and `src/lifecycle.ts`, XState 5.33.2's pure
   `transition`, never an actor, gives the edge's one action or refuses. A2A's `rejected` is an attempt's `unstartable`
   end, `auth-required` is reported by no harness, and a session blocked on a person is a self-edge of `working`, since
   the journal cannot tell it from working. The journal stays the state and a pass carries nothing. A settled task is
   decided nothing before it is observed (`settledQuiet`), so the store's settled tasks cost the machine nothing.
   `decide.test.ts` passed unchanged. `lifecycle.test.ts` runs a corpus of over a thousand journals, deadlines, sightings
   and times and holds that every move is an edge landing where the journal it writes then says, that every edge is taken,
   and that an event with no edge is refused, at shipped defaults and with an edge planted away. **A refused edge stalls a
   task out loud** (the owner's addition at the gate): the pass reports each refusal (`TickReport.refused`: task, state,
   event), `ae tick` prints them, and `wf up` logs each once while it lasts and again if it clears and comes back. Only
   `src/lifecycle.ts` imports XState, in any workspace, and neither entry exports it or the machine
   (`test/xstate-boundary.test.ts`). Where it departs from the design above: a person's verbs — stop, answer, close — are
   not edges but journal entries the next pass reads, so `stopping` is entered by no edge; there is no `resume(input)` out
   of a final state, since an answer is a new turn of a held-open task (`input-required` → `submitted`), and a settled task
   is never resumed; and a deadline that passes on a live session stops it and then ends the attempt `deadline`, where the
   sketch went through `stopping`, which is kept for a person's word.
6. **Remote A2A agents by URL** (and their Agent Card); later, the adapters mounted over HTTP.
   **Part 1 done, 2026-09-25: the runtime reaches a remote agent** (`src/a2a-remote.ts`). A harness is configured as
   `{ url }` or `{ card }`, and a task picks it by name. The verbs are A2A's own over the SDK's client: SendMessage,
   GetTask for each open session, CancelTask. The binding is the card's first that the runtime speaks, JSON-RPC or REST.
   Auth follows the card, with each secret asked of the engine's `credentials` on every request and never written down.
   A registry under `<root>/remote/` holds the intent before the send and the Task on its answer, so a restart never
   sends twice. Each refusal is made at shipped defaults against the SDK's own server over HTTP. The pass is metered: one
   GetTask per open session, and none once settled. The runtime README's *A remote A2A agent as a harness* describes it,
   and open issue 34 records the crash window between the answer and the registry.

   Where it departs from the plan:
   - `say` reaches a Task that asks for input rather than being refused outright, since `answer` refuses an attempt in
     flight and nothing else could continue it.
   - A card that cannot be read, or offers no spoken binding, is `unstartable` rather than `lost`, since nothing was
     sent.
   - `release` moves a settled session's entry aside, which is what makes a settled task cost a pass nothing.
   - JSON-RPC is served in the test through the SDK's express handler, beside REST's.
   - Found in review, round 2: an agent given by its URL has its card read beneath that URL's path, and requests go only
     to an interface on that URL's origin; a redirect is never followed; and every request, the card's included, is
     given up after `REQUEST_MS` (10 s), so an agent that holds a request no longer holds the runtime's pass.
   - Found in review, round 3: the send keeps that bound, since a spawn runs inside the pass, so an agent that works
     before it answers (a reply in a Message after thirty seconds) is read in doubt on every try, and each try is `lost`
     with the work done. The in-doubt words name the bound, the README says an agent must answer a send within it, and
     open issue 34 counts this beside the crash; a test at shipped defaults shows it happen.

   The rest is filed as three parts (as of 2026-10-07, parts 2 and 4 are done and part 3 remains):
   - **Part 2: a workflow step names a remote agent through its `harness:` key.** The orchestrator's `runtime-client.ts`
     builds the entries and supplies `credentials` from the environment, and `harnessOf` and `KEY_HELP` accept them. The
     api's builder and listing and the board's harness picker learn the new values. The part also decides how a remote
     step signs off, since a remote agent may ignore the schema: until then such a task ends `stated: false`, read as
     unsigned. The question for its plan gate: is the URL written in the key, or declared once under a name?
     **Done, 2026-09-25 (`d180792`; noted 2026-09-28).** The gate's question was answered by declaring each agent once under a
     name: `a2a-agents.json` in the store maps a name to `{ url }` or `{ card }`, and a step says `harness: a2a:<name>`. Secrets
     come from `WF_A2A_<NAME>_<SCHEME>` on every request. A remote step is filed with no `config` (`localFields`), a question is
     answered with `wf say`, and the builder offers each declared agent as a harness. agent-orchestrator's features.md, *Shipped:
     a step on a remote A2A agent*, says what it left: a remote step's transcript, and `output:` on a remote step. Part 3
     remains.
   - **Part 3: the gRPC binding.** `@grpc/grpc-js`, `@bufbuild/protobuf`, and the SDK's `client/grpc` and `server/grpc`.
   - **Part 4: streaming and subscribe.** SendStreamingMessage and SubscribeToTask, relayed to the transcript and the feed,
     and a restarted runtime resubscribing. It also carries what stage 2 part 5a deferred: the collected files as
     Artifacts, and one A2A Task per runtime task.
     **Streaming and subscribe done, 2026-10-07 (`b342b3da0`, `0c479816f`).** The runtime's A2A agent answers SubscribeToTask
     for a `claude -p` task, reading the worker's run file into stream events, and the api relays one subscription per live
     session to every follower of the step's transcript, down to the board. A remote agent whose card says `streaming: true` is
     followed through its own Task's stream, resubscribed from where it was when it drops; one that does not stream keeps the
     1 s re-read. SendStreamingMessage stays refused. What the part carried from 5a did not come with it: the runtime README's
     *Streaming is done* and its *Not done* say what is served and what is not. Of stage 6's parts, the gRPC binding (part 3)
     is the one still open.
