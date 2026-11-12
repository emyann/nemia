/**
 * A command's words, said once as data, and the parser that reads a command line by them: its name, the arguments it takes and how a
 * command line spells them, the refusals of its arguments in its own words, its help, the side it is served on alone, and the endpoints
 * of the `Api` that serve it. Pure, and shared by every layer that names a command: the client parses, helps and refuses from them; the
 * orchestrator's table spreads them under each command's handler; the api's MCP port and Nemia's verbs skill read them off that table.
 */
import type { ApiEndpointName } from './api.ts';

/** The CLI's name, as every command line says it. */
export const CLI = 'nemia';

/**
 * A refusal of what was typed, before anything is read, in the command's own words: each layer that parses a line answers it as its own
 * usage refusal (the orchestrator's `Invalid`, the client's `Refused`), exit 2.
 */
export class CommandRefused extends Error {
  override readonly name = 'CommandRefused';
}

/** Dollars written as digits above zero (`5`, `2.50`), or undefined: no unit, no sign, no exponent. */
export function dollarsOf(written: string): number | undefined {
  const value = written.trim();
  const n = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The class of a command an agent calls, and what admission does with a call of it:
 *
 * - `read`: writes nothing, and runs unasked;
 * - `act`: a write that runs unasked;
 * - `ask`: a write that asks the person each time — what cannot be undone, the person's own settings;
 * - `answer`: an answer to what waits on the person — a step at its gate, a step's question, a loop out of rounds — which admission asks
 *   the person of where the run's state says it waits on them;
 * - `none`: refused, out of the agent's reach;
 * - a command that reads bare and sets with some words: a read, but a write that asks given one of `setsBy` — a flag (`--clear`) or a
 *   positional word (`manual`) — or, `sets: 'none'`, one out of reach; `readsBy`, the flags it takes that only read.
 */
export type CommandClass =
  | 'read'
  | 'act'
  | 'ask'
  | 'answer'
  | 'none'
  | { readonly bare: 'read'; readonly sets: 'ask' | 'none'; readonly setsBy: readonly string[]; readonly readsBy?: readonly string[] };

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
  /** That the CLI alone takes it, and why: no key of the entry's `input`, which the api calls it by. */
  readonly only?: { readonly side: 'cli'; readonly why: string };
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

/**
 * An endpoint of the `Api` that serves a command (`<group>.<endpoint>`, typed so a name no endpoint has does not compile) — its handler,
 * or the read the client's verb prints — and the tool it is on the MCP port: the command's name, its spaces as `_`, for the first link of
 * an entry; `as` for every other. `query`, the values of the endpoint's query keys its tool sends where a call gives none (a call that
 * gives one, an empty one included, sends its own).
 */
export type CommandLink = {
  readonly endpoint: ApiEndpointName;
  readonly as?: string;
  readonly query?: Readonly<Record<string, string>>;
};

/**
 * A command's words: its `name`, its `usage` after the name and its `help` lines, as `nemia`'s help prints them; its `spec`; `writes`, a
 * write the api guards; `class`, who answers for it when an agent calls it (`CommandClass`); `only`, the side it is served on alone and
 * why — one with none is served on both; `served`, the endpoints of the `Api` that serve it, each a tool of the MCP port (`CommandLink`);
 * `manual`, the long help `nemia <name> --help` prints in place of running it, where it has one; `ticks`, that what it files waits on the
 * daemon's next pass; `asksAlways`, that an agent's call of it is asked of the person every time, on a command classed `ask` alone.
 */
export type CommandWords = {
  readonly name: string;
  readonly usage: string;
  readonly help: readonly string[];
  readonly spec: Spec;
  readonly writes: boolean;
  readonly class: CommandClass;
  readonly only?: { readonly side: 'cli' | 'api'; readonly why: string };
  readonly served?: readonly [CommandLink, ...CommandLink[]];
  readonly manual?: string;
  readonly ticks?: true;
  readonly asksAlways?: true;
};

/** A refusal of what was typed, before anything is read: exit 2. */
const usage = (message: string): never => {
  throw new CommandRefused(message);
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
 * A word of a command line, as the parser reads it: a flag of the command with its value, a positional, a flag it has none of, or
 * `--help`.
 */
type Word =
  | { readonly is: 'flag'; readonly flag: Flag; readonly arg: string; readonly value: string | undefined; readonly joined: boolean }
  | { readonly is: 'positional'; readonly arg: string; readonly operand: boolean }
  | { readonly is: 'stray'; readonly arg: string }
  | { readonly is: 'help' };

/** The word `arg` is, at `i` of `argv`, and the index of the last argument it took: a flag's value given apart is the one after it. */
function wordAt(spec: Spec, argv: readonly string[], i: number, arg: string): { word: Word; last: number } {
  const joined = arg.startsWith('--') && arg.includes('=');
  const name = joined ? arg.slice(0, arg.indexOf('=')) : arg;
  const flag = flagOf(spec, name, joined);
  if (flag === undefined && arg === '--help') return { word: { is: 'help' }, last: i };
  if (flag === undefined) return { word: arg.startsWith('--') ? { is: 'stray', arg } : { is: 'positional', arg, operand: false }, last: i };
  if (flag.kind === 'switch' || flag.key === undefined) return { word: { is: 'flag', flag, arg, value: undefined, joined }, last: i };
  if (joined) return { word: { is: 'flag', flag, arg, value: arg.slice(name.length + 1), joined }, last: i };
  return { word: { is: 'flag', flag, arg, value: argv[i + 1], joined }, last: i + 1 };
}

/**
 * The words of `argv`, wherever each stands, as a POSIX-style parser with permutation reads them: a flag of the command — its value the
 * word after it, or joined with `=` — before, between or after the positionals; `--help`; a word starting `--` that is no flag of it; and
 * every other word a positional. `--` ends the flags: each word after it is a positional (an operand), whatever it starts with.
 */
function wordsOf(spec: Spec, argv: readonly string[]): Word[] {
  const words: Word[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') return [...words, ...argv.slice(i + 1).map((operand): Word => ({ is: 'positional', arg: operand, operand: true }))];
    if (arg === undefined) continue;
    const read = wordAt(spec, argv, i, arg);
    words.push(read.word);
    i = read.last;
  }
  return words;
}

/**
 * `arg`, a positional after the required ones, put under the positional that takes it: a many positional's, beside the values before it
 * unless it is one of them, where it starts with no `-`; else the optional one's, once, where it starts with no `--` — an operand, given
 * after `--`, whatever it starts with. Returns whether one took it.
 */
function placed(spec: Spec, arg: string, operand: boolean, args: Filling): boolean {
  const many = spec.positionals.find((p) => p.takes === 'many');
  if (many && (operand || !arg.startsWith('-'))) {
    const before = args[many.key];
    const values = Array.isArray(before) ? before : [];
    args[many.key] = values.includes(arg) ? values : [...values, arg];
    return true;
  }
  const optional = spec.positionals.find((p) => p.takes === 'optional');
  if (!optional || (!operand && arg.startsWith('--')) || args[optional.key] !== undefined) return false;
  args[optional.key] = arg;
  return true;
}

/** `word`, a flag of the command, read into `args` with its value, or refused in its words; returns whether it was one of the ways. */
function readFlag(spec: Spec, word: Extract<Word, { is: 'flag' }>, args: Filling): boolean {
  const { flag } = word;
  if (once(flag) && flag.key !== undefined && args[flag.key] !== undefined) usage(flag.twice ?? spec.unknown(word.arg));
  Object.assign(args, flag.sets);
  if (flag.key === undefined || flag.kind === 'switch') {
    if (flag.key !== undefined) args[flag.key] = true;
    return flag.way === true;
  }
  put(args, flag, flag.key, valueOf(spec, flag, word.value, word.joined));
  return flag.way === true;
}

/**
 * Whether `word`, typed for the required positional `p`, leaves it out: a word starting `-` where the spec says its own refusal
 * (`missing`), but for an operand given after `--`, or empty, but for a text whose spec says its refusal, which its handler is given to
 * refuse in its own words.
 */
const unfilledBy = (spec: Spec, p: Positional, word: Word | undefined): boolean =>
  word?.is === 'positional' &&
  ((!word.operand && spec.missing !== undefined && word.arg.startsWith('-')) ||
    (!word.arg && (spec.missing === undefined || p.kind !== 'text')));

/**
 * A command whose last positional is a rest: its required positionals the first words, then the command's own flags given right after
 * them (`nemia say <runId> <step> --as <name> <words>`), each with its value, and every word after those its text, flags included; a flag
 * it has none of where a required argument stands is refused in its words.
 */
function parseRest(spec: Spec, rest: Positional, argv: readonly string[]): Args | undefined {
  const required = spec.positionals.filter((p) => p.takes === 'required');
  const head = argv.slice(0, required.length);
  const stray = spec.missing === undefined || spec.flagFirst ? head.find((a) => strayFlag(spec, a)) : undefined;
  if (stray !== undefined) return usage(spec.unknown(stray));
  const short = head.some(
    (a, i) => a.startsWith(spec.missing === undefined ? '--' : '-') || (!a && (spec.missing === undefined || required[i]?.kind !== 'text')),
  );
  if (head.length < required.length || short) return spec.missing === undefined ? undefined : usage(spec.missing);
  const args: Filling = Object.fromEntries(required.map((p, i) => [p.key, head[i]]));
  let at = required.length;
  for (let arg = argv[at]; arg !== undefined; arg = argv[at]) {
    const { word, last } = wordAt(spec, argv, at, arg);
    if (word.is !== 'flag') break;
    readFlag(spec, word, args);
    at = last + 1;
  }
  return { ...args, [rest.key]: argv.slice(at).join(' ') };
}

/** A word that is a flag no command takes: neither one of `spec`'s, nor `--help`. */
const strayFlag = (spec: Spec, arg: string): boolean =>
  arg.startsWith('--') && arg !== '--help' && !spec.flags.some((f) => f.flag === arg.split('=')[0]);

/**
 * A command line's arguments after the command's name, read against `spec`, its flags taken wherever they stand among the positionals
 * (`wordsOf`) — or undefined when it is given too little to act on: `--help`, or a required argument missing or empty, for which the CLI
 * prints its help, unless the spec says its refusal (`missing`), which a required argument starting `-` gets too. Refused, exit 2, in the
 * spec's own words: an argument it does not take — a flag it has none of, wherever it stands (said as `missing` where a required argument
 * is short and the spec says it, but for `flagFirst`), one the api alone takes (`Flag.only`), and a positional past those it takes — a
 * value flag with no value, given twice, or with one of the command's own flags for its value, and two ways.
 */
export function parseArgv(spec: Spec, argv: readonly string[]): Args | undefined {
  const rest = spec.positionals.find((p) => p.takes === 'rest');
  if (rest) return parseRest(spec, rest, argv);
  const required = spec.positionals.filter((p) => p.takes === 'required');
  const words = wordsOf(spec, argv);
  const positionals = words.filter((w) => w.is === 'positional');
  const short = positionals.length < required.length;
  const stray = words.find((w) => w.is === 'stray');
  if (stray !== undefined) return usage(short && spec.missing !== undefined && !spec.flagFirst ? spec.missing : spec.unknown(stray.arg));
  if (words.some((w) => w.is === 'help')) return undefined;
  if (short || required.some((p, i) => unfilledBy(spec, p, positionals[i]))) {
    return spec.missing === undefined ? undefined : usage(spec.missing);
  }
  const given: Filling = Object.fromEntries(required.map((p, i) => [p.key, positionals[i]?.arg]));
  return readWords(spec, words, required.length, given, argv);
}

/**
 * `words` read into the arguments after the `required` positionals, already `given`: each flag with its value, and each positional past
 * the required put under the one that takes it (`placed`), else refused in the spec's words; two ways given are refused.
 */
function readWords(spec: Spec, words: readonly Word[], required: number, given: Filling, argv: readonly string[]): Args {
  const args = { ...given };
  let ways = 0;
  let seen = 0;
  for (const word of words) {
    if (word.is === 'flag' && readFlag(spec, word, args)) ways++;
    if (word.is !== 'positional' || seen++ < required) continue;
    if (!placed(spec, word.arg, word.operand, args)) usage(spec.unknown(word.arg));
  }
  if (ways > 1) usage(spec.oneWay ?? spec.unknown(argv.join(' ')));
  return { ...spec.defaults, ...args };
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
export function commandLine(command: Pick<CommandWords, 'name' | 'spec'>, args: Args, flags: Args = {}): string {
  const said = (value: Args[string]) => (Array.isArray(value) ? value.join(' ') : String(value));
  const words = command.spec.positionals
    .filter((p) => p.takes !== 'rest')
    .map((p) => (args[p.key] !== undefined ? said(args[p.key]) : unsaid(p)));
  const flagged = command.spec.flags.flatMap((f) => (f.key === undefined ? [] : flagWords(f, flags[f.key])));
  return [CLI, command.name, ...words, ...flagged].join(' ');
}

/** The column the help's lines under a command start at. */
const HELP_INDENT = ' '.repeat(31);

/** The commands' lines of `nemia`'s help, in the table's order: each usage, then its help lines under it; none the CLI does not serve. */
export const helpOf = (table: readonly Pick<CommandWords, 'name' | 'usage' | 'help' | 'only'>[]): string =>
  table
    .filter((c) => c.only?.side !== 'api')
    .flatMap((c) => [`  ${CLI} ${[c.name, c.usage].filter(Boolean).join(' ')}`, ...c.help.map((line) => `${HELP_INDENT}${line}`)])
    .join('\n');
