/**
 * Claude Code run as `claude -p`, detached by us rather than by the harness: its spec.
 */
import type { SpawnRequest } from './runner.ts';
import type { HarnessIO, HarnessSpec } from './runner-detached.ts';
import { claudeTranscriptEvents, claudeTranscriptFile } from './runner-claude-transcript.ts';
import { CLAUDE_CONTEXT_TOKENS, claudeFlagsOf, claudeRefuses, worktreeName } from './runner-claude-vocabulary.ts';
import { claudeResultOutput } from './runner-detached-output.ts';
import { checkoutMcpConfig, claudeMcpArgs } from './runner-mcp.ts';

/**
 * The arguments `claude -p` is given, whichever of the engine's specs runs it, given how its output is to be printed: the
 * format goes first, where the brief's `-p` has already taken its value and the variadic lists after it cannot take one.
 */
export const claudePrintArgs = (r: SpawnRequest, io: HarnessIO | undefined, output: string[]): string[] => [
  '-p', r.brief,
  ...output,
  ...claudePrintFlags(r, io),
];

/**
 * What `claude -p` is given beside its brief and its formats: the same whether the brief is `-p`'s value or the first line
 * on its stdin (`claudeJob`).
 */
export const claudePrintFlags = (r: SpawnRequest, io: HarnessIO | undefined): string[] => [
  // Variadic, and ended by the flag after it, as for `claude --bg`.
  ...(r.config?.tools ? ['--tools', r.config?.tools.join(',')] : []),
  ...(r.config?.disallowedTools?.length ? ['--disallowedTools', r.config?.disallowedTools.join(',')] : []),
  // The allow list, which is not the fence's opposite: a rule here says a tool the session HAS may be used
  // without asking a person who is not there. In `dontAsk` a mode that never asks also never allows a write —
  // measured on 2.1.278, in a fresh directory with no settings file, Write was denied in the session's own cwd —
  // so a fenced session that must write its own work is given `Edit(**)`, a glob resolved against its `cwd`.
  // Unscoped (`Write`) it would write anywhere; scoped it is denied outside. Variadic, joined and ended as the two
  // lists above are, and a deny still beats it.
  ...(r.config?.allowedTools?.length ? ['--allowedTools', r.config?.allowedTools.join(',')] : []),
  // The caller's own flags (`config.claude`): after the variadic lists, which any flag ends, and before the mode.
  ...claudeFlagsOf(r.config?.claude),
  '--permission-mode', r.config?.permissionMode ?? 'auto',
  // Strict on every spawn, as for `claude --bg`: the checkout's `.mcp.json` and the task's own.
  ...claudeMcpArgs([io?.checkoutMcpConfig, io?.mcpConfigFile]),
  ...(r.config?.model ? ['--model', r.config?.model] : []),
  ...(r.config?.effort ? ['--effort', r.config?.effort] : []),
  // The context window, as for `claude --bg`: `claude -p` compacts past it and still gives its `structured_output` (2.1.278).
  ...(r.config?.contextTokens !== undefined ? ['--autocompact', String(r.config?.contextTokens)] : []),
  // The closing statement's shape, as for `claude --bg`; the answer comes back as the result's
  // `structured_output`. It used to be dropped, so a task on this harness never gave a closeout.
  ...(r.closeoutSchema ? ['--json-schema', JSON.stringify(r.closeoutSchema)] : []),
  ...(r.resumeFrom ? ['--resume', r.resumeFrom] : []),
  ...(r.config?.worktree ? ['--worktree', worktreeName(r)] : []),
  // The spend cap: `claude -p` ends the session once a response takes it past, and says so in its result.
  ...(r.config?.budgetUsd !== undefined ? ['--max-budget-usd', String(r.config.budgetUsd)] : []),
];

/** The regex that finds Claude Code's own session id in what `claude -p` prints. */
export const CLAUDE_SESSION_ID_PATTERN = '"session_id"\\s*:\\s*"([0-9a-f-]{16,})"';

/** The checkout's `.mcp.json`, found on disk here so that `command` stays a function of what it is given. */
export const claudePrepare = (r: SpawnRequest): Partial<HarnessIO> => {
  const found = checkoutMcpConfig(r.cwd);
  return found ? { checkoutMcpConfig: found } : {};
};

/** Claude Code run the same way — detached by us rather than by the harness. For comparison. */
export const claudeDetached: HarnessSpec = {
  name: 'claude-detached',
  // One JSON object when it exits, which `readOutput` reads the final answer from — text output
  // prints only the answer's prose — and which carries the session id `nativeIdPattern` looks for.
  command: (r, io) => ({ cmd: 'claude', args: claudePrintArgs(r, io, ['--output-format', 'json']) }),
  readOutput: claudeResultOutput,
  nativeIdPattern: CLAUDE_SESSION_ID_PATTERN,
  // The same transcript `claude --bg` writes, read the same way — but only once the session has exited:
  // its id is in the one object `--output-format json` prints, and that is printed last.
  transcript: { file: claudeTranscriptFile, events: claudeTranscriptEvents },
  noChannel: "`claude -p` listens for messages, but this harness learns its session's id only from what it prints as it exits, so nothing can be addressed to one while it runs. File the task on `claude`, whose jobs take words on their stdin, to be able to tell it something, or continue its session with a new task that carries the words (`resumeFrom`).",
  prepare: claudePrepare,
  refuses: claudeRefuses,
  contextTokens: CLAUDE_CONTEXT_TOKENS,
  claudeFlags: true,
};
