/**
 * Claude Code's vocabulary — the permission modes, efforts and context windows it takes — and what it refuses to be
 * asked for, as sentences. Harness vocabulary, so it lives beside the runners
 * that speak it and never in `domain.ts`.
 */
import type { SpawnRequest } from '../seam.ts';

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
 * How wide each of Claude Code's permission modes is, for a session nobody answers, wider higher and equal as wide: `plan` changes
 * nothing; `default`, `manual` and `dontAsk` run what the rules allow and deny the rest, since a job denies whatever they would ask;
 * `acceptEdits` writes in its directory unasked; `auto` lets a classifier allow what it judges safe; `bypassPermissions` asks about
 * nothing. Every word of `CLAUDE_PERMISSION_MODES` has one (`test/fence-reach.test.ts`).
 */
export const CLAUDE_MODE_RANK: Readonly<Record<string, number>> = {
  plan: 0,
  dontAsk: 1,
  default: 1,
  manual: 1,
  acceptEdits: 2,
  auto: 3,
  bypassPermissions: 4,
};

/**
 * The permission modes a job runs what its allow rules reach in, and refuses every other call in rather than stopping to ask: every mode
 * from the narrowest that runs anything up to the widest that still decides by rule alone — the one that writes in its directory
 * unasked — since a job denies whatever a mode would ask. Under one of them a tool a session is given that neither a rule names nor the
 * mode itself grants (`CLAUDE_UNFENCED`, `CLAUDE_GRANTED`) can never be called. Above them a classifier (`auto`) or the mode itself
 * (`bypassPermissions`) allows what no rule names, which no list can model; `plan` refuses by its own kind, and what it does with a tool
 * that neither reads nor writes is unmeasured, so neither is here.
 */
export const CLAUDE_REFUSING_MODES: readonly string[] = ['default', 'dontAsk', 'manual', 'acceptEdits'];

/**
 * The tools a session calls inside its own directory with no allow rule naming them, in every permission mode: the three that only read,
 * and the load of a skill. Every other tool is refused under a mode of `CLAUDE_REFUSING_MODES` until a rule allows it or the mode grants
 * it (`CLAUDE_GRANTED`) — `Bash` among them, whose built-in read-only commands run with no rule without making the tool itself unruled.
 */
export const CLAUDE_UNFENCED: readonly string[] = ['Read', 'Grep', 'Glob', 'Skill'];

/**
 * The tools a mode grants with no allow rule naming them, beyond `CLAUDE_UNFENCED`, by the mode that grants them; a mode that grants
 * none is absent. `acceptEdits` approves a write in the session's directory itself, so the Edit tool's family needs no rule there — and
 * nothing else does: a command it would ask about is still denied a job.
 */
export const CLAUDE_GRANTED: Readonly<Record<string, readonly string[]>> = {
  acceptEdits: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
};

/** The permission mode a Claude Code session runs in when its task names none: `--permission-mode` is always given. */
export const CLAUDE_DEFAULT_MODE = 'auto';

/** The permission mode a session held to its directory runs in: what its rules allow, and nothing it would ask about. */
export const CLAUDE_HELD_MODE = 'dontAsk';

/**
 * The permission modes a background session runs in without stopping to ask a person, the held mode first: every other mode can
 * stop on a prompt, which a background session leaves waiting for someone to answer it.
 */
export const CLAUDE_UNASKING_MODES: readonly string[] = [CLAUDE_HELD_MODE, 'bypassPermissions'];

/**
 * The models on which Claude Code drops `auto`: the session starts in `auto` and says `default` from its first turn. Each matches the
 * name as given or with a `-` suffix after it (`claude-haiku-4-5-20251001`). Measured on Claude Code 2.1.282; a model not listed is let
 * through, since the list is what is known to fail. The runtime refuses none of them: it answers the fact (`fenceReach`).
 */
export const CLAUDE_AUTO_DROPPED: readonly string[] = ['haiku', 'claude-haiku-4-5', 'claude-sonnet-4-5'];

/**
 * The efforts Claude Code takes. Refused here rather than left to the CLI, because the CLI does not
 * refuse one: it prints a warning for an unknown `--effort` and runs at its default effort — a knob
 * that silently does nothing.
 */
export const CLAUDE_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * The context windows Claude Code takes, in tokens: `--autocompact`'s range, both ends included. The CLI refuses any other
 * value while it parses its arguments ("It must be 'auto', or between 100k and 1M"), so a `--bg` spawn given one would fail
 * on every pass; `file()` asks first. 100000 and 1000000 are taken, 99999 and 1000001 refused. A value is handed over as its digits, never
 * `200k` — and never below 1000, which the CLI reads as thousands (`200` is 200k).
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
   * Refused on a job — a session held by its own process for one prompt opens no bridge — and on any
   * harness but Claude Code; a harness brought as a `RunnerOps` is handed it on the spawn, and asked only its own `refuses`.
   */
  remoteControl?: true | string;
  [flag: string]: string | number | true | string[] | undefined;
};

/**
 * The flags the runtime gives Claude Code itself, or that change how it reads the session, in `config.claude`'s camelCase:
 * a task that gave one there would have it twice, or the session printing what no reader of it expects. Each is given its
 * own way — `model`, `permissionMode`, `tools`, `budgetUsd` and the rest are harness arguments of their own. The argv of
 * every Claude Code spawn is held to this list (`test/claude-code.test.ts`), so a flag the runtime starts giving is added.
 * `settingSources` is given to every job, which reads its checkout's shared settings and neither the operator's nor the
 * checkout's local file (`claudePrintFlags`), and not to a background session.
 */
export const CLAUDE_OWNED_FLAGS: readonly string[] = [
  'print',
  'p',
  'bg',
  'name',
  'inputFormat',
  'outputFormat',
  'verbose',
  'includePartialMessages',
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
  'addDir',
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
 * A task's mounts as Claude Code's arguments: `--add-dir` and every mount's path, or nothing for none. Variadic, so it is placed
 * where a flag follows it, never the brief.
 */
export const claudeMountArgs = (config: SpawnRequest['config']): string[] =>
  config?.mounts?.length ? ['--add-dir', ...config.mounts.map((m) => m.path)] : [];

/**
 * What a Claude Code session is denied: the task's `disallowedTools`, and an edit anywhere under each read-only mount,
 * `Edit(//<path>/**)`. `--add-dir` grants writes as well as reads where the mode lets a session write, and a deny beats every
 * allow and every mode: it holds the folder read-only under `dontAsk`, `acceptEdits`, `auto` and `bypassPermissions`, a Bash
 * redirection into it included (measured on Claude Code 2.1.288).
 */
export const claudeDenies = (config: SpawnRequest['config']): string[] => [
  ...(config?.disallowedTools ?? []),
  ...(config?.mounts ?? []).filter((m) => m.readOnly).map((m) => `Edit(/${m.path}/**)`),
];

/** The `--disallowedTools` flag and its one argument, the session's denies joined by commas (`claudeDenies`), or nothing for none. */
export const claudeDenyArgs = (config: SpawnRequest['config']): string[] => {
  const denies = claudeDenies(config);
  return denies.length ? ['--disallowedTools', denies.join(',')] : [];
};

/**
 * What a Claude Code session may do without asking: the task's `allowedTools`, and an edit anywhere under each writable mount,
 * `Edit(//<path>/**)`. `dontAsk` refuses a write under an added folder that no allow names, `Edit(**)` included, since it resolves
 * against the session's cwd; the allow lets the Edit tool and a Bash redirection write there. `auto` writes there without it
 * (measured on Claude Code 2.1.288).
 */
export const claudeAllows = (config: SpawnRequest['config']): string[] => [
  ...(config?.allowedTools ?? []),
  ...(config?.mounts ?? []).filter((m) => !m.readOnly).map((m) => `Edit(/${m.path}/**)`),
];

/** The `--allowedTools` flag and its one argument, the session's allows joined by commas (`claudeAllows`), or nothing for none. */
export const claudeAllowArgs = (config: SpawnRequest['config']): string[] => {
  const allows = claudeAllows(config);
  return allows.length ? ['--allowedTools', allows.join(',')] : [];
};

/**
 * A character a permission rule cannot carry in a path, `Read(//<path>/**)` or `Edit(//<path>/**)`: a glob's `*`, `?` or `[` widens the
 * rule to a sibling, and `]` with it; a backslash escapes the character after it, so the rule misses its own folder and names the one
 * without it; a parenthesis is refused by the runtime's own grammar of a rule (`RULE`, `harness/args.ts`), though Claude Code reads one;
 * and a whitespace other than a space is not measured. Measured on Claude Code 2.1.291, `claude -p` in `dontAsk` given
 * `--allowedTools 'Edit(**),Read(//<dir>/**)'` as one argument: a space, a comma and braces are carried inside the parentheses, in an
 * allow and in a deny alike, so a folder named with them is read and its sibling is not; a folder named with `*`, `?` or `[ab]` let a
 * sibling the glob matches be read, and one named with a backslash before a letter let the sibling without the backslash be read, and
 * not itself. An escape is read: a rule naming `\*` let the folder named with the `*` be read, and not its sibling.
 */
export const CLAUDE_UNRULED = /[()*?[\]\\]|[^\S ]/;

/**
 * Why a task's mount cannot be held by Claude Code — or `undefined`: its path has a character the permission rule that denies an
 * edit there (`claudeDenies`), or allows one (`claudeAllows`), cannot carry (`CLAUDE_UNRULED`).
 */
const claudeMountRefusal = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const mount = task.config?.mounts?.find((m) => CLAUDE_UNRULED.test(m.path));
  if (!mount) return undefined;
  const how = mount.readOnly
    ? 'read-only, and Claude Code holds a folder read-only'
    : 'writable, and Claude Code lets a session write a folder beside its own';
  return `\`mounts\` gives the session ${JSON.stringify(mount.path)} ${how} by a permission rule, which cannot name a path with a parenthesis, a glob's character (*, ? or a bracket), a backslash, or a whitespace other than a space. Mount a folder whose path has none of them, or leave the mount off.`;
};

/**
 * Why a task's admission cannot be merged into its Claude Code settings — or `undefined`: settings given as a file, which the runtime
 * does not rewrite, or JSON that is no object.
 */
export const claudeAdmissionRefusal = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const settings = task.config?.claude?.settings;
  if (task.config?.callAdmission === undefined || settings === undefined) return undefined;
  if (settingsObject(settings) !== undefined) return undefined;
  return `\`claude.settings\` is given as ${JSON.stringify(settings)}, and admission is merged into the session's settings as a hook: the runtime rewrites no file. Give the settings as a JSON object, like {"env":{"CI":"1"}}, or leave admission off.`;
};

/** Settings given as JSON, as an object; undefined for a file's path or JSON that is no object. */
export const settingsObject = (settings: string): Record<string, unknown> | undefined => {
  try {
    const read: unknown = JSON.parse(settings);
    return typeof read === 'object' && read !== null && !Array.isArray(read) ? (read as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether a task asks for its session bridged to claude.ai: Claude Code's `--remote-control`, given in its flags
 * (`config.claude.remoteControl`). Only a background session opens one.
 */
export const bridgeAsked = (task: { config?: { claude?: ClaudeFlags } }): boolean => task.config?.claude?.remoteControl !== undefined;

/**
 * What Claude Code cannot be asked for, Codex's own arguments, a mount whose rule it cannot write and admission beside settings it
 * cannot merge among it, as a sentence that says what to write instead.
 */
export const claudeRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined => {
  const { permissionMode, effort } = task.config ?? {};
  const owned = Object.keys(task.config?.claude ?? {}).find((key) => CLAUDE_OWNED_FLAGS.includes(key));
  if (task.config?.codex !== undefined) {
    return `\`codex: ${JSON.stringify(task.config.codex)}\` gives Codex arguments of its own, and Claude Code is not Codex. Leave \`codex\` off a Claude Code task.`;
  }
  if (owned) {
    return `\`claude.${owned}\` is a flag the runtime gives Claude Code itself (\`${claudeFlagName(owned)}\`), and the session would have it twice. Give it as the harness argument of its own where there is one — \`model\`, \`permissionMode\`, \`tools\`, \`budgetUsd\` and the rest — or leave it out.`;
  }
  if (permissionMode !== undefined && !CLAUDE_PERMISSION_MODES.includes(permissionMode)) {
    return `\`permissionMode: ${permissionMode}\` is not a mode Claude Code has. Its modes are: ${CLAUDE_PERMISSION_MODES.join(', ')}.`;
  }
  if (effort !== undefined && !CLAUDE_EFFORTS.includes(effort)) {
    return `\`effort: ${effort}\` is not an effort Claude Code has. Its efforts are: ${CLAUDE_EFFORTS.join(', ')}.`;
  }
  return claudeMountRefusal(task) ?? claudeAdmissionRefusal(task);
};

/**
 * What Claude Code run as `claude -p` cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a bridge to claude.ai,
 * which only a background session opens, and which `claudeFlagsOf` would otherwise spell onto a prompt that runs and exits. The
 * engine words it with the harnesses that do bridge (`harnessRefusalOf` in `service/harness-refusal.ts`); this is a bare `Runner`'s.
 */
export const claudePrintRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined =>
  claudeRefuses(task) ??
  (bridgeAsked(task)
    ? '`claude.remoteControl` asks for a session bridged to claude.ai, and a session that runs one prompt and exits is held by its own process, which serves no bridge for anyone to reach: only a Claude Code background session (`claude --bg --remote-control`) is bridged. Leave `claude.remoteControl` off.'
    : undefined);

/**
 * What a Claude Code background session cannot be asked for, beyond what Claude Code cannot (`claudeRefuses`): a spend
 * cap. `claude --bg` takes `--max-budget-usd` and keeps nothing of it — its help says the flag "only works with --print",
 * and a `--bg` session given a cap spends past it and ends on its own (`test/live.test.ts`). A cap that caps nothing is refused rather than
 * carried; a job keeps one, on `Options.maxBudgetUsd`, and so does `claude -p`.
 */
export const claudeBgRefuses = (task: Omit<SpawnRequest, 'name'>): string | undefined =>
  claudeRefuses(task) ??
  (task.config?.budgetUsd === undefined
    ? undefined
    : `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session spends past a cap it is given. File the task on \`claude\`, whose jobs run one prompt and end at their cap, or on \`claude-detached\`, which runs \`claude -p\` and does the same, or leave \`budgetUsd\` off.`);

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
      : `\`budgetUsd: ${task.config.budgetUsd}\` is a spend cap, and a \`claude --bg\` session does not keep one: Claude Code takes \`--max-budget-usd\` only with \`--print\`, and a background session spends past a cap it is given. Leave \`config.background\` off to run the task as a job, which ends the session at its cap, or leave \`budgetUsd\` off.`;
  }
  return bridgeAsked(task)
    ? '`claude.remoteControl` bridges a session to claude.ai, and only a background session (`claude --bg`) can be bridged: a job runs one prompt in a process of its own, which opens no bridge. Give `config.background: true` as well, or leave `claude.remoteControl` off.'
    : undefined;
};

/**
 * A worktree name for this attempt. Derived from the session name when the task did not pick one,
 * so it is stable, greppable, and — the point — never absent.
 */
export const worktreeName = (r: SpawnRequest): string =>
  typeof r.config?.worktree === 'string' ? r.config.worktree : r.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The folders Claude Code reads as its own configuration inside a folder it is given by `--add-dir`: `.claude`, whose `skills` it lists
 * in the session (its `CLAUDE.md` is not read). Taken whole, since what it does with the folder's other subfolders is unmeasured.
 */
export const CLAUDE_CONFIG_FOLDERS: readonly string[] = ['.claude'];
