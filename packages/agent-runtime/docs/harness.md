# Claude Code, as a harness

What Claude Code does as the steps meet it, measured at the version each line names: its fences and how a rule is matched, what a job
has, trust, the bridge to claude.ai, and what it exports. A measurement here is a floor read on a
release, never a promise of the next one — re-measure before you lean on it, and name the version and the day beside what you read.

Since 2026-10-24 every Claude Code session of this runtime runs on the Agent SDK: a step as a job, in a process of its own whether or
not a process holds sessions (since 2026-11-03), and a long-lived session attached while a process holds it (`nemia up`). A line below about `claude -p` or a `--bg` session is the record of a road this runtime no longer runs,
kept for what it measured of Claude Code itself.

- **A job's `PreToolUse` hook holds its call, and `interrupt()` then the end of the prompt prints the cut turn's result with its
  cost** (SDK 0.3.316, on the stand-in Claude Code of `test/job-hold.boundary.test.ts`, 2026-11-03): with `permissionPrompts: 'none'`
  and the job's hooks on its options, the SDK registers them at `initialize`, and an unanswered `PreToolUse` callback keeps the call
  waiting; a turn cut by `interrupt()` prints `error_during_execution` with its `total_cost_usd`, and the CLI saves its total as it
  leaves. On a real Claude Code 2.1.316, and what it does when a hook outlives its `timeout` (`HOOK_HOLD_S`, 24 h), it is unmeasured
  (`docs/open-issues.md`, *A job's hold is measured on the stand-in alone*): `JOB_HOLD_MS` parks an hour before that timeout.
- **An attached session's turn cut by `Query.interrupt()` under the sessions' drain leaves it answering under its id** (SDK 0.3.316, on
  the stand-in Claude Code of `test/attached.boundary.test.ts`, 2026-11-04): a call in flight past the drain's grace is cut by the
  SDK's `interrupt` control request, one per cut however many looks read it; the turn ends with an `error_during_execution` result,
  the Claude Code process lives on with its input open, and the words pushed once the drain is lifted (`cutWords`) begin a turn of
  their own on the same process and session id, no resume. On a real Claude Code it is unmeasured (`docs/open-issues.md`, *A job's
  hold is measured on the stand-in alone*).

`CLAUDE.md`, *Claude Code, as a harness*, forwards here, and the five documents that point at that heading resolve through it. Where
the orchestrator's code holds a fact today, it is named beside it.

- **A step's fence is one word per harness**: Claude Code's `permissionMode`, Codex's `sandbox` (in the orchestrator today: `modeOf` in
  `former/former.ts`, filed through `agent-orchestrator/test/rendering.test.ts`).
- **A deny `mcp__<server>__<tool>(param:glob)` on `--disallowedTools` refuses a call whose parameter the glob covers, compared as
  written, and no other** (2.1.296, `url:*:8787*`); `(filename:*)` refuses every call that gives the parameter and none that omits
  it. A tool denied bare is not in the session at all, so it is never listed as a denial. Such a rule in an allow list is unmeasured.
- **A Bash deny with a leading `*` is honoured, and a deny is matched against a part as typed, its leading assignment kept** (2.1.296,
  `Bash(*:4318*)` in `--settings`' `permissions.deny`): `echo http://localhost:4318` and `X=http://localhost:4318 true` were each
  refused, and `true` ran. An allow is still read against the part with its wrappers stripped (`deniedPartsOfCall` in
  `agent-orchestrator/test/agent-fences.test.ts`).
- **A `--resume` given flags forks a new session** (measured on `--bg`); whether the fork's copies of its parent's lines keep their
  uuids is unmeasured (2026-10-07), and nothing reads either way on it: a `moved` starts the board's conversation afresh.
- **A job never waits on a prompt** (`permissionPrompts: 'none'`, measured on `claude -p`, M1); a `--bg` session in a folder nobody
  opened blocked in any mode that can ask, and the modes that ask nobody are this package's answer (`unasking` in `fenceReach`,
  `src/harness/reach.ts`).
- **`auto` on haiku is `auto`** (the SDK's Claude Code 2.1.316, `claude-haiku-5-5`, 2026-11-09): a job filed at the runtime's
  default mode ran in `auto` (its transcript's `permissionMode`), and the classifier allowed a write outside its folder, a `curl`
  and a fetch, where on 2.1.280 haiku ran `auto` as `default` and was denied all three. A job meant to be denied by asking is
  filed in `default` (`test/live.test.ts`, M1 and M7). Measured again on **SDK 0.3.322, Claude Code 2.1.322, 2026-11-11**, by
  `test/live-sdk.boundary.test.ts`'s third case, one job per model filed in `auto` and read off its `init` line: `haiku`
  (`claude-haiku-5-5`), `sonnet` (`claude-sonnet-5-5`), `opus` (`claude-opus-5-5`) and `fable` (`claude-fable-5-2`) ran in `auto`, and
  `claude-haiku-4-5` and `claude-sonnet-4-5` in `default`, so `CLAUDE_AUTO_DROPPED` stands as it was. The case makes this measurement
  again at every bump, and hands each line over as `sdk-<version>-auto-<model>.json`. Measured ten times a model the same day, after
  two runs' checks failed on the case and a third passed: `claude-haiku-4-5` and `claude-sonnet-4-5` ran in `default` in all ten, and
  `haiku` and `sonnet` in `auto` in all ten, so no model's answer varies. What varied is the `init` line: in one run of ten each listed
  model's said `auto`, and a `{"type":"system","subtype":"status","permissionMode":"default"}` line after it said the mode the
  session ran in, which Claude Code settles after printing `init` (its bundled code refuses `auto` on a model before
  `claude-opus-4-6` in its list, a local check, no flag fetched). So `ranIn` is the last mode an `init` or a `status` line names
  (`claudeStreamOutput`), and the case reads it so. A case that fails is a change of Claude Code's: measure the model ten times, as
  here, before `CLAUDE_AUTO_DROPPED` moves, on a card of its own.
- **A session reads neither user settings nor `settings.local.json`** (`settingSources: ['project']`): what a step needs goes on the step, its
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
  once.
- **`Bash(claude *--bg*)`, `Bash(claude *--background*)` and `Bash(claude *remote-control*)` refuse an `auto` job's own session, a
  `cd … &&` before it included, by the rule** (2.1.291, 2026-10-06): a step starts a probe through `packages/templates/sdlc/workflows/build/probe.ts` alone.
- **A path inside `Read(//…)` or `Edit(//…)` carries a space, a comma and braces; `*`, `?` and `[` widen it, and a `\` misses its own
  folder** (2.1.291, 2026-10-06, allow and deny alike): `CLAUDE_UNRULED` holds the set, with `(`/`)` the runtime's `RULE` refuses;
  `\*` is read as an escape, unused yet.
- **A project's allow rules are dropped in a directory Claude Code has not trusted**: measure a rule in a trusted checkout.
- **`--bg` in a folder nobody opened is refused at spawn** ("Workspace not trusted. Run `claude` in <dir> once…", 2.1.289); trust is
  kept per path in `.claude.json` (`src/harness/claude/trust.ts`): read by `trustedFolder`, written by `trustFolder` alone, one key,
  under the main checkout's root the caller names, never by a session.
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
- **A job runs with background tasks off and a call's default timeout at 10 minutes** (`CLAUDE_JOB_ENV`, `src/harness/claude/job-env.ts`),
  a task's `env` laid under it and the telemetry, never over (`test/telemetry.test.ts`):
  measured on 2.1.289, `run_in_background` is ignored and the call runs in the foreground, a bare 130 s call completes (cut at 120 s
  with background tasks off alone, moved to the background with neither), and a shell `&` still detaches, its `$!` alive to `kill -0`.
- **A job exports logs, metrics and traces from its environment over `http/json`, flushed at exit, and joins `TRACEPARENT`** — an
  environment `attachedOptions` composes onto `Options.env` inside the job's bin, since the SDK replaces the child's environment
  entirely (`sdk.d.ts:1743`), so the engine's own telemetry is off the bin's process and the session's is on the CLI's; a job's Bash
  tool sees no `OTEL_*`, but `TRACEPARENT` (2.1.291, 2026-10-06, then `claude -p`; `claudeTelemetryEnv`).
- **`OTEL_LOG_TOOL_DETAILS=1` puts a tool's inputs on its `claude_code.tool` span (`full_command`, `file_path`) and on the
  `tool_decision` and `tool_result` events (`tool_parameters`, `tool_input`, `error`)** (2.1.293, 2026-10-07, `claude -p`): without it no
  command, path or error text is exported, only `bash_argv0`, `bash_command_class` and an error's class (`toolDetails`, `claudeTelemetryEnv`).
- **`claude -p --include-partial-messages` prints each block as `stream_event` lines, its whole `assistant` line before the block's
  `content_block_stop`** (2.1.292, 2026-10-07, Haiku, one short answer): 42 lines and 20 KB against 5 and 9 KB, 27 `text_delta`s; the
  process's CPU and RSS the same within 10 %. `message_start`'s `message.id` is the `assistant` line's, whose `uuid` the transcript keeps
  (`followOf`, `harness/detached/follow.ts`).
- **A Bash deny reaches each part of `&&`, `||`, `;`, `|`, `&`, a `$(…)`, and a part behind `timeout`, `nohup` or `VAR=`** (2.1.288),
  but not `bash -c '…'` or `/usr/bin/pkill`; `partsOf` (`agent-orchestrator/test/agent-fences.test.ts`) models the parts. `Bash(pkill:*)`
  leaves `kill $(pgrep …)`, `pgrep … | xargs kill` and `kill -1` open, a known gap.
- **The Agent SDK takes `NODE_OPTIONS` out of the environment it gives Claude Code**, so an `--import` load hook that makes a race in
  the stand-in happen on demand (`test/fixtures/stand-in-claude.ts`) reaches it only by patching `child_process.spawn` in the test's own
  process — through `createRequire`, before an ESM import binds the name — to put `NODE_OPTIONS` back on the stand-in's spawn.
- **A session asking for the model alias `opus` starts on what its own Claude Code resolves it to, which moves with the version**
  (SDK 0.3.308, Claude Code 2.1.308, 2026-10-22, `test/live-sdk.boundary.test.ts`): `claude-opus-5-5`, where the SDK the factory ran
  before — 0.3.270, bundling 2.1.270 — resolved it to `claude-opus-5`, so for 140 step sessions the team asked for one model and got
  another with nothing failing. The alias is resolved inside Claude Code and said once, on the session's
  `{"type":"system","subtype":"init",…}` line, which the runtime now reads and carries onto the attempt as `ranOn`
  (`harness/detached/output.ts`, `core/domain.ts`): which model a session ran on is a fact of the record, not a grep of a kept stdout.
  `test/sdk-pin.ts`'s `OPUS_TODAY` is what was measured, and an alias can move under a version that did not, so it is measured again
  at each bump and never carried. Measured again on **SDK 0.3.316, Claude Code 2.1.316, 2026-11-01**: still `claude-opus-5-5`, alike
  on the `init` line of `bin/ae-claude-job.ts` run on the bundled Claude Code (`live-sdk.boundary.test.ts`, which keeps that line as
  `sdk-0.3.316-init.json`), on the attempt the engine recorded (`ranOn`), and on the owner's own `claude -p --model opus` at 2.1.316.
  Measured again on **SDK 0.3.322, Claude Code 2.1.322, 2026-11-11**: still `claude-opus-5-5`, on the bundled Claude Code's `init`
  line (`sdk-0.3.322-init.json`, `claude_code_version` 2.1.322), on the attempt (`ranOn`, `harnessVersion` 2.1.322), and on the
  owner's own `claude -p --model opus --output-format stream-json --verbose`, whose `claude --version` said 2.1.322 and whose `init`
  line said `claude-opus-5-5`.
- **The mode a session ran in is its `init` line's `permissionMode`** (`sdk.d.ts:6369`), and the runtime reads it as the attempt's
  `ranIn` (`harness/detached/output.ts`): what was asked is the task's `permissionMode`, what ran is what Claude Code printed. The SDK
  prints one `init` per turn, so the last one is read, as `claude_code_version` is, and the capture keeps a later `init` that names
  another mode (`initKept`): on a model that drops `auto` the mode can change from one turn to the next (`auto` on haiku ran as
  `default` on 2.1.280, and as `auto` on 2.1.316 and 2.1.322, above), and only that line says which one a turn ran in.
- **A job's bin prints the SDK's `command_lifecycle` lines for the queued prompt ahead of `system`/`init`** (SDK 0.3.308 and 0.3.316,
  2026-11-01): `queued`, then `started`, each with the `session_id`, then `init`; and a `result` line does not open with its `type`.
  The worker passes over every line before the start event (`HarnessSpec.start`, `bin/ae-worker.ts`), so it reads the id all the same.
- **A settings file left out of `settingSources` no longer supplies auto-mode rules or saved permission consents** (Claude Code 2.1.314,
  SDK 0.3.314, from their changelogs, not measured here): a session runs `settingSources: ['project']`, so an `auto` step no longer
  inherits a user-level consent; the first sign of what that changes is the runs' denials after the daemon restarts.
- **Auto mode with telemetry or feature flags off asks about or denies what its server cannot check, with no fallback to the built-in
  classifier** (Claude Code 2.1.319, from its changelog, not measured here; `CLAUDE_CODE_AUTO_MODE_SERVER=0` keeps the classifier). The
  runtime takes only the variables of a process's own telemetry export out of a child (`TELEMETRY_VARIABLE`, `harness/telemetry.ts`), and nothing
  here sets `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_FEATURE_FLAGS`; a daemon whose own environment sets one would see every `auto`
  step's calls asked about, so denied, after it restarts.
- **The `fable` alias is `claude-fable-5-2`** (Claude Code 2.1.321 from its changelog, measured on 2.1.322 on the `init` line of
  `sdk-0.3.322-auto-fable.json`, 2026-11-11), where it was Fable 5.1 before; it keeps `auto`.
- **A hook matcher takes `onFailure`** (SDK 0.3.317, read off `sdk.d.ts` on 0.3.322): `continue`, the default, reports a callback that
  throws or answers nothing valid and lets the action go on; `block` blocks it. The runtime's hold hooks leave the default
  (`harness/claude/job-hooks.ts`): a hold is not a fence, and a failed read of the drain must not stop every call of a step. A
  callback that returns nothing counts as failing, so each returns on every path.
- **A job resumed on the bundled Claude Code is started with `--await-initialize`** (SDK 0.3.321, read off `sdk.mjs` on 0.3.322,
  2026-11-11): the SDK adds it where a resume or a continue runs the bundled binary with no `pathToClaudeCodeExecutable` and no
  `spawnClaudeCodeProcess`, so a job on the stand-in (`AE_CLAUDE_EXECUTABLE`) and an attached session, which spawns its own child,
  never see it.
- **The SDK joins most of the flags it builds for Claude Code as `--flag=value`, and a few as two arguments** (0.3.308, read off
  `sdk.mjs`, 2026-10-22, and re-read on 0.3.316, 2026-11-01, and on 0.3.322, 2026-11-11, unchanged; the change landed in 0.3.295): joined for the mode, the prompts, the tool lists, the setting sources,
  `--add-dir`, `--plugin-dir`, `--resume`, `--model`, `--effort`; two arguments for `--mcp-config`, `--managed-settings` and every
  `extraArgs` key, `--settings` among them — those it joins only where the value itself opens with a dash — beside the four it opens
  with (`--output-format stream-json --verbose --input-format stream-json`). A test that read such a value as
  `argv[argv.indexOf(flag) + 1]` answered `argv[0]` without failing, since `indexOf` gives -1; both packages that read an SDK-written
  argv now read it through a `sdkArgValue` that takes either form and refuses an absent flag (`test/sdk-argv.ts`).
- **Fork subagents are on by default in an SDK session from 0.3.302, as in the terminal**, so a step's `Agent` call forks the parent's
  context rather than starting fresh, and costs tokens the run's budgets were measured without. The factory keeps the SDK's default, by
  the operator's decision at this bump; `CLAUDE_CODE_FORK_SUBAGENT=0` in `CLAUDE_JOB_ENV` (`harness/claude/job-env.ts`) turns it off, and
  no test here watches it — the first evidence is the spend after the daemon restarts.

- **A dontAsk session allowed `cat`, `head`, `tail`, `wc`, `cut` or `ls` is refused it on a path outside its working folders, by
  Claude Code's own check before any rule** (2.1.308, 2026-10-22: `/etc/…`, `../…`, `~`, `$HOME`, `<`, a link out), and not on the paths
  `wc --files0-from=<list>` reads (`CLAUDE_KEEPS_INSIDE` in `agent-orchestrator/test/agent-fences.test.ts`).
- **Under a mode that refuses what no allow rule reaches, only `Read`, `Grep`, `Glob` and `Skill` run with no rule**
  (`CLAUDE_UNFENCED`, `CLAUDE_REFUSING_MODES`): `Read` was measured (2.1.289, the added-folder line above); the other three are read
  off the shipped team, whose `dontAsk` steps grep the checkout and load their skills with no allow naming either, while the only calls
  their feeds show refused are the ones no rule named. `Bash` is not among them: a built-in read-only set runs unruled, which does not
  make the tool unruled — a `node -e` was refused.
- **`acceptEdits` refuses by its rules too, granting only a write in the session's directory** (`CLAUDE_GRANTED`): a job given
  `--permission-mode acceptEdits` wrote a file with no allow rule, where the same job in `dontAsk` was denied it
  (`docs/spike-2026-09-25-agents-skills.md` at the repository's root, F10, rows m2 and m3). `Write` is what was measured; the rest of
  the Edit tool's family rides on it, since a write is matched against `Edit` rules alone; `npm test` is not approved
  (`agent-orchestrator/README.md`, *Permission modes, the hard-won part*).
- **A checkout's own `.claude/settings.json` allow rules reach a job's session in a worktree of it**: 89 `WebFetch` calls of `dontAsk`
  steps succeeded on the checkout's `WebFetch` allow from 2026-10-09, while the same agents were refused every fetch in a repository
  whose settings allow none. So what a step may call depends on the repository the run lands in (`projectAllows`,
  `src/harness/settings.ts`; `unallowedRefusal` in the orchestrator counts them).
- **A `PreToolUse` hook is handed a Bash call's command exactly as typed, and its `deny` stands in a `dontAsk` job** (2.1.308,
  2026-10-22): a `--bg` session in `dontAsk` typed `git … diff --out''put=<file> HEAD`, `Bash(git:*)` allowed in `--settings`; the
  hook's `tool_input.command` held the two quotes as typed, its deny refused the call, and no file was written. So a hook can read a
  line as the shell would; a permission rule only matches the text.
- **A detached session's first stdout line names its id** (2026-10-06): `codex exec --json` (0.154.0) prints `thread.started` first;
  `claude -p` (2.1.291) prints `system`/`init` first under `--output-format stream-json --verbose`, and one `result` line under
  `--output-format json`; a job's bin prints the SDK's messages in order, whose first is that same `system`/`init` but for the `command_lifecycle` lines said above (`readers`,
  `bin/ae-worker.ts`).
- **`Options.skills` as a list closes an attached session's skills to it; Claude Code's command line has no equivalent** (SDK 0.3.308,
  CLI 2.1.310, 2026-10-24, `live.test.ts`): a session given one plugin skill (`nemia-aeprobe:say-the-word`, by `--plugin-dir`) is
  listed that skill alone in its transcript's `skill_listing` (`skillCount: 1`), and its control, identical but on `'default'`, is
  listed it and the 14 built-in ones (`skillCount: 15`). Read the `skill_listing`, not `init`'s `skills`, which lists every skill
  either way. No flag or settings key of the CLI closes the list: `skillOverrides` turns off the names it holds and
  `disableBundledSkills` the bundled ones alone, so the list is the SDK's alone, which every Claude Code session of this runtime runs on.
- **Words pushed into a long-lived attached session while the model writes run as a turn of their own; words pushed while a tool call
  runs are folded into the turn in flight and answered by its one result** (SDK 0.3.270, CLI 2.1.301, 2026-10-16): so a turn is
  answered by the `user_message_uuids` on its result (`answered`, `harness/claude/attached-session.ts`), never by counting;
  `queued_turn_count` was 0 on a result a second turn followed, so nothing reads it.
- **An MCP server's tools are deferred only where the session has `ToolSearch`** (SDK 0.3.308, Claude Code 2.1.308, 2026-11-02): a
  closed `tools` list without it sends every server's tools whole on every request — a design step's 23 Playwright tools, 4.1k tokens
  of its first request — and one with it sends them as names, each definition loaded on demand. So `attachedOptions` adds `ToolSearch`
  to a closed list where the session has a server (`TOOL_SEARCH`, `harness/claude/session-options.ts`). In `dontAsk`, with the tool
  on `allowedTools`, the session loaded it and called it; `ToolSearch` itself needed no allow. Read off the transcript's first
  `api-request-shape`, by `test/live.test.ts` and its control on the code before it.
- **`claudeMdExcludes` in `Options.settings` keeps a folder's `CLAUDE.md` out of a session** (2.1.308, 2026-11-02):
  `**/node_modules/**/CLAUDE.md` left out the `nested_memory` attachment a read under `node_modules/<dep>/` brought, while one beside
  it outside `node_modules` was still attached; without the key, both were, and the dependency's text reached the model
  (`DEPENDENCY_CLAUDE_MD`, `harness/claude/memory.ts`; `test/live.test.ts`).

## A permission prompt, as `canUseTool` is handed it

What Claude Code hands `canUseTool` (`sdk.d.ts:228`) for a call it would prompt for, and what it does with an always allow, measured
on **SDK 0.3.316 / Claude Code 2.1.316, 2026-11-04**, by a throwaway probe kept outside the repository: one `query()` on haiku from
an empty folder under `/tmp`, `settingSources: ['project']`, its `canUseTool` logging every option it was given and answering allow
with `updatedPermissions` set to the `suggestions` it was handed, as an always allow does (`permission.ts`, `permissionAnswered`).

- **A prompt an ask rule forces comes with no suggestion, no `title` and no `decisionReason`**: with `permissions.ask:
  ["Bash(echo nemia-probe*)"]` in the folder's `.claude/settings.json`, each of two `echo nemia-probe` calls was handed `displayName:
  "Bash"`, a `description` that is the call's own `description` input (the words the model wrote, not a subtitle of Claude Code's),
  `decisionReasonType: "rule"` and `serverPolicyAskOnly: false`, and nothing else: no `suggestions`, `title`, `decisionReason`,
  `blockedPath`, `defaultToNo`, `suppressAlwaysAllowRule` or `matchedAskRule` (`sdk.d.ts:315`). So a permission an ask rule forced
  offers no always allow (`permissionAskOf`: always needs a suggestion), and its question is the `displayName`. No rule can be saved
  from it, and none equal to the ask rule: an always never widens a fence an ask rule holds, such as
  `Bash(nemia agents custom *--file*)`.
- **An ask rule prompts each matching call, in the same session**: the second `echo nemia-probe` was handed to `canUseTool` again
  after the first was allowed.
- **A prompt Claude Code's own mode forces comes with suggestions, and an always allow writes the folder's
  `.claude/settings.local.json` under `settingSources: ['project']`**: in a folder with no rules, `mkdir nemia-probe-a` was handed
  `blockedPath` (the folder it would create), `displayName: "Bash"`, the call's `description` input, and three suggestions, as the
  SDK gives them: `addRules` of `Bash(mkdir nemia-probe-a *)` to `localSettings` — the exact command, a space and a `*`, not a
  prefix of it — `addDirectories` of the folder to `session`, and `setMode` `acceptEdits` to `session`. Returned whole, the first was
  written to `<cwd>/.claude/settings.local.json` as `permissions.allow: ["Bash(mkdir nemia-probe-a *)"]`, and the next call,
  `mkdir nemia-probe-b`, which that rule does not match, ran without a prompt, which the `setMode` suggestion to `acceptEdits`
  accounts for (not measured apart). An always allow returns every suggestion, as the SDK's comment on them asks (`sdk.d.ts:232-239`), and so can change
  more than the one rule its choice's description names first.

## The claude.ai bridge

**Any Claude Code session's bridge to claude.ai is opened on its `system`/`init` message, through the Agent SDK** (SDK 0.3.308,
Claude Code 2.1.308, 2026-10-24): `enableRemoteControl(true, name, { keepSessionOnExit })`, undeclared on `Query`, read off the object
in `harness/claude/session-bridge.ts` alone (`bridgeDue`, `enableBridge`). A job asked at init (`keepSessionOnExit: false`) was answered
its facts 0.5 s later — `bridge_state: ready` and the answer at 1.5 s, `connected` at 1.7 s — long before its result at 21.1 s, during
a tool call: the answer is not queued behind the turn, and the bridge closes with the job. A long-lived session asked at init
(`keepSessionOnExit: true`) was answered the same way (init 2.8 s, answer 3.3 s, connected 3.4 s), and a second process resuming it
with `reattachSessionId` set to the first `bridge_session_id` was answered the same id and link, connected 0.5 s after its init. A
held session keeps the facts on its run file, a job's process on `<name>.bridge` beside its run; both are read by a look.
Measured on haiku, by a throwaway probe kept outside the repository.

## The MCP sign-in affordances

What the five things the factory's MCP sign-in rests on do, measured on **SDK 0.3.308 / Claude Code 2.1.308, 2026-10-22**, by a
throwaway probe: one `query()` with a held input, `settingSources: []`, a throwaway `CLAUDE_CONFIG_DIR`, and one inline http server —
`{ type: 'http', url: 'https://api.githubcopilot.com/mcp/', oauth: { clientId, callbackPort: 8791 } }` — with the Nemia Factory App's
own (public) client id. It stopped at the authorize URL: no browser, no token exchange, no sign-in, no secret. It supersedes nothing in
`izq1-measurement.md`, which measured the same five on 0.3.270; what moved is said beside each.

| affordance | declared in `sdk.d.ts`? | there? | what it answered |
| --- | --- | --- | --- |
| `Query.mcpServerStatus()` | **yes**, `sdk.d.ts:3145` | yes | one row for the inline server, `status: 'pending'` at the first call |
| `Query.mcpAuthenticate(name, redirectUri)` | no | yes | `{ authUrl, requiresUserAction: true, callbackExpected: true, redirectScheme: 'localhost', state, callbackPort: 8791 }` |
| `Query.mcpSubmitOAuthCallbackUrl(name, url)` | no | yes | refuses a URL with no code or a mismatched state, in a sentence that says to submit the redirect URL from the sign-in's own page |
| `Query.mcpClearAuth(name)` | no | yes | resolves with `{}`, and the sign-in in flight stays in flight |
| the inline http server's `oauth: { clientId, callbackPort }` | **no**, `sdk.d.ts:1237-1253` declares `type`, `url`, `headers`, `tools`, `timeout`, `alwaysLoad` and no `oauth` | yes, and **validated** | echoed back whole on `McpServerStatus.config.oauth`, and the authorize URL is built from it |

What moved from 0.3.270, for the card that designs the GitHub sign-in on this:

- **`oauth` is no longer only tolerated: the SDK's own schema declares it**, on an http and on an sse server, as
  `{ clientId?, callbackPort?, authServerMetadataUrl?, scopes?, xaa? }` (read off `sdk.mjs`). So 0.3.299's and 0.3.301's validation of
  the server map neither strips nor refuses the two keys the runtime sets — the risk the bump was most likely to realise did not
  happen — and a value of the wrong shape (a `callbackPort` that is not a positive integer, an `authServerMetadataUrl` that is not
  https) is now refused rather than ignored. It is still absent from `sdk.d.ts`, so it still rides the untyped seam
  (`harness/seam.ts`'s `RemoteMcpServer`).
- **`McpServerStatus` carries `config`, `scope`, `source` and `tools` beside the five status words.** `config` is how the `oauth`
  above was seen from outside; `source` is where the definition came from — `dynamic` for a server handed inline — and the SDK's own
  note says to key trust on it rather than on the name. The five words are what they were: `connected`, `failed`, `needs-auth`,
  `pending`, `disabled`, which `MCP_STATES` (`harness/mcp-state.ts`) carries unchanged. Nothing here reads `config`, `scope` or
  `source`, and the sign-in card is what `config` is worth reading for.
- **The first `mcpServerStatus()` of a session can answer `pending`,** where the 0.3.270 measurement saw `needs-auth` at once. MCP
  startup is non-blocking, so a caller that needs a settled word must ask again rather than read the first answer as final. Nothing in
  the runtime does that for it: `mcpServersRead` makes exactly one ask and carries whatever came back, and `MCP_STATE_MS` is a deadline
  that ends the session rather than a wait for one to settle. Reading again is the caller's — the board has a person press Check again —
  and the sign-in card's own flow must read again too, or it ships a chip stuck on `pending`.
- **A server whose connect has failed answers `failed`, with the reason on `error`,** where the same address read `pending` on 0.3.270.
  Measured here against two servers recorded for a factory, an http one at GitHub's MCP address and an sse one at `https://docs.example/mcp`,
  which resolves to nothing: the sse one came back `failed` with `SSE error: getaddrinfo ENOTFOUND docs.example`, and the http one
  `pending` on the first read and `needs-auth` on a second of the same configuration folder. So the two answers are a sequence, not a
  choice: how far a session got before it answered decides the word, and a whole configuration folder the harness has never written in
  answers `pending` for every server — measured with `CLAUDE_CONFIG_DIR` on an empty directory, where both servers read `pending`
  twice. A caller reading a word as a fact about an address reads it after a settled read, never off the first.
  This is what the e2e's `factory-servers` page was pinned to: it held each chip to `pending` or unread, which was true of 0.3.270 and
  is a race on 0.3.308, so it now holds each chip to the state the api answered for that server instead — the board's own promise, and
  true whatever the harness said.
- The three undeclared methods carry the same control-request subtypes as before (`mcp_authenticate`, `mcp_oauth_callback_url`,
  `mcp_clear_auth`), and `mcpAuthenticate`'s answer has the same six keys. The authorize URL still carries PKCE S256 and the scopes
  GitHub's MCP server asks for.
- **Unmeasured, as on 0.3.270 and deliberately:** the token exchange, which needs the owner's client secret in Claude Code's own
  store, and so whether a sign-in completes and a second session finds it. `izq1-measurement.md` measured both on 0.3.270; neither was
  re-run here, so the GitHub sign-in card either carries those two or measures them itself.

What the GitHub sign-in card measured of the CLI that stores the secret, **Claude Code 2.1.308, 2026-10-22**, each with a throwaway
`CLAUDE_CONFIG_DIR` and a scratch cwd, a fake secret, and no browser (`harness/mcp-sign-in.ts` is built on these):

- **`claude mcp add --scope local --transport http --header … --client-id … --client-secret --callback-port 8791 <name> <url>`, with
  `MCP_CLIENT_SECRET` set, files the secret under `mcpOAuthClientConfig["<name>|<sha256(JSON.stringify({type,url,headers}))[:16]>"]`**
  — the same key an inline session computes (finding 6 of `izq1-measurement.md`, there written at `--scope user`) — and adds the server to
  `.claude.json`'s `projects[<cwd>].mcpServers` alone, so no session in another folder gains it.
- **`--header` takes many values**: given last before the name, it reads the name as one more header and the add fails, `missing
  required argument 'name'`. So the headers go before the other options.
- **`claude mcp remove --scope local <name>`, from the same cwd, deletes both `mcpOAuthClientConfig[<key>]` and `mcpOAuth[<key>]`**,
  the stored secret and a stored token planted under that key. So a sign-out is that remove: a later session handed the same bytes finds
  neither, and reads `needs-auth`; a sign-in after it stores the secret again.
- **A remove finds the key only through a server added under the name**: with a token planted under `name|<key>` and no server
  added, `claude mcp remove --scope local <name>` exits 1 (`No MCP server named … in local scope`) and leaves the token; `claude mcp
  add --scope local` with no secret, then the remove, deletes it. A sign-in handed no secret adds no server, so a sign-out always adds
  first (`clearSignIn`); where one is already added the CLI refuses the second add, and the remove clears both. `mcpClearAuth` is not used: above, it resolved `{}` and
  left the sign-in in flight, and what it clears of a completed sign-in is unmeasured.
- **Unmeasured still**: the token exchange on 0.3.308, and a task session finding a sign-in made through `--scope local` with a real
  token. Both stand on `izq1-measurement.md`'s 0.3.270 sign-in and its refresh, and on the key above being the one it measured.

What the paste-back of a sign-in rests on, read **2026-11-11 on Agent SDK 0.3.322 and the Claude Code it bundles, 2.1.322**, off the installed
files and not by a probe (`harness/mcp-sign-in.ts`, `harness/mcp-callback.ts`):

- **`Query.mcpSubmitOAuthCallbackUrl(name, callbackUrl)` is now relied on**, for a browser that runs on another machine than the
  daemon, whose redirect to `http://localhost:<callbackPort>/callback` never reaches the Claude Code child listening there: the person
  pastes the address the browser landed on, and the held sign-in hands it on. It is read in `sdk.mjs` 0.3.322
  (`mcpSubmitOAuthCallbackUrl(e,t)`, a control request of the subtype `mcp_oauth_callback_url` carrying `serverName` and
  `callbackUrl`), and it is absent from `sdk.d.ts` and from the SDK's TypeScript reference, so it is called through the one
  `Authenticating` type, as `mcpAuthenticate` is, and a missing method throws naming `sdk.mjs`. The table above measured it refusing a
  URL with no code or a mismatched state on 0.3.308; the runtime refuses, before handing it on, an address that is not the sign-in's
  redirect or carries no code or no state (`callbackRefusal`, proved by `contracts/mcp-callback.contract.ts`), and leaves the state's
  match to the harness. A whole exchange by paste, with a real token, is unmeasured, as the token exchange above is.
- **`mcpAuthenticate`'s third argument, `{ redirectUriOnly }`, is refused for a server with a client id**: the bundled Claude Code says
  `MCP OAuth refused: redirectUriOnly with a configured client` where the server's config sets `oauth.clientId` (or `oauth.xaa`),
  since such a sign-in may need a callback on the child's own computer. Every server a factory signs in to names a client id, so the
  runtime never gives it, and the paste-back is the callback the child listens for, handed on by the SDK.

What a session's cost does across its processes, measured **2026-10-23 on Agent SDK 0.3.308 and the Claude Code it bundles,
2.1.308**, with Haiku, by a script on `query()` and again through `attachedSessions` (`test/live.test.ts`, *an attached session's
cost*, `AE_LIVE=1`). `total_cost_usd` is the running total of one `query()` call, and a resumed one "continues from the total its
transcript saved, when it has one" (`sdk.d.ts:6182-6185`); this is what that saving takes:

- **A process that ends cleanly saves its total, and a resumed query carries it on.** A session that ran to its result and whose
  input was closed exited 0 and appended a `cost-state` line (`totalCostUSD` equal to its result's `total_cost_usd`) to its
  transcript; a second `query()` with `resume` printed, on its first result, that total plus its own turn (0.00366 → 0.00518; through
  `attachedSessions`, 0.00466 → 0.00512, `carried` taking the parent's off). So the SDK road carries the parent on as `claude -p
  --resume` did, and `resumeCostCarried` holds for it.
- **An `interrupt` and then the end of the input end a session at work with its total saved.** Cut in a `sleep 120` call, it printed
  an `error_during_execution` result with its running total, saved a `cost-state` of the same, and exited (code 1) 313 ms after the
  interrupt was sent; through the let-go, the whole let-go took 276 ms past its wait for the call. The SDK's iterator throws on that
  error result once the input is closed (`Claude Code returned an error result`). Resumed, its first result carried the cut total on
  (0.00111 → 0.00182).
- **A process killed (`SIGKILL`) prints no result and saves nothing, and its resume counts from nothing**: the resume's first result
  was 0.00037, its own turn alone. So a holder that kills its sessions' Claude Code loses what they spent, which is why the let-go ends
  them through the SDK (`parked`, `harness/claude/attached.ts`) and kills only what outlives its bound.

## A memory limit, held by a scope

Not Claude Code's own, but the host every harness runs on: what a scope of systemd's user manager does to a limited task's process
tree (`resources.limits.memory`, `src/harness/cgroup.ts`), measured **2026-11-05 on systemd 255, kernel 6.6 (WSL2), Node 24.20**.

- **Inside a user service's cgroup (the engine's daemon run as a unit of the user manager), `systemd-run --user --scope … -p MemoryMax=67108864 -p MemorySwapMax=0 -p OOMPolicy=continue -- sh -c
  '<node allocating forever>'` ends the node child alone**: it is `Killed` (137), the shell lives on and reads its scope's
  `memory.events` `oom_kill 1` and `memory.peak` 67108864. The scope is `/user.slice/…/app.slice/run-r<id>.scope`, outside the
  service's cgroup; a `--slice=<new>.slice` is made on demand.
- **The worker in the scope beside its harness is the OOM killer's pick unless it is told otherwise**: at 64Mi, the worker
  (`node bin/ae-worker.ts`) running a `node -e` harness whose child allocates 16 MB at a time was itself `Killed`, its run file left
  `working` until the lease called it dead. With the harness given `oom_score_adj` 500 (its children inherit it; raising one's own
  needs no privilege), the child was killed, the worker wrote the end — exit 137, `memory: { limitBytes: 67108864, peakBytes: 67108864,
  oomKills: 1 }` — and exited 0. On GitHub's runner the same 64Mi task ended by its worker with another exit than its child's kill:
  three Node processes of some 40 MB each start near 64Mi, so which the kernel picks is the machine's. The boundary test runs at 256Mi,
  where the runaway child is the largest process by far (`test/memory-limit.boundary.test.ts`).
