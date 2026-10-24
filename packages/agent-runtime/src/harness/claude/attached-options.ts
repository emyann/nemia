/**
 * What an attached Claude Code session is given, as the Agent SDK takes it (`Options`): the same fence, folders, settings, servers,
 * model, budget and closing statement `claude -p` is given for the same task (`claudePrintFlags`), each on the SDK's own option where
 * it has one, and on `extraArgs` where it has none. Pure but for the files it reads — the checkout's `.mcp.json` and the agent's own
 * prompt — and it writes none: the servers ride `Options.mcpServers` and the prompt `Options.systemPrompt`.
 *
 * **`mcpServers` here is the one site that names the SDK's shape for a server, so the one that says where the shape and ours part.** A
 * recorded server carries `oauth: { clientId, callbackPort }` (`mcpServerOf`), and `oauth` is still not declared on the SDK's type
 * for an HTTP server (`sdk.d.ts:1205-1220`), so the cast is what lets it through and no typecheck reads it. What it does is measured
 * rather than typed: on 0.3.308 the SDK's own schema for an http server declares `oauth` and the server comes back with it echoed on
 * `McpServerStatus.config` (`seam.ts`, `docs/harness.md`). An SDK that renamed the field would break every sign-in silently — the
 * server would simply come back `needs-auth` for ever — so it is re-measured at each bump, not carried.
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
  const [only, ...more] = value;
  if (only !== undefined && more.length === 0) return only;
  throw new Error(
    `\`config.claude.${key}\` gives ${value.length} values, and an attached session takes one per flag. Give one, or file the task on \`claude-detached\`.`,
  );
};

/**
 * The text of the prompt file `key` names, read from the session's own `cwd` where the path is relative — as Claude Code resolved the
 * flag's path from inside the child's cwd, and as the plugin folders are resolved — and refused, saying what to do, where it cannot be
 * read.
 */
const promptText = (key: string, cwd: string, file: string): string => {
  const at = path.resolve(cwd, file);
  try {
    return fs.readFileSync(at, 'utf8');
  } catch (e) {
    throw new Error(
      `\`config.claude.${key}\` names ${at}, which cannot be read (${(e as Error).message}), and an attached session is given the prompt's text on the SDK's \`systemPrompt\`, not the file's path. Write the file before the task is spawned, or take the key off the task.`,
      { cause: e },
    );
  }
};

/**
 * The session's system prompt, as `Options.systemPrompt` takes it (`sdk.d.ts:2451-2461`): Claude Code's own preset with the agent's
 * prompt appended to it (`appendSystemPromptFile`), the prompt file's text alone in place of Claude Code's (`systemPromptFile`), or
 * the bare preset where the task names neither — asked for even then, because the SDK sends an empty system prompt when
 * `systemPrompt` is unasked, and a `claude -p` job has Claude Code's own. The prompt reaches the CLI as `appendSystemPrompt` on the
 * `initialize` request, never as `--append-system-prompt-file`. A resumed session keeps the prompt it was recorded with (the option's
 * own `snapshot`, which defaults on, `sdk.d.ts:2350-2461`), so a prompt file edited mid-session reaches no live session until
 * it is compacted.
 *
 * Refused, naming both keys and the harness that takes both flags, where a task gives both: the SDK has the one option where the CLI
 * had two flags, and what Claude Code does given both is unmeasured, so the runtime does not choose for the person.
 */
const promptOf = (cwd: string, append: string | undefined, replace: string | undefined): Options['systemPrompt'] => {
  if (append !== undefined && replace !== undefined) {
    throw new Error(
      "`config.claude.appendSystemPromptFile` and `config.claude.systemPromptFile` are both given, and an attached session carries the one `systemPrompt` the Agent SDK takes: a prompt appended to Claude Code's own, or a prompt in place of it, never both. Give one of the two, or file the task on `claude-detached`, which takes both flags.",
    );
  }
  if (replace !== undefined) return promptText('systemPromptFile', cwd, replace);
  return {
    type: 'preset',
    preset: 'claude_code',
    ...(append === undefined ? {} : { append: promptText('appendSystemPromptFile', cwd, append) }),
  };
};

/**
 * `config.claude` as `extraArgs` takes it, each flag by its name without `--`, with its plugin folders apart, its settings apart
 * with the session's auto-memory off in them (`memorylessSettings`), as the SDK's own `settings` option takes them (an object, or a
 * file's path as given, which the runtime does not rewrite), and its prompt files apart as the SDK's own `systemPrompt`
 * (`promptOf`), each of those paths taken from `cwd` where it is relative.
 *
 * The settings go apart because `Options.settings` overwrites a `settings` left on `extraArgs`, and `extraArgs` stringifies its
 * values (`sdk.mjs`): an object left in that bag would reach the CLI as `[object Object]`.
 */
const extraOf = (
  cwd: string,
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
    systemPrompt: promptOf(cwd, appendSystemPromptFile, systemPromptFile),
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
 *   `includePartialMessages` is set (`sdk.d.ts:1896`, `--include-partial-messages` to its CLI), and a follow of the session reads
 *   their `text_delta`s and nothing else (`attached-follow.ts`); the capture goes on dropping them;
 * - the mode, `auto` unless the task names one; the servers on `Options.mcpServers` (`sdk.d.ts:1991`) and nothing but them
 *   (`Options.strictMcpConfig`, `sdk.d.ts:2349`) — the SDK spells that map onto the child's argv as inline JSON, and Claude Code
 *   expands a `${NAME:-default}` in a server's arguments there as it does from a config file (measured 2.1.306,
 *   `test/live.test.ts`), so the checkout's own `--output-dir` still resolves — no Chrome; `--setting-sources project`; Claude
 *   Code's own system prompt as the preset `claude_code`, which a `claude -p` job has by default and the SDK leaves empty when
 *   unasked, with the agent's own prompt appended to it (`promptOf`) and not to nothing;
 * - the model, the effort, the context window as `Settings.autoCompactWindow` in those same settings (`sdk.d.ts:9304`), the closing
 *   statement's schema (`outputFormat`, handed on as it was given, unread), the session to resume, the worktree, and the spend cap;
 * - the environment: the engine's own, its telemetry taken out (`withoutTelemetry`), with the task's `env`, `CLAUDE_JOB_ENV` and the
 *   session's own telemetry laid over it, as a job's.
 *
 * Throws, in words that say what to do, for a flag of `config.claude` given more than one value, which `extraArgs` cannot repeat, and
 * for the two prompt files given together or a prompt file that cannot be read (`promptOf`).
 */
export const attachedOptions = (r: SpawnRequest): AttachedOptions => {
  const c = r.config;
  const { extra, plugins, settings, systemPrompt } = extraOf(r.cwd, admittedFlags(c));
  const servers = everyMcpServer(r.cwd, c);
  const window = c?.contextTokens;
  const windowed = window !== undefined && typeof settings === 'object';
  return {
    cwd: r.cwd,
    ...fenceOf(c),
    ...(plugins.length ? { plugins: plugins.map((p) => ({ type: 'local' as const, path: path.resolve(r.cwd, p) })) } : {}),
    includePartialMessages: true,
    permissionMode: (c?.permissionMode ?? CLAUDE_DEFAULT_MODE) as Options['permissionMode'],
    settingSources: ['project'],
    settings: windowed ? { ...settings, autoCompactWindow: window } : settings,
    systemPrompt,
    ...(Object.keys(servers).length ? { mcpServers: servers as NonNullable<Options['mcpServers']> } : {}),
    strictMcpConfig: true,
    ...askedOf(r),
    /**
     * What is left of Claude Code's command line: `config.claude`'s own flags, and the two the Agent SDK 0.3.308 has no `Options`
     * for — `--no-chrome`, because Claude in Chrome connects even in a strict session (`claudeMcpArgs`), and `--worktree`. Looked
     * for in `sdk.d.ts` and not there; everything else a task gives here is a flag only Claude Code has. Look for an `Options`
     * before adding another, and say in this note when there is none.
     *
     * `--autocompact` beside them for the one task that cannot carry `autoCompactWindow`: where `config.claude.settings` is a
     * file's path there is no settings object of ours to put the window in, and the runtime rewrites no settings file
     * (`memorylessSettings`). The two reach the same window, measured on 0.3.270 against the real Claude Code and carried, both
     * options still there on 0.3.308: 150000 asked each
     * way gave `rawMaxTokens: 150000`, where a session asked for neither got the model's 200000.
     */
    extraArgs: {
      ...extra,
      'no-chrome': null,
      ...(window !== undefined && !windowed ? { autocompact: String(window) } : {}),
      ...(c?.worktree ? { worktree: worktreeName(r) } : {}),
    },
    env: { ...withoutTelemetry(process.env), ...c?.env, ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(r) },
  };
};
