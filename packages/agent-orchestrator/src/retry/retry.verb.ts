/**
 * `nemia retry`: ask for another try of a step, by writing the person's ask and nothing else, refused before anything is written. A
 * controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a service
 * (`retryRun`, over `EngineService`), run by a caller with `runWith`.
 */
import { Effect } from 'effect';
import { configRefusal, tried } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import { tryOf, type Run } from '../record/record.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';
import { filedRefusal, lineOf } from '../keys/index.ts';
import { filedConfig, tryModel } from '../filed/filed.ts';
import { budgetOf, budgetUsdFor, stepSpend, type SpendOf } from '../status/status.ts';
import { filedAt, toldOf } from '../tick/told.verb.ts';
import type { Workflow } from '../workflow.ts';
import { retryable, retryRefusal, type RetryAsk, type RetryHow } from './index.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { strayAsk } from '../say/say.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { landingDenies } from '../place/landing.store.ts';
import { PlaceService } from '../place/place.store.ts';

/**
 * A person's ask, written: the run, the ask and its file — and `stopFirst`, when the tick stops the step's blocked session before it files
 * the try.
 */
export type Asked = { run: Run; ask: RetryAsk; file: string; stopFirst: boolean };

/**
 * Ask for another try of a step — `nemia retry` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`retryRefusal`): a message that is empty or rides on `--recheck`, a step
 * that is not waiting on a person, a cancelled run, an ask for that try already there; then a try whose config its harness refuses
 * (`tryRefused`). An ask `nemia pause --now` wrote for that try refuses it even once void (`pauseAskVoid`): the tick alone sets it aside,
 * by its name, which a person's ask written there first would lose. Like a cancellation, the ask is the person's own file, and
 * the verb never writes the run's json, which the tick owns. What the person said goes in the ask, `message`, and nowhere else: the tick
 * carries it into the try's brief. An ask written by someone else between the look and the write is refused as the look would have
 * refused it, and a file at the ask's name that no pass reads as one is named (`strayAsk`).
 *
 * `stopBlocked` takes a step whose session its harness blocked, with nothing signed (`retryable`): the ask is written as any other, and
 * the tick stops that session before it files the try. `nemia retry` passes it, and so does the board's `POST …/retry`. Left out, such a
 * step is running and refused as one: a caller takes the harness's word on purpose, never by default. Fails with a refusal, the verb's or
 * one a read threw; dies of anything else (`tried`).
 */
export const retryRun = Effect.fn('retry')(function* (
  id: string,
  stepName: string,
  how: RetryHow,
  { stopBlocked = false }: { stopBlocked?: boolean } = {},
) {
  const run = yield* tried(() => runStore.runs.read(id));
  const steps = yield* tried(() => stepsOf(run));
  const { views, phaseOf } = yield* taskPhasesRead(run);
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

  const refused = refusal((yield* tried(() => runStore.asks.read(id))).asks);
  if (refused) return yield* Effect.fail(new Conflict({ message: refused }));
  const step = steps.find((s) => s.name === stepName)!;
  const denied = landingDenies(run, yield* PlaceService);
  const home = yield* StoreRoot;
  const refusedConfig = yield* tried(() => tryRefused(run, steps, step, how, spendOf, denied, home));
  if (refusedConfig) return yield* Effect.fail(new Invalid({ message: refusedConfig }));
  const ask: RetryAsk = {
    step: stepName,
    try: tryOf(run, stepName) + 1,
    mode: how.mode,
    ...(how.model ? { model: how.model } : {}),
    ...(how.message !== undefined ? { message: how.message } : {}),
    ...(how.budget !== undefined ? { budget: how.budget } : {}),
    at: new Date().toISOString(),
  };
  const written = yield* tried(() => runStore.asks.write(id, { kind: 'retry', of: 'try', ask }));
  const file = written.where;
  if (!written.written) {
    const { stray } = written;
    const why = yield* tried(
      () =>
        refusal(runStore.asks.read(id).asks) ??
        strayAsk(file, stray, `try ${ask.try} of ${stepName}`, `nemia retry ${id} ${stepName}`) ??
        `try ${ask.try} of ${stepName} is already asked for. Wait for it: nemia ls ${id}.`,
    );
    return yield* Effect.fail(new Conflict({ message: why }));
  }
  return {
    run,
    ask,
    file,
    stopFirst: retryable(step, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), steps, blocked, spendOf).blockedByHarness,
  } satisfies Asked;
});

/**
 * The runtime's refusal of the config the try asked for would be filed with (`filedConfig`, as the tick files a try: on the model the
 * try runs on and with its cap), said as the step's after the line it comes from: the flag the retry typed where it chose the field
 * (`--model`, on a fresh try, and `--budget`), else the step's own (`filedRefusal`). A recheck files no session, and a step on a remote
 * agent is configured by its operator: neither is asked.
 */
function tryRefused(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
  how: RetryHow,
  spendOf: SpendOf,
  denied: readonly string[],
  home: string,
): string | undefined {
  if (how.mode === 'recheck' || isRemoteHarness(step.harness)) return undefined;
  const record = run.steps[step.name];
  const budgetUsd = budgetUsdFor(how.budget ?? budgetOf(step, record), stepSpend(run, step.name, spendOf));
  const config = filedConfig(step, steps, run, {
    model: tryModel(step, record, how),
    budgetUsd,
    ...filedAt(run, home),
    own: toldOf(run, step).own,
    landingDenied: () => denied,
  });
  const flags = { ...(how.mode === 'fresh' && how.model !== undefined && { model: how.model }), budget: how.budget };
  return filedRefusal((c) => configRefusal(step.harness ?? DEFAULT_HARNESS, c), step.name, config, lineOf(step, flags));
}
