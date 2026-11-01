/**
 * A call's admission, decided off the command table and the runs' state: whether a shell line an agent is about to run acts on a run or a
 * factory below the agent's floor (`Scope`), answers what waits on the person (`admissionOf`), which a rule the person confirmed may let
 * through at `auto` (`Auto`), or is asked every time (`asksAlways`); the table's commands it types (`typedIn`), and the runs and factories
 * they name (`namedIn`). Pure: the caller reads the state (`admit.verb.ts`).
 */
import type { AdmissionAnswer, AdmissionCall } from 'agent-runtime/vocabulary';
import { parseArgv, renamedIn, type Spec } from '../command/command.ts';
import { DEFAULT_FACTORY } from '../factory/factory.ts';
import { atLeast, type Level } from '../level/level.ts';
import { allowedBy, AUTO_ANSWERS, NO_FACTS, type AutoRule, type Facts } from '../auto/index.ts';
import type { CommandClass } from './class.ts';
import type { ApproveForm } from '../gate/gate.ts';

/**
 * An entry of the table as admission reads it: its name, its class, whether it is asked every time, the side it is served on, and how its
 * words are spelt.
 */
type Entry = {
  readonly name: string;
  readonly class: CommandClass;
  readonly asksAlways?: true;
  readonly only?: { readonly side: 'cli' | 'api' };
  readonly spec?: Spec;
};

/** A command of the table typed on a shell line: its name, its class, and the words after its name. */
export type Typed = { name: string; class: CommandClass; args: string[] };

/**
 * A shell line's words and the separators between its commands. A quote splits words and is dropped, so a line run through `bash -c '…'`
 * is read as the line it quotes; a `$(`, a backtick, `;`, `&`, `|` and a line break each end a command.
 */
const PARTS = /[;&|()\n`]+|[^\s;&|()`'"]+/g;

/** Whether a part of a shell line ends a command. */
const ends = (part: string): boolean => /^[;&|()\n`]/.test(part);

/** The programs the table is typed under: the command, by any path, and its former name. */
const PROGRAMS = ['nemia', 'wf'];

/**
 * Each command of `table` typed on the shell line `line`, in order: a word naming the program (`nemia`, by any path, or `wf`), anywhere
 * on the line, then the longest name of a command the command line serves, word for word, a renamed group read as its new name
 * (`renamedIn`), and the words after it up to the command's end.
 */
export function typedIn(line: string, table: readonly Entry[]): Typed[] {
  const parts = line.match(PARTS) ?? [];
  const served = table.filter((e) => e.only?.side !== 'api').map((e) => ({ entry: e, words: e.name.split(' ') }));
  const typed: Typed[] = [];
  parts.forEach((part, at) => {
    if (!PROGRAMS.includes(part.slice(part.lastIndexOf('/') + 1))) return;
    const rest = parts.slice(at + 1);
    const words = renamedIn(rest.slice(0, rest.findIndex(ends) === -1 ? rest.length : rest.findIndex(ends))).words;
    const named = served.filter((s) => s.words.every((w, i) => words[i] === w)).sort((a, b) => b.words.length - a.words.length)[0];
    if (named) typed.push({ name: named.entry.name, class: named.entry.class, args: words.slice(named.words.length) });
  });
  return typed;
}

/** The keys a command's spec files a run and a factory under, whose values admission scopes. */
const RUN_KEY = 'runId';
const FACTORY_KEY = 'factory';

/**
 * What a typed command names: its runs and its factories, each value of its spec's `runId` and `factory` keys; `unread` where its words do
 * not parse by its spec, though the spec takes one of them.
 */
export type Named = { runs: string[]; factories: string[]; unread: boolean };

/** A shell redirection (`>`, `2>&1`, `<in`), which is no word of the command; a bare operator takes the word after it. */
const REDIRECT = /^\d*[<>]/;

/** The words of a command, its redirections and their targets left out. */
const unredirected = (args: readonly string[]): string[] =>
  args.filter((a, i) => {
    const before = args[i - 1];
    return !REDIRECT.test(a) && !(before !== undefined && /^\d*[<>]+&?$/.test(before));
  });

/** The values `args` holds under `key`, one or many. */
const valuesAt = (args: Readonly<Record<string, unknown>>, key: string): string[] => {
  const value = args[key];
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
};

/** Whether `spec` files a run or a factory under one of the keys admission scopes. */
const scoped = (spec: Spec): boolean =>
  [...spec.positionals.map((p) => p.key), ...spec.flags.map((f) => f.key)].some((k) => k === RUN_KEY || k === FACTORY_KEY);

/** What the command `typed`, of `table`, names, read by its entry's spec. */
function namedBy(typed: Typed, table: readonly Entry[]): Named {
  const spec = table.find((e) => e.name === typed.name)?.spec;
  if (spec === undefined || !scoped(spec)) return { runs: [], factories: [], unread: false };
  let args: Readonly<Record<string, unknown>> | undefined;
  try {
    args = parseArgv(spec, unredirected(typed.args));
  } catch {
    args = undefined;
  }
  if (args === undefined) return { runs: [], factories: [], unread: true };
  return { runs: valuesAt(args, RUN_KEY), factories: valuesAt(args, FACTORY_KEY), unread: false };
}

/** The runs and factories each command of `table` typed on the shell line `line` names, in order (`typedIn`, `namedBy`). */
export const namedIn = (line: string, table: readonly Entry[]): Array<Typed & Named> =>
  typedIn(line, table).map((typed) => ({ ...typed, ...namedBy(typed, table) }));

/**
 * What an agent's calls are scoped by, as a namespace scopes a binding: the level a factory is at least at for a call to act on it
 * (`atLeast`); the factory and level of a run, undefined where the run does not read (`runOf`); and a factory's level (`factoryOf`).
 */
export type Scope = {
  atLeast: Level;
  runOf: (runId: string) => { factory: string; level: Level } | undefined;
  factoryOf: (factory: string) => Level;
};

/** How a factory's level is raised, as the refusal says it: the store's for the default factory, else the factory's own. */
const raiseWords = (factory: string, least: Level): string =>
  factory === DEFAULT_FACTORY ? `nemia level ${least}` : `nemia level ${least} --factory ${factory} [--for <duration>]`;

/** The denial of `line`, which acts on the factory `factory` at `level`, below `least`, through `what`. */
const below = (line: string, what: string, factory: string, level: Level, least: Level): AdmissionAnswer => ({
  decision: 'deny',
  reason: `${line} acts on ${what}the factory ${factory}, at ${level}: below ${least}, it is left alone. Raising it is the person's: ${raiseWords(factory, least)}.`,
});

/** Scope's answer for one typed command: a denial where it names a run or factory below the floor, an ask where it cannot be read. */
function scopedOf(typed: Typed & Named, scope: Scope): AdmissionAnswer | undefined {
  const line = ['nemia', typed.name, ...typed.args].join(' ');
  if (typed.unread)
    return { decision: 'ask', reason: `${line} does not read as its command, so admission cannot read the runs it acts on.` };
  for (const runId of typed.runs) {
    const run = scope.runOf(runId);
    if (run === undefined)
      return { decision: 'ask', reason: `${line} names ${runId}, which does not read, so admission cannot read its factory.` };
    if (!atLeast(run.level, scope.atLeast)) return below(line, `${runId} of `, run.factory, run.level, scope.atLeast);
  }
  for (const factory of typed.factories) {
    const level = scope.factoryOf(factory);
    if (!atLeast(level, scope.atLeast)) return below(line, '', factory, level, scope.atLeast);
  }
  return undefined;
}

/**
 * Scope's answer for the shell line `line`: a denial where any command on it acts on a run or a factory below the floor, first; else an ask
 * where one cannot be read; else none.
 */
function scopeOf(line: string, table: readonly Entry[], scope: Scope): AdmissionAnswer | undefined {
  const answers = namedIn(line, table).flatMap((typed) => scopedOf(typed, scope) ?? []);
  return answers.find((a) => a.decision === 'deny') ?? answers[0];
}

/** Whether a command's words raise a step's cap. */
const raises = (args: readonly string[]): boolean => args.some((a) => a === '--budget' || a.startsWith('--budget='));

/** Whether a retry's words ask for another round of a loop (`--round`, what `nemia round` was), which is always the person's. */
const rounds = (args: readonly string[]): boolean => args.includes('--round');

/**
 * Why a typed answer is asked of the person, or undefined where it waits on no one. A retry asks where it raises a cap (`--budget`), asks
 * for another round (`--round`), names no run and step, or tries a step `waitOf` says waits on the person; any other answer always asks,
 * since it only answers what waits.
 */
function askedOf({ name, args }: Typed, waitOf: (runId: string, step: string) => string | undefined): string | undefined {
  const line = ['nemia', name, ...args].join(' ');
  if (name !== 'retry') return `${line} answers what waits on you: it is yours to give.`;
  if (raises(args)) return `${line} raises a step's cap: a budget is yours to raise.`;
  if (rounds(args)) return `${line} takes another round of a loop out of rounds: a round is yours to give.`;
  const [runId, step] = args.filter((a) => !a.startsWith('-'));
  if (runId === undefined || step === undefined) return `${line} names no run and step, so admission cannot read what it tries.`;
  const waits = waitOf(runId, step);
  return waits === undefined ? undefined : `${line} answers what waits on you: ${step} of ${runId} ${waits}.`;
}

/**
 * What admission reads at `auto`, for the agent it is handed: the person's list in force for it (`list`); the level of a run's factory,
 * undefined where the run does not read (`levelOf`); the facts of a run at the call, for a step, undefined where they do not read
 * (`factsOf`); and the yes an approval of a step gives, at its gate or to a loop out of rounds, undefined where it does not read
 * (`formOf`). Read at the call, and carried to no other.
 */
export type Auto = {
  list: readonly AutoRule[];
  levelOf: (runId: string) => Level | undefined;
  factsOf: (runId: string, step: string) => Facts | undefined;
  formOf: (runId: string, step: string) => ApproveForm | undefined;
};

/** The run and step a typed answer names, read by its entry's spec, or undefined where its words do not parse or name none. */
export function answerOf(typed: Typed, table: readonly Entry[]): { runId: string; step: string } | undefined {
  const spec = table.find((e) => e.name === typed.name)?.spec;
  if (spec === undefined) return undefined;
  let args: Readonly<Record<string, unknown>> | undefined;
  try {
    args = parseArgv(spec, unredirected(typed.args));
  } catch {
    return undefined;
  }
  if (args === undefined) return undefined;
  const [runId] = valuesAt(args, RUN_KEY);
  const [step] = valuesAt(args, 'step');
  return runId === undefined || step === undefined ? undefined : { runId, step };
}

/**
 * Whether a rule of the person's list lets the typed answer through unasked: an answer a rule may give (`AUTO_ANSWERS`), raising no cap,
 * asking for no round, naming a run and a step — an approval, one at the step's gate, never a loop's end (`formOf`), which was `nemia
 * accept` and is the person's every time — the run's factory at `auto`, and a rule that allows it in the run's facts at the call
 * (`allowedBy`).
 */
function autoAllows(typed: Typed, table: readonly Entry[], auto: Auto | undefined): boolean {
  if (auto === undefined || !(AUTO_ANSWERS as readonly string[]).includes(typed.name) || raises(typed.args) || rounds(typed.args))
    return false;
  const answer = answerOf(typed, table);
  if (answer === undefined) return false;
  if (typed.name === 'approve' && auto.formOf(answer.runId, answer.step) !== 'gate') return false;
  const level = auto.levelOf(answer.runId);
  if (level === undefined || !atLeast(level, 'auto')) return false;
  const facts = auto.factsOf(answer.runId, answer.step) ?? NO_FACTS;
  return allowedBy(auto.list, { answer: typed.name, step: answer.step }, facts) !== undefined;
}

/** The ask of a command of `table` the person is asked every time (`asksAlways`) typed on the shell line `line`, or undefined for none. */
function alwaysAsked(line: string, table: readonly Entry[]): AdmissionAnswer | undefined {
  const typed = typedIn(line, table).find((t) => table.find((e) => e.name === t.name)?.asksAlways);
  if (typed === undefined) return undefined;
  return { decision: 'ask', reason: `${['nemia', typed.name, ...typed.args].join(' ')} is yours, asked every time: no allow reaches it.` };
}

/**
 * Admission's answer for a call: where `scope` is given, `deny` for a shell line acting on a run or a factory below its floor, and `ask`
 * for one whose runs it cannot read (`scopeOf`); then `ask` where the line types a command asked every time (`asksAlways`), whatever the
 * session was allowed; then `ask`, saying why in the person's words, where the call is a shell line that types an `answer` command of
 * `table` that waits on the person (`askedOf`) and no rule of `auto` lets through (`autoAllows`); else none, and the call meets the
 * session's own rules. `waitOf` says why a step waits on the person — at its gate, on its question, out of rounds, at its cap, or not there
 * to read — or undefined where it waits on no one.
 */
export function admissionOf(
  call: AdmissionCall,
  table: readonly Entry[],
  waitOf: (runId: string, step: string) => string | undefined,
  scope?: Scope,
  auto?: Auto,
): AdmissionAnswer | undefined {
  const line = call.input.command;
  if (call.tool !== 'Bash' || typeof line !== 'string') return undefined;
  const inScope = scope === undefined ? undefined : scopeOf(line, table, scope);
  if (inScope !== undefined) return inScope;
  const always = alwaysAsked(line, table);
  if (always !== undefined) return always;
  for (const typed of typedIn(line, table).filter((t) => t.class === 'answer')) {
    const why = askedOf(typed, waitOf);
    if (why !== undefined && !autoAllows(typed, table, auto)) return { decision: 'ask', reason: why };
  }
  return undefined;
}
