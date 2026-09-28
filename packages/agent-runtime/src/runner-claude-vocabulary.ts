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
 * Claude Code's `--permission-mode` refuses any other word while it parses its arguments, and takes
 * `default`, which its help does not list. `file()` asks before a task is journalled: refused at
 * spawn instead, a bad mode would fail the whole tick, on every pass.
 */
export const CLAUDE_PERMISSION_MODES: readonly string[] = [
  'acceptEdits',
  'auto',
  'bypassPermissions',
  'default',
  'dontAsk',
  'manual',
  'plan',
];

/**
 * The efforts Claude Code takes. Refused here rather than left to the CLI, because the CLI does not
 * refuse one: it prints a warning for an unknown `--effort` and runs at its default effort — a knob
 * that silently does nothing.
 */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The context windows Claude Code takes, in tokens: `--autocompact`'s range, both ends included. The CLI refuses any other
 * value while it parses its arguments ("It must be 'auto', or between 100k and 1M"), so a `--bg` spawn given one would fail
 * on every pass; `file()` asks first. 100000 and 1000000 are taken, 99999 and 1000001 refused. A value is handed over as its digits, never `200k` — and never below 1000, which the CLI reads as thousands (`200` is 200k).
 */
export const CLAUDE_CONTEXT_TOKENS: { least: number; most: number } = { least: 100_000, most: 1_000_000 };

/**
 * Flags handed to Claude Code as they are, by a caller that knows them (`config.claude`): `{ appendSystemPromptFile: 'a.md',
 * pluginDir: ['p'] }` is `--append-system-prompt-file a.md --plugin-dir p`. A key is the flag in camelCase; `true` is the
 * flag alone, a string or a number the flag and its value, and a list the flag once per entry. The four named are the ones
 * agent-orchestrator gives; any other the CLI has is taken, and one it does not have ends the session at its start, exit 1,
 * with the CLI's words on its stderr, which the attempt's logs keep. What the runtime gives itself is refused
 * (`CLAUDE_OWNED_FLAGS`).
 */
export type ClaudeFlags = {
  /** A file whose text is appended to Claude Code's own system prompt, which is kept. */
  appendSystemPromptFile?: string;
  /** A file whose text replaces Claude Code's system prompt. */
  systemPromptFile?: string;
  /** Directories each loaded as a plugin for the session alone: its skills are named `<plugin>:<skill>`. */
  pluginDir?: string[];
  /** Settings for the session alone, as a file or as JSON: `{"outputStyle":"<plugin>:<style>"}`. */
  settings?: string;
  /**
   * Bridge a background session to claude.ai (`--remote-control`, with a name for it as a string), where anyone signed in to the
   * account can drive it — type into it, answer its prompts, stop it — from a browser or a phone. Never a default, for that reason.
   * A journal an older runtime wrote may carry it as a harness argument of its own, which `upgrade` moves here (`FORMER_ARGS`).
   * Refused on a job — `claude -p` opens no bridge — and on any
   * harness but Claude Code; a harness brought as a `PromiseRunner` is handed it on the spawn and asked nothing.
   */
  remoteControl?: true | string;
  [flag: string]: string | number | true | string[] | undefined;
};

/**
 * The flags the runtime gives Claude Code itself, or that change how it reads the session, in `config.claude`'s camelCase:
 * a task that gave one there would have it twice, or the session printing what no reader of it expects. Each is given its
 * own way — `model`, `permissionMode`, `tools`, `budgetUsd` and the rest are harness arguments of their own. The argv of
 * every Claude Code spawn is held to this list (`test/claude-code.test.ts`), so a flag the runtime starts giving is added.
 * `settingSources` is given to every job, which reads its checkout's settings and not the operator's (`claudePrintFlags`),
 * and not to a background session.
 */
export const CLAUDE_OWNED_FLAGS: readonly string[] = [
  'print',
  'p',
  'bg',
  'name',
  'inputFormat',
  'outputFormat',
  'verbose',
  'resume',
  'continue',
  'sessionId',
  'forkSession',
  'permissionPrompts',
  'permissionMode',
  'dangerouslySkipPermissions',
  'allowDangerouslySkipPermissions',
  'model',
  'effort',
  'tools',
  'disallowedTools',
  'allowedTools',
  'mcpConfig',
  'strictMcpConfig',
  'noChrome',
  'chrome',
  'autocompact',
  'jsonSchema',
  'worktree',
  'maxBudgetUsd',
  'settingSources',
];

/** A camelCase key as Claude Code's flag: `appendSystemPromptFile` is `--append-system-prompt-file`. */
export const claudeFlagName = (key: string): string => `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** A task's `config.claude` as Claude Code's arguments, in the order written: a flag and its value, or the flag alone for `true`. */
export const claudeFlagsOf = (flags: ClaudeFlags | undefined): string[] =>
  Object.entries(flags ?? {}).flatMap(([key, value]) => {
    const flag = claudeFlagName(key);
    if (value === undefined) return [];
    if (value === true) return [flag];
    if (Array.isArray(value)) return value.flatMap((v) => [flag, v]);
    return [flag, String(value)];
  });

/**
 * Whether a task asks for its session bridged to claude.ai: Claude Code's `--remote-control`, given in its flags
 * (`config.claude.remoteControl`). Only a background session opens one.
 */
export const bridgeAsked = (task: { config?: { claude?: ClaudeFlags } }): boolean => task.config?.claude?.remoteControl !== undefined;

/** What Claude Code cannot be asked for, as a sentence that says what to write instead. */
export const claudeRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const { permissionMode, effort } = task.config ?? {};
  const owned = Object.keys(task.config?.claude ?? {}).find((key) => CLAUDE_OWNED_FLAGS.includes(key));
  if (owned) {
    return `\`claude.${owned}\` is a flag the runtime gives Claude Code itself (\`${claudeFlagName(owned)}\`), and the session would have it twice. Give it as the harness argument of its own where there is one — \`model\`, \`permissionMode\`, \`tools\`, \`budgetUsd\` and the rest — or leave it out.`;
  }
  if (permissionMode !== undefined && !CLAUDE_PERMISSION_MODES.includes(permissionMode)) {
    return `\`permissionMode: ${permissionMode}\` is not a mode Claude Code has. Its modes are: ${CLAUDE_PERMISSION_MODES.join(', ')}.`;
  }
  if (effort !== undefined && !CLAUDE_EFFORTS.includes(effort)) {
    return `\`effort: ${effort}\` is not an effort Claude Code has. Its efforts are: ${CLAUDE_EFFORTS.join(', ')}.`;
  }
  return undefined;
};

/**
 * What Claude Code run as `claude -p` cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a bridge to claude.ai,
 * which only a background session opens, and which `claudeFlagsOf` would otherwise spell onto a prompt that runs and exits. The
 * engine's own door words it with the harnesses that do bridge (`harnessRefusalOf` in `facade.ts`); this is the Effect door's.
 */
export const claudePrintRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined =>
  claudeRefuses(task) ??
  (bridgeAsked(task)
    ? '`claude.remoteControl` asks for a session bridged to claude.ai, and `claude -p` runs a prompt and exits: only a Claude Code background session (`claude --bg --remote-control`) is bridged. Leave `claude.remoteControl` off.'
    : undefined);

/**
 * What a Claude Code background session cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a spend
 * cap. `claude --bg` takes `--max-budget-usd` and keeps nothing of it — its help says the flag "only works with --print",
 * and a `--bg` session given a cap spends past it and ends on its own (`test/live.test.ts`). A cap that caps nothing is refused rather than carried; `claude -p` keeps one.
 */
export const claudeBgRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined =>
  claudeRefuses(task) ??
  (task.config?.budgetUsd === undefined
    ? undefined
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
    return task.config?.budgetUsd === undefined
      ? undefined
      : `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session given a $0.01 cap spent $0.19 (2.1.272, measured). Leave \`config.background\` off to run the task as a job (\`claude -p\`), which ends the session at its cap, or leave \`budgetUsd\` off.`;
  }
  return bridgeAsked(task)
    ? '`claude.remoteControl` bridges a session to claude.ai, and only a background session (`claude --bg`) can be bridged: a job runs `claude -p`, which opens no bridge. Give `config.background: true` as well, or leave `claude.remoteControl` off.'
    : undefined;
};

/**
 * A worktree name for this attempt. Derived from the session name when the task did not pick one,
 * so it is stable, greppable, and — the point — never absent.
 */
export const worktreeName = (r: SpawnRequest): string =>
  typeof r.config?.worktree === 'string' ? r.config.worktree : r.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
