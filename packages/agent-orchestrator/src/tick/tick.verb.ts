/**
 * The tick: every run advanced once a pass, and the memo of runs at rest that answers a run whose inputs did not change without a read of
 * the engine (`RestMemo`, `advanceResting`). This is the whole daemon. A controller, reaching the runtime through the client
 * (`runtime-client.ts`): an Effect program that requires the engine as a service (`tickRun`, over `EngineService`), run by a caller
 * with `runWith`.
 */
import os from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { Cause, Data, Effect, Exit } from 'effect';
import {
  EngineService,
  asked,
  over,
  refusedText,
  tried,
  unreadableJournal,
  type Engine,
  type RefusedMove,
  type TaskView,
} from '../runtime-client.ts';
import type { QueueStarted } from '../inbox/index.ts';
import { tipsSeen } from '../branches/index.ts';
import { admissionOrder, slotFree, type RunSlot } from '../cap/cap.ts';
import { passRead, type PassRead } from '../cap/cap.verb.ts';
import { readPause } from '../pause/pause.store.ts';
import { finishingAmong, type Finishing, type Pause, type PauseStanding } from '../pause/pause.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { stepsOrNone, unloadedFolder } from '../record/steps.store.ts';
import { hasStarted } from '../wait/wait.ts';
import { ceilings, recordCeilings, recordPassCost, recordRecentPass } from '../daemon/daemon.store.ts';
import { verifiesRest } from '../config/config.store.ts';
import { feedFile } from '../feed/feed.store.ts';
import { emitFeed } from '../feed/feed.verb.ts';
import { freshStandingMemo, headsFor, passStanding, standingReader, type StandingMemo } from '../standing/standing.verb.ts';
import { followedFeed } from '../rest/rest.verb.ts';
import { reportedEngine } from '../views/views.verb.ts';
import { startQueued } from '../inbox/inbox.verb.ts';
import { startDue } from '../schedule/schedule.verb.ts';
import type { ScheduleStarted } from '../schedule/schedule.ts';
import { countRested, meteredPass, noteSeen, within, withinEffect } from '../meter/tally.store.ts';
import { RECENT_KEPT, sessionsOf, type PassCost, type Reading, type RecentPass } from '../meter/index.ts';
import { keepSeries } from '../series/series.store.ts';
import { advancePass, type Advanced } from './advance.verb.ts';
import { heldRead } from '../list/list.verb.ts';
import { finishForgetting, type ForgettingLine } from '../forgetting/forgetting.verb.ts';
import type { DiskReading } from '../disk/disk.ts';
import { costOf, ioOf, meteredEngine, recordPassMetrics, recordStepMetrics, talliedIn } from '../meter/meter.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/**
 * One pass: every run advanced, in the store's order, and what the pass did with the queue of inbox cards and with the factories'
 * schedules, when it did anything (`startQueued`, `startDue`).
 */
export type Pass = {
  runs: Advanced[];
  queue?: QueueStarted;
  /** What the pass did with the factories' schedules, when one was due and the queue started no run (`startDue`). */
  scheduled?: ScheduleStarted;
  /**
   * Why the feed could not be written on this pass (`emitFeed`), when it could not: the pass itself went on, since nothing reads the feed
   * to decide.
   */
  feedError?: string;
  /**
   * What the pass cost, phase by phase (`PassCost`), as written to the store for `nemia up --stats` and the api (`recordPassCost`) — its
   * `overheadMs` here with that write in it, which the file cannot hold of itself.
   */
  cost?: PassCost;
  /**
   * The moves the runtime's lifecycle had no edge for on this pass (`TickReport.refused`): each task stalls, asked again every pass, until
   * what it sees changes or the machine gains the edge. Absent when there were none. `nemia up` says each once while it lasts
   * (`refusalLines`).
   */
  refused?: RefusedMove[];
  /**
   * Why the runtime left a task out of this pass, or skipped a feed entry, as it said it (`TickReport.unreadable`): a journal holding an
   * entry no runtime wrote, on every pass while it lasts. And each run a read of whose tasks rejected so (`unreadableJournal`), or that
   * froze no workflow and whose folder does not load (`unloadedFolder`): it is left out of `runs` and of the feed, judged on no pass until
   * the journal reads or the folder loads, and counted in flight, while every other run advances; its line carries the runtime's words,
   * said once, or the refusal's. Absent when there were none. `nemia up` says each once while it lasts.
   */
  unreadable?: string[];
  /**
   * Why the runtime could not read a harness on this pass, as it said it (`TickReport.unobserved`): on every pass while it lasts, the
   * names that harness was to find neither there nor gone. Absent when every harness read. `nemia up` says each once while it lasts.
   */
  unobserved?: string[];
  /**
   * What the pass forgot of the tasks of runs `nemia rm` removed while one waited, or what refused it (`finishForgetting`): a line a run.
   * Absent when there was nothing to say. `nemia up` says each once while it lasts.
   */
  forgetting?: ForgettingLine[];
  /**
   * The store's pause as the pass read it (`readPause`), while one stands; each task still finishing under it, read off the views the
   * runtime reported on this pass (`finishingOf`); and each check it holds, a landing with its merge staged among them (`heldRead`): the
   * pass admitted no queued task and started no queued card, and filed nothing new of any run (`assess`). Absent while the store is not
   * paused.
   */
  pause?: PauseStanding;
};

/**
 * What a daemon says of a pass's refused moves, and what it has then said: a refusal it said on an earlier pass and that is still refused
 * is not said again, one that cleared is forgotten, so it is said again if it comes back. `said` holds the refusals of the last pass alone,
 * by task, state and event: a daemon that restarts says every refusal still standing once more, since what it printed before is on a
 * terminal that may be gone. Nothing is decided on it: this is only what has been printed, as `nemia up`'s queue and feed failures are.
 */
export function refusalLines(refused: readonly RefusedMove[], said: ReadonlySet<string>): { lines: string[]; said: Set<string> } {
  const now = new Set<string>();
  const lines: string[] = [];
  for (const m of refused) {
    const key = `${m.taskId}\t${m.state}\t${m.event}`;
    if (!said.has(key) && !now.has(key)) lines.push(refusedText(m));
    now.add(key);
  }
  return { lines, said: now };
}

/** What the runtime's own pass reported (`Engine`'s `tick`). */
type TickReport = Effect.Success<ReturnType<Engine['tick']>>;

/**
 * What a pass is handed: where a queued card with no repository of its own is started, the memo it answers from, and whether it verifies.
 */
type PassOptions = { repo: string; memo: RestMemo; verify: boolean };

/**
 * The series kept from the ring after a pass (`keepSeries`), and the time it took, which is measuring's. A failure costs the series, never
 * the pass: it is said on stderr.
 */
const seriesKept = (ring: readonly RecentPass[]): number => {
  const t0 = performance.now();
  try {
    keepSeries(ring);
  } catch (err) {
    process.stderr.write(`nemia: the series were not kept on this pass: ${err instanceof Error ? err.message : String(err)}\n`);
  }
  return performance.now() - t0;
};

/** The machine's load over the last minute, per core it has. */
const loadNow = (): number => {
  const [lastMinute = 0] = os.loadavg();
  return lastMinute / os.availableParallelism();
};

/**
 * What a pass is handed from outside: where a queued card starts, the memo, whether it verifies, the quota the daemon last read, and
 * what its last sweep of the store's disk read (`disk`), which the pass keeps and never measures.
 */
export type TickOptions = {
  repo?: string;
  memo?: RestMemo;
  verifyRest?: boolean;
  quota?: () => Reading | undefined;
  disk?: () => DiskReading | undefined;
};

/**
 * Every run, advanced once, after one engine tick — then, with a run slot free, the queue's next card started. This is the whole daemon: an
 * Effect program that requires the engine as a service (`EngineService`).
 *
 * First, the engine's own tick, which admits what waits per pool under the ceiling `engine()` gave it (`WF_MAX_CONCURRENT`), the filed
 * `priority` first, and starts it on its next pass. So a task filed on this pass is admitted on the next and started on the one after,
 * and a slot freed is taken a pass after it is freed.
 *
 * Every run that has started first, which the cap on runs in flight (`WF_MAX_RUNS`) never holds: what each has in flight once its pass is
 * done is what the cap counts. Then each run with nothing filed, oldest first (`admissionOrder`), judged against the runs in flight so far
 * — and counted, once it filed, for the next (`runAdmitted`). Then, while a slot is still free (`slotFree`) — always, with no cap — one
 * queued card is started, on `repo` when its card names none: one per pass, so the next pass counts its run before another is started;
 * when the queue started no run, one due schedule's run, as a person's `nemia start --factory` is (`startDue`). Nothing is carried
 * between passes: the next one counts again.
 *
 * A run at rest — finished, every task settled, nothing due and nothing done — is answered from the memo of the passes before (`RestMemo`)
 * while none of its inputs changed, and costs no read of the engine and no git of its own: see `restMemo`.
 *
 * Metered as it goes (`meteredPass`), and its cost written down (`recordPassCost`), kept among the recent passes (`recordRecentPass`) with
 * the quota `quota` reads, the disk's reading `disk` hands and the checks the pass filed, rolled from there into the series
 * (`keepSeries`), put into the pass's metrics (`recordPassMetrics`) and returned. A pass run inside another's meter — a test that meters
 * its own — is counted as part of that one and carries no cost of its own. What each run's full pass read of its steps
 * (`Advanced`'s `facts`) goes into the steps' metrics (`recordStepMetrics`), once, on every pass.
 *
 * `memo` is the memo to answer from and keep, the engine's own by default: a fresh one each pass (`freshRestMemo`) is a daemon restarted
 * before every pass, which answers every run afresh. `verifyRest` judges every run the memo answers again as a full pass would, and dies
 * where the two differ — the tests' (`WF_VERIFY_REST=1`, `verifiesRest`), never the daemon's, since it spends all that the memo saves.
 *
 * Fails with the refusal a read threw (`Refusal`: the ceilings, `WF_VERIFY_REST`, a record); dies of anything else.
 */
export const tickRun = Effect.fn('tick')(function* ({ repo, memo, verifyRest, quota, disk }: TickOptions = {}) {
  const e = yield* EngineService;
  const options: PassOptions = {
    repo: repo ?? process.cwd(),
    memo: memo ?? restMemo(e),
    verify: verifyRest ?? (yield* tried(() => verifiesRest())),
  };
  const { io0, value, ms, tallies, io1 } = yield* talliedIn(
    e,
    Effect.gen(function* () {
      const io0 = yield* ioOf(e);
      return { io0, ...(yield* meteredPass(pass(meteredEngine(e), options))), io1: yield* ioOf(e) };
    }),
  );
  yield* recordStepMetrics(value.runs.flatMap((advanced) => advanced.facts ?? []));
  if (!tallies) return value;
  const t0 = performance.now();
  const measured = costOf(tallies, ms, io0, io1);
  const cost: PassCost = {
    ...measured,
    overheadMs: measured.overheadMs + (performance.now() - t0),
    ...(value.unobserved ? { unobserved: value.unobserved } : {}),
  };
  const written = yield* tried(() => {
    const recent = recordRecentPass(cost, RECENT_KEPT, { quota: quota?.(), checks: tallies.checks, disk: disk?.() });
    return recordPassCost(cost) + recent.ms + seriesKept(recent.kept);
  });
  yield* recordPassMetrics(cost);
  return { ...value, cost: { ...cost, overheadMs: cost.overheadMs + written } };
});

/**
 * The pass `tickRun` meters: the runtime's own pass, then every run judged off the views it reported (`reportedEngine`) — a task it did not
 * report, settled or changed by this pass since, is read off the engine's record where it is settled. In this order:
 * - the memo is brought up to the engine's feed after the runtime's pass (`restingPass`), so what it appended on it — a settled task's
 *   `measured` — is read on this one, and what is appended after is read on the next; a run `nemia rm` forgot leaves the memo
 *   (`forgotten`).
 * - the runs are listed, each run the memo holds whose stamp has not moved answered with the memo's run, its record not read (`keptOf`):
 *   the one listing of the pass, handed to every run judged for the claims on a repository's checkout, and to the queue; with it, the cap's
 *   slots and the runs others wait on, each read once for the pass where a run asks (`passRead`), off where the pass read their
 *   repositories stand, one `standing` for each repository, place and base branch (`passStanding`).
 * - the ceilings the pass runs with are written (`recordCeilings`), for `nemia ls` and `nemia decide`, which judge the cap from a shell of
 *   their own; the runtime's pass admitted no queued task while the store was paused (`engine()`'s `unschedulable`).
 * - every run that has started is judged, finished ones included (`advanceResting`); then each run with nothing filed, oldest first, with
 *   its slot (`waitingJudged`); then one queued card, while a slot is free and the store is not paused, read again; else, on the same
 *   terms, one schedule's due fire (`startDue`).
 * - then the tasks of runs `nemia rm` removed that had not settled are forgotten (`finishForgetting`), and what it says is the pass's.
 * - last, and apart, the feed is written where it changed: a feed that cannot be written costs the report (`feedError`), never the pass.
 *
 * A run a read of whose task journal is refused (`unreadableJournal`), or that froze no workflow and whose folder does not load
 * (`unloadedFolder`), is left unjudged, out of the feed's `removed` and counted in flight (`judged`); a pause's reads leave it out
 * (`stepsOrNone`). An engine's report that carries no refusals — a test's fake — is read as having none.
 *
 * Its span says how many runs the store listed (`runs`) and how many of them were answered from memory (`rested`), which make no span of
 * their own: a pass traces what it does, as many spans over many runs at rest as over few.
 */
const pass = Effect.fn('pass')(function* (engine: Engine, { repo, memo, verify }: PassOptions) {
  const report = yield* asked('tick', engine.tick());
  noteSeen({ ...sessionsOf(report, Date.now()), load: loadNow() });
  const e = reportedEngine(engine, report.views ?? []);
  const resting = yield* restingPass(e, memo, verify);
  const ran = yield* tried(() => ceilings());
  yield* tried(() => within('act', () => recordCeilings(ran)));
  const runs = yield* (yield* RunDoor).runs.list(undefined, resting && keptOf(resting));
  if (resting) forgotten(memo, runs);
  noteSeen({ runs: runs.length });
  const pause = yield* tried(() => readPause());
  const judging: Judging = { done: new Map(), unjudged: new Map() };
  const standing = yield* passStanding(runs, memo.standing);
  const read: PassRead = passRead(e, runs, process.env, standing);
  for (const run of runs.filter(hasStarted)) yield* judged(e, judging, read, run, resting);
  const counted = yield* waitingJudged(e, judging, read, resting, ran.runs);
  const queue =
    slotFree({ inFlight: counted, cap: ran.runs }) && !(yield* tried(() => readPause()))
      ? yield* withinEffect('act', startQueued(repo, runs))
      : undefined;
  const scheduled =
    !(queue && 'run' in queue) && slotFree({ inFlight: counted, cap: ran.runs }) && !(yield* tried(() => readPause()))
      ? yield* withinEffect('act', startDue(repo, runs))
      : undefined;
  const forgetting = yield* withinEffect('act', finishForgetting().pipe(over(e)));
  yield* Effect.annotateCurrentSpan({ runs: runs.length, rested: resting?.rested ?? 0 });
  return {
    ...passOf(report, runs, judging, queue, yield* feedErrorOf(runs, judging, pause)),
    ...(scheduled ? { scheduled } : {}),
    ...(forgetting.length ? { forgetting } : {}),
    ...(pause
      ? {
          pause: { pause, finishing: finishingReported(runs, report.views ?? []), ...(yield* heldRead(e, runs, standingReader(standing))) },
        }
      : {}),
  };
});

/** Each task of `runs` still finishing under the pause (`finishingAmong`), read off the views the runtime reported on the pass. */
const finishingReported = (runs: readonly Run[], views: readonly TaskView[]): Finishing[] => {
  const reported = new Map(views.map((v) => [v.id, v]));
  return finishingAmong(runs, (taskId) => reported.get(taskId), stepsOrNone);
};

/** What a pass has judged so far: each run it advanced, and each run it left unjudged with why (`Unjudged`). */
type Judging = { done: Map<string, Advanced>; unjudged: Map<string, Pick<Unjudged, 'why' | 'by'>> };

/**
 * Why a run was left unjudged: a read of one of its tasks' journals was refused (`unreadableJournal`), in the runtime's words, `by` the
 * `journal`; or it froze no workflow and its folder does not load (`unloadedFolder`), in the refusal's words, `by` the `folder`.
 */
class Unjudged extends Data.TaggedError('Unjudged')<{ why: string; by: 'journal' | 'folder' }> {}

/** Every run the memo holds that the store no longer lists taken out of it: a run `nemia rm` forgot. */
const forgotten = (memo: RestMemo, runs: readonly Run[]): void => {
  const listed = new Set(runs.map((r) => r.id));
  for (const id of memo.runs.keys()) if (!listed.has(id)) memo.runs.delete(id);
};

/**
 * One run of the pass's listing (`PassRead`) judged into `judging` (`advanceResting`), and what it was judged: undefined when a read of its
 * journal was refused or its unfrozen folder does not load, the run then left unjudged with why (`Unjudged`).
 */
const judged = (e: Engine, judging: Judging, pass: PassRead, run: Run, resting: RestingPass | undefined, slot?: RunSlot) =>
  advanceResting(e, run, pass, resting, slot).pipe(
    Effect.map((advanced): Advanced | undefined => {
      judging.done.set(run.id, advanced);
      return advanced;
    }),
    Effect.catchTag('Unjudged', ({ why, by }) =>
      Effect.sync(() => {
        judging.unjudged.set(run.id, { why, by });
        return undefined;
      }),
    ),
  );

/**
 * Each run with nothing filed judged, oldest first (`admissionOrder`), against the runs in flight so far under the cap `cap`: those the
 * pass judged in flight and those it left unjudged, and each waiting run once it filed or went unjudged. Answers the runs in flight at the
 * end.
 */
const waitingJudged = Effect.fn('waitingJudged')(function* (
  e: Engine,
  judging: Judging,
  pass: PassRead,
  resting: RestingPass | undefined,
  cap: RunSlot['cap'],
) {
  let counted = [...judging.done.values()].filter((a) => a.inFlight).length + judging.unjudged.size;
  for (const run of admissionOrder(pass.runs.filter((r) => !hasStarted(r)))) {
    const advanced = yield* judged(e, judging, pass, run, resting, { inFlight: counted, cap });
    if (!advanced || advanced.inFlight) counted++;
  }
  return counted;
});

/** A run's feed as the pass judged it, keyed by its id, for `emitFeed`: none for a run the pass did not judge. */
const feedOf = <F>(id: string, judged: { feed: F } | undefined): (readonly [string, F])[] => (judged ? [[id, judged.feed] as const] : []);

/**
 * Why the feed could not be written with what the pass judged (`emitFeed`) and the store's pause it read at its start (`pause`, whose
 * put and lift the feed says), or undefined once it was: never the pass's failure.
 */
const feedErrorOf = (runs: readonly Run[], { done, unjudged }: Judging, pause: Pause | null): Effect.Effect<string | undefined> =>
  Effect.exit(
    emitFeed(new Map(runs.flatMap((run) => feedOf(run.id, done.get(run.id)))), {
      unjudged: new Set(unjudged.keys()),
      pause,
    }),
  ).pipe(
    Effect.map((written) =>
      Exit.isSuccess(written)
        ? undefined
        : `the feed (${feedFile()}) was not written on this pass: ${(Cause.squash(written.cause) as Error).message}`,
    ),
  );

/**
 * The pass as reported, with why the feed was not written (`feedErrorOf`): each run judged in the store's order, the queue's card, and
 * the runtime's refused moves and unreadable journals — the runtime's line for a cause a run was left unjudged for said once, on the
 * run's line — and each run left out because its unfrozen folder does not load, in the refusal's words.
 */
const passOf = (
  report: TickReport,
  runs: readonly Run[],
  judging: Judging,
  queue: QueueStarted | undefined,
  feedError: string | undefined,
): Pass => {
  const refused = report.refused ?? [];
  const unobserved = report.unobserved ?? [];
  const causes = new Set([...judging.unjudged.values()].filter((u) => u.by === 'journal').map((u) => u.why));
  const unreadable = [
    ...(report.unreadable ?? []).filter((why) => !causes.has(why)),
    ...[...judging.unjudged].map(([id, { why, by }]) =>
      by === 'journal'
        ? `${id} is not advanced while a task it reads is unreadable: ${why}`
        : `${id} is not advanced while its workflow folder does not load: ${why}`,
    ),
  ];
  return {
    runs: runs.flatMap((run) => judging.done.get(run.id) ?? []),
    ...(queue ? { queue } : {}),
    ...(feedError ? { feedError } : {}),
    ...(refused.length ? { refused } : {}),
    ...(unreadable.length ? { unreadable } : {}),
    ...(unobserved.length ? { unobserved } : {}),
  };
};

/**
 * What the tick remembers of the runs at rest (`atRest`), in memory and nowhere else: for each, what its last full pass answered, and the
 * inputs it answered on — its files in the store (`restStamps`), the run as read, and the result branches whose tips it would read. And
 * `cursor`, where on the engine's feed the memo has read to: every task of every run appends to it (the runtime's journal), so an event for
 * a task of a run the memo holds takes the run out of it (`evictedBy`). Undefined until the first pass reads the feed. And `standing`,
 * what the pass's `standing` last read of each result branch against its run's `baseRef` (`StandingMemo`), which the place believes only
 * while the branch's commit is the one it was read of.
 *
 * A cache of a pure function, never a source of truth: nothing is written for it, a restarted daemon starts with an empty one and reads
 * and judges every run afresh, and no verb, `nemia ls` or the api reads it. While a run's stamp holds, the pass is handed the memo's run in
 * place of its record (`keptOf`): an input of the run that the stamp does not cover is never read again.
 */
export type RestMemo = {
  cursor?: number;
  runs: Map<string, { stamp: string; run: Run; tipped: string[]; advanced: Omit<Advanced, 'run' | 'facts'> }>;
  settled?: ReadonlySet<string>;
  standing: StandingMemo;
};

/** A memo that holds nothing: what a daemon starts with, and what a test hands each pass to play a restart. */
export const freshRestMemo = (): RestMemo => ({ runs: new Map(), standing: freshStandingMemo() });

/** Each engine's memo: one engine is one daemon's (`nemia up` makes one for all its passes), and one a test builds starts with none. */
const memos = new WeakMap<Engine, RestMemo>();
const restMemo = (e: Engine): RestMemo => {
  let memo = memos.get(e);
  if (!memo) memos.set(e, (memo = freshRestMemo()));
  return memo;
};

/**
 * What a pass answers runs at rest by: the memo, read up to date with the feed, and the store's stamps; and how many runs it has answered
 * from memory so far (`rested`), this pass's alone.
 */
type RestingPass = {
  memo: RestMemo;
  stamps: Map<string, string>;
  verify: boolean;
  rested: number;
};

/** The memo's run for an id whose stamp is the one it was kept at, for the store to list in place of reading its record; else nothing. */
const keptOf =
  ({ memo, stamps }: RestingPass) =>
  (id: string): Run | undefined => {
    const kept = memo.runs.get(id);
    return kept !== undefined && kept.stamp === stamps.get(id) ? kept.run : undefined;
  };

/**
 * The memo brought up to the engine's feed — every run a task of which appended since takes it out — and the store stamped, before the pass
 * reads a record. Undefined, and nothing answered from memory, for an engine with no feed: without it nothing says a task moved.
 *
 * A memo that has read nothing reads the feed from its end: it holds no run a line before could concern. A journal with no feed yet
 * answers with the cursor it was given, and the memo then reads from the start on the next pass. A feed that went back — a journal
 * replaced or cut — or cannot be read empties the memo, and the next pass reads it from its end again (`followedFeed`).
 */
const restingPass = Effect.fn('restingPass')(function* (e: Engine, memo: RestMemo, verify: boolean) {
  if (typeof e.feed !== 'function') return undefined;
  if (!(yield* followedFeed(e, memo))) return undefined;
  const stamps = yield* (yield* RunDoor).runs.stamps();
  const resting: RestingPass = { memo, verify, stamps, rested: 0 };
  return resting;
});

/**
 * A run's full pass (`advancePass`), the pass's reads (`PassRead`) handed on: what it advanced, what holds it out of rest, and what it
 * rests on. Fails with `Unjudged` where a read of one of its tasks' journals was refused (`unreadableJournal`), or where it froze no
 * workflow and its folder does not load (`unloadedFolder`); with a refusal where the pass refused, and dies of anything else.
 */
const fullPass = Effect.fnUntraced(function* (e: Engine, run: Run, pass: PassRead, slot?: RunSlot) {
  const exit = yield* Effect.exit(advancePass(e, run, slot, pass).pipe(over(e)));
  if (Exit.isSuccess(exit)) return exit.value;
  const err = Cause.squash(exit.cause);
  const journal = unreadableJournal(err);
  if (journal !== undefined) return yield* new Unjudged({ why: journal, by: 'journal' });
  const folder = unloadedFolder(err);
  return folder === undefined ? yield* Effect.failCause(exit.cause) : yield* new Unjudged({ why: folder, by: 'folder' });
});

/**
 * One run's pass, answered from the memo where the run was at rest on its last full pass and nothing it was judged by has changed: its
 * files in the store stamp the same, the pass was handed the memo's own run for it (`keptOf`), nothing of its tasks is on the feed since
 * (`restingPass`), and every result branch it would read the tip of is where its record says (`tipsSeen`, off the heads the pass's one
 * `standing` a repository read, `tipsHold`). Otherwise a full pass (`advancePass`), kept in the memo if the run is at rest after it and the
 * pass left the run as it read.
 *
 * Answered from memory, it costs no journal read, no observe and no git process of its own, and is counted (`rested`). With `verify`, it is
 * judged in full as well (`verified`), and a difference is died of: a change the memo missed is a bug in what it watches. Untraced: a run
 * judged in full is traced by its full pass (`advancePass`), and one answered from memory makes no span, counted on the pass's own.
 *
 * `pass` holds the pass's one listing, `run` among them, handed to every full pass as the runs whose claims on a repository's checkout are
 * read (`checkoutHold`): the store is not listed again, nor the cap's slots read, nor a run others wait on, twice in a pass. `slot` is
 * `advance`'s, handed on to every full pass. A run with nothing filed comes here too — one called off before it started rests like any
 * other — and its answer from memory does not hang on the slot: a run at rest has nothing ready (`atRest`), and only a run with a step
 * ready wants a slot (`slotNeed`), so the cap holds it on no pass and it counts on none.
 */
const advanceResting = Effect.fnUntraced(function* (e: Engine, run: Run, pass: PassRead, resting: RestingPass | undefined, slot?: RunSlot) {
  if (!resting) return (yield* fullPass(e, run, pass, slot)).advanced;
  const { memo, stamps, verify } = resting;
  const stamp = stamps.get(run.id);
  const kept = memo.runs.get(run.id);
  const unchanged = kept !== undefined && stamp !== undefined && kept.stamp === stamp && kept.run === run;
  if (unchanged && tipsHold(run, kept.tipped, pass)) {
    countRested();
    resting.rested++;
    if (verify) yield* verified(e, run, pass, slot, kept.advanced);
    return { ...kept.advanced, run };
  }
  memo.runs.delete(run.id);
  const record = JSON.stringify(run);
  const { advanced, rest } = yield* fullPass(e, run, pass, slot);
  if (rest && stamp !== undefined && JSON.stringify(run) === record) {
    const { run: _, facts: __, ...answered } = advanced;
    memo.runs.set(run.id, { stamp, run, tipped: rest.tipped, advanced: answered });
  }
  return advanced;
});

/**
 * Whether every result branch the run rests on is where its record says (`tipsSeen`), off the heads the pass read (`headsFor`): never where
 * the pass did not read them, and the run is then judged in full.
 */
const tipsHold = (run: Run, tipped: readonly string[], pass: PassRead): boolean => {
  if (!tipped.length || !isRepositoryRun(run)) return true;
  const heads = pass.standing && headsFor(pass.standing, run);
  return heads !== undefined && tipsSeen(run, tipped, heads) === undefined;
};

/**
 * A run the memo answered, its record read afresh and judged in full as well (`fullPass`): nothing where the two agree, and a defect naming
 * the run where its record reads otherwise than the memo's run, or where the full pass answers otherwise, finds it not at rest, or changed
 * the run it read.
 */
const verified = Effect.fn('verified')(function* (
  e: Engine,
  run: Run,
  pass: PassRead,
  slot: RunSlot | undefined,
  kept: Omit<Advanced, 'run'>,
) {
  const fresh = yield* (yield* RunDoor).runs.read(RunId.read(run.id));
  const record = JSON.stringify(fresh);
  if (record !== JSON.stringify(run))
    return yield* Effect.die(
      new Error(
        `the tick answered ${run.id} from its memo of runs at rest, and its record reads otherwise than the memo's run: ` +
          `an input of the run changed that its stamp does not watch (restStamps), or the memo's run was changed in memory`,
      ),
    );
  const {
    advanced: { run: _, ...judged },
    blockers,
    rest,
  } = yield* fullPass(e, fresh, pass, slot);
  if (rest && isDeepStrictEqual(judged, kept) && JSON.stringify(fresh) === record) return;
  return yield* Effect.die(
    new Error(
      `the tick answered ${run.id} from its memo of runs at rest, and a full pass ${rest ? 'answers otherwise' : `finds it not at rest (${blockers.join(', ')})`}: ` +
        `an input of the run changed that the memo does not watch (rest.ts) — memo ${JSON.stringify(kept)}, pass ${JSON.stringify(judged)}`,
    ),
  );
});
