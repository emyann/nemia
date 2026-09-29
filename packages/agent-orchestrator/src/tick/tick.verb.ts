/**
 * The tick: every run advanced once a pass (`tick`, `pass`), and the memo of runs at rest that answers a run whose inputs did not change
 * without a read of the engine (`RestMemo`, `advanceResting`). This is the whole daemon. A controller, reaching the runtime through the
 * client (`runtime-client.ts`).
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { refusedText, unreadableJournal, type Engine, type RefusedMove } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import type { QueueStarted } from '../inbox/inbox.ts';
import { tipsSeen } from '../branches/branches.ts';
import { admissionOrder, slotFree, type RunSlot } from '../cap/cap.ts';
import { isGitRun, type Run } from '../record/record.ts';
import { hasStarted } from '../wait/wait.ts';
import { listRuns, restStamps, stepsOf } from '../record/record.store.ts';
import { ceilings, recordCeilings, recordPassCost } from '../daemon/daemon.store.ts';
import { verifiesRest } from '../config/config.store.ts';
import { feedFile, recordFeed } from '../feed/feed.store.ts';
import { headsOf } from '../branches.ts';
import { evictedBy } from '../rest/rest.ts';
import { reportedEngine } from '../views/views.verb.ts';
import { startQueued } from '../inbox/inbox.verb.ts';
import { momentumOf, toAdmit } from '../cap/cap.ts';
import { countRested, metered, within } from '../meter/tally.store.ts';
import type { PassCost } from '../meter/meter.ts';
import { advanceRun, type Advanced } from './advance.verb.ts';
import { costOf, ioOf, meteredEngine } from '../meter/meter.verb.ts';

/** One pass: every run advanced, in the store's order, and what the pass did with the queue of inbox cards, when it did anything (`startQueued`). */
export type Pass = {
  runs: Advanced[];
  queue?: QueueStarted;
  /** Why the feed could not be written on this pass (`recordFeed`), when it could not: the pass itself went on, since nothing reads the feed to decide. */
  feedError?: string;
  /**
   * What the pass cost, phase by phase (`PassCost`), as written to the store for `wf up --stats` and the api (`recordPassCost`) — its
   * `overheadMs` here with that write in it, which the file cannot hold of itself.
   */
  cost?: PassCost;
  /**
   * The moves the runtime's lifecycle had no edge for on this pass (`TickReport.refused`): each task stalls, asked again every pass, until
   * what it sees changes or the machine gains the edge. Absent when there were none. `wf up` says each once while it lasts (`refusalLines`).
   */
  refused?: RefusedMove[];
  /**
   * Why the runtime left a task out of this pass, or skipped a feed entry, as it said it (`TickReport.unreadable`): a journal holding an
   * entry no runtime wrote, on every pass while it lasts. And each run a read of whose tasks rejected so (`unreadableJournal`): it is left
   * out of `runs` and of the feed, judged on no pass until the journal reads, and counted in flight, while every other run advances; its
   * line carries the runtime's words, said once. Absent when there were none. `wf up` says each once while it lasts.
   */
  unreadable?: string[];
};

/**
 * What a daemon says of a pass's refused moves, and what it has then said: a refusal it said on an earlier pass and that is still refused is
 * not said again, one that cleared is forgotten, so it is said again if it comes back. `said` holds the refusals of the last pass alone, by
 * task, state and event: a daemon that restarts says every refusal still standing once more, since what it printed before is on a terminal
 * that may be gone. Nothing is decided on it: this is only what has been printed, as `wf up`'s queue and feed failures are.
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

/**
 * Every run, advanced once, after one engine tick — then, with a run slot free, the queue's next card started. This is the whole daemon.
 *
 * First, what the engine's tick saw waiting is admitted per pool under `WF_MAX_CONCURRENT` (`toAdmit`), off the views its pass built from its
 * one observation of each harness; the engine starts it on its next pass. So a task filed on this pass is admitted on the next and started on
 * the one after, and a slot freed is taken a pass after it is freed.
 *
 * Every run that has started first, which the cap on runs in flight (`WF_MAX_RUNS`) never holds: what each has in flight once its pass is done
 * is what the cap counts. Then each run with nothing filed, oldest first (`admissionOrder`), judged against the runs in flight so far — and
 * counted, once it filed, for the next (`runAdmitted`). Then, while a slot is still free (`slotFree`) — always, with no cap — one queued card
 * is started, on `repo` when its card names none: one per pass, so the next pass counts its run before another is started. Nothing is carried
 * between passes: the next one counts again.
 *
 * A run at rest — finished, every task settled, nothing due and nothing done — is answered from the memo of the passes before (`RestMemo`)
 * while none of its inputs changed, and costs no read of the engine and no git of its own: see `restMemo`.
 *
 * Metered as it goes (`tally.store.ts`), and its cost written down (`recordPassCost`) and returned. A pass run inside another's meter — a
 * test that meters its own — is counted as part of that one and carries no cost of its own.
 *
 * `memo` is the memo to answer from and keep, the engine's own by default: a fresh one each pass (`freshRestMemo`) is a daemon restarted
 * before every pass, which answers every run afresh. `verifyRest` judges every run the memo answers again as a full pass would, and throws
 * where the two differ — the tests' (`WF_VERIFY_REST=1`, `verifiesRest`), never the daemon's, since it spends all that the memo saves.
 */
export async function tick(
  e: Engine,
  {
    repo = process.cwd(),
    memo = restMemo(e),
    verifyRest = verifiesRest(),
  }: {
    repo?: string;
    memo?: RestMemo;
    verifyRest?: boolean;
  } = {},
): Promise<Pass> {
  const io0 = ioOf(e);
  const { value, ms, tallies } = await metered(() => pass(meteredEngine(e), repo, memo, verifyRest));
  if (!tallies) return value;
  const t0 = performance.now();
  const measured = costOf(tallies, ms, io0, ioOf(e));
  const cost = { ...measured, overheadMs: measured.overheadMs + (performance.now() - t0) };
  const written = recordPassCost(cost);
  return { ...value, cost: { ...cost, overheadMs: cost.overheadMs + written } };
}

/**
 * The pass `tick` meters: the runtime's own pass, then every run judged off the views it reported (`reportedEngine`) — a task it did not
 * report, settled or changed by this pass since, is read off the engine's record where it is settled. In this order:
 * - the memo is brought up to the engine's feed after the runtime's pass (`restingPass`), so what it appended on it — a settled task's
 *   `measured` — is read on this one, and what is appended after is read on the next; a run `wf rm` forgot leaves the memo.
 * - the ceilings the pass runs with are written (`recordCeilings`), for `wf ls` and `wf decide`, which judge the cap from a shell of their
 *   own.
 * - queued tasks are admitted off the views the runtime's pass reported (`toAdmit`), never off a read of `e.list()` or `e.view`, which
 *   would ask each harness again; with nothing to admit the engine is not called, since a call costs two reads of its totals.
 * - every run that has started is judged, finished ones included (`advanceResting`); then each run with nothing filed, oldest first, with
 *   its slot; then one queued card, while a slot is free.
 * - last, and apart, the feed is written where it changed: a feed that cannot be written costs the report (`feedError`), never the pass.
 *
 * A run a read of whose task journal is refused (`unreadableJournal`) is left unjudged, out of the feed's `removed` and counted in
 * flight; the runtime's own line for that cause is said once, on the run's line. Any other error is thrown. An engine's report that
 * carries no refusals — a test's fake — is read as having none.
 */
async function pass(engine: Engine, repo: string, memo: RestMemo, verify: boolean): Promise<Pass> {
  const report = await engine.tick();
  const e = reportedEngine(engine, report.views ?? []);
  const resting = await restingPass(e, memo, verify);
  const ran = ceilings();
  within('act', () => recordCeilings(ran));
  const cap = ran.runs;
  const runs = listRuns();
  if (resting) {
    const listed = new Set(runs.map((r) => r.id));
    for (const id of memo.runs.keys()) if (!listed.has(id)) memo.runs.delete(id);
  }
  const admitting = toAdmit({ views: report.views, momentum: momentumOf(runsWithSteps(runs)), ceiling: ran.sessions });
  if (admitting.length) await e.admit(admitting);
  const done = new Map<string, Advanced>();
  const unjudged = new Map<string, string>();
  const judged = async (run: Run, slot?: RunSlot): Promise<Advanced | undefined> => {
    try {
      return await advanceResting(e, run, resting, slot);
    } catch (err) {
      const why = unreadableJournal(err);
      if (why === undefined) throw err;
      unjudged.set(run.id, why);
      return undefined;
    }
  };
  for (const run of runs.filter(hasStarted)) {
    const advanced = await judged(run);
    if (advanced) done.set(run.id, advanced);
  }
  let counted = [...done.values()].filter((a) => a.inFlight).length + unjudged.size;
  for (const run of admissionOrder(runs.filter((r) => !hasStarted(r)))) {
    const advanced = await judged(run, { inFlight: counted, cap });
    if (advanced) done.set(run.id, advanced);
    if (!advanced || advanced.inFlight) counted++;
  }
  const queue = slotFree({ inFlight: counted, cap }) ? within('act', () => startQueued(repo, runs)) : undefined;
  let feedError: string | undefined;
  try {
    recordFeed(new Map(runs.flatMap((run) => (done.has(run.id) ? [[run.id, done.get(run.id)!.feed] as const] : []))), {
      unjudged: new Set(unjudged.keys()),
    });
  } catch (err) {
    feedError = `the feed (${feedFile()}) was not written on this pass: ${(err as Error).message}`;
  }
  const refused = report.refused ?? [];
  const causes = new Set(unjudged.values());
  const unreadable = [
    ...(report.unreadable ?? []).filter((why) => !causes.has(why)),
    ...[...unjudged].map(([id, why]) => `${id} is not advanced while a task it reads is unreadable: ${why}`),
  ];
  return {
    runs: runs.flatMap((run) => done.get(run.id) ?? []),
    ...(queue ? { queue } : {}),
    ...(feedError ? { feedError } : {}),
    ...(refused.length ? { refused } : {}),
    ...(unreadable.length ? { unreadable } : {}),
  };
}

/**
 * What the tick remembers of the runs at rest (`atRest`), in memory and nowhere else: for each, what its last full pass answered, and the
 * inputs it answered on — its files in the store (`restStamps`), its record as read, and the result branches whose tips it would read. And
 * `cursor`, where on the engine's feed the memo has read to: every task of every run appends to it (the runtime's journal), so an event for
 * a task of a run the memo holds takes the run out of it (`evictedBy`). Undefined until the first pass reads the feed.
 *
 * A cache of a pure function, never a source of truth: nothing is written for it, a restarted daemon starts with an empty one and judges
 * every run afresh, and no verb, `wf ls` or the api reads it.
 */
export type RestMemo = {
  cursor?: number;
  runs: Map<string, { stamp: string; record: string; tipped: string[]; advanced: Omit<Advanced, 'run'> }>;
};

/** A memo that holds nothing: what a daemon starts with, and what a test hands each pass to play a restart. */
export const freshRestMemo = (): RestMemo => ({ runs: new Map() });

/** Each engine's memo: one engine is one daemon's (`wf up` makes one for all its passes), and one a test builds starts with none. */
const memos = new WeakMap<Engine, RestMemo>();
const restMemo = (e: Engine): RestMemo => {
  let memo = memos.get(e);
  if (!memo) memos.set(e, (memo = freshRestMemo()));
  return memo;
};

/** What a pass answers runs at rest by: the memo, read up to date with the feed, the store's stamps, and git's heads once per repository. */
type RestingPass = { memo: RestMemo; stamps: Map<string, string>; heads: (repo: string) => Record<string, string>; verify: boolean };

/**
 * The memo brought up to the engine's feed — every run a task of which appended since takes it out — and the store stamped, before the pass
 * reads a record. Undefined, and nothing answered from memory, for an engine with no feed: without it nothing says a task moved.
 *
 * A memo that has read nothing reads the feed from its end: it holds no run a line before could concern. A journal with no feed yet
 * answers with the cursor it was given, and the memo then reads from the start on the next pass. A feed that went back — a journal
 * replaced or cut — or cannot be read empties the memo, and the next pass reads it from its end again.
 */
async function restingPass(e: Engine, memo: RestMemo, verify: boolean): Promise<RestingPass | undefined> {
  if (typeof e.feed !== 'function') return undefined;
  try {
    if (memo.cursor === undefined) {
      memo.runs.clear();
      const { cursor } = await e.feed(Number.MAX_SAFE_INTEGER);
      memo.cursor = cursor >= Number.MAX_SAFE_INTEGER ? 0 : cursor;
    } else {
      const { entries, cursor } = await e.feed(memo.cursor);
      if (cursor < memo.cursor) memo.runs.clear();
      else
        for (const id of evictedBy(
          entries.map((f) => f.taskId),
          new Set(memo.runs.keys()),
        ))
          memo.runs.delete(id);
      memo.cursor = cursor;
    }
  } catch {
    memo.runs.clear();
    memo.cursor = undefined;
    return undefined;
  }
  const heads = new Map<string, Record<string, string>>();
  return {
    memo,
    verify,
    stamps: restStamps(),
    heads: (repo) => {
      const at = path.resolve(repo);
      if (!heads.has(at)) heads.set(at, headsOf(at));
      return heads.get(at)!;
    },
  };
}

/**
 * One run's pass, answered from the memo where the run was at rest on its last full pass and nothing it was judged by has changed:
 * its files in the store stamp the same, its record reads the same, nothing of its tasks is on the feed since (`restingPass`), and every
 * result branch it would read the tip of is where its record says (`tipsSeen`, off one `for-each-ref` a repository). Otherwise a full pass
 * (`advanceRun`), kept in the memo if the run is at rest after it.
 *
 * Answered from memory, it costs no journal read, no observe and no git process of its own, and is counted (`rested`). With `verify`, it is
 * judged in full as well, and a difference throws: a change the memo missed is a bug in what it watches.
 *
 * `slot` is `advance`'s, handed on to every full pass. A run with nothing filed comes here too — one called off before it started rests like
 * any other — and its answer from memory does not hang on the slot: a run at rest has nothing ready (`atRest`), and only a run with a step
 * ready wants a slot (`slotNeed`), so the cap holds it on no pass and it counts on none.
 */
async function advanceResting(e: Engine, run: Run, resting: RestingPass | undefined, slot?: RunSlot): Promise<Advanced> {
  if (!resting) return (await advanceRun(e, run, slot)).advanced;
  const { memo, stamps, heads, verify } = resting;
  const stamp = stamps.get(run.id);
  const record = JSON.stringify(run);
  const kept = memo.runs.get(run.id);
  if (
    kept &&
    stamp !== undefined &&
    kept.stamp === stamp &&
    kept.record === record &&
    (!kept.tipped.length || !isGitRun(run) || tipsSeen(run, kept.tipped, heads(run.repo)) === undefined)
  ) {
    countRested();
    if (verify) {
      const {
        advanced: { run: _, ...judged },
        blockers,
        rest,
      } = await advanceRun(e, run, slot);
      if (!rest || !isDeepStrictEqual(judged, kept.advanced) || JSON.stringify(run) !== record) {
        throw new Error(
          `the tick answered ${run.id} from its memo of runs at rest, and a full pass ${rest ? 'answers otherwise' : `finds it not at rest (${blockers.join(', ')})`}: ` +
            `an input of the run changed that the memo does not watch (rest.ts) — memo ${JSON.stringify(kept.advanced)}, pass ${JSON.stringify(judged)}`,
        );
      }
    }
    return { ...kept.advanced, run };
  }
  memo.runs.delete(run.id);
  const { advanced, rest } = await advanceRun(e, run, slot);
  if (rest && stamp !== undefined) {
    const { run: _, ...answered } = advanced;
    memo.runs.set(run.id, { stamp, record, tipped: rest.tipped, advanced: answered });
  }
  return advanced;
}

/** Each run with its workflow's steps, for `momentumOf`; a run whose workflow does not read names no task. */
function* runsWithSteps(runs: readonly Run[]): Generator<{ run: Run; steps: Workflow[] }> {
  for (const run of runs) {
    let steps: Workflow[];
    try {
      steps = stepsOf(run);
    } catch {
      continue;
    }
    yield { run, steps };
  }
}
