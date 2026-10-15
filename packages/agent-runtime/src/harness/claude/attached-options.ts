/**
 * What an attached Claude Code session is given, as the Agent SDK takes it (`Options`): the same fence, folders, settings, servers,
 * model, budget and closing statement `claude -p` is given for the same task (`claudePrintFlags`), each on the SDK's own option where
 * it has one, and on `extraArgs` where it has none. Pure but for the one file it reads, the checkout's `.mcp.json`, and the one it
 * writes, the session's servers merged into one config.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import type { SpawnRequest } from '../seam.ts';
import { CLAUDE_DEFAULT_MODE, claudeAllows, claudeDenies, claudeFlagName, worktreeName, type ClaudeFlags } from './vocabulary.ts';
import { admittedFlags } from './admission.ts';
import { claudeTelemetryEnv } from './telemetry.ts';
import { CLAUDE_JOB_ENV } from './job-env.ts';
import { checkoutMcpConfig, sessionMcp, writeMcpConfig } from '../mcp.ts';
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
  | 'model'
  | 'effort'
  | 'maxBudgetUsd'
  | 'outputFormat'
  | 'resume'
  | 'plugins'
  | 'extraArgs'
  | 'env'
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

/** `config.claude` as `extraArgs` takes it, each flag by its name without `--`, and its plugin folders apart. */
const extraOf = (flags: ClaudeFlags | undefined): { extra: Record<string, string | null>; plugins: string[] } => {
  const { pluginDir, ...rest } = flags ?? {};
  const given = Object.entries(rest).filter((e): e is [string, string | number | true | string[]] => e[1] !== undefined);
  return {
    extra: Object.fromEntries(given.map(([key, value]) => [claudeFlagName(key).slice(2), extraValueOf(key, value)])),
    plugins: pluginDir ?? [],
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
 * The session's MCP servers, the checkout's `.mcp.json` and the task's own as `claude -p` reads its two configs, merged into the one
 * file `file` (`writeMcpConfig`): the task's server wins a name both give. None when neither gives one.
 */
const mcpFileOf = (r: SpawnRequest, file: string): string | undefined => {
  const checkout = r.config?.checkoutMcp ? undefined : checkoutMcpConfig(r.cwd);
  const theirs = checkout ? ((JSON.parse(fs.readFileSync(checkout, 'utf8')) as { mcpServers?: object }).mcpServers ?? {}) : {};
  const ours = sessionMcp(r.cwd, r.config) ?? {};
  return writeMcpConfig(file, Object.keys(theirs).length || Object.keys(ours).length ? { ...theirs, ...ours } : undefined);
};

/**
 * `r` as the SDK takes it, its servers written to `mcpFile`. In `claudePrintFlags`' order:
 *
 * - the tools, denies and allows (`claudeDenies`, `claudeAllows`), the mounts as `additionalDirectories`;
 * - `config.claude` with the admission's hook (`admittedFlags`) on `extraArgs`, its plugin folders as `plugins`;
 * - the mode, `auto` unless the task names one; the servers, strict, no Chrome; `--setting-sources project`;
 * - the model, the effort, the context window, the closing statement's schema (`outputFormat`, handed on as it was given, unread), the
 *   session to resume, the worktree, and the spend cap;
 * - the environment: the engine's own, its telemetry taken out (`withoutTelemetry`), with the task's `env`, `CLAUDE_JOB_ENV` and the
 *   session's own telemetry laid over it, as a job's.
 *
 * Throws, in words that say what to do, for a flag of `config.claude` given more than one value, which `extraArgs` cannot repeat.
 */
export const attachedOptions = (r: SpawnRequest, mcpFile: string): AttachedOptions => {
  const c = r.config;
  const { extra, plugins } = extraOf(admittedFlags(c));
  const mcp = mcpFileOf(r, mcpFile);
  return {
    cwd: r.cwd,
    ...fenceOf(c),
    ...(plugins.length ? { plugins: plugins.map((p) => ({ type: 'local' as const, path: path.resolve(r.cwd, p) })) } : {}),
    permissionMode: (c?.permissionMode ?? CLAUDE_DEFAULT_MODE) as Options['permissionMode'],
    settingSources: ['project'],
    ...askedOf(r),
    extraArgs: {
      ...extra,
      ...(mcp ? { 'mcp-config': mcp } : {}),
      'strict-mcp-config': null,
      'no-chrome': null,
      ...(c?.contextTokens !== undefined ? { autocompact: String(c.contextTokens) } : {}),
      ...(c?.worktree ? { worktree: worktreeName(r) } : {}),
    },
    env: { ...withoutTelemetry(process.env), ...c?.env, ...CLAUDE_JOB_ENV, ...claudeTelemetryEnv(r) },
  };
};
