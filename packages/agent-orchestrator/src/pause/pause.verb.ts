/**
 * The store's pause at once (`wf pause --now`): what it would stop, read off one view of every run's current tasks and never stored
 * (`nowRead`), and the verb that puts the pause, or keeps the one that stands, then writes for each task at work the ask that tries it
 * again on the resume and asks the engine to stop it (`pauseNow`). A controller: it reaches the engine through the client, and writes
 * a person's files — the pause through `putPause`, each ask through `runStore.asks.write` — never a run's record.
 */
import type { Engine } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { stopAsked } from '../tick/held.verb.ts';
import { putPause, readPause } from './pause.store.ts';
import { currentTasks, interruptsAmong, type Interrupt, type PausedNow } from './pause.ts';

/** The runs a pause at once may stop the tasks of, by id, and those tasks (`interruptsAmong`), off one read of the engine. */
async function interruptsRead(e: Engine): Promise<{ runs: Map<string, Run>; interrupts: Interrupt[] }> {
  const runs = runStore.runs.list().filter((run) => !run.cancelledAt);
  const ids = [...new Set(runs.flatMap(currentTasks))];
  const views = new Map((ids.length ? (await e.list(ids)).views : []).map((v) => [v.id, v]));
  return { runs: new Map(runs.map((r) => [r.id, r])), interrupts: interruptsAmong(runs, (id) => views.get(id), stepsOf) };
}

/** Each task a pause at once would stop now, of every run not called off: what `wf pause --now` and the board's confirm show. */
export const nowRead = async (e: Engine): Promise<Interrupt[]> => (await interruptsRead(e)).interrupts;

/**
 * Pauses the store at once: puts the pause (`putPause`), or keeps the one that stands as it was put — its since, its by and its why, so
 * `said` is then not written — and, for each task at work but a landing (`interruptsOf`), writes the ask that tries its step again once the
 * store is resumed, a nudge of the session or a recheck of the check, naming the task (`interrupted`), and only then asks the engine to
 * stop it (`stopAsked`), so a stop is never taken with no ask to pick it up. A task whose step already has an ask for that try is left at
 * work (`skipped`). A stop the engine refuses — the task settled since it was read — is passed over: the tick sets its ask aside
 * (`pauseAskVoid`).
 */
export async function pauseNow(e: Engine, said: { why?: string; by?: string }, now: Date = new Date()): Promise<PausedNow> {
  const stands = readPause();
  const pause = stands ?? putPause(said, now);
  const { runs, interrupts } = await interruptsRead(e);
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
    await stopAsked(e, i.taskId);
    interrupted.push(i);
  }
  return { pause, kept: stands !== null, interrupted, skipped };
}
