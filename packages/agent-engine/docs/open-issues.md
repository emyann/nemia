# Open issues: agent-engine and agent-workflows

What is still wrong, what is only half-verified, and what is waiting on a decision — written down so
it can be picked up later without reconstructing it from commit history. The last section is a
record of what was fixed, with commits, so the open items have their context. A fixed item leaves
its number behind rather than renumbering the rest, so "bug 9" means the same thing everywhere.

State as of 2026-09-16: agent-engine after the hold-the-bar engine work (repository
`docs/plan-hold-the-bar.md` §4 B and E4), bugs 3, 4, 7 and issue 10 (engine `7200295`), a
session's conversation read as events (§4 S1), and `say`, a person's words into a running session on the
record (§6 item 3, the engine half), `find`, one session by its name without `claude agents` (§6 item 17), and
bug 1, a quiet session with no closeout recorded a success (§6 item 18), and what a session cost, read from its harness,
with a spend cap on the task (engine `9d075f7`, `26020c1`), and three small items: a view that observes its task's own
harness (§6 item 27), a `blocked` session that holds no slot (issue 19), and pools by subscription (issue 20);
agent-workflows `0e7b02a`.

## Bugs

### 2. `advance` hands off only steps that succeeded

**Where.** `agent-workflows/src/runner.ts:318` commits a finished step's leftover work only when its
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

### 4. `claude-detached` measures its cost, and no turns, tokens or tool calls

`agent-engine/src/runner-detached.ts`. Its closeout is read (engine `3e44ab6`), and so are its cost and API time,
`total_cost_usd` and `duration_api_ms` (engine `9d075f7`), from the one `result` object `claude -p --output-format json`
prints. Its turns, tokens and tool calls are not. The object carries `num_turns` and a `usage`, but on 2.1.272 that `usage`
counted 0 input and 0 output tokens in a run whose `modelUsage` counted thousands, so neither is read until what each counts
is measured; it has no count of tool calls, and no tool time. Low priority: this harness exists for comparison — and, since
only `claude -p` keeps a spend cap (issue 17), for a task that must not spend past one.

### 5. An unstartable first attempt of a continuation retries cold

**Where.** `resumeTarget` in `agent-engine/src/domain.ts` continues a task's `resumeFrom` only when
there is no previous attempt.

**Effect.** A task filed against a session, with `maxAttempts` above 1, whose first spawn the harness
refuses (`reason: 'unstartable'`) starts its second attempt cold, without the session it was meant to
continue. With `maxAttempts: 1` — the default, and what agent-workflows files unless a step says
otherwise — it cannot happen.

**Fix.** `resumeTarget` continues `state.resumeFrom` while no attempt has spawned. That is a change to
`decide`, so it was left when the unstartable ending went in (engine `8a52173`).

### 6. The Effect door's `file` refuses nothing

**Where.** `file` in `agent-engine/src/engine.ts` journals what it is given. The refusals live in
`createEngine().file()` (`refusalOf` in `agent-engine/src/facade.ts`), because that is where the
configured harnesses, and so their words, are known.

**Effect.** A consumer of `agent-engine/effect` can still journal `deadlineSeconds: NaN`, which stops
the task on its first pass, or a permission mode its harness rejects, which now waits out the grace
window and ends the attempt `lost` rather than stalling the tick.

**Fix.** The harness-agnostic half of `refusalOf` can move under the Effect `file` as it is. The
vocabulary half needs the runner to answer, and `RunnerOps` has no verb for that — the four it
requires are the line that type holds — so it would be a value passed to `file`, not another verb.

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
(`claudeResultOutput` in `agent-engine/src/runner-detached.ts`). Low priority, like issue 4: this
harness exists for comparison. For the same reason `say` refuses its tasks, though `claude -p` binds an inbox.

### 12. `said` means the words were handed to the inbox, not that the session read them

**Where.** `claudeOps.say` in `agent-engine/src/runner.ts`: a line posted to the session's inbox socket, which
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
or its going busy, still reads it quiet and ends the attempt — `done`, or `unsigned` for a task that asked for a
statement — and releases the session with the words unread. The window is that one moment against a pass every few
seconds; it was not measured. `find` changes nothing here: `say` needs the session's state and its process, and still
observes.

### 15. Words delivered and not journalled, if the process dies between the two

`Engine.say` delivers, then appends `said`. A process killed in between has handed a session words with no
trace, which is the failure `say` exists to prevent; the window is one append long. A journal that rejects the
append is reported (`was given the words, but they could not be journalled`), so only a crash is silent. The
other order was refused because it would record words that may never have arrived.

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

**Effect.** `file()` refuses `budgetUsd` on `claude` (engine `26020c1`), so nothing bounds what a `--bg` session spends — and
`claude` is the harness agent-workflows runs its steps on. A task can have a cap only on `claude-detached`, which gives up
what `-p` lacks: `say`, and following the conversation while it runs (issue 11).

**Why the engine does not keep it instead.** A `--bg` session's cost is written only as its process exits (issue 18), so no
read of a running session says what it has spent. Pricing its transcript's tokens here would be a price list of the
engine's, not the harness's figure, and wrong the day a price changes. An engine-kept cap needs Claude Code to say what a
running session has spent — in `claude agents`, its registration file, or a `cost-state` per turn — and 2.1.272 says it in
none of them.

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
- **An attempt in flight has no cost** in `view` or `ae ls`: nothing has been written yet.
- **The resumed reading rests on one shape**: a continuation writes into the same transcript, after its parent's pair, under
  its parent's `startTime` (one session continued twice, 2026-09-15). Its cost is its total less its parent's. No resumed
  session has been measured end to end under the engine.

### 19. A `blocked` session holds no slot, on reasoning rather than a measurement

**What changed** (2026-09-16). The ceiling counts the sessions a pass observes `working`, and a `blocked` one is not
counted (`AT_WORK` in `agent-engine/src/engine.ts`). It used to count `LIVE` — `working` and `blocked` — so a session
waiting on a permission prompt kept the tasks behind it queued for as long as nobody answered, and only its deadline
freed the slot. `LIVE` still says what the engine waits on: `decide` reads a blocked session as running, and a closing
statement ends a blocked attempt as it ends a working one (`closedOut`).

**Why.** The ceiling exists for the subscription's rate limit, and a session on a permission prompt makes no API calls, so
it costs nothing against that limit. Reasoning, not a measurement: no blocked session's API traffic has been watched, and
`claude agents` lists a session `blocked` for its own stalls too — a login refresh (issue 16) — whose calls are not known
either.

**What it costs.** A blocked session that moves again is counted again on the next pass, level-triggered, and nothing is
stopped for it. A board at a ceiling of 2 whose two sessions block admits two more, and if both move again, four run until
two end: nothing more is admitted while the count is at or past the ceiling. `test/engine.test.ts` makes each case happen
at the shipped counting: two blocked at a ceiling of two and a third task starts; two working and it does not; a blocked
session working again fills the slot another's end freed, and blocking again gives it back.

### 20. Pools are declared, and one ceiling fits every pool

**What changed** (2026-09-16). The ceiling is counted per pool, not per harness. A harness declares the pool it is counted
in — `pool` on a `HarnessSpec` or a `PromiseRunner` — and is a pool of its own, under the name it is configured under, when
it declares none. `'claude-bg'` is counted in `claude` (`CLAUDE_POOL` in `agent-engine/src/runner.ts`), and so is the
engine's `claudeDetached`, which names that pool, so no caller has to: agent-workflows passes the engine's harnesses and a
`check`, and names none. Before, both ran Claude Code on one subscription and were counted apart, so a ceiling of 2 let
four Claude Code sessions run. `test/pool.test.ts`, with fake `claude` and `codex`, at `createEngine()`'s own harnesses and
at agent-workflows' map: a `claude-detached` session counts against `claude`'s ceiling, and `codex` and a `check` keep
their own.

**What is left.**

- **One number for every pool.** `maxConcurrent` holds Claude Code's pool, Codex's and a `check`'s to the same count,
  though a `check` is a shell command under no rate limit: agent-workflows' suites queue behind the number its sessions
  do. A number per pool would be a map where the number is; nothing has asked for one.
- **A pool is declared, never discovered.** A `PromiseRunner`, or an Effect-door `sdkRunner`, that drives Claude Code is a
  pool of its own unless it says `claude`.
- **A task whose harness the engine no longer has** runs on the fallback (`harnessOf`, `composite`) but is counted under
  the name it was filed with, a pool of its own: a pass reads pools by harness name and knows no fallback. Only a board
  whose harness map lost a harness with tasks still on it has one.
- **The Effect door** counts per harness unless its caller passes `tick` the pools: it has no harness configs to read
  them from. `createEngine` passes them.

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
  yet. Not measured: whether `codex exec resume` goes on writing its thread's rollout or starts another
  — so whether a resumed Codex attempt's transcript holds its parent's conversation, as Claude Code's
  does; any rollout item of a type other than the five read; a Codex thread whose reasoning has a
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
  (`test/unsigned.test.ts`), and `decide` alone; every new guard was taken out once and a test failed. The live test
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
- **Discarding a statement inherited on resume** (`closedOut` in `agent-engine/src/engine.ts`). In the
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

## Fixed

| Symptom | Fix | Commit |
|---|---|---|
| `wf tick` could never reach the quiescence verdict: the clock lived in process memory | the clock reads the transcript's own mtime | engine `3cdfb8f` |
| `ae watch` polled while the layer above used the pushed feed | `ae watch` uses `engine.watch` | engine `60b7aac` |
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
| the tests were never typechecked, and a required `PromiseJournal.watch` that nothing called hid there | `test/` in the typecheck; the dead method gone | engine `9aaa38b` |
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

## A closeout given ten seconds before the session ended was not read (2026-09-13, fixed in engine `00e301b`)

Task `let-a-step-say-which-tools-i-v27t-implement`, session `b948c622…`: one `StructuredOutput` at
22:54:01.237Z; the engine journaled `ended` at 22:54:11.057Z, `done`, with usage and no closeout, so the
step read `unsigned`. The nudged retry (`…-try2`) `--resume`d the same id, gave a second
`StructuredOutput` at 22:58:32Z, and its `ended` carried no closeout and usage identical to the first's
(turns 29, tool calls 93, the same tokens). Only a daemon restart and a third try made it read.

**What the code allowed.** `finalStatements` and `finalUsage` in `runner.ts` were keyed by session id,
set on the first sighting the registry listed `done`, `failed` or `stopped` (and not busy), and never
cleared. A resume keeps the id, so try 2 was handed try 1's pins: a statement of `undefined`, and try
1's usage.

**Why try 1's pin was `undefined`.** The pinned usage dates the read. Counted from the attempt's start,
the transcript reaches 29 responses and 93 tool calls at 22:53:25.947Z, and the 30th response lands at
22:53:50.451Z. The pin was taken in that window, at least ten seconds before the statement. At
22:53:20Z a background task's notification was queued; at 22:53:25.98Z a turn's last tool result was
written and the queue drained into a silent turn. A registry that listed the session final between
those two turns explains the pin. No `ended` was written then, so no tick saw that state. But `wf up`
calls `engine.view` several times a pass (`agent-workflows/src/runner.ts`), and each `view` observes,
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

**What it changes in agent-workflows, left to that package.** This fix stayed in the engine. agent-workflows files one
attempt unless a step says otherwise, so a step that goes quiet without its closeout now reads `failed` where it read
`unsigned`. Both are final, and `wf decide` offers a nudge and a fresh try for either. They are not the same status,
though, and four things change with the word (`agent-workflows/src/run.ts` as of `08bef91`, found in review):

- the run's outcome is `failed`, not `blocked`: a failed step outranks an unsigned one (`run.ts:1625`);
- the step drops out of `wf ls`'s "waiting on you", which names `unsigned` and not `failed` (`run.ts:1726`);
- a nudged retry is told "The last try's session ended `failed` before it signed off" (`run.ts:1919`), not that it
  gave no closeout, which is what it has to fix;
- the `stepStatus` comment that says the engine settles such a session `succeeded` (`run.ts:345`) is no longer true.

The engine records the difference: the attempt's `reason` is `unsigned`. If `stepStatus` read a failed task whose last
attempt ended `unsigned` as `unsigned`, all four would stay as they were. → agent-workflows, small; the plan's queue
should carry it.

**Not measured.** How Claude Code itself ends a `--bg` session whose turn ends without the call. 2.1.271's bundle has a
count of structured-output retries (`MAX_STRUCTURED_OUTPUT_RETRIES`) and an error for running out of them. If the harness
nudged such a session and then listed it `done` with nothing said, the engine would still record `succeeded`: a second
door to this bug, through `state: done` rather than quiet. `test/live.test.ts` fails on exactly that, and was written
and not run (`AE_LIVE` was not set). And a transcript with no user line gives no `lastModified` through the SDK's
`getSessionInfo`, so its session is never measured quiet and ends only at its deadline: found writing the test, whose
first fixture had no prompt line. Every `--bg` transcript seen starts with its prompt.
