/**
 * A factory's file written before one list, read into one list (`contracts/volumes-from-repos.contract.ts`): each repository it worked on
 * a writable volume, first and in the order it was filed, with the URL it was cloned from as its origin; each extra folder kept by its path
 * and its name, read-only. A file already in one list is answered as it is. Pure: the daemon's move at its start (`volumesMovedAt`,
 * `factory.store.ts`) and an import of an earlier release's archive each read the keys and write the answer.
 */
import type { FileVolume, FormerKeys, VolumesFromRepos } from '../../../contracts/volumes-from-repos.contract.ts';

export type { FileVolume, FormerKeys } from '../../../contracts/volumes-from-repos.contract.ts';

/** The URL `origins` holds for `at`, where it holds one of its own: a prototype's name (`constructor`) is none. */
const originOf = (origins: Readonly<Record<string, string>> | undefined, at: string): string | undefined =>
  origins !== undefined && Object.hasOwn(origins, at) ? origins[at] : undefined;

/**
 * The volumes of a factory's file: its repositories (`repos`) each a writable volume, first and in order, with its origin; then each
 * volume it held, read-only, its name kept; or, for a file with no `repos`, its volumes as they are.
 * @param file The file's `repos`, `origins` and `volumes`, as it holds them.
 */
export const volumesFromRepos: VolumesFromRepos = (file) => {
  const former = file.volumes ?? [];
  if (file.repos === undefined) return former;
  const repos: FileVolume[] = file.repos.map((r) => {
    const origin = originOf(file.origins, r);
    return origin === undefined ? { path: r, readOnly: false } : { path: r, readOnly: false, origin };
  });
  const folders: FileVolume[] = former.map((v) => ({ path: v.path, readOnly: true, name: v.name, origin: v.origin }));
  return [...repos, ...folders];
};
