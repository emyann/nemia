/**
 * What a filing is pinned on: the revisions of a step's agent and skills, and the closeout schema it is given. Pure, and its folder's face.
 *
 * Here rather than in `filed/filed.ts` so the round's pure code may read it: `filed.ts` reads the retry's words, which the round reads too,
 * and a folder of the format may not need a folder that needs it (`test/layout.test.ts`).
 */
import { closeoutHashOf } from '../closeout/index.ts';
import type { Pin } from '../revisions/revisions.ts';
import type { Run, StepRecord } from '../record/record.ts';
import type { Workflow } from '../workflow.ts';

/** As much of a pass's filing as the two below read: the run's pins, and the steps the run froze. */
type PinsRead = { run: Pick<Run, 'pinned'>; reads: { steps: readonly Workflow[] } };

/**
 * The agent and skill pins one step is filed on, off the run's pins: what the step's own record keeps, so a shipped step says which
 * revisions it ran on once a refresh has moved the run's own past them. None for a step with no agent.
 */
export const stepPins = (step: Workflow, pins: readonly Pin[]): Pin[] => {
  const agent = step.agent;
  if (!agent) return [];
  const names = new Set(agent.skills ?? []);
  return pins.filter((p) => (p.kind === 'agent' && p.name === agent.name) || (p.kind === 'skill' && names.has(p.name)));
};

/**
 * What a step's record keeps of the filing: the agent and skill revisions it was filed on (`stepPins`), and the digest of the closeout
 * schema it was given (`closeoutHashOf`). Written at every filing, so a step that has shipped says which revisions its try ran on even
 * once a refresh has moved the run's own past them. Nothing for a step the steps given do not hold. Pure.
 */
export const filedOn = (f: PinsRead, step: Workflow | undefined): Pick<StepRecord, 'pinned' | 'closeoutHash'> => {
  if (!step) return {};
  const own = stepPins(step, f.run.pinned ?? []);
  return { ...(own.length ? { pinned: own } : {}), closeoutHash: closeoutHashOf(step, f.reads.steps) };
};

/**
 * The session a filing continues, or none where the closeout schema has moved since that session was filed: a session is asked for its
 * closeout by the tool it was given, and asked in another shape would pay for the whole conversation again for an answer in the wrong one.
 * `record` is the step whose session it is — the step's own for a nudge and a round, the step it resumes for a `resume:`.
 *
 * A record with no `closeoutHash`, written before this was kept, resumes as it always did: the hash says a schema moved, and an absent one
 * says nothing. Pure.
 */
export const resumeOn = (session: string | undefined, step: Workflow, f: PinsRead, record: StepRecord | undefined): string | undefined =>
  record?.closeoutHash === undefined || record.closeoutHash === closeoutHashOf(step, f.reads.steps) ? session : undefined;
