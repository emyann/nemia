/**
 * A run's result branches: the steps whose branch is its result (`resultSteps`), the checks its work was judged by (`workChecks`), and
 * the branch tips a pass records (`tipBranches`, `tipsSeen`). Pure: the root's `branches.ts` reads git.
 */
import type { Workflow } from '../step/step.ts';
import { terminalSteps } from '../workflow/index.ts';
import type { Run } from '../record/record.ts';
import type { Assessment } from '../run.ts';

/**
 * The steps whose branch is the run's result: the steps nothing waits on (`terminalSteps`) — and, where one of those works in the
 * repository's own checkout (`workspace: main`), the steps it waits on instead. Pure.
 *
 * An ending step has no branch of its own: it works on the base branch, and what it acts on is the work of the steps before it. Read as
 * the result, its `main` would be the run's own branch, and every question about the run's result — has it shipped, what did it touch,
 * what is there to decide — would be asked of the base branch and answered yes.
 */
export function resultSteps(steps: readonly Workflow[]): Workflow[] {
  const ends = terminalSteps(steps);
  const result = ends.flatMap((s) => (s.workspace === 'main' ? steps.filter((x) => s.after.includes(x.name)) : [s]));
  return [...new Set(result)];
}

/**
 * The checks the run's work was judged by: each distinct `check:` of a step that is not an ending, in the order the steps run. What an
 * ending step is told to run again on the merge, so a shipper written once reads its folder's check off its brief rather than carrying
 * one in its words. Pure.
 */
export function workChecks(steps: readonly Workflow[]): string[] {
  return [...new Set(steps.filter((s) => s.workspace !== 'main' && s.check).map((s) => s.check!))];
}

/**
 * The branches whose tips this pass records (`tipsSeen`): a finished run's result branches — succeeded or failed, so neither running nor
 * cancelled — when it cut worktrees and did not work on its base branch itself. What `wf decide` offers to ship. None for any other run,
 * so git is not asked about it.
 */
export function tipBranches(run: Run, steps: readonly Workflow[], status: Assessment['status']): string[] {
  if (!run.isolate || (status !== 'succeeded' && status !== 'failed')) return [];
  const branches = resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
  return branches.includes(run.branch) ? [] : [...new Set(branches)];
}

/**
 * The run's `tips` once this pass has seen its branches — `seen` is each branch git has, and the commit it is at — or undefined when
 * nothing changed, so an unchanged run is not written. Pure. A branch git no longer has keeps the tip last seen: that is what it is for.
 */
export function tipsSeen(
  run: Run,
  branches: readonly string[],
  seen: Readonly<Record<string, string>>,
): Record<string, string> | undefined {
  const tips: Record<string, string> = { ...run.tips };
  let changed = false;
  for (const branch of branches) {
    const at = seen[branch];
    if (at && at !== tips[branch]) {
      tips[branch] = at;
      changed = true;
    }
  }
  return changed ? tips : undefined;
}
