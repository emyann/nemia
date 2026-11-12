/**
 * The runners of `nemia agents custom`, `nemia factory instruct` and `nemia factory rules`, which read the words a file holds; and the
 * runner of `nemia admit`, which reads the call on stdin.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  admitted,
  AGENTS,
  AGENT_CARD,
  AGENTS_CUSTOM,
  POLICY_PROPOSE,
  FACTORY_INSTRUCT,
  FACTORY_RULES,
  FACTORY_SERVER_ADD,
  serverAddOf,
  runWith,
  type Place,
  TABLE,
  type Args,
  type Env,
  wfRoot,
} from '../runner.ts';
import { forwardedOf } from '../command/forward.verb.ts';
import { printed, answered, inputFor, placedIn, usage, type Engine } from './flags.ts';

/**
 * The words `--file` names for the command `name`: the file's text, or stdin's for `-`. Refused, naming the file, when it cannot be read.
 */
function wordsFrom(file: string, name: string): string {
  try {
    return fs.readFileSync(file === '-' ? 0 : file, 'utf8');
  } catch (err) {
    return usage(
      `nemia ${name} cannot read ${file === '-' ? 'stdin' : path.resolve(file)}: ${(err as Error).message}. Name a file that is there.`,
    );
  }
}

/** The arguments of `command` with the words its `--file` names read in (`wordsFrom`), where it names one. */
const withWords = (args: Args, command: string): Args =>
  typeof args.file === 'string' ? { ...args, words: wordsFrom(args.file, command) } : args;

/** A factory's words as `nemia factory rules` and `instruct` take them: the factory, the words `--file` names (`wordsFrom`), `--clear`. */
const factoryWords = (args: Args, command: string): { factory: string; words?: string; clear?: boolean } => ({
  factory: typeof args.factory === 'string' ? args.factory : '',
  ...(typeof args.file === 'string' ? { words: wordsFrom(args.file, command) } : {}),
  ...(args.clear === true ? { clear: true } : {}),
});

/**
 * `nemia agents`' runner: a repository the command line names, else the folder it is typed in, as `[--repo .]` says, handed to its entry's
 * handler (`AGENTS`), which reads no repository where none is given (the api's, on an install with no factory named); forwarded, the
 * repository is the api's to resolve, and none is added. What the entry says of them printed.
 */
export async function agentsRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = repoHere(env, args);
  const data = await answered(env, e, place, AGENTS, asked);
  for (const line of printed(AGENTS, data, asked)) console.log(line);
}

/**
 * The repository `nemia agents` and `nemia agents card` read: the one `--repo` names, else the folder the command is typed in; none where
 * the command line is forwarded, whose api resolves its own.
 */
function repoHere(env: Env, args: Args): { repo?: string } {
  const named = args.repo;
  return typeof named === 'string' ? { repo: named } : forwardedOf(env) === undefined ? { repo: '.' } : {};
}

/**
 * `nemia agents card`'s runner: the agent named, from the place `--from` names where it does, in the repository `repoHere` says, handed
 * to its entry's handler (`AGENT_CARD`), which reads no repository where none is given; the card printed, and its note.
 */
export async function agentsCardRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const { name, from } = args;
  if (typeof name !== 'string') return usage(`nemia agents card takes the agent's name: nemia agents card ${AGENT_CARD.usage}.`);
  const at: { from?: 'repo' | 'yours' } = from === 'repo' ? { from: 'repo' } : from === 'yours' ? { from: 'yours' } : {};
  const asked = { name, ...repoHere(env, args), ...at };
  const data = await answered(env, e, place, AGENT_CARD, asked);
  for (const line of printed(AGENT_CARD, data, asked)) console.log(line);
  for (const line of AGENT_CARD.note?.(data, asked) ?? []) console.error(line);
}

/**
 * `nemia agents custom`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler (`AGENTS_CUSTOM`) in its
 * store, and what the entry says of them printed.
 */
export async function agentsCustomRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = inputFor(AGENTS_CUSTOM, withWords(args, AGENTS_CUSTOM.name));
  const data = await answered(env, e, place, AGENTS_CUSTOM, asked);
  for (const line of printed(AGENTS_CUSTOM, data, asked)) console.log(line);
}

/**
 * `nemia factory instruct`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function factoryInstructRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = factoryWords(args, FACTORY_INSTRUCT.name);
  const data = await answered(env, e, place, FACTORY_INSTRUCT, asked);
  for (const line of printed(FACTORY_INSTRUCT, data, asked)) console.log(line);
}

/**
 * `nemia factory rules`'s runner: the words `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function factoryRulesRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = factoryWords(args, FACTORY_RULES.name);
  const data = await answered(env, e, place, FACTORY_RULES, asked);
  for (const line of printed(FACTORY_RULES, data, asked)) console.log(line);
}

/**
 * `nemia factory server add`'s runner: its flags mapped to the McpServer's write its handler takes (`serverAddOf`), handed to it, and what
 * it says printed.
 */
export async function factoryServerAddRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = serverAddOf(args);
  const data = await answered(env, e, place, FACTORY_SERVER_ADD, asked);
  for (const line of printed(FACTORY_SERVER_ADD, data, asked)) console.log(line);
}

/**
 * `nemia policy propose`'s runner: the proposal `--file` names read (`wordsFrom`), handed to its entry's handler, and what it says printed.
 */
export async function policyProposeRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const asked = inputFor(POLICY_PROPOSE, withWords(args, POLICY_PROPOSE.name));
  const data = await answered(env, e, place, POLICY_PROPOSE, asked);
  for (const line of printed(POLICY_PROPOSE, data, asked)) console.log(line);
}

/**
 * `nemia admit`'s runner: the call read on stdin, decided against the table (`admitted`) under the floor `--at-least` gives, and the answer
 * printed as JSON, or nothing.
 */
export async function admitRun(env: Env, args: Args, e: Engine, place: Place): Promise<void> {
  const home = wfRoot(env);
  const floor = typeof args.atLeast === 'string' ? (args.atLeast as Parameters<typeof admitted>[3]) : undefined;
  const auto = typeof args.auto === 'string' ? args.auto : undefined;
  const answer = await runWith(e, placedIn(env, place, admitted(home, fs.readFileSync(0, 'utf8'), TABLE, floor, auto)));
  if (answer !== undefined) console.log(JSON.stringify(answer));
}
