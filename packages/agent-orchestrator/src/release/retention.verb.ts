/**
 * The retention of releases: an installed release no one needs is removed with no person's act (`retainOnce`, one sweep; `retain`, the
 * loop the daemon forks; `nemia upgrade` runs one sweep after its restart). Which go is `retention`'s rule (`retention.ts`); this reads
 * what it is given afresh on every sweep — the pointer, the folders, the engine's attempts in flight, the releases the running Nemia
 * processes run on — and carries nothing a restart must not lose: a sweep stopped mid-removal is finished by the next.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, type Duration } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { LeaseRelease } from '../daemon/daemon.ts';
import { firstPiece } from '../piece/piece.ts';
import { asked, EngineService } from '../runtime-client.ts';
import { sessionRelease, type Running } from './release.ts';
import { currentRelease, installedReleases, leftRemovals, realReleasesDir, removeRelease } from './release.store.ts';
import { newestFirst, retention, retentionLines, type Retention } from './retention.ts';
import { inFlight } from './version.verb.ts';

/** The daemon's pace of sweeps: a release is freed within this of its last session ending. */
export const RETAIN_EVERY: Duration.Input = '5 minutes';

/** A Nemia process's release, as the lease records it or as the process finds its own (`runningRelease`). */
export type ProcessRelease = LeaseRelease | Running;

/** What one daemon's sweeps remember, to say a held reason once while its words stand, and never to decide. Lost at a restart. */
export type RetainMemory = { said: string | undefined };

/** What a daemon's sweeps remember when it starts: nothing. */
export const freshRetainMemory = (): RetainMemory => ({ said: undefined });

/** What one sweep did: the releases it removed, why it held, and its lines. */
export type Retained = { readonly removed: readonly string[]; readonly held: Retention['held']; readonly lines: readonly string[] };

/**
 * The tag a process's release pins: an install's own tag, or for one recorded without it, the tag its real folder sits under in the
 * store's `releases/`, as a session's image is placed (`sessionRelease`); a checkout pins none.
 */
export function pinnedBy(release: ProcessRelease, home: string): string[] {
  if (release.kind !== 'install') return [];
  if (release.tag !== undefined) return [release.tag];
  let real: string;
  try {
    real = fs.realpathSync(release.root);
  } catch {
    return [];
  }
  const placed = sessionRelease(real, realReleasesDir(home));
  return placed.kind === 'install' ? [placed.tag] : [];
}

/** Deletes a folder moved aside, off the event loop. */
const deleted = (dir: string) =>
  Effect.tryPromise({
    try: () => fs.promises.rm(dir, { recursive: true, force: true }),
    catch: (err) => new Error(`could not delete ${dir}: ${err instanceof Error ? err.message : String(err)}; the next sweep tries again`),
  });

/**
 * One sweep over the store at `home`, `processes` the releases the running Nemia processes run on:
 *
 * - each release a sweep moved aside and did not delete is deleted;
 * - with no pointer — a store that runs no install, every test daemon's — it stops there, asking the engine nothing;
 * - else the engine's attempts in flight are read (`inFlight`): a local one pins the release its image sits under, or, having recorded
 *   none, holds every removal; a remote agent's (`a2a:`) runs on no release here;
 * - `retention` says which go, and each is moved aside by `removeRelease`, which refuses while a build is under way or the pointer has
 *   moved onto it since, then deleted.
 *
 * Each release removed is said at Info, and a held reason at Warning, once while its words stand (`memory`).
 */
export const retainOnce = Effect.fn('retainOnce')(function* (
  home: string,
  processes: readonly ProcessRelease[],
  memory: RetainMemory = freshRetainMemory(),
) {
  for (const dir of leftRemovals(home)) yield* deleted(dir);
  const current = currentRelease(home);
  if (current === null) return { removed: [], held: 'no pointer', lines: [] } satisfies Retained;
  const installed = newestFirst(installedReleases(home));
  const e = yield* EngineService;
  const listed = yield* asked('retain', e.list());
  const flying = inFlight(listed.views).filter((s) => !s.remote);
  const releases = realReleasesDir(home);
  const sessions = flying.flatMap((s) => {
    if (s.attempt.image === undefined) return [];
    const placed = sessionRelease(s.attempt.image, releases);
    return placed.kind === 'install' ? [placed.tag] : [];
  });
  const unrecorded = flying.filter((s) => s.attempt.image === undefined).length;
  const pinned = [...processes.flatMap((p) => pinnedBy(p, home)), ...sessions];
  const answer = retention(installed, { current: path.basename(current.dir), pinned, unrecorded });
  const removed: string[] = [];
  for (const tag of answer.remove) {
    const aside = removeRelease(home, tag);
    if (aside === false) continue;
    yield* deleted(aside);
    removed.push(tag);
  }
  const lines = retentionLines({ remove: removed, held: answer.held }, unrecorded);
  if (answer.held === null) {
    memory.said = undefined;
    for (const line of lines) yield* Effect.logInfo(line);
  } else if (lines[0] !== memory.said) {
    memory.said = lines[0];
    for (const line of lines) yield* Effect.logWarning(line);
  }
  yield* Effect.annotateCurrentSpan({ installed: installed.length, removed: removed.length, unrecorded });
  return { removed, held: answer.held, lines } satisfies Retained;
});

/**
 * The retention, for as long as the daemon runs: a sweep (`retainOnce`) of the store `StoreRoot` names, then a rest of `RETAIN_EVERY`.
 * A sweep that fails is a warning, said once while its words stand, and the next is tried a rest later.
 */
export const retain = (processes: readonly ProcessRelease[]) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const memory = freshRetainMemory();
    let failed: string | undefined;
    const sweep = Effect.suspend(() => retainOnce(home, processes, memory)).pipe(
      Effect.andThen(Effect.sync(() => void (failed = undefined))),
      Effect.catchCause((cause) => {
        const err = Cause.squash(cause);
        const why = firstPiece(err instanceof Error ? err.message : String(err), '\n');
        if (why === failed) return Effect.void;
        failed = why;
        return Effect.logWarning(`No release could be removed this sweep: ${why}`);
      }),
    );
    return yield* Effect.forever(sweep.pipe(Effect.andThen(Effect.sleep(RETAIN_EVERY))));
  });
