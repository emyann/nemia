# Claude Code, as a harness

What Claude Code does as the steps meet it, measured at the version each line names: its fences and how a rule is matched, what a job
has that a background session has not, trust, the bridge to claude.ai, and what it exports. A measurement here is a floor read on a
release, never a promise of the next one — re-measure before you lean on it, and name the version and the day beside what you read.

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
- **An idle `--remote-control` session lists `blocked`, `idle`, with a `pid` and no `waitingFor`; a `stopped` row lists no `pid`**:
  `held` is the `pid` (`ourRow`). `--bg` needs a trusted `cwd`, and words `say` sends reach the model framed as a peer's, not
  the person's.
- **Claude Code respawns a `--bg` process that died, on the same session, ~10 s later; a `--resume` given flags forks a new
  session.** Never resume a session it is respawning: a long-lived restart waits for the old one's end and release
  (`restartOf`, `src/core/long-lived.test.ts`); its listing in the gap is `blocked` with no `pid` (`respawning`). Whether the fork's
  copies of its parent's lines keep their uuids is unmeasured (2026-10-07: no probe resumes); nothing reads either way on it: a follow
  starts at the transcript's end (`bgFollowOf`), and a `moved` starts the board's conversation afresh.
- **A job (`claude -p`) never waits on a prompt; a background session in a folder nobody opened blocks in any mode that can ask**:
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
  once.
- **`Bash(claude *--bg*)`, `Bash(claude *--background*)` and `Bash(claude *remote-control*)` refuse an `auto` job's own session, a
  `cd … &&` before it included, by the rule** (2.1.291, 2026-10-06): a step starts a probe through `workflows/build/probe.ts` alone.
- **A path inside `Read(//…)` or `Edit(//…)` carries a space, a comma and braces; `*`, `?` and `[` widen it, and a `\` misses its own
  folder** (2.1.291, 2026-10-06, allow and deny alike): `CLAUDE_UNRULED` holds the set, with `(`/`)` the runtime's `RULE` refuses;
  `\*` is read as an escape, unused yet.
- **A project's allow rules are dropped in a directory Claude Code has not trusted**: measure a rule in a trusted checkout.
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
- **A job (`claude -p`) exports logs, metrics and traces from its environment over `http/json`, flushed at exit, and joins `TRACEPARENT`**;
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
  at each bump and never carried.
- **The SDK joins most of the flags it builds for Claude Code as `--flag=value`, and a few as two arguments** (0.3.308, read off
  `sdk.mjs`, 2026-10-22; the change landed in 0.3.295): joined for the mode, the prompts, the tool lists, the setting sources,
  `--add-dir`, `--plugin-dir`, `--resume`, `--model`, `--effort`; two arguments for `--mcp-config`, `--managed-settings` and every
  `extraArgs` key, `--settings` among them — those it joins only where the value itself opens with a dash — beside the four it opens
  with (`--output-format stream-json --verbose --input-format stream-json`). A test that read such a value as
  `argv[argv.indexOf(flag) + 1]` answered `argv[0]` without failing, since `indexOf` gives -1; both packages that read an SDK-written
  argv now read it through a `sdkArgValue` that takes either form and refuses an absent flag (`test/sdk-argv.ts`).
- **Fork subagents are on by default in an SDK session from 0.3.302, as in the terminal**, so a step's `Agent` call forks the parent's
  context rather than starting fresh, and costs tokens the run's budgets were measured without. The factory keeps the SDK's default, by
  the operator's decision at this bump; `CLAUDE_CODE_FORK_SUBAGENT=0` in `CLAUDE_JOB_ENV` (`harness/claude/code.ts`) turns it off, and
  no test here watches it — the first evidence is the spend after the daemon restarts.

## The MCP sign-in affordances

What the five things the factory's MCP sign-in rests on do, measured on **SDK 0.3.308 / Claude Code 2.1.308, 2026-10-22**, by a
throwaway probe: one `query()` with a held input, `settingSources: []`, a throwaway `CLAUDE_CONFIG_DIR`, and one inline http server —
`{ type: 'http', url: 'https://api.githubcopilot.com/mcp/', oauth: { clientId, callbackPort: 8791 } }` — with the Nemia Factory App's
own (public) client id. It stopped at the authorize URL: no browser, no token exchange, no sign-in, no secret. It supersedes nothing in
`izq1-measurement.md`, which measured the same five on 0.3.270; what moved is said beside each.

| affordance | declared in `sdk.d.ts`? | there? | what it answered |
| --- | --- | --- | --- |
| `Query.mcpServerStatus()` | **yes**, `sdk.d.ts:3078` | yes | one row for the inline server, `status: 'pending'` at the first call |
| `Query.mcpAuthenticate(name, redirectUri)` | no | yes | `{ authUrl, requiresUserAction: true, callbackExpected: true, redirectScheme: 'localhost', state, callbackPort: 8791 }` |
| `Query.mcpSubmitOAuthCallbackUrl(name, url)` | no | yes | refuses a URL with no code or a mismatched state, in a sentence that says to submit the redirect URL from the sign-in's own page |
| `Query.mcpClearAuth(name)` | no | yes | resolves with `{}`, and the sign-in in flight stays in flight |
| the inline http server's `oauth: { clientId, callbackPort }` | **no**, `sdk.d.ts:1205-1220` declares `type`, `url`, `headers`, `tools`, `timeout`, `alwaysLoad` and no `oauth` | yes, and **validated** | echoed back whole on `McpServerStatus.config.oauth`, and the authorize URL is built from it |

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
  startup is non-blocking, so a caller that needs a settled word must ask again rather than read the first answer as final — which
  `mcpServersRead` already does under `MCP_STATE_MS`, and which the sign-in card's own flow must do too.
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
