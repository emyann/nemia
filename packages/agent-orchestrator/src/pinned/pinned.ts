/**
 * What a filing is pinned on: the revisions of a step's agent and skills, and the closeout schema it is given. Pure, and its folder's face.
 *
 * Here rather than in `filed/filed.ts` so the round's pure code may read it: `filed.ts` reads the retry's words, which the round reads too,
 * and a folder of the format may not need a folder that needs it (`test/layout.test.ts`).
 */
import type { FiledFields } from '../../contracts/filed-fields.contract.ts';
import { closeoutHashOf } from '../closeout/index.ts';
import { outputFields } from '../step/step.ts';
import type { Pin } from '../revisions/revisions.ts';
import type { Run, StepRecord } from '../record/record.ts';
import type { Workflow } from '../workflow.ts';

/** As much of a pass's filing as the two below read: the run's pins, and the steps the run froze. */
type PinsRead = { run: Pick<Run, 'pinned'>; reads: { steps: readonly Workflow[] } };

/**
 * The agent and skill pins one step is filed on, off the run's pins: what the step's own record keeps, so a landed step says which
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
 * schema it was given (`closeoutHashOf`). Written at every filing, so a step that has landed says which revisions its try ran on even
 * once a refresh has moved the run's own past them. Nothing for a step the steps given do not hold. Pure.
 */
export const filedOn = (f: PinsRead, step: Workflow | undefined): Pick<StepRecord, 'pinned' | 'closeoutHash' | 'declared'> => {
  if (!step) return {};
  const own = stepPins(step, f.run.pinned ?? []);
  return { ...(own.length ? { pinned: own } : {}), closeoutHash: closeoutHashOf(step, f.reads.steps), declared: outputFields(step) };
};

/**
 * Which of the fields its `output:` declares a step's try owes (contract `filed-fields.contract.ts`): those it was filed with
 * (`StepRecord.declared`), whatever its run follows later. A record written before they were kept owes what the step declares `now`
 * where its schema has not `moved` since it was filed, and where it has, those of them its closeout `gave`: the harness held it to the
 * schema it was handed, so a field it lacks is one that schema did not ask. Pure.
 */
export const filedFields: FiledFields = (filed, now, gave) => {
  const declared = filed.declared;
  if (declared !== undefined) return declared.slice();
  if (!filed.moved) return now.slice();
  return now.filter((f) => gave.includes(f));
};

/**
 * The session a filing continues, or none where the closeout schema has moved since that session was filed: a session is asked for its
 * closeout by the tool it was given, and asked in another shape would pay for the whole conversation again for an answer in the wrong one.
 * `record` is the filing step's own record, whosever session it continues: what is compared is the schema this step was last filed with,
 * never another step's, so a `resume:` whose schema differs from the step it resumes — which `docs/features.md` allows on purpose — still
 * continues that session, and pays one fresh session only when its own schema moves.
 *
 * A record with no `closeoutHash`, written before this was kept, resumes as it always did: the hash says a schema moved, and an absent one
 * says nothing. Pure.
 */
export const resumeOn = (session: string | undefined, step: Workflow, f: PinsRead, record: StepRecord | undefined): string | undefined =>
  record?.closeoutHash === undefined || record.closeoutHash === closeoutHashOf(step, f.reads.steps) ? session : undefined;
