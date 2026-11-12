/**
 * `nemia factory volume add` and `volume rm`: a folder of the person's machine given to a factory's runs as a volume, marked `:ro` or
 * `:rw`, and taken back. Written into the factory's own file through the Factory door, whether or not it is made from a template: a volume
 * is the person's, never the template's.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { FACTORY_VOLUME_ADD_WORDS, FACTORY_VOLUME_RM_WORDS } from 'objects';
import type { Args } from '../../command/command.ts';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { FactoryDoor, filedFactory, refuseName } from '../door/factories.store.ts';
import { tried } from '../../runtime-client.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { isDirectory } from '../../record/record.store.ts';
import { factoryVolumes, type Volume } from '../factory.ts';
import { volumeOf, volumeRefusal, withVolume } from './volume.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** A volume added: the factory's file written, the volume, and what one of its path was marked before (`null` for none). */
type Added = { file: string; volume: Volume; was: boolean | null };

/**
 * `nemia factory volume add`: a folder mounted for every local step of the factory's runs started after, read-only (`:ro`) or writable
 * (`:rw`), a second of one path replacing the first. Refused before anything is written: a spelling with no mark or another
 * (`volumeOf`), the default factory and a name with no factory, and a folder that is no directory, one of its repositories, or reaches
 * the store (`volumeRefusal`), each `Invalid`.
 */
export const FACTORY_VOLUME_ADD: Served<Added> = {
  ...FACTORY_VOLUME_ADD_WORDS,
  handler: (args) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      const volume = volumeOf(textOf(args, 'volume'), process.cwd());
      if (typeof volume === 'string') return yield* Effect.fail(new Invalid({ message: volume }));
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const refused = volumeRefusal(factory, volume, yield* StoreRoot, isDirectory);
      if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
      const { volumes, was } = withVolume(factory, volume);
      const file = yield* door.factories.rewrite({ ...factory, volumes });
      return { file, volume, was };
    });
  },
};

/** `nemia factory volume rm`: a volume taken off a factory, by its path; runs started after mount it no more. */
export const FACTORY_VOLUME_RM: Served<{ file: string; removed: string }> = {
  ...FACTORY_VOLUME_RM_WORDS,
  handler: (args) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const spelled = textOf(args, 'path');
      const unmarked = spelled.replace(/:(ro|rw)$/, '');
      const at = path.resolve(unmarked);
      const volumes = factoryVolumes(factory);
      if (!volumes.some((v) => v.path === at)) {
        const named = volumes.map((v) => v.path);
        return yield* Effect.fail(
          new Missing({
            message: `${name} mounts no volume ${at}: ${named.length ? `its volumes are ${named.join(', ')}` : 'it mounts none'}. Nothing was removed.`,
          }),
        );
      }
      const left = volumes.filter((v) => v.path !== at);
      const { volumes: _gone, ...rest } = factory;
      const file = yield* door.factories.rewrite(left.length ? { ...rest, volumes: left } : rest);
      return { file, removed: at };
    });
  },
};

/** `nemia factory volume`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_VOLUMES: readonly Served[] = [tableEntry(FACTORY_VOLUME_ADD), tableEntry(FACTORY_VOLUME_RM)];
