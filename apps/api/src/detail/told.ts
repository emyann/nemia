/** What a step was told, for the run page: the brief whole, and by layer from what the run froze (`toldLayers`). */
import { composeBrief, type Run, type ToldLayers, toldLayers } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import type { Views } from '../store.ts';

/**
 * The brief a step was told, whole.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what `composeBrief` would give it now, from `workflows` — the
 * workflow the run froze, as the tick composes it. For a filed task the engine has no record of, nobody can say.
 */
function briefOf(run: Run, name: string, workflows: readonly Workflow[] | null, views: Views): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? composeBrief(step, run, workflows) : null;
}

/**
 * What a step was told, whole (`briefOf`) and by layer (`toldLayers`): the layers from the step `run` froze, never from `workflows` where
 * that is the folder as it is now; null on a record that froze none, or that froze no step `name`.
 */
export function toldOf(
  run: Run,
  name: string,
  workflows: readonly Workflow[] | null,
  views: Views,
): { told: string | null; layers: ToldLayers | null } {
  const told = briefOf(run, name, workflows, views);
  const frozen = run.workflow?.find((s) => s.name === name);
  return { told, layers: frozen ? toldLayers(frozen, told) : null };
}
