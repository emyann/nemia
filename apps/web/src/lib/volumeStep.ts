/**
 * What the welcome's volume step, "Where is the work?", shows (`volumeStepOf`, proved by `contracts/volume-step.contract.ts`), the order
 * its three ways are offered in (`VOLUME_WAYS`), whether a factory as the api reads it now holds a trusted writable volume (`heldOf`),
 * and the mode a volume is offered and added in (`modeOffered`, `addedAs`). Pure, over the factory's read, the tile the person chose, the
 * folder's answer and the write this page made: no flag of this browser moves the step on.
 */
import type { VolumeScreen, VolumeStepOf, VolumeWay } from '../../contracts/volume-step.contract.ts';

export type { NotRepository, VolumeScreen, VolumeWay } from '../../contracts/volume-step.contract.ts';

/** The three ways, in the order the step offers them: a folder of this machine, a repository by its address, a new one. */
export const VOLUME_WAYS: readonly VolumeWay[] = ['folder', 'address', 'new'];

/**
 * The screen the step shows: the trust ask, then the wait or the work in place, for a volume added here; at the welcome, done for a
 * factory that holds a trusted writable volume already; the offer to make a folder a repository, or the step held on a no; else the
 * chosen way's panel, or the three tiles for none.
 */
export const volumeStepOf: VolumeStepOf = ({ again, held, way, notRepository, added, later }): VolumeScreen => {
  if (added !== undefined) return added.trusted ? 'done' : later ? 'waiting' : 'trust';
  if (held && !again) return 'done';
  if (way === 'folder' && notRepository !== undefined) return notRepository === 'offered' ? 'init' : 'declined';
  return way ?? 'choose';
};

/**
 * Whether `factory`, as the api reads it, holds a writable volume no harness withholds its trust from.
 * @param factory The factory's volumes and the places a harness does not trust now.
 */
export const heldOf = (factory: {
  readonly volumes: readonly { readonly path: string; readonly readOnly: boolean }[];
  readonly untrusted: readonly { readonly place: string }[];
}): boolean => factory.volumes.some((v) => !v.readOnly && !factory.untrusted.some((u) => u.place === v.path));

/** The mode a volume is added in: writable, or read-only beside the writable one a factory holds. */
export type Mode = 'rw' | 'ro';

/**
 * Whether the step offers the person a mode on `screen`: opened again where the factory holds its work, on a way's panel, but a new
 * repository's, which is made in the store, and the store takes no read-only volume.
 * @param again Whether the step is opened again from Settings for a factory that holds its work.
 * @param screen The screen the step shows.
 */
export const modeOffered = (again: boolean, screen: VolumeScreen): boolean => again && screen !== 'choose' && screen !== 'new';

/**
 * The mode a volume reached by `way` is added in: a new repository writable, whatever was chosen, else `chosen`.
 * @param way The way the volume was reached.
 * @param chosen The mode the person chose, or the step's default.
 */
export const addedAs = (way: VolumeWay | undefined, chosen: Mode): Mode => (way === 'new' ? 'rw' : chosen);
