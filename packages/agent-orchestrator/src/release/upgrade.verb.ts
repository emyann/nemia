/**
 * `nemia upgrade <tag>`: the tag built from a clean export into `releases/<tag>` and checked there, `releases/current` switched to it, and
 * the daemon restarted onto it where the login service runs the pointer. A tag built already at the same commit is switched to without a
 * rebuild, so a rollback is the same command with an older tag. The command the CLI serves alone: it builds for minutes and restarts the
 * daemon that serves the api.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { PlaceService, type Place } from '../place/place.store.ts';
import type { PlaceOutcome, PlaceVerb } from '../place/place.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { tried } from '../runtime-client.ts';
import { holderOfLease, takeOverLine, DEFAULT_NAME } from '../service/service.ts';
import { liveHost, NAME_FLAG, serviceForUpgrade, type ServiceHost } from '../service/service.verb.ts';
import { takeOver } from '../service/takeover.verb.ts';
import { CURRENT, RELEASE_CHECK, restartPlan, tagRefusal, type ReleaseFile, type Running } from './release.ts';
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

/** The command an upgrade's pause and lines name. */
const BY = 'nemia upgrade';

/** The commands a build runs in the exported tree, in order: the last is the tag's own checks. */
const BUILD_STEPS: readonly (readonly string[])[] = [
  ['npm', 'ci'],
  ['npm', 'run', 'build'],
  ['npm', 'run', RELEASE_CHECK],
];

/** What `nemia upgrade` did: the release now current, whether it was built now, how the daemon was restarted, and its lines. */
export type Upgraded = {
  readonly release: ReleaseFile;
  readonly dir: string;
  readonly built: boolean;
  readonly restart: 'service' | 'hand' | 'none';
  readonly pid: number | null;
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
 * The release of `tag`: the one built already where it names the commit the tag names now, else built — exported, its commands run on a
 * trial store, the export's repository sealed away, `release.json` written last and the tree renamed into `releases/<tag>`. The build's
 * folder is taken away however it ends. Refused: a tag the repository lacks (`Missing`); one built at another commit, the tag moved, or a
 * release of it placed meanwhile (`Conflict`); a tag with no `release:check` script, or a command that fails (`Invalid`).
 */
function prepared(place: Place, tag: string, repo: string, root: string, env: NodeJS.ProcessEnv): { release: ReleaseFile; built: boolean } {
  const building = buildingOf(tag, new Date().toISOString().replace(/[:.]/g, '-'), root);
  try {
    const { commit } = answered(tag, place.askNow('export', { repo, tag, into: building.tree }));
    const had = releaseFileOf(releaseDir(tag, root));
    if (had?.commit === commit) return { release: had, built: false };
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
    const release: ReleaseFile = { tag, commit, source: repo, builtAt: new Date().toISOString() };
    writeReleaseFile(building.tree, release);
    if (!placeRelease(building.tree, tag, root))
      throw new Conflict({
        message: `${BY} ${tag}: releases/${tag} was placed by another upgrade meanwhile: run it again to switch to it.`,
      });
    return { release, built: true };
  } finally {
    removeBuilding(building);
  }
}

/** The installed `nemia`, as a person runs it once the store has a pointer. */
const installedNemia = (root: string): string => path.join(releasesDir(root), CURRENT, 'node_modules', '.bin', 'nemia');

/**
 * The daemon after the switch: restarted through the take-over where the service holds the lease and its file runs `releases/current`;
 * else named and left running, with the line that moves it; else nothing to restart.
 */
const restarted = Effect.fn('restarted')(function* (args: Args, host: ServiceHost, tag: string) {
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
      ? `${installedNemia(root)} service install${name === DEFAULT_NAME ? '' : ` --name ${name}`} rewrites the service onto releases/${CURRENT} and restarts it`
      : `${installedNemia(root).replace(/nemia$/, '')}${takeOverLine(plan.pid, name)} hands the store to the service on releases/${CURRENT}`;
  return {
    restart: plan.kind,
    pid: plan.pid,
    lines: [
      `pid ${plan.pid} ticks the store and does not run releases/${CURRENT}: it is left running the code it started with.`,
      `To move it onto ${tag}: ${moves}.`,
    ],
  };
});

/** Upgrades the store to `tag` (`prepared`), switches the pointer, then restarts the daemon (`restarted`); refused before the switch. */
export const upgrade = Effect.fn('upgrade')(function* (args: Args, host: ServiceHost = liveHost(), env: NodeJS.ProcessEnv = process.env) {
  const tag = typeof args.tag === 'string' ? args.tag : '';
  const root = host.roots().root;
  const place = yield* PlaceService;
  const { release, built } = yield* tried(() => {
    const wrong = tagRefusal(tag);
    if (wrong !== null) throw new Invalid({ message: wrong });
    const result = prepared(place, tag, repoOf(args, runningRelease()), root, env);
    switchCurrent(tag, root);
    return result;
  });
  const dir = releaseDir(tag, root);
  const said = built
    ? `built ${tag} (${release.commit.slice(0, 7)}) into ${dir}: npm ci, npm run build and npm run ${RELEASE_CHECK} passed`
    : `${tag} is built already at ${release.commit.slice(0, 7)} (${dir}): switched to it without a rebuild`;
  const daemon = yield* restarted(args, host, tag);
  return { release, dir, built, ...daemon, lines: [said, `releases/${CURRENT} now names ${tag}`, ...daemon.lines] } satisfies Upgraded;
});

/** How `nemia upgrade` is typed, as its refusals end on it. */
const SHAPE = 'nemia upgrade <tag> [--repo <path>] [--name <name>]';

/** `nemia upgrade`. */
const UPGRADE: Command<Upgraded> = {
  name: 'upgrade',
  usage: '<tag> [--repo <path>] [--name <name>]',
  help: [
    "build the tag from a clean export into the store's releases/<tag>:",
    'npm ci, npm run build and npm run release:check there, on a trial',
    'store; then point releases/current at it and restart the daemon onto',
    'it where the login service runs the pointer. A tag built already is',
    'switched to without a rebuild, so an older tag rolls back. --repo:',
    "the repository the tag is in (the running release's source);",
    '--name: the service (nemia)',
  ],
  spec: {
    positionals: [{ key: 'tag', takes: 'required', kind: 'name' }],
    missing: `nemia upgrade takes the tag to build, like nemia upgrade v1.2.0: ${SHAPE}.`,
    flags: [{ flag: '--repo', kind: 'text', key: 'repo', takes: `--repo takes the repository the tag is in: ${SHAPE}.` }, NAME_FLAG],
    unknown: (arg) => `nemia upgrade does not take ${arg}: ${SHAPE}.`,
  },
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: 'builds for minutes and restarts the daemon that serves the api' },
  handler: (args) => upgrade(args),
  print: (data) => data.lines,
};

/** The release's commands, in the order `nemia`'s help lists them. */
export const RELEASES: readonly Command[] = [UPGRADE];
