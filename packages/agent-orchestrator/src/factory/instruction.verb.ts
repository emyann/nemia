/**
 * A factory's instruction, what Nemia is to know of the factory and no step is told (its agents are told its rules, `nemia factory rules`),
 * its two verbs each an entry of the command table, each through the Factory door: `nemia factory instruction`, where it is kept — read
 * bare, and set or cleared in the factory's spec — and `nemia factory instruct`, the text the store keeps, written or cleared. The api's
 * Factory `instruction` and `…InstructionWords` verbs (`objects`' Api) call their handlers by their `input`.
 */
import { givesNone, renamed } from '../command/requests.verb.ts';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { FactoryInstructionWords } from 'objects';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { defaultFactoryRefusal, DEFAULT_INSTRUCTION, instructionPathRefusal, type InstructionAt } from './factory.ts';
import type { FactoryInstruction } from './instruction.store.ts';
import { doorAtOnce, FactoryDoor, filedFactory } from './door/factories.store.ts';
import { FactoryName } from './factory.model.ts';
import { Conflict, Invalid, type Refusal } from '../refusal/refusal.ts';
import { DEFAULT_NAMESPACE } from 'objects';

export type { FactoryInstruction };

/**
 * The instruction of the factory `name` in the store `home`, read afresh where its file says it is kept (`instructionAt`), through the
 * Factory door at once: the plain spelling the package's entry exports, for a caller that is no program. Refused as the door refuses its
 * read.
 */
export function factoryInstruction(home: string, name: string): FactoryInstruction {
  if (name === DEFAULT_NAMESPACE) throw new Conflict({ message: defaultFactoryRefusal('instruction') });
  return doorAtOnce(home, (door) => door.instruction.read(FactoryName.read(name)));
}

/** The instruction of the factory `name`, read through the Factory door. */
const instructionNow = (name: string): Effect.Effect<FactoryInstruction, Refusal> =>
  Effect.gen(function* () {
    return yield* (yield* FactoryDoor).instruction.read(FactoryName.read(name));
  });

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `--path <p>`: the file in the factory's first folder its instruction is read from. */
const PATH = {
  flag: '--path',
  kind: 'text',
  key: 'path',
  takes: "--path takes a file's path from the factory's first folder: nemia factory instruction <name> --path docs/NEMIA.md",
  twice: 'nemia factory instruction takes --path once: a factory reads one instruction.',
} satisfies Flag;

/** `nemia factory instruction`'s spec: the factory's name, then `--path`, `--store` or `--clear`. */
const INSTRUCTION_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [PATH, { flag: '--store', kind: 'switch', key: 'store' }, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) =>
    `nemia factory instruction takes one factory's name, then --path <path>, --store or --clear, not ${arg}: nemia factory instruction <name> [--path <path> | --store | --clear].`,
  apart: () => PATH.takes,
  missing: "nemia factory instruction takes the factory's name: nemia factory instruction <name> [--path <path> | --store | --clear].",
};

/**
 * What `nemia factory instruction` takes: the factory, and where to keep its instruction — a path in its first folder, the store, or
 * `clear` — or none of them, a read.
 */
export const InstructionInput = Schema.Struct({
  factory: Schema.String,
  path: Schema.optionalKey(Schema.String),
  store: Schema.optionalKey(Schema.Boolean),
  clear: Schema.optionalKey(Schema.Boolean),
});
export type InstructionInput = typeof InstructionInput.Type;

/**
 * What `nemia factory instruct` takes: the factory, and the words the store keeps (`objects`' `FactoryInstructionWords`, read by the
 * command line's runner from `--file`) or `clear`.
 */
export const InstructInput = Schema.Struct({
  factory: Schema.String,
  words: Schema.optionalKey(FactoryInstructionWords.fields.words),
  clear: Schema.optionalKey(Schema.Boolean),
});
export type InstructInput = typeof InstructInput.Type;

/** Where `asked` says to keep the instruction: a path, the store, or none, the key cleared; nothing where it says none of them. */
function placeAsked({ clear, store, path }: InstructionInput): { at: InstructionAt | undefined } | undefined {
  if (clear === true) return { at: undefined };
  if (store === true) return { at: { store: true } };
  return path === undefined ? undefined : { at: { path } };
}

/**
 * Why `nemia factory instruction`'s arguments are refused before anything is read, or null: two of `--path`, `--store` and `--clear` given,
 * and a put the api routes (`clear` fixed false) that names neither a path nor the store.
 */
function instructionCheck(args: Args): string | null {
  const given = [textOf(args, 'path') !== undefined, args.store === true, args.clear === true].filter(Boolean).length;
  if (given > 1)
    return 'nemia factory instruction takes one of --path, --store and --clear: a factory keeps its instruction in one place. Nothing was changed.';
  if (args.clear === false && given === 0)
    return 'a factory\'s instruction is put in one place: `{ "path": "<path in its first folder>" }`, or `{ "store": true }`. Nothing was changed.';
  return leftOut(INSTRUCTION_SPEC, args);
}

/** Where a factory's instruction is kept, in a person's words: the file read, and whether it is the store's. */
const keptLine = (data: FactoryInstruction): string =>
  data.store ? `kept in the store: ${data.file}` : `read from ${data.file}, in the factory's first folder`;

/** What `nemia factory instruction` and `instruct` print of a read: where it is kept, then the words, or why there are none. */
function readLines(data: FactoryInstruction): string[] {
  const where = `${data.name}: ${keptLine(data)}`;
  if (data.error !== null) return [where, `it does not read: ${data.error}`];
  if (data.words === null)
    return [
      where,
      data.store
        ? `no instruction there yet: write one with nemia factory instruct ${data.name} --file <path>`
        : 'no file there yet: write it in the folder, or keep the instruction in the store',
    ];
  return [where, '', data.words];
}

/**
 * The factory `name`'s spec with its instruction kept at `at`, a path kept as `path.normalize` spells it, or, `at` undefined, the key
 * removed, so it reads `NEMIA.md` in its first folder again; written back through the door. Refused before anything is written: a path
 * that is not one (`instructionPathRefusal`, `Invalid`), the factory (`filedFactory`), and one made from a template, whose instruction
 * is its tree's (`Invalid`).
 */
const instructionPlaced = (name: string, at: InstructionAt | undefined): Effect.Effect<string, Refusal> =>
  Effect.gen(function* () {
    if (at !== undefined && 'path' in at) {
      const bad = instructionPathRefusal(at.path);
      if (bad) return yield* Effect.fail(new Invalid({ message: `${bad} Nothing was changed.` }));
    }
    const factory = yield* filedFactory(name, 'instruction');
    if (factory.tree !== undefined)
      return yield* Effect.fail(
        new Invalid({
          message: `${name} is made from a template, and its instruction is its tree's NEMIA.md, at ${path.join(factory.tree, DEFAULT_INSTRUCTION)}: write it with nemia factory instruct ${name} --file <path>. Nothing was changed.`,
        }),
      );
    const { instruction: _was, ...rest } = factory;
    const kept = at === undefined ? undefined : 'path' in at ? { path: path.normalize(at.path) } : { store: true as const };
    return yield* (yield* FactoryDoor).factories.rewrite(kept === undefined ? rest : { ...rest, instruction: kept });
  });

/**
 * The instruction of the factory `args` name, after its place is set as they ask (`placeAsked`), if they ask one, in its spec
 * (`instructionPlaced`). Refused, writing nothing: as `FACTORY_INSTRUCTION` says.
 */
const placed = (args: InstructionInput): Effect.Effect<FactoryInstruction, Refusal> =>
  Effect.gen(function* () {
    const name = args.factory;
    const asked = placeAsked(args);
    if (asked !== undefined) yield* instructionPlaced(name, asked.at);
    return yield* instructionNow(name);
  });

/**
 * `nemia factory instruction`: where the instruction of the factory `name` is kept — read bare; set to a path in its first folder
 * (`--path`) or to the store (`--store`), or cleared back to `NEMIA.md` in its first folder (`--clear`), in its file (`setInstruction`) —
 * and the instruction read there after. Refused, writing nothing: the default factory, two places at once, a path that is not one, and a
 * factory that is not there or does not read.
 */
export const FACTORY_INSTRUCTION: Command<FactoryInstruction, InstructionInput> = {
  name: 'factory instruction',
  served: [
    {
      endpoint: 'factories.instruction',
      takes: givesNone('path', 'store', 'clear'),
      request: renamed({ factory: 'name' }, ['path', 'store', 'clear']),
    },
    {
      endpoint: 'factories.putInstruction',
      as: 'factory_instruction_put',
      takes: givesNone('clear'),
      request: renamed({ factory: 'name' }, ['clear']),
    },
    {
      endpoint: 'factories.deleteInstruction',
      as: 'factory_instruction_delete',
      request: renamed({ factory: 'name' }, ['path', 'store', 'clear']),
    },
  ],
  usage: '<name> [--path <path> | --store | --clear]',
  help: [
    "where a factory's instruction is kept, what Nemia is to know of the",
    'factory (its agents are told its rules: nemia factory rules): bare,',
    "prints it; --path reads it from a file in the factory's first folder,",
    '--store keeps it in the store, --clear reads NEMIA.md in the first',
    'folder again',
  ],
  spec: INSTRUCTION_SPEC,
  check: instructionCheck,
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--path', '--store', '--clear'] },
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `instruction`, `putInstruction` and `deleteInstruction`, whose handlers call this one by its `input`",
  },
  input: InstructionInput,
  handler: (args) => placed(args),
  print(data, args) {
    const asked = placeAsked(args);
    return asked === undefined ? readLines(data) : [`${data.name}: instruction ${keptLine(data)}`];
  },
};

/** `--file <path>`, or `-` for stdin: the words to write, read by the command line's runner. */
const FILE = {
  flag: '--file',
  kind: 'text',
  key: 'file',
  takes: '--file takes the file whose words to write, or - to read them from stdin: nemia factory instruct <name> --file <path>',
  twice: 'nemia factory instruct takes --file once: a factory keeps one instruction.',
  only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
} satisfies Flag;

/**
 * `nemia factory instruct`'s spec: the factory's name, then `--file` or `--clear`; the words, which the runner reads from the file or the
 * api's handler is given, are no flag of it.
 */
const INSTRUCT_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [FILE, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) => `nemia factory instruct takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not ${arg}.`,
  apart: () => FILE.takes,
  missing: "nemia factory instruct takes the factory's name: nemia factory instruct <name> --file <path>|- or --clear.",
};

/** A factory's instruction once written or cleared, and, cleared, whether there was text to remove. */
type Instructed = FactoryInstruction & { removed?: boolean };

/**
 * `nemia factory instruct`: the instruction the store keeps for the factory `name`, written from `words` or removed with `clear`, and the
 * instruction read after. Refused, writing nothing: the default factory and the factory as `factoryInstruction` refuses it; an instruction
 * its file keeps in its first folder (`Conflict`, naming the file and the move to the store), and blank words (`Invalid`).
 */
export const FACTORY_INSTRUCT: Command<Instructed, InstructInput> = {
  name: 'factory instruct',
  served: [
    { endpoint: 'factories.putInstructionWords', takes: givesNone('clear'), request: renamed({ factory: 'name' }, ['clear']) },
    {
      endpoint: 'factories.deleteInstructionWords',
      as: 'factory_instruct_delete',
      request: renamed({ factory: 'name' }, ['words', 'clear']),
    },
  ],
  usage: '<name> --file <path>|- | --clear',
  help: [
    'write the instruction the store keeps for a factory (- for stdin), what',
    'Nemia is to know of it and no step is told, or remove it with --clear',
  ],
  spec: INSTRUCT_SPEC,
  check: (args) => {
    if (args.clear === true && args.file !== undefined)
      return 'nemia factory instruct takes --file or --clear, not both: --file writes the instruction, --clear removes it.';
    if (args.clear === undefined && args.file === undefined && args.words === undefined)
      return 'nemia factory instruct writes the instruction from --file <path> (or --file - for stdin), or removes it with --clear.';
    return leftOut(INSTRUCT_SPEC, args);
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `putInstructionWords` and `deleteInstructionWords`, whose handlers call this one by its `input`",
  },
  input: InstructInput,
  handler: (args) => instructed(args),
  print(data) {
    if (data.removed !== undefined)
      return [data.removed ? `${data.name}: instruction removed, ${data.file}` : `${data.name} has no instruction in the store to remove`];
    return [`${data.name}: instruction written to ${data.file}`];
  },
};

/**
 * The instruction of the factory `args` name, after its text in the store is written from their words or removed with `clear`, through
 * the Factory door. Refused, writing nothing: as `FACTORY_INSTRUCT` says.
 */
export const instructed = ({ factory: name, words, clear }: InstructInput): Effect.Effect<Instructed, Refusal> =>
  Effect.gen(function* () {
    const door = (yield* FactoryDoor).instruction;
    const factory = FactoryName.read(name);
    if (clear === true) {
      const removed = yield* door.clear(factory);
      return { ...(yield* door.read(factory)), removed };
    }
    yield* door.write(factory, words ?? '');
    return yield* door.read(factory);
  });
