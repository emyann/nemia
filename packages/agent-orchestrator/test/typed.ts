/**
 * A command run onto its entry's handler, as the api calls it, for a test of what a verb does to the store: the client (`apps/cli`)
 * parses, words and prints a store verb, and its tests hold those; here a test reads what the handler answers and what it wrote.
 *
 * - `handled(ENTRY, input, …)` runs the entry's handler on the input its Schema types, over the engine, place and store the test names.
 * - `typed(argv, …)` reads a command line by the entry's own words first (`objects`' spec and `check`, a former name as the name it
 *   became), decodes what it parsed through the entry's `input`, and runs the handler: for a verb whose handler takes what its words
 *   parse. It takes what `main` took (`argv, engine, demand, place, env`), so a story's stage is given it as its `main`
 *   (`staged({ runWith, main: typed, engineOf, env })`). A verb whose input the client shapes before it asks (a file read where it is
 *   typed, a card resolved, a person's yes) is called by `handled` with that input said.
 *
 * Each answers the handler's data and throws its refusal as it is; neither prints, starts a daemon, nor reads `--help`.
 */
import { Schema } from 'effect';
import {
  builtinGitPlace,
  engine,
  Invalid,
  TABLE,
  parseArgv,
  renamedIn,
  runWith,
  type Command,
  type Env,
  type Place,
} from '../src/runner.ts';
import { placedIn, type Engine } from '../src/cli/flags.ts';

/** What a handler answers. */
type Data = Readonly<Record<string, unknown>>;

/** The engine, place and store a call is made over: the store `env` names, the built-in git place and the board under it, unless said. */
export type Over = { readonly e?: Engine; readonly place?: Place; readonly env?: Env };

/** `entry`'s handler run on `input`, over what `over` names: its data, or its refusal thrown. */
export function handled<D extends object, I>(entry: Pick<Command<D, I>, 'handler'>, input: I, over: Over = {}): Promise<D> {
  const env = over.env ?? process.env;
  return runWith(over.e ?? engine(env), placedIn(env, over.place ?? builtinGitPlace, entry.handler(input)));
}

/** The entry `words` name, the longest whose name they open with, and the words after it; refused where no entry is named. */
function namedIn(words: readonly string[]): { entry: (typeof TABLE)[number]; rest: string[] } {
  const opens = (name: string) => name.split(' ').every((word, i) => words[i] === word);
  const entry = TABLE.filter((c) => opens(c.name)).sort((a, b) => b.name.length - a.name.length)[0];
  if (entry === undefined) throw new Invalid({ message: `${words.join(' ')} names no entry of the command table: name one of TABLE` });
  return { entry, rest: words.slice(entry.name.split(' ').length) };
}

/**
 * `argv` read by the words of the entry it names and run on its handler (`handled`): refused, `Invalid`, as the entry's spec and `check`
 * refuse it, where it is given too little to act on, and where what it parsed is not what the handler takes. `_demand` is unread: no
 * daemon is started.
 */
export async function typed(argv: readonly string[], e?: Engine, _demand?: unknown, place?: Place, env?: Env): Promise<Data> {
  const { entry, rest } = namedIn(renamedIn(argv).words);
  if (entry.handler === undefined)
    throw new Invalid({ message: `${entry.name} has no handler: it is a runner of the CLI's own, driven through main` });
  const args = parseArgv(entry.spec, rest);
  if (args === undefined)
    throw new Invalid({ message: `nemia ${entry.name} was given too little to act on: nemia ${entry.name} ${entry.usage}` });
  const wrong = entry.check?.(args);
  if (wrong) throw new Invalid({ message: wrong });
  const decoded = entry.input === undefined ? undefined : Schema.decodeUnknownExit(entry.input)(args);
  if (decoded !== undefined && decoded._tag !== 'Success')
    throw new Invalid({ message: `nemia ${entry.name} was given arguments its handler does not take: nemia ${entry.name} ${entry.usage}` });
  const given = decoded === undefined ? args : (decoded.value as typeof args);
  return handled(entry as Command, given, { ...(e && { e }), ...(place && { place }), ...(env && { env }) });
}
