/**
 * A run's end, for a person: what is left for them to decide (`toDecide`, `toDecideWords`), the steps whose gate ends the run
 * (`endingSteps`) and the refusal of a gate no step has (`gateRefusal`). A run ends with its branch: where it stands, and how to merge it,
 * is `nemia decide`'s. Pure.
 */
import type { StepSpec } from '../step/step.ts';
import { terminalSteps } from '../workflow/index.ts';
import type { Run, StepStatus } from '../record/record.ts';
import { hasGate, type BranchStanding } from '../status/status.ts';
import type { Assessment } from '../tick/assess.ts';

/**
 * What a person has to decide about a run's result — the fifth reason a run waits on one, beside a step blocked, unsigned, over budget or
 * at a gate.
 *
 *   approve  the run is at its result and the gate on a last step has nobody's approval
 *   git      nothing waits at such a gate, every step of the run finished, and a result branch is ahead of the base branch and not gone:
 *            the branch is the product, and merging or dropping it is a person's, by hand (`nemia decide` says how)
 *
 * Level-triggered: nothing is stored, the branches are read off git each pass, and a run whose branch a person merged stops being one to
 * decide without anybody telling the run. Nothing while the run is running, nor for a cancelled one.
 *
 * Never `approve` on a pruned run, whose approval is refused (`prunedRefusal`): what its branches hold is what is left to decide. `git`
 * only on a run every step of which finished: one that waits on a person for a step that broke says so.
 * @param steps The workflow's steps.
 * @param run The run's record.
 * @param status The run's status, as its assessment says it.
 * @param statusOf The status of a step, by its name.
 * @param standings Where each result branch stands against the base branch, read off git; none by default.
 */
export function toDecide(
  steps: readonly StepSpec[],
  run: Run,
  status: Assessment['status'],
  statusOf: (step: string) => StepStatus,
  standings: readonly BranchStanding[] = [],
) {
  if (run.cancelledAt || status === 'running' || status === 'cancelled') return undefined;
  const waiting = endingSteps(steps, run).find((s) => statusOf(s.name) === 'awaiting approval');
  if (waiting && !run.pruned) return { kind: 'approve', step: waiting.name } satisfies ToDecide | undefined;
  if (status !== 'succeeded') return undefined;
  const ahead = standings.filter((b) => b.where === 'ahead').map((b) => b.branch);
  return (ahead.length ? { kind: 'result', branches: ahead } : undefined) satisfies ToDecide | undefined;
}

/**
 * The workflow's ending steps: the steps nothing waits on that have a gate (`hasGate`). Pure.
 *
 * An ending is where a person's word ends the run: approving it is acceptance, and what becomes of the branch is still a person's
 * (`nemia decide`). Usually one; several only where a workflow ends wide. A last step with no gate is none of these: nothing waits on a
 * person there.
 * @param steps The workflow's steps.
 * @param run The run's gates.
 */
export const endingSteps = (steps: readonly StepSpec[], run: Pick<Run, 'gates'>) =>
  terminalSteps(steps).filter((s) => hasGate(s, run)) satisfies StepSpec[];

/**
 * The words a step's own file says, below its frontmatter: its note alone where it names an agent, since `body` then opens with the
 * heading of that agent's instructions (`LAYER_HEADINGS` in `workflow/layers.ts`), and its whole body otherwise. Pure.
 * @param step The step: its body and its agent.
 */
export const ownNote = (step: Pick<StepSpec, 'body' | 'agent'>) => (step.agent ? step.agent.body : step.body);

/**
 * What a run waits on a person to decide (`toDecide`): its ending step, which approving accepts — or its result branches, which a merge
 * lands.
 */
export type ToDecide = { kind: 'approve'; step: string } | { kind: 'result'; branches: string[] };

/**
 * What `nemia ls` says after `→ to decide:`, and the board's banner: what is to be decided, and the command that decides it. Pure.
 * @param run The run's id and base branch.
 * @param t What the run waits on a person to decide.
 */
export const toDecideWords = (run: Pick<Run, 'id' | 'branch'>, t: ToDecide) =>
  t.kind === 'approve'
    ? `${t.step} has signed off at its gate — nemia approve ${run.id} ${t.step}`
    : `${t.branches.join(', ')} ${t.branches.length > 1 ? 'are' : 'is'} ahead of ${run.branch}, and nothing has merged ${t.branches.length > 1 ? 'them' : 'it'} — nemia decide ${run.id}`;

/**
 * Why a run cannot be gated at these steps, in words that name the fix — or null. Pure, and asked at start before anything is written: a
 * step given twice, and a step the workflow does not have, naming the steps it has. `said` is how a refusal names what gave the gate:
 * `--gate <step>` by default, a card's `gate:` for a card's.
 * @param gates The steps the run is to be gated at, as given.
 * @param steps The workflow's steps.
 * @param said Names, for a refusal, what gave the gate at a step; `--gate <step>` by default.
 */
export function gateRefusal(
  gates: readonly string[],
  steps: readonly Pick<StepSpec, 'name'>[],
  said: (step: string) => string = (step) => `--gate ${step}`,
) {
  const seen = new Set<string>();
  for (const step of gates) {
    if (seen.has(step)) return `${said(step)} is given twice, and a run is gated at a step once. Give each step one --gate.`;
    seen.add(step);
    if (!steps.some((s) => s.name === step)) {
      return `${said(step)}: the workflow has no step ${JSON.stringify(step)}, so nothing would ever wait at it. Its steps are: ${steps.map((s) => s.name).join(', ')} — gate one of them by its name.`;
    }
  }
  return null;
}

/**
 * The deny and allow rules a step is filed with: each read by `rule` as the place spells it, and the place's own denies after the step's;
 * undefined where the step has no list and the place adds nothing. Pure.
 * @param step The step filed: its own deny and allow lists.
 * @param rule How the place reads one rule.
 * @param denies What the place denies the step besides.
 */
export const fenceRules = (
  step: Pick<StepSpec, 'disallowedTools' | 'allowedTools'>,
  rule: (r: string) => string,
  denies: readonly string[],
) => {
  const read = (rules: readonly string[] | undefined, more: readonly string[]) =>
    (rules === undefined && !more.length ? undefined : [...(rules ?? []).map(rule), ...more]) satisfies string[] | undefined;
  return { disallowedTools: read(step.disallowedTools, denies), allowedTools: read(step.allowedTools, []) };
};
