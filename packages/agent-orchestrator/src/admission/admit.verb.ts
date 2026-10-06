/**
 * `nemia admit`: a call's admission, served to the hook a local session runs before each of its shell calls — the call read on stdin, the
 * runs it tries read as `nemia retry` reads them, and the answer (`admissionOf`) printed as JSON, or nothing for none. A controller over
 * `EngineService`, run by the command line's runner with the table it decides by.
 */
import { Effect, Result } from 'effect';
import type { AdmissionAnswer, AdmissionCall } from 'agent-runtime/vocabulary';
import { tried } from '../runtime-client.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { retryable, waitsOnPerson } from '../retry/index.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import type { Ran } from '../command/entry.verb.ts';
import { admissionOf, typedIn } from './admission.ts';

/** `nemia admit`: what a session's hook asks before each shell call, served by the command line alone. */
export const ADMIT: Ran = {
  name: 'admit',
  usage: '',
  help: ["a call's admission: the call a session is about to make, on stdin, answered", 'ask where it answers what waits on you'],
  spec: { positionals: [], flags: [], unknown: (arg) => `nemia admit reads the call on stdin, and takes no ${arg}.` },
  writes: false,
  nemia: 'read',
  only: { side: 'cli', why: "a session's hook asks it before each call, on its own machine" },
};

/** Why `step` of `runId` waits on the person, as `nemia retry` would judge it, or undefined where it waits on no one. */
const waitRead = Effect.fnUntraced(function* (runId: string, stepName: string) {
  const run = yield* tried(() => runStore.runs.read(runId));
  const steps = yield* tried(() => stepsOf(run));
  const step = steps.find((s) => s.name === stepName);
  if (step === undefined) return `is not there: ${runId} has no step ${stepName}`;
  const { views, phaseOf } = yield* taskPhasesRead(run);
  return waitsOnPerson(
    retryable(
      step,
      run,
      phaseOf,
      closeoutReader(views, run),
      closeoutAsked(views),
      steps,
      harnessBlocked(views),
      spendReader(views),
      exitVerdicts(views, run),
    ),
  );
});

/** The call `given` names, or undefined where it is no JSON of a tool and its input. */
function callOf(given: string): AdmissionCall | undefined {
  try {
    const call = JSON.parse(given) as Partial<AdmissionCall> | null;
    return typeof call?.tool === 'string' && typeof call.input === 'object' && call.input !== null ? (call as AdmissionCall) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Admission's answer for the call `given` (an `AdmissionCall` as JSON) against `table`: each step a retry on its line tries read first,
 * a run that does not read saying it is not there. A call that is no call is asked of the person.
 */
export const admitted = Effect.fnUntraced(function* (given: string, table: Parameters<typeof admissionOf>[1]) {
  const call = callOf(given);
  if (call === undefined) return { decision: 'ask', reason: 'nemia admit was handed no call it reads.' } satisfies AdmissionAnswer;
  const line = typeof call.input.command === 'string' ? call.input.command : '';
  const waits = new Map<string, string | undefined>();
  for (const { args } of typedIn(line, table).filter((t) => t.name === 'retry')) {
    const [runId, step] = args.filter((a) => !a.startsWith('-'));
    if (runId === undefined || step === undefined) continue;
    const read = yield* Effect.result(waitRead(runId, step));
    waits.set(`${runId} ${step}`, Result.isSuccess(read) ? read.success : `is not there: ${read.failure.message}`);
  }
  return admissionOf(call, table, (runId, step) => waits.get(`${runId} ${step}`));
});
