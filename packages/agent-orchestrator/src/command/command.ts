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

/** What a command is handed: each argument by its key — text, or dollars for an amount — and nothing for one not given. */
export type Args = Readonly<Record<string, string | number | undefined>>;

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
 * A flag a command takes. `switch` carries no value; `name` a value given apart, never empty and never starting `--`; `text` any value,
 * apart or as `--flag=<value>`; `amount` dollars above zero, apart or joined (`dollarsOf`).
 */
export type Flag = {
  readonly flag: string;
  readonly kind: 'switch' | 'name' | 'text' | 'amount';
  /** The argument its value goes under; a switch has none. */
  readonly key?: string;
  /** What it sets beside its value: `--fresh` sets `mode: 'fresh'`. */
  readonly sets?: Readonly<Record<string, string>>;
  /** One of the command's ways: at most one is given (`Spec.oneWay`), and a way is never refused as given twice. */
  readonly way?: boolean;
  /** What a value flag takes, as its refusal of none says it: for an amount, what the dollars are of. */
  readonly takes?: string;
  /** For an amount, the command line its refusal shows. */
  readonly form?: string;
  /** The refusal of a value flag given twice. */
  readonly twice?: string;
};

/**
 * How a command line spells a command's arguments, and the refusals of a line that does not: an argument the command does not take
 * (`unknown`), two ways given (`oneWay`), and a text flag's value given apart that is one of the command's own flags, which reads as the
 * value left out (`apart`) — `--flag=<value>` carries even that. `defaults` is what the command line takes when no way is given; a body
 * says its way.
 */
export type Spec = {
  readonly positionals: readonly Positional[];
  readonly flags: readonly Flag[];
  readonly defaults?: Readonly<Record<string, string>>;
  readonly unknown: (arg: string) => string;
  readonly oneWay?: string;
  readonly apart?: (flag: string) => string;
};

/** One of the orchestrator's refusals by its kind (`refusal/refusal.ts`). */
export type RefusalKind = 'Missing' | 'Conflict' | 'Invalid';

/**
 * A command, as data: its `name`, its `usage` after the name and its `help` lines, as `wf`'s help prints them; its `spec`; `check`, the
 * refusal of its arguments before anything is read, the same on both sides, or null; `writes`, a write the api guards; `refuses`, the
 * kinds its verb refuses with; its `route` on the api, or `only`, the side it is served on alone and why; and `apiTakes`, the keys of a
 * body the api folds into its arguments, which the command line has no flag for.
 */
export type CommandSpec = {
  readonly name: string;
  readonly usage: string;
  readonly help: readonly string[];
  readonly spec: Spec;
  readonly check?: (args: Args) => string | null;
  readonly writes: boolean;
  readonly refuses: readonly RefusalKind[];
  readonly route?: { readonly method: 'POST'; readonly path: string; readonly status: 202 };
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
  if (!joined && spec.apart && spec.flags.some((f) => f.flag === value)) usage(spec.apart(value));
  return value;
}

/** The flag `name` is, given joined with `=` or not: a switch and a name are given apart, so `--model=x` is no flag. */
const flagOf = (spec: Spec, name: string, joined: boolean): Flag | undefined =>
  spec.flags.find((f) => f.flag === name && !(joined && (f.kind === 'switch' || f.kind === 'name')));

/**
 * Reads the argument at `i` of `argv` into `args`: a flag and its value, or the optional positional, else refused in the spec's words.
 * Returns the index of the last argument it took, and whether it was one of the command's ways.
 */
function readArg(spec: Spec, argv: readonly string[], i: number, args: Record<string, string | number | undefined>) {
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
  if (!flag.way && flag.key !== undefined && args[flag.key] !== undefined) usage(flag.twice ?? spec.unknown(arg));
  Object.assign(args, flag.sets);
  const last = flag.key === undefined || joined ? i : i + 1;
  if (flag.key !== undefined) args[flag.key] = valueOf(spec, flag, joined ? arg.slice(name.length + 1) : argv[last], joined);
  return { last, way: flag.way === true };
}

/** The arguments after the required ones: flags in any order, and the optional positional; two ways given are refused. */
function readTail(spec: Spec, argv: readonly string[], given: Record<string, string | number | undefined>): Args {
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
 * required argument missing, empty or starting `--`, for which the CLI prints its help. Refused, exit 2, in the spec's own words: an
 * argument it does not take, a value flag with no value, given twice, or with one of the command's own flags for its value, and two ways.
 */
export function parseArgv(spec: Spec, argv: readonly string[]): Args | undefined {
  const required = spec.positionals.filter((p) => p.takes === 'required');
  const head = argv.slice(0, required.length);
  if (head.length < required.length || head.some((a) => !a || a.startsWith('--'))) return undefined;
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

/** The commands' lines of `wf`'s help, in the table's order: each usage, then its help lines under it. */
export const helpOf = (table: readonly Pick<CommandSpec, 'name' | 'usage' | 'help'>[]): string =>
  table.flatMap((c) => [`  ${CLI} ${c.name} ${c.usage}`, ...c.help.map((line) => `${HELP_INDENT}${line}`)]).join('\n');

/**
 * Where a table of commands breaks its rules, a sentence each: a name defined twice; an entry served nowhere — neither routed on the api
 * nor said to be served on one side alone (`only`) — so a gap between the CLI and the api is never left unsaid; and a name that is both a
 * command of the table and one of the CLI's own verbs (`verbs`), which the CLI would run twice over.
 */
export function commandBreaks(table: readonly Pick<CommandSpec, 'name' | 'route' | 'only'>[], verbs: readonly string[]): string[] {
  const breaks: string[] = [];
  const seen = new Set<string>();
  for (const c of table) {
    if (seen.has(c.name)) breaks.push(`${c.name} is defined twice: a command is one entry of the table`);
    seen.add(c.name);
    if (!c.route && !c.only)
      breaks.push(`${c.name} has no route and no only: give it its route on the api, or say which side alone serves it, and why`);
    if (verbs.includes(c.name)) breaks.push(`${c.name} is a command of the table and a verb of the CLI: take it out of VERBS`);
  }
  return breaks;
}
