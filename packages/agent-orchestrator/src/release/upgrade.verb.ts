/**
 * `nemia upgrade [<tag>]`: the tag built from a clean export into `releases/<tag>` and checked there, `releases/current` switched to it,
 * and the daemon restarted onto it where the login service runs the pointer. A tag built already at the same commit is switched to
 * without a rebuild, so a rollback is the same command with an older tag. On an archive install the tag's published archive is
 * downloaded, checked against its checksum and smoke-run instead (`archived`), the newest where no tag is named. Either way a tag older
 * than the oldest release that can read the store (`store.json`, `goingBackRefused`) is refused before anything is built or fetched.
 * The command the CLI serves alone: it builds for minutes and restarts the daemon that serves the api.
 */
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Cause, Effect, Schema } from 'effect';
import { Readiness, readinessSaid, runsWait, type ReadinessPiece } from 'objects';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import type { PlaceOutcome, PlaceVerb } from '../place/place.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { awaited, tried } from '../runtime-client.ts';
import { holderOfLease, takeOverLine, DEFAULT_NAME } from '../service/index.ts';
import { timeoutFlag } from '../pause/pause.ts';
import { timedHost, liveHost, NAME_FLAG, serviceForUpgrade, type ServiceHost } from '../service/service.verb.ts';
import { takeOver } from '../service/takeover.verb.ts';
import {
  archiveInstall,
  CURRENT,
  platformOf,
  RELEASE_CHECK,
  restartPlan,
  tagRefusal,
  type ReleaseFile,
  type ReleasePlatform,
  type Running,
} from './release.ts';
import { fetchLatest, readStoreFloor, unpackedArchive } from './archive.store.ts';
import { goingBackRefused, parseVersion, versionTag } from './floor.ts';
import {
  buildingOf,
  placeRelease,
  ranInto,
  releaseDir,
  releaseFileOf,
  releasesDir,
  removeBuilding,
  scriptsOf,
  switchCurrent,
  trialEnv,
  writeReleaseFile,
  type Building,
} from './release.store.ts';
import { runningRelease } from './version.verb.ts';
import { RETAIN_EVERY, retainOnce } from '../retention/retention.verb.ts';

/** The command an upgrade's pause and lines name. */
const BY = 'nemia upgrade';

/** The commands a build runs in the exported tree, in order: the last is the tag's own checks. */
const BUILD_STEPS: readonly (readonly string[])[] = [
  ['npm', 'ci'],
  ['npm', 'run', 'build'],
  ['npm', 'run', RELEASE_CHECK],
];

/**
 * What `nemia upgrade` did: the release now current, whether it was built now, how the daemon was restarted, the releases it removed, and
 * its lines.
 */
export type Upgraded = {
  readonly release: ReleaseFile;
  readonly dir: string;
  readonly built: boolean;
  readonly restart: 'service' | 'hand' | 'none';
  readonly pid: number | null;
  readonly removed: readonly string[];
  readonly lines: readonly string[];
};

/** The repository the tag is resolved in: `--repo`, else the running install's source, else the checkout the running code sits in. */
const repoOf = (args: Args, running: Running): string =>
  path.resolve(typeof args.repo === 'string' ? args.repo : running.kind === 'install' ? running.source : running.root);

/** The answer of a place verb, or refused: `Missing` in the place's words where it refused, `Conflict` where it could not be read. */
function answered<V extends PlaceVerb>(tag: string, outcome: PlaceOutcome<V>): Extract<PlaceOutcome<V>, { answer: unknown }>['answer'] {
  if ('answer' in outcome) return outcome.answer;
  if ('refused' in outcome) throw new Missing({ message: `${BY} ${tag}: ${outcome.refused}` });
  throw new Conflict({ message: `${BY} ${tag}: the git place did not answer (${outcome.unread.said}): nothing changed; run it again.` });
}

/** Runs the build's commands in its tree on its trial store; refused (`Invalid`) at the first that fails, naming it, its exit and log. */
function checked(tag: string, building: Building, env: NodeJS.ProcessEnv): void {
  for (const argv of BUILD_STEPS) {
    const exit = ranInto(argv, building.tree, trialEnv(env, building.trial), building.log);
    if (exit !== 0)
      throw new Invalid({
        message: `${BY} ${tag}: ${argv.join(' ')} exited ${exit}, so nothing changed and releases/${CURRENT} stays where it was: read ${building.log}.`,
      });
  }
}

/**
 * The new tree's own `nemia doctor carry --local` run on the store at `root` (`ranInto`, its output into the build's log): it installs,
 * at the new release's pins, each harness the store holds activated or a release carries (`carryHarnesses`), so nothing that ran stops
 * after the switch. Refused (`Invalid`, naming the log) where it exits non-zero: nothing is switched. `archive` says where the tree's
 * `nemia` is: an archive's `bin/nemia`, a build's npm bin.
 */
function carried(tag: string, building: Building, archive: boolean, root: string, env: NodeJS.ProcessEnv): void {
  const nemia = archive ? path.join(building.tree, 'bin', 'nemia') : path.join(building.tree, 'node_modules', '.bin', 'nemia');
  const exit = ranInto([nemia, 'doctor', 'carry', '--local'], building.tree, { ...env, WF_ROOT: root }, building.log);
  if (exit !== 0)
    throw new Invalid({
      message: `${BY} ${tag}: its nemia doctor carry, which installs this store's harnesses at ${tag}'s pins, exited ${exit}, so nothing changed and releases/${CURRENT} stays where it was: read ${building.log}, then run the upgrade again.`,
    });
}

/**
 * The release of `tag`: the one built already where it names the commit the tag names now, else built — exported, its commands run on a
 * trial store, the export's repository sealed away, `release.json` written last and the tree renamed into `releases/<tag>`. The build's
 * folder is taken away however it ends. Before it is placed, the new tree's carry runs on the store (`carried`). Refused: a tag the
 * repository lacks (`Missing`); one built at another commit, the tag moved, or a release of it placed meanwhile (`Conflict`); a tag with
 * no `release:check` script, a command that fails, or a carry that fails (`Invalid`). The pointer is
 * switched to it last, while the build's folder still stands, so the retention, which removes nothing while a build is under way, never
 * removes a release between the read that finds it built and the pointer naming it.
 */
function prepared(place: Place, tag: string, repo: string, root: string, env: NodeJS.ProcessEnv): { release: ReleaseFile; built: boolean } {
  const building = buildingOf(tag, new Date().toISOString().replace(/[:.]/g, '-'), root);
  try {
    const { commit } = answered(tag, place.askNow('export', { repo, tag, into: building.tree }));
    const had = releaseFileOf(releaseDir(tag, root));
    if (had?.commit === commit) {
      switchCurrent(tag, root);
      return { release: had, built: false };
    }
    if (had !== undefined)
      throw new Conflict({
        message: `${BY} ${tag}: releases/${tag} was built at ${had.commit.slice(0, 7)}, and the tag now names ${commit.slice(0, 7)}: the tag moved. Tag the new commit with a new name.`,
      });
    if (typeof scriptsOf(building.tree)[RELEASE_CHECK] !== 'string')
      throw new Invalid({
        message: `${BY} ${tag}: the tag's package.json has no ${RELEASE_CHECK} script, so it cannot be checked as a release: tag a commit that has one.`,
      });
    checked(tag, building, env);
    answered(tag, place.askNow('seal', { tree: building.tree }));
    carried(tag, building, false, root, env);
    const release: ReleaseFile = { tag, commit, source: repo, builtAt: new Date().toISOString() };
    writeReleaseFile(building.tree, release);
    if (!placeRelease(building.tree, tag, root))
      throw new Conflict({
        message: `${BY} ${tag}: releases/${tag} was placed by another upgrade meanwhile: run it again to switch to it.`,
      });
    switchCurrent(tag, root);
    return { release, built: true };
  } finally {
    removeBuilding(building);
  }
}

/**
 * The release of `tag` from its published archive at the install's download base: the one placed already where `releases/<tag>` holds a
 * release, else downloaded for this machine's platform, checked against its checksum and unpacked (`unpackedArchive`), its `bin/nemia
 * version` run on a trial store, its carry run on the store (`carried`), `release.json` written last — the archive's commit, the download
 * base, `from: 'archive'` and the platform — and the tree renamed into `releases/<tag>`; then the pointer switched to it. The build's
 * folder is taken away however it ends. Refused: a machine no archive is published for, or a tag that is no version (`Invalid`, before
 * anything is fetched); an archive with no `release.json` of its tag, or whose `nemia version` or `nemia doctor carry` fails (`Invalid`,
 * naming the log); and as `unpackedArchive` refuses. A release placed already is switched to with no carry: the daemon's start files what
 * it carries.
 */
async function archived(install: Extract<Running, { kind: 'install' }>, tag: string, root: string, env: NodeJS.ProcessEnv) {
  const platform = platformOf(process.platform, process.arch);
  if (platform === null)
    throw new Invalid({
      message: `${BY} ${tag}: no archive is published for ${process.platform}-${process.arch}: build the release from its repository, nemia upgrade ${tag} --repo <checkout>.`,
    });
  if (parseVersion(tag) === null)
    throw new Invalid({ message: `${BY} ${tag}: a published release's tag is its version, like nemia upgrade v1.3.0.` });
  const building = buildingOf(tag, new Date().toISOString().replace(/[:.]/g, '-'), root);
  try {
    const had = releaseFileOf(releaseDir(tag, root));
    if (had !== undefined) {
      switchCurrent(tag, root);
      return { release: had, built: false };
    }
    await unpackedArchive(install.source, tag, platform, building, BY);
    return { release: placedArchive(install.source, tag, platform, building, root, env), built: true };
  } finally {
    removeBuilding(building);
  }
}

/** The unpacked archive of `tag` smoke-run, its `release.json` written, placed into `releases/<tag>` and pointed at (`archived`). */
function placedArchive(source: string, tag: string, platform: ReleasePlatform, building: Building, root: string, env: NodeJS.ProcessEnv) {
  const packed = releaseFileOf(building.tree);
  if (packed?.tag !== tag)
    throw new Invalid({
      message: `${BY} ${tag}: the archive holds no release.json of ${tag} at its root, so it is no release of it: nothing changed; check the download base in release.json (source).`,
    });
  const exit = ranInto([path.join(building.tree, 'bin', 'nemia'), 'version'], building.tree, trialEnv(env, building.trial), building.log);
  if (exit !== 0)
    throw new Invalid({
      message: `${BY} ${tag}: its bin/nemia version exited ${exit}, so nothing changed and releases/${CURRENT} stays where it was: read ${building.log}.`,
    });
  carried(tag, building, true, root, env);
  const release: ReleaseFile = { tag, commit: packed.commit, source, builtAt: new Date().toISOString(), from: 'archive', platform };
  writeReleaseFile(building.tree, release);
  if (!placeRelease(building.tree, tag, root))
    throw new Conflict({ message: `${BY} ${tag}: releases/${tag} was placed by another upgrade meanwhile: run it again to switch to it.` });
  switchCurrent(tag, root);
  return release;
}

/**
 * Refused (`Conflict`) where `tag` names a version older than the oldest release that can read the store at `root` (`store.json`,
 * `goingBackRefused`), naming that release; a tag that is no version, or a store that records no floor, passes.
 */
function floorRefusal(tag: string, root: string): void {
  const target = parseVersion(tag);
  const floor = readStoreFloor(root);
  if (target === null || floor === null || !goingBackRefused(target, floor)) return;
  const oldest = versionTag(floor);
  throw new Conflict({
    message: `${BY} ${tag}: the store ${root} has been run by a release that ${tag} cannot read; the oldest release that can is ${oldest} (store.json). Upgrade to ${oldest} or newer, like nemia upgrade ${oldest}.`,
  });
}

/** The installed `nemia`, as a person runs it once the store has a pointer: an archive's `bin/nemia`, a build's npm bin. */
const installedNemia = (root: string, archive: boolean): string =>
  archive ? path.join(releasesDir(root), CURRENT, 'bin', 'nemia') : path.join(releasesDir(root), CURRENT, 'node_modules', '.bin', 'nemia');

/** How long the installed release's readiness read may take: the daemon it asks has just been restarted onto it. */
const READINESS_READ_MS = 60_000;

/** The readiness read `nemia doctor --json` printed, or why there is none. */
function readinessOfJson(out: string): Readiness | string {
  try {
    return Schema.decodeUnknownSync(Readiness)(JSON.parse(out));
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * The installed release's own readiness read, run once the daemon was restarted onto it: `releases/current`'s `nemia doctor --json` on the
 * store at `root`, under the context `local` whatever context the person uses (`NEMIA_CONTEXT`), so it asks this machine's daemon, and the
 * pieces it reads are the new release's — this process's code is the older one's and cannot know them. Where a run waits on a missing
 * piece (`runsWait`), one line saying the store is not ready (`readinessSaid`), then each missing piece a run waits on with the fixes that
 * put it there; nothing where it reads ready. The client's own pieces (area `client`: the server reached, the token taken, `nemia` on
 * PATH) hold no run of the store's and are never among them: one of them missing that a run waits on means the server's read did not reach
 * this command, which says so, with the piece's fix. A read that does not answer is one line naming the command to type. Never a refusal:
 * the upgrade itself succeeded.
 */
function readinessAfter(tag: string, root: string, archive: boolean, env: NodeJS.ProcessEnv): string[] {
  const ran = spawnSync(installedNemia(root, archive), ['doctor', '--json'], {
    env: { ...env, WF_ROOT: root, NEMIA_CONTEXT: 'local' },
    encoding: 'utf8',
    timeout: READINESS_READ_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const read = ran.error === undefined ? readinessOfJson(ran.stdout) : ran.error.message;
  if (typeof read === 'string')
    return [`what ${tag} needs before a run could not be read (nemia doctor --json: ${read}): read it with nemia doctor`];
  const held = (p: ReadinessPiece): boolean => p.state === 'missing' && (p.cost ?? 'run') === 'run';
  const unreached = read.pieces.find((p) => p.area === 'client' && held(p));
  if (unreached !== undefined)
    return [
      `what ${tag} needs before a run could not be read: ${unreached.message}${unreached.fixes[0] ? ` (${unreached.fixes[0].command})` : ''}, then read it with nemia doctor`,
    ];
  const server = { ...read, pieces: read.pieces.filter((p) => p.area !== 'client') };
  if (!runsWait(server)) return [];
  const missing = server.pieces.filter(held);
  return [
    `on ${tag} the store is ${readinessSaid(server)}; every new run is held until each is in place:`,
    ...missing.flatMap((p) => [
      `  ✗ ${p.name}${p.factory === undefined ? '' : ` (${[p.factory, p.workflow].filter((w) => w !== undefined).join('/')})`}: ${p.message}`,
      ...p.fixes.map((f) => `      ${f.command}  — ${f.message}`),
    ]),
  ];
}

/**
 * The daemon after the switch: restarted through the take-over where the service holds the lease and its file runs `releases/current`;
 * else named and left running, with the line that moves it; else nothing to restart.
 */
const restarted = Effect.fn('restarted')(function* (args: Args, host: ServiceHost, tag: string, archive: boolean) {
  const root = host.roots().root;
  const lease = host.lease();
  const service = serviceForUpgrade(args, host);
  const holder = holderOfLease(lease, service?.state ?? null);
  const pointer = `${path.join(releasesDir(root), CURRENT)}${path.sep}`;
  const plan = restartPlan(lease, holder, service?.entry?.startsWith(pointer) ?? false);
  if (plan.kind === 'none')
    return { restart: plan.kind, pid: null, lines: [`no daemon ticks the store: the next one started runs ${tag}`] };
  if (plan.kind === 'service' && service !== null) {
    const taken = yield* takeOver(plan.pid, host, service, BY);
    return {
      restart: plan.kind,
      pid: taken.pid,
      lines: [`restarted the daemon onto ${tag}: the service ticks the store${taken.pid ? ` as pid ${taken.pid}` : ''}`],
    };
  }
  const name = typeof args.name === 'string' ? args.name : DEFAULT_NAME;
  const moves =
    holder === 'service'
      ? `${installedNemia(root, archive)} service install${name === DEFAULT_NAME ? '' : ` --name ${name}`} rewrites the service onto releases/${CURRENT} and restarts it`
      : `${installedNemia(root, archive).replace(/nemia$/, '')}${takeOverLine(plan.pid, name)} hands the store to the service on releases/${CURRENT}`;
  return {
    restart: plan.kind,
    pid: plan.pid,
    lines: [
      `pid ${plan.pid} ticks the store and does not run releases/${CURRENT}: it is left running the code it started with.`,
      `To move it onto ${tag}: ${moves}.`,
    ],
  };
});

/**
 * The releases removed once the daemon is restarted (`retainOnce`), pinning the one this process runs and the one the lease says the
 * daemon runs; a sweep that fails is a line, never a failed upgrade, since the pointer has moved already. Lines only where it removed
 * a release or a crashed upgrade's leftover, or held.
 */
const removedAfter = Effect.fn('removedAfter')(function* (root: string, host: ServiceHost, running: Running) {
  const lease = host.lease();
  const daemon = lease.kind === 'ticking' && lease.file.release !== undefined ? [lease.file.release] : [];
  return yield* retainOnce(root, [running, ...daemon]).pipe(
    Effect.map((done) => {
      const said = done.removed.length > 0 || done.swept.entries.length > 0 || done.swept.logs.length > 0 || done.held !== null;
      return { removed: done.removed, lines: said ? done.lines : [] };
    }),
    Effect.catchCause((cause) => {
      const err = Cause.squash(cause);
      const why = err instanceof Error ? err.message : String(err);
      return Effect.succeed({
        removed: [] as string[],
        lines: [`no old release was removed: ${why}; the daemon's sweep tries again within ${RETAIN_EVERY}`],
      });
    }),
  );
});

/**
 * The tag an upgrade goes to: the one named; on an archive install with none named, the newest published (`fetchLatest`); refused
 * (`Invalid`) where none is named on a build, which has no list of releases to read.
 */
const tagOf = (args: Args, running: Running) => {
  if (typeof args.tag === 'string') return Effect.succeed(args.tag);
  if (archiveInstall(running))
    return Effect.map(
      awaited(() => fetchLatest(running.source, BY)),
      (latest) => latest.tag,
    );
  return Effect.fail(
    new Invalid({ message: `${BY} takes the tag to build on a release built from its repository, like nemia upgrade v1.2.0: ${SHAPE}.` }),
  );
};

/**
 * Upgrades the store to `tag` (`archived` on an archive install, else `prepared`, each of which switches the pointer), restarts the daemon
 * (`restarted`), says what the new release reads missing where the daemon now runs it (`readinessAfter`), then removes what no one needs
 * (`removedAfter`); refused before the switch, and before anything is fetched or built where
 * the tag is no release's name or goes back past the store's floor (`floorRefusal`). `running` is the code this command runs, which says
 * whether the store is an archive install.
 */
export const upgrade = Effect.fn('upgrade')(function* (
  args: Args,
  given?: ServiceHost,
  env: NodeJS.ProcessEnv = process.env,
  running: Running = runningRelease(),
) {
  const host = given ?? liveHost(yield* StoreRoot);
  const root = host.roots().root;
  const place = yield* PlaceService;
  const tag = yield* tagOf(args, running);
  yield* tried(() => {
    const wrong = tagRefusal(tag);
    if (wrong !== null) throw new Invalid({ message: wrong });
    floorRefusal(tag, root);
  });
  const archive = archiveInstall(running) ? running : null;
  const { release, built } = archive
    ? yield* awaited(() => archived(archive, tag, root, env))
    : yield* tried(() => prepared(place, tag, repoOf(args, running), root, env));
  const dir = releaseDir(tag, root);
  const said = !built
    ? `${tag} is built already at ${release.commit.slice(0, 7)} (${dir}): switched to it without a rebuild`
    : archive
      ? `downloaded ${tag} (${release.commit.slice(0, 7)}) for ${release.platform ?? 'this machine'} into ${dir}: its checksum matched and its nemia version ran`
      : `built ${tag} (${release.commit.slice(0, 7)}) into ${dir}: npm ci, npm run build and npm run ${RELEASE_CHECK} passed`;
  const daemon = yield* restarted(args, host, tag, archive !== null);
  const readiness = daemon.restart === 'service' ? readinessAfter(tag, root, archive !== null, env) : [];
  const retained = yield* removedAfter(root, host, running);
  return {
    release,
    dir,
    built,
    ...daemon,
    removed: retained.removed,
    lines: [said, `releases/${CURRENT} now names ${tag}`, ...daemon.lines, ...readiness, ...retained.lines],
  } satisfies Upgraded;
});

/** How `nemia upgrade` is typed, as its refusals end on it. */
const SHAPE = 'nemia upgrade [<tag>] [--repo <path>] [--name <name>] [--timeout <d>]';

/** `nemia upgrade`. */
const UPGRADE: Command<Upgraded> = {
  name: 'upgrade',
  usage: '[<tag>] [--repo <path>] [--name <name>] [--timeout <d>]',
  help: [
    "on an archive install, download the tag's archive (the newest where",
    'none is named), check it against its SHA256SUMS and run its nemia',
    "version, into the store's releases/<tag>; on a release built from a",
    'repository, build the tag from a clean export into releases/<tag>:',
    'npm ci, npm run build and npm run release:check there, on a trial',
    'store; then point releases/current at it and restart the daemon onto',
    'it where the login service runs the pointer: jobs run on, and the',
    "daemon's sessions are given up to the timeout to end their tool calls",
    '(--timeout <d>, else nemia pause-timeout), park, and resume as the same try on',
    'the new release; then say each piece the new release reads missing',
    'that a run waits on, with its fix. A tag built already is switched',
    'to without a rebuild, so an older tag rolls back. --repo:',
    "the repository the tag is in (the running release's source);",
    '--name: the service (nemia). Then it removes each release that is',
    'not current, not among the two newest, and that no session or',
    'running nemia runs on, the folder of each build whose upgrade died,',
    'and each build log older than 30 days, as the daemon does every five',
    'minutes. A tag older than the oldest release that can read the store',
    '(store.json) is refused before anything is fetched or built',
  ],
  spec: {
    positionals: [{ key: 'tag', takes: 'optional', kind: 'name' }],
    flags: [
      { flag: '--repo', kind: 'text', key: 'repo', takes: `--repo takes the repository the tag is in: ${SHAPE}.` },
      NAME_FLAG,
      timeoutFlag(SHAPE),
    ],
    unknown: (arg) => `nemia upgrade does not take ${arg}: ${SHAPE}.`,
  },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: 'builds for minutes and restarts the daemon that serves the api' },
  handler: (args) => Effect.flatMap(StoreRoot, (home) => Effect.flatMap(timedHost(args, home, 'upgrade'), (host) => upgrade(args, host))),
  print: (data) => data.lines,
};

/** The release's commands, in the order `nemia`'s help lists them. */
export const RELEASES: readonly Command[] = [UPGRADE];
