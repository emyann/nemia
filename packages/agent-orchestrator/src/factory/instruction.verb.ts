/**
 * A factory's instruction, what Nemia is to know of the factory and no step is told (its agents are told its rules, `nemia factory rules`),
 * its two verbs each an entry of the command table, each through the Factory door: `nemia factory instruction`, where it is kept — read
 * bare, and set or cleared in the factory's spec — and `nemia factory instruct`, the text the store keeps, written or cleared. The api's
 * Factory `instruction` and `…InstructionWords` verbs (`objects`' Api) call their handlers by their `input`.
 */
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { FACTORY_INSTRUCT_WORDS, FACTORY_INSTRUCTION_WORDS, FactoryInstructionWords } from 'objects';
import type { Served } from '../command/entry.verb.ts';
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
export const FACTORY_INSTRUCTION: Served<FactoryInstruction, InstructionInput> = {
  ...FACTORY_INSTRUCTION_WORDS,
  input: InstructionInput,
  handler: (args) => placed(args),
};

/** A factory's instruction once written or cleared, and, cleared, whether there was text to remove. */
type Instructed = FactoryInstruction & { removed?: boolean };

/**
 * `nemia factory instruct`: the instruction the store keeps for the factory `name`, written from `words` or removed with `clear`, and the
 * instruction read after. Refused, writing nothing: the default factory and the factory as `factoryInstruction` refuses it; an instruction
 * its file keeps in its first folder (`Conflict`, naming the file and the move to the store), and blank words (`Invalid`).
 */
export const FACTORY_INSTRUCT: Served<Instructed, InstructInput> = {
  ...FACTORY_INSTRUCT_WORDS,
  input: InstructInput,
  handler: (args) => instructed(args),
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
