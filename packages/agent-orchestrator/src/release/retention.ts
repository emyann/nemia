/**
 * Which installed releases go: Claude Code's rule, kept by `retention` and proved by `contracts/retention.contract.ts`. Kept: the release
 * the pointer names, every release a running Nemia process or a session in flight runs on, and the two newest (`RELEASES_KEPT`); the
 * rest removed. Nothing is removed while the store has no pointer, nor while a local session in flight recorded no release, since
 * removing a release under a session would crash it. Pure: `release.store.ts` reads and removes the folders, `retention.verb.ts` sweeps.
 */
import type { ReleaseRetention } from '../../contracts/retention.contract.ts';

/** How many of the newest releases are kept whatever runs on them. */
export const RELEASES_KEPT = 2;

/** A release installed under `releases/`: its folder's name and when it was built, as its `release.json` says. */
export type Installed = { readonly tag: string; readonly builtAt: string };

/**
 * What is in use as a sweep reads it: the tag the pointer names (null with no pointer), the tags a running Nemia process or a session in
 * flight runs on, and how many local sessions in flight recorded no release.
 */
export type InUse = { readonly current: string | null; readonly pinned: readonly string[]; readonly unrecorded: number };

/** What a sweep removes, or why it removes nothing: no pointer, or a local session in flight whose release is not recorded. */
export type Retention = { readonly remove: readonly string[]; readonly held: 'no pointer' | 'unrecorded' | null };

/** The installed releases newest first: by `builtAt` descending, then by tag descending, so two built at once still order. */
export const newestFirst = (installed: readonly Installed[]): Installed[] =>
  [...installed].sort((a, b) =>
    a.builtAt === b.builtAt ? (a.tag < b.tag ? 1 : a.tag > b.tag ? -1 : 0) : a.builtAt < b.builtAt ? 1 : -1,
  );

/** The releases to remove of `installed`, given newest first, by what is in use (`Retention`). */
export const retention: ReleaseRetention = (installed, inUse) => {
  if (inUse.current === null) return { remove: [], held: 'no pointer' };
  if (inUse.unrecorded > 0) return { remove: [], held: 'unrecorded' };
  const current = inUse.current;
  const remove = installed
    .filter((r, i) => i >= RELEASES_KEPT && r.tag !== current && !inUse.pinned.includes(r.tag))
    .map((r) => r.tag);
  return { remove, held: null };
};

/** What a sweep says: each release removed, and why it held, naming what it waits on. */
export function retentionLines(answer: Retention, unrecorded: number): string[] {
  if (answer.held === 'no pointer') return [];
  if (answer.held === 'unrecorded')
    return [
      `no release removed: ${unrecorded} local session${unrecorded === 1 ? '' : 's'} in flight recorded no release, so any release may be under ${unrecorded === 1 ? 'it' : 'them'}; ` +
        'removal waits until they end (nemia version counts them as not recorded).',
    ];
  return answer.remove.map((tag) => `removed the release ${tag}: not current, not among the ${RELEASES_KEPT} newest, and nothing runs on it`);
}
