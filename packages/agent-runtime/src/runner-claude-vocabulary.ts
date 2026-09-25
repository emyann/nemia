/**
 * Claude Code's vocabulary — the permission modes, efforts and context windows it takes — and what it refuses to be
 * asked for, as sentences. Harness vocabulary, so it lives beside the runners
 * that speak it and never in `domain.ts`.
 */
import type { SpawnRequest } from './runner.ts';

/**
 * The permission modes Claude Code takes. Harness vocabulary, so it lives beside the runner that
 * speaks it and never in `domain.ts`.
 *
 * As the CLI checks them on 2.1.270: `--permission-mode` refuses any other word while it parses its
 * arguments, and still takes `default`, which its help no longer lists. `file()` asks before a task
 * is journalled. Refused at spawn instead, a bad mode failed the whole tick, on every pass.
 */
export const CLAUDE_PERMISSION_MODES: readonly string[] = ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'manual', 'plan'];

/**
 * The efforts Claude Code takes. Refused here rather than left to the CLI, because the CLI does not
 * refuse one: 2.1.270 prints a warning for an unknown `--effort` and runs at its default effort —
 * a knob that silently does nothing.
 */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The context windows Claude Code takes, in tokens: `--autocompact`'s range, both ends included. The CLI refuses any other
 * value while it parses its arguments ("It must be 'auto', or between 100k and 1M"), so a `--bg` spawn given one would fail
 * on every pass; `file()` asks first. Measured on 2.1.278: 99999 and 1000001 refused, 100000 and 1000000 taken. A value is
 * handed over as its digits, never `200k` — and never below 1000, which the CLI reads as thousands (`200` is 200k).
 */
export const CLAUDE_CONTEXT_TOKENS: { least: number; most: number } = { least: 100_000, most: 1_000_000 };

/** What Claude Code cannot be asked for, as a sentence that says what to write instead. */
export const claudeRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const { permissionMode, effort } = task.config ?? {};
  if (permissionMode !== undefined && !CLAUDE_PERMISSION_MODES.includes(permissionMode)) {
    return `\`permissionMode: ${permissionMode}\` is not a mode Claude Code has. Its modes are: ${CLAUDE_PERMISSION_MODES.join(', ')}.`;
  }
  if (effort !== undefined && !CLAUDE_EFFORTS.includes(effort)) {
    return `\`effort: ${effort}\` is not an effort Claude Code has. Its efforts are: ${CLAUDE_EFFORTS.join(', ')}.`;
  }
  return undefined;
};

/**
 * What a Claude Code background session cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a spend
 * cap. `claude --bg` takes `--max-budget-usd` and keeps nothing of it — its help says the flag "only works with --print",
 * and a `--bg` session given a $0.01 cap read a file 42 times, spent $0.19 and ended `done` (measured on 2.1.272, and by
 * `test/live.test.ts`). A cap that caps nothing is refused rather than carried; `claude -p` keeps one.
 */
export const claudeBgRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => claudeRefuses(task) ?? (task.config?.budgetUsd === undefined ? undefined
  : `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session given a $0.01 cap spent $0.19 (2.1.272, measured). File the task on \`claude-detached\`, which runs \`claude -p\` and ends the session at its cap, or leave \`budgetUsd\` off.`);

/**
 * What Claude Code cannot be asked for as the engine runs it by default, in the mode the task chose. A job (`claude -p`, the
 * default) refuses what Claude Code does, and a bridge to claude.ai, which only a background session can open — so the
 * refusal names the key that makes one. A background session (`config.background: true`) refuses what `claude --bg` does,
 * a spend cap among it, and names the mode that keeps one.
 */
export const claudeCodeRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const refused = claudeRefuses(task);
  if (refused) return refused;
  if (task.config?.background) {
    return task.config?.budgetUsd === undefined ? undefined
      : `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session given a $0.01 cap spent $0.19 (2.1.272, measured). Leave \`config.background\` off to run the task as a job (\`claude -p\`), which ends the session at its cap, or leave \`budgetUsd\` off.`;
  }
  return task.config?.remoteControl
    ? '`remoteControl: true` bridges a session to claude.ai, and only a background session (`claude --bg`) can be bridged: a job runs `claude -p`, which opens no bridge. Give `config.background: true` as well, or leave `remoteControl` off.'
    : undefined;
};

/**
 * A worktree name for this attempt. Derived from the session name when the task did not pick one,
 * so it is stable, greppable, and — the point — never absent.
 */
export const worktreeName = (r: SpawnRequest): string =>
  typeof r.config?.worktree === 'string' ? r.config.worktree : r.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
