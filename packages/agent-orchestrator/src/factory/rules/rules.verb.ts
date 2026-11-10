/**
 * `nemia factory rules`, an entry of the command table: a factory's rules, the words told to every agent hired into it — read bare,
 * written from `--file`, removed with `--clear`. The api's Factory `rules`, `putRules` and `deleteRules` (`objects`' Api) call its handler
 * by its `input`. Both through the Factory door (`FactoryDoor`); `factoryRules(home, name)` reads the files
 * at the root it is handed, for the package's callers not yet on it.
 */
import { doorAtOnce, FactoryDoor } from '../door/factories.store.ts';
import { leftOut, type Flag, type Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
import { Effect, Schema } from 'effect';
import { FactoryRulesWrite } from 'objects';
import type { Refusal } from '../../refusal/refusal.ts';
import { FactoryName } from '../factory.model.ts';

/**
 * A factory's rules as they read: its factory's `name`; `file`, the file they are kept in; `words`, null where there are none; and `error`,
 * why the file there cannot be told to a step, else null. `removed`, on a clear alone: whether there were rules to remove.
 */
export type FactoryRules = { name: string; file: string; words: string | null; error: string | null; removed?: boolean };

/**
 * The rules of the factory `name` in the store `home`, read afresh where they are kept, through the Factory door at once. Refused as the
 * door refuses the read: the default factory, which keeps none (`Conflict`), a name that is no slug or whose file does not read
 * (`Invalid`), a name with no file (`Missing`).
 */
export function factoryRules(home: string, name: string): FactoryRules {
  return { name, ...doorAtOnce(home, (door) => door.rules.read(FactoryName.read(name))) };
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

/**
 * `nemia factory rules`'s spec: the factory's name, then `--file` or `--clear`; the words, which the runner reads from the file or the
 * api's handler is given, are no flag of it.
 */
const SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [FILE, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) => `nemia factory rules takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not ${arg}.`,
  apart: () => FILE.takes,
  missing: "nemia factory rules takes the factory's name: nemia factory rules <name> [--file <path>|- | --clear].",
};

/**
 * What `nemia factory rules` takes: the factory, and the words to write (`objects`' `FactoryRulesWrite`, read by the command line's runner
 * from `--file`) or `clear`; neither, a read.
 */
export const RulesInput = Schema.Struct({
  factory: Schema.String,
  words: Schema.optionalKey(FactoryRulesWrite.fields.words),
  clear: Schema.optionalKey(Schema.Boolean),
});
export type RulesInput = typeof RulesInput.Type;

/**
 * The rules of the factory `name`, after they are written from `words` or removed with `clear`, where they ask either. Refused, writing
 * nothing: as `FACTORY_RULES` says.
 */
function ruled({ factory: name, words, clear }: RulesInput): Effect.Effect<FactoryRules, Refusal> {
  return Effect.gen(function* () {
    const door = yield* FactoryDoor;
    const factory = FactoryName.read(name);
    if (clear === true) {
      const removed = yield* door.rules.clear(factory);
      return { name, ...(yield* door.rules.read(factory)), removed };
    }
    if (words !== undefined) yield* door.rules.write(factory, words);
    return { name, ...(yield* door.rules.read(factory)) };
  });
}

/** What a write or a clear says of a run already started. */
const KEPT = 'a run already started keeps the rules it was started with';

/**
 * `nemia factory rules`: the rules of the factory `name` — read bare, written from `words`, removed with `clear` — and the rules read
 * after. Refused, writing nothing: the default factory (`Conflict`); a factory that is not there (`Missing`) or does not read; `--file`
 * with `--clear`; blank words and a frontmatter block (`Invalid`); and a templated factory whose tree is not rendered yet (`Conflict`).
 */
export const FACTORY_RULES: Command<FactoryRules, RulesInput> = {
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
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `rules`, `putRules` and `deleteRules`, whose handlers call this one by its `input`",
  },
  input: RulesInput,
  handler: (args) => ruled(args),
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
