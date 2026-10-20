# Open issues: agent-runtime and agent-orchestrator

What is still wrong, what is only half-verified, and what is waiting on a decision — written down so
it can be picked up later without reconstructing it from commit history. The last section is a
record of what was fixed, with commits, so the open items have their context. A fixed item leaves
its number behind rather than renumbering the rest, so "bug 9" means the same thing everywhere.

State as of 2026-09-28: the list under *Bugs* holds only what is open, or open in part: an issue fixed with gaps left (33 to 35)
stays, with its gaps. Issues 19 to 22, 24, 25 and 30 are closed, and kept whole under *Closed since 2026-09-16, kept for their
context*, above *Fixed*. Since the paragraph below, the runtime has become thin: steps are jobs and the A2A seam carries every
call (issues 27 to 29, 31), the lifecycle is a statechart (stage 5), the pass skips a settled task until the feed names it
(issue 33), a remote A2A agent can run a step (stage 6 parts 1 and 2, issue 34), and a failed look at a harness is no
longer read as nothing seen, for the pass (issue 35). `docs/eval-thin-runtime.md` at the
repository's root tracks the stages.

State as of 2026-09-16: agent-runtime after the hold-the-bar engine work (repository
`docs/plan-hold-the-bar.md` §4 B and E4), bugs 3, 4, 7 and issue 10 (engine `7200295`), a
session's conversation read as events (§4 S1), and `say`, a person's words into a running session on the
record (§6 item 3, the engine half), `find`, one session by its name without `claude agents` (§6 item 17), and
bug 1, a quiet session with no closeout recorded a success (§6 item 18), and what a session cost, read from its harness,
with a spend cap on the task (engine `9d075f7`, `26020c1`), and three small items: a view that observes its task's own
harness (§6 item 27), a `blocked` session that holds no slot (issue 19), and pools by subscription (issue 20); and
admission in filing order (issue 21), a task's `priority` (issue 22) and `remoteControl` (issue 23); agent-orchestrator
`0e7b02a`. Since thin runtime stage 4c (2026-09-25), the orchestrator admits, and the runtime keeps no ceiling, pools or
`priority`: issues 19–21 are the orchestrator's, and 22 is retired. Since thin runtime stage 2 part 1 (2026-09-23), `claude` runs a step as a job, `claude -p`, and as `claude --bg`
only when its task asks with `config.background: true` (issue 28). Since stage 3 (the same day), Codex is proven as an A2A agent in the
same shape (issue 31). Since stage 4a part 2 (the same day), the runtime makes one attempt per start, and trying again is the
orchestrator's (*One attempt per start*, under Fixed).

## Bugs

### 36. The claude.ai bridge is an undeclared control request, and two things about it are unmeasured

**Where.** `src/harness/claude/attached-bridge.ts`, the one door; `src/harness/claude/attached-session.ts`, which opens the bridge
after the first turn of a request that asked for it.

**What is known.** `@anthropic-ai/claude-agent-sdk` 0.3.270 does not declare `enableRemoteControl` on its `Query` type, yet the object
`query()` answers carries it: `enableRemoteControl(enabled, name?, { reattachSessionId?, keepSessionOnExit?, workSecret? })`, which
sends a `remote_control` control request with `reattach_session_id` and `keep_session_on_exit` at its top level, answers the bridge's
facts (`session_url`, `connect_url`, `environment_id`, `bridge_epoch`, `bridge_session_id`), and drives `system`/`bridge_state`
messages (`ready`, then `connected`) onto the session's stream. Probed live on 2026-10-16 (SDK 0.3.270, Claude Code 2.1.301) by
design's step. Because it is undeclared, it is read off the object here and nowhere else, decoded by a schema of its own, and refused
in words on the run file where it is absent: the session runs on with no bridge (`src/harness/claude/attached-bridge.test.ts` makes each refusal).
An SDK update that renames or drops it breaks no session; it takes the bridge away, and the run file says so.

**Unmeasured.** (i) Whether a claude.ai session re-attaches as the same conversation on a phone after the daemon restarted and the
runtime passed the kept `bridgeSessionId` back as `reattachSessionId` — the stand-in answers the id it is given, so the request is
pinned, not the service's behaviour. (ii) Whether a question the session asks reaches the phone at all while `canUseTool` answers it
in-process: the two were never both live in one probe.

### 37. What an interrupt's receipt lists is unrecorded, and nothing of it reaches the person

**Where.** `src/service/interrupt.ts` (the engine verb), `src/harness/claude/attached-session.ts` (`interruptTurn`), and the
orchestrator's `chatStop`.

**What the slice measured.** `Query.interrupt()` resolves, the turn ends with a `result` of subtype `error_during_execution` that keeps
the partial text, and the session answers the next message pushed on its input under the same Claude Code session id — live on
2026-10-16 (design's probe), and again in `test/attached.boundary.test.ts`, where exactly one `interrupt` control request is sent
and the same session answers after it. **She spoke again**: nothing of the interrupt ends the conversation.

**What words pushed mid-turn do.** Measured live on 2026-10-16 (SDK 0.3.270, Claude Code 2.1.301, streaming input, each pushed message
stamped with a `uuid` of its own): words pushed while the model writes its final text run as a second turn (result #1, then
`system`/`status: requesting`, then result #2); words pushed while a tool call runs are folded into the turn in flight (the transcript
enqueues and removes a `queue-operation`, and the words arrive as a `queued_command` attachment after the next tool result), answered by
that turn's one result. `user_message_uuids` on the result is exact in both — case 2's one result listed both uuids — and
`queued_turn_count` is not: it was 0 on a result a second turn followed. So the run file is `idle` only once a result has named every
word pushed (`answered`, `attached-session.ts`), never once a count of them reaches zero, which case 2 would hold at `working` for good.
**Unmeasured**: whether the result of an interrupted turn names the words it was cut off from answering, and what a live
`still_queued` lists — a word named by neither would leave the session reading `working` until its next result.

**What is unrecorded.** The SDK's control response to `interrupt` carries a `still_queued` field — the stand-in answers `[]` — and no
probe recorded what a live Claude Code lists there, nor whether the partial text of the cut turn is listed back anywhere but the
`result`. The engine's verb reads none of it: it answers `{ at, attempt }`, and the board draws the person's own `Stopped` marker from
the orchestrator's `stops.jsonl` alone. Nothing is said to her about the stop (the person's answer at design: *board only, as
specified*). A follow-up card decides whether the receipt should be read, and whether she should be told.

### 38. A file time written through `utimes` and compared exactly is carried by the Node floor, not by the code

**Where.** `src/harness/detached/said.ts`: the capture cache writes a kept file's time with `fs.utimesSync(own, atimeMs / 1000,
mtimeMs / 1000)` (:143) and then compares what it reads back exactly — `parsed.mtimeMs !== key.mtimeMs` (:83), `mtimeMs !== key.mtimeMs`
(:141), `known.mtimeMs !== key.mtimeMs` (:257) — and `detached/compact.ts:83` carries `capture.key.mtimeMs` forward into a new key.
Beside them, `agent-orchestrator/src/record/files.store.ts:334` and `src/artifacts/artifacts.store.ts:240` write a time the same way,
and `core/engine/bodies.ts:82` writes `now`.

**What is wrong.** libuv 1.51.0 truncates a millisecond time set through `utimes`: 496 of 1,000 consecutive millisecond values read
back changed — `1767323045678` kept, `1767323045677.999` read. Every `!==` above then reads a cache it wrote itself as stale, and the
six runtime tests that failed in GitHub Actions run 39336719053 on Node 22.18.0 were that one bug: two in `test/said.test.ts` compared
the time directly, and the four in `test/shell.test.ts` and `test/unsigned.test.ts` never settled a quiet session, because the capture
the quiescence reads was discarded on every look. Measured on official binaries: 22.18.0 and 22.23.3 (libuv 1.51.0) change 496 of
1,000; 24.16.0 and 24.20.0 (libuv 1.52.1) change none.

**What was done, and what was not.** The repository's floor rose to Node 24.16.0, the first release carrying libuv 1.52.1 — 24.15.0
still carries 1.51.0, and no Node 22 release ships 1.52 at all, so there was no 22 to fix this on. The owner chose the floor over a
workaround (2026-10-19), and **the code is unchanged**: nothing rounds, and nothing compares a file time with a tolerance. If the floor
is ever lowered, or the runtime is ever run on another libuv or another kernel that keeps a coarser time, these are the comparisons
where it shows, and the six tests above are what names it.

### 2. `advance` hands off only steps that succeeded

**Where.** `agent-orchestrator/src/runner.ts:318` commits a finished step's leftover work only when its
engine task succeeded.

**Effect.** A step that fails or is stopped keeps anything it did not commit only in its worktree
(`~/.agent-workflows/worktrees/<run>/<step>`): not on its branch, not merged into later steps, not
shown by `wf decide`, and lost if the worktree is removed. The closeout contract tells steps "the run
commits whatever you left", which holds only for succeeded steps.

**Fix.** Hand off every finished step — succeeded, failed or stopped. A failed step still blocks what
follows; this only keeps its work on its branch.

**Status.** Deferred on purpose (2026-09-12): fix it when it bites.

### 3. A worktree task's Claude session stays in the registry

A `--bg` session is released once its attempt's end, or its task's settling, is on the record (engine
`7200295`, and two fixes from review in the table below): stopped if `claude agents` still has it
running, then removed. One kind is left there, stopped: a task that asked for a `worktree`, because
`claude rm` deletes the worktree the harness cut and the task's work is in it. Removing it safely would
need that work somewhere else first. A session whose task a person or a deadline settled before the
`settled` entry carried its id stays listed too, since `ae logs` could not read it once removed.

### 4. `claude-detached` measures its cost and tokens, and no turns or tool calls — and a resumed one's cost is not its own

`agent-runtime/src/harness/detached/output.ts`. Its closeout is read (engine `3e44ab6`), and so are its cost and API time,
`total_cost_usd` and `duration_api_ms` (engine `9d075f7`), from the one `result` object `claude -p --output-format json`
prints. Its tokens are read from the same object's `usage`, in their three classes, since 2026-09-19: on 2.1.278 that `usage`
is the process's own — a `--resume` printed 10 uncached, 21,392 written and 0 read, where its `modelUsage` carried its parent's
counts on. On 2.1.272 the same `usage` had counted 0 input and 0 output tokens in a run whose `modelUsage` counted thousands,
so a `usage` whose input sums to 0 gives no tokens. It has no peak context (`usage.iterations` holds the last response
alone), no count of turns or tool calls, and no tool time.

**A resumed `claude -p`'s cost is carried on, on 2.1.278.** The same `--resume` printed a `total_cost_usd` of $0.0900: its
parent's $0.0471 and its own $0.0430 together. The engine records it as the attempt's own, as 2.1.272 made it ($0.0042 of its
own over a parent's $0.018). Not fixed: its own share cannot be read off the result alone — its `modelUsage` is carried on
too, and the engine prices nothing — and the parent's total is on the parent's attempt, which the runner is not handed.
Low priority: this harness exists for comparison — and, since only `claude -p` keeps a spend cap (issue 17), for a task
that must not spend past one.

**Narrowed for a job on `claude`** (stage 2 part 1). Measured again on 2.1.280 (issue 28, M2): a `-p --resume` printed
$0.0257 over a parent's $0.0210, and a second resume $0.0284 — and its `duration_api_ms` is carried on the same way. So the
job's spec says so (`resumeCostCarried`), and the worker's registry takes off the cost and API time its parent printed: the
parent is the run under the id it resumed that started last before it. What is left: a job whose parent is no run of the
worker's — a `--bg` session, or a session another tool started — records no cost and no API time, since what it printed
cannot be told apart from what its parent spent. `claude-detached` records what it printed, as before.

### 6. The bare `file` refuses no harness's words

**Where.** `file` in `agent-runtime/src/core/engine/filing.ts` refuses what the task says of itself; the refusals in a harness's
words live in the `file` of an engine `Engine.layer` builds (`harnessRefusalOf` in `agent-runtime/src/service/harness-refusal.ts`), because that is where the
configured harnesses, and so their words, are known.

**What changed** (2026-09-22). The harness-agnostic half moved under the Effect `file`: `refusalOf` in `engine.ts`, the
same sentences word for word — an empty brief, cwd, model, resumeFrom or effort; a cwd that is not absolute; attempts,
deadline, retry policy, tool lists and permission rules, `mcp`, `budgetUsd`, `priority`, `remoteControl` and
`contextTokens` that are not values of their kind (`priority` is refused at any value since stage 4c part 2). The Effect door fails with `FileRefused` (exported beside `file`, a
tagged error as `JournalError` is) before anything is journalled; the facade asks the same function first and then the
harness, and throws `file: <the sentence>` as before. So `deadlineSeconds: NaN` is refused at both doors in one set of
words. `test/refusal.test.ts`: every one of those refusals made to refuse at the Effect door, nothing journalled, and the
Promise door's message the Effect door's behind `file: `; checked by deleting the call in `file` (every case fails)
and one line of `refusalOf` (its cases fail).

**What changed again** (2026-09-23, thin runtime stage 1, part 1). The harness's arguments are one `config` on the task
(`HarnessArgs`), and the checks of them that every harness shares left `refusalOf` for the adapter side, in the same words:
`argsRefusalOf` in `harness/args.ts` — an empty model or effort, tool lists and permission rules, `mcp`, `remoteControl`
and `contextTokens` that are not values of their kind — with three new refusals of where an argument is (one beside
`config`, a `config` that is no object, a key in it that is no argument). Every `Runner` asks them first through
`Runner.layer`'s `refuses`, then its own `RunnerOps.refuses`, which `composite` forwards to the task's harness; the Effect
`file` asks `refusalOf`, then `argsRefusalOf` itself — `Runner.of` is exported, and the SDK runner was built with it and no
layer, so it journalled a `config` no harness could use — and then `runner.refuses`, so it needs `Runner` beside `Journal`.
That is the first half of the paragraph below, done: `RunnerOps` took the optional verb. `test/refusal.test.ts` holds the
words at both doors, and fails with `argsRefusalOf` taken out of both `file` and `Runner.layer`; `test/harness-args.test.ts`
fails with it out of either (a runner built with `Runner.of` through `file`, and every runner's own `refuses`).

**What is left.** Through the bare `file`, still journalled: a `harness` the runner does not have — which `composite`
runs on its fallback without a word — a permission mode or an effort the harness rejects, which waits out the grace
window and ends the attempt `lost`; a `contextTokens` outside the harness's range, or on one with no window setting;
`claude.remoteControl`, and every other flag under `claude`, on `codex` or a `check` (Claude Code's own `-p` specs refuse
the bridge there since 2026-09-25, `claudePrintRefuses`); `budgetUsd` on `claude --bg` or `codex`. `test/refusal.test.ts` pins
that an unknown harness and a bad mode are still journalled there, so the day this moves, that test says so.

The issue used to say `RunnerOps` has no verb for this, and so it would be a value passed to `file`. The first half is
wrong: `RunnerOps` already has optional verbs (`find`, `release`, `transcript`, `say`), and an optional `refuses`
would not move the line its four required ones hold. What it costs is elsewhere: `file` would need `Runner` beside
`Journal`, a change to every Effect consumer's `file`; `composite` would need to refuse an unknown harness where it
falls back today; and the refusals that name another harness — *file the task on `claude-detached`*, the windowed and
the bridged harnesses listed by name — need the whole map of harness configs, which only the engine's options hold, where
the composite sees opaque ops. A value passed to `file` instead would be opt-in: it repeats what the consumer's runner
layer already knows, and by default refuses nothing. Either is more than a small change, so it was left; nothing in the
workspace files through the bare `file` (`ae` and the orchestrator's client file through `Engine`).

**What changed** (the engine as a service). `agent-runtime` is one face, Effect, and its engine is the `Engine` service:
`Engine.layer(options)` holds the harness configs, and its `file` asks `refusalOf`, `argsRefusalOf` and `harnessRefusalOf` first
(`service/engine.ts`, `service/harness-refusal.ts`). `test/engine-verbs.test.ts` refuses an unknown harness and a mode its harness
rejects; `test/verb-refusals.test.ts` holds each verb's refusal a tagged error. What is left is the bare `file` building block,
which still has only the runner to ask, and so the paragraph above still holds for a consumer that composes its own layers.

### 8. A Codex `tools` list that names Bash, Write or Edit narrows nothing

Codex has one shell and three sandboxes, not a tool list, so a list can only take writing away: none
of Bash, Write or Edit runs `-s read-only`; any of them leaves the sandbox as `permissionMode` says.
`tools: Read, Edit` therefore asks Claude Code for edits without a shell and gives Codex a shell
anyway. Refusing such a list on Codex is the stricter choice, and it was not made: the list the
workflow layer plans for its reviewer (`Read, Grep, Glob, Bash`, plan package I) is exactly such a
list, and what fences that reviewer on Codex is `permissionMode: read-only`.

### 9. A Codex task still has the operator's MCP servers

**The finding** (2026-09-13, plan §4 E4). A `claude --bg` step was spawned with no MCP flags, so it
loaded every server the operator has. Measured on Claude Code 2.1.270, from the `init` event of
`claude -p` in an empty directory holding a `.mcp.json`: `claude-design` from `~/.claude.json`; the
claude.ai connectors Gmail, Google Drive, Google Calendar and a LoL server; and the `.mcp.json`
server, which no setting had approved. With `--strict-mcp-config`, none of them — the `.mcp.json`
server included. With that file also named by `--mcp-config`, that server only. And a live `--bg`
session spawned strict still had Claude in Chrome connecting: a user setting switches it on, and no
config names it. hkb closed the same hole with `strictMcpConfig` (its ADR-013).

**Fixed for Claude Code** (engine `5340772`, `945bf46`): every `claude` and `claude-detached` spawn is
`--strict-mcp-config --no-chrome`, and names the checkout's `.mcp.json` and the task's `mcp`.

**Open for Codex.** `codex exec` is given a task's `mcp` as one `-c mcp_servers={…}` override, and the
override is merged into the table `~/.codex/config.toml` has, not put in its place: with
`-c mcp_servers={}`, a configured server stayed listed and enabled (`codex mcp list`, codex-cli
0.154.0). Codex has no strict flag. A task's server that shares an operator server's name is merged
into it — the task's command runs with the operator's args and env — or fails to load if the transports
differ (`url is not supported for stdio`). So `prepare` refuses such a task at spawn, reading the
names from `config.toml` the way `codex mcp add` writes them (found in review). An inline
`mcp_servers = {…}` table is not read, and a name it misses meets the merge.

**Proposed fix.** `-c mcp_servers.<name>.enabled=false` disables a server (measured with `codex mcp
list`), so a `prepare` could disable every server the operator's Codex has that the task does not
name. Not done: the names would have to come from `config.toml`, a profile, and whatever else 0.154.0
layers in, and a list that misses one is a fence that looks closed. The machine this was measured on
has no Codex servers configured.

### 11. A `claude-detached` session's conversation cannot be followed while it runs

`transcript` reads the transcript `claude --bg` would write, by the session id the worker keeps. `claude
-p --output-format json` prints that id in the one object it prints at exit, so until then there are no
events. `--output-format stream-json` prints the id first, but the closeout is read from the json form
(`claudeResultOutput` in `agent-runtime/src/harness/detached/output.ts`). Low priority, like issue 4: this
harness exists for comparison. For the same reason `say` refuses its tasks, though `claude -p` binds an inbox, and it is not
followed live: its runner has no `follow`, its card says `streaming: false`, and a subscription is refused.

**Closed for a job on `claude`** (stage 2 part 1): its spec prints `stream-json`, whose first line names the session, so the
worker has its id while it runs and `transcript` reads it by the job's name then (`claudeStreamOutput`). `claude-detached`
keeps the json form, and this issue, as the harness there to compare against.

### 12. `said` means the words were handed to the inbox, not that the session read them

**Where.** `claudeOps.say` in `agent-runtime/src/harness/claude/bg.ts`: a line posted to the session's inbox socket, which
writes nothing back (measured: the connection closes in a few milliseconds, with no bytes).

**Effect.** Words Claude Code sets aside are journalled all the same: a `crossSessionInbound` of `hold` or
`refuse` in the operator's user, project or managed settings; a burst past the inbox's rate limit; the same
words twice inside its repeat window (said twice, journalled twice, perhaps delivered once); a full queue. Only
`bypassPermissions`, the one hold the engine can see coming from the task, is refused up front.

**Possible fix.** Claude Code tells a sender what became of a message — held, delivered, refused, dropped — as
a `peer_message_status` line to the reply address the message carries in `from`, when that address is a `uds:`
socket in its own sockets directory and the sender's pid is verified. The engine would have to listen on such a
socket for the length of a `say`, and the status of a held message can arrive minutes later. Not done: it is
Claude Code's peer protocol, not the documented script path.

### 13. The channel rests on Claude Code's session registration, as measured on 2.1.270

The inbox socket and its line are documented ("The session's inbox socket", code.claude.com
cross-session-messaging). Where a session's socket is, for a process that is not its child, is not: the runner
reads `messagingSocketPath` from `~/.claude/sessions/<pid>.json`, found by the pid `claude agents --json` lists.
A release can move either, and only `AE_LIVE=1` would notice; the fake-registration tests pin the engine's
reading, not Claude Code's. On native Windows the inbox is a named pipe and needs the session's token, which the
engine does not read, so every `say` there rejects (not a socket). The other way in, attaching to the session's
terminal over the background daemon's control socket and typing, was not taken: it is a terminal path, and it
would type into whatever prompt the session has open.

`find` rests on the same files (§6 item 17): a registration's `name`, `kind`, `pid` and `procStart`, as 2.1.270 and
2.1.271 write them. A release that renames or moves them makes `find` find nothing, and every read that used it observes
instead — slower, not wrong. One that kept the files but let a registration name a session other than the one `claude
agents` lists for it would make `transcript` of an attempt in flight read the wrong conversation: the one read that takes
a registration's word over the registry's. On this machine every live registration agreed with the registry on both. And
without `/proc` (macOS) a pid another process has taken since is not caught, since `procStart` is checked only where the
system says when a process started.

### 14. Words said to a quiet session race the pass that ends it

A quiet session is no longer reported `done` (bug 1, fixed): the runner says how long it has been quiet and leaves it
`working`, so `say` reaches it, and an idle session's inbox starts a turn — the "nudge it past a stall" case this issue
was about. What is left is a race. A pass that observes the session between the words being posted and its first write,
or its going busy, still reads it quiet and ends the attempt — `done`, with `stated: false` for a task that asked for a
statement (`unsigned` until stage 4a) — and releases the session with the words unread. The window is that one moment against a pass every few
seconds; it was not measured. `find` changes nothing here: `say` needs the session's state and its process, and still
observes.

### 15. Words delivered and not journalled, if the process dies between the two

`Engine.say` delivers, then appends `said`. A process killed in between has handed a session words with no
trace, which is the failure `say` exists to prevent; the window is one append long. A journal that rejects the
append is reported (`was given the words, but they could not be journalled`), so only a crash is silent. The
other order was refused because it would record words that may never have arrived.

A layer above that reconciles its own deliveries against `state.said` reads the same window the other way: the orchestrator's chat
(`deliverOutbox`, `src/chat/deliver.verb.ts` there) finds no `said` for words the harness took, and says them again. For it the gap
is a repeat, never a loss; it closes only with this one.

### 16. Words said to a session blocked on a permission prompt wait with it, and are lost when it is continued

**Measured** (2026-09-14, Claude Code 2.1.270, `--model haiku`, by hand; `say-blocked-probe.log` in the
steering-channel run's artifacts). A `--bg` session in `default` mode stopped on the prompt for a `touch`, listed
`blocked`/`waiting`. A line posted to its inbox was queued — a `queue-operation` `enqueue` line in its
transcript — and not read: 45 seconds later it was still blocked, and nothing more was written. `claude stop` left
it unread. Then `claude --bg --resume <id>`, as B8's Continue and `wf retry` continue a session, started one under a
new id whose conversation held the first's up to the interrupted call, and not the words.

**Effect.** `say` accepts a `blocked` session, so such words are journalled `said` to attempt N and reach no model.
Once that attempt is stopped and continued, the next one has not heard them, and the record says only that attempt
N was told. Found in review, which asked whether "it reads the words once it moves again" had been measured; it had
not.

**Why it is not refused.** The harness lists a session `blocked` for its own stalls too, and a session stalled on a
login refresh moved on when a cross-session message reached it (2026-09-13, the section on a closeout not read,
below: 22:47:40Z). That is the "nudge it past a stall" case `say` exists for, and `claude agents` does not say which
kind of wait a session is in. Not measured: whether a session approved through `claude attach` then reads the words
queued while it waited, and a login-refresh stall nudged by `say` rather than by a peer's `SendMessage`.

**Possible fix.** Whatever continues a blocked attempt carries what was said to it — `state.said` for that
attempt — into the continuation's brief, as `wf retry --message` carries an answer. That is the upper layer's.

### 17. A `claude --bg` session keeps no spend cap

**Measured** (2026-09-15, Claude Code 2.1.272, by hand). Sent: `claude --bg --name ae-probe/budget-… --tools Read
--permission-mode acceptEdits --strict-mcp-config --no-chrome --model haiku --max-budget-usd 0.01 "Read the file NOTES.txt
with your Read tool. Then read it again. Keep reading it, one Read call at a time, at least 40 times, and say nothing in
between. Then reply done."`, in a directory holding a 200-line `NOTES.txt`. The session took the flag without a word, made
42 tool calls, replied `done`, and was listed `done`, idle, with its process; nothing in `claude agents`, its registration
file or its transcript named a budget. Stopped, it wrote its cost: $0.1925. The flag's help says it "only works with
--print". The same brief as `claude -p … --output-format json --max-budget-usd 0.01` stopped after two responses: exit 1,
`subtype: error_max_budget_usd`, $0.018. `test/live.test.ts` measured it again under the engine (Verified live, below).

**Not a cap the upper layer can keep from the view either.** The view of a running `--bg` attempt carries no `costUsd`. The
runner reads the transcript's last `cost-state` at or after the attempt's start on every observe of a session that is not
busy, but Claude Code writes none until the process exits (issue 18): a session listed `done`, idle, had none, and two once
`claude stop` returned. So a layer that stops a `--bg` session once `costUsd` passes a cap, reading it each pass, never
sees a cost while the session runs, and sees one only after the engine has let it go.

**Effect.** `file()` refuses `budgetUsd` beside `background: true` (engine `26020c1`, and stage 2 part 1), so nothing bounds
what a `--bg` session spends. A job on `claude` keeps a cap (`claude -p --max-budget-usd`), and since stage 2 part 1 a job is
what `claude` runs by default. Since stage 2 part 2 (2026-09-23) agent-orchestrator files every step on `claude` as a job,
and its `budget:` as the job's cap; a step that says `background: true` — the shipped supervisor alone — runs `--bg`, and the
orchestrator refuses a `budget:` beside it, so no step has a cap it does not keep.

**Why the engine does not keep it instead.** A `--bg` session's cost is written only as its process exits (issue 18), so no
read of a running session says what it has spent. Pricing its transcript's tokens here would be a price list of the
engine's, not the harness's figure, and wrong the day a price changes. An engine-kept cap needs Claude Code to say what a
running session has spent — in `claude agents`, its registration file, or a `cost-state` per turn — and 2.1.272 says it in
none of them.

**Since stage 4b (2026-09-25) the runtime keeps no budget at all.** The cap is a harness argument (`config.budgetUsd`),
handed to a harness that keeps one as its own flag, and a cut it reports is carried on the attempt as `limit: 'budget'`,
unjudged; whether a run went over its budget is the orchestrator's (`taskSpend`, `ownStatus` in agent-orchestrator's
`status/status.ts`). That judgement reads what the runtime reported, and no harness reports a running session's spend — not `--bg`
(above), not `claude -p`, whose one `result` is printed at its end, not `codex exec`, which reports no cost. So the
orchestrator can say a run is over its budget only after an attempt has ended, and cannot stop a session mid-spend: the
one live bound is still the harness's own cap, on a `claude` job alone. A harness that streamed its spend would let the
orchestrator stop the session itself, through `stop`, with nothing in the runtime changed.

**Measured again on 2.1.288** (2026-10-02, by hand, the slice 1c probe): still no `cost-state` per turn, and nothing naming cost,
usage or tokens in a `claude agents --json` row or `~/.claude/sessions/<pid>.json`. What a running session has used is in its
transcript's responses alone, as tokens. So a long-lived attempt's counts are journalled as they grow (a `counted` entry, issue
18), and its cost still only at its end: a cap on its cost is a cap on tokens, or waits for its end.

### 18. A `--bg` attempt's cost is read only once its session is let go

Claude Code writes a `cost-state` pair as a session's process exits, and never per turn: every `--bg` transcript on this
machine from 2.1.246 to 2.1.272 holds one pair per process, and a session stopped by hand had none until `claude stop`
returned. So the Claude runner reads an attempt's cost after its end is written: its release stops the session and reads the
transcript, and the pass journals a `measured` entry (engine `9d075f7`). What that leaves:

- **A crash between the read and the entry** loses the cost when the same release removed the session: no later pass
  observes it. A worktree task's session, stopped and left listed, is read again by the next pass, and measured from that.
- **A session its release did not stop** — one that had already exited, or that a person or a deadline stopped before its
  task settled — is measured from the sighting the pass made. One removed before this change never is.
- **No cost at all** for a session killed so hard it wrote no `cost-state`, and for a continuation whose count was carried on
  from a total its transcript does not show — a parent killed that way: absent, not a guess.
- **An attempt in flight has no cost** in `view` or `ae ls`: nothing has been written yet. A long-lived attempt's (`restartPolicy:
  Always`) turns and tokens are journalled as they grow instead — a `counted` entry each time a pass reads more than the record
  (`countedFacts`), the attempt's usage replaced whole — and its view shows those; a job's are read at its end, as before. A busy
  session's sighting carries no usage, so its counts wait for it to go idle.
- **A respawn's cost is not the attempt's** (the slice 1c probe, 2026-10-02, 2.1.288): a process killed with `kill -9` writes no
  `cost-state`, and the process Claude Code respawns on the same session counts afresh, under its own `startTime`, its own turns
  alone. A long-lived attempt is counted from the start its journal gives it (`ExpectedSession.since`), across every process, and a
  `cost-state` whose count began more than `COST_START_SLACK_MS` after the attempt's first line gives no cost, API or tool time: its
  tokens are the attempt's, its cost absent rather than too low. A process that started late — a slow spawn, a crash between the
  journal's start and the spawn — keeps its cost, its count beginning a moment before its first line. A compacted attempt counted
  that way has no tokens either: they come from the `cost-state` alone.
- **The resumed reading rests on one shape**: a continuation writes into the same transcript, after its parent's pair, under
  its parent's `startTime` (one session continued twice, 2026-09-15). Its cost is its total less its parent's. No resumed
  session has been measured end to end under the engine.

### 23. `claude.remoteControl` bridges a session, and nothing reads whether it was bridged

**What changed** (2026-09-16). `remoteControl: true` on a task gives every attempt's `claude --bg` spawn `--remote-control`
(`claudeOps` in `agent-runtime/src/harness/claude/bg.ts`), so the session is listed in claude.ai's agents view — measured 2026-09-16 on
2.1.273 (agent-orchestrator `docs/features.md` §2): a `--bg` session gets a `bridgeSessionId` only with the flag. The flag takes
an optional name, so it goes before `--permission-mode` and never before the prompt. The engine's `file` refuses a value
that is not true or false, and `true` on any `HarnessSpec` — `codex`, `claude-detached`, agent-orchestrator's `check` — naming the
harness and the `'claude-bg'` one to file on; a `RunnerOps` brought as its own is handed it and asked only its own `refuses`. `test/completion.test.ts`:
the flag's place in the argv, and at `Engine.layer`'s own harnesses a fake `claude` given it on a first attempt and a
retry, and never for a task without it; `test/engine.test.ts`: carried to every attempt, and not read by `decide`;
`test/engine-verbs.test.ts`: every refusal, by name. Measured under the engine (Verified live, below).

**What changed again** (2026-09-25). The bridge is Claude Code's own flag, `config.claude.remoteControl`, no harness argument
of its own: the runtime grows no named field per harness flag. `config.remoteControl` is refused at any value,
naming the new place (`FORMER_ARGS`), and a journal filed before reads as filed under `claude` (`upgrade`). The argv did not
move (`packages/agent-orchestrator/test/argv.test.ts`, recorded before). In the bag it could reach a `claude -p` spec at the Effect
door, which the named key never did, so `claudeJob` and `claudeDetached` refuse it there (`claudePrintRefuses`).

**What changed again** (2026-10-06). Whether a session was bridged is read: `observe` reads the `bridgeSessionId` of each listed
session's registration (`claudeBridge`, `harness/claude/bridge.ts`), under the guards `find` uses (`claudeRegistration`), and the
task's view carries `bridge` — `{ url }` asked and up, `{ url: null, why }` asked and not up (an account signed out, Remote Control
off, no process seen, an id not of the form `session_…`), and nothing for a task that did not ask (`bridgeOfTask`,
`test/bridge.test.ts`). The link's form, and when it appears, measured on 2.1.291: `CLAUDE.md`, *Claude Code, as a harness*.

**What is left.**

- **Driven outside the record.** Whatever a person types into a bridged session from the web, and every prompt they answer
  there, reaches it without `say`, so none of it is journalled: `state.said` is not the whole of what such a session was
  told.
- **A session let go.** The engine stops and removes a session once its end is written (`release`); whether the agents view
  drops a released session at once was not looked at.
- **The bare `file` refuses no harness's words** (issue 6; `Engine`'s `file` does): it refuses a `claude.remoteControl` the bag refuses of any flag
  (`false`, `''`), and one on `claude-detached` (since 2026-09-25); one that reaches `codex` or a `check` through it is dropped without a word.
- **Not a brief key.** agent-orchestrator files it for a step that says `remote: true` (features.md §2).
- **Rests on a measurement, not a document.** The flag's help says it starts "an interactive session with Remote Control";
  that it bridges a `--bg` session is measured on 2.1.273 and 2.1.274, as `--json-schema` under `--bg` is. `test/live.test.ts`
  fails the day the control is bridged without it, or the flagged session is not.

### 26. A session's context window: `--autocompact` works on `--bg`, and a small one can stall a session

**Measured** (2026-09-19, Claude Code 2.1.278, by hand, `--model sonnet`, about $6 in all). The question was whether a
cap on a session's context — `claude --autocompact <auto|tokens>`, "Auto-compact window size (auto, or 100k–1M tokens)" —
does anything to a background session, since workers run on the model's whole window and none of 234 ever compacted
(repository `docs/pivot-2026-09-18.md` §1, Finding 1).

- **The flag takes effect on `--bg`.** `claude --bg --tools Read,StructuredOutput --permission-mode dontAsk
  --strict-mcp-config --no-chrome --model sonnet --autocompact 100k --json-schema … "<read eight source files in full>"`
  compacted three times in two minutes. The environment variable `CLAUDE_CODE_AUTO_COMPACT_WINDOW` was not needed, and was
  not tried.
- **The transcript shows it**: a `system` line, `subtype: compact_boundary`, `compactMetadata: { trigger: "auto",
  preTokens: 83770, postTokens: 17465, durationMs: 36991, … }`, and a `user` line with `isCompactSummary: true` holding the
  summary ("This session is being continued from a previous conversation that ran out of context…"). The session read on
  from the next offset each time: nothing it had read was read twice. On a 100k window it compacted at 63,651 to 83,770
  tokens of context (eight compactions across three sessions), each taking 22 to 42 seconds.
- **A window too small for what a turn reads stops the session, `blocked`.** Its reads were 800 lines, about 22k tokens
  each; after the third compaction Claude Code said *"Autocompact is thrashing: the context refilled to the limit within 3
  turns of the previous compact, 3 times in a row. A file being read or a tool output is likely too large for the context
  window. Try reading in smaller chunks, or use /clear to start fresh."*, ended the turn, and `claude agents` listed the
  session `blocked`, idle, unsigned. The engine reads that as waiting on a person (`NEEDS_HUMAN`), and so does a workflow
  step. It is Claude Code's guard, not a crash: continued, the session carried on.
- **Continued with the same flag, it carried on and signed off.** Resumed as the engine resumes (`--bg --resume <id>`, every
  flag given again, so Claude Code starts a copy — *"background session fa75207c keeps its own saved options, so the flags
  you passed started a copy"*), told to read in 300-line chunks, it compacted once more before its first call, read two
  more files, and called `StructuredOutput` with an answer that matched the schema. The same brief on `claude -p --output-format
  json --autocompact 100k`, 500-line reads, compacted five times and ended `subtype: success` with its
  `structured_output`, for $1.94: `claude -p` takes the flag too.
- **At 200k, unattended, it compacted twice and signed off.** The first brief again — eight files, 800-line reads, about
  22k tokens a call — at `--autocompact 200000`, and nothing said to it: it compacted at 173,584 and 173,254 tokens of
  context (to 15,870 and 12,875, 54 and 59 seconds), read every file, and called `StructuredOutput` with all eight files
  counted and the right answer to what it had read before either compaction. $2.18; 2,156,626 input tokens, which the fixed
  reading below counts as the `cost-state` does. So at 200k a session compacts about 27k tokens under its window, and a
  refill takes seven or eight such reads — the thrash above needs one in three.
- **The window is not part of the cached prompt.** A small session started with `--autocompact 200000` and resumed three
  times — with `200000`, with no flag, with `500000` — read 19,721 to 19,990 of about 20k tokens from the cache on each
  resumed call, and wrote 0 to 269. So a resume reuses the cache whatever window it is given, and a changed window costs
  nothing there. What it does change: a copy keeps the flags it was started with and no others (its `respawnFlags` in
  `~/.claude/jobs/<id>/state.json`), so a continuation filed without the flag runs on the model's whole window again. A
  resume that compacts before its first call rebuilds the cache after the summary, as any compaction does: the resumed copy
  above read 0 tokens from the cache on its first call.
- **The engine's usage reading undercounts a compacted attempt's tokens.** The summarising call is an API call that leaves
  no `assistant` line in the transcript. On the first session, `transcriptUsage` counted 408,348 input and 1,625 output
  tokens; the `cost-state` Claude Code wrote as it stopped said 601,367 and 13,138 — the difference its three compactions.
  The control, a session that never compacted, agreed to the token (34,869 and 365). Its `costUsd` was right throughout: it
  is the `cost-state`'s own. **Fixed**: an attempt whose lines hold a `compact_boundary` takes its tokens from the
  `cost-state` the way it takes its cost — its own share of the total — and has none while no `cost-state` is written,
  rather than a count missing its compactions (`transcriptUsage` in `src/harness/claude/transcript.ts`). The `claude -p` session's transcript
  then read 1,327,896 input tokens, what its result's `modelUsage` said.

**What the engine does with it.** A task's `contextTokens` is handed to both Claude runners as `--autocompact <digits>` on
every attempt, refused at `file()` outside 100000 to 1000000 — the CLI refuses any other value while it parses, so a spawn
would fail on every pass — and on a harness with no such knob (`codex`, a `HarnessSpec` that declares no `contextTokens`
range). A window small enough to thrash is the task's author's to avoid: the engine sees only a `blocked` session.

**Not measured.** A window of 200k on real work: what a session loses in the summary, and whether a turn's tool output ever
refills 200k in three turns — several large reads in parallel in one turn could. The shipped workflows of work give every
agent step `context: 200k` on the strength of the unattended run above; a step that stalls `blocked` on a thrash is the sign
to widen it. What the summarising call costs next to the reading it saves. A `claude -p` attempt's tokens across a compaction
under the engine.

### 27. The A2A seam carries every call to a session, the transcript as an extension method

Since thin runtime stage 1 part 2 (2026-09-23), `createEngine` puts every harness behind an A2A agent of its own
(`src/a2a/handler.ts`) and reaches it through the SDK's `Client` over an in-process transport (`src/a2a/client.ts`):
`spawn` is a message, `observe` a listing, `stop` a cancel. Since part 3 (the same day), `say` is a follow-up message on
the session's Task, and `find`, `logs` and `release` are the runtime extension's methods (`findSession`, `sessionLogs`,
`releaseSession`), offered as the harness's card lists them. Since part 4 (the same day), a transcript is read by the
session's name through the extension's `sessionTranscript`. Since stage 2 part 5 (the same day), a Task is in A2A's shape:
its `contextId` the harness's id for the conversation, a spawn's the session it continues, its closeout its one Artifact,
and a held task's signed attempt `INPUT_REQUIRED` on `getTask`. What is still direct, and what the seam does not do:

- **`refuses` alone reaches the driver directly**, for good: it judges a task before any session exists and is no call
  to one. `test/driver-calls.test.ts` exempts it alone, refuses any other driver call made with no A2A call in flight, and
  names a transcript read directly as part 3 read it.
- **A transcript is an extension method, not A2A's `SubscribeToTask`.** It is a history read from a cursor, and most reads
  are of a session that has ended — a run's detail, long after. A2A 1.0 refuses a subscription to a Task in a terminal
  state (`UnsupportedOperationError`, and the SDK's `DefaultRequestHandler.resubscribe` throws it), and a subscription's
  first event is the Task, which this agent answers with a listing: a cost on every read that the read never needed.
  `GetTask`'s `history` has no cursor either (`historyLength` is the last N). A cursor was not the blocker: the SDK does
  carry request-scoped values, a service parameter into `ServerCallContext.state`. `SubscribeToTask` streams a session
  live beside it, not instead (`a2a/follow.ts`): where a harness's runner follows a session — a `claude` job, a `--bg`
  session, a Codex session, a remote agent — its card says `streaming: true` and a subscription is answered with the Task,
  then each moment; where it does not — `claude-detached`, `command` — its card says `false`, and a subscription is refused.
  The api relays what the runtime streams and reads no session again on a timer (`apps/api/src/steps/reread.test.ts`).
  `sendMessageStream` stays `UnsupportedOperationError`.
- **A Task's context is the conversation, not the runtime's task.** Its `contextId` is the sighting's `nativeId`, or the
  attempt's off the journal, and empty while none is known — a job's until its first `stream-json` line. So a listing by
  context is every attempt that continued one conversation: a job keeps its id on `-p --resume` (M12), a `claude --bg`
  resume does not (issue 16), and a retry started cold is a new context. A spawn carries the session it continues as its
  message's `contextId`, which is `resumeFrom` to the harness; a follow-up sends none or its session's, and any other is
  refused in words that name the one to send.
- **The closeout is the Task's one Artifact, `closeout`**: one `data` part, or `text/plain` for a string (Codex's prose),
  and the time it was given in the Artifact's metadata when the sighting had it — a resumed session can carry its parent's
  statement, and the time is how a reader tells. A listing leaves artifacts out unless `includeArtifacts` asks, A2A's
  default; the engine's `observe` lists without them and reads the sighting, unchanged. **The files a step collected are
  not Artifacts here**: they are the orchestrator's, for its own Task (stage 6).
- **`getTask` and `listTasks` differ on a held task that waits.** `getTask` reads the journal for a session listed `done`,
  or listed not at all, and answers `INPUT_REQUIRED` for the attempt that signed while `waitsForInput` holds; the listing
  says `COMPLETED`, the harness's word, since the engine's `observe` reads it and `sightingOf` needs the Task's state to be
  the sighting's. One journal read per `getTask` of a finished session; the engine never calls `getTask`. A Task is still
  one attempt: a held task's turns are Tasks of their own, sharing a context.
- **The agent finds the session's id as the engine's `transcript` did**, in the same order: the attempt's `nativeId` off the journal, then
  `find` for an attempt in flight (a failure counts as none), then a listing. A name with no attempt journalled yet is asked
  of the harness, not refused: a session is listed before its `spawned` is written. The engine no longer asks the harness
  for a task with no attempt at all, and the journal is read twice per transcript — once by the engine, for its refusals,
  once by the agent, which holds nothing. The cost in listings is otherwise unchanged: one `claude agents` per read of an
  attempt in flight only on a harness with no `find`.
- **No subscription is held.** `sessionTranscript` is one request and one answer; the agent keeps no cursor, no listener
  and no context between calls, so a long-lived `wf up` accumulates nothing by reading transcripts.
- **A spawn is marked, and a message without the mark is not a spawn.** A2A reads a message that names a `taskId` as a
  follow-up on that Task, and a spawn names a Task that does not exist yet. So a spawn carries the runtime's extension,
  `urn:agent-runtime:session:v1`, and the agent reads a message without it as words for a running session: a plain A2A
  client can speak to a session, and can start none. A message with no `taskId` is refused in words: this agent starts a
  session only on a spawn.
- **Each `say` costs one more `observe`**: the engine's `say` lists the harness to find the session and refuse a settled one, and
  the agent, holding nothing, lists again for the id it hands the driver and to refuse a session that has ended. Words are
  said by a person, rarely.
- **A runner an Effect program provides is direct unless it asks otherwise.** `Runner.layer`, `Runner.claude` and `Runner.test` hand the
  engine the driver as they did; `a2aRunner(ops)`, which needs the program's `Journal`, is the same seam `Engine.layer`
  takes. Its `Runner.transcript` is keyed by session id, as it always was, and goes through the seam by that id
  (`sessionTranscript` takes a name or an id, never both); the `Engine` service asks by name (`transcriptOf`).
- **`listTasks` lists what the harness sees, never the journal.** An attempt the harness has let go is answered by
  `getTask`, off the journal; it is in no listing. So `observe` through the seam is the map it was.
- **A stop of a session no harness lists fails in words** (`` the `<harness>` harness lists no session `<id>`: there is
  nothing to stop. ``), where the driver was handed the id to make of what it would. The engine stops only a session its
  pass has just seen live, so it never asks. One that ended between the listing and the stop is not refused: the agent
  answers `TaskNotCancelableError` and the stop does nothing, as a driver's stop of an ended session did.
- **Each stop costs one more `observe`**: the agent, holding nothing, lists to find the session it is asked to cancel.
  Stops are rare — an operator's, a deadline, before a continue.
- **Nothing is served by URL.** The handler is the SDK's `A2ARequestHandler`, so its HTTP transports can serve it later
  (stage 6), unchanged.

### 28. Claude Code as a job: what was measured, and what a job gives up

Since thin runtime stage 2 part 1 (2026-09-23), `claude` runs a task as a job, `claude -p --output-format stream-json
--verbose --permission-prompts none` in the worker the engine detaches, and as `claude --bg` when its task says
`config.background: true` (`src/harness/claude/code.ts`); since part 2a (the same day) a job reads its brief, and the words
said to it, on its stdin (`--input-format stream-json`). Measured by hand on **Claude Code 2.1.280**, haiku, in folders under
`/tmp`, before it was built; `test/live.test.ts` keeps each measurable (`AE_LIVE=1`, the tests named M1 to M12, and M14).

- **M1: a job waits on nobody.** `claude -p` in `auto`, `dontAsk` (with `--allowedTools 'Edit(**),Bash(npm test)'`), `default`
  and `acceptEdits`, each with and without `--permission-prompts none`, told to write outside its folder, run a command and
  fetch a page: all eight exited 0 on their own, with a result. A call that would have asked was denied and the session
  carried on. Each denial is said twice: a `{type: system, subtype: permission_denied, tool_name, tool_use_id,
  decision_reason_type, decision_reason?, message}` line as it happens, and a `{tool_name, tool_use_id, tool_input}` entry of
  the result's `permission_denials`, the same calls. The reason differs by flag — `workingDir`, `other` or none without
  `--permission-prompts none`, `asyncAgent` (*"no approval surface in this session"*) with it, `mode` in `dontAsk` either
  way — and the outcome does not. A Skill was not denied in any mode. The job is given the flag so a later default cannot
  make it wait.
- **`auto` on haiku runs as `default`.** Its `init` line said `permissionMode: default` in both `auto` runs on haiku; on
  sonnet it said `auto`, and denied nothing the same brief asked. So a haiku step filed in `auto` is fenced as `default`.
  Nothing refuses it: the mode is Claude Code's to choose per model.
- **M2: a resume's cost and API time are its session's.** Issue 4, narrowed.
- **M3: `claude -p --resume` continues a `--bg` session**, under the same id, and remembered what it was told (a session
  stopped first). So a job may continue a background session, and the new attempt's mode is the job's.
- **M4: a job stopped mid-turn can be resumed.** SIGTERM while a `sleep 40` ran: exit 143 within a second, a result
  printed. SIGINT: exit 0, a result of `error_during_execution`. Resumed with `-p --resume`, each remembered its word and
  knew its command had not finished. The engine stops a job as it stops any detached run: SIGTERM to the worker, which
  sends SIGTERM to the harness's process group (`bin/ae-worker.ts`).
- **M5: a budget caps a resume's own spend**, not its session's: a resume capped at half of what its session had spent
  finished (`success`), and one capped below one response ended `error_max_budget_usd`.
- **M6, for `wf say`: a job can be told something, over its stdin.** A `claude -p --input-format stream-json
  --output-format stream-json --verbose` given a second user message on stdin while a turn ran a `sleep 20` answered with
  the word from that message in the same turn's one result (`num_turns: 2`). So words can reach a running job, if its stdin
  is kept open, and since part 2a the worker keeps it open until the job's first result (the plan's option (d); issue 29).
  The control, SIGINT and then `-p --resume` with the words, is M4.
- **M7: a resume is not charged its parent's denials.** Asked in review after the rest, and measured by hand the same
  way: a job denied a write outside its folder, then `claude -p --resume` of it told to call nothing, printed
  `permission_denials: []` and no `permission_denied` line, under the same session id — where its cost (M2) is carried on.
  So a resumed job's result is read for denials as a first job's is, and a round, a retry or a gate's answer resumed from
  a denied attempt says only what it was itself denied. Were a later version to carry them, M7 fails.
- **M8, M9, M10: a job given its brief on its stdin is the job given it as a prompt.** Measured before part 2a was built,
  one live test on 2.1.280, haiku, each a pair — `claude -p <brief>` beside `claude -p --input-format stream-json` with the
  brief as the first user message on a stdin held open — six jobs at once. M8: `--json-schema` gave the same
  `structured_output` (`{"finished":true}`), exit 0 both. M9: `--max-budget-usd 0.01` ended both `error_max_budget_usd`,
  exit 1, at $0.0291 and $0.0292. M10: `auto` with `--permission-prompts none` and no allow rule — on haiku, so `default` —
  told to write outside, run `curl` and fetch a page: both denied `Write`, `Bash` and `WebFetch`, a `permission_denied` line for each, gave their closeout, and wrote nothing
  outside. And one thing only the stream shows: a job reading its stdin does not exit at its result — it was still running
  five seconds after it in each streamed pair — and exits once its stdin ends, so the worker ends it. The result line's
  `type` is printed near its end, not first (`{"duration_api_ms":…`, both ways), so the worker parses each line for its
  `type` rather than matching its start. (This record said M10 ran in `dontAsk` until stage 2 part 2 read the test again:
  `test/live.test.ts` gives both jobs `--permission-mode auto --permission-prompts none`. `dontAsk` under a job is M1's, and
  M11's.)
- **M11: a job in `dontAsk` is fenced by its checkout's settings as a `--bg` session is.** Asked at stage 2 part 2's plan
  gate, before the orchestrator filed its steps as jobs, since the planner and the reviewers run `dontAsk` with no allow rule
  of their own and this repository's `.claude/settings.json` as their only list. Under the engine, on 2.1.280, haiku, a job
  and a `--bg` session, each `dontAsk` with `tools: ['Bash']`, in a checkout inside this package whose settings allow
  `Bash(npm run build)` alone, told to run `npm run build` and then `npm run e2e`: both ran the build, neither ran the e2e,
  both closed saying `npm run e2e` was denied, and the job's attempt carries the one denial, `Bash(npm)` (a denial names a
  command by its first word). Were a job to read no project settings, the build would be denied too and M11 fails. But
  `build` is a name a person's own `~/.claude/settings.json` may allow, and that allow alone would run it with no project
  settings read (this machine's lists no `npm run`, so the first reading stands). So M11 names its two scripts afresh on
  every run (`m11-allowed-<nonce>`, `m11-unlisted-<nonce>`), on no list but the checkout's; measured again so, on 2.1.280,
  the same day: the same result, the allowed one ran in both and the unlisted one was denied in both.
- **M12: a job held open waits with nothing running, and an answer resumes it.** Stage 2 part 4a (R1), on **2.1.281**,
  haiku, `dontAsk`, a store under `/tmp`: a task filed `holdOpen: true` whose brief gives a code word signed, and read
  `input-required` with no process of its name in `ps` and nothing started by two more passes. Answered — *give the code
  word I gave you*, `--budget 0.3` — the next pass resumed the session that signed (attempt 2's `resumeFrom` its first's id,
  and its own id the same), the job was spawned with `--max-budget-usd 0.3`, and it answered the code word, which only that
  session was told; it read 8,020 tokens from the prompt cache. It signed, waited again, and a close settled it `succeeded`,
  note `closed`. Measured first by hand through `ae start`, `ae answer` and `ae close` (the same shape: an animal it picked,
  and that animal back with `-again`), then as M12. A held task on `codex` is M13 (issue 31). Not measured: a held task on a `--bg` session
  (`claude-bg`, or `background: true`), whose released session is stopped and, without a worktree, removed from
  `claude agents` before an answer resumes it — which `--resume` survives for a settled task (the live test of a settled
  `--bg` session) and was not tried for a held one; and a wait longer than the prompt cache lives, whose resume re-reads the
  conversation at full price. A failed later turn is not retried since stage 4a part 2 — it settles its task `failed` — but
  a caller that files it again with `resumeFrom` meets what the retry met: since `-p --resume` keeps the id, the turn's failed
  attempt ends with the id the turn continued, and a continuation resumes a conversation that holds the failure. Where the
  turn began would be kept by resuming each turn with `--fork-session`, a new id per turn and the signed session left as it
  was: not built, a change to the runner's arguments for one harness.
- **M14: a job's denial reaches its capture before its result.** On **2.1.289**, haiku, `dontAsk` with only `Bash(sleep:*)`
  allowed, told to run `curl` (expected to be denied) and then `sleep 40`: the `permission_denied` line was in the job's
  capture about 4 s in, its result about 50 s in. So a sighting of the working job names the denial, and since then the
  engine journals it as a `denied` entry on the attempt in flight (`deniedFacts`, `src/core/engine/denied.ts`); the end's
  `permission_denials` still replace the list. Measured first by hand on the raw stream, then as M14, twice. A `ls` was not
  denied in `dontAsk` (a read-only command), and a brief that does not say the denial is expected ends on it.

What a job gives up, or what is not done:

- **A job is told on its stdin, until its result** (issue 29). A person who means to attach to a step, or bridge it to
  claude.ai, still files it with `background: true`.
- **A background session's denials are read nowhere, neither while it works nor at its end.** M1's two shapes are
  `claude -p`'s output, which a `--bg` session does not print; what its transcript writes for a denied call was not measured,
  and the attempt of a `--bg` session carries no `denials`. Since stage 2 part 2 every orchestrator step is a job, and its
  attempt carries its denials, live since M14, but for a step that says `background: true` and the system agent's own
  long-lived session, in `dontAsk`, whose calls off its `allowedTools:` list are denied unread. The candidate source is the
  transcript's refused `tool_result` for the call, to be measured on its own before a reader is built. `claude-detached`,
  Codex and a remote agent report no denial while they work either.
- **A session journalled on `claude` before part 1 is a `--bg` session with no `background` in its config.** It is still
  observed, stopped, released and settled by its id's shape, and `say` reaches it the same way: `say` reads the mode off the
  running session's id, as the runner does, and off the config only when nothing runs (`test/say.test.ts`).
- **A job resumed from a `--bg` session records no cost** (issue 4).

### 29. A job's stdin: words at most once, and none after its result

Since thin runtime stage 2 part 2a (2026-09-23), `say` into a job appends a user message to the run's inbox
(`runs/claude/<name>.inbox.jsonl`), which only the engine's `say` writes, and the job's worker (`bin/ae-worker.ts`) writes each whole
line on to the job's stdin, looking every half second. It records how far it has written on (`inputAt`) on the run file
before each line, and a run spawned under the name starts at the inbox's end as it was (`input.from`). At the job's first
`result` line it writes `inputClosed` and ends the stdin, and the job exits. What that leaves:

- **At most once, never twice — so a word can be lost.** A worker killed between recording a line and writing it on has
  recorded words its harness never read, and a worker started again on its run file goes on past them. The other order would
  write them twice. Nothing in the runtime starts a worker again on its run file; it is what a person doing so by hand gets
  (`test/detached.test.ts`).
- **A worker started again gives its new harness nothing the old one heard.** Its brief line again, then only the words said
  since. A continued session (`resumeFrom`) has its conversation; a fresh one does not.
- **Words said in the half second before the result are journalled and never written on.** The inbox is looked at every
  500 ms, and the look stops at the result: a line appended in between is on the record as `said` and reached no model. A
  word said after the result is refused. Whether a job reads a word that reached its stdin after its last turn began and
  before its result was not measured; M6 measured one said mid-turn.
- **A word refused after the result carries no exit code.** The job is still `working` until it exits, so the engine asks the
  runner, and the runner's refusal crosses the A2A seam as an error, not a refusal: `ae say` exits 1, not 2. The next tick
  settles the task, and a word said then is refused with exit 2.
- **A second result is read over the first.** A word written on in the same look as the result may start a second turn,
  whose result the output reader takes as the job's (`claudeStreamOutput`, the last result). Not seen live.
- **The longest line a job's stdin reads was not measured.** Claude Code's inbox drops a line over 1,048,576 characters,
  and a `--bg` session's words are refused past it; a job's are not refused on length.

### 31. Codex as an A2A agent: what maps, and what `codex exec` cannot do

Since thin runtime stage 3 (2026-09-23), the detached Codex driver is proven as an A2A agent in stage 2's shape, through the
real worker and the SDK's client, with a fake `codex` first on PATH (`test/codex-agent.test.ts`): its context is the thread id,
empty until `thread.started` is printed, and a listing by `contextId` finds it; its `-o` file is the `closeout` Artifact, a
`data` part under a schema and `text/plain` for prose, carried by a listing only with `includeArtifacts`; `cancelTask` ends the
harness and a grandchild it started, a repeat cancel is answered `CANCELED` again, and a cancel of a finished session is
refused `TaskNotCancelableError`; a held task's signed attempt is `INPUT_REQUIRED` on `getTask` (`COMPLETED` in a listing), its
answered turn runs `codex exec … resume <thread> <words>` and is `WORKING`, then waits again in the same context. The plan said
a second cancel is refused; the handler answers it `CANCELED`, as a stop is idempotent, so the refusal is proven on a session
that has ended instead.

- **M13: a resumed Codex thread keeps its id and its rollout.** On **codex-cli 0.154.0**, the default model, effort `low`,
  `read-only`, a store under `/tmp` (`test/live.test.ts`, `AE_LIVE=1`, run once, about 15 s): a held task whose brief gave a
  code word signed `{word: 'ready'}` and waited with its worker gone; answered *give the code word I gave you*, the next pass
  resumed the thread (attempt 2's `resumeFrom` its first's id), which answered the code word only that thread was told, under
  the same thread id; `codexRolloutFile` named one file for both. So a held Codex task is one A2A context across its turns,
  as a Claude Code job's is (M12), and a resumed attempt's transcript holds its parent's conversation. A close settled it
  `succeeded`. Not measured: a turn that fails and is continued by a new filing, whose conversation then holds the failure as
  a job's does.

What `codex exec` cannot do, said and not faked:

- **No words while it runs.** It reads its prompt and then only its own shell. Its card says `say: false`; an A2A
  follow-up is refused `UnsupportedOperationError` naming the way on — once the session has ended, a spawn in its
  context, which `test/codex-agent.test.ts` follows to a `resume` of the same thread; spawned while it runs, a second
  process would resume the thread beside the first, and nothing refuses that, so the words say *once* — and the engine
  refuses first in the harness's own words (`noChannel`), which `wf` and the board print unchanged.
- **Never `INPUT_REQUIRED` mid-run.** The worker writes no `blocked`: a sandboxed command is refused and the turn goes on,
  so only a held task's signed attempt, between turns, waits on a person.
- **No spend cap.** A budget is refused at `file` and at `answer`.
- **No text as it is written.** `exec --json` prints each message whole, in its `item.completed`, so a Codex session is
  followed live at message level: its state, then each event of its rollout once and in order as Codex writes it, its
  stdout decoded as it comes (`codexPartials`, `test/codex-follow.test.ts`). Claude Code's job (`claude -p`) is followed to
  the text it is writing, a background one (`--bg`) at message level.

And one window, found by the check's parallel run: **the engine waits before the harness has let go.** The engine ends an
attempt on its statement once one is on disk and the session is not busy (`closedOut` in `src/core/engine/engine.ts`), and Codex writes
`-o` before it exits; the worker writes `done` only once Codex has exited and its pipes have drained. For that moment `view`
says `input-required` while `getTask` still answers the harness's `WORKING`, and the process is still there. It closes by
itself, and the test pins both sides of it with a fake that holds its exit (`test/codex-agent.test.ts`). Nothing reads the
two together; were something to, the handler would read the journal for a listed `working` session too, one more journal
read per read of a running session.

The `claude -p` job, which shares the worker, is stage 2's and unchanged here: its stdin (issue 29) is what Codex lacks.

### 32. A run file removed is a stop (2026-09-23)

A detached worker's run file is its session: `stop` and `observe` find the worker by it. Until 2026-09-23 a worker whose run
file was removed wrote it again at its next heartbeat and ran on, and one whose whole store was removed crashed on its next
write and left its harness running, which nothing could find to stop. The runtime's own tests showed it: a test that failed
before it stopped its worker left the worker, and a harness that reads its stdin for ever, running for hours, and 12,583
`ae-detached-*` folders piled up under `/tmp`. Now the worker takes a run file gone, alone or with its store, for a stop.
It sends SIGTERM to the harness's process group, SIGKILLs the group five seconds later if anything of it is still there,
writes nothing again, and exits — only once the group is empty or killed, since a harness can die on SIGTERM and leave a
child that ignores it holding its output, and the worker's drain gives up on that at two seconds: exited then, it left the
child running with nothing to find it by (review, round 1). An ordinary stop left the same child the same way, and takes the
same path now: the worker gives what it signalled five seconds, then kills what is left of the group, and exits only once
the group is empty (review, round 2). What that leaves (`bin/ae-worker.ts`, `test/detached.test.ts`):

- **It is noticed at the worker's next write**: the heartbeat, within five seconds, or sooner at a word written on or an id.
- **A removal in the instant between the worker's look and its rename is undone.** The worker looks for the file, then
  renames its new copy into place, so a file removed in between is written again and the worker runs on as before. The
  window is a few microseconds on each write. Nothing in the runtime removes a run file; a person or a test does.
- **The parent going is not a stop.** The worker is detached to outlive the engine that started it, and an engine restarted
  adopts it by its run file. A test that starts a worker stops it itself: every test root comes from `test/scratch.ts`,
  whose hooks stop what runs in a root and remove it, and `test/leaks.test.ts` runs a failing test file to prove that
  nothing is left.

### 33. A pass reads every task's journal, settled or not (2026-09-25; the pass fixed the same day, two gaps left)

`tick()` (`src/core/engine/engine.ts`) listed every id in the journal and folded each on every pass, twice, so a store's runtime phase
grew with every task ever filed: on this machine's store, 16 MB of journals over 1,167 tasks. **Fixed for an engine's passes
after its first** (`src/core/engine/memo.ts`): an engine keeps a cursor into its own feed and the settled tasks it has folded, and a
pass folds only the tasks not settled, the tasks the feed named since the last pass, and the ones this engine never folded.
A settled task it skips is still let go of its sessions off what the memo kept, and a `measured` that writes goes through
the feed, so the next pass folds it again. `decide` of a settled task is nothing in every journal shape, whatever is appended
after (`src/core/lifecycle.test.ts`), and a check mode in `test/engine.test.ts` folds each skipped task again and fails the pass
on a difference. Over a copy of this machine's store (1,200 tasks) a pass read 27.4 MB before, and 0.08 MB after its first.
What is left:

- **An append that reaches the record and not the feed is missed until the engine restarts.** The files store writes the
  task's file, then the feed's line (`Journal.filesOps`): a process that dies between the two leaves an entry no running
  engine reads, where before the next pass read it. The window is two `appendFileSync` calls. Writing the feed first would
  have a restarted engine read a feed line the record lacks, which is worse. A hand edit of `tasks/*.jsonl` under a running
  `wf up` is the same — one more reason never to make one — and so is a consumer's `StoreOps` whose `feed` drops an
  append, which its doc now forbids.
- ~~**An engine's first pass reads the whole feed**~~ — fixed 2026-10-06: a memo with no cursor keeps nothing to forget, so
  `forgetNamed` asks the feed from past its end, which the files store answers with the end and no line read
  (`test/tick-memo.test.ts`, *a fresh engine on the same store*). The feed had grown to 72 MB on this machine.
- **`wf ls`, `wf decide` and the api's reads still fold every journal they read**: they `view`, not `tick`, and the memo is the
  pass's (agent-orchestrator's features, *What `wf ls` and `/api/runs` still pay*).

### 34. A remote Task answered in the moment before the registry holds it is owned by nobody (2026-09-25; the slow agent fixed in part 2 the same day)

A remote A2A agent's spawn (`src/a2a/remote.ts`, stage 6 part 1) writes its intent to `<root>/remote/<name>.json`, sends
one SendMessage, and writes the Task's id beside the intent when the answer comes back. An answer that never reaches that
write leaves an intent with no Task: the next spawn under the name refuses to send again, in words that are no refusal,
and the grace window reads the attempt `lost`. Nothing is sent twice, which is the rule the registry keeps. But the Task
the agent made runs on, and nothing here knows its id to read it or cancel it. Two things left such an answer:

- **A crash** after the agent made the Task and before the write. Still open.
- **An answer later than `REQUEST_MS` (10 s)** — **fixed in stage 6 part 2.** The send was bounded as every request is,
  since a spawn ran inside the runtime's pass (`case 'spawn'` in `settleTask`), so an agent that works before it answers
  was in doubt on every try, each try's work lost. The send leaves the pass now: the spawn reads the card and the auth,
  writes the intent with `sending: { pid, until }`, and waits `SPAWN_WAIT_MS` (1 s) for the answer; one not come by then is
  left to come within `SEND_MS` (15 minutes), in this process, and written when it does. Until then any process reads the
  entry as a Task `submitted` while its pid lives, so neither the grace window nor `lost` applies. The test that pinned the
  old reading, *at shipped defaults an agent that replies later than 10 s…* in `test/remote-agent.test.ts`, now proves the
  reply ends the session, sent once; *a pass returns while the agent holds the send…* proves another task is served in the
  same pass, and fails (holds for ever) with the send awaited.

- **What is left is the crash, and its window is longer.** A process that dies, or exits (`process.exit` on `wf up`'s stop),
  while a send is under way leaves the intent with a dead pid: in doubt, `lost` past the grace window, never sent twice. The
  window is the whole send now, up to `SEND_MS`, not one request of 10 s; a retry sends again, so the agent may do the work
  twice. A detached sender that outlives the runtime would close it, at the cost of a process, a pid protocol and a way to
  hand it secrets without disk. `process.kill(pid, 0)` can be fooled by a pid reused, which `until` bounds.
- **Not closable from this side.** GetTask needs the Task's id, and ListTasks on an agent others use lists theirs too, with
  no field that says which message a Task was made of. The message's id is on the intent, and an agent that deduplicated
  a SendMessage on its `messageId` would answer a resend with the same Task: then the spawn could send again under the
  recorded id and adopt what comes back. A2A does not require that, and the SDK's server does not do it.
- **A stop of a send another process makes** does nothing here: that process's send is its own. The stop is asked again on
  later passes, and a Task the send brings back is then cancelled; the deadline bounds the rest.

### 35. A failed observe was read as nothing observed (2026-09-25; fixed for the pass the same day; per session for a transcript or an output 2026-10-06, eight gaps left)

The composite's `observeAll` and Claude Code's `observeFor` turned a registry that could not be read into an empty map, and the
pass read an empty map as every expected session gone: the tick memo dropped a settled task from what it looks for, so a `--bg`
release the harness had refused was never asked again; and an attempt past its grace read `LOST`, so one unread pass ended a live
session's attempt `failed`. **Fixed for the pass:** `observeFor` answers an `Observation`, `{ seen, unread }`; a harness that fails
leaves the names routed to it unread, and Claude Code only those the failed read could have listed (its jobs are read apart from
its registry). `decide` reads an unread name as `UNREAD` — nothing in `working`, where the deadline, read first, still ends it; nothing in
`starting`, where it is read before the missing spawn, so an intent a crash left with a session under its name is not spawned twice
(found in review); in `stopping`, nothing until the deadline and then the operator's cut, so a stop is bounded — and `releaseFinished` counts an unread
finished session as listed, so the memo keeps it. Each observe that left something unread is counted (`ObserveCount.unread`, on
`wf up --stats`). The tests are in `test/engine.test.ts` (a refused release asked again after a failed read; no `lost` on one),
`src/core/lifecycle.test.ts`, `test/detached.test.ts`, `test/claude-code.test.ts`, the two A2A files and `test/io.test.ts`.

A `--bg` transcript, and a detached run's output, are read per session (2026-10-06). A transcript line that does not decode
(`lines.ts`), a transcript found and then not read, and a `codex exec --json` line that does not decode (`stream.ts`) leave that
session alone unread while it may still run, its harness's other sessions read beside it, never read as no statement and never
`LOST`; once it has ended, it reads as `failed`, as a refused start does, so its task settles and `stop`, `release` and `forget`
reach it. Why is said as a warning on every look. A `--bg` session has ended when it is listed finished, or working and idle, and
its transcript has been unwritten for the quiet floor (`QUIESCENT_AFTER_MS`), or it is listed finished with no transcript time
(`endedOf`, `harness/claude/bg.ts`); a detached run, once its process is no longer at work (`lookOf`,
`harness/detached/detached.ts`). A failed read is any error the OS gives once the file was found (`EACCES`, `EIO`, or `ENOENT` for
a file gone since), never kept, so the next pass reads the file again (`TranscriptUnread`, `harness/claude/transcript.ts`); a
refused decode is kept while the transcript is unchanged. A session with no transcript at all still reads as none. The tests are
in `test/transcript.test.ts`, `test/completion.test.ts`, `test/claude-code.test.ts` and `test/unread-session.test.ts`.

A failed look's words reach a person (2026-10-06). Claude Code's `observeFor` and the composite's `observeAll` keep what a failed read
said (`Observation.why`) where they dropped it: a registry row of ours that does not decode in `registryOf`'s words for the row and its
field, a harness that fails outright in its failure's message, each after the harness's name. The pass says them on
`TickReport.unobserved`, off its own look, on every report while the failure lasts and on none after; nothing decides on them.
`nemia up` says each once while it lasts, and the board's footer turns the daemon's dot amber, `ticking, harness unread`, the words in
its title. A session alone unread (a transcript, a detached output) is not a failed look: its words stay a warning in the log. The tests
are in `test/claude-code.test.ts`, `test/engine.test.ts` and `test/a2a.test.ts`.
What is left:

- **The full `observe`, and every view, still read a harness that cannot be read as nothing.** A view of a task in flight on a
  harness whose registry times out prints its phase as if the session were not registered; the next read corrects it, and nothing
  is written. `list`, `viewsOf` and `viewOf` catch the failure to an empty map, as before. A `--bg` session whose transcript cannot
  be read, while it has not ended, is left out of that `observe` too (it answers only what the look `seen`), so `ae ls` and a view
  show its task as if its session were not listed, with the warning beside it, until it reads as ended or readable again. Its
  failure's words are dropped there too: only the pass's look says them.
- **A harness never read again holds its tasks in flight until their deadline.** `UNREAD` ends nothing, by design, so a task with
  no deadline on a harness that is gone for good waits for ever, where before it failed `lost` 30 s after its spawn. A person's
  stop on such a task without a deadline waits too. The board shows it working, and the daemon's dot why the harness is not read;
  `wf up --stats` shows the harness's unread count.
- **The deadline ends an unread attempt without stopping what may run under it.** Past its deadline, an attempt whose harness could
  not be read gets `DEADLINE_PASSED` with no sighting, so `live` is false and the edge records the end, `failed`, `deadline`, with no
  `stop`: the session was unread, not gone. A `--bg` session is let go by `release` on the next pass that reads it, since the memo
  keeps an unread finished session looked for; a Claude Code job's `release` does nothing (`harness/claude/code.ts`), so a job past
  its deadline on a pass that could not read it runs on to its own end, in its worktree, after its attempt is recorded ended. This
  predates the change (a failed read was an empty map, and read the same). Neither fix is small: a stop needs the session's id, which
  for a `--bg` session only a read gives, and the composite routes a stop by the owner a read learned, so a stop by name alone would go
  to the fallback harness; and waiting for a read past the deadline takes away the one bound on a harness never read again, which the
  gap above already leaves too wide. Found in review of the run that made a failed observe say so.
- **A busy or blocked `--bg` session whose transcript cannot be read never ends.** `endedOf` (`harness/claude/bg.ts`) ends only a
  session listed finished, or `working` and not busy; one listed `blocked` (waiting on a prompt, or idle under `--remote-control`,
  which lists `blocked`, `idle`, with no `waitingFor`) or busy is unread on every pass while its transcript stays unreadable. Its
  deadline still ends it; with none, its task waits for ever, as on a harness never read again (above).
- **A stop asked while a `--bg` session is unread sends no `claude stop`.** In `stopping`, `UNREAD` does nothing until the deadline
  (`decide`), so the stop waits until the session reads as ended — then `failed`, and released (`claude stop`, `claude rm`) — or
  until the deadline cuts it. A blocked or busy session that stays unread (the gap above) is never stopped, with no deadline.
- **A long-lived session whose transcript stays unreadable is either restarted on and on, or unread for ever.** Nemia's own
  long-lived session (`restartPolicy: 'Always'`) is the one at risk, and which of the two it meets depends on how it lists. Listed
  finished, or `working` and idle, once its transcript has been cold for the floor it reads as `failed`, and `restartOf`
  (`core/domain.ts`) restarts it after the backoff, continuing the same session; if the restarted session's transcript cannot be
  read either — a lasting `EACCES` on the folder, or a line that does not decode carried into the conversation it continues — each
  attempt ends `failed` and is restarted again, the backoff capped at 5 minutes (`RESTART_BACKOFF`), with the warning on every look
  and nothing that settles the task. Idle under `--remote-control` it lists `blocked`, so it never ends (the gap above): unread on
  every pass, never restarted, never settled, and a stop never sent, with no deadline. Before this, either session held every
  background session unread instead. A bound needs a decision: settle a long-lived task whose attempts all end on an unreadable
  transcript, or restart it cold; and whether an unreadable session idle under `--remote-control` counts as ended.
- **A detached capture found and not read is read as nothing said.** `saidAt` (`harness/detached/said.ts`) answers nothing when
  the log stats and its read then fails (`EACCES`, `EIO`), so the run reads as having said nothing rather than unread, as a `--bg`
  transcript now does (`TranscriptUnread`). The end is read off the run file, so this never makes an attempt `LOST`, but its usage
  and statement are missing.
- **`release` still reads a transcript that cannot be read as no usage.** `releaseFrom` (`harness/claude/bg.ts`) reads what a
  session consumed after `claude stop` and answers nothing for any failure, a refused decode or a failed read. The end is on record
  by then, so this never makes a statement absent or an attempt `LOST`, but the end's cost is missing. Retrying the read means
  deciding whether a release whose stop is already done runs again.

### 36. A Codex line that does not decode leaves every Codex session unread, and none of them can be forgotten (2026-10-06, fixed the same day)

A line of `codex exec --json` of a type the runtime reads that `CodexEventSchema` (`harness/codex/stream.ts`) does not decode fails
the Codex harness's whole look, so every Codex session is unread, by design (issue 35), until the run file whose output it is goes.
Nothing makes it go: `ae forget` takes only a settled task, refuses a session its harness could not be read for (`sessionsHeld`,
`service/forget.ts`), and a task with no deadline on that harness never settles — the gap issue 35 names. The one way out today is a
hand removal of the run, which the repository's rules forbid. The same trap was found, and closed, for a session whose start event
does not decode, under every detached harness: unread only while its process runs, then read as failed with no id
(`lookOf`, `harness/detached/detached.ts`), so its harness's other sessions stay read (`test/start-event.test.ts`). **Fixed
2026-10-06:** any other refused output is read the same way — the run that refused unread while its process is at work, failed
once it has ended, its harness's others read, and why said on every look (`lookOf`, `test/unread-session.test.ts`); see the
*Fixed* table.

### 37. What still reads the whole feed, and the feed's size on disk (2026-10-06)

The feed is never rotated but by a forget (`rotateFeed`), so it grows by every line of every task ever filed: 72 MB on this
machine on 2026-10-06, with no sealed file, beside 76 MB of journals over 3,935 tasks. A pass reads none of it but what was
appended since the last (`forgetNamed`, and the orchestrator's `followedFeed`; `agent-orchestrator/src/tick/feed-reads.test.ts`
holds a restarted tick's passes to the same reads over a feed 20,000 lines longer). What still reads it whole, each once a call,
and one of them on a pass:

- **`forget` reads the feed once, in the rotation** (`rotateFeed`), which answers the lines it forgot of each task
  (`ForgottenFeed.linesByTask`); without `yes`, the files store counts them off one read of the raw lines (`feedLines`,
  `feedLinesOf`), no line decoded and no body resolved. It used to decode the whole feed first (`feed(0)`), then rotate it: on a
  fixture, a forget of one task over an 89 MB feed read 178 MB in 591 ms; the same forget over a 16,554-byte feed now reads 16,622
  bytes, where it read 33,176 (`test/forget.test.ts` holds it under one and a half reads). It runs on a pass: the orchestrator's
  `finishForgetting` (`tick/tick.verb.ts`) forgets with `yes` the tasks of a run a person removed (`nemia rm`) once they settled,
  so the pass that finishes a removal still reads and rewrites the feed whole, once; only a feed bounded in size bounds that pass.
- **`sweep` reads the whole feed for the bodies it names** (`feedNaming` in `core/engine/sweep.ts`), as it must before removing one.
- **`ae feed` from the start** (`src/cli/main.ts`), as asked.
- **An engine's first pass folds every journal** (76 MB here): what the memo is made of, paid once per engine, and O(tasks).

The size itself is the lever not taken: a feed rotated on a size or an age, its sealed half kept for a cursor from before, would
keep the disk and those reads bounded. Not changed with the reads, so a store's format stays as it is.

## Verified live, once

- **`--tools` under `--bg`** (engine `060a41d`). `test/live.test.ts` on Claude Code 2.1.270,
  2026-09-13: a session with `tools: Read, Grep, Glob`, told to write a file, wrote none and still gave
  its closeout; the same brief without the list wrote the file. Both ran at `effort: low`, so
  `--effort` is accepted under `--bg`; that it changes anything was not measured.
- **The MCP fence under `--bg`** (engine `945bf46`). `test/live.test.ts` on Claude Code 2.1.270,
  2026-09-13: a session with no `mcp`, in an empty directory, reported no MCP server and no MCP tool,
  and its transcript shows none pending or failed; the control, given one stdio server through
  `mcp`, reported `aeprobe` and `mcp__aeprobe__ping` and nothing else. So `--mcp-config`,
  `--strict-mcp-config` and `--no-chrome` are all taken under `--bg`. Servers connect after a `--bg`
  session starts, so the brief has the session sleep while one is still connecting; the first run did
  not, answered too early in both sessions, and so showed Chrome still connecting under strict.

- **Releasing a settled session** (engine `7200295`). `test/live.test.ts` on Claude Code 2.1.270,
  2026-09-13, `--model haiku`: a session told a word settled and was released in the same pass — gone
  from `claude agents` — and afterwards `ae logs` still read its transcript, and a second task resuming
  its id said the word back and was released in turn. Whether the first was still running when it was
  released, and so whether `claude stop` came before `rm` on a live session, was not recorded.
- **`say` over the session's inbox socket** (engine, the run `the-steering-channel-engine-ff6b`).
  `test/live.test.ts` on Claude Code 2.1.270, 2026-09-14, passed twice by the implementing step: two
  `--bg` sessions at `effort: low` looped on `sleep 10` until a message named a file; `say` sent the
  name to one, which wrote that file and named it in its closeout, and whose journal carried one
  `said` event; the control, never told, wrote nothing and had `said: []`. The second run used the
  stricter transcript check: the words arrived as exactly one `system` event, an attachment line
  (`queued_command`, origin `peer`), while the session worked. Recorded here by the merger from the
  step's closeout: the run's artifacts hold the hand probe (`say-probe.md`, busy and idle sessions, and
  `say-blocked-probe.log`, issue 16), not the live test's own log.

- **A spend cap, and a `--bg` session's cost** (engine `26020c1`, `9d075f7`). `test/live.test.ts` on Claude Code 2.1.272,
  2026-09-15, `--model haiku`, told to read a 2000-line file fifty lines a call. On `claude-detached` at a $0.01 cap, with
  `maxAttempts: 2` and `resume: always`, under the first version, which retried a budget end clean: both attempts ended
  `failed`, reason `budget`, exit 1, at $0.0212 and $0.0154, and the second did not continue the first. Run again under
  the operator's rule that a budget spent is spent (round 2, the same day): one attempt, `failed`, reason `budget`, exit 1,
  $0.0179, and the task settled `failed` with no attempt 2. The same brief as a `claude --bg` session given `--max-budget-usd 0.01` (through
  the Effect door) made 40 tool calls, ended `done` and settled `succeeded`, and its attempt recorded $0.3439, 125.6 s of API
  time and 247 ms of tool time, read once its release had stopped it (issues 17, 18). The first version of this brief —
  read one short file forty times — was declined by haiku as a waste, which Claude Code listed `blocked`.

- **`remoteControl` under `--bg`** (issue 23). `test/live.test.ts` on Claude Code 2.1.274, 2026-09-16, `--model haiku`, no
  tools, run once by the implementing step: a session filed with `remoteControl: true` registered under
  `~/.claude/sessions/` with a `bridgeSessionId` (`session_012gj9r5…`), and an identical session filed without it registered
  with none, looked at again fifteen seconds after both had registered. Both were stopped and removed by the test, and were
  gone from `claude agents` afterwards. Whether the agents view listed the bridged one was not looked at: the registration's
  `bridgeSessionId` is what the 2.1.273 measurement found the view follows.

- **Claude Code as a job** (issue 28, thin runtime stage 2 part 1). `test/live.test.ts`'s M1 to M7 on Claude Code 2.1.280,
  2026-09-23, haiku, each run by the implementing step after the hand measurements. M1: all eight
  mode and flag pairs exited 0 with a result, nothing written outside the folder, one `permission_denied` line for each
  entry of `permission_denials`; `auto` ran as `default`. Under the engine, a job on `claude` at shipped defaults settled
  `succeeded` with `denials` of `Write(<the outside path>)`, `Bash(curl)` and `WebFetch`, and a control asked for nothing
  it may not do settled with none. M3: a job resumed from a `--bg` session remembered its word, under the same id, and
  recorded no cost (issue 4). M2: a job at $0.0438, and the job resumed from it charged $0.0034. M5: a resume capped at
  $0.02, under its session's $0.0473, finished at $0.0032. M4: SIGTERM exit 143, SIGINT exit 0, each resumed and
  remembered its word. M6: one result, `num_turns: 2`, with the word said on stdin while `sleep 20` ran. M7, run
  in round 2: a job denied `Write`, `Bash(curl)` and `WebFetch`, then resumed and told to call nothing, settled `succeeded`
  with no `denials` in the same session, charged $0.0052. The first run
  failed M1's `dontAsk` pair — `--allowedTools` took the prompt given after it for a rule, so the test puts the prompt first
  as the job's spec does — and M4, on a brief haiku did not follow; both passed on the second.
- **A job told on its stdin** (issues 28 and 29, thin runtime stage 2 part 2a). `test/live.test.ts` on Claude Code 2.1.280,
  2026-09-23, haiku. M8 to M10 as issue 28 says, before the harness was changed. Then `say` under the engine, twice: a job
  on `claude`, seen working in its `sleep` loop and told a file's name, wrote that file and closed with its name; the same
  brief never told wrote none and closed with an empty one; the journal has the words once. The first run failed only on the
  transcript: Claude Code writes words a job reads mid-turn as a `queued_command` attachment with no `origin`, which the
  reader dropped, and it reads them as the user's now. The same test on a `--bg` session, run again after it was shared
  with the job's, passed with the words arriving while the session worked, as a `system` event. And, asked in review, the
  live tests that run jobs through the engine, again on the stream-json path (2.1.280, haiku, each run file read after:
  `--input-format stream-json`, no brief in the arguments, its input closed at the result). M1 under the engine: the denied
  job settled `succeeded` with `Write`, `Bash(curl)` and `WebFetch` denied, and the control with none. M2, M3, M5, with
  the brief of each resume on its stdin: a job resumed from a `--bg` session remembered its word and recorded no cost; a
  job at $0.0434 and the job resumed from it charged $0.0033; a resume capped at $0.02 under its session's $0.0467
  finished at $0.0032. M7: a resume of a denied job carried none of its parent's denials, at $0.0041. The $0.01 budget
  test, on `claude-detached`, whose arguments part 2a rebuilt: `failed`, reason `budget`, $0.0184, no attempt 2.
- **A job fenced by its checkout's settings** (issue 28's M11, thin runtime stage 2 part 2). `test/live.test.ts` on Claude Code
  2.1.280, 2026-09-23, haiku, twice by the implementing step: the job exited 0, wrote `BUILT` and not `E2E`, and recorded
  `[{"tool":"Bash","what":"npm"}]`; the `--bg` control wrote `BUILT` and not `E2E`, and records no denials (issue 28). The
  first run failed only on the test's own assertion, which looked for the whole command in a denial that keeps its first word.

## Verified by tests, not by a live run

- **`say`'s refusals and the inbox's guards.** A fake `claude` that keeps a registry, a real Unix socket as
  the inbox, and registration files the test writes, at shipped defaults (`test/say.test.ts`). Every refusal
  is made to refuse with nothing sent or journalled. A test cannot make a file another user's without root, so
  the owner checks are made to refuse by handing them another uid: the registration's through `claudeInbox`, the
  socket's through `inboxSocketRefuses` (the first version tested the socket's only allowing; found in review).
  An inbox that reads the words and never closes its end has been given them at the post's deadline, and says
  so; one that reads nothing, sent a line bigger than a socket's buffer, has not. The `crossSessionInbound` holds (issue 12) and the Windows pipe
  (issue 13) are read off 2.1.270's bundle and docs, not run.
- **A session's conversation as events** (plan §4 S1). The Claude reader was written against the line
  shapes of the 150 transcripts last written on this machine (Claude Code up to 2.1.270), the Codex
  reader against the 34 rollouts here (codex-cli 0.154.0); each is checked on a file the test writes,
  and end to end only with a fake `claude` or `codex`. No board has polled a running session with it
  yet. `codex exec resume` goes on writing its thread's rollout, so a resumed Codex attempt's transcript
  holds its parent's conversation, as Claude Code's does (M13, issue 31). Not measured: any rollout item of a type other than the five read; a Codex thread whose reasoning has a
  summary; and how long a command's item waits to be written, since none of the commands in those
  rollouts ran long.
- **What a poll of a running Claude session costs** (§6 item 17). Measured on this machine's board (2.1.271, 231 rows
  in `claude agents`, 236 tasks): `claude agents --json` took 0.32–0.36 s a call, and so did every `view` — of a settled
  task too — and every `transcript` of an attempt in flight. Now a view of a task with no attempt in flight reads its
  record (0.2 ms), and a `transcript` of one in flight finds its session by name from the session's registration (`find`:
  about 2 ms to find one, 6 ms to find none among 21 files; the whole read, 14 ms, mostly the transcript). A view of an
  attempt in flight, `list`, `say` and a pass still observe, and a view still makes the runner's second pass over every
  idle `ae/` session it lists. A view observes its task's own harness only (§6 item 27): a view of a `check` or a Codex
  task, which cannot `find`, runs no `claude agents` — checked with a fake runner per harness that counts its observes. So a board's open stream on a running step makes one `claude agents` call a second, not
  two. Verified with a fake `claude` that counts its calls and registration files the test writes
  (`test/find.test.ts`): each of the registration read's refusals — a symlink, another user's file, another name, an
  interactive session, a pid other than the file's, an empty or missing session id, a dead process, a pid another
  process has taken — was taken out once, and a test failed. The first version's tests never wrote a symlink or a
  registration without a session id, so two of those passed with the check gone (found in review). The check that a
  file is named for a pid is a shortcut: the pid check refuses what it skips. No board has been measured polling it.

- **Releasing a quiet session, or one a person or a deadline stopped** (engine `c2ebd62`, `9c4221e`). A
  fake `claude` that keeps a registry, at shipped defaults. The live run released a session that had
  given its closeout; none that ended by quiet, and none settled without an end.

- **An unsigned end, and its nudge** (§6 item 18). A fake `claude` that keeps a registry, at shipped defaults
  (`test/unsigned.test.ts`), and `decide` alone; every new guard was taken out once and a test failed. Since stage 4a
  the same fake holds the fact the engine reports instead (`stated: false`, nothing continued), and the judgement and
  the nudge are held in agent-orchestrator (`test/store.test.ts`, *UNSIGNED is the orchestrator's word since stage 4a*). The live test
  that would show how Claude Code itself ends such a session was written and not run (last section).

- **Codex usage** (engine `bb3de3c`). Measured on the `exec --json` streams of seventeen codex-cli
  0.154.0 runs the worker had captured (`~/.agent-workflows/engine/runs/codex`): the sixteen whose
  turn completed each ended in one `turn.completed` carrying `input_tokens`, `cached_input_tokens`,
  `cache_write_input_tokens` (0 in all), `output_tokens` and `reasoning_output_tokens`, with cached
  below input and reasoning below output in every one; every item was a `command_execution`, a
  `file_change` or an `agent_message`. Read back by the reader, all sixteen give their tokens and
  tool calls, and the one cut short gives its tool calls and no tokens. End to end with a fake `codex`
  only: no live attempt has recorded it, and no stream with an MCP call, a resume or a second turn has
  been read.

- **`claude-detached`'s closeout** (engine `3e44ab6`). A fake `claude` on `PATH`, at shipped defaults.
  That `-p --output-format json --json-schema` prints one `result` line whose `structured_output` is
  the answer was seen in one live `claude -p` call (2.1.270, `--model haiku`: `{"ok":true}`), not
  under the engine.

- **`claude-detached` under the MCP fence** (engine `5340772`, `945bf46`). Argv tests only; the live
  run was `--bg`. That `-p` takes `--strict-mcp-config --no-chrome`, and loads a `.mcp.json` named by
  `--mcp-config` under strict, was seen in `claude -p`'s `init` event, with a model name that cannot
  answer — so nothing was spent, and nothing was asked.
- **Codex `mcp_servers`** (engine `5340772`). The override was read back by `codex mcp get --json` as
  exactly the task's arguments — quotes, a backslash, a newline, a non-ASCII character — with
  `headers` as `http_headers`. No `codex exec` has run with one.
- **A task's `url` server under Claude Code.** Only the refusal of one with no `type` rests on a
  measurement (`claude -p` loaded nothing from it); no session has used an http server from `mcp`.
- **Resuming a Codex task** (`f63dc55`). The argument order is checked against Codex's own parser; no
  workflow has resumed a Codex step, so whether exec-level `-C` and `-s` apply to the resumed session
  is unknown.
- **Discarding a statement inherited on resume** (`closedOut` in `agent-runtime/src/core/engine/engine.ts`). In the
  one live resumed step, the session was busy for as long as only its parent's `StructuredOutput` call
  existed, so the busy rule alone explains why it did not settle early.
- **A resumed attempt's own closeout and usage** (engine `00e301b`). A fake `claude` that keeps a
  registry, and a transcript file, at shipped defaults. No live session has been resumed under the fix,
  and the registry listing a session final between two turns was read off the pinned usage, not seen.
- **Codex trust** (`d8cae64`). Only one configuration was shown to let a sandboxed step commit from a
  worktree: repository *and* worktree trusted, with the rule committed in the repository. Whether one
  trust entry is enough was not established.
- **`claude --bg --json-schema`** works on Claude Code 2.1.270 but is documented only for `-p`. A
  future release could change it.
- **Codex `-s read-only` and `-c model_reasoning_effort`** (engine `9d5257d`, `060a41d`). Argv tests
  only. The effort list is what the Codex API named when it refused a bad value for the default model
  on 0.154.0; another model may take fewer.
- **Usage from a transcript** (engine `4db1213`). Counting a response once by its id, and counting
  only from the registry's `startedAt`, were measured on real transcripts, two of them resumed; no live
  attempt has recorded its usage end to end yet.
- **An attempt's cost, and a spend cap** (engine `9d075f7`, `26020c1`). The `cost-state` reading was written against the
  `--bg` transcripts on this machine (2.1.246 to 2.1.272), and is checked on lines shaped as they are — among them one
  session continued twice, with its real totals: $28.3161, $43.0383 and $47.2087 read as its attempts' own $28.3161,
  $14.7222 and $4.1704. The release that reads it is checked with a fake `claude` whose `stop` writes the pair, at shipped
  defaults (`test/release.test.ts`); a `claude -p` stopped at its cap, and the flag reaching both Claude runners on a first
  attempt and a retry, with fake `claude`s (`test/budget.test.ts`). Every new guard and refusal was taken out once, and a
  test failed. Not measured: a `hasUnknownModelCost` of `true` — none of the 400 transcripts last written here has one —
  and a resumed session's cost recorded by the engine end to end.

## Open questions

1. **Quiescence: stalled or done** for a task that asked for a closeout — answered: neither, *unsigned* (bug 1, fixed; the
   last section).
2. **Why a Claude session stays `working` instead of reaching `done`.** Twenty-plus sessions measured:
   not resume, not duration, not the two together. It is the reason the quiescence floor exists.
3. **`wf ls` choices merged as implemented** (`7f07b71`), open to revisit: an extra "waiting on you"
   line for a run with a blocked step; `closeout unreadable` for an answer that cannot be parsed; no
   such line for a cancelled run. The reasons are in `RESPONSE.md` on
   `wf/make-wf-ls-say-how-each-fini-zpp7/respond`.
4. **Should a task be able to ask for Claude in Chrome?** Every Claude Code spawn is `--no-chrome`
   (bug 9): a step cannot drive the operator's signed-in browser. Allowing it would be a field that
   says so, not a default; nothing has asked for one.
5. **hkb migration**: two decisions to make before starting — see
   [hkb-migration.md](hkb-migration.md), "Two consequences to decide on *before* starting".

## Closed since 2026-09-16, kept for their context

Moved out of the open list on 2026-09-28, each as it was written. Issues 19 to 21 moved to agent-orchestrator with admission
(thin runtime stage 4c, 2026-09-25), and what they leave is its to keep; 22 is retired. 24 and 25 were fixed on 2026-09-17,
held by fake registries and transcripts, and what they did not measure stays said under each. 30 was fixed on 2026-09-23, in
review of stage 3, and says how under its heading. 19 to 22, 24 and 25 each have their row in *Fixed*, below.

Since Nemia platform slice 3 (2026-10-04), admission is the runtime's again, and 19 to 22 are its once more, each as it is
said below with `src/core/admission.ts` where it names the orchestrator's `src/cap/cap.ts`: `holdsSlot` and `toAdmit` there,
a harness's `pool` on `Engine.layer` (the orchestrator gives `claude-detached` the pool `claude`), one `maxConcurrent` for
every pool, and `priority` carried again, a whole number in int32, which the orchestrator files as its run's momentum.
`test/admission.test.ts` holds each order and pool with a fixture that breaks it.

### 19. A `blocked` session holds no slot, on reasoning rather than a measurement (moved to the orchestrator)

**Where it is now** (2026-09-25). The runtime keeps no ceiling since thin runtime stage 4c part 2, so it counts no slot:
`tick()` reports `running`, the sessions at work per harness, and a `blocked` one is not among them. The rule moved to
agent-orchestrator in part 1: `holdsSlot` in its `src/cap/cap.ts` counts a session at work, one starting and one
admitted and not yet started, and not one blocked on a person (`needs-human`) or held for an answer. Its
`src/cap/cap.test.ts` (now this package's `test/admission.test.ts`) makes each case happen, a blocked session working
again counted again included.

**What is left, unchanged and now the orchestrator's.** It is reasoning, not a measurement: a session on a permission
prompt makes no API calls, so it costs nothing against the subscription's rate limit, but no blocked session's API
traffic has been watched, and `claude agents` lists a session `blocked` for its own stalls too — a login refresh (issue
16). Blocked sessions that all move again at once can put a pool past its ceiling until enough of them end; nothing is
stopped for it, and nothing more is admitted while the count is at or past the ceiling.

### 20. Pools are declared, and one ceiling fits every pool (moved to the orchestrator)

**Where it is now** (2026-09-25). The runtime counts no pools since stage 4c part 2: `pool` is gone from `HarnessSpec` and
the runner a consumer brings, with `CLAUDE_POOL` and `poolsOf`, and `createEngine` refuses a harness that still names one (exit 2,
naming the harness and where pools live now). agent-orchestrator keeps them as `POOLS` in `src/cap/cap.ts`: `claude` and
`claude-detached` one pool, since they are one subscription; `codex` and `check` each their own; a harness no line names
its own. Its `test/pool.test.ts` proves it at shipped defaults, with fake `claude` and `codex`.

**What is left, now the orchestrator's.**

- **One number for every pool.** `WF_MAX_CONCURRENT` holds Claude Code's pool, Codex's and a `check`'s to the same count,
  though a `check` is a shell command under no rate limit. A number per pool would be a map where the number is; nothing
  has asked for one.
- **A pool is a line in `POOLS`, never discovered.** A harness the orchestrator gains that drives Claude Code is a pool of
  its own until a line says `claude`.

A layer other than the orchestrator that shares one ceiling between harnesses keeps its own list; the runtime starts every
task it is given and admits a queued one on its word.

### 21. A free slot goes to the oldest filing, and the filer's clock says which that is (moved to the orchestrator)

**Where it is now** (2026-09-25). The runtime chooses no order since stage 4c part 2: a pass walks the board in the order
the store lists it and starts every task not queued, and `State` carries `filedAt` for the layer above to read. The rule
moved to agent-orchestrator in part 1: `toAdmit` in its `src/cap/cap.ts` admits momentum first, then the earlier filing,
then the lower id, and its `src/cap/cap.test.ts` (now this package's `test/admission.test.ts`) gives the fixtures in
the opposite order so the tiebreak is proven.

**What is left, now the orchestrator's.** The time is the filer's clock: `file()` stamps `new Date()` in the process that
files, so two processes with skewed clocks filing onto one board are ordered by their clocks — one machine, one clock,
today. A retry is a new task, filed when it is asked for, so it no longer keeps its task's place; momentum puts it before
a newer run's first step. A time that does not parse orders its task last, never refused.

### 22. A task's `priority` is read when a slot is free, and only then (retired)

**Where it is now** (2026-09-25). `priority` is retired: a runtime that keeps no ceiling has no slot for it to choose.
Both doors refuse it at any value, `0` and `undefined` as an own key included (exit 2, naming `queued: true` and `admit`),
and a journal that carries one from before is folded unread; `ae ls` prints no priority. The run's momentum it carried
until stage 4c is agent-orchestrator's `momentumOf` (`src/cap/cap.ts`), read off the run records by the filing rules
(`stepMomentum`, `MOMENTUM` in `src/status/status.ts`). What was left of it — no preemption, no aging — is the orchestrator's now,
and still true there: nothing running is stopped for a waiting task, and a steady stream of runs in flight keeps a new
run's first step waiting for as long as it lasts.

### 24. A session held by its own background shell never ends, and its closeout is never read

**Measured** (2026-09-17, Claude Code 2.1.274, run `the-queue-on-the-board-queue-ppu1`). The implement step signed off with
`StructuredOutput` at 02:53Z, all its work committed. A shell it had started with `run_in_background` —
`until grep -q "Local:" …/lookweb.log; do sleep 0.5; done`, waiting for a dev server it had already stopped — kept looping. The
registration under `~/.claude/sessions/` read `status: shell` from then on, `claude agents` listed the session `busy`, the engine
read the attempt as working, and seventy-seven minutes later nothing had been read. Three Monitor tasks it had armed expired
in the meantime, each waking the session for one turn, which did not change the status. Ending the shell by hand (`kill` on
the bash) let the session go idle within seconds.

**Effect.** A step whose agent leaves a background shell running is never settled: no `unsigned`, no nudge, no check, no
review — the run waits for a person to notice, and the closeout on the transcript is worth nothing until then. A budget does
not help; nothing is spent. Only a `deadlineSeconds` would end it, and no shipped step sets one.

**Fixed** (2026-09-17). The runner's observe reads a busy session as quiet when the last word in its conversation is its
own closeout's tool result and it has not advanced for the quiescence floor (`claudeOps` in `agent-runtime/src/harness/claude/bg.ts`;
`lastWord` from `lastStructuredOutput`). The attempt then ends on that statement and the task settles, and releasing the
session is what ends the shell. Three conditions, each with a test that makes it refuse (`test/completion.test.ts`, at
an injected clock and transcript; `test/shell.test.ts`, end to end with a fake registry and a transcript file):

- **the floor**, so a session mid-turn — which writes nothing for minutes at a time — is not read as quiet;
- **the last word**: a session that has spoken since its closeout is still going. The check is over the last `user` or
  `assistant` line, because Claude Code writes an `attachment` and a `system` line (`turn_duration`) after the closing
  turn's result — measured on the transcript above — and a check over the very last line would never fire;
- **its own**: a resumed session inherits its parent's closing turn, so a continuation that has written nothing of its
  own yet would otherwise be read as finished before it began. Judged against the session's own start in the registry,
  as usage is; no start, no reading.

**What it costs a pass** (found in review, round 1). A busy session now costs its transcript's mtime every pass, and a
read of the transcript once it has been cold for the floor — which every tool call longer than ninety seconds is. That
read is kept while the transcript stays as it found it, by the machinery a finished session's read already used
(`keptRead`, now told by its caller which reads are worth keeping), so such a call costs one read, not one per pass.
Measured on the largest transcript on this machine, 39.5 MB: a read and its scan 174–282 ms, the mtime through the SDK's
`getSessionInfo` 17–60 ms. Keeping it changes no answer — the branch is reached only while nothing has written, which is
the condition under which a second read would say the same thing — and the pin drops the moment the mtime passes it.

**What it rests on**, with issue 13's caveats. `claude agents --json` prints each row's `status` from the session's
registration; 2.1.274's own vocabulary is `busy`, `shell`, `idle`, `waiting`, and its view renders `busy` and `shell`
alike as working. The engine reads only `busy` as busy — `shell` is not a turn, and the ordinary floor already ends such
a session, which `test/shell.test.ts` pins. Which word the measured session was listed under was not recorded: the
person read the view, which shows both as working, and its registration read `shell`. What is certain is that the engine
read it busy, because that is the only gate that fits — its transcript was cold for seventy minutes, `getSessionInfo`
reads that transcript's mtime today, and no end was written. A release that renames the field, or changes the shape of a
closing turn, makes this rule silent again; only `AE_LIVE=1` would notice. The upper layer's courtesy remains a line in
CLAUDE.md: a background loop must time out.

**Not measured.** No live session has been read quiet this way; the rule is held by fake registries and transcript files
only. A session that gives its closeout and then runs a long turn that writes nothing for ninety seconds would be read
as finished — the harness's own `[structured-output-enforce]` retry could be such a turn — and what that costs is the
end being written on a statement the session might have revised, which is the same trade the `busy` rule makes
elsewhere, with the floor and the last word in front of it.

### 25. A session that ends in prose is nudged once for its closeout, and the nudge did not get it

**Measured** (2026-09-17, twice: runs `the-workflow-builder-on-the-4ifo` and `the-web-app-s-components-on-3xq9`, both
`dev-build` implement steps with no `output:` schema). Each finished its work — every commit in, the full check green, a
clean tree — and ended its turn with a prose summary ("The workflow builder is done: …") instead of calling
`StructuredOutput`. The engine ended the attempt `unsigned`, and the step read *waiting on you* in the workflow layer. A
`wf retry --message` saying, in so many words, "you ended in prose instead of calling the StructuredOutput closeout tool;
change nothing; sign off now" made each sign off within thirty seconds, for under a dollar. Whatever the engine's own
unsigned nudge says, it did not get either session to sign off; a person's sentence naming the tool did.

**Effect.** A finished step costs a person's attention and a try to be read as done, on a path that is the common one
for a long implement: the model summarises and stops.

**Fixed** (2026-09-17). The nudge names the tool and says the work stands: *"You ended without calling StructuredOutput,
and this task asks for a closing statement. Change nothing: the work you did stands, and nothing is being asked of it.
Call StructuredOutput now with your closeout. If the work is not finished, finish it first and then call it; if you
cannot finish it, call it anyway, saying what stops you."* (`NUDGE` in `agent-runtime/src/core/domain.ts`). The words are the
fix, so `src/core/decide.test.ts` pins them exactly and `test/unsigned.test.ts` checks what a continued session is actually
told. The tool's name is Claude Code's, and it is the only harness a nudge reaches: `unsigned` needs quiet, and only the
`claude --bg` runner reports it.

**Moved** (stage 4a, 2026-09-23). The engine nudges nothing now: it records an end without its statement as `stated:
false`, and the one nudge per step per round is agent-orchestrator's (`SIGNOFF` in its `brief/brief-sections.ts`, filed by `retriesDue` in `retry/retry.ts`),
which names the tool too. `NUDGE` is gone from `domain.ts`; a journal that recorded a nudge on a `starting` entry still
folds it and spawns with it.

**Not measured.** Whether the wording alone closes the next such session — the two that were measured were closed by a
person. The harness's `[structured-output-enforce]` message, seen on a step with an `output:` schema (run
`the-queue-on-the-board-queue-ppu1`), did get a call; whether a step without a schema is given that enforcement is not
known.

### 30. A cancel before the worker's pid is on disk was answered `CANCELED` and sent nothing (fixed)

A detached run's file is written with `pid: 0` before the worker is spawned, and the worker writes its own pid as it starts
(`src/harness/detached/detached.ts`). `stop` signals only a pid above 0 — `process.kill(0, …)` would signal the runtime's own process
group — so a stop in that window does nothing, and the next pass issues it again. The engine's stop is level-triggered, a
`stop-requested` it reads on every tick, so the engine loses nothing. An A2A client's `cancelTask` is not: the handler
answers `CANCELED` off the listing, which still says `working`, and nothing asks again, so a caller of the agent itself is
told a session stopped that goes on. Nothing in the runtime calls `cancelTask` but the engine's `stop`, under the engine's
re-issuing tick.

**Fixed** (2026-09-23, in review of stage 3). The stop is left on disk before the pid is read: `stop` writes a marker of its own
(`<name>.stop`, so the run file keeps one writer, the worker) and then reads the run file again, signalling the pid it finds
there. The worker looks for the marker once its pid is published and before it starts the harness, and on finding it writes
`stopped` and starts nothing — the worker `spawn` launched, whose run file had no pid, alone: one started again by hand on a
run file its worker left (issue 29) has a pid there already, and was not what an earlier stop was asked of. Whichever of the two came first, one sees the other: a worker that found no marker published
its pid before the marker was written, so the stop's second read finds it. So `CANCELED` is true whenever it is answered, the
engine's stop is heard on its first pass, and nothing waits or is held in memory. `spawn` clears a marker left under the
name, so a run spawned again after a stop starts. Each order is made to happen on demand in `test/detached.test.ts`, the
worker frozen before its first rename: stopped while frozen, the harness never runs; stopped with the marker's write held
until the harness has started, the second read signals it. Each test fails with its half of the fix taken out, and
`test/codex-agent.test.ts` cancels a Task the moment it is sent, which fails every time without the worker's check. A
handler answering `WORKING` until the listing says `stopped`, the other way considered, would have changed every
harness's cancel and still left a direct caller to ask again.

## Fixed

| Symptom | Fix | Commit |
|---|---|---|
| `wf tick` could never reach the quiescence verdict: the clock lived in process memory | the clock reads the transcript's own mtime | engine `3cdfb8f` |
| `ae watch` polled while the layer above used the pushed feed | `ae watch` uses `engine.watch` | engine `60b7aac` |
| the api read a step's session again every second where its harness did not stream, and Codex did not | a Codex session followed live from its stdout and rollout; a remote agent that does not stream read every second at the runtime's edge; the api's beat removed, refused by `apps/api/src/steps/reread.test.ts` | `e4099f6d`, `80352d96`, `a75d25f8` |
| `ae up` exited immediately (an unref'd timer); `resumeFrom` could not be written in a brief | the loop holds the process; `resumeFrom` in briefs | engine `187e20e` |
| completion could only be guessed from outside | a task declares its own end — first a file, now a structured answer | engine `0d2de7d`, `e53f227` |
| a done file travelled down a branch: two steps settled in six seconds having done nothing | marker cleared per attempt, then replaced by a statement made to the harness | engine `dc8d906`, `e53f227`; workflows `a641ad7`, `a6c7b0c` |
| a step revised its verdict after the engine had acted on it | a statement from a busy session is not final | engine `488f3d2` |
| `--add-dir` claimed to let Codex commit; it did not | removed | engine `32b3144` (undoes `e9aab35`) |
| resuming a Codex task never parsed | every flag before `resume` | engine `f63dc55` |
| a Codex review could not commit and stopped two runs | the run commits for the step; a trusted repository's rule lets Codex commit itself | engine `d8cae64`; workflows `0b21509` |
| a mistyped run id printed a raw ENOENT | a sentence | workflows `cc3f209` |
| a run ended by trailing off | `wf decide` | workflows `a819b94` |
| the JSON example in every brief was invalid | fixed, then superseded by the structured answer | workflows `d127fd3` |
| `wf ls` could not show a blocked step | outcome beside phase | workflows `7f07b71` |
| a task the engine forgot read as queued, so a run looked in flight for ever | `unknown`, not `pending` | workflows `0e7b02a` |
| cancel raced a tick; a failed run with work left could still file it | cancellation in its own file, enforced every tick | workflows `f59d95c`, `3eeaf2f` (merged in `e1c9170`) |
| a Codex task that asked for `read-only` ran `workspace-write`; `danger-full-access` did too | each sandbox name emitted as itself | engine `9d5257d`, `310efd3` |
| a brief's typo was a default, and `deadlineSeconds: 5m` stopped its task on the first pass | a closed `BRIEF_KEYS`; every bad key and value refused, exit 2 (a count that overflows to `Infinity` too, found in review) | engine `60c1d01`, `3ca8ac4` |
| an unknown harness ran on the fallback; a bad permission mode failed every tick | `file()` refuses, asking each harness for its own words | engine `310efd3` |
| no way to narrow a session's tools or set its effort, and Claude Code ignores an unknown `--effort` | `tools` and `effort` carried and emitted; a bad effort refused; `--tools` verified live | engine `060a41d` |
| cost and turns had a field no wired runner filled and no record kept | `usage` and `exitCode` on the attempt, `null` when unmeasured | engine `4db1213` |
| a spawn the harness refused rejected the whole tick, stalling every task behind it | a refusal the harness vouches for ends the attempt `unstartable`; any other spawn error is journalled as spawned and left to the grace window, so a session it did start is still adopted (the first version ended every spawn error; found in review) | engine `8a52173`, `0d5c720` |
| a detached harness launched into a missing cwd killed the process that launched it: the child's `error` event went unheard | the cwd is checked first and refused; the child's `error` is heard | engine `0d5c720` |
| a `claude --bg` step loaded the operator's MCP servers — `~/.claude.json`, the claude.ai connectors (mail, calendar, drive) — and Claude in Chrome, beside the checkout's `.mcp.json` | `mcp` carried on the task and refused unless it is `.mcp.json` servers; every Claude Code spawn `--strict-mcp-config --no-chrome`, naming the checkout's `.mcp.json` and the task's map (the Codex half is bug 9) | engine `5340772`, `945bf46` |
| the tests were never typechecked, and a required `watch` on the consumer's store that nothing called hid there | `test/` in the typecheck; the dead method gone | engine `9aaa38b` |
| the README claimed `AE_RUNNER=sdk`, "refuse a tool call: no", 25 tests, a file table 2–3× off, and "three next things" already done (bug 5) | made true; `test/readme.test.ts` refuses each of those classes | engine `f947da4` |
| a step that gave its closeout and was then marked `blocked` never ended: needs-a-person for ever, its run needs-human, its slot held | a closeout made during the attempt, from a session not busy, ends a `blocked` attempt as it ends a `working` one; the busy and inherited-statement rules unchanged, `decide` untouched | engine `9073c18` |
| a relative `cwd` filed through the API failed a detached harness: its worker was launched in `repo`, then launched the harness in `repo` again, from inside it (`spawn sh ENOENT`) | `file()` refuses a `cwd` that is not absolute, naming it resolved; the detached runner resolves the one it is handed, as `claude --bg` always has | engine `7425471` |
| a `claude-detached` task never gave a closeout: its spec dropped `closeoutSchema` | `--json-schema` and `--output-format json`, and the answer read from the result's `structured_output` in the worker's capture, stamped with when that was written. The worker writes a run's end only once the harness's output is in the log: `exit` can come before the pipes drain, and the pass that records the end missed the answer (found writing the test) | engine `3e44ab6` |
| every Codex attempt recorded `usage: null`, though its `exec --json` stream reports tokens | read from the worker's capture of that stream: tool calls by item, tokens from `turn.completed`, each absent when the stream cannot say. `turns` and `toolCalls` may now be absent from any `Usage` — a Codex turn is a prompt, not a model response — and `ae show` names what was not measured | engine `bb3de3c` |
| every `claude --bg` session stayed in `claude agents` after its task settled — one that gave its closeout sat `working/idle` for good, and each run's were cleared by hand | once an attempt's end is on the record, the engine releases its session on every pass that still lists it: `claude stop` if it runs, then `claude rm`, measured live first to leave `ae logs` and `--resume` working. A worktree task's session is only stopped, since `rm` deletes the worktree; `ae logs` finds a released session by its recorded id, through the task's own harness | engine `7200295` |
| a released session that had ended by quiet was removed without a `claude stop` — and a worktree task's was never touched, left `working` for good — because `release` read the runner's translated `done` | `release` stops on the state `claude agents` itself listed (found in review) | engine `c2ebd62` |
| a task stopped by a person or at its deadline settled with no `ended`, so its session's id was never journalled and its session stayed listed | `settled` records the open attempt's session id, read off the sighting as an ending's facts are; such a session is released, and `ae logs` still reads it (found in review) | engine `9c4221e` |
| a task that asked for a closeout settled `succeeded` when its session went quiet without one (bug 1): at shipped defaults, `ended: done`, `reason: harness`, no closeout | the Claude runner reports how long a session has been quiet (`quietMs`), from its last write or its own start; `decide` ends a quiet attempt `done` when no statement was asked for, and `failed`, `unsigned`, when one was and none came — continued with a nudge by the resume policy, and settled `failed` saying so when attempts run out | engine, §6 item 18 (last section) |
| a nudged retry that `--resume`d its session was recorded with no closeout and its first try's usage, to the byte; and a statement given after a `view` had seen the session listed final was never read, until the daemon restarted | the Claude runner keeps a read of a finished session for one attempt — the row's name, its session, the registry's start — and only while the transcript has not been written since | engine `00e301b` |
| no attempt recorded what it cost — `Usage.costUsd` was declared and never filled, and every `wf decide` said "cost not measured" | the Claude runner reads Claude Code's `cost-state`, written as a session's process exits, once its release has stopped the session, and the pass journals it as `measured`; a resumed attempt records its own share, not its session's total; `claude -p`'s `total_cost_usd` goes on its end (issues 4, 18) | engine `9d075f7` |
| nothing could bound what a session spends | `budgetUsd` on the task, `--max-budget-usd` from both Claude runners, and a session `claude -p` ended at its cap recorded `failed`, reason `budget`, its task settled `failed` with no further attempt (the operator's call, round 2); refused on `claude`, whose `--bg` sessions keep no cap (issue 17), and on `codex` | engine `26020c1`, round 2 |
| a `view` of a task whose harness cannot `find` — a `check`, a Codex step — or of any attempt in flight observed every harness, so each read of one cost a `claude agents` call and a Codex listing (§6 item 27, E7's last review) | a view observes its task's own harness, the one `harnessOf` names for `logs` and `transcript`, and the fallback's for a harness the engine no longer has | engine, §6 item 27 |
| a session waiting on a permission prompt held a concurrency slot until a person answered or its deadline came, though it makes no API calls | the ceiling counts sessions observed `working`; `LIVE`, which still has `blocked`, keeps what else it guards (issue 19) | engine, 2026-09-16 |
| two `claude` and two `claude-detached` sessions ran at a ceiling of 2 — four Claude Code sessions on one subscription, counted as two pools | a harness declares the pool it is counted in, its own name by default; `'claude-bg'` and the engine's `claudeDetached` are both counted in `claude`, with no caller saying so (issue 20) | engine, 2026-09-16 |
| the runtime's ceiling, pools and `priority` were a second admission beneath the orchestrator's, lifted with `maxConcurrent: Infinity` so it never bound, and `ae` kept its own | retired from the runtime: `decide` has no ceiling branch, a pass starts every task not queued and reports `running` per harness, and `priority`, `maxConcurrent`, a harness's `pool`, an argument to `tick()` and `AE_MAX_CONCURRENT` are each refused, exit 2; `queued: true` is a brief key, so `ae` can hold a task back (issues 19–22) | runtime, 2026-09-25 (stage 4c part 2) |
| the nudge sent to a session that ended in prose asked for "your closing statement" and named no tool: twice it got no sign-off, and a person's sentence naming `StructuredOutput` got one in thirty seconds | the nudge names the tool and says the work stands, with its words pinned by a test (issue 25) | engine, 2026-09-17 |
| a session held busy by a background shell it left running was never read: its closeout sat unread for seventy-seven minutes, and only a person killing the shell let the run go on | a busy session whose own closeout is the last word in its conversation, and whose transcript has been cold for the quiescence floor, is read as quiet: the attempt ends on that statement (issue 24) | engine, 2026-09-17 |
| a continuation (`resumeFrom`) whose first spawn the harness refused, `unstartable`, started its next attempt cold, without the session it was filed to continue — with `maxAttempts` above 1 (issue 5) | `resumeTarget` continues the task's `resumeFrom` while every attempt so far ended `unstartable`; an attempt that ran — spawned, or adopted after a crash with no spawn on the record — is judged by the `resume` policy as before (the first version keyed on `spawnedAt`, and an adoption has none; found in review) | engine, 2026-09-22 |
| with one attempt per start, the runtime continues no attempt, so issue 5's case — an `unstartable` continuation — would start its next try cold | the orchestrator's `continuesFrom` hands a `--nudge` try, a round or a `resume:` step the last attempt's session, or, where the harness never named that one — it could not start, or was lost — the `resumeFrom` it was started with; for a held task's later turn, the session that signed the turn before (`test/run.test.ts`, `test/store.test.ts`, `test/held.test.ts`) | orchestrator, 2026-09-23 (stage 4a part 2) |
| a check that exited 0 at 607 s of a 600 s deadline settled `failed`, `deadline exceeded`: the pass that recorded its `done` end read it again past the deadline, and the deadline settled first | an end on record is judged by that end; past the deadline, `decide` still stops a live session, cuts an open attempt, settles one the deadline cut, and starts no other attempt | engine, 2026-09-24 |
| a Codex line that does not decode left every Codex session unread until its run went, and none could be forgotten (issue 36); a `--bg` transcript that could not be read did the same to every background session (issue 35) | the session whose output or transcript cannot be read is unread alone while it may still run, its harness's others read; once ended it reads `failed`, as a refused start does, why said on every look, so its task settles and `stop`, `release` and `forget` reach it | runtime, 2026-10-06 |
| a pass read every idle or blocked `--bg` session's transcript whole twice, for its closeout and for its usage, though nothing had written it: 3.07 MB a pass from 15 sessions on this machine (issue 38) | a closeout and a usage read are kept by the transcript's mtime in every state, and one read a look serves both; the mtime is a stat (`transcriptWrittenAt`), not the SDK's `getSessionInfo`. On a 2,010,438-byte transcript (`test/transcript.test.ts`), a look read 4,020,876 bytes before and 2,010,438 after, five looks with nothing written 20,104,810 before and 430 after, the SDK's head and tail reads (64 KiB each, 128 KiB a look) uncounted before. An idle session's mtime moves with no byte written: an interactive one (2.1.290, idle) had its transcript's mtime set 60 min 26 s after the last, its size unchanged, so a kept read is read again on such a touch | runtime, 2026-10-06 |

## A closeout given ten seconds before the session ended was not read (2026-09-13, fixed in engine `00e301b`)

Task `let-a-step-say-which-tools-i-v27t-implement`, session `b948c622…`: one `StructuredOutput` at
22:54:01.237Z; the engine journaled `ended` at 22:54:11.057Z, `done`, with usage and no closeout, so the
step read `unsigned`. The nudged retry (`…-try2`) `--resume`d the same id, gave a second
`StructuredOutput` at 22:58:32Z, and its `ended` carried no closeout and usage identical to the first's
(turns 29, tool calls 93, the same tokens). Only a daemon restart and a third try made it read.

**What the code allowed.** `finalStatements` and `finalUsage` in `harness/claude/bg.ts` were keyed by session id,
set on the first sighting the registry listed `done`, `failed` or `stopped` (and not busy), and never
cleared. A resume keeps the id, so try 2 was handed try 1's pins: a statement of `undefined`, and try
1's usage.

**Why try 1's pin was `undefined`.** The pinned usage dates the read. Counted from the attempt's start,
the transcript reaches 29 responses and 93 tool calls at 22:53:25.947Z, and the 30th response lands at
22:53:50.451Z. The pin was taken in that window, at least ten seconds before the statement. At
22:53:20Z a background task's notification was queued; at 22:53:25.98Z a turn's last tool result was
written and the queue drained into a silent turn. A registry that listed the session final between
those two turns explains the pin. No `ended` was written then, so no tick saw that state. But `wf up`
calls `engine.view` several times a pass (`agent-orchestrator/src/runner.ts`), and each `view` observes,
and so pinned, without stepping. The login-refresh block and the Remote Control bridge ended at
22:47:40Z, when the cross-session message arrived, and nothing after that needs them. What
`claude agents` listed at 22:53:2x was not recorded: this is the reading the evidence allows, not a
measurement.

**Fix** (engine `00e301b`). A read of a finished session is kept for one attempt — the row's name, its
session, and the registry's `startedAt` — and only while the transcript's mtime is older than the read
by more than a second, so it is taken again once the transcript grows. That holds for a statement that
was found as well as one that was not. Reads for rows no longer listed are dropped. At shipped defaults,
with a fake `claude` and a transcript file, `test/resume.test.ts` refuses both failures; run against the
runner before the fix, its tests fail.

**Checked and left.** The `transcripts` path cache is keyed by session id too. Of the 24 journalled
resumes, 21 ran in a different working directory from the session they continued. The one of those
that kept its id (`9ea123ff…`, implement → respond) went on writing the original project's transcript,
and no id has two transcripts among the 432 project directories. So a resume does not move the file
the cache names.

## Quiet without a closeout (bug 1, fixed 2026-09-14, plan §6 item 18)

**Measured first.** At shipped defaults — `createEngine()`, a fake `claude` listing the session `working` and idle, and a
transcript whose last line was the session's own words, quiet for ten minutes — a task with a `closeoutSchema` whose
session gave no `StructuredOutput` was recorded `ended: done`, `reason: harness`, and settled `succeeded` with no
closeout. A transcript whose only statement was its parent's, made before the attempt began, did the same: the engine
dropped the inherited statement, and the runner's `done` settled the task anyway.

**On the record.** Of the 236 tasks in `~/.agent-workflows/engine`, 144 were Claude Code tasks with a schema, whose
attempts ended `done` 142 times; 2 of those had no closeout, and both were the read fixed in `00e301b` — their
transcripts held statements. No session on this machine is known to have gone quiet with nothing said, so the fix is
sized to the quiet rule and no further.

**What changed.** The Claude runner reports `quietMs` and never turns quiet into `done`. `decide` ends a quiet attempt
`done` when no statement was asked for, and `failed` with reason `unsigned` when one was and none came. An unsigned
attempt is continued under `interrupted` and `always`: its session is stopped if it still runs, then `--resume`d and
told a nudge instead of the brief, journalled on `starting`. Out of attempts, the task settles `failed` with a note that
says so. Quiet is counted from the later of the last write and the session's own start, so a continuation over a cold
transcript does not end as it begins. `decide` grew by a dozen lines and reads no tools, usage or exit codes (the source
test holds).

**What it changes in agent-orchestrator, left to that package.** This fix stayed in the engine. agent-orchestrator files one
attempt unless a step says otherwise, so a step that goes quiet without its closeout now reads `failed` where it read
`unsigned`. Both are final, and `wf decide` offers a nudge and a fresh try for either. They are not the same status,
though, and four things change with the word (`agent-orchestrator/src/run.ts` as of `08bef91`, found in review):

- the run's outcome is `failed`, not `blocked`: a failed step outranks an unsigned one (`run.ts:1625`);
- the step drops out of `wf ls`'s "waiting on you", which names `unsigned` and not `failed` (`run.ts:1726`);
- a nudged retry is told "The last try's session ended `failed` before it signed off" (`run.ts:1919`), not that it
  gave no closeout, which is what it has to fix;
- the `stepStatus` comment that says the engine settles such a session `succeeded` (`run.ts:345`) is no longer true.

The engine records the difference: the attempt's `reason` is `unsigned`. If `stepStatus` read a failed task whose last
attempt ended `unsigned` as `unsigned`, all four would stay as they were. → agent-orchestrator, small; the plan's queue
should carry it.

**Not measured.** How Claude Code itself ends a `--bg` session whose turn ends without the call. 2.1.271's bundle has a
count of structured-output retries (`MAX_STRUCTURED_OUTPUT_RETRIES`) and an error for running out of them. If the harness
nudged such a session and then listed it `done` with nothing said, the engine would still record `succeeded`: a second
door to this bug, through `state: done` rather than quiet. `test/live.test.ts` fails on exactly that, and was written
and not run (`AE_LIVE` was not set). And a transcript with no user line gives no `lastModified` through the SDK's
`getSessionInfo`, so its session is never measured quiet and ends only at its deadline: found writing the test, whose
first fixture had no prompt line. Every `--bg` transcript seen starts with its prompt.

**The second door, closed (2026-09-19, P0.5).** It was not hypothetical. Of the 344 tasks filed with a schema in this
machine's store on 2026-09-19, 5 had a last end journalled `observed: done`, `reason: harness`, no closeout, and settled
`succeeded` (implement steps of four runs, among them `the-web-app-s-components-on-3xq9` and
`the-workflow-builder-on-the-4ifo`). `decide` now reads a `done` sighting with no statement, on a task that asked for one,
as it reads quiet: `unsigned`, recorded `failed`. One condition, in `decide` (`src/core/decide.test.ts`, and a fake `claude`
listing the session `done` in `test/unsigned.test.ts`; both fail with it reverted). A journal written before keeps what
it recorded. The out-of-attempts note now says *ended without*, not *went quiet without*, since quiet is one door of two. The nudge before a person is agent-orchestrator', not the
engine's: the run continues an unsigned session once a round (`signoff`, agent-orchestrator's features.md, P0.5), and the engine's
own allowance stays `maxAttempts`, which agent-orchestrator leaves at 1.

**The judgement, moved up (stage 4a, 2026-09-23).** Both doors now end the attempt as its harness ended it — `done`,
reason `harness` — with `stated: false` beside it, written on every end read off a sighting of a task that asked for a
statement (`true` when one came). The engine settles such a task `succeeded`, continues nothing and nudges nothing, whatever
attempts it has left. agent-orchestrator reads `stated: false` as `unsigned` (`closeoutAsked` in its `views/views.verb.ts`,
`endWords` in its `views/views-words.ts`), and files its sign-off nudge on it; `wf` and the board say what they said.
An end with no `stated` key — any journal written before — is not read as unsigned, and an old end the engine judged `unsigned` settles
`failed` with its note, never continued. `maxAttempts:` and `resume:` stay on the task for `lost` and for a person's `always`;
retiring them is part 2 of stage 4a.

**One attempt per start (stage 4a part 2, 2026-09-23).** Retired: `decide` starts one attempt at a task, and any end but
`done` — failed, lost, unstartable, budget, deadline — settles it `failed`, noting the attempts (`1 attempt, none
succeeded`; `… of turn N` on a held-open task's later turn). A held turn that fails, is lost or cannot start is not tried
again inside the task either. `file()` and `ae start` refuse `maxAttempts` and `resume` at any value, the sentence naming
`resumeFrom`, `retries:` and `wf retry` (`retiredKeyRefusal`, `test/refusal.test.ts`); a journal filed with them still
folds, and one holding several attempts reads as it did. Trying again is the orchestrator's: `retries:` after a check
refuses a step, `wf retry` for a try that failed, was lost or could not start, each a new `-tryN` task. Issue 5's case moved
with it: the orchestrator's `continuesFrom` (`agent-orchestrator/src/retry/retry-ask.ts`) continues the `resumeFrom` of an attempt
its harness never named — one that could not start, or was lost — since the runtime no longer does. A held turn's
`-tryN` is proven in `agent-orchestrator/test/held.test.ts`, one test for each of the three ends.

**Ends that carried neither statement nor reason, closed (2026-09-19, P0.5).** Every ended attempt now carries the agent's
statement or the machine's reason (README, *Every ended attempt carries its statement or the reason it has none*). Measured
over this machine's store that day: of 511 settled tasks, 4 settled with their last attempt still open — all `stopped`,
note `operator`, all on tasks with a schema — so no `ended`, no reason, and a statement given before the stop, had there
been one, dropped. A deadline did the same (none on the record). `decide` now ends such an attempt `operator` (recorded
`stopped`) or `deadline` (recorded `failed`) before its task settles, or as its harness ended it if it had, statement
untouched. The contract test in `src/core/decide.test.ts` walks every sighting × schema × statement × budget × cut to its
settle; it found a third: an attempt cut at its budget and listed `done` (or quiet) was recorded `done`, reason `budget`,
and settled `succeeded`. None of the 507 ends on the record is `budget`, so it was not seen live; it is `failed` now.
Each of the three fails the contract test when reverted. agent-orchestrator reads a check ended `deadline` or `operator` as
`unfinished` whatever exit code its end carries, as it read one left open.

## A holder's served port carries no retry and refuses no protocol version

The port a holder serves (`src/a2a/listener.ts`) answers an `A2A-Version` header it does not read: `validateVersion` is exported by
`@a2a-js/sdk/server` and never called on the JSON-RPC road, and `ServerCallContext.requestedVersion` defaults to `'0.3'`, so a client
asking for a version the card does not declare is served all the same. And a viewer's dropped follow ends rather than subscribing again
(`src/a2a/holder-follow.ts`): a reader asks again from the cursor it holds, where a remote agent's follow resubscribes
(`remote-follow.ts`). Neither is wrong today — the port is reached over loopback by a process the layer above handed the token to — and
both wait for the slice that needs them.

## `file()` refuses a long-lived Claude Code task's `env`, though an attached session would take it

A task filed on the `claude` harness with `restartPolicy: 'Always'` and `config.background: true` is refused its `config.env`, in
words saying the session "runs in a pre-spawned process and ignores its asker's environment" (`fileRefusal`). True of a `--bg`
session, and not of the same task while a holder holds: it runs attached on the Agent SDK, which lays the env in the child it
spawns (`attachedLongLived`, `harness/claude/code.ts`). The refusal is read at filing, where nothing knows whether a holder will
be there when the pass spawns it — so it refuses the wider case. Met while writing `test/holder-follow.boundary.test.ts`, which
files its session as a job instead, which runs attached just the same. Nothing is wrong on the record: no caller is given a session
without the env it asked for.
