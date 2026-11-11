/**
 * A factory's generation, Kubernetes' `metadata.generation`: the count of changes to its spec, kept on its file as `generation`
 * (`generationAfter`, proved by contracts/generation.contract.ts), and what of a factory is its spec (`specDiffers`), which the door
 * compares on each write. A file written before the counter reads as generation 1 (`generationOf`). Pure.
 */
import type { GenerationAfter } from '../../../contracts/generation.contract.ts';
import type { Factory } from '../factory.ts';
import type { FactoryLevelFile } from '../../level/level.ts';

/** The generation of a factory after a write: the one it read as, 1 for a file with none, and one more where the write changed its spec. */
export const generationAfter: GenerationAfter = (before, specChanged) => {
  const was = before ?? 1;
  return specChanged ? was + 1 : was;
};

/** The generation `factory` reads as: its own, or 1 for a file written before the counter. */
export const generationOf = (factory: Pick<Factory, 'generation'>): number => factory.generation ?? 1;

/** What of a factory is its spec, the desired state its runs read: its file's keys that say what it works on and how, in one key. */
const specKey = (factory: Factory): string =>
  JSON.stringify([
    factory.repos,
    factory.workflows,
    factory.hires,
    (factory.volumes ?? []).map((v) => [v.path, v.readOnly]),
    factory.harnessSettings ?? null,
    factory.costLines ?? null,
    factory.revisions ?? null,
    factory.template ?? null,
  ]);

/**
 * Whether `now` changes the spec of `was`: its repositories, workflows, hires, volumes (each by its path and mark: a name given changes no
 * mount), harness settings, cost lines, revisions policy or template. Its schedules, its instruction's place and its name are no part of
 * it; its level is, and is written beside it (`factories.store.ts`).
 */
export const specDiffers = (was: Factory, now: Factory): boolean => specKey(was) !== specKey(now);

/**
 * `now` as the door writes it over `was`: its generation counted by `generationAfter`, whatever generation `now` itself carries, one more
 * where it changes the spec or `counted` says a change of it was made beside it (its level). Over a `was` that does not read, `now` as
 * it is: the write is refused before anything is written.
 */
export const generationWritten = (was: Factory | { error: string }, now: Factory, counted = false): Factory =>
  'error' in was ? now : { ...now, generation: generationAfter(was.generation ?? null, counted || specDiffers(was, now)) };

/**
 * Whether a factory's level file `now` changes the spec `was` held: its own default level, absent where none was written. A raise and
 * when it was written (`since`) are none of it: the spec holds the level alone (`Factory.spec.level`).
 */
export const levelDiffers = (was: FactoryLevelFile | undefined, now: FactoryLevelFile): boolean =>
  (was?.level ?? null) !== (now.level ?? null);
