/**
 * A judge (`route: judge`): a condition answered by a read-only session. What load and start refuse of it (`judgeRefusal`), and what its
 * brief says of each route's targets (`judgeSection`). The field the run adds to its closeout is `JUDGE_ROUTE` (step.ts). Pure.
 */
import { firstLine } from '../record/record.ts';
import { isRemoteHarness } from '../harness/harness.ts';
import { JUDGE_ROUTE, type StepSpec } from '../step/step.ts';

/** Whether `step` is a judge: a condition whose eval is `route: judge`. */
export const isJudge = (step: Pick<StepSpec, 'route'>): boolean => step.route?.kind === 'judge';

/**
 * How load and start tell a judge's fence, handed in from the fence's own judgement (workflow/fence.ts): whether it writes nothing, as
 * resolved with its agent's (`writesNothing`), and whether the step's own file sets one, which no hire's agent replaces (`fencedItself`).
 */
export type JudgeFence = { writesNothing: (s: StepSpec) => boolean; fencedItself: (s: StepSpec) => boolean };

/**
 * Why the judge `s` cannot run, or `undefined`: it declares the `route` the run owes it, or its fence writes (`JudgeFence`). A remote agent
 * writes nothing here. With `hireable`, at load, a judge with no agent and no fence of its own is left to the hire a factory files into
 * it; a start judges it again with its hire, or with none (`hireable` false).
 */
export function judgeRefusal(s: StepSpec, fence: JudgeFence, hireable: boolean): string | undefined {
  if (!isJudge(s)) return undefined;
  if (s.output && Object.hasOwn(s.output.schema.properties, JUDGE_ROUTE))
    return `${s.name}: \`output: ${s.output.file}\` declares \`${JUDGE_ROUTE}\`, and ${s.name} is a judge (\`route: judge\`), so the run adds \`${JUDGE_ROUTE}\` to its closeout: the route it takes. Rename the field.`;
  if (isRemoteHarness(s.harness) || fence.writesNothing(s)) return undefined;
  if (s.agent === undefined && hireable && !fence.fencedItself(s)) return undefined;
  const whose = s.agent ? `its agent, ${s.agent.name},` : 'its fence';
  return `${s.name}: \`route: judge\` is a read-only session, and ${whose} lets it write. Run it on a fence that writes nothing — its harness's narrowest mode, one that asks before an edit and allows none, or a tool list with no tool that writes — or hire a read-only agent into it: nemia factory hire <factory> <agent> --step <workflow>/${s.name}.`;
}

/**
 * What a target says it is for: a step's own note's first line; or, for a workflow node, the card it files and what its workflow says it is
 * for (`targets`, the workflow's description), else the node's own note.
 */
function described(target: StepSpec, targets: Readonly<Record<string, string>>): string {
  const note = firstLine(target.agent ? target.agent.body : target.body) || firstLine(target.body);
  if (target.workflow === undefined) return `the step ${target.name}${note ? `: ${note}` : ''}`;
  const about = targets[target.workflow] ?? note;
  return `a card for the workflow ${target.workflow} (${target.name}${about ? `: ${about}` : ''})`;
}

/**
 * What a judge's brief says of its routes: each with what it reaches — each node after the judge that takes it, by its first line, a
 * workflow node by its workflow's description (`targets`) — or that it ends the run (`ends:`), and the field its closeout owes. Empty for
 * any other step.
 */
export function judgeSection(step: StepSpec, steps: readonly StepSpec[], targets: Readonly<Record<string, string>> = {}): string {
  if (!isJudge(step)) return '';
  const followers = steps.filter((s) => s.after.includes(step.name));
  const lines = (step.routes ?? []).map((route) => {
    if (step.ends?.includes(route)) return `- \`${route}\`: ends the run; nothing after ${step.name} runs.`;
    const reached = followers.filter((f) => f.when === undefined || f.when.includes(route)).map((f) => described(f, targets));
    return `- \`${route}\`: ${reached.join('; ')}.`;
  });
  return [
    '',
    '## The routes you choose between',
    '',
    `You decide which route the run takes after ${step.name}. Each route, and what it reaches:`,
    '',
    ...lines,
    '',
    `Give the one you choose as \`${JUDGE_ROUTE}\` in your closeout, one of ${(step.routes ?? []).map((r) => `\`${r}\``).join(', ')}. A closeout without it is unsigned, and nothing after ${step.name} starts. Change nothing: you only choose.`,
    '',
  ].join('\n');
}
