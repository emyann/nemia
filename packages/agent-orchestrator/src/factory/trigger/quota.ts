/**
 * Whether a trigger can spend quota (`triggerQuota`, proved by `contracts/trigger-quota.contract.ts`): whether anything its target can
 * reach runs an agent, read off the steps of the workflows it reaches, never off what it matches now or when it next fires. The walk
 * (`reachedWorkflows`) starts at the target and follows each card node of a reached workflow to the workflow it starts a run of,
 * resolved through the factory's offer, each workflow once; `card: backlog` files for none. A step is a session or a judge, which run an
 * agent, or a table or a script condition or a card node, which run none (`stepReach`). Pure: the caller reads each workflow's steps.
 */
import type { ReachedWorkflow, ReachStepKind, TriggerQuotaOf } from '../../../contracts/trigger-quota.contract.ts';
import type { StepSpec } from '../../step/step.ts';

export type { ReachedWorkflow } from '../../../contracts/trigger-quota.contract.ts';

/** A step as the walk reads it: whether it is a card node and of which kind, the workflow it files for, and its condition's eval. */
export type ReachStep = Pick<StepSpec, 'workflow' | 'route' | 'card'>;

/**
 * What a step is, as far as quota goes: a card node (`workflow:` or `card:`) is a node; a condition is a table, a script or a judge by
 * its eval; any other step — an agent hired, its own, a remote one or a plain session — is a session.
 * @param step The step's card node keys and its condition's eval.
 */
export const stepReach = (step: ReachStep) => {
  const kind: ReachStepKind =
    step.workflow !== undefined || step.card !== undefined ? 'node' : step.route === undefined ? 'session' : step.route.kind;
  return kind;
};

/**
 * The workflows a step of a reached workflow starts a run of: its `workflow:`, except on a node that files back to the backlog.
 * @param step The step's card node keys.
 */
const filesFor = (step: ReachStep) => (step.card === 'backlog' || step.workflow === undefined ? [] : [step.workflow]);

/**
 * The workflows a trigger whose target is `target` reaches, the target first, each once: each a workflow's steps as `read` reads them,
 * `unknown` where it answers none (the factory does not offer it, or its folder does not load).
 * @param target The name of the workflow the trigger targets.
 * @param read The steps of a workflow the factory offers, by its name, or undefined where it cannot be read.
 */
export const reachedWorkflows = (target: string, read: (name: string) => readonly ReachStep[] | undefined) => {
  const reached: ReachedWorkflow[] = [];
  const seen = new Set<string>();
  const queue = [target];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (seen.has(name)) continue;
    seen.add(name);
    const steps = read(name);
    if (steps === undefined) {
      reached.push({ name, read: 'unknown' });
      continue;
    }
    reached.push({ name, read: 'known', steps: steps.map(stepReach) });
    queue.push(...steps.flatMap(filesFor));
  }
  return reached;
};

/** Whether a reached workflow reads, and one of its steps runs an agent. */
const runsAgent = (w: ReachedWorkflow) => w.read === 'known' && w.steps.some((kind) => kind === 'session' || kind === 'judge');

/**
 * Whether what a trigger reaches can spend quota: `spends` where a reached workflow runs an agent, `unknown` where none does and one
 * cannot be read, `free` otherwise.
 * @param reached The workflows the trigger reaches, its target first (`reachedWorkflows`).
 */
export const triggerQuota: TriggerQuotaOf = (reached) => {
  if (reached.some((w) => runsAgent(w))) return 'spends';
  if (reached.some((w) => w.read === 'unknown')) return 'unknown';
  return 'free';
};

/**
 * The workflow that settles a trigger's quota, where one does: the first reached that runs an agent, else the first that cannot be read.
 * @param reached The workflows the trigger reaches, its target first (`reachedWorkflows`).
 */
export const quotaSettledBy = (reached: readonly ReachedWorkflow[]) =>
  (reached.find((w) => runsAgent(w)) ?? reached.find((w) => w.read === 'unknown'))?.name;
