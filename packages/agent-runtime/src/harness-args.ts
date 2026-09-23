/**
 * A task's harness arguments: the adapter's configuration, carried on the task as one object and read by a runner alone.
 *
 * The runtime keeps a durable journal, a deadline and the lifecycle; how a session is started — which model, what it may
 * touch, how hard it thinks — is the adapter's. So a task carries these under `config`, `domain.ts` and `engine.ts` pass
 * the object through without opening it (`test/core-reads.test.ts`), and the checks every adapter shares live here, in the
 * words they always had: asked by every `Runner` made with `Runner.layer`, and by `file` itself at both doors, so a runner
 * built with `Runner.of` alone is refused them too. What one harness takes and refuses
 * — its modes, its efforts, its windows — stays with that harness's runner.
 */
import type { McpServer } from './runner.ts';
import { mcpRefuses } from './runner-mcp.ts';

export type HarnessArgs = {
  model?: string;
  permissionMode?: string;
  /** Isolation: true for a harness-named worktree, a string to name it. */
  worktree?: string | boolean;
  /**
   * The only tools the session may have, in its harness's names for them — `['Read', 'Grep', 'Glob']`. Absent: the
   * harness's own set; empty: none at all. Claude Code is given exactly the list (`--tools`). Codex has no tool list, so it
   * runs `read-only` when the list has none of Bash, Write or Edit, and is not narrowed otherwise.
   */
  tools?: string[];
  /**
   * What the session may not have, in Claude Code's permission rules — `['SendMessage', 'Bash(npm run build)']`, one rule
   * per entry: a tool, or a tool and what it may not run. Claude Code is given the list as `--disallowedTools`, and a deny
   * beats an allow — the checkout's settings, `--allowedTools`, any permission mode. Absent or empty: nothing denied beyond
   * the harness's own settings. Codex has no tool list, and refuses a task whose list denies anything.
   */
  disallowedTools?: string[];
  /**
   * What the session may do without being asked, in Claude Code's permission rules — `['Edit(src/**)', 'Bash(npm test)']`,
   * one rule per entry, a path glob resolved against the session's `cwd`. Claude Code is given the list as
   * `--allowedTools`, and a deny beats it. Absent or empty: only what the permission mode allows by itself, which in
   * `dontAsk` is reads inside the cwd and nothing that writes — measured on 2.1.278, and why a fenced session in a fresh
   * directory needs this to write its own work. Codex has no tool list, and refuses a task that allows anything.
   */
  allowedTools?: string[];
  /** How hard the harness should think, in its own words: `--effort` for Claude Code, `model_reasoning_effort` for Codex. */
  effort?: string;
  /**
   * MCP servers the session may have, by name, as a `.mcp.json` gives them — `{ browser: { command: 'npx', args:
   * ['@playwright/mcp'] } }`. Claude Code gets these and its checkout's `.mcp.json`, and never the operator's own servers:
   * every spawn is `--strict-mcp-config`. Codex gets these as config overrides, on top of its own config's.
   */
  mcp?: Record<string, McpServer>;
  /**
   * The context window the session is given, in tokens — `200000`. Given to Claude Code as `--autocompact`: past about it
   * the session compacts its conversation, a summary in place of what it read, and carries on, on `claude --bg` and
   * `claude -p` alike. Every attempt gets the same window, a continuation included. Absent: the harness's own, which is the
   * model's whole window. Refused unless a whole number of tokens in the range the harness takes (`CLAUDE_CONTEXT_TOKENS`:
   * 100000 to 1000000 on Claude Code), and on a harness with no such knob: `codex`, and a `HarnessSpec` that declares no
   * `contextTokens` range. A harness brought as a `PromiseRunner` is handed it and asked nothing.
   */
  contextTokens?: number;
  /**
   * Bridge the session to claude.ai: Claude Code's `--bg` session is given `--remote-control`, and is listed in the web's
   * agents view, where anyone signed in to the account can drive it — type into it, answer its prompts, stop it — from a
   * browser or a phone. Never a default, for that reason. Refused unless true or false, and `true` on a harness that has no
   * such flag: `codex`, `claude-detached` — whose `claude -p` runs a prompt and exits — and any `HarnessSpec`. A harness
   * brought as a `PromiseRunner` is handed it on the spawn and asked nothing.
   */
  remoteControl?: boolean;
};

/** Every harness argument by name. Exhaustive by type: a key added to `HarnessArgs` and not here does not compile. */
const KEYS: Record<keyof HarnessArgs, true> = {
  model: true, permissionMode: true, effort: true, tools: true, allowedTools: true, disallowedTools: true,
  mcp: true, contextTokens: true, remoteControl: true, worktree: true,
};
export const HARNESS_ARGS = Object.keys(KEYS) as ReadonlyArray<keyof HarnessArgs>;

/**
 * One permission rule as Claude Code writes one: a tool's name, and what it may not run in parentheses —
 * `SendMessage`, `Bash(npm run build)`. A space or a comma outside the parentheses separates two rules on
 * the harness's side, so an entry that has one is not one rule.
 */
const RULE = /^[A-Za-z][^\s,()]*(?:\([^()]+\))?$/;

/**
 * Why a task's harness arguments cannot be filed, as a sentence that says what to write instead — or `undefined`.
 *
 * The checks every adapter shares, in the words `refusalOf` gave them before they moved here: a value no harness could use,
 * refused before it is journalled, since a journalled task is a promise the loop keeps trying to honour. Asked by every
 * `Runner` (`Runner.layer`), so the Effect door and `createEngine().file()` give one sentence for each. A harness's own
 * words — the modes and efforts it takes — are its runner's (`harnessRefusalOf` in `facade.ts`, open issue 6).
 *
 * A harness argument filed beside `config` rather than in it is refused first: an untyped caller would otherwise have it
 * journalled nowhere and its session started without it.
 */
export const argsRefusalOf = (spec: { config?: HarnessArgs }): string | undefined => {
  const loose = HARNESS_ARGS.find((key) => Object.hasOwn(spec, key) && (spec as Record<string, unknown>)[key] !== undefined);
  if (loose) return `\`${loose}\` is the harness's configuration: file it under \`config\`, as \`config: { ${loose}: … }\`.`;
  const config = spec.config;
  if (config === undefined) return undefined;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return `\`config: ${JSON.stringify(config)}\` is not a harness's configuration. Give an object of its arguments, like { "model": "opus" }, or leave it out.`;
  }
  const stray = Object.keys(config).find((key) => !Object.hasOwn(KEYS, key));
  if (stray) return `\`config.${stray}\` is not a harness argument. A harness's arguments are: ${HARNESS_ARGS.join(', ')}.`;
  if (config.model === '') return "`model` is empty. Leave it out for the harness's default.";
  if (config.effort === '') return "`effort` is empty. Leave it out for the harness's default.";
  // One name per entry: a comma inside one would split into two names on the way to the harness.
  if (config.tools !== undefined && !(Array.isArray(config.tools) && config.tools.every((t) => typeof t === 'string' && t !== '' && t.trim() === t && !t.includes(',')))) {
    return `\`tools: ${JSON.stringify(config.tools)}\` is not a list of tool names. Give one name per entry, like ["Read", "Grep", "Glob"].`;
  }
  if (config.disallowedTools !== undefined && !(Array.isArray(config.disallowedTools) && config.disallowedTools.every((r) => typeof r === 'string' && RULE.test(r)))) {
    return `\`disallowedTools: ${JSON.stringify(config.disallowedTools)}\` is not a list of permission rules. Give one rule per entry, a tool or a tool and what it may not run, like ["SendMessage", "Bash(npm run build)"].`;
  }
  if (config.allowedTools !== undefined && !(Array.isArray(config.allowedTools) && config.allowedTools.every((r) => typeof r === 'string' && RULE.test(r)))) {
    return `\`allowedTools: ${JSON.stringify(config.allowedTools)}\` is not a list of permission rules. Give one rule per entry, a tool or a tool and what it may do, like ["Edit(**)", "Bash(npm test)"].`;
  }
  const mcp = config.mcp === undefined ? undefined : mcpRefuses(config.mcp);
  if (mcp) return mcp;
  if (config.remoteControl !== undefined && typeof config.remoteControl !== 'boolean') {
    return `\`remoteControl: ${JSON.stringify(config.remoteControl)}\` is not true or false. Give true to bridge the session to claude.ai, or leave it out.`;
  }
  if (config.contextTokens !== undefined && !(typeof config.contextTokens === 'number' && Number.isSafeInteger(config.contextTokens) && config.contextTokens > 0)) {
    return `\`contextTokens: ${typeof config.contextTokens === 'number' ? config.contextTokens : JSON.stringify(config.contextTokens)}\` is not a number of tokens. Give a whole number of tokens, like 200000, or leave it out for the harness's own window.`;
  }
  return undefined;
};
