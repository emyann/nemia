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
 * - `said(argv, …)` runs `typed` and answers the lines a story reads of an `ls` or a `logs`.
 * - `told(argv, …)` is `main` for a story typed before the move: a verb the client holds on `typed`, any other on `main`.
 * - A `start` through either answers what its handler answered and, as `facts`, what the api words of it (`startedFacts`, `objects`'
 *   `RunStartedFacts`): a test asserts a start's facts there, and the client's tests hold the words it prints of them.
 *
 * Each answers the handler's data and throws its refusal as it is; none starts a daemon nor reads `--help`, and `told` alone prints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { COMMAND_WORDS } from 'objects';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { engineOf } from '../src/runtime-client.ts';
import { Invalid, TABLE, parseArgv, renamedIn, runWith, type Command, type Env, type Place } from '../src/runner.ts';
import { placedIn, type Engine } from '../src/cli/flags.ts';
import { main } from '../src/cli/main.ts';
import { lsLines, type RunsListed } from '../src/list/list.ts';
import { readFactoriesAt } from '../src/factory/factory.store.ts';
import { START, StartInput, startedFacts, type Started } from '../src/start/commands.verb.ts';
import type { RunStartedFacts } from 'objects';

/** What a handler answers. */
type Data = Readonly<Record<string, unknown>>;

/** What a `start` answers here: what its handler answered, and the facts the api answers of the run (`startedFacts`). */
export type StartedAnswer = Started & { readonly facts: RunStartedFacts };

/** `started`, what a start's handler answered, with the facts the api answers of its run beside it (`startedFacts`). */
export const factsOf = (started: Started): StartedAnswer => ({ ...started, facts: startedFacts(started) });

/**
 * The engine, place and store a call is made over: the store `env` names, and the engine and place the test gives, each a fresh
 * stand-in where it gives none (`testEngine`, `testPlace`), so a test reaches nothing real through this helper (`test/stand-ins.ts`);
 * a boundary test that means the real ones gives them.
 */
export type Over = { readonly e?: Engine; readonly place?: Place; readonly env?: Env };

/** `entry`'s handler run on `input`, over what `over` names: its data, or its refusal thrown. */
export function handled<D extends object, I>(entry: Pick<Command<D, I>, 'handler'>, input: I, over: Over = {}): Promise<D> {
  const env = over.env ?? process.env;
  return runWith(over.e ?? engineOf(testEngine().layer), placedIn(env, over.place ?? testPlace().place, entry.handler(input)));
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

/**
 * The lines a story reads of `argv`, run as `typed` runs it: `ls`'s as the table the orchestrator draws (`lsLines`, now), `logs`'s output.
 * Any other verb is refused: read what `typed` answers. The client's own lines are held by its tests (`apps/cli/test`).
 */
export async function said(argv: readonly string[], e?: Engine, demand?: unknown, place?: Place, env?: Env): Promise<string[]> {
  return linesOf(argv, await answered(argv, e, demand, place, env));
}

/**
 * What `argv` answers, run as `typed` runs it: a `start` of a card by its card, of a workflow's name by its folder (`foldered`), with its
 * facts beside it (`factsOf`).
 */
async function answered(argv: readonly string[], e?: Engine, demand?: unknown, place?: Place, env?: Env): Promise<Data> {
  if (argv[0] !== 'start') return typed(argv, e, demand, place, env);
  const card = cardNamed(argv[1] ?? '', env ?? process.env);
  const over = { ...(e && { e }), ...(place && { place }), ...(env && { env }) };
  const started =
    card === undefined
      ? await typed(foldered(argv, env ?? process.env), e, demand, place, env)
      : await handled(START, { card, at: process.cwd(), ...cardFlags(argv.slice(2)) }, over);
  return factsOf(started as unknown as Started);
}

/** The lines of `data`, what `argv` answered: an `ls`'s (`lsLines`, now), a `logs`'s output. */
function linesOf(argv: readonly string[], data: Data): string[] {
  if (argv[0] === 'ls') return lsLines(data as unknown as RunsListed, Date.now());
  if (argv[0] === 'logs') return String(data.output ?? '').split('\n');
  throw new Invalid({ message: `${argv[0]} has no lines in a test here: read the data typed answers` });
}

/**
 * `argv` as a story typed it at `main` before the client held its verb: a verb the client holds (`objects`' `COMMAND_WORDS`) run as
 * `typed` runs it, its answer answered (a `start`'s with its `facts`) and, of an `ls` or a `logs`, its lines printed (`said`); a verb of
 * this machine on `main`. It takes what `main` takes, so a story's stage is given it as its `main`.
 */
export async function told(argv: string[], e?: Engine, demand?: unknown, place?: Place, env?: Env): Promise<Data | undefined> {
  const words = renamedIn(argv).words;
  if (!MOVED.some((name) => name.split(' ').every((word, i) => words[i] === word))) {
    await main(argv, e, demand as Parameters<typeof main>[2], place, env);
    return undefined;
  }
  const data = await answered(argv, e, demand, place, env);
  if (['ls', 'logs'].includes(argv[0] ?? '')) for (const line of linesOf(argv, data)) console.log(line);
  return data;
}

/** The names of the commands the client holds. */
const MOVED: readonly string[] = COMMAND_WORDS.map((w) => w.name);

/**
 * A `start`'s `--workflows <name>` given as the folder the api finds it in (`apps/api/src/workflows/workflows.ts`, `folderOf`): the
 * `--factory`'s tree's `workflows/<name>`, then the repository's (`--repo`, else the factory's, else where it is typed), else the
 * store's; a path, or a name in none, left as typed. A factory with one repository gives the run its `--repo`, as the api does.
 */
function foldered(argv: readonly string[], env: Env): readonly string[] {
  const at = argv.findIndex((word) => word === '--workflows');
  const name = at < 0 ? undefined : argv[at + 1];
  if (name === undefined || name.includes('/')) return argv;
  const repoAt = argv.indexOf('--repo');
  const factoryAt = argv.indexOf('--factory');
  const factory = factoryAt < 0 ? undefined : readFactoriesAt(env.WF_ROOT ?? '').find((f) => f.name === argv[factoryAt + 1]);
  const filed = factory && 'repos' in factory ? factory : undefined;
  const repos = [
    ...(filed?.tree === undefined ? [] : [filed.tree]),
    ...(repoAt < 0 ? [...(filed?.repos ?? []), '.'] : [argv[repoAt + 1] ?? '.']),
  ];
  const found = [
    ...repos.map((repo) => path.join(path.resolve(repo), 'workflows', name)),
    path.join(env.WF_ROOT ?? '', 'workflows', name),
  ].find((dir) => fs.existsSync(dir));
  const named = found === undefined ? argv : argv.map((word, i) => (i === at + 1 ? found : word));
  const [only, ...more] = filed?.repos ?? [];
  return repoAt < 0 && only !== undefined && more.length === 0 ? [...named, '--repo', only] : named;
}

/** The card of the store's inbox `given` names, by its file or its name, as the client sends a card it names; else none. */
function cardNamed(given: string, env: Env): string | undefined {
  const inbox = path.join(env.WF_ROOT ?? '', 'inbox');
  const named = !given.includes('/') && fs.existsSync(path.join(inbox, given.endsWith('.md') ? given : `${given}.md`));
  const inInbox = named ? given : path.relative(inbox, path.resolve(given));
  return inInbox.startsWith('..') || path.isAbsolute(inInbox) || inInbox === '' ? undefined : inInbox.replace(/\.md$/, '');
}

/**
 * The flags of a card's `start`, read by its words: `--brief` its `instead`, a file's text where it names one here, as the client reads
 * it.
 */
function cardFlags(rest: readonly string[]): StartInput {
  const { brief: _card, instead, ...flags } = Schema.decodeUnknownSync(StartInput)(parseArgv(START.spec, ['card', ...rest]) ?? {});
  if (instead === undefined) return flags;
  return { ...flags, instead: fs.existsSync(instead) && fs.statSync(instead).isFile() ? fs.readFileSync(instead, 'utf8') : instead };
}
