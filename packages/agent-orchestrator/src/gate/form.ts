/**
 * Which yes `nemia approve` gives (decision 7): the approval of a step at its gate, or the end of a loop out of rounds as it stands, which
 * `nemia accept` gave. Pure: the run is read by `form.verb.ts`, for the command and admission alike.
 */
import type { Run } from '../record/record.ts';
import { hasGate } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';

/** The yes an approval gives: at a step's gate, or to a loop out of rounds. */
export type ApproveForm = 'gate' | 'loop';

/**
 * The yes `nemia approve` gives on `name` of `run`, given whether that step waits at its gate now (`atGate`, read only where it decides):
 * to a loop where no step is named — a step at its gate is always named — or where the step closes a loop and is gated at no step; at its
 * gate where it is gated and closes no loop, and where it is not there, which the gate's own refusal names. A step both gated and closing
 * a loop is approved at its gate while it waits there, and its loop ended otherwise. Pure.
 */
export function approveFormOf(
  steps: readonly Workflow[],
  run: Pick<Run, 'gates'>,
  name: string | undefined,
  atGate: () => boolean,
): ApproveForm {
  if (name === undefined) return 'loop';
  const step = steps.find((s) => s.name === name);
  if (step === undefined || !step.loop) return 'gate';
  if (!hasGate(step, run)) return 'loop';
  return atGate() ? 'gate' : 'loop';
}
