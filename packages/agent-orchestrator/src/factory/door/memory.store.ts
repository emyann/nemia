/**
 * The Factory door's memory stand-in: a fresh layer of `FactoryDoor` per call, its records — the factories, their levels, servers and
 * status — in a keyspace of its own in memory (`memoryKeyspace`), the very code the rooted door has (`factoryRecords`), and the files the
 * store keeps beside each — its rules, its instruction and every other file of its folder — held in maps, built by `factoryDoorOver` as
 * the rooted door is, so the writes are checked the one way on both. A test gives it its program — `Effect.provide(program,
 * factoryDoorMemory())` — where it needs a factory to exist and nothing of the disk; the walks of `test/factory-walks.ts` hold it to
 * what the store answers. Its paths are under `MEMORY_ROOT`, named as the files name them under the store's root.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`). It renders no tree: a templated factory's wiring is
 * held in its record, as the store holds it in the tree. Its folder, read whole, is the files placed in it with its rules and
 * instruction as the maps hold them now, at the paths the store keeps them at; a folder placed sets those maps from its files.
 */
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { fromThrow } from '../../door/door.store.ts';
import { memoryKeyspace } from '../../keyspace/keyspace.store.ts';
import { Conflict, Invalid } from '../../refusal/refusal.ts';
import { DEFAULT_INSTRUCTION } from '../factory.ts';
import { factoryRulesRefusal, FACTORY_RULES_FILE } from '../rules/rules.ts';
import { FactoryDoor, factoryDoorOver, factoryLayerOf, folderKeptRefusal, instructionRead, type FactoryLayer } from './factories.store.ts';
import type { FactoryRead } from './layer.store.ts';
import { factoryRecords } from './records.store.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { folderPathRefusal, staysWithStore } from './folder.store.ts';
import { FOLDER_STAYS } from '../move/move.ts';

/** Where the stand-in says a factory's files are: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

const factoriesAt = (...parts: string[]) => path.posix.join(MEMORY_ROOT, 'factories', ...parts);

/** The rules of `rules`, by factory, each factory as `read` reads it, checked as the files check them. */
function rulesIn(rules: Map<string, string>, read: FactoryRead) {
  return {
    read: (name) =>
      Effect.map(read(name, 'There are no rules to read.'), () => ({
        file: factoriesAt(name, FACTORY_RULES_FILE),
        words: rules.get(name) ?? null,
        error: null,
      })),
    write: (name, words) =>
      Effect.gen(function* () {
        yield* read(name, 'Nothing was written.');
        const file = factoriesAt(name, FACTORY_RULES_FILE);
        if (!words.trim())
          return yield* new Invalid({
            message: `the rules of ${name} are blank. Write the words every agent hired into it is to be told, or clear them: nemia factory rules ${name} --clear. Nothing was written.`,
          });
        const refused = factoryRulesRefusal(file, words);
        if (refused !== undefined) return yield* new Invalid({ message: `${refused} Nothing was written.` });
        rules.set(name, words.trim());
        return file;
      }),
    clear: (name) => Effect.map(read(name, 'Nothing was removed.'), () => rules.delete(name)),
  } satisfies FactoryLayer['rules'];
}

/**
 * The instructions of `instructions`, by factory, each factory as `read` reads it: one kept in its first folder reads as none, since the
 * stand-in reads no disk, and takes no text the store keeps.
 */
function instructionsIn(instructions: Map<string, string>, read: FactoryRead) {
  const instructionOf = (name: string, notDone: string) =>
    Effect.flatMap(read(name, notDone), (factory) =>
      fromThrow(() =>
        instructionRead(
          factory,
          factoriesAt(name, DEFAULT_INSTRUCTION),
          (at) => ({ words: at.in === 'store' ? (instructions.get(name) ?? null) : null, error: null }),
          () => instructions.has(name),
        ),
      ),
    );
  const storeKept = (name: string, notDone: string) =>
    Effect.flatMap(instructionOf(name, notDone), (before) =>
      before.store ? Effect.succeed(before) : Effect.fail(folderKeptRefusal(name, before.file)),
    );
  return {
    read: (name) => instructionOf(name, 'There is no instruction to read.'),
    write: (name, words) =>
      Effect.gen(function* () {
        const { file } = yield* storeKept(name, 'Nothing was written.');
        if (!words.trim())
          return yield* new Invalid({
            message: `the instruction of ${name} is blank. Write the words Nemia is to know of the factory, or clear it: nemia factory instruct ${name} --clear. Nothing was written.`,
          });
        instructions.set(name, `${words.trim()}\n`);
        return file;
      }),
    clear: (name) => Effect.map(storeKept(name, 'Nothing was removed.'), () => instructions.delete(name)),
  } satisfies FactoryLayer['instruction'];
}

/** The bytes of `text` in UTF-8, as a file of a folder holds them. */
const fileOf = (path: string, text: string) => ({ path, mode: 0o644, bytes: new TextEncoder().encode(text) });

/** The text of a file of a folder. */
const textOf = (file: TreeFile) => new TextDecoder().decode(file.bytes);

/** The maps the stand-in keeps a factory's files in, by factory. */
type Kept = {
  readonly folders: Map<string, readonly TreeFile[]>;
  readonly stays: Map<string, readonly string[]>;
  readonly rules: Map<string, string>;
  readonly instructions: Map<string, string>;
};

/** Whether `path` is a file a map of `Kept` holds rather than the folder's own. */
const isMapped = (path: string) => [FACTORY_RULES_FILE, DEFAULT_INSTRUCTION].includes(path);

/** The folders of `kept`, as a layer's: read with what its maps hold, placed into them, removed from them. */
function foldersIn(kept: Kept) {
  const there = (name: string) => kept.folders.has(name) || kept.rules.has(name) || kept.instructions.has(name);
  return {
    read: (name) =>
      Effect.sync(() => {
        const rules = kept.rules.get(name);
        const instruction = kept.instructions.get(name);
        const files = [
          ...(kept.folders.get(name) ?? []).map((file) => structuredClone(file)),
          ...(rules === undefined ? [] : [fileOf(FACTORY_RULES_FILE, `${rules}\n`)]),
          ...(instruction === undefined ? [] : [fileOf(DEFAULT_INSTRUCTION, instruction)]),
        ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        return { files, stays: [...(kept.stays.get(name) ?? [])] };
      }),
    place: (name, files) =>
      Effect.gen(function* () {
        const refused = files.map((file) => folderPathRefusal(file.path)).find((why) => why !== undefined);
        if (refused !== undefined) return yield* new Invalid({ message: refused });
        if (there(name))
          return yield* new Conflict({
            message: `${factoriesAt(name)} is there already, and a factory's folder is placed only where none is. Nothing was placed.`,
          });
        const byPath = new Map(files.map((file) => [file.path, file] as const));
        kept.folders.set(name, structuredClone(files.filter((file) => !isMapped(file.path) && !staysWithStore(file.path))));
        kept.stays.set(
          name,
          FOLDER_STAYS.filter((stays) => files.some((file) => staysWithStore(file.path) && file.path.startsWith(`${stays}/`))),
        );
        const rules = byPath.get(FACTORY_RULES_FILE);
        if (rules !== undefined) kept.rules.set(name, textOf(rules).trim());
        const instruction = byPath.get(DEFAULT_INSTRUCTION);
        if (instruction !== undefined) kept.instructions.set(name, textOf(instruction));
        return factoriesAt(name);
      }),
    remove: (name) =>
      Effect.sync(() => {
        const was = there(name);
        for (const map of [kept.folders, kept.stays, kept.rules, kept.instructions]) map.delete(name);
        return was;
      }),
  } satisfies FactoryLayer['folder'];
}

/** A fresh Factory door over a keyspace in memory and maps: nothing filed, no level, rules, instruction, servers nor folder. */
export function factoryDoorMemory() {
  const records = factoryRecords(MEMORY_ROOT, memoryKeyspace());
  const rules = new Map<string, string>();
  const instructions = new Map<string, string>();
  const folders = new Map<string, readonly TreeFile[]>();
  const files = {
    rules: rulesIn(rules, records.read),
    instruction: instructionsIn(instructions, records.read),
    folder: foldersIn({ folders, stays: new Map(), rules, instructions }),
  } satisfies Pick<FactoryLayer, 'rules' | 'instruction' | 'folder'>;
  return Layer.succeed(FactoryDoor)(factoryDoorOver(factoryLayerOf(records, files)));
}
