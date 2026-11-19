/**
 * `nemia factory volume add` and `volume rm`: a folder of the person's machine, or a git URL cloned under the store, given to a factory as
 * a volume, marked `:ro` or `:rw`, and taken back. A writable one is a git repository the factory works on, trusted as it is added unless
 * `noTrust`; a read-only one is mounted for every local step of its runs. Written into the factory's own file through the Factory door,
 * whether or not it is made from a template: a volume is the person's, never the template's.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { FACTORY_VOLUME_ADD_WORDS, FACTORY_VOLUME_RM_WORDS } from 'objects';
import type { Args } from '../../command/command.ts';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { clonesOf, FactoryDoor, filedFactory, refuseName } from '../door/factories.store.ts';
import { tried } from '../../runtime-client.ts';
import { Conflict, Invalid, Missing } from '../../refusal/refusal.ts';
import { isDirectory } from '../../record/record.store.ts';
import { factoryVolumes, folderName, workedOn, type Factory, type Volume } from '../factory.ts';
import { volumeOf, volumeRefusal, withVolume } from './volume.ts';
import { cloned } from '../clones/clones.verb.ts';
import { PlaceService } from '../../place/place.store.ts';
import { rootOf } from '../../trust/untrusted.verb.ts';
import { trustPlaces } from '../../trust/trust.verb.ts';
import { EngineService } from '../../runtime-client.ts';
import { howOf } from '../../summary/how.verb.ts';
import { runsWorkingOn } from '../../summary/summary.verb.ts';
import type { Kept } from '../../command/entry.verb.ts';
import type { PlaceTrust } from '../../trust/trust.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string) => (typeof args[key] === 'string' ? args[key] : '');

/**
 * A volume added: the factory's file written, the volume, what one of its path was marked before (`null` for none), and what was asked
 * of its trust.
 */
type Added = { file: string; volume: Volume; was: boolean | null; trusts: readonly PlaceTrust[] };

/**
 * Each writable one of `volumes` that the place answers is in no git repository, refused `Invalid` naming the read-only spelling that
 * mounts it instead: a factory works on a repository, and a folder that is none is read-only alone. A place that does not answer refuses
 * nothing here; its trust says why.
 * @param volumes The volumes given, each cloned already where it is a clone.
 * @param notDone What was not done, said last.
 */
export const writableRooted = Effect.fn('writableRooted')(function* (volumes: readonly Volume[], notDone: string) {
  const place = yield* PlaceService;
  for (const v of volumes.filter((w) => !w.readOnly)) {
    const rooted = yield* rootOf(place, v.path);
    if ('root' in rooted && rooted.root === undefined)
      return yield* Effect.fail(
        new Invalid({
          message: `${v.path} is in no git repository, and a writable volume is a repository the factory works on: give it read-only — ${v.path}:ro — or make it a repository first (git init). ${notDone}`,
        }),
      );
  }
});

/**
 * The trust of each writable one of `volumes`, as `nemia factory add` asks it (`trustPlaces`); none under `noTrust`, and none for a
 * read-only one, which no session of a step runs in.
 * @param volumes The volumes given.
 * @param noTrust Whether the person asked to leave them untrusted.
 */
export const volumesTrusted = (volumes: readonly Volume[], noTrust: boolean) =>
  noTrust ? Effect.succeed([] as PlaceTrust[]) : trustPlaces(workedOn({ volumes }));

/**
 * Why the repository `at` of the factory `factory` may not stop being worked on — taken off, or given again read-only — or undefined: the
 * wiring names it for a workflow (`wiredOn`), or a run of the factory still in play works on it (`runsWorkingOn`), each `Conflict` naming
 * what frees it: the attach that places the workflow elsewhere, or the cancel of the run, or its end. A read-only volume is no repository,
 * and none of this is asked of it.
 * @param factory The factory, as its file reads.
 * @param at The repository, by its whole path.
 * @param kept What the request keeps between reads: the informer the runs are judged through.
 * @param done What would have been done, said as not done.
 */
const workedOnStill = Effect.fn('workedOnStill')(function* (factory: Factory, at: string, kept: Kept | undefined, done: string) {
  const wired = wiredOn(factory, at);
  if (wired.length)
    return yield* Effect.fail(
      new Conflict({
        message: `${at} is the repository the factory ${factory.name}'s wiring names for ${wired.join(', ')}: place ${wired.length > 1 ? 'each' : 'it'} on another first — nemia factory attach ${factory.name} ${wired[0]} --repo <name>. Nothing was ${done}.`,
      }),
    );
  const runs = yield* runsWorkingOn(yield* EngineService, yield* howOf(kept), factory.name, at);
  if (runs.length)
    return yield* Effect.fail(
      new Conflict({
        message: `${at} is the repository ${runs.length > 1 ? 'runs' : 'the run'} ${runs.join(', ')} of the factory ${factory.name} ${runs.length > 1 ? 'work' : 'works'} on, not ended: wait for ${runs.length > 1 ? 'them' : 'it'} to end, or stop ${runs.length > 1 ? 'each' : 'it'} — ${runs.map((r) => `nemia cancel ${r}`).join(', ')} — then again. Nothing was ${done}.`,
      }),
    );
});

/**
 * `nemia factory volume add`: a folder, or a git URL cloned under the store, given to the factory, read-only (`:ro`) or writable (`:rw`), a
 * second of one path replacing the first in its place; a writable one is then trusted unless `noTrust`. Refused before anything is
 * written: a spelling with no mark or another, or a URL `cloneTarget` refuses (`volumeOf`), the default factory and a name with no
 * factory, each `Invalid`; a writable one given again read-only while it is still worked on (`workedOnStill`, `Conflict`); a folder that
 * is no directory, a writable one inside another or holding one, or one that reaches the store (`volumeRefusal`, `Invalid`); then a
 * clone the place does not make, and a writable one in no git repository.
 */
export const FACTORY_VOLUME_ADD: Served<Added> = {
  ...FACTORY_VOLUME_ADD_WORDS,
  handler: (args, kept) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      const home = yield* StoreRoot;
      const volume = volumeOf(textOf(args, 'volume'), process.cwd(), home);
      if (typeof volume === 'string') return yield* Effect.fail(new Invalid({ message: volume }));
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const over = factory.volumes.find((v) => path.resolve(v.path) === volume.path);
      if (volume.readOnly && over !== undefined && !over.readOnly) yield* workedOnStill(factory, volume.path, kept, 'changed');
      const refused = volumeRefusal(factory, volume, home, isDirectory);
      if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
      yield* cloned(clonesOf([volume]));
      yield* writableRooted([volume], 'Nothing was changed.');
      const { volumes, was } = withVolume(factory, volume);
      const file = yield* door.factories.rewrite({ ...factory, volumes });
      const trusts = yield* volumesTrusted([volume], args.noTrust === true);
      return { file, volume, was, trusts };
    });
  },
};

/**
 * The workflows `factory`'s wiring places on the repository at `at` by its folder name (`workflowRepos`), where it is the only one of
 * that name: taking it off would leave each with none.
 */
const wiredOn = (factory: Pick<Factory, 'volumes' | 'workflowRepos'>, at: string) => {
  const name = folderName(at);
  if (workedOn(factory).filter((r) => folderName(r) === name).length !== 1) return [];
  return Object.entries(factory.workflowRepos ?? {})
    .filter(([, repo]) => repo === name)
    .map(([workflow]) => workflow)
    .sort();
};

/**
 * `nemia factory volume rm`: a volume taken off a factory, by its path, or the URL it was cloned from; runs started after mount it no
 * more, and a run in flight keeps what it began with. Refused: a path it does not reach (`Missing`), and a writable one the wiring names
 * for a workflow or a run in play works on (`workedOnStill`, `Conflict`).
 */
export const FACTORY_VOLUME_RM: Served<{ file: string; removed: string }> = {
  ...FACTORY_VOLUME_RM_WORDS,
  handler: (args, kept) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const spelled = textOf(args, 'path');
      const unmarked = spelled.replace(/:(ro|rw)$/, '');
      const byOrigin = factory.volumes.find((v) => v.origin === unmarked);
      const at = path.resolve(byOrigin?.path ?? unmarked);
      const volumes = factoryVolumes(factory);
      if (!volumes.some((v) => v.path === at)) {
        const named = volumes.map((v) => v.path);
        return yield* Effect.fail(
          new Missing({
            message: `${name} reaches no volume ${at}: ${named.length ? `its volumes are ${named.join(', ')}` : 'it has none'}. Nothing was removed.`,
          }),
        );
      }
      if (volumes.some((v) => v.path === at && !v.readOnly)) yield* workedOnStill(factory, at, kept, 'removed');
      const left = factory.volumes.filter((v) => path.resolve(v.path) !== at);
      const file = yield* door.factories.rewrite({ ...factory, volumes: left });
      return { file, removed: at };
    });
  },
};

/** `nemia factory volume`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_VOLUMES: readonly Served[] = [tableEntry(FACTORY_VOLUME_ADD), tableEntry(FACTORY_VOLUME_RM)];
