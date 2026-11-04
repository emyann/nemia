/**
 * A release of the system: a tag built into a folder of its own under the store's `releases/`, and `releases/current`, the pointer the
 * login service runs. What a tag may be called (`tagRefusal`), which code is running (`Running`: a checkout or an install), the refusal
 * of a checkout on a store that runs an install (`trialRefusal`), how an upgrade restarts the daemon (`restartPlan`), which release a
 * session runs on (`sessionRelease`, off the image its attempt recorded), and what `nemia version` says (`versionLines`). Pure:
 * `release.store.ts` reads and writes the folders, `upgrade.verb.ts` and `version.verb.ts`
 * are the commands.
 */
import path from 'node:path';
import type { DaemonStanding, LeaseRelease } from '../daemon/daemon.ts';

/** The pointer's name under `releases/`: never a tag. */
export const CURRENT = 'current';

/** The file a built release holds at its root, written last: what makes the folder an install. */
export const RELEASE_FILE = 'release.json';

/** The setting that lets a checkout's `nemia`, or its api, act on a store that runs an install. */
export const ON_INSTALLED = 'NEMIA_ON_INSTALLED';

/** The script of a tag's root `package.json` that an upgrade runs as the release's checks, after `npm ci` and `npm run build`. */
export const RELEASE_CHECK = 'release:check';

/** What `release.json` says of a built release: its tag, the commit it named, the repository it was built from, and when. */
export type ReleaseFile = { readonly tag: string; readonly commit: string; readonly source: string; readonly builtAt: string };

/** The code a process runs: a checkout, or an install with what its `release.json` says; `root` holds its root `package.json`. */
export type Running =
  | { readonly kind: 'checkout'; readonly root: string }
  | ({ readonly kind: 'install'; readonly root: string } & ReleaseFile);

/** The release the store's pointer names, with its folder. */
export type Current = ReleaseFile & { readonly dir: string };

/**
 * Why `tag` cannot name a release folder, or null: letters, digits, `.`, `_` and `-`, starting with a letter or a digit, and never the
 * pointer's own name, so no tag climbs out of `releases/` or hides as a dot folder.
 */
export function tagRefusal(tag: string): string | null {
  if (tag === CURRENT)
    return `nemia upgrade: ${CURRENT} is the pointer's name, not a tag: name the tag to build, like nemia upgrade v1.2.0.`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag))
    return `nemia upgrade: ${JSON.stringify(tag)} is not a tag a release folder can be named by: letters, digits, '.', '_' and '-', starting with a letter or a digit, like v1.2.0.`;
  return null;
}

/**
 * Why a process running `running` may not act on the store at `store`, or null. Refused: a checkout, on a store whose pointer names an
 * install (`current`), unless `NEMIA_ON_INSTALLED=1` is set. An install, and any code on a store with no pointer — a trial store — pass.
 */
export function trialRefusal(running: Running, current: Current | null, store: string, env: Readonly<Record<string, string | undefined>>) {
  if (running.kind === 'install' || current === null || env[ON_INSTALLED] === '1') return null;
  return (
    `nemia: this is the checkout ${running.root}, and the store ${store} runs the installed release ${current.tag} (releases/${CURRENT}). ` +
    `Develop against a trial store (WF_ROOT=<a scratch folder> nemia …), run the installed nemia (${store}/releases/${CURRENT}/node_modules/.bin/nemia), ` +
    `or set ${ON_INSTALLED}=1 to act on this store from the checkout knowingly.`
  );
}

/** How an upgrade restarts the daemon: through the service holding the store, not at all where a hand-run daemon holds it, or none. */
export type RestartPlan =
  | { readonly kind: 'service'; readonly pid: number }
  | { readonly kind: 'hand'; readonly pid: number }
  | { readonly kind: 'none' };

/**
 * How an upgrade restarts the daemon, from the lease, who holds it (`holder`, as `holderOfLease` says) and whether the service's unit runs
 * the pointer (`unitOnCurrent`). The service restarts onto the new release only where its unit names `releases/current`; any other ticking
 * daemon is named and left running, since its command line is not nemia's to repeat; with none ticking, nothing restarts.
 */
export function restartPlan(lease: DaemonStanding, holder: 'service' | 'other' | 'none', unitOnCurrent: boolean): RestartPlan {
  if (lease.kind !== 'ticking') return { kind: 'none' };
  return holder === 'service' && unitOnCurrent ? { kind: 'service', pid: lease.file.pid } : { kind: 'hand', pid: lease.file.pid };
}

/**
 * The entry and working folder a login service runs, under the pointer where the code runs from an install, so a restart follows
 * `releases/current`; a checkout's, unchanged.
 */
export function pointedEntry<E extends { checkout: string; entry: string; cwd: string }>(entry: E, running: Running): E {
  if (running.kind !== 'install' || entry.checkout !== running.root) return entry;
  const current = `${running.root.slice(0, running.root.length - running.tag.length)}${CURRENT}`;
  const under = (at: string) => `${current}${at.slice(running.root.length)}`;
  return { ...entry, checkout: current, entry: under(entry.entry), cwd: under(entry.cwd) };
}

/** A release in words: `v1.2.0 (install, abc1234) at <folder>`, or `checkout at <folder>`. */
const releaseWords = (release: LeaseRelease | Running): string =>
  release.kind === 'install'
    ? `${release.tag ?? 'an install'} (install${release.commit ? `, ${release.commit.slice(0, 7)}` : ''}) at ${release.root}`
    : `checkout at ${release.root}`;

/**
 * The release a session runs on, as its attempt recorded the code its process runs (`image`, the runtime's real folder): an install where
 * that sits under the store's real `releases/<tag>/`, a tag `tagRefusal` passes — never a build under way (`.building-…`) nor the
 * pointer, which a real path does not pass through — else a checkout, at the image. Reads no disk, so a release removed since is still
 * named.
 */
export type SessionRelease = { readonly kind: 'install'; readonly tag: string } | { readonly kind: 'checkout'; readonly root: string };

/** The harness a session runs on, by the name its task was filed with, and the version it said. */
export type SessionHarness = { readonly name: string; readonly version: string };

/** How many sessions at work run on one release and harness version: a line of `nemia version`'s `sessions`. */
export type SessionCount = { readonly release: SessionRelease | null; readonly harness: SessionHarness | null; readonly count: number };

/** The release a session whose process runs `image` runs on, `releases` the store's real releases folder (`SessionRelease`). */
export function sessionRelease(image: string, releases: string): SessionRelease {
  const under = path.relative(releases, image);
  const tag = under.split(path.sep)[0] ?? '';
  const inside = under !== '' && !under.startsWith('..') && !path.isAbsolute(under);
  return inside && tag !== '' && tagRefusal(tag) === null ? { kind: 'install', tag } : { kind: 'checkout', root: image };
}

/**
 * A session's release and harness in words, `on v1.2.0, <harness> <version>` or `on checkout, <harness> <version>`; null where neither
 * was recorded.
 */
export function ranOnWords(release: SessionRelease | null, harness: SessionHarness | null): string | null {
  const said = [
    ...(release === null ? [] : [release.kind === 'install' ? release.tag : 'checkout']),
    ...(harness === null ? [] : [`${harness.name} ${harness.version}`]),
  ];
  return said.length ? `on ${said.join(', ')}` : null;
}

/**
 * What an attempt recorded of the code it runs on, as a release and a harness: its `image` placed by `sessionRelease` under `releases`,
 * and its `harnessVersion` under the name of the harness its task was filed with; each null where the attempt recorded none.
 */
export function sessionRanOn(
  attempt: { readonly image?: string; readonly harnessVersion?: string },
  harness: string,
  releases: string,
): Pick<SessionCount, 'release' | 'harness'> {
  return {
    release: attempt.image === undefined ? null : sessionRelease(attempt.image, releases),
    harness: attempt.harnessVersion === undefined ? null : { name: harness, version: attempt.harnessVersion },
  };
}

/** The sessions at work, each its release and harness, counted by the two together: the most first, then in the order first met. */
export function sessionCounts(sessions: ReadonlyArray<Pick<SessionCount, 'release' | 'harness'>>): SessionCount[] {
  const counts = new Map<string, SessionCount>();
  for (const s of sessions) {
    const key = JSON.stringify([s.release, s.harness]);
    counts.set(key, { release: s.release, harness: s.harness, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

/**
 * What a daemon running a checkout says at `nemia up` and in `nemia version`: it makes no promise to keep a session at work on the files
 * it started on, and what does; null for an install.
 */
export function checkoutPromiseLine(release: LeaseRelease | Running): string | null {
  if (release.kind !== 'checkout') return null;
  return (
    `this daemon runs the checkout ${release.root}, which makes no promise to keep a running session on its own files: an edit there, ` +
    `or another branch checked out, reaches the sessions at work. Each still records what it runs on (nemia version); ` +
    `build a release for that promise: nemia upgrade <tag>.`
  );
}

/**
 * What `nemia version` says: the package's version, this `nemia`'s release, the store's pointer, the release the daemon runs — and, where
 * that is a checkout, that it makes no promise to keep a session on its files (`checkoutPromiseLine`) — and the sessions at work, by
 * release and harness version (`sessions`, as `sessionCounts` counts them).
 */
export function versionLines(
  version: string,
  running: Running,
  current: Current | null,
  lease: DaemonStanding,
  sessions: readonly SessionCount[],
): string[] {
  const daemon =
    lease.kind !== 'ticking'
      ? 'no daemon ticks the store'
      : lease.file.release === undefined
        ? `pid ${lease.file.pid}, from before releases were recorded`
        : `pid ${lease.file.pid}, ${releaseWords(lease.file.release)}`;
  const promise = lease.kind === 'ticking' && lease.file.release ? checkoutPromiseLine(lease.file.release) : null;
  const counted = sessions.map((s) => `${s.count} ${ranOnWords(s.release, s.harness) ?? 'not recorded'}`);
  return [
    `nemia ${version}`,
    `this nemia: ${releaseWords(running)}`,
    `current: ${current === null ? 'none — no release is installed for this store' : `${current.tag} (${current.commit.slice(0, 7)}) at ${current.dir}`}`,
    `daemon: ${daemon}`,
    ...(promise ? [promise] : []),
    `sessions: ${counted.length ? counted.join('; ') : 'none at work'}`,
  ];
}

/** The lease's record of a release: its kind and folder, and an install's tag and commit. */
export const leaseRelease = (running: Running): LeaseRelease =>
  running.kind === 'install'
    ? { kind: 'install', root: running.root, tag: running.tag, commit: running.commit }
    : { kind: 'checkout', root: running.root };
