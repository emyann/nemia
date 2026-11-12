/**
 * The daemon's release check: on an archive install, a sweep `up` forks once its first pass has answered, which asks the install's
 * download base for the newest release (`<source>/latest/download/latest.json`) and keeps what it read in `releases/latest.json`, then
 * again every `RELEASE_CHECK_EVERY`; `nemia version` and the api's `GET /api/version` read it (`latestRelease`). It sends nothing but a
 * generic client name (`CLIENT_NAME`). None for a checkout or a release built from a repository, which have no download base, and none
 * where `NEMIA_RELEASE_CHECK=off`. Level-triggered: each check reads the install and the setting afresh and writes what it read whole.
 */
import { Effect, Result, Schedule } from 'effect';
import { setting, type StoreConfig } from '../config/config.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { awaited } from '../runtime-client.ts';
import { archiveInstall, type Running } from './release.ts';
import { fetchLatest, writeLatest, type LatestFile } from './archive.store.ts';

/** How often the daemon of an archive install asks for the newest release. */
export const RELEASE_CHECK_EVERY = '6 hours';

/** The command a release check's lines name. */
const BY = 'release check';

/**
 * What one release check did: read the newest release and kept it (`read`); nothing, the check being off (`off`) or the code no archive
 * install (`unarchived`); or it could not read one (`unread`), in words that say why.
 */
export type ReleaseChecked =
  | { readonly kind: 'read'; readonly latest: LatestFile }
  | { readonly kind: 'off' }
  | { readonly kind: 'unarchived' }
  | { readonly kind: 'unread'; readonly message: string };

/** One release check of the store the program is given, for the code `running` runs (`ReleaseChecked`); it never fails. */
export const checkOnce = Effect.fn('checkOnce')(function* (
  running: Running,
): Effect.fn.Return<ReleaseChecked, never, StoreRoot | StoreConfig> {
  const on = yield* Effect.result(setting('releaseCheck'));
  if (Result.isFailure(on)) return { kind: 'unread', message: on.failure.message } satisfies ReleaseChecked;
  if (!on.success) return { kind: 'off' } satisfies ReleaseChecked;
  if (!archiveInstall(running)) return { kind: 'unarchived' } satisfies ReleaseChecked;
  const home = yield* StoreRoot;
  const read = yield* Effect.result(awaited(() => fetchLatest(running.source, BY)));
  if (Result.isFailure(read)) return { kind: 'unread', message: read.failure.message } satisfies ReleaseChecked;
  try {
    writeLatest(home, read.success);
  } catch (err) {
    return { kind: 'unread', message: `${BY}: ${(err as Error).message}` } satisfies ReleaseChecked;
  }
  return { kind: 'read', latest: read.success } satisfies ReleaseChecked;
});

/**
 * The release check as the daemon runs it: a check now, then one every `RELEASE_CHECK_EVERY` while there is one to make; a check that
 * could not read is a warning, tried again at the next. It ends where the check is off or the code is no archive install.
 */
export const releaseCheck = (running: Running) =>
  checkOnce(running).pipe(
    Effect.tap((done) => (done.kind === 'unread' ? Effect.logWarning(`the release check read no release: ${done.message}`) : Effect.void)),
    Effect.repeat({
      schedule: Schedule.spaced(RELEASE_CHECK_EVERY),
      while: (done: ReleaseChecked) => done.kind === 'read' || done.kind === 'unread',
    }),
  );
