/**
 * A factory's volume as a person spells it, and why one cannot be: `nemia factory volume add <factory> <path>:ro|:rw` reads the path and
 * its mark as docker compose's short syntax does (`volumeOf`), and refuses a volume no run should mount (`volumeRefusal`); and what a
 * step is filed of a run's volumes (`volumeMounts`). Pure: the command (`volume.verb.ts`) looks at the disk and hands in what it saw.
 */
import path from 'node:path';
import { factoryVolumes, type Factory, type Volume } from '../factory.ts';
import type { Mount } from '../../record/record.ts';
import { writesNothing, type Fenced } from '../../workflow/index.ts';
import { isRemoteHarness } from '../../harness/harness.ts';
import type { VolumeNameAmong } from '../../../contracts/volume-name.contract.ts';

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
 * repositories, which its runs mount already, and the one a run works on is its workspace; a writable one inside one of them or holding
 * one, which would let a step write a repository outside its worktree, the run's own included, which no run mounts; one at or inside the
 * store `storeRoot`, whose runs, cards and worktrees no step reads around its doors; and a writable one that holds the store, which would
 * let a step write them. A read-only one that holds it, a person's home say, is taken.
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
  const reached = factory.repos.map((r) => path.resolve(r)).find((r) => within(at, r) || within(r, at));
  if (!volume.readOnly && reached !== undefined)
    return `${at} ${within(at, reached) ? 'is inside' : 'holds'} ${reached}, a repository of the factory ${factory.name}, and a writable volume would let a step write it outside its worktree, where nothing commits or lands what it writes: mount it read-only — ${at}:ro — or name a step's \`writable:\` to write the repository. Nothing was changed.`;
  if (within(at, store))
    return `${at} is inside Nemia's store, ${store}, whose runs, cards and worktrees a step reaches only through its verbs: mount a folder outside it. Nothing was changed.`;
  if (!volume.readOnly && within(store, at))
    return `${at} holds Nemia's store, ${store}, and a writable volume would let a step write its runs and cards: mount it read-only — ${at}:ro — or mount a folder beside the store. Nothing was changed.`;
  return undefined;
}

/**
 * `factory`'s volumes with `volume` among them, replacing one of its path, and what that one was marked (`was`), null for a new one:
 * each with its name, the one it is named on read for one its file stores none of (`volumesNamed`), and the new one's taken among them
 * (`volumeNameAt`), so the file stores every name and none moves.
 */
export function withVolume(factory: Pick<Factory, 'volumes'>, volume: Volume): { volumes: Volume[]; was: boolean | null } {
  const volumes = factoryVolumesNamed(factory);
  const was = volumes.find((v) => v.path === volume.path)?.readOnly ?? null;
  const named = { ...volume, name: volumeNameAt(volumes, volume.path) };
  const kept = [...volumes.filter((v) => v.path !== volume.path), named];
  return { volumes: kept.sort((a, b) => a.path.localeCompare(b.path)), was };
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

/** A volume with its name: the one its file stores, or the one `volumesNamed` gives it on read. */
export type NamedVolume = Volume & { readonly name: string };

/**
 * The name a volume's folder gives it (`volumeNameAmong`'s `base`): the basename of its path as a slug, lowercase letters, digits and
 * dashes, each run of anything else one dash, none at either end; `volume` where nothing of it is left, the root's say.
 */
export const volumeBase = (at: string): string =>
  path
    .basename(path.resolve(at))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'volume';

/**
 * `volumes`, each with its name: the one its file stores, kept so a link to it stays, and for each with none, in path order, the first
 * its folder gives it that no volume before it holds (`volumeNameAmong`, among the stored names and those named before it). Answered
 * in the order given.
 */
export function volumesNamed(volumes: readonly Volume[]): NamedVolume[] {
  const taken = volumes.flatMap((v) => (v.name === undefined ? [] : [v.name]));
  const given = new Map<string, string>();
  for (const v of [...volumes].filter((v) => v.name === undefined).sort((a, b) => a.path.localeCompare(b.path))) {
    const name = volumeNameAmong(volumeBase(v.path), taken);
    taken.push(name);
    given.set(v.path, name);
  }
  return volumes.map((v) => ({ ...v, name: v.name ?? given.get(v.path) ?? volumeBase(v.path) }));
}

/**
 * The volumes of `factory` as `factoryVolumes` gives them, each with its name: the one its file stores for the first of its path, else
 * the one `volumesNamed` gives it.
 */
export function factoryVolumesNamed(factory: Pick<Factory, 'volumes'>): NamedVolume[] {
  const stored = new Map<string, string>();
  for (const v of factory.volumes ?? []) {
    const at = path.resolve(v.path);
    if (v.name !== undefined && !stored.has(at)) stored.set(at, v.name);
  }
  return volumesNamed(
    factoryVolumes(factory).map((v) => {
      const name = stored.get(v.path);
      return name === undefined ? v : { ...v, name };
    }),
  );
}

/**
 * The name a volume of `path` is stored under at `nemia factory volume add`, among `volumes`, the factory's others: its own where one of
 * that path is named already (a second add replaces it, and a link to it stays), else the first its folder gives it that none of them
 * holds, as each is named on read (`volumesNamed`), so none of theirs moves.
 */
export function volumeNameAt(volumes: readonly Volume[], at: string): string {
  const named = volumesNamed(volumes);
  const same = named.find((v) => v.path === at);
  if (same !== undefined) return same.name;
  return volumeNameAmong(
    volumeBase(at),
    named.map((v) => v.name),
  );
}

/**
 * The name of a volume with none stored, its folder's `base`, among the names other volumes of its factory hold (`taken`): `base` where
 * none holds it, else the first of `<base>-2`, `<base>-3`, … that none holds. One is free by the count of `taken`'s names, so the loop
 * ends.
 */
export const volumeNameAmong: VolumeNameAmong = (base, taken) => {
  if (!taken.includes(base)) return base;
  for (let n = 2n; ; n++) {
    const name = base + '-' + `${n}`;
    if (!taken.includes(name)) return name;
  }
};
