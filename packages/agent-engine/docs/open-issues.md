# Open issues: agent-engine and agent-workflows

What is still wrong, what is only half-verified, and what is waiting on a decision — written down so
it can be picked up later without reconstructing it from commit history. The last section is a
record of what was fixed, with commits, so the open items have their context.

State as of 2026-09-13: agent-engine after the hold-the-bar engine work (repository
`docs/plan-hold-the-bar.md` §4 B and E4), agent-workflows `0e7b02a`.

## Bugs

### 1. A step that asked for a closeout still settles `succeeded` when it goes quiet without one

**Where.** The Claude runner turns *working, not busy, transcript quiet for 90 seconds* into
`state: done` whether or not the task asked for a closeout (`agent-engine/src/runner.ts`, the
quiescence rule in `claudeOps`). The engine records that as a normal end (`closedOut` in
`agent-engine/src/engine.ts` never sees a statement), and the workflow stops a DAG only for a
closeout that says `blocked` (`agent-workflows/src/run.ts:84`), so a missing one reads as success.

**Effect.** A step that crashes, hits a rate limit, or ends its turn without calling
`StructuredOutput` is reported `succeeded`, the next step is filed, and `wf decide` says every step
succeeded — with no summary for that step. A false completion, which the engine README calls the one
failure worse than a stall.

**Proposed fix.** The runner stops deciding: it reports how long the session has been quiet, as a
fact on the sighting. The engine decides, because only the journal knows whether this task asked for
a closeout:

- no `closeoutSchema` → quiet means done, as today (it is all such a task has);
- a schema and no statement → the attempt ends as *stalled*, not a success, so nothing downstream
  runs; the task's resume policy then applies — resume the session with a nudge ("you stopped
  without giving your closeout; finish, or report blocked") — and a person gets it when attempts
  run out.

**Status.** Deferred (2026-09-12, operator). The fix is a change to `decide` — the only one the
evaluation proposed — and the engine work that followed was held to leaving `decide` unchanged.
The run-side half closes without it: the workflow layer's `unsigned` status (plan package C) does
not let a step that asked for a closeout and gave none satisfy `after`. The engine half stays open:
`ae` on its own still records such a task `succeeded`.

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

### 3. Claude sessions stay in the registry after their task settles

A `--bg` session that has given its closeout stays `working/idle` in `claude agents` indefinitely.
The engine settles the task but never stops or removes the session, so every run leaves its sessions
behind; each one had to be cleared by hand with `claude stop` and `claude rm`. Stopping (and
possibly removing) a session once its task settles belongs in the engine. `test/live.test.ts` clears
its own two sessions for this reason.

A session seen `blocked` after giving its closeout now ends its attempt and settles, and stays in the
registry afterwards like every other.

### 4. `claude-detached` ignores `closeoutSchema`, and measures no usage

`agent-engine/src/runner-detached.ts`: the spec's `command` does not take the harness `io`, so a
task on this harness never gets a closeout. Completion itself still works — `claude -p` exits — but
the workflow sees no statement. Only `claude` (background sessions) and `codex` support closeouts. The
fix is `--json-schema` plus reading `structured_output` from the JSON output, which also carries the
usage this harness records as `null` today. Low priority: this harness exists for comparison.

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
vocabulary half needs the runner to answer, and `RunnerOps` has no verb for that — the four verbs are
the line that type holds — so it would be a value passed to `file`, not a fifth verb.

### 7. Codex usage is not measured

**Where.** `agent-engine/src/runner-detached.ts`. Every Codex attempt records `usage: null`.

`codex exec --json` does report it: its `turn.completed` event carries `input_tokens`,
`cached_input_tokens`, `output_tokens` and `reasoning_output_tokens` (seen in a 0.154.0 run log). The
fix is an optional `HarnessSpec` reader of the worker's log, once it is decided what `turns` means for
Codex, whose turns are prompts rather than model responses.

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

### 10. A relative `cwd` fails a detached harness

`file()` takes any non-empty `cwd`, and `ae start` resolves one before filing, so only an API caller
journals a relative one. The detached runner launches its worker in that `cwd`, and the worker
launches the harness in the same relative path again, now from inside it: measured with `sh` as the
harness and `cwd: 'repo'`, the worker logged `spawn sh ENOENT` and the attempt failed. `claude --bg`
starts in the right place, because `execFile` resolves the `cwd` from the ticking process — which
need not be the one that filed the task. The MCP configs are named by absolute path (found in
review); the `cwd` itself is not.

**Fix.** `file()` resolves or refuses a relative `cwd`. Resolving is what `ae start` already does;
refusing is the honest answer for an API whose filer and ticker may be different processes.

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

## Verified by tests, not by a live run

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

## Open questions

1. **Quiescence: stalled or done** for a task that asked for a closeout — bug 1, deferred.
2. **Why a Claude session stays `working` instead of reaching `done`.** Twenty-plus sessions measured:
   not resume, not duration, not the two together. It is the reason the quiescence floor exists.
3. **Should the engine stop a session once its task settles** — bug 3.
4. **`wf ls` choices merged as implemented** (`7f07b71`), open to revisit: an extra "waiting on you"
   line for a run with a blocked step; `closeout unreadable` for an answer that cannot be parsed; no
   such line for a cancelled run. The reasons are in `RESPONSE.md` on
   `wf/make-wf-ls-say-how-each-fini-zpp7/respond`.
5. **Should a task be able to ask for Claude in Chrome?** Every Claude Code spawn is `--no-chrome`
   (bug 9): a step cannot drive the operator's signed-in browser. Allowing it would be a field that
   says so, not a default; nothing has asked for one.
6. **hkb migration**: two decisions to make before starting — see
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
