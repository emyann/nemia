/**
 * A command of the orchestrator, said once as data: its name, the arguments it takes and how a command line spells them, the refusals of
 * its arguments in its own words, its help, and the side it is served on alone. Pure: the table that lists every command is
 * `commands.verb.ts`, each entry, with the handler it calls and what it prints, in its feature's folder; the CLI parses, refuses and
 * helps from a spec here, and the api calls an entry by its exported name, its body the endpoint's own Schema in objects' `Api`.
 */
import { Invalid } from '../refusal/refusal.ts';
import { FORMER_MODES } from '../retry/index.ts';
import { oneLine } from '../record/record.ts';
import {
  amountOf as amountOfObjects,
  CLI,
  COMMAND_WORDS,
  CommandRefused,
  parseArgv as parseArgvOf,
  type Args,
  type CommandLink,
  type CommandWords,
  type Spec,
} from 'objects';

export { CLI, commandLine, helpOf, type Args, type CommandClass, type CommandWords, type Flag, type Positional, type Spec } from 'objects';

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
 * An endpoint of `objects`' `Api` that serves a verb (`CommandLink`), and what the command line forwarded to another machine's api
 * (`NEMIA_SERVER`, `src/command/forward.verb.ts`) reads of a link: `takes`, whether this link is the one a given input calls, on an entry
 * of more than one link (the first whose `takes` holds, the last where none says one); `request`, the call's input as the endpoint takes
 * it — its path, query and payload keys in one object — where the entry's input is not that already, reading on this machine what the
 * command names here (a template folder packed, a file's text), a promise rejected with the package's refusal where it cannot be sent;
 * and `answer`, the data the entry's `print` takes, made of the endpoint's decoded answer, where that is not it already.
 */
export type EndpointLink = CommandLink & {
  readonly takes?: (input: Readonly<Record<string, unknown>>) => boolean;
  readonly request?: (input: Readonly<Record<string, unknown>>) => Promise<Readonly<Record<string, unknown>>>;
  readonly answer?: (answer: unknown, input: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>;
};

/**
 * A command, as data: its words (`CommandWords`, `objects`' — the name, usage, help, spec, class and the rest, said there for a command
 * the client holds, `COMMAND_WORDS`), with `check`, the refusal of its arguments before anything is read, the same on both sides, or
 * null; and its `served` links as the forwarded command line reads them (`EndpointLink`).
 */
export type CommandSpec = Omit<CommandWords, 'served'> & {
  readonly check?: (args: Args) => string | null;
  readonly served?: readonly [EndpointLink, ...EndpointLink[]];
};

/**
 * A command line's arguments after the command's name, read against `spec` (`objects`' `parseArgv`), its refusals `Invalid`, exit 2;
 * undefined where it is given too little to act on, for which the CLI prints its help.
 */
export function parseArgv(spec: Spec, argv: readonly string[]): Args | undefined {
  try {
    return parseArgvOf(spec, argv);
  } catch (err) {
    throw asInvalid(err);
  }
}

/** An amount flag's value as a number (`objects`' `amountOf`), its refusal `Invalid`, exit 2. */
export function amountOf(text: string | undefined, takes: string, form: string, flag = '--budget'): number {
  try {
    return amountOfObjects(text, takes, form, flag);
  } catch (err) {
    throw asInvalid(err);
  }
}

/** `objects`' refusal of what was typed, as the package's own (`Invalid`); anything else as it is. */
const asInvalid = (err: unknown): unknown => (err instanceof CommandRefused ? new Invalid({ message: err.message }) : err);

/** The dollars under `key`, or undefined where none were given. */
export const amountIn = (args: Args, key: string): number | undefined => {
  const value = args[key];
  return typeof value === 'number' ? value : undefined;
};

/** `--why` or `--by`: the flag, the key it fills, what it takes as its refusals say it, and the longest it may be. */
export type Said = { readonly flag: '--why' | '--by'; readonly key: 'why' | 'by'; readonly takes: string; readonly cap: number };

/** Each of `said`'s refusals of a value left out, saying what it takes, ending on the command's forms. */
export const takesOf = (said: readonly Said[], shape: string): Readonly<Record<string, string>> =>
  Object.fromEntries(said.map(({ flag, takes }) => [flag, `${flag} takes ${takes}: ${shape}.`]));

/**
 * The refusal of `flag`'s value left out, in `refusals`, which holds one for each text flag of its command (`takesOf`): a flag it holds
 * none for is thrown, naming it.
 */
export const takesFor = (refusals: Readonly<Record<string, string>>, flag: string): string => {
  const takes = refusals[flag];
  if (takes === undefined) throw new Error(`${flag} has no refusal of its value left out: add it to its command's table of them`);
  return takes;
};

/** `--why` or `--by`'s value as one line: every run of whitespace, a newline included, one space. */
export const saidOf = (args: Args, key: 'why' | 'by'): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? oneLine(value, Number.POSITIVE_INFINITY) : undefined;
};

/**
 * Refused of `--why` or `--by`: a value starting `--`, which reads as the value left out (its refusal in `takes`), blank, or longer than
 * its cap.
 */
export function saidRefusal(args: Args, { flag, key, takes, cap }: Said, refusals: Readonly<Record<string, string>>): string | null {
  const value = args[key];
  if (typeof value !== 'string') return null;
  if (value.startsWith('--')) return takesFor(refusals, flag);
  const line = saidOf(args, key) ?? '';
  if (!line) return `${flag} takes ${takes}, and was given only blanks: give it words, or leave ${flag} out.`;
  if (line.length > cap) return `${flag} takes at most ${cap} characters, and was given ${line.length}: say it shorter.`;
  return null;
}

/** `--why` and `--by` as `command` takes them, for what it puts (`a hold`): each a text flag given once, refused in `refusals`' words. */
export const saidFlags = (
  said: readonly Said[],
  command: string,
  puts: string,
  refusals: Readonly<Record<string, string>>,
  shape: string,
) =>
  said.map(({ flag, key }) => ({
    flag,
    kind: 'text' as const,
    key,
    takes: refusals[flag],
    twice: `${command} takes ${flag} once: ${puts} says one ${key}. ${shape}.`,
  }));

/**
 * The refusal of a text flag's value left out on the command line — empty, or starting `--`, which reads as the value left out — in the
 * flag's own `takes`, or null.
 */
export function leftOut(spec: Spec, args: Args): string | null {
  for (const flag of spec.flags.filter((f) => f.kind === 'text' && f.key !== undefined)) {
    if (flag.key === undefined) continue;
    const value = args[flag.key];
    const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    if (values.some((v) => !v || v.startsWith('--'))) return flag.takes ?? null;
  }
  return null;
}

/**
 * The verbs the CLI runs by a hand of its own, outside the table (`VERBS` in `cli/main.ts`), each with its usage and help as `nemia`'s
 * help prints them, its class, and the endpoint that serves it: `nemia decide`, a read, whose screen is printed off the run's decision
 * (`decisionRead`), which the api serves as data (`runs.decision`).
 */
export const CLI_VERBS: readonly Pick<CommandSpec, 'name' | 'usage' | 'help' | 'class' | 'served'>[] = [
  {
    name: 'decide',
    usage: '<runId> [--sensitive <globs>]',
    help: ['what the run produced, and the choice it leaves you (nemia decide --help)'],
    class: 'read',
    served: [{ endpoint: 'runs.decision', query: { diffs: '' } }],
  },
];

/** An entry of a table as `commandBreaks` reads it: whether it has a handler and an `input`, its spec, and its links. */
type Entry = Pick<CommandSpec, 'name' | 'only' | 'ticks' | 'served'> & {
  readonly spec?: Spec;
  readonly handler?: unknown;
  readonly writes?: boolean;
  readonly input?: unknown;
};

/**
 * Where one entry breaks the rules of how it runs: an entry with no handler that is not served on the CLI alone, which the api could not
 * run; one served on the CLI alone with neither a handler nor a runner of the CLI (`runners`); and one that ticks and writes nothing,
 * whose next pass would have nothing to do.
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
  return breaks;
}

/**
 * Where an entry's words for its sides break the rules: a why left empty, of the side that serves it alone or of a flag the CLI alone
 * takes.
 */
function sideBreaks(c: Entry): string[] {
  const breaks: string[] = [];
  if (c.only !== undefined && !c.only.why.trim()) breaks.push(`${c.name} is served on the ${c.only.side} alone and says no why: say why`);
  for (const f of c.spec?.flags ?? [])
    if (f.only !== undefined && !f.only.why.trim())
      breaks.push(`${c.name}'s ${f.flag} is taken on the ${f.only.side} alone and says no why: say why`);
  return breaks;
}

/** A tool of the MCP port: the endpoint it calls, its name, the entry whose link it is, and the query its link sends by default. */
export type LinkedTool = {
  readonly endpoint: EndpointLink['endpoint'];
  readonly tool: string;
  readonly entry: string;
  readonly query: Readonly<Record<string, string>>;
};

/**
 * The tools of `entry`'s links (`served`), in order: the first named by the verb, each space `_` (`factory ls` is the tool
 * factory_ls), every other by its `as`; a later link with no `as` gives no tool, which `commandBreaks` refuses.
 */
export const toolsOf = (entry: Pick<CommandSpec, 'name' | 'served'>): LinkedTool[] =>
  (entry.served ?? []).flatMap((link, i) => {
    const tool = i === 0 ? entry.name.replaceAll(' ', '_') : link.as;
    return tool === undefined ? [] : [{ endpoint: link.endpoint, tool, entry: entry.name, query: link.query ?? {} }];
  });

/**
 * Where an entry's links break the rules: an entry the command line does not serve alone that links no endpoint, which the api would
 * serve with no tool on the port; a link after the first that names no tool (`as`), which only the first takes from the verb; and a link
 * before the last that says no `takes`, which the command line forwarded to another machine's api (`linkOf`) would never call, the last
 * being the one it calls where none before it holds — but on a command the client holds (`COMMAND_WORDS`), which nothing forwards.
 */
function linkBreaks(c: Entry): string[] {
  const breaks: string[] = [];
  if (c.served === undefined && c.only?.side !== 'cli')
    breaks.push(
      `${c.name} links no endpoint and is not the command line's alone: give it served, the endpoint of objects' Api whose handler calls it, or only: { side: 'cli', why } where no endpoint serves it`,
    );
  for (const link of (c.served ?? []).slice(1))
    if (link.as === undefined)
      breaks.push(
        `${c.name}'s link to ${link.endpoint} names no tool: give it as, the tool's name on the port, as only the first link takes the verb's`,
      );
  const forwarded = !COMMAND_WORDS.some((w) => w.name === c.name);
  for (const link of forwarded ? (c.served ?? []).slice(0, -1) : [])
    if (link.takes === undefined)
      breaks.push(
        `${c.name}'s link to ${link.endpoint} says no takes: give it takes, which inputs call it when the command line is forwarded to another machine's api, as only the last link is called where no takes holds`,
      );
  return breaks;
}

/** Each tool name that two links give (`toolsOf`), of `entries`: a sentence naming the tool, the entries that give it, and the fix. */
function toolBreaks(entries: readonly Pick<CommandSpec, 'name' | 'served'>[]): string[] {
  const first = new Map<string, string>();
  const breaks: string[] = [];
  for (const { tool, entry } of entries.flatMap(toolsOf)) {
    const before = first.get(tool);
    if (before === undefined) first.set(tool, entry);
    else breaks.push(`${tool} is the tool of ${before} and of ${entry}: give one of the links another as, so each tool calls one endpoint`);
  }
  return breaks;
}

/**
 * Where a table of commands breaks its rules, a sentence each: a name defined twice; an entry served on both sides — said to be served
 * on neither alone (`only`) — that is not typed (`input`), which the api would have no keys to call it by, so a gap between the CLI and
 * the api is never left unsaid; a name that is a former one (`RENAMED`), which no line reaches; a name that is both a command the CLI
 * serves and one of the CLI's own verbs (`verbs`), which the CLI would run twice over — an entry served on the api alone shares a verb's
 * name freely; how an entry runs (`runBreaks`); its words for its sides (`sideBreaks`); its links to the api (`linkBreaks`); a runner of
 * the CLI (`runners`) that runs no entry the CLI serves; and a tool name two links give, of the table and of the CLI's own verbs the api
 * serves (`linked`, `CLI_VERBS`), which the port could not tell apart (`toolBreaks`).
 */
export function commandBreaks(
  table: readonly Entry[],
  verbs: readonly string[],
  runners: readonly string[] = [],
  linked: readonly Pick<CommandSpec, 'name' | 'served'>[] = [],
): string[] {
  const breaks: string[] = [];
  const seen = new Set<string>();
  for (const c of table) {
    if (seen.has(c.name)) breaks.push(`${c.name} is defined twice: a command is one entry of the table`);
    seen.add(c.name);
    if (!c.only && c.input === undefined)
      breaks.push(
        `${c.name} has no input and no only: give it its input, which the api calls it by, or say which side alone serves it, and why`,
      );
    const renamed = RENAMED.get(c.name);
    if (renamed) breaks.push(`${c.name} is a former name in RENAMED, which runs a line that says it as ${renamed.to}: name the entry anew`);
    if (c.only?.side !== 'api' && verbs.includes(c.name))
      breaks.push(`${c.name} is a command of the table and a verb of the CLI: take it out of VERBS`);
    breaks.push(...runBreaks(c, runners), ...sideBreaks(c), ...linkBreaks(c));
  }
  for (const name of runners.filter((r) => !table.some((c) => c.name === r && c.only?.side !== 'api')))
    breaks.push(`${name} has a runner and no entry the CLI serves: give it its entry in the table, or take it out of RUNS`);
  breaks.push(...toolBreaks([...table, ...linked]));
  return breaks;
}
