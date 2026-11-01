/**
 * `nemia factory rules`, an entry of the command table: a factory's rules, the words told to every agent hired into it — read bare,
 * written from `--file`, removed with `--clear`. The api serves the write and the clear on the routes the table generates, and the read by
 * a route of its own, which calls the same handler. Both through the Factory door (`FactoryDoor`); `factoryRules` reads the module's root,
 * for the package's callers not yet on it.
 */
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { DEFAULT_FACTORY, defaultFactoryRefusal } from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { Effect } from 'effect';
import { Conflict, type Refusal } from '../refusal/refusal.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { readRules, rulesAt } from './rules.store.ts';

/**
 * A factory's rules as they read: its factory's `name`; `file`, the file they are kept in; `words`, null where there are none; and `error`,
 * why the file there cannot be told to a step, else null. `removed`, on a clear alone: whether there were rules to remove.
 */
export type FactoryRules = { name: string; file: string; words: string | null; error: string | null; removed?: boolean };

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * The factory `name`, for its rules to be read or written. Refused: the default factory, which keeps none (`Conflict`), and the factory
 * as `readFactory` refuses it — a name that is no slug or whose file does not read (`Invalid`), a name with no file (`Missing`).
 */
function factoryOf(name: string, notDone: string) {
  if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal('rules') });
  return readFactory(name, notDone);
}

/** The rules of the factory `name`, read afresh where they are kept (`rulesAt`). Refused: as `factoryOf` refuses the factory. */
export function factoryRules(name: string): FactoryRules {
  const file = rulesAt(factoryOf(name, 'There are no rules to read.'));
  return { name, file, ...readRules(file) };
}

/** `--file <path>`, or `-` for stdin: the words to write, read by the command line's runner. */
const FILE = {
  flag: '--file',
  kind: 'text',
  key: 'file',
  takes: '--file takes the file whose words to write, or - to read them from stdin: nemia factory rules <name> --file <path>',
  twice: 'nemia factory rules takes --file once: a factory keeps one file of rules.',
  only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
} satisfies Flag;

/** `nemia factory rules`'s spec: the factory's name, then `--file` or `--clear`; and the words, which a body alone carries. */
const SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [
    FILE,
    { flag: '--clear', kind: 'switch', key: 'clear' },
    {
      flag: '--words',
      kind: 'text',
      key: 'words',
      only: { side: 'api', why: 'the command line reads the words from --file', required: true },
    },
  ],
  unknown: (arg) => `nemia factory rules takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not ${arg}.`,
  apart: () => FILE.takes,
  missing: "nemia factory rules takes the factory's name: nemia factory rules <name> [--file <path>|- | --clear].",
};

/**
 * The rules of the factory `args` name, after they are written from their words or removed with `clear`, where they ask either. Refused,
 * writing nothing: as `FACTORY_RULES` says.
 */
function ruled(args: Args, home: string | undefined): Effect.Effect<FactoryRules, Refusal> {
  const name = textOf(args, 'factory') ?? '';
  const words = textOf(args, 'words');
  return rooted(
    home,
    'factory rules',
    Effect.gen(function* () {
      if (name === DEFAULT_FACTORY) return yield* Effect.fail(new Conflict({ message: defaultFactoryRefusal('rules') }));
      const door = yield* FactoryDoor;
      const factory = FactoryName.read(name);
      if (args.clear === true) {
        const removed = yield* door.rules.clear(factory);
        return { name, ...(yield* door.rules.read(factory)), removed };
      }
      if (words !== undefined) yield* door.rules.write(factory, words);
      return { name, ...(yield* door.rules.read(factory)) };
    }),
  );
}

/** What a write or a clear says of a run already started. */
const KEPT = 'a run already started keeps the rules it was started with';

/**
 * `nemia factory rules`: the rules of the factory `name` — read bare, written from `words`, removed with `clear` — and the rules read
 * after. Refused, writing nothing: the default factory (`Conflict`); a factory that is not there (`Missing`) or does not read; `--file`
 * with `--clear`; blank words and a frontmatter block (`Invalid`); and a templated factory whose tree is not rendered yet (`Conflict`).
 */
export const FACTORY_RULES: Command<FactoryRules> = {
  name: 'factory rules',
  usage: '<name> [--file <path>|- | --clear]',
  help: [
    "a factory's rules and policies: words told to every agent hired into",
    "it, after its custom instructions and before the step's own note,",
    'kept by the store with the factory. Bare, prints them; --file writes',
    'them (- for stdin); --clear removes them. Words only: a frontmatter',
    'block is refused. A run keeps the rules it was started with',
  ],
  spec: SPEC,
  check: (args) =>
    args.clear === true && args.file !== undefined
      ? 'nemia factory rules takes --file or --clear, not both: --file writes the rules, --clear removes them.'
      : leftOut(SPEC, args),
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--file', '--clear'] },
  route: [
    {
      method: 'GET',
      path: '/api/factories/:factory/rules',
      status: 200,
      hand: 'a read of a command that writes: the api serves it by a route of its own, which calls the same handler',
    },
    { method: 'PUT', path: '/api/factories/:factory/rules', status: 200, sets: { clear: false } },
    { method: 'DELETE', path: '/api/factories/:factory/rules', status: 200, sets: { clear: true } },
  ],
  handler: (args, _env, home) => ruled(args, home),
  print(data, args) {
    const { name } = data;
    if (data.removed !== undefined)
      return [data.removed ? `${name}: rules removed, ${data.file} — ${KEPT}` : `${name} has no rules to remove`];
    if (args.words !== undefined)
      return [`${name}: rules written to ${data.file}, told to every agent hired into it in every run started from now — ${KEPT}`];
    if (data.error !== null) return [`${name}: rules kept in ${data.file}`, `they cannot be told: ${data.error}`];
    if (data.words === null)
      return [`${name} has no rules. Write them with nemia factory rules ${name} --file <path>, or --file - for stdin.`];
    return [`${name}: rules kept in ${data.file}`, '', data.words];
  },
};
