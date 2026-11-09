/**
 * `nemia version`: which release this `nemia` runs, which one the store's pointer names, which one the daemon runs, read off its lease,
 * and which releases and harness versions the sessions at work run on, read off the engine's records of their attempts.
 * The command the CLI serves alone, since the api answers its own release at `GET /api/version`. Also where the running code is found
 * (`runningRelease`), for the trial guard, the lease and the api.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Command } from '../command/entry.verb.ts';
import type { LeaseRelease } from '../daemon/daemon.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import { DEFAULT_HARNESS, remoteNameOf } from '../harness/harness.ts';
import { asked, EngineService, tried, type TaskView } from '../runtime-client.ts';
import { rootGiven } from '../config/root.store.ts';
import { daemonEntry } from '../service/service.store.ts';
import { VERSION as PACKAGE_VERSION } from '../version/version.store.ts';
import { sessionCounts, sessionRanOn, versionLines, type Current, type Running, type SessionCount } from './release.ts';
import { currentRelease, realReleasesDir, runningAt } from './release.store.ts';

/** The package's own folder, whose root is the checkout's or the install's. */
const PACKAGE = path.join(import.meta.dirname, '..', '..');

/**
 * The code this process runs: the root above the package whose `package.json` names the daemon (`daemonEntry`), an install where its
 * `release.json` sits there, else a checkout; the package's own folder, as a checkout, where no root names the daemon.
 */
export function runningRelease(): Running {
  try {
    return runningAt(daemonEntry(PACKAGE).checkout);
  } catch {
    return { kind: 'checkout', root: PACKAGE };
  }
}

/**
 * What `nemia version` reads: the package's version, this nemia's release, the store's pointer, the daemon's, the sessions at work by
 * release and harness version, and its lines.
 */
export type Versions = {
  readonly version: string;
  readonly running: Running;
  readonly current: Current | null;
  readonly daemon: { readonly pid: number; readonly release: LeaseRelease | null } | null;
  readonly sessions: readonly SessionCount[];
  readonly lines: readonly string[];
};

/** A session in flight: the last attempt of a task, not ended, with the harness its task was filed with and whether that is remote. */
export type InFlight = {
  readonly attempt: TaskView['state']['attempts'][number];
  readonly harness: string;
  readonly remote: boolean;
  readonly settled: boolean;
};

/**
 * The sessions in flight among `views`: each task's last attempt while it has not ended, settled or not — a process still running is
 * running on its release either way — with its harness (`DEFAULT_HARNESS` where the task names none) and whether that is a remote agent.
 */
export const inFlight = (views: readonly TaskView[]): InFlight[] =>
  views.flatMap((v) => {
    const last = v.state.attempts.at(-1);
    if (last === undefined || last.ended !== null) return [];
    const harness = v.state.harness ?? DEFAULT_HARNESS;
    return [{ attempt: last, harness, remote: remoteNameOf(harness) !== undefined, settled: v.state.settled !== null }];
  });

/**
 * The sessions at work among `views`, counted by what their attempts recorded they run on (`sessionCounts`): those in flight
 * (`inFlight`) of a task not settled, each image placed under the store's real `releases` folder.
 */
export const sessionsAtWork = (views: readonly TaskView[], releases: string): SessionCount[] =>
  sessionCounts(inFlight(views).flatMap((s) => (s.settled ? [] : [sessionRanOn(s.attempt, s.harness, releases)])));

/** Reads the three releases and the sessions at work off the engine's records, and words them (`versionLines`). */
export const versions = Effect.fn('versions')(function* (home: string) {
  const e = yield* EngineService;
  const listed = yield* asked('version', e.list());
  const sessions = sessionsAtWork(listed.views, realReleasesDir(home));
  return yield* tried((): Versions => {
    const running = runningRelease();
    const current = currentRelease();
    const lease = daemonStanding();
    const daemon = lease.kind === 'ticking' ? { pid: lease.file.pid, release: lease.file.release ?? null } : null;
    const lines = versionLines(PACKAGE_VERSION, running, current, lease, sessions);
    return { version: PACKAGE_VERSION, running, current, daemon, sessions, lines };
  });
});

/** `nemia version`. */
const VERSION: Command<Versions> = {
  name: 'version',
  usage: '[--json]',
  help: [
    "this nemia's release, an install's tag or a checkout, and its folder;",
    "the release the store's releases/current names; and the release the",
    'daemon runs, from its lease, and whether it promises to keep a running',
    'session on its files; and the sessions at work by release and harness',
    'version, off their records. --json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json' }],
    unknown: (arg) => `nemia version does not take ${arg}: nemia version [--json].`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'it says which code the command runs from; the api answers its own at GET /api/version' },
  handler: (_args, _env, home) => versions(rootGiven(home, 'version')),
  print: (data, args) => {
    if (args.json !== true) return data.lines;
    const { lines: _lines, ...answer } = data;
    return [JSON.stringify(answer, null, 2)];
  },
};

/** The release's read command, which the table lists after the service's. */
export const VERSIONS: readonly Command[] = [VERSION];
