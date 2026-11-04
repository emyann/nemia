/**
 * A factory's harness settings: the settings of a harness a factory names once, given to every session of its runs' steps on that harness
 * on top of the repository's own (its arguments' `settings`, which the runtime hands the Agent SDK as `Options.settings`). Keyed by
 * harness as the runtime keys its arguments; the default harness alone today (`SETTINGS_HARNESS`), the one whose settings the runtime
 * carries. The harness's own names stay the runtime's: this file says the default harness, never its name.
 *
 * A factory sets only the keys of a closed list (`SETTABLE`), each one that changes what a session writes or says and none that
 * changes what it may reach or run. The rest are refused, because the harness's settings keep growing and many of their keys run a
 * program or widen a fence: a list of what is allowed makes each new key a decision, where a list of what is refused lets it through
 * unjudged. A key that widens keeps its own field or fence (`OWNED_ELSEWHERE`), which the refusal names. Pure.
 */
import { DEFAULT_HARNESS } from '../harness/harness.ts';

/** The harness a factory may name settings of: the default one, whose settings the runtime carries to its sessions. */
export const SETTINGS_HARNESS = DEFAULT_HARNESS;

/**
 * The settings a factory may set, each with the type of its value: `attribution` (the trailer of a session's commits and the line of its
 * pull requests: `false`, or `{ commit?, pr?, sessionUrl? }`), `includeGitInstructions` (whether its system prompt holds the harness's
 * git instructions) and `language` (the language it answers in). Each changes what a session writes or says; none what it may reach or
 * run.
 */
const TAKES = { attribution: 'attribution', includeGitInstructions: 'boolean', language: 'string' } as const;

/** The settings a factory may set, by name (`TAKES`). */
export const SETTABLE = Object.keys(TAKES) as readonly FactorySetting[];

type FactorySetting = keyof typeof TAKES;

/** How a session marks the commits and pull requests it writes: `false` for not at all, or each mark, an empty one for none. */
export type Attribution = boolean | { commit?: string; pr?: string; sessionUrl?: boolean };

/** The settings a factory names of its harness (`SETTABLE`). */
export type FactorySettings = { attribution?: Attribution; includeGitInstructions?: boolean; language?: string };

/** A factory's harness settings, by harness (`HarnessSettings`): the default harness's alone, once judged. */
export type HarnessSettings = Readonly<Record<string, FactorySettings>>;

/** A factory's harness settings as its file holds them, unjudged: the file reads whatever a person wrote, and a start judges it. */
export type SettingsAsRead = Readonly<Record<string, unknown>>;

const SERVERS = "an agent's mcp: line and nemia factory server add";
const RUNS = 'a program it runs';
const OWN_SETTINGS = "the repository's own settings file";

/** Where a setting a factory may not set is owned instead, for the refusal to name. */
const OWNED_ELSEWHERE: Readonly<Record<string, string>> = {
  permissions: "a step's fence, its allowed and denied tools",
  hooks: OWN_SETTINGS,
  disableAllHooks: OWN_SETTINGS,
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

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

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
function valueRefusal(key: FactorySetting, value: unknown): string | undefined {
  const takes = TAKES[key];
  if (takes === 'attribution') return attributionRefusal(value);
  return typeof value === takes ? undefined : `is a ${takes}`;
}

const isAllowed = (key: string): key is FactorySetting => (SETTABLE as readonly string[]).includes(key);

/**
 * Why `settings`, a factory's `harnessSettings` as it was written, cannot be given to its runs: not an object; a harness other than the
 * default one; a key off `SETTABLE`, naming where a widening one is owned; a value of the wrong type. Each names the fix, by
 * `nemia factory setting rm`. Undefined: none, or every key allowed.
 */
export function harnessSettingsRefusal(settings: unknown, factory: string): string | undefined {
  if (settings === undefined) return undefined;
  if (!isObject(settings)) return `the harness settings of ${factory} are no object: write them with nemia factory setting set`;
  for (const [harness, keys] of Object.entries(settings)) {
    if (harness !== SETTINGS_HARNESS)
      return `the harness settings of ${factory} name ${harness}, where only ${SETTINGS_HARNESS} takes settings from a factory: remove ${harness} from its file`;
    if (!isObject(keys)) return `the ${harness} settings of ${factory} are no object: write them with nemia factory setting set`;
    const refused = Object.entries(keys)
      .map(([key, value]) => keyRefusal(key, value, factory))
      .find((why) => why !== undefined);
    if (refused) return refused;
  }
  return undefined;
}

/** Why the setting `key` of `factory` cannot be `value`: a key off the list, naming where it is owned, or a wrong value. */
function keyRefusal(key: string, value: unknown, factory: string): string | undefined {
  const named = `${SETTINGS_HARNESS}.${key}`;
  const rm = `nemia factory setting rm ${factory} ${named}`;
  if (!isAllowed(key)) {
    const owner = OWNED_ELSEWHERE[key];
    const owned =
      owner === undefined ? '' : `, which ${owner === RUNS ? 'runs a program, which no factory setting may' : `is owned by ${owner}`}`;
    return `a factory does not set ${named}${owned}: it sets ${SETTABLE.join(', ')} alone. ${rm}`;
  }
  const wrong = valueRefusal(key, value);
  return wrong && `${named} of ${factory} ${wrong}: nemia factory setting set ${factory} ${named} <json>, or ${rm}`;
}

/** Whether `settings` are what a factory may set (`harnessSettingsRefusal`). */
export const isHarnessSettings = (settings: unknown): settings is HarnessSettings => harnessSettingsRefusal(settings, '') === undefined;

/** `<harness>.<key>` as a person types it, split; or why it is not one. */
export function settingKeyOf(spelled: string): { harness: string; key: string } | string {
  const dot = spelled.indexOf('.');
  if (dot <= 0 || dot === spelled.length - 1)
    return `${JSON.stringify(spelled)} is no setting: name it <harness>.<key>, one of ${SETTABLE.map((k) => `${SETTINGS_HARNESS}.${k}`).join(', ')}`;
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

/** A factory's settings as `nemia factory ls` lists them under its line: `setting <harness>.attribution {"commit":"","pr":""}`. */
export const settingLines = (settings: SettingsAsRead | undefined, width: number): string[] =>
  settingsNamed(settings).map((s) => `${' '.repeat(width)}  setting ${s.name} ${JSON.stringify(s.value)}`);

/**
 * The settings a step on the default harness is filed with (its arguments' `settings`, JSON): the allowed keys of the run's frozen
 * settings of that harness (`frozen`) with a valid value, a key a hand-edited record holds off the list never filed, and the step's own
 * rendered settings (`rendered`) laid over them, so what its agent says wins. `rendered` as it was where the run froze none, or where it
 * is not an object (the runtime refuses it then, in its words).
 */
export function filedSettings(frozen: unknown, rendered: string | undefined): string | undefined {
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
