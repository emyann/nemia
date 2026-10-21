/**
 * What an attached Claude Code session is given, as the Agent SDK takes it (`Options`): the same fence, folders, settings, servers,
 * model, budget and closing statement `claude -p` is given for the same task (`claudePrintFlags`), each on the SDK's own option where
 * it has one, and on `extraArgs` where it has none. Pure but for the files it reads — the checkout's `.mcp.json` and the agent's own
 * prompt — and it writes none: the servers ride `Options.mcpServers` and the prompt `Options.systemPrompt`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { SpawnRequest } from '../seam.ts';
import { CLAUDE_DEFAULT_MODE, claudeAllows, claudeDenies, claudeFlagName, worktreeName, type ClaudeFlags } from './vocabulary.ts';
import { admittedFlags } from './admission.ts';
import { memorylessSettings } from './memory.ts';
import { claudeTelemetryEnv } from './telemetry.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import { everyMcpServer } from '../mcp.ts';
import { withoutTelemetry } from '../telemetry.ts';

/** The options of `Options` this file sets: what `query()` is given, beside its prompt and the runner's own callbacks. */
export type AttachedOptions = Pick<
  Options,
  | 'cwd'
  | 'tools'
  | 'allowedTools'
  | 'disallowedTools'
  | 'additionalDirectories'
  | 'permissionMode'
  | 'settingSources'
  | 'settings'
  | 'systemPrompt'
  | 'mcpServers'
  | 'strictMcpConfig'
  | 'model'
  | 'effort'
  | 'maxBudgetUsd'
  | 'outputFormat'
  | 'resume'
  | 'plugins'
  | 'extraArgs'
  | 'env'
  | 'includePartialMessages'
>;

/** One flag's value as `extraArgs` takes it: a string, or null for a switch; refused where it repeats the flag. */
const extraValueOf = (key: string, value: string | number | true | string[]): string | null => {
  if (value === true) return null;
  if (!Array.isArray(value)) return String(value);
  if (value.length === 1) return value[0];
  throw new Error(
    `\`config.claude.${key}\` gives ${value.length} values, and an attached session takes one per flag. Give one, or file the task on \`claude-detached\`.`,
  );
};

/** The text of the prompt file `key` names, refused — saying what to do — where it cannot be read. */
const promptText = (key: string, file: string): string => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(
      `\`config.claude.${key}\` names ${file}, which cannot be read (${(e as Error).message}), and an attached session is given the prompt's text on the SDK's \`systemPrompt\`, not the file's path. Write the file before the task is spawned, or take the key off the task.`,
      { cause: e },
    );
  }
};

/**
 * The session's system prompt, as `Options.systemPrompt` takes it (`sdk.d.ts:2247-2257`): Claude Code's own preset with the agent's
 * prompt appended to it (`appendSystemPromptFile`), the prompt file's text alone in place of Claude Code's (`systemPromptFile`), or
 * the bare preset where the task names neither — asked for even then, because the SDK sends an empty system prompt when
 * `systemPrompt` is unasked, and a `claude -p` job has Claude Code's own.
 *
 * Refused, naming both keys and the harness that takes both flags, where a task gives both: the SDK has the one option where the CLI
 * had two flags, and what Claude Code does given both is unmeasured, so the runtime does not choose for the person.
 */
const promptOf = (append: string | undefined, replace: string | undefined): Options['systemPrompt'] => {
  if (append !== undefined && replace !== undefined) {
    throw new Error(
      "`config.claude.appendSystemPromptFile` and `config.claude.systemPromptFile` are both given, and an attached session carries the one `systemPrompt` the Agent SDK takes: a prompt appended to Claude Code's own, or a prompt in place of it, never both. Give one of the two, or file the task on `claude-detached`, which takes both flags.",
    );
  }
  if (replace !== undefined) return promptText('systemPromptFile', replace);
  return {
    type: 'preset',
    preset: 'claude_code',
    ...(append === undefined ? {} : { append: promptText('appendSystemPromptFile', append) }),
  };
};

/**
 * `config.claude` as `extraArgs` takes it, each flag by its name without `--`, with its plugin folders apart, its settings apart
 * with the session's auto-memory off in them (`memorylessSettings`), as the SDK's own `settings` option takes them (an object, or a
 * file's path as given, which the runtime does not rewrite), and its prompt files apart as the SDK's own `systemPrompt`
 * (`promptOf`).
 */
const extraOf = (
  flags: ClaudeFlags | undefined,
): {
  extra: Record<string, string | null>;
  plugins: string[];
  settings: Options['settings'];
  systemPrompt: Options['systemPrompt'];
} => {
  const { pluginDir, settings, appendSystemPromptFile, systemPromptFile, ...rest } = flags ?? {};
  const given = Object.entries(rest).filter((e): e is [string, string | number | true | string[]] => e[1] !== undefined);
  return {
    extra: Object.fromEntries(given.map(([key, value]) => [claudeFlagName(key).slice(2), extraValueOf(key, value)])),
    plugins: pluginDir ?? [],
    settings: memorylessSettings(settings) ?? settings,
    systemPrompt: promptOf(appendSystemPromptFile, systemPromptFile),
  };
};

/** The fence: the tools, the denies and allows (`claudeDenies`, `claudeAllows`), and the mounts as added folders. */
const fenceOf = (c: SpawnRequest['config']): AttachedOptions => {
  const denies = claudeDenies(c);
  const allows = claudeAllows(c);
  return {
    ...(c?.tools ? { tools: c.tools } : {}),
    ...(denies.length ? { disallowedTools: denies } : {}),
    ...(allows.length ? { allowedTools: allows } : {}),
    ...(c?.mounts?.length ? { additionalDirectories: c.mounts.map((m) => m.path) } : {}),
  };
};

/** The model, the effort, the closing statement's schema handed on unread, the session to resume, and the spend cap. */
const askedOf = (r: SpawnRequest): AttachedOptions => ({
  ...(r.config?.model ? { model: r.config.model } : {}),
  ...(r.config?.effort ? { effort: r.config.effort as Options['effort'] } : {}),
  ...(r.closeoutSchema ? { outputFormat: { type: 'json_schema', schema: r.closeoutSchema as Record<string, unknown> } } : {}),
  ...(r.resumeFrom ? { resume: r.resumeFrom } : {}),
  ...(r.config?.budgetUsd !== undefined ? { maxBudgetUsd: r.config.budgetUsd } : {}),
});

/**
 * `r` as the SDK takes it. In `claudePrintFlags`' order:
 *
 * - the tools, denies and allows (`claudeDenies`, `claudeAllows`), the mounts as `additionalDirectories`;
 * - `config.claude` with the admission's hook (`admittedFlags`) on `extraArgs`, its plugin folders as `plugins`, its settings on
 *   the SDK's own `settings`, the session's auto-memory off in them (`memorylessSettings`), and its prompt files as `systemPrompt`;
 * - the partial messages, always asked for: the SDK emits a `stream_event` for each piece of a block only when
 *   `includePartialMessages` is set (`sdk.d.ts:1736`, `--include-partial-messages` to its CLI), and a follow of the session reads
 *   their `text_delta`s and nothing else (`attached-follow.ts`); the capture goes on dropping them;
 * - the mode, `auto` unless the task names one; the servers on `Options.mcpServers` (`sdk.d.ts:1813`) and nothing but them
 *   (`Options.strictMcpConfig`, `sdk.d.ts:2145`), no Chrome; `--setting-sources project`; Claude Code's own system prompt as the
 *   preset `claude_code`, which a `claude -p` job has by default and the SDK leaves empty when unasked, with the agent's own prompt
 *   appended to it (`promptOf`) and not to nothing;
 * - the model, the effort, the context window, the closing statement's schema (`outputFormat`, handed on as it was given, unread), the
 *   session to resume, the worktree, and the spend cap;
 * - the environment: the engine's own, its telemetry taken out (`withoutTelemetry`), with the task's `env`, `CLAUDE_JOB_ENV` and the
 *   session's own telemetry laid over it, as a job's.
 *
 * Throws, in words that say what to do, for a flag of `config.claude` given more than one value, which `extraArgs` cannot repeat, and
 * for the two prompt files given together or a prompt file that cannot be read (`promptOf`).
 */
export const attachedOptions = (r: SpawnRequest): AttachedOptions => {
  const c = r.config;
  const { extra, plugins, settings, systemPrompt } = extraOf(admittedFlags(c));
  const servers = everyMcpServer(r.cwd, c);
  return {
    cwd: r.cwd,
    ...fenceOf(c),
    ...(plugins.length ? { plugins: plugins.map((p) => ({ type: 'local' as const, path: path.resolve(r.cwd, p) })) } : {}),
    includePartialMessages: true,
    permissionMode: (c?.permissionMode ?? CLAUDE_DEFAULT_MODE) as Options['permissionMode'],
    settingSources: ['project'],
    settings,
    systemPrompt,
    ...(Object.keys(servers).length ? { mcpServers: servers as NonNullable<Options['mcpServers']> } : {}),
    strictMcpConfig: true,
    ...askedOf(r),
    /**
     * What is left of Claude Code's command line: `config.claude`'s own flags, and the three keys the Agent SDK 0.3.270 has no
     * `Options` for — `--no-chrome` (Claude in Chrome connects even in a strict session, `claudeMcpArgs`), `--worktree`, and
     * `--autocompact`. The window is a flag on purpose: `Settings.autoCompactWindow` (`sdk.d.ts:8353`) is the settings key that
     * looks like it, and measured on 0.3.270 it does not move the session's window, so `contextTokens` keeps the flag that does.
     * Everything else a task gives here is a flag only Claude Code has; look for an `Options` for it before adding another, and
     * say in this note when there is none.
     */
    extraArgs: {
      ...extra,
      'no-chrome': null,
      ...(c?.contextTokens !== undefined ? { autocompact: String(c.contextTokens) } : {}),
      ...(c?.worktree ? { worktree: worktreeName(r) } : {}),
    },
    env: { ...withoutTelemetry(process.env), ...c?.env, ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(r) },
  };
};
