/**
 * `nemia version`: which release this `nemia` runs, which one the store's pointer names, and which one the daemon runs, read off its lease.
 * The command the CLI serves alone, since the api answers its own release at `GET /api/version`. Also where the running code is found
 * (`runningRelease`), for the trial guard, the lease and the api.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Command } from '../command/entry.verb.ts';
import type { LeaseRelease } from '../daemon/daemon.ts';
import { daemonStanding } from '../daemon/daemon.store.ts';
import { tried } from '../runtime-client.ts';
import { daemonEntry } from '../service/service.store.ts';
import { VERSION as PACKAGE_VERSION } from '../version/version.ts';
import { versionLines, type Current, type Running } from './release.ts';
import { currentRelease, runningAt } from './release.store.ts';

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

/** What `nemia version` reads: the package's version, this nemia's release, the store's pointer, the daemon's, and its lines. */
export type Versions = {
  readonly version: string;
  readonly running: Running;
  readonly current: Current | null;
  readonly daemon: { readonly pid: number; readonly release: LeaseRelease | null } | null;
  readonly lines: readonly string[];
};

/** Reads the three releases and words them (`versionLines`). */
export const versions = Effect.fn('versions')(function* () {
  return yield* tried((): Versions => {
    const running = runningRelease();
    const current = currentRelease();
    const lease = daemonStanding();
    const daemon = lease.kind === 'ticking' ? { pid: lease.file.pid, release: lease.file.release ?? null } : null;
    return { version: PACKAGE_VERSION, running, current, daemon, lines: versionLines(PACKAGE_VERSION, running, current, lease) };
  });
});

/** `nemia version`. */
const VERSION: Command<Versions> = {
  name: 'version',
  usage: '[--json]',
  help: [
    "this nemia's release, an install's tag or a checkout, and its folder;",
    "the release the store's releases/current names; and the release the",
    'daemon runs, from its lease. --json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [{ flag: '--json', kind: 'switch', key: 'json' }],
    unknown: (arg) => `nemia version does not take ${arg}: nemia version [--json].`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'it says which code the command runs from; the api answers its own at GET /api/version' },
  handler: () => versions(),
  print: (data, args) => {
    if (args.json !== true) return data.lines;
    const { lines: _lines, ...answer } = data;
    return [JSON.stringify(answer, null, 2)];
  },
};

/** The release's read command, which the table lists after the service's. */
export const VERSIONS: readonly Command[] = [VERSION];
