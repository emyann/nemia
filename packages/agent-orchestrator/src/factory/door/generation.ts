/**
 * A factory's generation, Kubernetes' `metadata.generation`: the count of changes to its spec, kept on its file as `generation`
 * (`generationAfter`, proved by contracts/generation.contract.ts), and what of a factory is its spec (`specDiffers`), which the door
 * compares on each write. A file written before the counter reads as generation 1 (`generationOf`). Pure.
 */
import type { GenerationAfter } from '../../../contracts/generation.contract.ts';
import type { Factory } from '../factory.ts';
import type { FactoryLevelFile } from '../../level/level.ts';

/**
 * The generation of a factory after a write: the one it read as, 1 for a file with none, and one more where the write changed its spec.
 * @param before The generation the file read as, or null for a file with none.
 * @param specChanged Whether the write changed the factory's spec.
 */
export const generationAfter: GenerationAfter = (before, specChanged) => {
  const was = before ?? 1;
  return specChanged ? was + 1 : was;
};

/**
 * The generation `factory` reads as: its own, or 1 for a file written before the counter.
 * @param factory The factory as its file reads, by its generation.
 */
export const generationOf = (factory: Pick<Factory, 'generation'>) => factory.generation ?? 1;

/** What of a factory is its spec, the desired state its runs read: its file's keys that say what it works on and how, in one key. */
const specKey = (factory: Factory) =>
  JSON.stringify([
    factory.workflows,
    factory.hires,
    factory.volumes.map((v) => [v.path, v.readOnly, v.origin ?? null]),
    factory.harnessSettings ?? null,
    factory.costLines ?? null,
    factory.workflowRepos ?? null,
    factory.revisions ?? null,
    factory.template ?? null,
  ]);

/**
 * Whether `now` changes the spec of `was`: its workflows, hires, volumes (each by its path, its mark and its origin, in order: a name
 * given changes no mount), harness settings, cost lines, workflows' repositories, revisions policy or template. Its schedules, its
 * instruction's
 * place and its name are no part of it; its level is, and is written beside it (`factories.store.ts`).
 * @param was The factory as its file held it.
 * @param now The factory as it is to be written.
 */
export const specDiffers = (was: Factory, now: Factory) => specKey(was) !== specKey(now);

/**
 * `now` as the door writes it over `was`: its generation counted by `generationAfter`, whatever generation `now` itself carries, one more
 * where it changes the spec or `counted` says a change of it was made beside it (its level). Over a `was` that does not read, `now` as
 * it is: the write is refused before anything is written.
 * @param was The factory as its file held it, or why it does not read.
 * @param now The factory as it is to be written.
 * @param counted Whether a change of the factory's spec was made beside the write (its level); false by default.
 */
export const generationWritten = (was: Factory | { error: string }, now: Factory, counted = false) =>
  ('error' in was
    ? now
    : { ...now, generation: generationAfter(was.generation ?? null, counted || specDiffers(was, now)) }) satisfies Factory as Factory;

/**
 * Whether a factory's level file `now` changes the spec `was` held: its own default level, absent where none was written. A raise and
 * when it was written (`since`) are none of it: the spec holds the level alone (`Factory.spec.level`).
 * @param was The level file the factory held before, or undefined where none was written.
 * @param now The level file written now.
 */
export const levelDiffers = (was: FactoryLevelFile | undefined, now: FactoryLevelFile) =>
  ((was?.level ?? null) !== (now.level ?? null)) satisfies boolean as boolean;
