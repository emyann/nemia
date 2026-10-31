/**
 * What `nemia admit` reads of a run for an answer a rule may give unasked (`seenOf`), the facts it is judged on at `auto` (`factsOf`): the
 * step's closeout and questions, its check's verdict, the looping steps' word, each step's cap, the run's cost, and what else waits on the
 * person, read as `nemia retry` reads them at the moment of the call. A controller over `EngineService`.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { stepsOf } from '../record/record.store.ts';
import { retryable, WAITS_ON_PERSON } from '../retry/index.ts';
import { acceptanceOf, overBudget, runSpend } from '../status/status.ts';
import { askedQuestions } from '../question/index.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import type { Seen } from '../auto/index.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/**
 * What admission reads of the run `runId` for its step `stepName` (`Seen`): the step's closeout and the questions it asks, its check's
 * verdict, each looping step that signed with whether it asks again and whether a person accepted it, whether any step is at its cap, what
 * the run cost, and whether another step waits on the person. A step the run does not have reads as one that signed nothing. Refused: no
 * such run (`Missing`), and a record that does not read.
 */
export const seenOf = Effect.fnUntraced(function* (runId: string, stepName: string) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const steps = yield* tried(() => stepsOf(run));
  const step = steps.find((s) => s.name === stepName);
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const closeoutOf = closeoutReader(views, run);
  const spendOf = spendReader(views);
  const waits = (other: (typeof steps)[number]) => {
    const standing = retryable(
      other,
      run,
      phaseOf,
      closeoutOf,
      closeoutAsked(views),
      steps,
      harnessBlocked(views),
      spendOf,
      exitVerdicts(views, run),
    );
    return WAITS_ON_PERSON[standing.status] || standing.blockedByHarness;
  };
  const closeout = closeoutOf(stepName);
  return {
    closeout: step && closeout && { outcome: closeout.outcome, ...(closeout.needs === undefined ? {} : { needs: closeout.needs }) },
    questions: askedQuestions(step, closeout).flatMap((a) => a.questions.map((q) => ({ recommended: q.recommended ?? null }))),
    verdict: exitVerdicts(views, run)(stepName),
    loops: steps
      .filter((s) => s.loop && closeoutOf(s.name))
      .map((s) => ({ again: closeoutOf(s.name)?.output?.again === true, personAccepted: acceptanceOf(run, s.name) !== undefined })),
    overBudget: steps.some((s) => overBudget(s, run, spendOf) !== undefined),
    spend: runSpend(run, spendOf).usd,
    othersWaiting: steps.some((s) => s.name !== stepName && waits(s)),
  } satisfies Seen;
});
