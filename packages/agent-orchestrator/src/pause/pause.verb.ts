/**
 * The store's pause at once (`nemia pause --now`): what it would stop, read off one view of every run's current tasks and never stored
 * (`nowRead`), and the verb that puts the pause, or keeps the one that stands, then writes for each task at work the ask that tries it
 * again on the resume and asks the engine to stop it (`pauseNow`). A controller: it reaches the engine through the client, and writes
 * a person's files — the pause through `putPause`, each ask through `runStore.asks.write` — never a run's record.
 */
import { Effect } from 'effect';
import { EngineService, asked } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { stopAsked } from '../tick/held.verb.ts';
import { putPause, readPause } from './pause.store.ts';
import { currentTasks, interruptsAmong, type Interrupt, type PausedNow } from './pause.ts';

/** The runs a pause at once may stop the tasks of, by id, and those tasks (`interruptsAmong`), off one read of the engine. */
const interruptsRead = Effect.fnUntraced(function* () {
  const e = yield* EngineService;
  const runs = runStore.runs.list().filter((run) => !run.cancelledAt);
  const ids = [...new Set(runs.flatMap(currentTasks))];
  const views = new Map((ids.length ? (yield* asked('list', e.list(ids))).views : []).map((v) => [v.id, v]));
  return {
    runs: new Map<string, Run>(runs.map((r) => [r.id, r])),
    interrupts: interruptsAmong(runs, (id) => views.get(id), stepsOf) satisfies Interrupt[],
  };
});

/** Each task a pause at once would stop now, of every run not called off: what `nemia pause --now` and the board's confirm show. */
export const nowRead = Effect.fn('nowRead')(function* () {
  return (yield* interruptsRead()).interrupts;
});

/**
 * Pauses the store at once: puts the pause (`putPause`), or keeps the one that stands as it was put — its since, its by and its why, so
 * `said` is then not written — and, for each task at work but a landing (`interruptsOf`), writes the ask that tries its step again once the
 * store is resumed, a nudge of the session or a recheck of the check, naming the task (`interrupted`), and only then asks the engine to
 * stop it (`stopAsked`), so a stop is never taken with no ask to pick it up. A task whose step already has an ask for that try is left at
 * work (`skipped`). A stop the engine refuses — the task settled since it was read — is passed over: the tick sets its ask aside
 * (`pauseAskVoid`).
 */
export const pauseNow = Effect.fn('pauseNow')(function* (said: { why?: string; by?: string }, now: Date = new Date()) {
  const e = yield* EngineService;
  const stands = readPause();
  const pause = stands ?? putPause(said, now);
  const { runs, interrupts } = yield* interruptsRead();
  const interrupted: Interrupt[] = [];
  const skipped: Interrupt[] = [];
  for (const i of interrupts) {
    const ask = {
      step: i.step,
      try: tryOf(runs.get(i.run)!, i.step) + 1,
      mode: i.kind === 'check' ? ('recheck' as const) : ('nudge' as const),
      interrupted: i.taskId,
      at: now.toISOString(),
    };
    if (!runStore.asks.write(i.run, { kind: 'retry', ask }).written) {
      skipped.push(i);
      continue;
    }
    yield* stopAsked(e, i.taskId);
    interrupted.push(i);
  }
  return { pause, kept: stands !== null, interrupted, skipped } satisfies PausedNow;
});
