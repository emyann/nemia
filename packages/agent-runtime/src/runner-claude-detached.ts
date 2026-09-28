/**
 * Claude Code run as `claude -p`, detached by the engine's worker rather than by the harness: the argv it is given, and
 * the spec of `claude-detached`, the harness whose output is one JSON object at its exit.
 */
import type { SpawnRequest } from './runner.ts';
import type { HarnessIO, HarnessSpec } from './harness/detached/detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './harness/claude/transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, claudeFlagsOf, claudePrintRefuses, worktreeName } from './harness/claude/vocabulary.ts';
import { claudeResultOutput } from './harness/detached/output.ts';
import { checkoutMcpConfig, claudeMcpArgs } from './harness/mcp.ts';

/**
 * The arguments `claude -p` is given, whichever of the engine's specs runs it, given how its output is to be printed: the
 * format goes first, where the brief's `-p` has already taken its value and the variadic lists after it cannot take one.
 */
export const claudePrintArgs = (r: SpawnRequest, io: HarnessIO | undefined, output: string[]): string[] => [
  '-p',
  r.brief,
  ...output,
  ...claudePrintFlags(r, io),
];

/**
 * What `claude -p` is given beside its brief and its formats: the same whether the brief is `-p`'s value or the first line
 * on its stdin (`claudeJob`). In order:
 *
 * 1. `--tools`, `--disallowedTools` and `--allowedTools`, each joined by commas: variadic, and ended by the flag after
 *    each, as for `claude --bg`. The allow list is not the fence's opposite: a rule there says a tool the session has may
 *    be used without asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write, even
 *    in the session's own cwd, so a fenced session that must write its own work is given `Edit(**)`, a glob resolved
 *    against its `cwd`: unscoped (`Write`) it would write anywhere, scoped it is denied outside. A deny still beats it.
 * 2. The caller's own flags (`config.claude`): after the variadic lists, which any flag ends, and before the mode.
 * 3. `--permission-mode`, `auto` unless the task names one.
 * 4. The MCP configurations, strict on every spawn as for `claude --bg`: the checkout's `.mcp.json` and the task's own.
 * 5. `--setting-sources project,local`, one value: a job reads `.claude/settings.json` and `settings.local.json` of its
 *    cwd, and nothing of `~/.claude/` — the user's mode, allow rules, plugins, skills, hooks, model and effort — so it does
 *    the same on any machine, and an agent's own skills do not share the listing's budget with a person's. `--settings`,
 *    `--plugin-dir` and `--mcp-config` still reach it.
 * 6. `--model` and `--effort`, where the task names them.
 * 7. `--autocompact`, the context window, as for `claude --bg`: `claude -p` compacts past it and still gives its
 *    `structured_output`.
 * 8. `--json-schema`, the closing statement's shape, as for `claude --bg`: the answer comes back as the result's
 *    `structured_output`.
 * 9. `--resume` and `--worktree`, where the task continues a session or asks for a worktree.
 * 10. `--max-budget-usd`, the spend cap: `claude -p` ends the session once a response takes it past, and says so in its
 *     result.
 */
export const claudePrintFlags = (r: SpawnRequest, io: HarnessIO | undefined): string[] => [
  ...(r.config?.tools ? ['--tools', r.config?.tools.join(',')] : []),
  ...(r.config?.disallowedTools?.length ? ['--disallowedTools', r.config?.disallowedTools.join(',')] : []),
  ...(r.config?.allowedTools?.length ? ['--allowedTools', r.config?.allowedTools.join(',')] : []),
  ...claudeFlagsOf(r.config?.claude),
  '--permission-mode',
  r.config?.permissionMode ?? 'auto',
  ...claudeMcpArgs([io?.checkoutMcpConfig, io?.mcpConfigFile]),
  '--setting-sources',
  'project,local',
  ...(r.config?.model ? ['--model', r.config?.model] : []),
  ...(r.config?.effort ? ['--effort', r.config?.effort] : []),
  ...(r.config?.contextTokens !== undefined ? ['--autocompact', String(r.config?.contextTokens)] : []),
  ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
  ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
  ...(r.config?.worktree ? ['--worktree', worktreeName(r)] : []),
  ...(r.config?.budgetUsd !== undefined ? ['--max-budget-usd', String(r.config.budgetUsd)] : []),
];

/** The regex that finds Claude Code's own session id in what `claude -p` prints. */
export const CLAUDE_SESSION_ID_PATTERN = '"session_id"\\s*:\\s*"([0-9a-f-]{16,})"';

/** The checkout's `.mcp.json`, found on disk here so that `command` stays a function of what it is given. */
export const claudePrepare = (r: SpawnRequest): Partial<HarnessIO> => {
  const found = checkoutMcpConfig(r.cwd);
  return found ? { checkoutMcpConfig: found } : {};
};

/**
 * Claude Code run as `claude -p`, detached by the engine's worker rather than by the harness, its output one JSON object.
 *
 * - `command` asks for `--output-format json`: one object when it exits, which `readOutput` reads the final answer from —
 *   text output prints only the answer's prose — and which carries the session id `nativeIdPattern` looks for.
 * - `transcript` is the one `claude --bg` writes, read the same way, but only once the session has exited: its id is in
 *   the one object `--output-format json` prints, and that is printed last.
 */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  command: (r, io) => ({ cmd: 'claude', args: claudePrintArgs(r, io, ['--output-format', 'json']) }),
  readOutput: claudeResultOutput,
  nativeIdPattern: CLAUDE_SESSION_ID_PATTERN,
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  noChannel:
    "`claude -p` listens for messages, but this harness learns its session's id only from what it prints as it exits, so nothing can be addressed to one while it runs. File the task on `claude`, whose jobs take words on their stdin, to be able to tell it something, or continue its session with a new task that carries the words (`resumeFrom`).",
  prepare: claudePrepare,
  refuses: claudePrintRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  claudeFlags: true,
};
