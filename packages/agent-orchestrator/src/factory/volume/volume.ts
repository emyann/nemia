/**
 * A factory's volume as a person spells it, and why one cannot be: `nemia factory volume add <factory> <path|url>:ro|:rw` reads the path
 * or the git URL and its mark as docker compose's short syntax does (`volumeOf`), and refuses a volume no run should mount
 * (`volumeRefusal`); and what a step is filed of a run's volumes (`volumeMounts`). Pure: the command (`volume.verb.ts`) looks at the disk
 * and hands in what it saw.
 */
import path from 'node:path';
import { factoryVolumes, workedOn, type Factory, type Volume } from '../factory.ts';
import { cloneFolder, cloneTarget } from '../clones/clones.ts';
import type { Mount } from '../../record/record.ts';
import { writesNothing, type Fenced } from '../../workflow/index.ts';
import { isRemoteHarness } from '../../harness/harness.ts';
import type { VolumeNameAmong } from '../../../contracts/volume-name.contract.ts';

/** How a volume is spelled, for a refusal that names both. */
const SPELLED = '<path|url>:ro to read it, <path|url>:rw to work on it';

/**
 * The volume `spelled` names, resolved from `cwd`: `<path|url>:ro` read-only, `<path|url>:rw` writable, the mark split off the last colon
 * so a path or an scp-like URL (`git@host:o/r.git:rw`) may hold one; a git URL is the folder its clone is kept in under the store `home`
 * (`cloneTarget`, `cloneFolder`), with the URL its `origin`; or why it names none, a string: no mark, a mark that is neither, no path, or a
 * URL `cloneTarget` refuses. The mark is required, as the runtime's mount is marked: a volume left unmarked would be writable, compose's
 * default, without anyone having said so.
 * @param spelled The volume as a person typed it, `<path|url>:ro` or `<path|url>:rw`.
 * @param cwd The folder a relative path is resolved from.
 * @param home The store's root, under whose `clones/` a URL's clone is kept.
 */
export function volumeOf(spelled: string, cwd: string, home: string) {
  const at = spelled.lastIndexOf(':');
  const mark = at < 0 ? undefined : spelled.slice(at + 1);
  const given = at < 0 ? spelled : spelled.slice(0, at);
  const readOnly = mark === 'ro' ? true : mark === 'rw' ? false : undefined;
  if (readOnly === undefined)
    return `${spelled} says no mode: a volume is marked read-only or writable, as compose marks one — ${SPELLED}. Nothing was changed.`;
  if (!given.trim()) return `${spelled} names no folder: give its path before the mark — ${SPELLED}. Nothing was changed.`;
  const target = cloneTarget(given);
  if (target.kind === 'refused') return target.message;
  if (target.kind === 'path') return { path: path.resolve(cwd, given), readOnly };
  return { path: cloneFolder(home, target.folder), readOnly, origin: given };
}

/** Whether `inner` is `outer` or a folder under it. */
const within = (inner: string, outer: string) => {
  const rel = path.relative(outer, inner);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/**
 * Why `volume` cannot be a volume of `factory`, or undefined: a path that is no directory (`isDirectory` looks), but a clone, made after
 * this judgement; a writable one inside another writable volume of the factory or holding one, which a run works on in a worktree of its
 * own and mounts read-only (a volume of its own path is replaced, and taken); and a read-only one at or inside the store `storeRoot`,
 * whose runs, cards and worktrees no step reads around its doors, but a clone the store keeps for it. A writable one is a repository a run
 * works on in a worktree, as a
 * factory's repositories always were, so the store, which keeps the clones, refuses none; a read-only one inside a repository it works
 * on, or holding the store, a person's home say, is taken. Whether a writable one is a git repository is the place's to say, at the
 * verb.
 * @param factory The factory: its name, said in a refusal, and its volumes.
 * @param volume The volume to mount: its path, whether it is read-only, and the URL it is cloned from, where it is one.
 * @param storeRoot The store's root.
 * @param isDirectory Whether a path is a folder of this machine, as the caller looked.
 */
export function volumeRefusal(
  factory: Pick<Factory, 'name' | 'volumes'>,
  volume: Volume,
  storeRoot: string,
  isDirectory: (at: string) => boolean,
) {
  const at = path.resolve(volume.path);
  const store = path.resolve(storeRoot);
  const clone = volume.origin !== undefined;
  if (!clone && !isDirectory(at))
    return `${at} is no directory: a volume is a folder of this machine, or a git URL Nemia clones. Give the path to one. Nothing was changed.`;
  const reached = workedOn(factory).find((r) => r !== at && (within(at, r) || within(r, at)));
  if (!volume.readOnly && reached !== undefined)
    return `${at} ${within(at, reached) ? 'is inside' : 'holds'} ${reached}, a repository the factory ${factory.name} works on, and a run works in one of them alone, in a worktree of its own: give it read-only — ${at}:ro — or take the other off first (nemia factory volume rm ${factory.name} ${reached}). Nothing was changed.`;
  if (volume.readOnly && !clone && within(at, store))
    return `${at} is inside Nemia's store, ${store}, whose runs, cards and worktrees a step reaches only through its verbs: mount a folder outside it. Nothing was changed.`;
  return undefined;
}

/**
 * `factory`'s volumes with `volume` among them, replacing one of its path in its place, or last for a new one, so the order its writable
 * ones were given in stays (`workedOn`), and what that one was marked (`was`), null for a new one: each with its name, the one it is named
 * on read for one its file stores none of (`volumesNamed`), and the new one's taken among them (`volumeNameAt`), so the file stores every
 * name and none moves.
 * @param factory The factory: its volumes as its file holds them.
 * @param volume The volume added: its path, whether it is read-only, and its origin where it is a clone.
 */
export function withVolume(factory: Pick<Factory, 'volumes'>, volume: Volume) {
  const at = path.resolve(volume.path);
  const volumes = volumesNamed(factory.volumes);
  const was = volumes.find((v) => path.resolve(v.path) === at)?.readOnly ?? null;
  const named = { ...volume, path: at, name: volumeNameAt(factory.volumes, at) };
  const kept = was === null ? [...volumes, named] : volumes.map((v) => (path.resolve(v.path) === at ? named : v));
  return { volumes: kept.filter((v, i) => kept.findIndex((w) => path.resolve(w.path) === path.resolve(v.path)) === i), was };
}

/**
 * The volumes `step` is filed with, of those its run mounts (`volumes`): each read-only as it was marked, and a writable one writable only
 * where the step's fence writes (`writesNothing`), since a volume widens where a step's writes reach, never what it may do. None for a
 * step on a remote agent, filed no local field. `writable:` never names one: it names a repository of the factory, by its folder's name.
 * @param step The step filed: its harness and its fence.
 * @param volumes The volumes its run mounts, or undefined where it mounts none.
 */
export const volumeMounts = (step: Fenced, volumes: readonly Mount[] | undefined) => {
  if (!volumes?.length || isRemoteHarness(step.harness)) return [];
  const unwriting = writesNothing(step);
  return volumes.map((v) => ({ path: v.path, readOnly: v.readOnly || unwriting }));
};

/** A volume with its name: the one its file stores, or the one `volumesNamed` gives it on read. */
export type NamedVolume = Volume & { readonly name: string };

/**
 * The name a volume's folder gives it (`volumeNameAmong`'s `base`): the basename of its path as a slug, lowercase letters, digits and
 * dashes, each run of anything else one dash, none at either end; `volume` where nothing of it is left, the root's say.
 * @param at The volume's path.
 */
export const volumeBase = (at: string) =>
  path
    .basename(path.resolve(at))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'volume';

/**
 * `volumes`, each with its name: the one its file stores, kept so a link to it stays, and for each with none, in path order, the first
 * its folder gives it that no volume before it holds (`volumeNameAmong`, among the stored names and those named before it). Answered
 * in the order given.
 * @param volumes The volumes, each with the name its file stores, where it stores one.
 */
export function volumesNamed(volumes: readonly Volume[]) {
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
 * the one `volumesNamed` gives it; and its origin, where the first of its path is a clone.
 * @param factory The factory: its volumes as its file holds them.
 */
export function factoryVolumesNamed(factory: Pick<Factory, 'volumes'>) {
  const stored = new Map<string, Volume>();
  for (const v of factory.volumes) {
    const at = path.resolve(v.path);
    if (!stored.has(at)) stored.set(at, v);
  }
  return volumesNamed(
    factoryVolumes(factory).map((v) => {
      const first = stored.get(v.path);
      return {
        ...v,
        ...(first?.name === undefined ? {} : { name: first.name }),
        ...(first?.origin === undefined ? {} : { origin: first.origin }),
      };
    }),
  );
}

/**
 * The name a volume of `path` is stored under at `nemia factory volume add`, among `volumes`, the factory's others: its own where one of
 * that path is named already (a second add replaces it, and a link to it stays), else the first its folder gives it that none of them
 * holds, as each is named on read (`volumesNamed`), so none of theirs moves.
 * @param volumes The factory's other volumes, each with the name its file stores, where it stores one.
 * @param at The added volume's path, resolved.
 */
export function volumeNameAt(volumes: readonly Volume[], at: string) {
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
 * @param base The name the volume's folder gives it (`volumeBase`).
 * @param taken The names the factory's other volumes hold.
 */
export const volumeNameAmong: VolumeNameAmong = (base, taken) => {
  if (!taken.includes(base)) return base;
  for (let n = 2n; ; n++) {
    const name = base + '-' + `${n}`;
    if (!taken.includes(name)) return name;
  }
};
