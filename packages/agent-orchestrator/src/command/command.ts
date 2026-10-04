/**
 * A command of the orchestrator, said once as data: its name, the arguments it takes and how a command line spells them, the refusals of
 * its arguments in its own words, its help, its route on the api and the side it is served on alone. Pure: the table that holds every
 * command, with the handler each calls and what it prints, is `commands.verb.ts`; the CLI parses, refuses and helps from a spec here, and
 * the api derives its body from the same spec.
 */
import { dollarsOf } from '../keys/index.ts';
import { Invalid } from '../refusal/refusal.ts';

/** The CLI's name, as every command line the package writes says it. */
export const CLI = 'wf';

/**
 * What a command is handed: each argument by its key — text, dollars for an amount, true for a switch that has a key, every value in order
 * for a flag given once for each — and nothing for one not given.
 */
export type Args = Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>;

/** The arguments as the parser fills them. */
type Filling = Record<string, string | number | boolean | readonly string[] | undefined>;

/**
 * An argument given by its place. `required`: the command is given too little without it, and the CLI prints its help; `optional`: at
 * most one, after the required, never starting `--`; `rest`: every word after the required, joined by spaces, as one text.
 */
export type Positional = {
  readonly key: string;
  readonly takes: 'required' | 'optional' | 'rest';
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
};

/**
 * How a command line spells a command's arguments, and the refusals of a line that does not: an argument the command does not take
 * (`unknown`), two ways given (`oneWay`), and a text flag's value given apart that is one of the command's own flags, which reads as the
 * value left out (`apart`, handed the value and the flag it was given to) — `--flag=<value>` carries even that. `defaults` is what the
 * command line takes when no way is given; a body says its way. `missing` is the refusal of a required argument left out, empty or starting
 * `-`, said where the CLI would print its help.
 */
export type Spec = {
  readonly positionals: readonly Positional[];
  readonly flags: readonly Flag[];
  readonly defaults?: Readonly<Record<string, string>>;
  readonly unknown: (arg: string) => string;
  readonly oneWay?: string;
  readonly apart?: (value: string, flag: string) => string;
  readonly missing?: string;
};

/** The arguments a write's route fixes, as its path fixes the run: a body never carries them. */
type Fixed = Readonly<Record<string, string | boolean>>;

/**
 * Where the api serves a command: a write posted and accepted (202) or done (200), a write deleting what it names, done (200), or a read
 * got and answered. `sets`: the arguments a write's route fixes (`Fixed`), so the api serves the one way of the command it routes.
 */
export type Route =
  | { readonly method: 'POST'; readonly path: string; readonly status: 202 | 200; readonly sets?: Fixed }
  | { readonly method: 'DELETE'; readonly path: string; readonly status: 200; readonly sets?: Fixed }
  | { readonly method: 'GET'; readonly path: string; readonly status: 200 };

/**
 * A command, as data: its `name`, its `usage` after the name and its `help` lines, as `wf`'s help prints them; its `spec`; `check`, the
 * refusal of its arguments before anything is read, the same on both sides, or null; `writes`, a write the api guards; its `route` on the
 * api — a write is posted and accepted (202), a read is got (200) — or `only`, the side it is served on alone and why; and `apiTakes`, the
 * keys of a body the api folds into its arguments, which the command line has no flag for.
 */
export type CommandSpec = {
  readonly name: string;
  readonly usage: string;
  readonly help: readonly string[];
  readonly spec: Spec;
  readonly check?: (args: Args) => string | null;
  readonly writes: boolean;
  readonly route?: Route;
  readonly only?: { readonly side: 'cli' | 'api'; readonly why: string };
  readonly apiTakes?: readonly string[];
};

/** A refusal of what was typed, before anything is read: exit 2. */
const usage = (message: string): never => {
  throw new Invalid({ message });
};

/** A `--budget`'s value as dollars (`dollarsOf`), or refused, saying what it takes: an amount above zero, in digits. */
export function amountOf(text: string | undefined, takes: string, form: string): number {
  const amount = text === undefined ? undefined : dollarsOf(text);
  if (amount === undefined)
    usage(
      `--budget takes ${takes} — an amount above zero, in digits, like 5 or 2.50${text === undefined ? '' : `, and ${text} is not one`}: ${form}`,
    );
  return amount!;
}

/** The value of `flag`, given `value` — joined with `=` or the argument after it — or refused in the flag's words. */
function valueOf(spec: Spec, flag: Flag, value: string | undefined, joined: boolean): string | number {
  if (flag.kind === 'amount') return amountOf(value, flag.takes ?? '', flag.form ?? '');
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
 * Reads the argument at `i` of `argv` into `args`: a flag and its value, or the optional positional, else refused in the spec's words.
 * Returns the index of the last argument it took, and whether it was one of the command's ways.
 */
function readArg(spec: Spec, argv: readonly string[], i: number, args: Filling) {
  const arg = argv[i];
  const joined = arg.startsWith('--') && arg.includes('=');
  const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
  const flag = flagOf(spec, name, joined);
  if (!flag) {
    const optional = spec.positionals.find((p) => p.takes === 'optional');
    if (optional && !arg.startsWith('--') && args[optional.key] === undefined) args[optional.key] = arg;
    else usage(spec.unknown(arg));
    return { last: i, way: false };
  }
  if (once(flag) && args[flag.key!] !== undefined) usage(flag.twice ?? spec.unknown(arg));
  Object.assign(args, flag.sets);
  if (flag.key === undefined || flag.kind === 'switch') {
    if (flag.key !== undefined) args[flag.key] = true;
    return { last: i, way: flag.way === true };
  }
  const last = joined ? i : i + 1;
  put(args, flag, flag.key, valueOf(spec, flag, joined ? arg.slice(name.length + 1) : argv[last], joined));
  return { last, way: flag.way === true };
}

/** The arguments after the required ones: flags in any order, and the optional positional; two ways given are refused. */
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

/**
 * A command line's arguments after the command's name, read against `spec` — or undefined when it is given too little to act on: a
 * required argument missing, empty or starting `--`, for which the CLI prints its help, unless the spec says its refusal (`missing`), which
 * a required argument starting `-` gets too. Refused, exit 2, in the spec's own words: an argument it does not take, a value flag with no
 * value, given twice, or with one of the command's own flags for its value, and two ways.
 */
export function parseArgv(spec: Spec, argv: readonly string[]): Args | undefined {
  const required = spec.positionals.filter((p) => p.takes === 'required');
  const head = argv.slice(0, required.length);
  const left = (a: string) => !a || a.startsWith(spec.missing === undefined ? '--' : '-');
  if (head.length < required.length || head.some(left)) return spec.missing === undefined ? undefined : usage(spec.missing);
  const given = Object.fromEntries(required.map((p, i) => [p.key, head[i]]));
  const rest = spec.positionals.find((p) => p.takes === 'rest');
  if (rest) return { ...given, [rest.key]: argv.slice(required.length).join(' ') };
  return readTail(spec, argv.slice(required.length), given);
}

/**
 * The command line that names `command` on these arguments, as a refusal says what to type: `wf retry r-1 implement`. A positional not
 * given is said as the usage says it, `<step>`, or `[<step>]` where it is optional; a rest is left out.
 */
export function commandLine(command: Pick<CommandSpec, 'name' | 'spec'>, args: Args): string {
  const placed = command.spec.positionals
    .filter((p) => p.takes !== 'rest')
    .map((p) => (args[p.key] !== undefined ? String(args[p.key]) : p.takes === 'optional' ? `[<${p.key}>]` : `<${p.key}>`));
  return [CLI, command.name, ...placed].join(' ');
}

/** The column the help's lines under a command start at. */
const HELP_INDENT = ' '.repeat(31);

/** The commands' lines of `wf`'s help, in the table's order: each usage, then its help lines under it; none the CLI does not serve. */
export const helpOf = (table: readonly Pick<CommandSpec, 'name' | 'usage' | 'help' | 'only'>[]): string =>
  table
    .filter((c) => c.only?.side !== 'api')
    .flatMap((c) => [`  ${CLI} ${[c.name, c.usage].filter(Boolean).join(' ')}`, ...c.help.map((line) => `${HELP_INDENT}${line}`)])
    .join('\n');

/** An entry of a table as `commandBreaks` reads it: whether it has a handler, and its spec for what its route fixes. */
type Entry = Pick<CommandSpec, 'name' | 'route' | 'only'> & { readonly spec?: Spec; readonly handler?: unknown };

/**
 * Where one entry breaks the rules of how it runs: an entry with no handler that is not served on the CLI alone, which the api could not
 * run; one served on the CLI alone with neither a handler nor a runner of the CLI (`runners`); and a key its route fixes that no flag of
 * its spec fills, which the command would never read.
 */
function runBreaks(c: Entry, runners: readonly string[]): string[] {
  const breaks: string[] = [];
  const cliOnly = c.only?.side === 'cli';
  if (c.handler === undefined && !cliOnly)
    breaks.push(`${c.name} has no handler and is served on the api: give it a handler, or serve it on the CLI alone and run it there`);
  if (c.handler === undefined && cliOnly && !runners.includes(c.name))
    breaks.push(`${c.name} has no handler and no runner: give it a handler, or a runner in the CLI's RUNS`);
  const filled = (key: string) => c.spec?.flags.some((f) => f.key === key || (f.sets !== undefined && key in f.sets)) === true;
  const fixed = c.route && 'sets' in c.route && c.route.sets ? Object.keys(c.route.sets) : [];
  for (const key of fixed.filter((k) => !filled(k)))
    breaks.push(`${c.name}'s route sets ${key}, which no flag of its spec fills: name a key the command reads`);
  return breaks;
}

/**
 * Where a table of commands breaks its rules, a sentence each: a name defined twice; two entries routed on one method and path, of which
 * the api would serve the first alone; an entry served nowhere — neither routed on the api nor said to be served on one side alone
 * (`only`) — so a gap between the CLI and the api is never left unsaid; a name that is both a command the CLI serves and one of the CLI's
 * own verbs (`verbs`), which the CLI would run twice over — an entry served on the api alone shares a verb's name freely; how an entry runs
 * (`runBreaks`); and a runner of the CLI (`runners`) that runs no entry the CLI serves.
 */
export function commandBreaks(table: readonly Entry[], verbs: readonly string[], runners: readonly string[] = []): string[] {
  const breaks: string[] = [];
  const seen = new Set<string>();
  const routed = new Map<string, string>();
  for (const c of table) {
    if (seen.has(c.name)) breaks.push(`${c.name} is defined twice: a command is one entry of the table`);
    seen.add(c.name);
    const at = c.route && `${c.route.method} ${c.route.path}`;
    const first = at && routed.get(at);
    if (first) breaks.push(`${c.name} is routed on ${at}, as ${first} is: give it a path of its own`);
    else if (at) routed.set(at, c.name);
    if (!c.route && !c.only)
      breaks.push(`${c.name} has no route and no only: give it its route on the api, or say which side alone serves it, and why`);
    if (c.only?.side !== 'api' && verbs.includes(c.name))
      breaks.push(`${c.name} is a command of the table and a verb of the CLI: take it out of VERBS`);
    breaks.push(...runBreaks(c, runners));
  }
  for (const name of runners.filter((r) => !table.some((c) => c.name === r && c.only?.side !== 'api')))
    breaks.push(`${name} has a runner and no entry the CLI serves: give it its entry in the table, or take it out of RUNS`);
  return breaks;
}
