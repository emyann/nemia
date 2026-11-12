/**
 * The words of Nemia's switch and of the feed's subscriptions: `level`, the chat's `speakers`, `allow` and `disallow`, `subscribe` and
 * `unsubscribe`. A check here is the pure part of what the handler refuses; what needs the orchestrator's rules or the feed's grammar (a
 * name an agent speaks under, a subscription's name, a label query) the api refuses, `Invalid`. Pure.
 */
import type { Args, CommandWords, Spec } from './command.ts';
import { SELECTOR_FLAG_FORM } from './commands-flags.ts';
import { DEFAULT_NAMESPACE } from './meta.ts';
import { LEVELS } from './words.ts';

/** How `nemia level` is typed, as its refusals end on it. */
export const LEVEL_FORM = `nemia level [${LEVELS.join('|')}] [--factory <name> [--for <duration> | --end]]`;

/** The text under `key`, or undefined where none was given. */
const textIn = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** Why `word` is no level `nemia level` sets, or null where it is one. */
const levelWordRefusal = (word: string): string | null =>
  (LEVELS as readonly string[]).includes(word) ? null : `${JSON.stringify(word)} is no level: ${LEVEL_FORM}.`;

/** Whether `text` is a stretch a raise is given for: digits and `m`, `h` or `d`, above zero and at most a week. */
const isStretch = (text: string): boolean => {
  const [, digits, unit] = /^(\d+)([mhd])$/.exec(text.trim()) ?? [];
  const minutes = unit === 'm' ? 1 : unit === 'h' ? 60 : unit === 'd' ? 1440 : 0;
  const total = Number(digits ?? 0) * minutes;
  return total > 0 && total <= 7 * 1440;
};

/**
 * The refusal of a factory write's arguments, or null: `--for` or `--end` with no factory, a raise with no level, an end with one, both,
 * the default factory named (the store's level is its own), and a stretch that is none.
 */
function factoryArgsRefusal(args: Args): string | null {
  const level = textIn(args, 'level');
  const stretch = textIn(args, 'for');
  const factory = textIn(args, 'factory');
  const end = args['end'] === true;
  if ((stretch !== undefined || end) && factory === undefined)
    return `--for and --end take the factory raised, --factory <name>: ${LEVEL_FORM}.`;
  if (stretch !== undefined && end) return `--for raises a factory and --end ends its raise: give one, ${LEVEL_FORM}.`;
  if (stretch !== undefined && level === undefined)
    return `--for takes the level the factory is raised to: nemia level semi-auto --factory ${String(factory)} --for ${stretch}.`;
  if (end && level !== undefined)
    return `--end takes no level, it ends the raise in force: nemia level --factory ${String(factory)} --end.`;
  if (factory === DEFAULT_NAMESPACE)
    return `the default factory's level is the store's own, set with no --factory: nemia level ${level ?? '<level>'}.`;
  if (stretch !== undefined && !isStretch(stretch))
    return `--for takes the stretch a raise lasts, digits and m, h or d, up to 7d, like 90m, 2h or 1d, and ${JSON.stringify(stretch)} is not one: ${LEVEL_FORM}.`;
  return null;
}

/** Whether `args` ask a write of a level: a level, a factory's, a raise or its end. Bare (or `--factory` alone) reads. */
export const levelWritten = (args: Args): boolean =>
  textIn(args, 'level') !== undefined || args['end'] === true || textIn(args, 'for') !== undefined;

/** `nemia level`: bare, where Nemia is; a level, the store's or with `--factory` a factory's, raised for a stretch or its raise ended. */
export const LEVEL_WORDS = {
  name: 'level',
  served: [{ endpoint: 'nemia.level' }, { endpoint: 'nemia.setLevel', as: 'level_set' }],
  usage: '[manual|semi-auto|auto] [--factory <name> [--for <duration> | --end]]',
  help: [
    "Nemia, the store's own agent: bare, where she is, each factory's level and",
    "how to reach her; a level sets the store's, which every factory follows",
    "unless it has its own; --factory sets that factory's, --for raises it for",
    'a stretch (90m, 2h, 1d; up to 7d) and --end ends the raise. semi-auto keeps',
    "her session: what waits on you (a gate, a step's question, a loop out of",
    'rounds, a cap) is asked of you, and a write that cannot be undone or',
    'changes your settings or a factory; the rest is hers. auto is semi-auto,',
    "but an answer your confirmed list allows in the run's state is given",
    'unasked (nemia policy <agent>), in a session of hers filed since auto came:',
    'one kept from before asks every answer until filed again (manual, then',
    'auto once it is off). A factory at manual is left alone, and her session',
    'stops once none is above manual',
  ],
  spec: {
    positionals: [{ key: 'level', takes: 'optional', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: `--factory takes the factory whose level is set: ${LEVEL_FORM}.` },
      { flag: '--for', kind: 'name', key: 'for', takes: `--for takes the stretch a raise lasts, like 2h: ${LEVEL_FORM}.` },
      { flag: '--end', kind: 'switch', key: 'end' },
    ],
    unknown: (arg) => `nemia level takes one level, not ${arg}: ${LEVEL_FORM}.`,
  },
  check: (args) => {
    const level = textIn(args, 'level');
    return (level === undefined ? null : levelWordRefusal(level)) ?? factoryArgsRefusal(args);
  },
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: [...LEVELS, '--factory', '--for', '--end'] },
  only: { side: 'cli', why: "the api serves it as the nemia group's `level` and `setLevel` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** The spec of a command of one name: `nemia chat <verb> <name>`. */
const nameSpec = (verb: string): Spec => ({
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [],
  unknown: (arg) => `nemia chat ${verb} takes one agent's name, and ${arg} is a second: nemia chat ${verb} <name>, once per name.`,
  missing: `nemia chat ${verb} takes the name the agent speaks under, such as operator: nemia chat ${verb} <name>.`,
});

/** `nemia chat speakers`: the names the person allowed an agent to speak under in her chat. */
export const CHAT_SPEAKERS_WORDS = {
  name: 'chat speakers',
  served: [{ endpoint: 'nemia.speakers' }],
  usage: '',
  help: ['the names an agent may speak under in her chat, each one you allowed'],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia chat speakers takes nothing, not ${arg}: nemia chat speakers.` },
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia chat allow <name>`: an agent may speak in her chat under `name`. Asked of the person every time. */
export const CHAT_ALLOW_WORDS = {
  name: 'chat allow',
  served: [{ endpoint: 'nemia.allowSpeaker' }],
  usage: '<name>',
  help: [
    "let an agent speak in her chat under a name, and to a step's session",
    '(nemia say --as <name>): its words reach her, the step and the board as',
    'its own, never as yours. Asked of you every time',
  ],
  spec: nameSpec('allow'),
  writes: true,
  class: 'ask',
  asksAlways: true,
} as const satisfies CommandWords;

/** `nemia chat disallow <name>`: no agent speaks in her chat under `name` any more. Asked of the person every time. */
export const CHAT_DISALLOW_WORDS = {
  name: 'chat disallow',
  served: [{ endpoint: 'nemia.disallowSpeaker' }],
  usage: '<name>',
  help: ['take a name back: words under it are refused. Asked of you every time'],
  spec: nameSpec('disallow'),
  writes: true,
  class: 'ask',
  asksAlways: true,
} as const satisfies CommandWords;

/** How `nemia subscribe` is typed, as its refusals end on it. */
export const SUBSCRIBE_FORM = 'nemia subscribe <name> <task> [-l <key>=<value>]... [--digest-every <minutes>] [--at-least <level>]';

/** The flags a feed's reader once took for a list of words, retired for `-l`. */
const RETIRED_WAKE = ['--wake', '--wake-word'];

/** Why `arg` is a flag `nemia subscribe` no longer takes, naming what to type now; undefined where it is none of them. */
const retiredWake = (arg: string): string | undefined => {
  const flag = arg.split('=')[0] ?? arg;
  if (!RETIRED_WAKE.includes(flag)) return undefined;
  return (
    `nemia subscribe no longer takes ${flag}: the feed's lines are no longer matched on their prose but chosen by the keys they name — ` +
    `type -l waits=person for the lines that wait on a person, or -l reason=<code> for one reason. ${SELECTOR_FLAG_FORM}`
  );
};

/** `nemia subscribe`: a long-lived task given a subscription to the feed. */
export const SUBSCRIBE_WORDS = {
  name: 'subscribe',
  served: [{ endpoint: 'subscriptions.subscribe' }],
  usage: '<name> <task> [-l <key>=<value>]... [--digest-every <minutes>] [--at-least <level>]',
  help: [
    "give the engine's long-lived task <task> a subscription to the feed,",
    'named <name>, from its end: a line one of its selectors takes is said to',
    'it at once, and the rest folded into a digest said with the next wake,',
    'or after --digest-every minutes (default 60) with none.',
    '-l: the lines it takes, given again for another (default:',
    'waits=person, the lines that wait on a person). Refused for a task not',
    'long-lived.',
    "--at-least: only the lines of runs whose factory's level is at least",
    `this (${LEVELS.join(', ')}), read as each line is delivered.`,
  ],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'task', takes: 'required', kind: 'name' },
    ],
    flags: [
      {
        flag: '-l',
        kind: 'text',
        key: 'selectors',
        many: true,
        takes: `nemia subscribe -l takes a label query of the feed's lines: ${SELECTOR_FLAG_FORM}`,
      },
      { flag: '--digest-every', kind: 'amount', key: 'digestEvery', takes: 'the minutes a digest waits for a wake', form: SUBSCRIBE_FORM },
      {
        flag: '--at-least',
        kind: 'name',
        key: 'atLeast',
        takes: `--at-least takes a level, one of ${LEVELS.join(', ')}: ${SUBSCRIBE_FORM}.`,
      },
    ],
    unknown: (arg) => retiredWake(arg) ?? `nemia subscribe does not take ${arg}: ${SUBSCRIBE_FORM}.`,
    missing: `nemia subscribe takes the subscription's name and the task it tells: ${SUBSCRIBE_FORM}.`,
  },
  writes: true,
  class: 'act',
} as const satisfies CommandWords;

/** `nemia unsubscribe <name>`: a subscription taken away. */
export const UNSUBSCRIBE_WORDS = {
  name: 'unsubscribe',
  served: [{ endpoint: 'subscriptions.unsubscribe' }],
  usage: '<name>',
  help: ['take the subscription <name> away: its task is told nothing more of the feed'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia unsubscribe takes no ${arg}: nemia unsubscribe <name>.`,
  },
  writes: true,
  class: 'act',
} as const satisfies CommandWords;

/** Nemia's and the subscriptions' words, in the order the help lists them. */
export const REST_NEMIA_WORDS = [
  SUBSCRIBE_WORDS,
  UNSUBSCRIBE_WORDS,
  LEVEL_WORDS,
  CHAT_SPEAKERS_WORDS,
  CHAT_ALLOW_WORDS,
  CHAT_DISALLOW_WORDS,
] as const satisfies readonly CommandWords[];
