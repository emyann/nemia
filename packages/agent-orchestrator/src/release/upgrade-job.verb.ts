/**
 * The server's upgrade, started from the board or the MCP port and followed: `startUpgrade` judges the start (`tagRefusal`, then
 * `upgradeStartRefusal` over the store's floor and whether an upgrade is at work) and files `nemia upgrade <tag>` — the server's own code,
 * run exactly as typed at the machine — on the runtime as a command task, so it outlives the daemon its take-over restarts; `upgradeOf`
 * reads it back through the engine, its phase and the end of what it printed; `followUpgrade` follows that output as it grows, from its
 * first byte, then the upgrade as it ended, read again by whichever daemon serves the store; `upgradesRead` says the release going back
 * goes to (`previousRelease`, with the floor's words where it refuses it) and the store's last upgrade. A controller, reaching the runtime
 * through the client.
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Context, Effect, Option, Stream } from 'effect';
import type { PreviousRelease, Upgrade, UpgradeStart, UpgradesRead } from 'objects';
import { asked, EngineService, tried, type Engine, type TaskView } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import { alive } from '../process/alive.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { MOMENTUM } from '../status/status.ts';
import { commandPhaseOf } from '../needs/fix.verb.ts';
import { tagRefusal, type Running } from './release.ts';
import { buildUnderWay, installedReleases } from './release.store.ts';
import { readStoreFloor } from './archive.store.ts';
import { goingBackRefused, parseVersion, versionTag, type Version } from './floor.ts';
import { previousRelease, upgradeStartRefusal } from './upgrade-job.ts';
import { lastUpgradeRecord, readUpgradeRecord, writeUpgradeRecord, type UpgradeRecord } from './upgrade-job.store.ts';
import { runningRelease } from './version.verb.ts';

/** How long an upgrade may run: an archive's download and its carry, or a build's `npm ci`, build and checks, then the restart. */
export const UPGRADE_DEADLINE_SECONDS = 3600;

/** How much of the end of an upgrade's output its read carries (`upgradeOf`). */
export const UPGRADE_TAIL_BYTES = 16_384;

/** How often a follow of an upgrade's output reads it again while the upgrade runs (`followUpgrade`). */
export const UPGRADE_FOLLOW_MS = 500;

/** The orchestrator's in-process CLI, which an archive carries as the repository tracks it (`tools/release/archive.ts`, `git archive`). */
const NEMIA_BIN = path.join(import.meta.dirname, '..', '..', 'bin', 'nemia.ts');

/**
 * The code the server runs (`runningRelease` by default): the release `from` of an upgrade and the one going back goes back from. A
 * test's app gives another (`Layer.succeed(RunningCode, () => …)`), so it reads an install where it runs from a checkout.
 */
export const RunningCode = Context.Reference<() => Running>('orchestrator/RunningCode', { defaultValue: () => runningRelease });

/**
 * The command an upgrade's task runs: this code's own Node on this package's `bin/nemia.ts`, `upgrade <tag>`, its stderr joined to its
 * stdout so a refusal is read in the one stream with the rest.
 */
export const upgradeCommand = (tag: string): string[] => [
  'sh',
  '-c',
  'exec 2>&1\nexec "$0" "$@"',
  process.execPath,
  NEMIA_BIN,
  'upgrade',
  tag,
];

/**
 * Whether the engine holds the task of `view` filed: a task it never filed, or has forgotten, reads as an empty journal, with no filing,
 * and is no upgrade at work nor one to read back.
 */
const filed = (view: TaskView): boolean => view.state.filedAt !== undefined;

/**
 * Whether the task of `record` is filed and has not settled: its view read, and a task the engine cannot read, or holds no filing of,
 * counted as no upgrade at work, so a record the engine has forgotten never holds every start back.
 */
const atWork = (e: Engine, record: UpgradeRecord) =>
  e.view(record.taskId).pipe(
    Effect.map((view) => filed(view) && view.state.settled === null),
    Effect.orElseSucceed(() => false),
  );

/**
 * Starts the upgrade `start` asks for and answers it as an `Upgrade`, `pending`: refused (`Invalid`) for a tag that names no release's
 * folder (`tagRefusal`); refused (`Conflict`) while an upgrade is at work — the store's last one, its task not settled, or a
 * `nemia upgrade` typed on the machine, building under `releases/` (`buildUnderWay`) — and for a tag older than the oldest release that
 * reads the store (`upgradeStartRefusal`), naming it; nothing is filed for any. Then filed on the runtime as a command task
 * (`upgradeCommand`) in the store's folder, `WF_ROOT` naming the store, under `UPGRADE_DEADLINE_SECONDS`, its record kept under
 * `<home>/upgrades/<id>.json`. The runtime runs it on the daemon's next pass, once a slot is free.
 */
export const startUpgrade = Effect.fn('startUpgrade')(function* (start: UpgradeStart) {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const running = (yield* RunningCode)();
  const { tag } = start;
  const wrong = tagRefusal(tag);
  if (wrong !== null) return yield* Effect.fail(new Invalid({ message: wrong }));
  const last = yield* tried(() => lastUpgradeRecord(home));
  const lastAtWork = last === undefined ? false : yield* atWork(e, last);
  const typed = buildUnderWay(home, alive);
  const floor = readStoreFloor(home);
  const refusal = upgradeStartRefusal(parseVersion(tag), floor, lastAtWork || typed);
  if (refusal === 'in-flight')
    return yield* Effect.fail(
      new Conflict({
        message:
          lastAtWork && last !== undefined
            ? `an upgrade to ${last.tag} is at work (${last.id}): follow it on Settings, or GET /api/upgrades/${last.id}, and start another once it has ended.`
            : `nemia upgrade is building a release under ${path.join(home, 'releases')} on the server: let it end, then start the upgrade again.`,
      }),
    );
  if (refusal === 'below-floor' && floor !== null) return yield* Effect.fail(new Conflict({ message: floorWords(tag, floor) }));
  const id = `upgrade-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  yield* asked(
    'file',
    e.file({
      id,
      harness: 'command',
      priority: MOMENTUM,
      brief: `upgrade the server to ${tag}`,
      cwd: home,
      deadlineSeconds: UPGRADE_DEADLINE_SECONDS,
      config: { command: upgradeCommand(tag), env: { WF_ROOT: home } },
    }),
  );
  const record: UpgradeRecord = {
    id,
    tag,
    ...(running.kind === 'install' ? { from: running.tag } : {}),
    taskId: id,
    startedAt: new Date().toISOString(),
  };
  yield* tried(() => writeUpgradeRecord(home, record));
  return upgradeRead(record, undefined, '');
});

/** Why going back to `tag` is refused on a store whose floor is `floor`: the oldest release that reads it, and the upgrade that may go. */
const floorWords = (tag: string, floor: Version): string => {
  const oldest = versionTag(floor);
  return `${tag} cannot read this store, which a newer release has run; the oldest release that can is ${oldest} (store.json): upgrade to ${oldest} or newer.`;
};

/** The `Upgrade` of `record` over its task's view and the end of its output. */
const upgradeRead = (record: UpgradeRecord, view: TaskView | undefined, output: string): Upgrade => {
  const exitCode = view?.state.settled ? view.state.attempts.at(-1)?.exitCode : undefined;
  return {
    id: record.id,
    tag: record.tag,
    ...(record.from === undefined ? {} : { from: record.from }),
    phase: commandPhaseOf(view),
    output,
    ...(typeof exitCode === 'number' ? { exitCode } : {}),
    startedAt: record.startedAt,
  };
};

/** The record of the upgrade `id`, refused (`Missing`) where the store has none, naming where the upgrades are read. */
const recordOf = (home: string, id: string): Effect.Effect<UpgradeRecord, Missing> => {
  const record = readUpgradeRecord(home, id);
  return record === undefined
    ? Effect.fail(
        new Missing({ message: `no upgrade ${id} was started here: GET /api/upgrades names the last one, and Settings starts one.` }),
      )
    : Effect.succeed(record);
};

/**
 * The upgrade `id` as it stands, read through the engine: its phase, the end of what it printed (`UPGRADE_TAIL_BYTES`), and its exit code
 * once ended. Refused (`Missing`) for an id no upgrade was started under.
 */
export const upgradeOf = Effect.fn('upgradeOf')(function* (id: string) {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const record = yield* recordOf(home, id);
  const view = yield* asked('view', e.view(record.taskId));
  const output = (yield* asked('output', e.output(record.taskId, 'stdout', UPGRADE_TAIL_BYTES))) ?? '';
  return upgradeRead(record, view, output);
});

/** One moment of an upgrade followed: a piece of what it printed, in order, or its end, the upgrade as it ended. */
export type UpgradeFollowed = { readonly kind: 'output'; readonly text: string } | { readonly kind: 'ended'; readonly upgrade: Upgrade };

/**
 * The upgrade `id`'s output followed as it grows (`UPGRADE_FOLLOW_MS`): each piece it printed since the last read, once and in order, from
 * its first byte, then its end (`ended`), after which the stream is over. Refused (`Missing`) for an id no upgrade was started under.
 * Read off the runtime's kept stream every time, never remembered past the follow: a reader that comes back after the daemon restarted
 * reads it whole again.
 */
export const followUpgrade = (id: string, everyMs: number = UPGRADE_FOLLOW_MS) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const record = yield* recordOf(home, id);
    return Stream.paginate({ sent: 0, first: true }, (s: { sent: number; first: boolean }) =>
      Effect.gen(function* () {
        if (!s.first) yield* Effect.sleep(everyMs);
        const e = yield* EngineService;
        const view = yield* asked('view', e.view(record.taskId));
        const whole = (yield* asked('output', e.output(record.taskId, 'stdout'))) ?? '';
        const text = whole.slice(s.sent);
        const pieces: UpgradeFollowed[] = text ? [{ kind: 'output', text }] : [];
        if (!view.state.settled) return [pieces, Option.some({ sent: whole.length, first: false })] as const;
        const tail = whole.length > UPGRADE_TAIL_BYTES ? whole.slice(-UPGRADE_TAIL_BYTES) : whole;
        const ended: UpgradeFollowed = { kind: 'ended', upgrade: upgradeRead(record, view, tail) };
        return [[...pieces, ended], Option.none()] as const;
      }),
    );
  });

/**
 * The release going back goes to from `running` among the store's installed releases (`previousRelease`), with the floor's words where
 * going back to it is refused (`goingBackRefused`); null where none older is installed, or the server runs code from a repository.
 */
const previousOf = (home: string, running: Running): PreviousRelease | null => {
  const own = running.kind === 'install' ? parseVersion(running.tag) : null;
  const installed = installedReleases(home).map((r) => ({ tag: r.tag, version: parseVersion(r.tag) }));
  const tag = previousRelease(installed, own);
  if (tag === null) return null;
  const target = parseVersion(tag);
  const floor = readStoreFloor(home);
  return target !== null && floor !== null && goingBackRefused(target, floor) ? { tag, refused: floorWords(tag, floor) } : { tag };
};

/**
 * What Settings reads of the server's upgrades: the release going back goes to (`previousOf`), and the store's last upgrade as it stands
 * (`upgradeOf`'s read), null where none was started or its task is one the engine cannot read or holds no filing of.
 */
export const upgradesRead = Effect.fn('upgradesRead')(function* () {
  const home = yield* StoreRoot;
  const e = yield* EngineService;
  const running = (yield* RunningCode)();
  const previous = yield* tried(() => previousOf(home, running));
  const record = yield* tried(() => lastUpgradeRecord(home));
  if (record === undefined) return { previous, last: null } satisfies UpgradesRead;
  const last = yield* Effect.all([e.view(record.taskId), e.output(record.taskId, 'stdout', UPGRADE_TAIL_BYTES)]).pipe(
    Effect.map(([view, output]) => (filed(view) ? upgradeRead(record, view, output ?? '') : null)),
    Effect.orElseSucceed(() => null),
  );
  return { previous, last } satisfies UpgradesRead;
});
