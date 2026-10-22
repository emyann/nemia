# packages/agent-runtime — `ae`

Agent sessions on one harness each, durably: a job that runs to its end, and a long-lived session that runs until stopped
(`restartPolicy: 'Always'` with `background: true`, README *A long-lived session*). It owns how a session runs: the task's command,
mounts, restart and spend, the journal, the attempts, the harnesses' vocabulary. `decide` (`src/core/domain.ts`) is the whole judgement,
pure (`test/engine.test.ts`); `src/index.ts` and `src/vocabulary.ts` are the only doors, with `src/testing.ts` for tests (`test/contract.test.ts`); the second, the
harnesses' words, `HARNESS_CHOICES`, `fenceReach`, `unruledIn` and `configFolderIn`, loads no Effect and no I/O
(`test/vocabulary-door.test.ts`). The orchestrator reaches it through its one client; what is still above it and a candidate to come
down is in `docs/architecture.md`, *Who owns what*.

## The pass

- **The pass skips a settled task until the feed names it**, so every write to a journal goes through `Journal.append`. The engine's own
  tick tests run `tickMemoLayer({ verify: true })`, which fails a pass that skipped a change.
- **The engine decides a task again in the pass that recorded its end**: a rule that stops or refuses (a deadline) never overrules an end
  on record. Test it with the end and the rule in one pass.
- **An absence read off a failed look is not an absence**: `observeFor` answers `{ seen, unread }`, and an unread name is neither there
  nor gone (`UNREAD`). A new harness says which names a failed read left unread.
- **XState's `transition` answers an event with no edge by staying**: `moveOn` asks `snapshot.can(event)` first and refuses.
- **A sighting speaks A2A's names; a harness's rows and the journal keep their own** (`claudeStateOf`, `detachedStateOf` translate at the
  edge; `decide-corpus.json` proves it case for case).
- **`unsigned` is the orchestrator's word**: the runtime records `stated: false` on a `done` end. Read an end through `closeoutAsked` or
  `endWords`, which also map a fact that replaced an old word back to it (`limit: 'budget'`).
- **The engine can say a task waits before its harness has let the session go** (`closedOut`, and it waits for the session before ending
  on a statement on disk): a test asserts both sides, or waits for the Task.
- **`io().reads` counts every file the runtime reads**, not only journals.
- **A test stamps the times the runtime compares from the journal's attempt start** (`begun` in `test/release.test.ts`), and meets a
  deadline with a start journalled long ago (`startedLongAgo`), never a sleep: a stepped wall clock drops a closeout or misses the
  deadline. A duration a test measures is read with `performance.now()`. A runner that cannot be handed another attempt's statement
  (the detached spawn clears the last one's), or that tells it from its parent's (`--bg`: the parent's last call id,
  `harness/claude/parent.ts`), reports it with no time, and its test steps the clock (`stepClock`, `test/clock.ts`).
- **A duration the runtime decides on is `elapsedMs` over `Instant`s from `instantNow()`** (`core/clock.ts`, `core/engine/now.ts`), never
  two `Date.now()` readings: monotonic within a boot, the wall clock across one. `stepClock` leaves `process.hrtime` alone. A test's
  floor on such a bound reads `elapsedMs` over `instantNow()` taken around the call (`test/feed-rotation.test.ts`), never
  `performance.now()`: `monoNow` keeps whole milliseconds, so the bound fires up to 1 ms before `performance.now()` reaches it.
- **A detached look told names reads only their run files** (`observeFor`); `observe` lists every run, for views and verbs. A finished
  session leaves the pass's look once released and not at work (`releaseFinished`).

## Arguments and doors

- **A parameter taken away is refused, never ignored** (`Object.hasOwn`, the argument count: `tickRefusalOf`, `StepRefused`).
- **The engine's `root` is required and defaults to nothing**, on `EngineOptions`, `ClaudeOptions`, `claudeCodeOps`'s options,
  `Journal.files`, `Journal.filesOps` and `Runner.claude`: whoever builds an engine says where its records go, and `src/cli/main.ts`
  is the one module that reads `AE_ROOT` or names `~/.agent-engine` (`test/engine-root.test.ts`, which also holds `os.homedir()` to
  that entry and to the files that find a harness's own home). A runner or an engine a test makes with no root is refused by name
  (`test/scratch.test.ts`), which catches a rootless literal cast past the typecheck inline; a literal bound and cast on another line
  and then handed over by name is what neither reaches, said in `rootlessRunners`.
- **A flag only Claude Code has goes under `config.claude`**, never a named argument; a key moved there is read at its old place off a
  journal (`upgrade`) and refused there (`FORMER_ARGS`). Pin the argv before a move and compare after.
- **An optional verb renamed on its way through a seam is dropped by every adapter that takes the old type**: keep the old verb beside
  the new one, and test the verb through the `Engine` service.
- **A test that sets `CLAUDE_CONFIG_DIR` (or another env read at load) before a dynamic import of `src`** imports
  `test/promise-runner.ts` and `test/engine.ts` dynamically too: their static import loads `src` first.
- **Node's type stripping refuses a parameter property** (`constructor(private readonly ops)`): declare the field and assign it.
- **A journal is decoded before `upgrade`, as any store gives it back** (`Journal.layer`, `event-schema.ts`): an entry no runtime
  wrote fails that task's read with a `JournalError` naming the file, the entry and its first wrong field (`entryWords`); the pass
  leaves the task out and says why on every report while it lasts (`TickReport.unreadable`), as `list` does (`readEach`), and a feed entry is skipped, said
  once, with the cursor past it (`FeedRefusal`). A former shape is accepted by the schema, rewritten by `upgrade`, and read by a
  test; a field added to `Event` in `domain.ts` is added to its struct, or `tsc` refuses the assignment in `journal.ts` (the
  struct's rest is `unknown`). Each event keeps the keys it does not name (`StructWithRest`: a `Struct` strips them), and a decoded
  struct comes back with its keys in the schema's order, so where the object's own keys matter test it with `Schema.is` and decode
  only to say why not.
- **A long text of a line is a body named by its sha256, resolved on every read** (`core/engine/bodies.ts`): its field takes the
  place of the one it stands for (`STANDS_FOR`), so a read gives the event key for key.
- **Every feed write goes through `filesOps.append` under `feed.lock`** (`withFeedLock`), a rotation too; a rotated feed has a header
  and a sealed file (`core/engine/feed.ts`): read it through `readFeed`, never as plain lines from byte 0. How long a write waits for
  a live holder before it refuses naming it is `FEED_LOCK_WAIT_MS`, carried as `withFeedLock`'s and `Journal.filesOps`'s last
  argument and named in the refusal, so a test shortens it rather than waiting the shipped bound out.
- **A `claude agents --json` row of ours is decoded by `RegistryRowSchema` (`harness/claude/registry.ts`)**: one that does not decode
  fails the whole read, so every background session is unread, never absent. A field the runtime starts reading is added to the schema;
  a row not ours (no `ae/` name, no `state`) is skipped undecoded.

## Processes and streams

- **A stop between two processes that share only files**: each writes its half before it reads the other's (the stop's marker, then the
  pid; the worker's pid, then the marker). A worker installs its signal handlers before it publishes its pid.
- **A Codex `exec --json` line of a type the runtime reads is decoded by `CodexEventSchema` (`harness/codex/stream.ts`)**: one that
  does not decode leaves that session alone unread while its process runs and failed once it has ended (`lookOf`, `detached.ts`),
  never gone. A field the runtime starts reading is added to the schema; any other line passes undecoded.
- **A Codex rollout record of a kind the runtime reads is decoded by `ROLLOUT` (`harness/codex/rollout.ts`)**: an `event_msg`
  `task_complete` or `item_completed`. One that does not decode refuses the `transcript` verb, naming the line by its byte offset
  and the rollout, never read as saying nothing. A field the runtime starts reading is added to the schema; any other record
  passes undecoded.
- **A line of a kind the runtime reads is decoded by `PRINTED` (`harness/claude/print.ts`)** — printed by `claude -p` for a
  `claude-detached` run and for every `-p` run already stored, and by `bin/ae-claude-job.ts` from the SDK's messages for a job:
  a `result`, a `system`
  `permission_denied` or `init`, an `assistant` line's `tool_use` blocks. One that does not decode refuses the output: that session alone
  is unread while its process runs and failed once it has ended (`lookOf`), never read with no answer. A field the runtime starts
  reading is added to the schema; any other line passes undecoded.
- **A Claude Code transcript line of a kind the runtime reads is decoded by `LINES` (`harness/claude/lines.ts`), by the reader that
  reads it**: one that does not decode leaves that `--bg` session alone unread until it has ended, then failed (`endedOf`,
  `harness/claude/bg.ts`), or refuses the `transcript` verb, never read as absent; so does a transcript found and not read
  (`TranscriptUnread`, `harness/claude/transcript.ts`), never kept by `keptRead`. A field the runtime starts reading is added to the
  schema; any other line passes undecoded.
- **A stream a runner keeps whole is read through `output`, never off the run directory** (`streamIn`, `detached.ts`, which counts
  the read); a harness that keeps its streams apart says `streams: true`. `config.env` is journalled with the task: no secret there.
- **A test runs at whatever niceness and IO class its parent gave it, and a worker it starts inherits both**: read a niceness
  relative to the test's own (`ownNiceness`, `test/command.test.ts`), and prove an argv the IO class would hide by calling the
  harness's `command`.
- **A stream-json line is parsed for its `type`, never matched at its start** (`closesOn` in `bin/ae-worker.ts`): a job's own
  process reads its stdin as its session's input and ends the session only when that stdin ends.
- **A job's holder is its own process** (`bin/ae-claude-job.ts`, `claudeJobSpec`): the worker spawns it, its heartbeat and
  `STALE_MS` are the job's lease, and nothing of a job is read through `Sighting.held`, which `decide` reads for a long-lived task
  alone. So a job keeps the detached road whole — its run file, its capture, its `say` inbox, its follow, its stop — and gains only
  the SDK translation: `attachedOptions` is one function for both roads, and a flag added there reaches a held session and a job
  alike. The runner writes the bin its spawn request as a file (`HarnessSpec.needsRequest`, `<name>.request.json`, owner-only
  because the task's `config.mcp` may carry a secret), since no argv could carry it.
- **A job is denied by `permissionPrompts: 'none'`** (`sdk.d.ts:1870`), never by a `canUseTool` of ours: a decision in the bin's
  process would die with it, and Claude Code prints the `system`/`permission_denied` line the readers already count.
- **A detached session's id is read by the worker from its spec's `start` event, on whole stdout lines** (`readers`, `bin/ae-worker.ts`).
  Measured 2026-10-06: `codex exec --json` (0.154.0) prints `thread.started` first; `claude -p` (2.1.291) prints `system`/`init` first
  under `--output-format stream-json --verbose`, and one `result` line under `--output-format json`. A job's bin prints the SDK's
  messages in order, whose first is that same `system`/`init`.
- **A turn's end is not the session's end for a long-lived attached request** (`took`, `harness/claude/attached-session.ts`): the run
  file is rewritten `idle`, the input stays open, and an `is_error` result fails nothing. The SDK reads `errors` off a result whose
  subtype is not `success`, so a stand-in's interrupted result carries one or `readMessages` throws. Words pushed on its input begin
  the next turn, so `hear` writes `working` with them: a session heard and left `idle` is read as waiting on a person while it answers,
  and no turn of it can be ended. It is `idle` again only once a result has named every word pushed, by `user_message_uuids` on the
  result (`answered`), never by counting: words pushed while the model writes run as a turn of their own, and words pushed while a tool
  call runs are folded into the turn in flight and answered by its one result (measured live 2026-10-16, SDK 0.3.270, CLI 2.1.301;
  `queued_turn_count` was 0 on a result a second turn followed, so nothing reads it).
- **An attached sighting says `held` and the holder's `pid` while its state is open** (`sightingOf`, `harness/claude/attached.ts`), and
  a holder gone says `held: false`, which `decide` restarts the task under: `interrupted` reads the interrupt file on every look, never
  as a transition, so another process's ask survives a restart of the holder, and an ask that landed after its turn ended is dropped
  there, never kept for the next turn.
- **The claude.ai bridge is an undeclared method on the SDK's `query()` object**, read off it in `attached-bridge.ts` alone, its answer
  decoded before anything is written from it, and refused in words on the run file where the SDK has none.
- **A drain or a let-go never holds a call that belongs to a call already in flight**, or the call it waits for can never end and the
  holder waits on what it forbids: `held` (`harness/claude/attached.ts`) is a question about the session, and a `PreToolUse` input
  carrying `agent_id` — a sub-agent's call, as the SDK's hook input documents it — is never held.
- **A holder's whole let-go is bounded by one budget its waits share** (`LET_GO_MS`, `leftOf`, `attached.ts`), never one bound each,
  and it says on its log what it waits for and what it cut. The restart's wait for the lease, `stopMs`, is not the bound it gives a
  call in flight (`takeover.verb.ts`).
- **A `parked` run that carries `calling` is a call its holder cut**: the next holder resumes that session with `crashNote`, the road a
  crashed holder's session already takes (`noteOf`, `attached.ts`).
- **The Agent SDK (0.3.270) speaks to its CLI in control requests both ways, and writes a resume as one argument, `--resume=<id>`**: the
  stand-in CLI (`test/fixtures/stand-in-claude.ts`) answers `initialize` and asks `hook_callback` and `can_use_tool` as it does, and
  `test/attached.boundary.test.ts` pins it; an SDK update that moves the protocol fails there first.
- **The SDK sends an empty system prompt when `systemPrompt` is unasked**, so an agent's own prompt appended to it is appended to
  nothing: `attachedOptions` asks for the preset `claude_code`, which a `claude -p` job has by default (measured 0.3.270:
  the `initialize` request carried `[""]` without it, and none with it). The agent's own prompt rides that preset's `append`, as the
  file's text read at spawn, and reaches the CLI as `appendSystemPrompt` on the `initialize` request, never as
  `--append-system-prompt-file`; so does `systemPromptFile`, as `systemPrompt` alone, and a task giving both is refused by name. A
  resumed session keeps the prompt it was recorded with (`systemPrompt`'s own `snapshot`, which defaults on, `sdk.d.ts:2203-2256`),
  so a prompt file edited mid-session reaches no live session until it is compacted.
- **An attached session's MCP servers are `Options.mcpServers`, which the SDK spells onto the child's argv as inline JSON**
  (`sdk.mjs`, `--mcp-config <json>`), with `Options.strictMcpConfig` as the fence: that path writes no MCP config file, and a
  server's `env` or `headers` secret is in `/proc/<pid>/cmdline` rather than a 0600 file — a job, `claude --bg` and
  `claude-detached` still name a file (`writeMcpConfig`) — a job no longer does: its servers ride the same `Options.mcpServers`,
  and `detachedOps` clears the config under its name rather than writing one. **Claude Code expands a `${NAME:-default}` in a server's arguments from
  the inline map too**, not from a config file alone (measured 2.1.306, `test/live.test.ts`: a variable the task's `env` set came
  back expanded and one nothing sets came back as its default), so the repository's own
  `--output-dir ${WF_STEP_FILES:-/tmp/playwright-mcp}` still writes outside the workspace on this road. `Settings.autoCompactWindow`, in the one settings object, moves the window
  `--autocompact <n>` moves (measured 0.3.270 against the real CLI: 150000 either way gave `rawMaxTokens: 150000`, against the
  model's 200000 asked for neither), and the flag stays only where `claude.settings` is a file's path the runtime will not rewrite.
- **`Options.settings` overwrites a `settings` left on `extraArgs`, and `extraArgs` stringifies its values** (`sdk.mjs`): so
  `Options.settings` is the only writer of a session's settings — an object there is JSON the SDK writes itself — and an object left
  in the `extraArgs` bag would reach the CLI as `[object Object]`.

## A2A and remote agents

- **The SDK's `Transport` and `A2ARequestHandler` spell three methods differently**, and its `Client` answers some calls itself
  (`InProcessTransport` forwards them).
- **A card the SDK's own server serves loses its security schemes in the SDK's parser**: `cardOfJson` keeps them;
  `test/remote-server.ts` serves both forms (`cardForm`).
- **A card is decoded by `CardSchema` (`a2a/card.ts`) on both roads, served and configured, before `AgentCard.fromJSON`**, which
  coerces anything and reads snake_case too: a field the runtime starts reading is added to the schema, its snake_case spelling
  refused beside it.
- **A remote session's `nativeId` is the Task's context**, not its id: `bySession` resolves one to the other.
- **A request to another party's address is bounded (`REQUEST_MS`), goes to the origin it was given, follows no redirect, and is named by
  origin and path** (`cardUrlOf`, `shownUrl`).
- **A sentence quotes another party's content through `quote` (`core/quote.ts`)**, and an error in the runtime's own words is a class
  `wordsOf` leaves whole (`a2a/said.ts`); anything else is cut at 200.
- **A paged read is served from the listing its token names** (`OPEN_LISTINGS`), never the latest.
- **An async generator's `return` waits behind its pending `next`**: `Stream.fromAsyncIterable` calls it on interruption, so a silent
  subscription is aborted first (`abortedOnReturn`, `a2a/remote-follow.ts`), or its interruption never ends. The serving half has the
  same trap: a holder's port leaves the signal of a follower that went away on the call's state (`STATE_GONE_KEY`), and the
  subscription interrupts the driver's follow on it (`goneOf`, `a2a/follow.ts`), or a follower that dropped leaves the holder
  following a silent session for its whole life.
- **A test that shortens a remote harness's `requestMs` hands the agent its card (`opsOn`, `test/remote-follow.test.ts`) and waits for the
  send's answer**, or every request it does not test (the card read again after a failure, a subscription's headers) is held to it.
- **A card a holder serves carries its security scheme, or a client finds no requirement and sends no header** (`authOf`): a port that
  then refuses every request looks like a wrong token (`servedCardOf`, `a2a/served.ts`).
- **A holder's port refuses a token in HTTP 401, never a JSON-RPC error inside a 200** (`a2a/listener.ts`): `clientFetchOf` reads the
  kind off the status, and a refusal inside a 200 reaches a viewer as an unsupported operation, naming the wrong fix.
- **A follow of a session this process runs is answered here**, off the files and the holder's own fan-out (`heldHere`,
  `harness/claude/attached-follow.ts`): a test of a holder and a viewer is two processes, or the viewer dials nothing
  (`test/holder-follow.boundary.test.ts`, whose holder runs the attached road against the stand-in CLI through
  `EngineOptions.claudeExecutable`, and whose viewer is given the same `CLAUDE_CONFIG_DIR` so it reads the same transcript).
- **A holder's port serves the harnesses configured as the literal `'claude'` and no others** (`heldHarnessesOf`,
  `service/options.ts`, read by `servingOf`, by `holdersRefusalOf` and by a layer above through the door): those sessions are the
  ones one process holds attached, and a `holder` named for any other harness — a remote agent's, a detached one's — is refused
  before the engine builds (`holderRefusal`), since its sessions are read off the store both share.
- **A holder is refused in two halves, and the second is at the follow** (`EngineOptions.holder`): the harness *names* are
  refused before the engine builds (`holderRefusal`), and what the holder function *answers* — an entry whose key is not `card`, a
  card that does not decode — at the follow that asked for it (`holderAgentRefusal`), since there is nothing to read until then.
  The option is a function per harness, asked at each follow and never captured, because a layer above may build its engine once
  for its whole process while a holder's port is ephemeral: a value would be the holder that was up at startup, which the
  level-triggered rule refuses. `undefined` reads the files, exactly as an engine given no holder does.
- **`Stream.retry` starts its schedule again at the attempt's first output**, an empty array included: a bound on failures in a row
  is counted by hand (`drops` in `followTask`).

## Claude Code, as a harness

What Claude Code does as the steps meet it, measured, is in `docs/harness.md`: its fences and how a rule is matched, what a job has
that a background session has not, trust, the bridge to claude.ai, and what it exports.
What Claude Code does as the steps meet it. Where the orchestrator's code holds a fact today, it is named beside it.

- **A step's fence is one word per harness**: Claude Code's `permissionMode`, Codex's `sandbox` (in the orchestrator today: `modeOf` in
  `former/former.ts`, filed through `agent-orchestrator/test/rendering.test.ts`).
- **A deny `mcp__<server>__<tool>(param:glob)` on `--disallowedTools` refuses a call whose parameter the glob covers, compared as
  written, and no other** (2.1.296, `url:*:8787*`); `(filename:*)` refuses every call that gives the parameter and none that omits
  it. A tool denied bare is not in the session at all, so it is never listed as a denial. Such a rule in an allow list is unmeasured.
- **A Bash deny with a leading `*` is honoured, and a deny is matched against a part as typed, its leading assignment kept** (2.1.296,
  `Bash(*:4318*)` in `--settings`' `permissions.deny`): `echo http://localhost:4318` and `X=http://localhost:4318 true` were each
  refused, and `true` ran. An allow is still read against the part with its wrappers stripped (`deniedPartsOfCall` in
  `agent-orchestrator/test/agent-fences.test.ts`).
- **An idle `--remote-control` session lists `blocked`, `idle`, with a `pid` and no `waitingFor`; a `stopped` row lists no `pid`**:
  `held` is the `pid` (`ourRow`). `--bg` needs a trusted `cwd`, and words `say` sends reach the model framed as a peer's, not
  the person's.
- **Claude Code respawns a `--bg` process that died, on the same session, ~10 s later; a `--resume` given flags forks a new
  session.** Never resume a session it is respawning: a long-lived restart waits for the old one's end and release
  (`restartOf`, `src/core/long-lived.test.ts`); its listing in the gap is `blocked` with no `pid` (`respawning`). Whether the fork's
  copies of its parent's lines keep their uuids is unmeasured (2026-10-07: no probe resumes); nothing reads either way on it: a follow
  starts at the transcript's end (`bgFollowOf`), and a `moved` starts the board's conversation afresh.
- **A job never waits on a prompt; a background session in a folder nobody opened blocks in any mode that can ask**:
  the modes that ask nobody are this package's answer (`unasking` in `fenceReach`, `src/harness/reach.ts`), and the orchestrator's
  `validateFolderMode` refuses a `background: true` step of a folder team in any other.
- **A job reads neither user settings nor `settings.local.json`** (`--setting-sources project`): what a step needs goes on the step, its
  agent or the checkout's `.claude/settings.json`.
- **A tool's error is exact in the log events, not the spans** (2.1.296, 2026-10-11): `tool_result` with `success="false"` carries
  `tool_name`; the errored `claude_code.tool.execution` span carries none, and Tempo's join to its parent found 68 of 174. A skill whose
  load fails is one for `Skill`; a `Skill` call for a skill that is not there exports no event and no span.
- **A write is matched against `Edit` rules only**: write `allowedTools: Edit(**)`, never `Write(path)` (in the orchestrator today:
  `fileRuleRefusal`).
- **`--add-dir` grants writes where the mode writes, and lists the folder's `.claude/skills`** (not its `CLAUDE.md`); an `Edit(//<path>/**)`
  deny holds it read-only in `dontAsk`, `acceptEdits`, `auto` and `bypassPermissions`, a Bash `>` included (`claudeDenies`). Writable,
  `dontAsk` refuses both the Write tool and an allowed Bash `>` there, `Edit(**)` given, until an `Edit(//<path>/**)` allow names it;
  `auto` writes both with no allow (2.1.288, a trusted checkout and not; `claudeAllows`). `dontAsk` reads a file, a picture
  included, under a read-only added folder with no `Read` allow, and refuses it without the folder; a folder that is not
  there is no error (2.1.289).
- **An `Edit(//**/<file>)` deny in an `auto` job refuses the Write tool, a Bash `>` and a `cp` to that file in any folder, by the rule**
  (2.1.291, 2026-10-06); a `node -e` write of it is judged by the classifier alone, which refused it once and let it through unruled
  once. Ada's and Otto's fences deny a harness's trust and local settings so (`agent-orchestrator/test/agent-fences.test.ts`).
- **`Bash(claude *--bg*)`, `Bash(claude *--background*)` and `Bash(claude *remote-control*)` refuse an `auto` job's own session, a
  `cd … &&` before it included, by the rule** (2.1.291, 2026-10-06): a step starts a probe through `workflows/build/probe.ts` alone.
- **A path inside `Read(//…)` or `Edit(//…)` carries a space, a comma and braces; `*`, `?` and `[` widen it, and a `\` misses its own
  folder** (2.1.291, 2026-10-06, allow and deny alike): `CLAUDE_UNRULED` holds the set, with `(`/`)` the runtime's `RULE` refuses;
  `\*` is read as an escape, unused yet.
- **A project's allow rules are dropped in a directory Claude Code has not trusted**: measure a rule in a trusted checkout.
- **Under a mode that refuses what no allow rule reaches — `default`, `manual`, `dontAsk`, `acceptEdits` — only `Read`, `Grep`, `Glob`
  and `Skill` run with no rule** (`CLAUDE_UNFENCED`, `CLAUDE_REFUSING_MODES`). `Read` was measured (2.1.289, the added-folder line
  above); the other three are read off the shipped team, whose `dontAsk` steps grep the checkout and load their skills with no allow
  naming either, while the only calls their feeds show refused are the ones no rule named. `Bash` is not among them: a built-in
  read-only set runs unruled, which does not make the tool unruled — a `node -e` was refused.
- **`acceptEdits` refuses by its rules too, granting only a write in the session's directory** (`CLAUDE_GRANTED`): a job waits on
  nobody in any mode, so a call it would ask about is denied, and `acceptEdits` approves file edits and `mkdir`/`mv`/`cp` but not
  `npm test` (`agent-orchestrator/README.md`, *Permission modes, the hard-won part*). The write was measured: a job given
  `--permission-mode acceptEdits` wrote a file with no allow rule, where the same job in `dontAsk` was denied it
  (`docs/spike-2026-09-25-agents-skills.md`, F10, rows m2 and m3). `Write` is what was measured; the rest of the Edit tool's family
  rides on it, since a write is matched against `Edit` rules alone. So a step in `acceptEdits` given `Bash` or `WebFetch` and no rule
  for it is as broken as one in `dontAsk`, and is refused the same way (`unallowedRefusal`).
- **A checkout's own `.claude/settings.json` allow rules do reach a job's session in a worktree of it**: 89 `WebFetch` calls of
  `dontAsk` steps succeeded here on the checkout's `WebFetch` allow since 2026-10-09, while the same agents were refused every fetch in
  a repository whose settings allow none. So what a step may call depends on the repository the run lands in, not on the workflow folder
  alone: `projectAllows` reads those rules (`src/harness/settings.ts`), and `unallowedRefusal` in the orchestrator counts them.
- **`--bg` in a folder nobody opened is refused at spawn** ("Workspace not trusted. Run `claude` in <dir> once…", 2.1.289); trust is
  kept per path in `.claude.json` (`src/harness/claude/trust.ts`): read by `trustedFolder`, written by `trustFolder` alone, one key,
  under the main checkout's root the caller names, never by a session. A `--bg` permission prompt
  under `--remote-control` lists `blocked`, `waitingFor: "permission prompt"`, and is answered from the claude.ai link (2026-10-05).
- **A `--bg` session without `--remote-control`, blocked at a permission prompt, lists `blocked`, `waitingFor: "permission prompt"`**
  (2.1.291, 2026-10-06, an `ask` rule in `--settings`): a step reads its probe with `claude agents --json`, reaching no phone.
- **A `--bg --remote-control` session's link is `https://claude.ai/code/<bridgeSessionId>`**, the id `session_…` in its registration
  `<pid>.json`, never in `claude agents --json` (`claudeBridge`, `harness/claude/bridge.ts`): written ≤ 4.3 s after the start (2.1.291,
  2026-10-06). A SIGTERM sent to its pid ends it: `done` in `claude agents`, its file removed, no respawn within 45 s, and a later
  `claude stop <id>` still answers `stopped`. Whether a respawn or a restart changes the id, and the link on a phone: unmeasured.
- **A `--bg` session stays in `--permission-mode auto`, and an `ask` rule in `--settings` outranks its classifier** (2.1.289,
  2026-10-05): `Bash(x:*)` prompts ("Ask rule … overrides auto mode"), listed `waitingFor: "permission prompt"`; `Edit(//<file>)`
  prompts the Write tool, unruled it writes unasked. No `Edit` or `Write` ask reaches a Bash `>` there: the classifier judges it.
- **A `*` inside a Bash rule is any run of characters, none included** (2.1.290): `Bash(x *--flag*)` asks `x --flag a` and `x a --flag`
  over an allow of `Bash(x:*)`, which still lets `x a` through; so a verb that reads bare is asked only with a flag that sets.
- **An `ask` prompt of a `--bg --remote-control` session in auto is answered on claude.ai** (2.1.289, 2026-10-05): a No there reaches
  it as "Denied by user", and the session works on; the call never runs.
- **A `PreToolUse` hook runs in a `--bg` session, and its `ask` prompts over every allow** (2.1.290, 2026-10-05): over an allow rule in
  `--settings` and one in the folder's `settings.local.json` alike, listed `waitingFor: "permission prompt"`, and offers Yes and No
  alone. Its `allow` does not lift an `ask` rule, and a `deny` rule stands over it (`src/harness/claude/admission.ts`).
- **An `ask` rule in `--settings` outranks the same rule allowed in the folder's `settings.local.json`** (2.1.290, 2026-10-05): a
  `--bg --remote-control` session in auto, `Bash(probe:*)` asked there and allowed in a trusted folder's local settings, is still
  asked, and its prompt offers Yes and No alone, no "don't ask again"; a prompt widened by a person is an ask taken out at filing.
- **`--settings`' `env.PATH` is a `--bg` session's Bash PATH** (2.1.289): a folder first there is first to `command -v`.
- **A session under `~/.claude/` cannot write there in any mode**: put a probe store elsewhere.
- **A path a fenced step's brief names is inside its own folder**; a rule offered for the next run names no path of this one (in the
  orchestrator today: `givenPlan`, `folderPlace.make`, `allowRuleOf`, `disallowedBy`).
- **A job runs with background tasks off and a call's default timeout at 10 minutes** (`CLAUDE_JOB_ENV`, `src/harness/claude/code.ts`),
  a task's `env` laid under it and the telemetry, never over (`test/telemetry.test.ts`):
  measured on 2.1.289, `run_in_background` is ignored and the call runs in the foreground, a bare 130 s call completes (cut at 120 s
  with background tasks off alone, moved to the background with neither), and a shell `&` still detaches, its `$!` alive to `kill -0`.
- **A job exports logs, metrics and traces from its environment over `http/json`, flushed at exit, and joins `TRACEPARENT`** — an
  environment `attachedOptions` now composes onto `Options.env` inside the bin, where the SDK replaces the child's environment
  entirely (`sdk.d.ts:1535`), so the engine's own telemetry is off the bin's process and the session's is on the CLI's;
  a `--bg` session runs in a pre-spawned process, ignores the asker's environment and `TRACEPARENT`, and exports only what `--settings`'
  `env` says; a job's Bash tool sees no `OTEL_*`, but `TRACEPARENT` (2.1.291, 2026-10-06; `claudeTelemetryEnv`, `telemeteredFlags`).
  Whether a `--bg` session's Bash tool inherits that `env`'s telemetry is unmeasured: its `env.PATH` reaches it, so a `claude -p` run
  there may export under the session's labels.
- **`OTEL_LOG_TOOL_DETAILS=1` puts a tool's inputs on its `claude_code.tool` span (`full_command`, `file_path`) and on the
  `tool_decision` and `tool_result` events (`tool_parameters`, `tool_input`, `error`)** (2.1.293, 2026-10-07, `claude -p`): without it no
  command, path or error text is exported, only `bash_argv0`, `bash_command_class` and an error's class (`toolDetails`, `claudeTelemetryEnv`).
- **`claude -p --include-partial-messages` prints each block as `stream_event` lines, its whole `assistant` line before the block's
  `content_block_stop`** (2.1.292, 2026-10-07, Haiku, one short answer): 42 lines and 20 KB against 5 and 9 KB, 27 `text_delta`s; the
  process's CPU and RSS the same within 10 %. `message_start`'s `message.id` is the `assistant` line's, whose `uuid` the transcript keeps
  (`followOf`, `harness/detached/follow.ts`).
- **Every child the runtime starts is spawned `withoutTelemetry`** (`harness/telemetry.ts`): a session exports only what its runner hands
  it, never as the engine's process; `test/telemetry.test.ts` sets the engine's own and reads what a stub `claude` and a command see.
- **A Bash deny reaches each part of `&&`, `||`, `;`, `|`, `&`, a `$(…)`, and a part behind `timeout`, `nohup` or `VAR=`** (2.1.288),
  but not `bash -c '…'` or `/usr/bin/pkill`; `partsOf` (`agent-orchestrator/test/agent-fences.test.ts`) models the parts. `Bash(pkill:*)`
  leaves `kill $(pgrep …)`, `pgrep … | xargs kill` and `kill -1` open, a known gap.
- **The Agent SDK takes `NODE_OPTIONS` out of the environment it gives Claude Code**, so an `--import` load hook that makes a race in
  the stand-in happen on demand (`test/fixtures/stand-in-claude.ts`) reaches it only by patching `child_process.spawn` in the test's own
  process — through `createRequire`, before an ESM import binds the name — to put `NODE_OPTIONS` back on the stand-in's spawn.
