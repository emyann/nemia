# apps/api

The api: Nemia's store and its daemon behind HTTP, the board's server side.

## The quota on the board

The Factory's header shows how much of the subscription's five-hour window and week is used, each with its
reset in your own time zone, and how old the reading is. Nothing to install: `GET /api/quota` asks the runtime's `claude` harness for its
`quota`, which asks Claude Code itself its usage question through the Agent SDK, and serves the answer. It asks the Claude Code the
sessions run — the one `AE_CLAUDE_EXECUTABLE` names in the api's environment, else the one activated in the tools folder
(`nemia doctor fix claude`), else the Agent SDK's own where a checkout carries it — never a
`claude` on PATH, at most once every 10 minutes, one ask at a time, and only while a board asks (`HKB_QUOTA_KEEP_MS` sets the keep; `0`
asks on every read). A read is never answered by an ask that began more than the keep before it (with `0`, only by one that began after
it), and a reading's age counts from when its ask began. A read waits 2 s for its ask before it says it is asking (`HKB_QUOTA_WAIT_MS`):
with a keep shorter than an ask lasts, set a wait longer than one, or every read starts an ask it does not wait out.
An ask is one short query of the Agent SDK that makes no model turn and spends nothing:

```ts
query({ prompt, options: { cwd: os.tmpdir(), persistSession: false, settingSources: [] } }) // pathToClaudeCodeExecutable only where one is named
  .usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
```

The SDK starts that Claude Code with arguments of its own choosing and sends it the `get_usage` control request; which
Claude Code it starts is the one thing the runtime names, so the quota is read by the Claude Code the sessions run
on. It writes no transcript, starts no MCP server and loads no settings, so no hook runs; it runs from the temp directory with
the variables a Claude Code session hands its children taken out, should the api run inside one; how it signs in
(`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, a provider's switch) is kept, as the engine's workers keep it. That claude must be
signed in to the subscription under the api's `CLAUDE_CONFIG_DIR` (that Claude Code, then `/login`; the header names it by its
path, which on an install with no Claude Code of its own is the release's): an API key, Bedrock
or Vertex has no plan limits to show, and nor has a token of `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`, which `nemia claude-token
set` keeps), which can make model requests but not read the plan's usage: Claude Code answers it no plan limits without asking, and
the header says so in its own words, with what would make it answer — a `/login` and the token taken away (`nemia claude-token rm`).

To check it:

```bash
nemia quota          # each window's used share and its reset; the Factory's header shows them
nemia quota --json   # the whole answer: state "fresh", with its windows
```

Every other state is a sentence on the header saying what to do, and never a number read as the quota:
`asking` (the first ask, still out), `no-plan` (not signed in to a subscription, or signed in by a token), `unanswered` (see below),
`no-claude` (the Claude Code the sessions run is not there), `timeout` (no answer in 15 s), `failed` (claude stopped first; its last line
of stderr is quoted) and `unknown` (an answer this board does not read — `get_usage` is experimental in Claude
Code, and a new version may change it). Under the sentence, the last good reading stays in sight, dimmed and
dated (`as of 11:20, 25 min ago`), for up to six hours; past that it goes.

**`unanswered`: the usage service gave nothing.** Claude Code signed in to a subscription answers
`rate_limits_available: true` with `rate_limits: null` when Anthropic's usage service did not give it the windows:
2.1.278's `--debug` log then says `Usage fetch returned a fieldless or non-object body (in-band error)`. The service
may be limiting how often the account asks — that cannot be told from outside, and the board does not claim it —
so the board asks less often: 20 minutes after the first such answer, then 40, 80, 160, and every 4 hours for as
long as it lasts; the first good reading begins it again. `HKB_QUOTA_BACKOFF_MS` sets the first wait (`0` asks on
every read). The waits are kept in the api's memory, as the rest is: a restart costs one ask.

**Why not the Agent SDK.** `@anthropic-ai/claude-agent-sdk` (0.3.325, re-read 2026-11-14) has the same request as
`query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors })`, typed
`SDKControlGetUsageResponse`: it writes the same control request to the same `claude`, and would get the same
answers, `rate_limits: null` included (its type says "or null when unavailable"). The api asks the CLI itself and
does not take the SDK's type either: the SDK is the engine's dependency, not the api's, and the api reads the
answer defensively, as `unknown`, should a version change it.

If you installed the statusline an earlier version of this board asked for, take its `statusLine` block out of
`~/.claude/settings.json` and delete `~/.agent-workflows/quota.json`: nothing reads either now.
