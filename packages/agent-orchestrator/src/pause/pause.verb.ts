/**
 * The store's pause that parks every session at its tool call's end (`pauseParked`), and the pause at once (`nemia pause --now`): what it
 * would cut, read off one view of every run's current tasks and never stored (`nowRead`), and the verb that puts the pause, or keeps the
 * one that stands, cuts its timeout to 0 so every session's call is cut and the session parked, then writes for each check at work the ask
 * that runs it again on the resume and asks the engine to stop it (`pauseNow`). A controller: it reaches the engine through the client,
 * and writes a person's files — the pause through `putPause` and `cutPause`, each ask through `runStore.asks.write` — never a run's
 * record.
 */
import { Effect } from 'effect';
import { EngineService, asked, sessionsDrained, tried } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { keptRuns, runStore } from '../record/files.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { stopAsked } from '../tick/held.verb.ts';
import { cutPause, putPause, readPause } from './pause.store.ts';
import { timeoutAt } from './pause-timeout.store.ts';
import { rootGiven } from '../config/root.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import {
  currentTasks,
  timeoutOf,
  timeoutRefusal,
  interruptsAmong,
  liveAmong,
  type Interrupt,
  type PauseRuns,
  type PausedNow,
  type RunTasks,
} from './pause.ts';

/** The timeout `text` says, in milliseconds; refused `Invalid` where it is out of its form. */
const timeoutGiven = (text: string): number => {
  const ms = timeoutOf(text);
  if (ms === undefined) throw new Invalid({ message: `--timeout: ${timeoutRefusal(text)}: as nemia pause --timeout 10m` });
  return ms;
};

/** A run as a pause at once first reads it: whether a person called it off, and every current task of its steps. */
const runTasks = (run: Run): RunTasks => ({
  id: run.id,
  ...(run.cancelledAt === undefined ? {} : { cancelledAt: run.cancelledAt }),
  tasks: currentTasks(run),
});

/**
 * The runs a pause at once may stop the tasks of, by id, and those tasks (`interruptsAmong`), off one read of the engine.
 *
 * In two phases: every run projected to its current tasks (`runTasks`), through `memo` where a caller that polls hands one, so a warm
 * read reads no finished run's record; then one `e.list` of those tasks; then the record of each run one of whose tasks is at work
 * (`liveAmong`), and of no other — a handful, where the store has hundreds. With no memo the first phase reads every record, and the
 * answer is the same.
 */
const interruptsRead = Effect.fnUntraced(function* (memo?: PauseRuns) {
  const e = yield* EngineService;
  const seen = keptRuns(memo, runTasks);
  const ids = [...new Set(seen.filter((run) => !run.cancelledAt).flatMap((run) => run.tasks))];
  const views = new Map((ids.length ? (yield* asked('list', e.list(ids))).views : []).map((v) => [v.id, v]));
  const runs = liveAmong(seen, (id) => views.get(id)).flatMap((id) => {
    const run = runStore.runs.find(id);
    return run ? [run] : [];
  });
  const steps = new Map(yield* Effect.forEach(runs, (run) => Effect.map(stepsOf(run), (s) => [run.id, s] as const)));
  return {
    runs: new Map<string, Run>(runs.map((r) => [r.id, r])),
    interrupts: interruptsAmong(
      runs,
      (id) => views.get(id),
      (run) => steps.get(run.id) ?? [],
    ) satisfies Interrupt[],
  };
});

/** Each task a pause at once would stop now, of every run not called off: what `nemia pause --now` and the board's confirm show. */
export const nowRead = Effect.fn('nowRead')(function* (memo?: PauseRuns) {
  return (yield* interruptsRead(memo)).interrupts;
});

/**
 * Pauses the store, parking every session, job or attached, at its tool call's end: puts the pause with its timeout (`putPause`) — `given`,
 * else the store's at `home` (`timeoutAt`) — then the sessions' drain (`sessionsDrained`), so the pause takes hold before the next pass,
 * which puts the drain again from the file. Refused (`Conflict`) while a pause stands, as `putPause` refuses it; a timeout `given` out of
 * its form (`Invalid`), as the command's check refuses it first.
 */
export const pauseParked = Effect.fn('pauseParked')(function* (
  said: { why?: string; by?: string },
  given: string | undefined,
  home: string | undefined,
  now: Date = new Date(),
) {
  const timeoutMs = yield* tried(() => (given === undefined ? timeoutAt(rootGiven(home, 'pause')).ms : timeoutGiven(given)));
  const pause = yield* tried(() => putPause(said, now, timeoutMs));
  yield* sessionsDrained({ graceMs: timeoutMs });
  return pause;
});

/**
 * Pauses the store at once: puts the pause (`putPause`), or keeps the one that stands as it was put — its since, its by and its why, so
 * `said` is then not written — and cuts its timeout to 0 (`cutPause`), and puts the sessions' drain at that timeout, which cuts every
 * session's tool call in flight at once: each session parks and goes on as the same try once the store is resumed, so it is asked no try
 * and no stop. For each check at work but a landing's (`interruptsOf`), it writes the ask that runs it again once the store is resumed,
 * naming the task (`interrupted`), and only then asks the engine to stop it (`stopAsked`), so a stop is never taken with no ask to pick
 * it up. A check whose step already has an ask for that try is left at work (`skipped`). A stop the engine refuses — the task settled
 * since it was read — is passed over: the tick sets its ask aside (`pauseAskVoid`).
 */
export const pauseNow = Effect.fn('pauseNow')(function* (said: { why?: string; by?: string }, now: Date = new Date()) {
  const e = yield* EngineService;
  const stands = readPause();
  if (stands === null) yield* tried(() => putPause(said, now, 0));
  const pause = yield* tried(() => cutPause());
  yield* sessionsDrained({ graceMs: 0 });
  const { runs, interrupts } = yield* interruptsRead();
  const interrupted: Interrupt[] = [];
  const skipped: Interrupt[] = [];
  for (const i of interrupts) {
    if (i.kind === 'session') {
      interrupted.push(i);
      continue;
    }
    const run = runs.get(i.run);
    if (run === undefined) {
      skipped.push(i);
      continue;
    }
    const ask = { step: i.step, try: tryOf(run, i.step) + 1, mode: 'recheck' as const, interrupted: i.taskId, at: now.toISOString() };
    if (!runStore.asks.write(i.run, { kind: 'retry', of: 'try', ask }).written) {
      skipped.push(i);
      continue;
    }
    yield* stopAsked(e, i.taskId);
    interrupted.push(i);
  }
  return { pause, kept: stands !== null, interrupted, skipped } satisfies PausedNow;
});
