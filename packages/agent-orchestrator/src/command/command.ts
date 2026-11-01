/**
 * A command of the orchestrator, said once as data: its name, the arguments it takes and how a command line spells them, the refusals of
 * its arguments in its own words, its help, its route on the api and the side it is served on alone. Pure: the table that holds every
 * command, with the handler each calls and what it prints, is `commands.verb.ts`; the CLI parses, refuses and helps from a spec here, and
 * the api derives its body from the same spec.
 */
import { dollarsOf } from '../keys/index.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { CommandClass } from '../admission/index.ts';
import { FORMER_MODES } from '../retry/index.ts';

/** The CLI's name, as every command line the package writes says it. */
export const CLI = 'nemia';

/** What a former name became (`RENAMED`): the name it is now, and the flag that says an absorbed verb, where it says one. */
export type Renamed = { readonly to: string; readonly flag?: string };

/**
 * Each command renamed, by its former name of one word or two: `nemia auto …` is `nemia policy …`, and a verb another absorbed is that verb
 * with the flag that says it — `nemia round` is `nemia retry --round`, `nemia merge` is `nemia refresh --base`, `nemia accept` is `nemia
 * approve` (decision 7). Decision 8 gives a list, a read of one thing and a removal one spelling each, the rows of two words below: a
 * removal is `rm`, a one-off of an agent `agents run` (kubectl's run), a template's judgement `template lint` (so a check stays a step's),
 * an upgrade's preview `factory diff`, and a folder of cards `start <folder>`. A command line that opens with a former name
 * is still run, as the name it became, and admission reads it as that name too, so the old spelling reaches no rule the new one would not;
 * and no entry of the table is named by a former name (`commandBreaks`), which no line would ever reach.
 */
export const RENAMED: ReadonlyMap<string, Renamed> = new Map([
  ['auto', { to: 'policy' }],
  ['round', { to: 'retry', flag: '--round' }],
  ['merge', { to: 'refresh', flag: '--base' }],
  ['accept', { to: 'approve' }],
  ['plan', { to: 'start' }],
  ['agents remove', { to: 'agents rm' }],
  ['agents try', { to: 'agents run' }],
  ['workflows remove', { to: 'workflows rm' }],
  ['policy drop', { to: 'policy rm' }],
  ['template check', { to: 'template lint' }],
  ['factory plan', { to: 'factory diff' }],
]);

/** Each flag renamed, by the command that takes it and its former spelling: `nemia retry --nudge` is `nemia retry --continue`. */
export const RENAMED_FLAGS: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map([['retry', new Map([['--nudge', '--continue']])]]);

/**
 * Each value renamed, by the command that takes it, the key that carries it and its former spelling: a retry's mode `nudge` is
 * `continue` (`FORMER_MODES`), as its flag `--nudge` is `--continue`. A body the api is sent that says a former value is read as the
 * value it became (`renamedValues`).
 */
export const RENAMED_VALUES: ReadonlyMap<string, ReadonlyMap<string, Readonly<Record<string, string>>>> = new Map([
  ['retry', new Map([['mode', FORMER_MODES]])],
]);

/**
 * `body`, a request's body for `command`, each key's former value (`RENAMED_VALUES`) put to the value it became; with the hint naming what
 * to send now, or `body` as given and no hint. What is not an object is handed back as it is, for the body's schema to refuse.
 */
export function renamedValues(command: string, body: unknown): { body: unknown; hint?: string } {
  const keys = RENAMED_VALUES.get(command);
  if (keys === undefined || typeof body !== 'object' || body === null || Array.isArray(body)) return { body };
  const renamed = [...keys].flatMap(([key, values]) => {
    const was: unknown = Reflect.get(body, key);
    if (typeof was !== 'string' || !Object.hasOwn(values, was)) return [];
    const is = values[was];
    return is === undefined ? [] : [{ key, was, is }];
  });
  if (!renamed.length) return { body };
  const said = (value: (p: { key: string; was: string; is: string }) => string) =>
    renamed.map((p) => `"${p.key}": "${value(p)}"`).join(' and ');
  return {
    body: { ...body, ...Object.fromEntries(renamed.map((p) => [p.key, p.is])) },
    hint: `${said((p) => p.was)} ${renamed.length > 1 ? 'are' : 'is'} now ${said((p) => p.is)}: send that; the former spelling stays accepted until a later release removes it.`,
  };
}

/** `rest`, the words after a command's name, with `flag` before the first flag among them, or after them where none is. */
const withFlag = (rest: readonly string[], flag: string | undefined): string[] => {
  if (flag === undefined) return [...rest];
  const at = rest.findIndex((w) => w.startsWith('-'));
  return at === -1 ? [...rest, flag] : [...rest.slice(0, at), flag, ...rest.slice(at)];
};

/** The former name `words` open with, the longest first, and how many words it is; none where they open with no former name. */
function formerAt(words: readonly string[], used: ReadonlySet<string>): { key: string; size: number; now: Renamed } | undefined {
  for (const size of [2, 1]) {
    const key = words.slice(0, size).join(' ');
    const now = RENAMED.get(key);
    if (words.length >= size && !used.has(key) && now) return { key, size, now };
  }
  return undefined;
}

/**
 * `words`, a command line's words after the program, its name put to the name it became where it opens with a former one (`RENAMED`, the
 * longest that matches, then again on what it became, each former name once, so `auto drop` is put to `policy …` and then to `policy rm`),
 * the flag that says an absorbed verb added before its other flags, and each former flag of the command put to its new spelling
 * (`RENAMED_FLAGS`); with the hint naming what was typed and what to type now, or `words` as given and no hint.
 */
export function renamedIn(words: readonly string[]): { words: string[]; hint?: string } {
  let named = [...words];
  let name = 0;
  let typed = 0;
  const added: string[] = [];
  const used = new Set<string>();
  for (let at = formerAt(named, used); at !== undefined; at = formerAt(named, used)) {
    const now = at.now;
    used.add(at.key);
    typed += Math.max(0, at.size - name);
    const to = now.to.split(' ');
    named = [...to, ...withFlag(named.slice(at.size), now.flag)];
    name = to.length;
    if (now.flag !== undefined) added.push(now.flag);
  }
  const flags = RENAMED_FLAGS.get(named.slice(0, name || 1).join(' '));
  const former = flags === undefined ? [] : named.slice(name || 1).filter((w) => flags.has(w));
  if (!used.size && !former.length) return { words: [...words] };
  const rewritten = flags === undefined ? named : [...named.slice(0, name || 1), ...named.slice(name || 1).map((w) => flags.get(w) ?? w)];
  const was = [...(used.size ? [[CLI, ...words.slice(0, typed)].join(' ')] : []), ...former];
  const is = [...(used.size ? [[CLI, ...named.slice(0, name), ...added].join(' ')] : []), ...former.flatMap((f) => flags?.get(f) ?? [])];
  return {
    words: rewritten,
    hint: `${was.join(' and ')} ${was.length > 1 ? 'are' : 'is'} now ${is.join(' and ')}: type \`${[CLI, ...rewritten].join(' ')}\`; the former spelling stays accepted until a later release removes it.`,
  };
}

/**
 * What a command is handed: each argument by its key — text, dollars for an amount, true for a switch that has a key, every value in order
 * for a flag given once for each — and nothing for one not given.
 */
export type Args = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

/** The arguments as the parser fills them. */
type Filling = Record<string, string | number | boolean | readonly string[] | undefined>;

/**
 * An argument given by its place. `required`: the command is given too little without it, and the CLI prints its help; `optional`: at
 * most one, after the required, never starting `--`; `rest`: every word after the required, joined by spaces, as one text; `many`: every
 * word after the required that starts with no `-`, among the flags, each once, in the order given — on the api, its path's one text, or a
 * body's list.
 */
export type Positional = {
  readonly key: string;
  readonly takes: 'required' | 'optional' | 'rest' | 'many';
  /** `name`: something but spaces, as a run's id or a step's name; `text`: anything, empty included. */
  readonly kind: 'name' | 'text';
};

/**
 * A flag a command takes. `switch` carries no value, and sets its key, where it has one, to true, given once or more; `name` a value given
 * apart, never empty and never starting `--`; `text` any value, apart or as `--flag=<value>`; `amount` dollars above zero, apart or joined
 * (`dollarsOf`).
 */
export type Flag = {
  readonly flag: string;
  readonly kind: 'switch' | 'name' | 'text' | 'amount';
  /** The argument its value goes under; a switch's, where it has one, is true once given. */
  readonly key?: string;
  /** What it sets beside its value: `--fresh` sets `mode: 'fresh'`. */
  readonly sets?: Readonly<Record<string, string>>;
  /** One of the command's ways: at most one is given (`Spec.oneWay`), and a way given twice counts as two, never as its `twice`. */
  readonly way?: boolean;
  /** What a value flag takes, as its refusal of none says it: for an amount, what the dollars are of. */
  readonly takes?: string;
  /** For an amount, the command line its refusal shows. */
  readonly form?: string;
  /** The refusal of a value flag given twice. */
  readonly twice?: string;
  /** A text flag given once for each value, its values collected in the order given, never refused as given twice. */
  readonly many?: boolean;
  /**
   * The side that takes it alone, and why: one the CLI alone takes is no key of a body; one the api alone takes is no flag of a command
   * line, which refuses it as one it does not take, and a key of a body — required there where it says so.
   */
  readonly only?: { readonly side: 'cli' | 'api'; readonly why: string; readonly required?: true };
};

/**
 * How a command line spells a command's arguments, and the refusals of a line that does not: an argument the command does not take
 * (`unknown`), two ways given (`oneWay`), and a text flag's value given apart that is one of the command's own flags, which reads as the
 * value left out (`apart`, handed the value and the flag it was given to) — `--flag=<value>` carries even that. `defaults` is what the
 * command line takes when no way is given; a body says its way. `missing` is the refusal of a required argument left out, empty or starting
 * `-`, said where the CLI would print its help; `flagFirst`, that a flag the command does not take is refused as one even where a required
 * argument stands, before `missing`.
 */
export type Spec = {
  readonly positionals: readonly Positional[];
  readonly flags: readonly Flag[];
  readonly defaults?: Readonly<Record<string, string>>;
  readonly unknown: (arg: string) => string;
  readonly oneWay?: string;
  readonly apart?: (value: string, flag: string) => string;
  readonly missing?: string;
  readonly flagFirst?: true;
};

/** The arguments a write's route fixes, as its path fixes the run: a body never carries them. */
type Fixed = Readonly<Record<string, string | boolean>>;

/**
 * Where the api serves a command: a write posted and accepted (202), done (200) or made (201), a write putting what it names in place,
 * done (200), a write deleting what it names, done (200), or a read got and answered. `sets`: the arguments a write's route fixes
 * (`Fixed`), so the api serves the one way of the command it routes. `hand`: why the api serves the route by a hand of its own, which
 * calls the command's handler, in place of the route the table would generate.
 */
export type Route =
  | { readonly method: 'POST'; readonly path: string; readonly status: 202 | 200 | 201; readonly sets?: Fixed; readonly hand?: string }
  | { readonly method: 'PUT'; readonly path: string; readonly status: 200; readonly sets?: Fixed; readonly hand?: string }
  | { readonly method: 'DELETE'; readonly path: string; readonly status: 200; readonly sets?: Fixed; readonly hand?: string }
  | { readonly method: 'GET'; readonly path: string; readonly status: 200; readonly hand?: string };

/**
 * A command, as data: its `name`, its `usage` after the name and its `help` lines, as `nemia`'s help prints them; its `spec`; `check`, the
 * refusal of its arguments before anything is read, the same on both sides, or null; `writes`, a write the api guards; `class`, who
 * answers for it when an agent calls it (`CommandClass`); its `route` on the
 * api — a write is posted and accepted (202), a read is got (200), and one command may be served on more than one — or `only`, the side
 * it is served on alone and why; and `apiTakes`, the keys of a body the api folds into its arguments, which the command line has no flag
 * for; `manual`, the long help `nemia <name> --help` prints in place of running it, where it has one; `ticks`, that what it files waits on
 * the daemon's next pass, so the command line starts the daemon where none ticks the store (`ensureDaemon`); `asksAlways`, that an agent's
 * call of it is asked of the person every time, whatever its session was allowed at a prompt or by a rule (`admissionOf`), on a command
 * classed `ask` alone (`classBreaks`).
 */
export type CommandSpec = {
  readonly name: string;
  readonly usage: string;
  readonly help: readonly string[];
  readonly spec: Spec;
  readonly check?: (args: Args) => string | null;
  readonly writes: boolean;
  readonly class: CommandClass;
  readonly route?: Route | readonly Route[];
  readonly only?: { readonly side: 'cli' | 'api'; readonly why: string };
  readonly apiTakes?: readonly string[];
  readonly manual?: string;
  readonly ticks?: true;
  readonly asksAlways?: true;
};

/** Every route the api serves a command on: none, its one, or each of its many. */
export const routeList = (command: Pick<CommandSpec, 'route'>): readonly Route[] =>
  command.route === undefined ? [] : Array.isArray(command.route) ? command.route : [command.route as Route];

/** A route the table generates on the api: a write the api serves by no hand of its own. */
export const generated = (route: Route): boolean => route.method !== 'GET' && route.hand === undefined;

/** The dollars under `key`, or undefined where none were given. */
export const amountIn = (args: Args, key: string): number | undefined => {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
};

/**
 * The refusal of a text flag's value left out on the command line — empty, or starting `--`, which reads as the value left out — in the
 * flag's own `takes`, or null. A flag the api alone takes is not looked at: its value is whatever a body sends.
 */
export function leftOut(spec: Spec, args: Args): string | null {
  for (const flag of spec.flags.filter((f) => f.kind === 'text' && f.key !== undefined && f.only?.side !== 'api')) {
    if (flag.key === undefined) continue;
    const value = args[flag.key];
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    if (values.some((v) => !v || v.startsWith('--'))) return flag.takes ?? null;
  }
  return null;
}

/** A refusal of what was typed, before anything is read: exit 2. */
const usage = (message: string): never => {
  throw new Invalid({ message });
};

/** An amount flag's value as a number (`dollarsOf`), or refused in `flag`'s words, saying what it takes: above zero, in digits. */
export function amountOf(text: string | undefined, takes: string, form: string, flag = '--budget'): number {
  const amount = text === undefined ? undefined : dollarsOf(text);
  if (amount === undefined)
    return usage(
      `${flag} takes ${takes} — an amount above zero, in digits, like 5 or 2.50${text === undefined ? '' : `, and ${text} is not one`}: ${form}`,
    );
  return amount;
}

/** The value of `flag`, given `value` — joined with `=` or the argument after it — or refused in the flag's words. */
function valueOf(spec: Spec, flag: Flag, value: string | undefined, joined: boolean): string | number {
  if (flag.kind === 'amount') return amountOf(value, flag.takes ?? '', flag.form ?? '', flag.flag);
  if (value === undefined || (flag.kind === 'name' && (!value || value.startsWith('--')))) return usage(flag.takes ?? '');
  if (!joined && spec.apart && spec.flags.some((f) => f.flag === value)) usage(spec.apart(value, flag.flag));
  return value;
}

/** The flag `name` is, given joined with `=` or not: a switch and a name are given apart, so `--model=x` is no flag. */
const flagOf = (spec: Spec, name: string, joined: boolean): Flag | undefined =>
  spec.flags.find((f) => f.flag === name && !(joined && (f.kind === 'switch' || f.kind === 'name')));

/** Whether `flag`, given again, is refused as given twice: a value flag that is no way and takes one value. */
const once = (flag: Flag): boolean => flag.kind !== 'switch' && !flag.way && !flag.many && flag.key !== undefined;

/** `value` put under `flag`'s key: beside the values given before it, for a flag given once for each. */
function put(args: Filling, flag: Flag, key: string, value: string | number): void {
  const before = args[key];
  args[key] = flag.many ? [...(Array.isArray(before) ? before : []), String(value)] : value;
}

/**
 * `arg`, a word that is no flag, put under the positional that takes it: a many positional's, beside the values before it unless it is one
 * of them, where it starts with no `-`; else the optional one's, once, where it starts with no `--`. Returns whether one took it.
 */
function placed(spec: Spec, arg: string, args: Filling): boolean {
  const many = spec.positionals.find((p) => p.takes === 'many');
  if (many && !arg.startsWith('-')) {
    const before = args[many.key];
    const values = Array.isArray(before) ? before : [];
    args[many.key] = values.includes(arg) ? values : [...values, arg];
    return true;
  }
  const optional = spec.positionals.find((p) => p.takes === 'optional');
  if (!optional || arg.startsWith('--') || args[optional.key] !== undefined) return false;
  args[optional.key] = arg;
  return true;
}

/**
 * Reads the argument at `i` of `argv` into `args`: a flag and its value, or a positional (`placed`), else refused in the spec's words.
 * Returns the index of the last argument it took, and whether it was one of the command's ways.
 */
function readArg(spec: Spec, argv: readonly string[], i: number, args: Filling) {
  const arg = argv[i];
  if (arg === undefined) return { last: i, way: false };
  const joined = arg.startsWith('--') && arg.includes('=');
  const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
  const flag = flagOf(spec, name, joined);
  if (!flag) {
    if (!placed(spec, arg, args)) usage(spec.unknown(arg));
    return { last: i, way: false };
  }
  if (once(flag) && flag.key !== undefined && args[flag.key] !== undefined) usage(flag.twice ?? spec.unknown(arg));
  Object.assign(args, flag.sets);
  if (flag.key === undefined || flag.kind === 'switch') {
    if (flag.key !== undefined) args[flag.key] = true;
    return { last: i, way: flag.way === true };
  }
  const last = joined ? i : i + 1;
  put(args, flag, flag.key, valueOf(spec, flag, joined ? arg.slice(name.length + 1) : argv[last], joined));
  return { last, way: flag.way === true };
}

/** The arguments after the required ones: flags in any order, and the optional or many positional; two ways given are refused. */
function readTail(spec: Spec, argv: readonly string[], given: Filling): Args {
  const args = { ...given };
  let ways = 0;
  for (let i = 0; i < argv.length; i++) {
    const read = readArg(spec, argv, i, args);
    if (read.way) ways++;
    i = read.last;
  }
  if (ways > 1) usage(spec.oneWay ?? spec.unknown(argv.join(' ')));
  return { ...spec.defaults, ...args };
}

/** A word given where a required argument stands that is a flag no command takes: neither one of `spec`'s, nor `--help`. */
const strayFlag = (spec: Spec, arg: string): boolean =>
  arg.startsWith('--') && arg !== '--help' && !spec.flags.some((f) => f.flag === arg.split('=')[0]);

/**
 * Whether `arg`, where the required positional `p` stands, leaves it out: a flag — any word starting `-` where the spec says its own
 * refusal (`missing`) — or empty, but for a text whose spec says its refusal, which its handler is given to refuse in its own words.
 */
const unfilled = (spec: Spec, p: Positional, arg: string): boolean =>
  arg.startsWith(spec.missing === undefined ? '--' : '-') || (!arg && (spec.missing === undefined || p.kind !== 'text'));

/** Whether the argument typed for the required positional `p` leaves it unfilled (`unfilled`): never where no positional is there. */
const unfilledBy = (spec: Spec, p: Positional | undefined, arg: string): boolean => p !== undefined && unfilled(spec, p, arg);

/**
 * A command line's arguments after the command's name, read against `spec` — or undefined when it is given too little to act on: a
 * required argument missing, empty, `--help` or one of its own flags, for which the CLI prints its help, unless the spec says its refusal
 * (`missing`), which a required argument starting `-` gets too, but for a flag it does not take where it says `flagFirst`. Refused, exit 2,
 * in the spec's own words: an argument it does not take — a flag it has none of among them, wherever it stands, and one the api alone
 * takes (`Flag.only`) — a value flag with no value, given twice, or with one of the command's own flags for its value, and two ways.
 */
export function parseArgv(typed: Spec, argv: readonly string[]): Args | undefined {
  const spec: Spec = { ...typed, flags: typed.flags.filter((f) => f.only?.side !== 'api') };
  const required = spec.positionals.filter((p) => p.takes === 'required');
  const head = argv.slice(0, required.length);
  const stray = spec.missing === undefined || spec.flagFirst ? head.find((a) => strayFlag(spec, a)) : undefined;
  if (stray !== undefined) return usage(spec.unknown(stray));
  if (head.length < required.length || head.some((a, i) => unfilledBy(spec, required[i], a))) {
    return spec.missing === undefined ? undefined : usage(spec.missing);
  }
  const given = Object.fromEntries(required.map((p, i) => [p.key, head[i]]));
  const rest = spec.positionals.find((p) => p.takes === 'rest');
  if (rest) return { ...given, [rest.key]: argv.slice(required.length).join(' ') };
  return readTail(spec, argv.slice(required.length), given);
}

/** How the usage says a positional not given: `<step>`, `[<step>]` where it is optional, `[<runId> ...]` where it takes many. */
const unsaid = (p: Positional): string =>
  p.takes === 'many' ? `[<${p.key}> ...]` : p.takes === 'optional' ? `[<${p.key}>]` : `<${p.key}>`;

/** The words that say `flag` given `value`: a switch alone where true, a value flag once per value; none for a value not given. */
const flagWords = (flag: Flag, value: Args[string]): string[] => {
  if (value === undefined || value === false) return [];
  if (flag.kind === 'switch') return [flag.flag];
  return (Array.isArray(value) ? value : [value]).flatMap((v) => [flag.flag, String(v)]);
};

/**
 * The command line that names `command` on these arguments, as a refusal says what to type: `nemia retry r-1 implement`, `nemia rm a b`. A
 * positional not given is said as the usage says it (`unsaid`); a rest is left out. `flags`, by their keys, are said after the positionals
 * in the order the spec lists them: `nemia factory add <name> --repo <path>`; a key no flag of the spec has is left out.
 */
export function commandLine(command: Pick<CommandSpec, 'name' | 'spec'>, args: Args, flags: Args = {}): string {
  const said = (value: Args[string]) => (Array.isArray(value) ? value.join(' ') : String(value));
  const words = command.spec.positionals
    .filter((p) => p.takes !== 'rest')
    .map((p) => (args[p.key] !== undefined ? said(args[p.key]) : unsaid(p)));
  const flagged = command.spec.flags.flatMap((f) => (f.key === undefined ? [] : flagWords(f, flags[f.key])));
  return [CLI, command.name, ...words, ...flagged].join(' ');
}

/**
 * The verbs the CLI runs by a hand of its own, outside the table (`VERBS` in `cli/main.ts`), each with its usage and help as `nemia`'s
 * help prints them; who answers for one is its table entry's of the same name, served on the api alone.
 */
export const CLI_VERBS: readonly Pick<CommandSpec, 'name' | 'usage' | 'help'>[] = [
  {
    name: 'decide',
    usage: '<runId> [--sensitive <globs>]',
    help: ['what the run produced, and the choice it leaves you (nemia decide --help)'],
  },
];

/** The column the help's lines under a command start at. */
const HELP_INDENT = ' '.repeat(31);

/** The commands' lines of `nemia`'s help, in the table's order: each usage, then its help lines under it; none the CLI does not serve. */
export const helpOf = (table: readonly Pick<CommandSpec, 'name' | 'usage' | 'help' | 'only'>[]): string =>
  table
    .filter((c) => c.only?.side !== 'api')
    .flatMap((c) => [`  ${CLI} ${[c.name, c.usage].filter(Boolean).join(' ')}`, ...c.help.map((line) => `${HELP_INDENT}${line}`)])
    .join('\n');

/** An entry of a table as `commandBreaks` reads it: whether it has a handler, and its spec for what its route fixes. */
type Entry = Pick<CommandSpec, 'name' | 'route' | 'only' | 'ticks'> & {
  readonly spec?: Spec;
  readonly handler?: unknown;
  readonly writes?: boolean;
};

/**
 * Where one entry breaks the rules of how it runs: an entry with no handler that is not served on the CLI alone, which the api could not
 * run; one served on the CLI alone with neither a handler nor a runner of the CLI (`runners`); a key its route fixes that no flag of
 * its spec fills, which the command would never read; and one that ticks and writes nothing, whose next pass would have nothing to do.
 */
function runBreaks(c: Entry, runners: readonly string[]): string[] {
  const breaks: string[] = [];
  if (c.ticks === true && c.writes !== true)
    breaks.push(
      `${c.name} ticks and writes nothing: a command whose work waits on the next pass files it, so give it writes: true, or take ticks out`,
    );
  const cliOnly = c.only?.side === 'cli';
  if (c.handler === undefined && !cliOnly)
    breaks.push(`${c.name} has no handler and is served on the api: give it a handler, or serve it on the CLI alone and run it there`);
  if (c.handler === undefined && cliOnly && !runners.includes(c.name))
    breaks.push(`${c.name} has no handler and no runner: give it a handler, or a runner in the CLI's RUNS`);
  const filled = (key: string) => c.spec?.flags.some((f) => f.key === key || (f.sets !== undefined && key in f.sets)) === true;
  const fixed = routeList(c).flatMap((r) => ('sets' in r && r.sets ? Object.keys(r.sets) : []));
  for (const key of [...new Set(fixed)].filter((k) => !filled(k)))
    breaks.push(`${c.name}'s route sets ${key}, which no flag of its spec fills: name a key the command reads`);
  return breaks;
}

/**
 * Where an entry's words for its sides break the rules: a name in a route's path that no argument of its spec takes, which the command
 * would never read; a why left empty, of a route served by hand, of the side that serves it alone, or of a flag one side alone takes; and a
 * flag the api alone takes on an entry with no route that hands it — one the table generates, or one served by hand — which nothing would
 * ever hand it.
 */
function sideBreaks(c: Entry): string[] {
  const breaks: string[] = [];
  const takes = (key: string) =>
    c.spec?.positionals.some((p) => p.key === key) === true || c.spec?.flags.some((f) => f.key === key) === true;
  for (const r of routeList(c)) {
    for (const key of [...r.path.matchAll(/:(\w+)/g)].flatMap(([, k]) => (k === undefined ? [] : [k])).filter((k) => !takes(k)))
      breaks.push(`${c.name}'s route ${r.method} ${r.path} names :${key}, which no argument of its spec takes: key a positional ${key}`);
    if (r.hand !== undefined && !r.hand.trim())
      breaks.push(`${c.name}'s route ${r.method} ${r.path} is served by hand and says no why: say why the table does not generate it`);
  }
  if (c.only !== undefined && !c.only.why.trim()) breaks.push(`${c.name} is served on the ${c.only.side} alone and says no why: say why`);
  for (const f of c.spec?.flags ?? []) {
    if (f.only !== undefined && !f.only.why.trim())
      breaks.push(`${c.name}'s ${f.flag} is taken on the ${f.only.side} alone and says no why: say why`);
    if (f.only?.side === 'api' && !routeList(c).some((r) => generated(r) || r.hand !== undefined))
      breaks.push(`${c.name}'s ${f.flag} is taken on the api alone, and no route of the entry hands it: route it, or take the flag out`);
  }
  return breaks;
}

/** Each route of `c` on a method and path an entry before it is routed on (`routed`, which takes the rest of them). */
function routedTwice(c: Entry, routed: Map<string, string>): string[] {
  const breaks: string[] = [];
  for (const at of routeList(c).map((r) => `${r.method} ${r.path}`)) {
    const first = routed.get(at);
    if (first) breaks.push(`${c.name} is routed on ${at}, as ${first} is: give it a path of its own`);
    else routed.set(at, c.name);
  }
  return breaks;
}

/**
 * Where a table of commands breaks its rules, a sentence each: a name defined twice; two entries routed on one method and path, of which
 * the api would serve the first alone; an entry served nowhere — neither routed on the api nor said to be served on one side alone (`only`)
 * — so a gap between the CLI and the api is never left unsaid; a name that is a former one (`RENAMED`), which no line reaches; a name that
 * is both a command the CLI serves and one of the CLI's own verbs (`verbs`), which the CLI would run twice over — an entry served on the
 * api alone shares a verb's name freely; how an entry runs (`runBreaks`); its words for its sides (`sideBreaks`); and a runner of the CLI
 * (`runners`) that runs no entry the CLI serves.
 */
export function commandBreaks(table: readonly Entry[], verbs: readonly string[], runners: readonly string[] = []): string[] {
  const breaks: string[] = [];
  const seen = new Set<string>();
  const routed = new Map<string, string>();
  for (const c of table) {
    if (seen.has(c.name)) breaks.push(`${c.name} is defined twice: a command is one entry of the table`);
    seen.add(c.name);
    breaks.push(...routedTwice(c, routed));
    if (!routeList(c).length && !c.only)
      breaks.push(`${c.name} has no route and no only: give it its route on the api, or say which side alone serves it, and why`);
    const renamed = RENAMED.get(c.name);
    if (renamed) breaks.push(`${c.name} is a former name in RENAMED, which runs a line that says it as ${renamed.to}: name the entry anew`);
    if (c.only?.side !== 'api' && verbs.includes(c.name))
      breaks.push(`${c.name} is a command of the table and a verb of the CLI: take it out of VERBS`);
    breaks.push(...runBreaks(c, runners), ...sideBreaks(c));
  }
  for (const name of runners.filter((r) => !table.some((c) => c.name === r && c.only?.side !== 'api')))
    breaks.push(`${name} has a runner and no entry the CLI serves: give it its entry in the table, or take it out of RUNS`);
  return breaks;
}
