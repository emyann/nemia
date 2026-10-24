/**
 * A task's harness arguments: the adapter's configuration, carried on the task as one object and read by a runner alone.
 *
 * The runtime keeps a durable journal, a deadline and the lifecycle; how a session is started — which model, what it may
 * touch, how hard it thinks — is the adapter's. So a task carries these under `config`, `domain.ts` and `engine.ts` pass
 * the object through without opening it (`test/core-reads.test.ts`), and the checks every adapter shares live here: asked
 * by every `Runner` made with `Runner.layer`, and by `file` itself, so a runner built with `Runner.of` alone
 * is refused them too. What one harness takes and refuses — its modes, its efforts, its windows — stays with that
 * harness's runner.
 */
import path from 'node:path';
import type { McpServer } from './seam.ts';
import { bridgeAsked, type ClaudeFlags } from './claude/vocabulary.ts';
import type { Bridge } from '../core/domain.ts';
import { mcpRefuses } from './mcp.ts';
import { mountsRefusalOf, type Mount } from './mounts.ts';
import { admissionRefusalOf, type Admission } from './admission.ts';

export type HarnessArgs = {
  model?: string;
  permissionMode?: string;
  /** Isolation: true for a harness-named worktree, a string to name it. */
  worktree?: string | boolean;
  /**
   * The only tools the session may have, in its harness's names for them — `['Read', 'Grep', 'Glob']`. Absent: the
   * harness's own set; empty: none at all. Claude Code is given exactly the list (`--tools`). Codex has no tool list, so it
   * runs `read-only` when the list has none of Bash, Write or Edit, and is not narrowed otherwise. Refused unless one name
   * per entry, with no comma inside one: a comma splits it into two names on the way to the harness.
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
   * `dontAsk` is reads inside the cwd and nothing that writes, so a fenced session in a fresh directory needs this to write
   * its own work. Codex has no tool list, and refuses a task that allows anything.
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
   * The servers of its checkout's `.mcp.json` the session loads, by name, as a Pod's volume gives a ConfigMap's `items`. Absent:
   * the whole file, as it is. `[]`: none of it. Names: those entries alone, read from `<cwd>/.mcp.json` when the session is
   * spawned and handed over with the task's own `mcp`, and a spawn whose file does not declare one is refused, `unstartable`.
   * Claude Code and Codex hold it; a harness that cannot leave the file out refuses the task (`HarnessSpec.checkoutMcp`).
   * Refused unless a list of server names, none twice and none also in `mcp`.
   */
  checkoutMcp?: string[];
  /**
   * The context window the session is given, in tokens — `200000`. Given to Claude Code as `--autocompact`: past about it
   * the session compacts its conversation, a summary in place of what it read, and carries on, a job and a long-lived session
   * alike. Every attempt gets the same window, a continuation included. Absent: the harness's own, which is the
   * model's whole window. Refused unless a whole number of tokens in the range the harness takes (`CLAUDE_CONTEXT_TOKENS`:
   * 100000 to 1000000 on Claude Code), and on a harness with no such knob: `codex`, and a `HarnessSpec` that declares no
   * `contextTokens` range. A harness brought as a `RunnerOps` is handed it, and asked only its own `refuses`.
   */
  contextTokens?: number;
  /**
   * The most one attempt's session may spend, in dollars — `0.25`, `5` — as its harness keeps a cap natively: Claude Code
   * is given it on the Agent SDK's `maxBudgetUsd`, and ends the session once a response takes it past, printing so in its
   * result (`Sighting.limit`: `budget`). The harness counts one process's spend, so a cap is per attempt. A harness
   * feature carried as one of its arguments, and no policy of the runtime's: nothing here compares a cost with it, and
   * whether a step is over its budget is the caller's judgement (agent-orchestrator's `budget:`). Refused unless dollars
   * above 0, and on a harness that keeps no cap: `codex`, which has none.
   * A later turn of a task held open may give its own (`TURN_ARGS`).
   */
  budgetUsd?: number;
  /**
   * Flags handed to Claude Code as they are — `{ appendSystemPromptFile: 'prompt.md', pluginDir: ['nemia-note'] }` — on a
   * job and a long-lived session alike, on the Agent SDK's `extraArgs` (`ClaudeFlags`, `attachedOptions`). A flag
   * the runtime gives itself is refused (`CLAUDE_OWNED_FLAGS`), and so is the bag on a harness that is not Claude Code,
   * which would start its session without them. A flag the CLI does not have fails the attempt as the CLI fails it, its
   * words in the attempt's logs. Refused unless an object whose keys are flags in camelCase and whose values are `true`,
   * a string, a number, or a list of strings.
   *
   * A flag of Claude Code's alone is given here, never as a harness argument of its own: `remoteControl: true` bridges the
   * session to claude.ai, a job's and a long-lived session's alike, and is refused on any harness but Claude Code. What stays
   * named above is what another harness translates (`worktree`, the fence, `effort`), what a `HarnessSpec` may declare
   * (`contextTokens`), or what a caller judges (`budgetUsd`).
   */
  claude?: ClaudeFlags;
  /**
   * Codex's own arguments, read by the `codex` harness alone (`CodexArgs`). Refused on a harness that is not Codex, which
   * would start its session without them, and unless an object holding only `trustFrom`, an absolute path.
   */
  codex?: CodexArgs;
  /**
   * The process the session is, as a Pod's container gives its `command` and `args`: the program first, then each argument as it
   * reaches it, no shell between — `['sh', '-c', 'npm test']`. Read by a `HarnessSpec` with `commandArgs` alone (`commandHarness`),
   * which runs it in the task's `cwd`; refused on any other harness, which would start its session without it, and unless a list
   * whose first entry names a program and whose every entry is a string with no NUL in it.
   */
  command?: string[];
  /**
   * What the session's process holds in its environment on top of the worker's own, as a Pod's container gives its `env`:
   * `{ "CI": "1" }`. Read by every harness that spawns the session as a process of its own — a `HarnessSpec` with `commandArgs` or
   * `env`, and Claude Code, a job and a long-lived session alike — and laid under the harness's own variables, which it never
   * overrides. Refused on a remote agent. Journalled with the
   * task, so it carries no secret. Refused unless an object whose keys are variable names and whose values are strings with no
   * NUL in them.
   */
  env?: Record<string, string>;
  /**
   * How far the command's priority is lowered: `nice -n` with it, and the idle IO class where `ionice -c3` runs on the machine.
   * Read by a `HarnessSpec` with `commandArgs` alone, and refused on any other harness. Absent or 0: the worker's own priority.
   * Refused unless a whole number from 0 to 19.
   */
  niceness?: number;
  /**
   * The folders beyond its `cwd` the session may reach, as a Pod's container is given its volume mounts: each an absolute path, and
   * whether the session may only read it (`Mount`). Each harness renders them its own way, and one that cannot hold a mount's mode
   * refuses the task before it is journalled (`HarnessSpec.mounts`): Claude Code gives each one `--add-dir` and denies an edit
   * under a read-only one; Codex reads the whole disk in its sandboxes that write only their workspace, so it holds a read-only
   * mount and refuses a writable one. Refused unless a list of mounts with no path given twice (`mountsRefusalOf`).
   */
  mounts?: Mount[];
  /**
   * A command run before each of the session's calls to the tools it names, which answers whether the call runs, asks the person or
   * is refused (`Admission`). Each harness renders it its own way, and one that cannot ask a command before a call refuses the task
   * before it is journalled: Claude Code runs it as a hook, through the runtime's own adapter (`ae admission`). Refused unless a
   * command and the tools it sees (`admissionRefusalOf`).
   */
  callAdmission?: Admission;
  /**
   * Whether a person can be asked through this session, as a Pod's container is given `stdin`: a call of the session's that would
   * ask a person is held open while the question waits on one, and answered from outside (`RunnerOps.answer`). Absent or false: such
   * a call is denied, as no person is there. Only a session the runtime holds open can hold a call, so it is refused on any other
   * (`harnessRefusalOf`), and unless true or false.
   */
  mayAsk?: boolean;
  /**
   * The skills the session is given, by the harness's name for each — a skill's own name, or `<plugin>:<name>` for a plugin's:
   * exactly those, every other skill hidden from the session and refused when it is called, whatever its source (the harness's
   * built-in ones, the user's, the project's, a plugin's). `'default'`, or absent: the harness's own set. Claude Code holds a list
   * only through its SDK (`Options.skills`), so a session the runtime runs on its CLI refuses one, and so does any harness that cannot
   * close its set of skills (`HarnessSpec.enabledSkills`). Refused unless `'default'` or a list of names, none twice.
   */
  enabledSkills?: string[] | 'default';
};

/**
 * What a Codex session is given of its own. `trustFrom`: a directory whose trust in the operator's Codex config extends to
 * the session's `cwd`, so a worktree of a repository you trust is trusted for the run and loads the project's rules. It is
 * extended and never granted: a directory the config does not trust gives the session no trust. Absent: no trust is
 * extended.
 */
export type CodexArgs = { trustFrom?: string };

/** Every harness argument by name. Exhaustive by type: a key added to `HarnessArgs` and not here does not compile. */
const KEYS: Record<keyof HarnessArgs, true> = {
  model: true,
  permissionMode: true,
  effort: true,
  tools: true,
  allowedTools: true,
  disallowedTools: true,
  mcp: true,
  checkoutMcp: true,
  contextTokens: true,
  worktree: true,
  budgetUsd: true,
  claude: true,
  codex: true,
  command: true,
  env: true,
  niceness: true,
  mounts: true,
  callAdmission: true,
  mayAsk: true,
  enabledSkills: true,
};
export const HARNESS_ARGS = Object.keys(KEYS) as ReadonlyArray<keyof HarnessArgs>;

/**
 * Each former harness argument of its own, by the key of the flag in `config.claude` that replaces it: filed at its former
 * place — under `config` or beside it — it is refused naming the flag (`argsRefusalOf`), and read from a journal an older
 * runtime wrote as the flag (`upgrade` in `journal.ts`).
 */
export const FORMER_ARGS: Readonly<Record<string, string>> = { remoteControl: 'remoteControl' };

/**
 * Each harness argument taken away with nothing in its place, by its key, and what to do instead: filed under `config` or beside
 * it, whatever its value, it is refused in those words (`argsRefusalOf`), and dropped from a journal an older runtime wrote
 * (`upgrade` in `journal.ts`). `background` ran a Claude Code session as `claude --bg`, which this runtime no longer runs: every
 * Claude Code session runs on the Agent SDK, and one meant to stay open is long-lived.
 */
export const TAKEN_ARGS: Readonly<Record<string, string>> = {
  background:
    "`background` ran a Claude Code session as `claude --bg`, which this runtime no longer runs: every Claude Code session runs on the Agent SDK. Drop the field: a session that stays open until it is stopped is filed `restartPolicy: 'Always'`, and a step runs as a job.",
};

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
 * A task's bridge as its view says it, from its configuration (`config`) and what its harness saw of the session (`seen`): `undefined`
 * for a task that did not ask for one (`bridgeAsked`), whatever was seen; else the bridge seen, a link or why there is none; else no
 * link, and why, by whether the task is `settled`. Never `undefined` for a task that asked: an absent link is not "not bridged".
 */
export const bridgeOfTask = (config: HarnessArgs | undefined, settled: boolean, seen: Bridge | undefined): Bridge | undefined => {
  if (!bridgeAsked({ config })) return undefined;
  if (seen) return seen;
  return {
    url: null,
    why: settled
      ? 'its session has ended, and its bridge with it.'
      : 'no process of its session is seen yet to read its bridge from: it is starting, restarting, or between attempts.',
  };
};

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
 * The checks every adapter shares: a value no harness could use, refused before it is journalled, since a journalled task
 * is a promise the loop keeps trying to honour. Asked by every `Runner` (`Runner.layer`), so a bare `Runner` and
 * the `file` of an engine `Engine.layer` builds give one sentence for each. A harness's own words — the modes and efforts it takes — are
 * its runner's (`harnessRefusalOf` in `service/harness-refusal.ts`).
 *
 * In order:
 *
 * 1. A former argument that Claude Code's flags replace (`FORMER_ARGS`), or one taken away with nothing in its place
 *    (`TAKEN_ARGS`), wherever it was filed, with a sentence naming where it went or what to do instead. It is refused as an own
 *    key, whatever its value, `false` and `undefined` included, so a caller still writing it is told.
 * 2. A harness argument filed beside `config` rather than in it: an untyped caller would otherwise have it journalled
 *    nowhere and its session started without it.
 * 3. `config` itself, then each of its arguments.
 */
export const argsRefusalOf = (spec: { config?: HarnessArgs }): string | undefined => {
  const filed = (spec as { config?: unknown }).config;
  const at = (o: unknown, key: string) => typeof o === 'object' && o !== null && Object.hasOwn(o, key);
  const former = Object.entries(FORMER_ARGS).find(([key]) => at(spec, key) || at(filed, key));
  if (former) {
    const [key, flag] = former;
    return `\`${key}\` is Claude Code's own flag, not a harness argument: file it with Claude Code's flags, as \`config: { claude: { ${flag}: true } }\`, or leave it out.`;
  }
  const taken = Object.entries(TAKEN_ARGS).find(([key]) => at(spec, key) || at(filed, key));
  if (taken) return taken[1];
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
  if (
    config.contextTokens !== undefined &&
    !(typeof config.contextTokens === 'number' && Number.isSafeInteger(config.contextTokens) && config.contextTokens > 0)
  ) {
    return `\`contextTokens: ${typeof config.contextTokens === 'number' ? config.contextTokens : JSON.stringify(config.contextTokens)}\` is not a number of tokens. Give a whole number of tokens, like 200000, or leave it out for the harness's own window.`;
  }
  if (config.budgetUsd !== undefined && !isDollars(config.budgetUsd)) {
    return `\`budgetUsd: ${shown(config.budgetUsd)}\` is not an amount of dollars. Give dollars above 0, like 5 or 0.25, or leave it out for no cap.`;
  }
  return ownArgsRefusalOf(config);
};

/**
 * Why the arguments one kind of harness alone reads cannot reach it — Claude Code's flags, Codex's own, a command's — or the
 * mounts and the admission every harness renders its own way, or a `checkoutMcp` that names no servers, or `undefined`.
 */
const ownArgsRefusalOf = (config: HarnessArgs): string | undefined =>
  claudeFlagsRefusalOf(config.claude) ??
  codexArgsRefusalOf(config.codex) ??
  commandArgsRefusalOf(config) ??
  checkoutMcpRefusalOf(config) ??
  mountsRefusalOf(config.mounts) ??
  admissionRefusalOf(config.callAdmission) ??
  mayAskRefusalOf(config) ??
  enabledSkillsRefusalOf(config);

/** Why a task's `enabledSkills` names no set of skills — or `undefined`: neither `'default'` nor a list of names, or a name twice. */
const enabledSkillsRefusalOf = ({ enabledSkills }: HarnessArgs): string | undefined => {
  if (enabledSkills === undefined || enabledSkills === 'default') return undefined;
  const names: unknown = enabledSkills;
  if (!(Array.isArray(names) && names.every((n) => typeof n === 'string' && /^[\w.-]+(:[\w.-]+)?$/.test(n)))) {
    return `\`enabledSkills: ${JSON.stringify(names)}\` is not a set of skills. Give the names of the skills the session is given, like ["my-plugin:review"], [] for none, or "default" for the harness's own set.`;
  }
  const twice = enabledSkills.find((n, i) => enabledSkills.indexOf(n) !== i);
  return twice === undefined ? undefined : `\`enabledSkills\` names \`${twice}\` twice. Name each skill once.`;
};

/** Why a task's `mayAsk` is not whether a person can be asked through its session — or `undefined`: anything but true or false. */
const mayAskRefusalOf = ({ mayAsk }: HarnessArgs): string | undefined =>
  mayAsk === undefined || typeof mayAsk === 'boolean'
    ? undefined
    : `\`mayAsk: ${JSON.stringify(mayAsk)}\` is not true or false. Give true to hold a call that would ask a person while one answers it, or leave it out to have such a call denied.`;

/**
 * Why a task's `checkoutMcp` names no servers of a checkout's `.mcp.json` — or `undefined`: not a list of server names, a name
 * twice, or a name the task's own `mcp` gives too, where one would hide the other.
 */
const checkoutMcpRefusalOf = ({ checkoutMcp, mcp }: HarnessArgs): string | undefined => {
  if (checkoutMcp === undefined) return undefined;
  const names: unknown = checkoutMcp;
  if (!(Array.isArray(names) && names.every((n) => typeof n === 'string' && /^[\w-]+$/.test(n)))) {
    return `\`checkoutMcp: ${JSON.stringify(names)}\` is not a list of server names. Give the names of the checkout's \`.mcp.json\` servers the session loads, like ["playwright"], [] for none, or leave it out for the whole file.`;
  }
  const twice = checkoutMcp.find((n, i) => checkoutMcp.indexOf(n) !== i);
  if (twice !== undefined) return `\`checkoutMcp\` names \`${twice}\` twice. Name each server once.`;
  const both = checkoutMcp.find((n) => typeof mcp === 'object' && mcp !== null && Object.hasOwn(mcp, n));
  if (both !== undefined) {
    return `\`checkoutMcp\` names \`${both}\`, and \`mcp.${both}\` gives a server of that name too: one would hide the other. Give the task's server another name, or take the name off \`checkoutMcp\`.`;
  }
  return undefined;
};

/** A flag's name in camelCase, two letters or more: a one-letter flag is Claude Code's short form, which has a long one. */
const FLAG_KEY = /^[a-z][a-zA-Z0-9]+$/;

/**
 * Why `config.claude` cannot be handed to Claude Code as flags — or `undefined`. Each value must say one thing on the
 * command line: `false` and `null` would be dropped, an object has no flag's form, and an empty list gives nothing.
 */
const claudeFlagsRefusalOf = (flags: unknown): string | undefined => {
  if (flags === undefined) return undefined;
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

/**
 * Why `config.codex` cannot be handed to Codex — or `undefined`. An object holding only `trustFrom`, whose value is an
 * absolute path: a key misspelled would name no directory, and a relative one would be read against a `cwd` it was not
 * written for.
 */
const codexArgsRefusalOf = (args: unknown): string | undefined => {
  if (args === undefined) return undefined;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return `\`codex: ${JSON.stringify(args)}\` is not a set of Codex's arguments. Give an object, like { "trustFrom": "/path/to/repo" }, or leave it out.`;
  }
  const stray = Object.keys(args).find((key) => key !== 'trustFrom');
  if (stray) {
    return `\`codex.${stray}\` is not one of Codex's arguments. Its only one is \`trustFrom\`, the directory whose trust in your Codex config extends to the cwd.`;
  }
  const { trustFrom } = args as CodexArgs;
  if (trustFrom !== undefined && !(typeof trustFrom === 'string' && path.isAbsolute(trustFrom))) {
    return `\`codex.trustFrom: ${JSON.stringify(trustFrom)}\` is not an absolute directory. Name the directory you trust in your Codex config by its absolute path, like "/path/to/repo", or leave it out to extend no trust.`;
  }
  return undefined;
};

/** A variable's name as a shell and `env` take one: a letter or an underscore first, then letters, digits and underscores. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A string a process can be handed: one with no NUL, which would end it early on its way to the program. */
const isArg = (v: unknown): v is string => typeof v === 'string' && !v.includes(String.fromCharCode(0));

/**
 * Why a task's `command`, `env` or `niceness` cannot reach a process — or `undefined`: a `command` that is not a list whose first
 * entry names a program, or holds an entry that is no string or has a NUL; an `env` that is not an object of variable names to
 * strings with no NUL; a `niceness` that is not a whole number from 0 to 19.
 */
const commandArgsRefusalOf = ({ command, env, niceness }: HarnessArgs): string | undefined => {
  if (command !== undefined && !(Array.isArray(command) && command.length > 0 && command[0] !== '' && command.every(isArg))) {
    return `\`command: ${JSON.stringify(command)}\` is not a command. Give the program and its arguments as a list of strings, the program first, like ["sh", "-c", "npm test"].`;
  }
  if (env !== undefined) {
    if (typeof env !== 'object' || env === null || Array.isArray(env)) {
      return `\`env: ${JSON.stringify(env)}\` is not an environment. Give an object of variable names to strings, like { "CI": "1" }, or leave it out.`;
    }
    const name = Object.keys(env).find((key) => !ENV_NAME.test(key));
    if (name !== undefined) {
      return `\`env.${name}\` is not a variable's name. Name it with letters, digits and underscores, a letter or an underscore first, like CI or WF_RUN.`;
    }
    const value = Object.keys(env).find((key) => !isArg(env[key]));
    if (value !== undefined) {
      return `\`env.${value}: ${JSON.stringify(env[value])}\` is not a variable's value. Give a string with no NUL in it, like "1".`;
    }
  }
  if (niceness !== undefined && !(Number.isSafeInteger(niceness) && niceness >= 0 && niceness <= 19)) {
    return `\`niceness: ${shown(niceness)}\` is not a niceness. Give a whole number from 0 to 19, like 10, or leave it out for the worker's own priority.`;
  }
  return undefined;
};
