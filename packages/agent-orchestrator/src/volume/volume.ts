/**
 * A factory's volume as a person spells it, and why one cannot be: `nemia factory volume add <factory> <path>:ro|:rw` reads the path and
 * its mark as docker compose's short syntax does (`volumeOf`), and refuses a volume no run should mount (`volumeRefusal`); and what a
 * step is filed of a run's volumes (`volumeMounts`). Pure: the command (`volume.verb.ts`) looks at the disk and hands in what it saw.
 */
import path from 'node:path';
import { factoryVolumes, type Factory, type Volume } from '../factory/factory.ts';
import type { Mount } from '../record/record.ts';
import { writesNothing, type Fenced } from '../workflow/index.ts';
import { isRemoteHarness } from '../harness/harness.ts';

/** How a volume is spelled, for a refusal that names both. */
const SPELLED = '<path>:ro to read it, <path>:rw to write it';

/**
 * The volume `spelled` names, resolved from `cwd`: `<path>:ro` read-only, `<path>:rw` writable, the mark split off the last colon so a
 * path may hold one; or why it names none, a string: no mark, a mark that is neither, or no path. The mark is required, as the runtime's
 * mount is marked: a volume left unmarked would be writable, compose's default, without anyone having said so.
 */
export function volumeOf(spelled: string, cwd: string): Volume | string {
  const at = spelled.lastIndexOf(':');
  const mark = at < 0 ? undefined : spelled.slice(at + 1);
  const given = at < 0 ? spelled : spelled.slice(0, at);
  const readOnly = mark === 'ro' ? true : mark === 'rw' ? false : undefined;
  if (readOnly === undefined)
    return `${spelled} says no mode: a volume is marked read-only or writable, as compose marks one — ${SPELLED}. Nothing was changed.`;
  if (!given.trim()) return `${spelled} names no folder: give its path before the mark — ${SPELLED}. Nothing was changed.`;
  return { path: path.resolve(cwd, given), readOnly };
}

/** Whether `inner` is `outer` or a folder under it. */
const within = (inner: string, outer: string): boolean => {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Why `volume` cannot be a volume of `factory`, or undefined: a path that is no directory (`isDirectory` looks); one of the factory's
 * repositories, which its runs mount already, and the one a run works on is its workspace; one at or inside the store `storeRoot`, whose
 * runs, cards and worktrees no step reads around its doors; and a writable one that holds the store, which would let a step write them.
 * A read-only one that holds it, a person's home say, is taken.
 */
export function volumeRefusal(
  factory: Pick<Factory, 'name' | 'repos'>,
  volume: Volume,
  storeRoot: string,
  isDirectory: (at: string) => boolean,
): string | undefined {
  const at = path.resolve(volume.path);
  const store = path.resolve(storeRoot);
  if (!isDirectory(at)) return `${at} is no directory: a volume is a folder of this machine. Give the path to one. Nothing was changed.`;
  if (factory.repos.some((r) => path.resolve(r) === at))
    return `${at} is a repository of the factory ${factory.name}, which its runs mount already, read-only, or work on: name a step's \`writable:\` to write it. Nothing was changed.`;
  if (within(at, store))
    return `${at} is inside Nemia's store, ${store}, whose runs, cards and worktrees a step reaches only through its verbs: mount a folder outside it. Nothing was changed.`;
  if (!volume.readOnly && within(store, at))
    return `${at} holds Nemia's store, ${store}, and a writable volume would let a step write its runs and cards: mount it read-only — ${at}:ro — or mount a folder beside the store. Nothing was changed.`;
  return undefined;
}

/**
 * `factory`'s volumes with `volume` among them, replacing one of its path, and what that one was marked (`was`), null for a new one.
 */
export function withVolume(factory: Pick<Factory, 'volumes'>, volume: Volume): { volumes: Volume[]; was: boolean | null } {
  const volumes = factoryVolumes(factory);
  const was = volumes.find((v) => v.path === volume.path)?.readOnly ?? null;
  return { volumes: factoryVolumes({ volumes: [...volumes.filter((v) => v.path !== volume.path), volume] }), was };
}

/**
 * The volumes `step` is filed with, of those its run mounts (`volumes`): each read-only as it was marked, and a writable one writable only
 * where the step's fence writes (`writesNothing`), since a volume widens where a step's writes reach, never what it may do. None for a
 * step on a remote agent, filed no local field. `writable:` never names one: it names a repository of the factory, by its folder's name.
 */
export const volumeMounts = (step: Fenced, volumes: readonly Mount[] | undefined): Mount[] => {
  if (!volumes?.length || isRemoteHarness(step.harness)) return [];
  const unwriting = writesNothing(step);
  return volumes.map((v) => ({ path: v.path, readOnly: v.readOnly || unwriting }));
};
