/**
 * A factory's volumes as objects (`Volume`, `VolumeList`, from `objects`), in the factory's namespace, each by the name its file keeps
 * or, for an entry written before names were, the one `factoryVolumesNamed` reads it as: its spec the path and its mark; its status
 * whether the folder is there and, where a mount of it would be refused now, why (`volumeRefusal`, the words `nemia factory volume add`
 * refuses in), and the runs in play whose record mounts the path (`mountingRuns`, judged through the informer): a run ended is not
 * among them. The default factory mounts none.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { API_VERSION, type Volume, type VolumeList } from 'objects';
import type { FactoryListing } from '../factory/factory.ts';
import type { RunPhase } from '../phase/phase.ts';
import { isDirectory as onDisk } from '../record/record.store.ts';
import { Missing, type Invalid } from '../refusal/refusal.ts';
import type { Engine } from '../runtime-client.ts';
import { mountingRuns, type MountingRun, type SummaryHow } from '../summary/summary.verb.ts';
import { factoryVolumesNamed, volumeRefusal } from '../volume/volume.ts';
import { factoryFiled, objectsListed, versionOf, type ObjectQuery } from './factory.verb.ts';

/** The phases of a run still in play: one that has not ended, and may yet run a step that mounts its volumes. */
const IN_PLAY: readonly RunPhase[] = ['pending', 'running', 'waiting'];

/** What a Volume's status is read against: the store's root, whether a path is a folder, and the runs whose records mount a volume. */
export type VolumeWorld = {
  readonly home: string;
  readonly isDirectory: (at: string) => boolean;
  readonly runs: readonly MountingRun[];
};

/** The volumes of the factory `listing` as objects, filed at `filedAt`, read against `world`. */
export const volumesOf = (listing: Exclude<FactoryListing, { error: string }>, filedAt: string, world: VolumeWorld): Volume[] =>
  factoryVolumesNamed(listing).map((v) => {
    const spec = { path: v.path, readOnly: v.readOnly };
    const refused = volumeRefusal(listing, v, world.home, world.isDirectory);
    const status: Volume['status'] = {
      present: world.isDirectory(path.resolve(v.path)),
      ...(refused === undefined ? {} : { refused }),
      runs: world.runs
        .filter((r) => IN_PLAY.includes(r.phase) && r.volumes.some((m) => path.resolve(m.path) === path.resolve(v.path)))
        .map((r) => r.id)
        .sort(),
    };
    return {
      apiVersion: API_VERSION,
      kind: 'Volume',
      metadata: { name: v.name, namespace: listing.name, creationTimestamp: filedAt, resourceVersion: versionOf(spec, status) },
      spec,
      status,
    };
  });

/** The volumes of the factory `namespace`, read now; none for the default factory; `Missing` where no factory has the name. */
const volumesNow = Effect.fn('volumesNow')(function* (
  e: Engine,
  how: SummaryHow,
  repo: string,
  namespace: string,
  isDirectory: (at: string) => boolean,
) {
  const { factory, listing } = yield* factoryFiled(how.home, repo, namespace);
  if (listing === undefined || 'error' in listing) return [];
  const runs = yield* mountingRuns(e, how);
  return volumesOf(listing, factory.metadata.creationTimestamp, { home: how.home, isDirectory, runs });
});

/** A page of the volumes of the factory `namespace` (`VolumeList`), read now. */
export const volumeList = Effect.fn('volumeList')(function* (
  e: Engine,
  how: SummaryHow,
  repo: string,
  namespace: string,
  query: ObjectQuery,
  isDirectory: (at: string) => boolean = onDisk,
) {
  const listed: VolumeList = yield* objectsListed('Volume', yield* volumesNow(e, how, repo, namespace, isDirectory), query, 'volume');
  return listed;
});

/** The volume `name` of the factory `namespace` as an object; `Missing` where it mounts none of that name. */
export const volumeObject = Effect.fn('volumeObject')(function* (
  e: Engine,
  how: SummaryHow,
  repo: string,
  namespace: string,
  name: string,
  isDirectory: (at: string) => boolean = onDisk,
) {
  const found = (yield* volumesNow(e, how, repo, namespace, isDirectory)).find((v) => v.metadata.name === name);
  if (found === undefined)
    return yield* Effect.fail<Missing | Invalid>(
      new Missing({
        message: `the factory ${namespace} mounts no volume ${name}: list them with nemia factory, or mount one with nemia factory volume add ${namespace} <path>:ro|:rw`,
      }),
    );
  return found;
});
