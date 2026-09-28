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
import type { ClaudeFlags } from './runner-claude-vocabulary.ts';
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
   * How Claude Code runs the session on the `claude` harness. Absent or false: as a job — `claude -p`, which runs its
   * brief to the end and exits, prints every event as it goes, says what it was denied (`Sighting.denials`), and takes
   * words said to it on its stdin until its result. True: as a background session — `claude --bg`, listed in
   * `claude agents`, which a person can attach to, say words to while it runs, and bridge to claude.ai (`claude.remoteControl`,
   * which asks for it). Refused unless true or false, and `true` on any
   * other harness, none of which has two ways to run.
   */
  background?: boolean;
  /**
   * The most one attempt's session may spend, in dollars — `0.25`, `5` — as its harness keeps a cap natively: Claude Code
   * is given it as `--max-budget-usd`, and `claude -p` ends the session once a response takes it past, printing so in its
   * result (`Sighting.limit`: `budget`). The harness counts one process's spend, so a cap is per attempt. A harness
   * feature carried as one of its arguments, and no policy of the runtime's: nothing here compares a cost with it, and
   * whether a step is over its budget is the caller's judgement (agent-orchestrator's `budget:`). Refused unless dollars
   * above 0, and on a harness that keeps no cap: `claude --bg`, which spends past one (measured), and `codex`, which has none.
   * A later turn of a task held open may give its own (`TURN_ARGS`).
   */
  budgetUsd?: number;
  /**
   * Flags handed to Claude Code as they are — `{ appendSystemPromptFile: 'prompt.md', pluginDir: ['hkb-note'] }` — on a
   * job and a background session alike, directly before its `--permission-mode` (`ClaudeFlags`, `claudeFlagsOf`). A flag
   * the runtime gives itself is refused (`CLAUDE_OWNED_FLAGS`), and so is the bag on a harness that is not Claude Code,
   * which would start its session without them. A flag the CLI does not have fails the attempt as the CLI fails it, its
   * words in the attempt's logs. Refused unless an object whose keys are flags in camelCase and whose values are `true`,
   * a string, a number, or a list of strings.
   *
   * A flag of Claude Code's alone is given here, never as a harness argument of its own: `remoteControl: true` bridges a
   * background session to claude.ai (`--remote-control`), and is refused on a job and on any harness but Claude Code. What stays
   * named above is what another harness translates (`worktree`, the fence, `effort`), what a `HarnessSpec` may declare
   * (`contextTokens`), what chooses the runtime's own process (`background`), or what a caller judges (`budgetUsd`).
   */
  claude?: ClaudeFlags;
};

/** Every harness argument by name. Exhaustive by type: a key added to `HarnessArgs` and not here does not compile. */
const KEYS: Record<keyof HarnessArgs, true> = {
  model: true,
  permissionMode: true,
  effort: true,
  tools: true,
  allowedTools: true,
  disallowedTools: true,
  mcp: true,
  contextTokens: true,
  background: true,
  worktree: true,
  budgetUsd: true,
  claude: true,
};
export const HARNESS_ARGS = Object.keys(KEYS) as ReadonlyArray<keyof HarnessArgs>;

/**
 * A harness argument that was one of its own and is now Claude Code's flag in `config.claude`, by the flag's key there: filed at
 * its old place — under `config` or beside it — it is refused naming the new one (`argsRefusalOf`), and read from a journal written
 * before the move as the new one (`upgrade` in `journal.ts`). `remoteControl` moved on 2026-09-25.
 */
export const FORMER_ARGS: Readonly<Record<string, string>> = { remoteControl: 'remoteControl' };

/**
 * The harness arguments a later turn of a task held open may give for itself (`answer`), on top of the task's own. A turn
 * continues the session its task was filed with, so what starts that session — its model, its tools, how it runs — is the
 * filing's; only the cap on what the turn itself may spend is the turn's, since each turn is a process of its own.
 */
export const TURN_ARGS: ReadonlyArray<keyof HarnessArgs> = ['budgetUsd'];

/** Dollars above 0: what a spend cap is. */
const isDollars = (usd: unknown): boolean => typeof usd === 'number' && Number.isFinite(usd) && usd > 0;
const shown = (v: unknown) => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/**
 * The configuration a turn's session is started with: the task's, with what the turn gave for itself (`TURN_ARGS`) over it.
 * The one place a turn's configuration is merged, so the runtime's core hands both on without opening either.
 */
export const configForTurn = (base: HarnessArgs | undefined, turn: HarnessArgs | undefined): HarnessArgs | undefined =>
  turn === undefined ? base : { ...base, ...turn };

/**
 * Why what an answer gives its turn cannot be journalled — or `undefined`. Only the turn's own arguments (`TURN_ARGS`), in
 * the words a filing's have, except that leaving a cap out keeps the task's own.
 */
export const turnArgsRefusalOf = (turn: unknown): string | undefined => {
  if (turn === undefined) return undefined;
  if (typeof turn !== 'object' || turn === null || Array.isArray(turn)) {
    return `\`config: ${JSON.stringify(turn)}\` is not a turn's configuration. Give an object, like { "budgetUsd": 2 }, or leave it out for the task's own.`;
  }
  const other = Object.keys(turn).find((key) => !(TURN_ARGS as readonly string[]).includes(key));
  if (other) {
    return `\`config.${other}\` cannot be given to one turn: a turn continues the session its task was filed with, and only its spend cap (\`budgetUsd\`) is its own. File a task that continues the session (\`resumeFrom\`) with the configuration it should have.`;
  }
  const { budgetUsd } = turn as HarnessArgs;
  if (budgetUsd !== undefined && !isDollars(budgetUsd)) {
    return `\`budgetUsd: ${shown(budgetUsd)}\` is not an amount of dollars. Give dollars above 0, like 5 or 0.25, or leave it out for the task's own.`;
  }
  return undefined;
};

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
 * journalled nowhere and its session started without it. And before that, one that moved into Claude Code's flags
 * (`FORMER_ARGS`), wherever it was filed, with a sentence naming where it went.
 */
export const argsRefusalOf = (spec: { config?: HarnessArgs }): string | undefined => {
  const filed = (spec as { config?: unknown }).config;
  // An own key, whatever its value: a caller still writing `remoteControl: step.remote` is told where it went, false and undefined too.
  const at = (o: unknown, key: string) => typeof o === 'object' && o !== null && Object.hasOwn(o, key);
  const former = Object.keys(FORMER_ARGS).find((key) => at(spec, key) || at(filed, key));
  if (former) {
    return `\`${former}\` is Claude Code's own flag, no harness argument of its own since 2026-09-25: file it with Claude Code's flags, as \`config: { claude: { ${FORMER_ARGS[former]}: true } }\`, or leave it out.`;
  }
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
  if (
    config.tools !== undefined &&
    !(Array.isArray(config.tools) && config.tools.every((t) => typeof t === 'string' && t !== '' && t.trim() === t && !t.includes(',')))
  ) {
    return `\`tools: ${JSON.stringify(config.tools)}\` is not a list of tool names. Give one name per entry, like ["Read", "Grep", "Glob"].`;
  }
  if (
    config.disallowedTools !== undefined &&
    !(Array.isArray(config.disallowedTools) && config.disallowedTools.every((r) => typeof r === 'string' && RULE.test(r)))
  ) {
    return `\`disallowedTools: ${JSON.stringify(config.disallowedTools)}\` is not a list of permission rules. Give one rule per entry, a tool or a tool and what it may not run, like ["SendMessage", "Bash(npm run build)"].`;
  }
  if (
    config.allowedTools !== undefined &&
    !(Array.isArray(config.allowedTools) && config.allowedTools.every((r) => typeof r === 'string' && RULE.test(r)))
  ) {
    return `\`allowedTools: ${JSON.stringify(config.allowedTools)}\` is not a list of permission rules. Give one rule per entry, a tool or a tool and what it may do, like ["Edit(**)", "Bash(npm test)"].`;
  }
  const mcp = config.mcp === undefined ? undefined : mcpRefuses(config.mcp);
  if (mcp) return mcp;
  if (config.background !== undefined && typeof config.background !== 'boolean') {
    return `\`background: ${JSON.stringify(config.background)}\` is not true or false. Give true to run the session as \`claude --bg\`, or leave it out to run it as a job.`;
  }
  if (
    config.contextTokens !== undefined &&
    !(typeof config.contextTokens === 'number' && Number.isSafeInteger(config.contextTokens) && config.contextTokens > 0)
  ) {
    return `\`contextTokens: ${typeof config.contextTokens === 'number' ? config.contextTokens : JSON.stringify(config.contextTokens)}\` is not a number of tokens. Give a whole number of tokens, like 200000, or leave it out for the harness's own window.`;
  }
  if (config.budgetUsd !== undefined && !isDollars(config.budgetUsd)) {
    return `\`budgetUsd: ${shown(config.budgetUsd)}\` is not an amount of dollars. Give dollars above 0, like 5 or 0.25, or leave it out for no cap.`;
  }
  return config.claude === undefined ? undefined : claudeFlagsRefusalOf(config.claude);
};

/** A flag's name in camelCase, two letters or more: a one-letter flag is Claude Code's short form, which has a long one. */
const FLAG_KEY = /^[a-z][a-zA-Z0-9]+$/;

/**
 * Why `config.claude` cannot be handed to Claude Code as flags — or `undefined`. Each value must say one thing on the
 * command line: `false` and `null` would be dropped, an object has no flag's form, and an empty list gives nothing.
 */
const claudeFlagsRefusalOf = (flags: unknown): string | undefined => {
  if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) {
    return `\`claude: ${JSON.stringify(flags)}\` is not a set of Claude Code's flags. Give an object keyed by flag in camelCase, like { "appendSystemPromptFile": "prompt.md" }, or leave it out.`;
  }
  for (const [key, value] of Object.entries(flags)) {
    if (!FLAG_KEY.test(key)) {
      return `\`claude.${key}\` is not a flag's name in camelCase. Write the long flag in camelCase, \`--append-system-prompt-file\` as \`appendSystemPromptFile\`.`;
    }
    const one = value === true || (typeof value === 'string' && value !== '') || (typeof value === 'number' && Number.isFinite(value));
    const list = Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v !== '');
    if (!one && !list) {
      return `\`claude.${key}: ${JSON.stringify(value)}\` is not a flag's value. Give true for the flag alone, a string or a number for its value, or a list of strings to give it once each — or leave the key out.`;
    }
  }
  return undefined;
};
