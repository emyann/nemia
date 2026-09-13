# Response to review

## 1. `packages/agent-engine/src/runner.ts:250` — a relative `cwd` names `repo/.mcp.json` inside `repo`

**Fixed.** You are right: Claude Code resolves `--mcp-config` from inside the session's working
directory, so a relative config path is resolved twice. Only an API caller can hit it — `ae start`
already resolves `cwd` before filing — but `file()` accepts a relative one, so the runner has to
cope. `checkoutMcpConfig` now returns `path.resolve(cwd, '.mcp.json')`, and `writeMcpConfig` returns
the resolved path of the file it wrote, because the engine's root can be relative too
(`createEngine({ root: 'board' })`, or a relative `AE_ROOT`) and the task's own config had the same
defect. Both Claude runners use these two functions, so both get absolute paths.

Test (`test/mcp.test.ts`): from a temporary parent directory, `claudeOps({ root: 'board' })` spawns
a task with `cwd: 'repo'` and an `mcp`. The argv must name
`<parent>/repo/.mcp.json` and `<parent>/board/mcp/ae_t_1.json`, and each must exist when resolved
from inside `repo`, which is what Claude Code does. Against the code as reviewed, the argv named
`repo/.mcp.json` and `board/mcp/ae_t_1.json`.

While checking this I found the older half of the same trap, which predates this change: a detached
harness (`codex`, `claude-detached`) given a relative `cwd` does not start at all. Its worker is
launched in `cwd` and launches the harness in `cwd` again, from inside it. Measured with `sh` as the
harness: `spawn sh ENOENT`, attempt failed. I recorded it as open issue 10 and did not fix it: the
fix is `file()` resolving or refusing a relative `cwd`, which changes what the API accepts, and
that is beyond answering this finding.

## 2. `packages/agent-engine/src/runner-detached.ts:331` — a task server named like an operator's Codex server

**Fixed**, and it is worse than the finding says. A transport mismatch fails to load, as you wrote.
A matching transport does not fail: it silently mixes the two. Measured on codex-cli 0.154.0 with
`codex mcp get --json`: an operator `[mcp_servers.probe]` with `args = ["operator-arg"]` and
`env.SECRET = "operator"`, plus a task's `{"probe"={"command"="cat"}}`, resolves to command `cat`
with args `["operator-arg"]` and env `SECRET=operator`. The task's server would run with the
operator's arguments and secret.

The Codex spec's `prepare` already reads `config.toml` for trust. It now also reads the MCP server
names there (`codexMcpServerNames`: the `[mcp_servers.<name>]` tables and the tables under them,
as `codex mcp add` writes them). If the task's `mcp` uses one of those names, `prepare` throws.
In the detached runner that refuses the spawn: the attempt ends `unstartable`, naming the servers,
the file and the fix (give the task's server another name). It is refused at spawn, not in `file()`,
because the config that matters is the one Codex reads when the session starts, and it can change
after filing.

The limit is deliberate and written down. An inline `mcp_servers = {…}` table, or a profile, is not
read, and a name missed there meets Codex's merge, as it did before. This is a refusal of a known-bad
case, not a claim of isolation, so a miss makes nothing look safer than it is. Replacing the
operator's entry instead of refusing is not possible: every `-c` form merges.

Tests (`test/mcp.test.ts`, at shipped defaults with a `CODEX_HOME` whose `config.toml` has
`browser` as a url server and `docs` with a secret env):
- a task naming both is refused, Codex never runs, and the error names both servers;
- a task with a name the operator does not use is given to Codex;
- the name reader takes tables and sub-tables, quoted or bare, and nothing else.

I also made the existing Codex spawn tests hermetic. They read this machine's real
`~/.codex/config.toml`, so an operator with a `browser` server would have failed them.
