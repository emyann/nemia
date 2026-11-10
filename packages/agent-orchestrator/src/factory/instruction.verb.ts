/**
 * A factory's instruction, what Nemia is to know of the factory and no step is told (its agents are told its rules, `nemia factory rules`),
 * its two verbs each an entry of the command table: `nemia factory instruction`, where it is kept — read bare, and set or cleared in the
 * factory's file — and `nemia factory instruct`, the text the store keeps, written or cleared. The api's Factory `instruction` and
 * `…InstructionWords` verbs (`objects`' Api) call their handlers by their `input`.
 */
import { Schema } from 'effect';
import { FactoryInstructionWords } from 'objects';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { DEFAULT_FACTORY, defaultFactoryRefusal, instructionAt, type FactoryWrite, type InstructionAt } from './factory.ts';
import { readFactory, setInstruction } from './factory.store.ts';
import { clearInstructionText, instructionFile, readInstructionAt, storeKeeps, writeInstructionText } from './instruction.store.ts';
import { Conflict } from '../refusal/refusal.ts';
import { tried } from '../runtime-client.ts';

/**
 * A factory's instruction as it reads: its factory's `name`; `path`, the path in its first folder its file names, null where it names
 * none (`NEMIA.md`) or keeps it in the store; `store`, whether it is kept in the store; `file`, the file it is read from; `words`, null
 * where there is no file; `error`, why a file there does not read, else null; and `stored`, whether the store keeps text for it, read or
 * not.
 */
export type FactoryInstruction = {
  name: string;
  path: string | null;
  store: boolean;
  file: string;
  words: string | null;
  error: string | null;
  stored: boolean;
};

/** A factory's name a verb of its instruction is given, refused when it is the default factory, which keeps none (`Conflict`). */
function refuseDefault(name: string, verb: FactoryWrite): void {
  if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal(verb) });
}

/**
 * The instruction of the factory `name`, read afresh where its file says it is kept (`instructionAt`). Refused: the default factory
 * (`Conflict`), and the factory as `readFactory` refuses it — a name that is no slug or whose file does not read (`Invalid`), a name
 * with no file (`Missing`).
 */
export function factoryInstruction(name: string): FactoryInstruction {
  refuseDefault(name, 'instruction');
  const factory = readFactory(name, 'There is no instruction to read.');
  const at = instructionAt(factory, instructionFile(name));
  const read = readInstructionAt(at);
  return {
    name,
    path: at.in === 'folder' && factory.instruction !== undefined ? at.path : null,
    store: at.in === 'store',
    file: at.file,
    ...read,
    stored: storeKeeps(name, factory.tree === undefined ? undefined : at.file),
  };
}

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
 * The instruction of the factory `args` name, after its place is set as they ask (`placeAsked`), if they ask one, in its file
 * (`setInstruction`). Refused, writing nothing: as `FACTORY_INSTRUCTION` says.
 */
function placed(args: InstructionInput): FactoryInstruction {
  const name = args.factory;
  refuseDefault(name, 'instruction');
  const asked = placeAsked(args);
  if (asked !== undefined) setInstruction({ factory: name, at: asked.at });
  return factoryInstruction(name);
}

/**
 * `nemia factory instruction`: where the instruction of the factory `name` is kept — read bare; set to a path in its first folder
 * (`--path`) or to the store (`--store`), or cleared back to `NEMIA.md` in its first folder (`--clear`), in its file (`setInstruction`) —
 * and the instruction read there after. Refused, writing nothing: the default factory, two places at once, a path that is not one, and a
 * factory that is not there or does not read.
 */
export const FACTORY_INSTRUCTION: Command<FactoryInstruction, InstructionInput> = {
  name: 'factory instruction',
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
  handler: (args) => tried(() => placed(args)),
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
  handler: (args) => tried(() => instructed(args)),
  print(data) {
    if (data.removed !== undefined)
      return [data.removed ? `${data.name}: instruction removed, ${data.file}` : `${data.name} has no instruction in the store to remove`];
    return [`${data.name}: instruction written to ${data.file}`];
  },
};

/**
 * The instruction of the factory `args` name, after its text in the store is written from their words or removed with `clear`. Refused,
 * writing nothing: as `FACTORY_INSTRUCT` says.
 */
function instructed({ factory: name, words, clear }: InstructInput): Instructed {
  refuseDefault(name, 'instruct');
  const before = factoryInstruction(name);
  if (!before.store)
    throw new Conflict({
      message: `${name}'s instruction is read from ${before.file}, in the factory's first folder, and the store writes no file there: edit it in the folder, or keep it in the store first — nemia factory instruction ${name} --store. Nothing was written.`,
    });
  if (clear === true) {
    const removed = clearInstructionText(name, before.file);
    return { ...factoryInstruction(name), removed };
  }
  writeInstructionText(name, words ?? '', before.file);
  return factoryInstruction(name);
}
