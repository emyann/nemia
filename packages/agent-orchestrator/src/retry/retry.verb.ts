/**
 * `wf retry`: ask for another try of a step (`retry`), by writing the person's ask and nothing else, refused before anything is written. A
 * controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import type { Engine } from '../runtime-client.ts';
import { tryOf, type Run } from '../record/record.ts';
import { retryable, retryRefusal, type RetryAsk, type RetryHow } from './index.ts';
import { askFile, askIn, readAsks, readRun, stepsOf, writeAsk } from '../record/record.store.ts';
import { strayAsk } from '../say/say.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhases } from '../views/views.verb.ts';
import { Conflict } from '../refusal/refusal.ts';

/** A person's ask, written: the run, the ask and its file — and `stopFirst`, when the tick stops the step's blocked session before it files the try. */
export type Asked = { run: Run; ask: RetryAsk; file: string; stopFirst: boolean };

/**
 * Ask for another try of a step — `wf retry` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`retryRefusal`): a message that is empty or rides on
 * `--recheck`, a step that is not waiting on a person, a cancelled run, an ask for that try already there. Like a
 * cancellation, the ask is the person's own file, and the verb never writes the run's json, which the tick owns. What
 * the person said goes in the ask, `message`, and nowhere else: the tick carries it into the try's brief. An ask written by someone else
 * between the look and the write is refused as the look would have refused it, and a file at the ask's name that no pass reads as one is
 * named (`strayAsk`).
 *
 * `stopBlocked` takes a step whose session its harness blocked, with nothing signed (`retryable`): the ask is written as any other, and
 * the tick stops that session before it files the try. `wf retry` passes it, and so does the board's `POST …/retry`. Left out, such a
 * step is running and refused as one: a caller takes the harness's word on purpose, never by default.
 */
export async function retry(
  e: Engine,
  id: string,
  stepName: string,
  how: RetryHow,
  { stopBlocked = false }: { stopBlocked?: boolean } = {},
): Promise<Asked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const blocked = stopBlocked ? harnessBlocked(views) : () => false;
  const spendOf = spendReader(views);
  const refusal = (asks: readonly RetryAsk[]) =>
    retryRefusal(
      steps,
      run,
      stepName,
      how,
      phaseOf,
      closeoutReader(views, run),
      closeoutAsked(views),
      exitVerdicts(views, run),
      asks,
      blocked,
      spendOf,
    );

  const refused = refusal(readAsks(id).asks);
  if (refused) throw new Conflict({ message: refused });
  const ask: RetryAsk = {
    step: stepName,
    try: tryOf(run, stepName) + 1,
    mode: how.mode,
    ...(how.model ? { model: how.model } : {}),
    ...(how.message !== undefined ? { message: how.message } : {}),
    ...(how.budget !== undefined ? { budget: how.budget } : {}),
    at: new Date().toISOString(),
  };
  const file = askFile(id, stepName, ask.try);
  if (!writeAsk(file, ask)) {
    throw new Conflict({
      message:
        refusal(readAsks(id).asks) ??
        strayAsk(file, askIn(file, stepName, ask.try), `try ${ask.try} of ${stepName}`, `wf retry ${id} ${stepName}`) ??
        `try ${ask.try} of ${stepName} is already asked for. Wait for it: wf ls ${id}.`,
    });
  }
  const step = steps.find((s) => s.name === stepName)!;
  return {
    run,
    ask,
    file,
    stopFirst: retryable(step, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), steps, blocked, spendOf).blockedByHarness,
  };
}
