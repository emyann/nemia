/**
 * The shape of the Factory door's layer: what the door is over, whether the records of the keyspace and the files beside them
 * (`factories.store.ts`) or the memory stand-in (`memory.store.ts`). Types only.
 */
import type { Effect } from 'effect';
import type { Refusal } from '../../refusal/refusal.ts';
import type { Factory, FactoryListing } from '../factory.ts';
import type { FactoryName, FactoryRecord } from '../factory.model.ts';
import type { VolumesMoved } from '../factory.store.ts';
import type { TreeFile } from '../../archive/archive.ts';
import type { FolderRead } from './folder.store.ts';
import type { FactoryLevelFile } from '../../level/level.ts';
import type { RulesRead } from '../rules/rules.store.ts';
import type { FactoryServers } from '../servers/index.ts';
import type { FactoryInstruction } from '../instruction.store.ts';
import type { Status } from '../applied/applied.store.ts';

/**
 * A layer of the Factory door: the factories filed (listed by name, listed as each reads with its record — or why its record does not
 * read, so one bad record hides no other — read, filed, written back, removed, each write answering the key it wrote, and the records an
 * earlier release wrote moved once into one list of volumes, answering each moved and each left with why), a factory's level (none where
 * it follows the store's), its rules (a read's file, its words or why they do not read; a write's file; whether a clear found any), its
 * instruction (where it is kept and its words; the text the store keeps written, answering its file, or cleared, answering whether there
 * was any), its servers (none where it has none), what the controller last observed of it (`status`: none where it wrote none; a write
 * answering whether it changed what was there), and its own folder as a whole (its files, by path from it, sorted, but those that stay
 * with the store, which it names; placed where none is, answering the folder, `Conflict` where one is; removed with its level, servers and
 * status, answering whether there was any). A layer knows no default factory: the door answers it before a layer is asked.
 */
export type FactoryLayer = {
  readonly factories: {
    readonly list: () => Effect.Effect<readonly string[], Refusal>;
    readonly listed: () => Effect.Effect<readonly FactoryListing[], Refusal>;
    readonly read: (name: FactoryName) => Effect.Effect<Factory, Refusal>;
    readonly create: (factory: Factory) => Effect.Effect<string, Refusal>;
    readonly rewrite: (factory: Factory) => Effect.Effect<string, Refusal>;
    readonly remove: (name: FactoryName) => Effect.Effect<string, Refusal>;
    readonly moveVolumes: () => Effect.Effect<VolumesMoved, Refusal>;
  };
  readonly level: {
    readonly read: (name: FactoryName) => Effect.Effect<FactoryLevelFile | undefined, Refusal>;
    readonly write: (name: FactoryName, level: FactoryLevelFile) => Effect.Effect<void, Refusal>;
  };
  readonly rules: {
    readonly read: (name: FactoryName) => Effect.Effect<RulesRead & { readonly file: string }, Refusal>;
    readonly write: (name: FactoryName, words: string) => Effect.Effect<string, Refusal>;
    readonly clear: (name: FactoryName) => Effect.Effect<boolean, Refusal>;
  };
  readonly instruction: {
    readonly read: (name: FactoryName) => Effect.Effect<FactoryInstruction, Refusal>;
    readonly write: (name: FactoryName, words: string) => Effect.Effect<string, Refusal>;
    readonly clear: (name: FactoryName) => Effect.Effect<boolean, Refusal>;
  };
  readonly servers: {
    readonly read: (name: FactoryName) => Effect.Effect<FactoryServers, Refusal>;
    readonly write: (name: FactoryName, servers: FactoryServers) => Effect.Effect<void, Refusal>;
  };
  readonly status: {
    readonly read: (name: FactoryName) => Effect.Effect<Status | undefined, Refusal>;
    readonly write: (name: FactoryName, status: Status) => Effect.Effect<boolean, Refusal>;
  };
  readonly folder: {
    readonly read: (name: FactoryName) => Effect.Effect<FolderRead, Refusal>;
    readonly place: (name: FactoryName, files: readonly TreeFile[]) => Effect.Effect<string, Refusal>;
    readonly remove: (name: FactoryName) => Effect.Effect<boolean, Refusal>;
  };
};

/**
 * The Factory door's shape: each method of `FactoryLayer` answering an Effect, a factory's name taken as `FactoryName`; a factory read
 * answers its record (`FactoryRecord`), the default factory's among them.
 */
export type FactoryDoorShape = Omit<FactoryLayer, 'factories'> & {
  readonly factories: Omit<FactoryLayer['factories'], 'read'> & {
    readonly read: (name: FactoryName) => Effect.Effect<FactoryRecord, Refusal>;
  };
};

/** The reads a layer's files half takes of its records: a factory as a start reads it, refused as a read refuses it with `notDone` said. */
export type FactoryRead = (name: string, notDone: string) => Effect.Effect<Factory, Refusal>;
