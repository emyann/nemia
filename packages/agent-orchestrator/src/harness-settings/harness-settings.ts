/**
 * A factory's harness settings: the settings of a harness a factory names once, given to every session of its runs' steps on that harness
 * on top of the repository's own (`config.claude.settings`, which the runtime hands the Agent SDK as `Options.settings`). Keyed by harness
 * as the runtime keys its arguments; `claude` alone today, the one harness whose settings the runtime carries.
 *
 * A factory sets only the keys of a closed list (`CLAUDE_FACTORY_SETTINGS`), each one that changes what a session writes or says and
 * none that changes what it may reach or run. The rest are refused, because Claude Code's settings keep growing and many of their keys
 * run a program or widen a fence: a list of what is allowed makes each new key a decision, where a list of what is refused lets it
 * through unjudged. A key that widens keeps its own field or fence (`OWNED_ELSEWHERE`), which the refusal names. Pure.
 */

/** The harnesses a factory may name settings of: the one whose settings the runtime carries to its sessions. */
export const SETTINGS_HARNESSES = ['claude'] as const;

/**
 * The Claude Code settings a factory may set: `attribution` (the trailer of its commits and the line of its pull requests: `false`, or
 * `{ commit?, pr?, sessionUrl? }`), `includeGitInstructions` (whether its system prompt holds Claude Code's git instructions) and
 * `language` (the language it answers in). Each changes what a session writes or says; none what it may reach or run.
 */
export const CLAUDE_FACTORY_SETTINGS = ['attribution', 'includeGitInstructions', 'language'] as const;

/** How a session marks the commits and pull requests it writes: `false` for not at all, or each mark, an empty one for none. */
export type Attribution = boolean | { commit?: string; pr?: string; sessionUrl?: boolean };

/** The Claude Code settings a factory names (`CLAUDE_FACTORY_SETTINGS`). */
export type ClaudeFactorySettings = { attribution?: Attribution; includeGitInstructions?: boolean; language?: string };

/** A factory's harness settings, by harness (`HarnessSettings`). */
export type HarnessSettings = { claude?: ClaudeFactorySettings };

/** A factory's harness settings as its file holds them, unjudged: the file reads whatever a person wrote, and a start judges it. */
export type SettingsAsRead = Readonly<Record<string, unknown>>;

const SERVERS = "an agent's mcp: line and nemia factory server add";
const RUNS = 'it runs a program, which no factory setting may';

/** Where a Claude Code setting a factory may not set is owned instead, for the refusal to name. */
const OWNED_ELSEWHERE: Readonly<Record<string, string>> = {
  permissions: "a step's allowedTools: and disallowedTools:",
  hooks: "the repository's .claude/settings.json",
  disableAllHooks: "the repository's .claude/settings.json",
  enableAllProjectMcpServers: SERVERS,
  enabledMcpjsonServers: SERVERS,
  disabledMcpjsonServers: SERVERS,
  sandbox: "a step's harness and its fence",
  env: "the step's environment, which the run files",
  apiKeyHelper: RUNS,
  awsCredentialExport: RUNS,
  otelHeadersHelper: RUNS,
  processWrapper: RUNS,
  statusLine: RUNS,
  fileSuggestion: RUNS,
  model: "a step's model: line",
  outputStyle: "a step's agent, which renders it",
  autoMemoryEnabled: 'the runtime, which turns it off for every session',
  claudeMdExcludes: 'the runtime, which writes it for every session',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why `value` is no `attribution`: neither a boolean nor an object of `commit`, `pr` (strings) and `sessionUrl` (a boolean). */
function attributionRefusal(value: unknown): string | undefined {
  if (typeof value === 'boolean') return undefined;
  if (!isObject(value)) return 'is a boolean or { "commit": <text>, "pr": <text>, "sessionUrl": <boolean> }';
  for (const [key, mark] of Object.entries(value)) {
    const wants = key === 'sessionUrl' ? 'boolean' : key === 'commit' || key === 'pr' ? 'string' : undefined;
    if (wants === undefined) return `holds ${key}, where it takes commit, pr and sessionUrl alone`;
    if (typeof mark !== wants) return `holds ${key} ${JSON.stringify(mark)}, where it takes a ${wants}`;
  }
  return undefined;
}

/** Why `value` is not what the allowed setting `key` takes, or undefined. */
const valueRefusal = (key: (typeof CLAUDE_FACTORY_SETTINGS)[number], value: unknown): string | undefined =>
  key === 'attribution'
    ? attributionRefusal(value)
    : typeof value === (key === 'language' ? 'string' : 'boolean')
      ? undefined
      : `is a ${key === 'language' ? 'string' : 'boolean'}`;

const isAllowed = (key: string): key is (typeof CLAUDE_FACTORY_SETTINGS)[number] => (CLAUDE_FACTORY_SETTINGS as readonly string[]).includes(key);

/**
 * Why `settings`, a factory's `harnessSettings` as it was written, cannot be given to its runs: not an object; a harness other than
 * `claude`; a key off `CLAUDE_FACTORY_SETTINGS`, naming where a widening one is owned; a value of the wrong type. Each names the fix, by
 * `nemia factory setting rm`. Undefined: none, or every key allowed.
 */
export function harnessSettingsRefusal(settings: unknown, factory: string): string | undefined {
  if (settings === undefined) return undefined;
  if (!isObject(settings)) return `the harness settings of ${factory} are no object: write them with nemia factory setting set`;
  for (const [harness, keys] of Object.entries(settings)) {
    if (harness !== 'claude')
      return `the harness settings of ${factory} name ${harness}, where only ${SETTINGS_HARNESSES.join(', ')} takes settings from a factory: remove ${harness} from its file`;
    if (!isObject(keys)) return `the claude settings of ${factory} are no object: write them with nemia factory setting set`;
    for (const [key, value] of Object.entries(keys)) {
      const rm = `nemia factory setting rm ${factory} claude.${key}`;
      if (!isAllowed(key)) {
        const owner = OWNED_ELSEWHERE[key];
        return `a factory does not set claude.${key}${owner ? `, which is ${owner.startsWith('it ') ? owner.slice(3) : `owned by ${owner}`}` : ''}: it sets ${CLAUDE_FACTORY_SETTINGS.join(', ')} alone. ${rm}`;
      }
      const wrong = valueRefusal(key, value);
      if (wrong) return `claude.${key} of ${factory} ${wrong}: nemia factory setting set ${factory} claude.${key} <json>, or ${rm}`;
    }
  }
  return undefined;
}

/** Whether `settings` are what a factory may set (`harnessSettingsRefusal`). */
export const isHarnessSettings = (settings: unknown): settings is HarnessSettings => harnessSettingsRefusal(settings, '') === undefined;

/** `<harness>.<key>` as a person types it, split; or why it is not one. */
export function settingKeyOf(spelled: string): { harness: string; key: string } | string {
  const dot = spelled.indexOf('.');
  if (dot <= 0 || dot === spelled.length - 1)
    return `${JSON.stringify(spelled)} is no setting: name it <harness>.<key>, as claude.attribution, one of claude.${CLAUDE_FACTORY_SETTINGS.join(', claude.')}`;
  return { harness: spelled.slice(0, dot), key: spelled.slice(dot + 1) };
}

/** `settings` with `harness`.`key` set to `value`, unjudged: the caller refuses what `harnessSettingsRefusal` refuses. */
export function withSetting(settings: SettingsAsRead | undefined, harness: string, key: string, value: unknown): Record<string, unknown> {
  const all: Record<string, unknown> = { ...settings };
  const was = all[harness];
  return { ...all, [harness]: { ...(isObject(was) ? was : {}), [key]: value } };
}

/** `settings` without `harness`.`key`, a harness with no key left gone, and undefined when none is left. */
export function withoutSetting(settings: SettingsAsRead | undefined, harness: string, key: string): SettingsAsRead | undefined {
  const next: Record<string, Record<string, unknown>> = {};
  for (const [h, keys] of Object.entries(settings ?? {})) {
    const left = Object.fromEntries(Object.entries(isObject(keys) ? keys : {}).filter(([k]) => !(h === harness && k === key)));
    if (Object.keys(left).length) next[h] = left;
  }
  return Object.keys(next).length ? next : undefined;
}

/** The settings `settings` names, each `<harness>.<key>` with its value: what `nemia factory`, adopt's plan and a start say of them. */
export const settingsNamed = (settings: SettingsAsRead | undefined): { name: string; value: unknown }[] =>
  Object.entries(settings ?? {}).flatMap(([harness, keys]) =>
    Object.entries(isObject(keys) ? keys : {}).map(([key, value]) => ({ name: `${harness}.${key}`, value })),
  );

/** A factory's settings as `nemia factory ls` lists them under its line: `setting claude.attribution {"commit":"","pr":""}`. */
export const settingLines = (settings: SettingsAsRead | undefined, width: number): string[] =>
  settingsNamed(settings).map((s) => `${' '.repeat(width)}  setting ${s.name} ${JSON.stringify(s.value)}`);

/**
 * The settings a Claude Code step is filed with (`config.claude.settings`, JSON): the allowed keys of the run's frozen settings
 * (`frozen`) with a valid value, a key a hand-edited record holds off the list never filed, and the step's own rendered settings
 * (`rendered`) laid over them, so what its agent says wins. `rendered` as it was where the run froze none, or where it is not an object
 * (the runtime refuses it then, in its words).
 */
export function filedClaudeSettings(frozen: unknown, rendered: string | undefined): string | undefined {
  const given = isObject(frozen)
    ? Object.fromEntries(Object.entries(frozen).filter(([key, value]) => isAllowed(key) && valueRefusal(key, value) === undefined))
    : {};
  if (!Object.keys(given).length) return rendered;
  let own: unknown = {};
  try {
    own = rendered === undefined ? {} : JSON.parse(rendered);
  } catch {
    return rendered;
  }
  return isObject(own) ? JSON.stringify({ ...given, ...own }) : rendered;
}
