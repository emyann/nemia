/** What a step was told, for the run page: the brief whole, and by layer from what the run froze (`toldLayers`). */
import { handedParts, type HandedPart, type Run, type ToldLayers, toldLayers } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { briefNow, type Views } from 'agent-orchestrator';
import type { PlaceService } from 'agent-orchestrator';

/**
 * The brief a step was told, whole.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what it would be told now (`briefNow`), from `workflows` — the
 * workflow the run froze, as the tick composes it, with its place's words. For a filed task the engine has no record of, nobody can say.
 */
function briefOf(
  run: Run,
  name: string,
  workflows: readonly Workflow[] | null,
  views: Views,
  placeService: PlaceService['Service'],
): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? briefNow(step, run, workflows, placeService) : null;
}

/**
 * A part of a step's task (`handedParts`): its own text, or a `## From run <id>` section, with `how` the run was handed it as its record
 * says — `waited` for a run it waited on (`after`), `read` for one handed as context (`context`) — and none for a run the record names in
 * neither.
 */
export type TaskPart = { kind: 'text'; text: string } | (Extract<HandedPart, { kind: 'from' }> & { how?: 'waited' | 'read' });

/** `task` split into its parts (`handedParts`), each `## From run` section's `how` read off `run`. */
function taskPartsOf(run: Run, task: string): TaskPart[] {
  return handedParts(task).map((part) => {
    if (part.kind === 'text') return part;
    if (run.after?.includes(part.run)) return { ...part, how: 'waited' };
    return run.context?.includes(part.run) ? { ...part, how: 'read' } : part;
  });
}

/**
 * What a step was told, whole (`briefOf`), by layer (`toldLayers`) and its task by part (`taskPartsOf`): the layers from the step `run`
 * froze, never from `workflows` where that is the folder as it is now; null on a record that froze none, or that froze no step `name`. The
 * parts are of the task layer, or of the brief whole where no layer was frozen; null where nothing was told.
 */
export function toldOf(
  run: Run,
  name: string,
  workflows: readonly Workflow[] | null,
  views: Views,
  placeService: PlaceService['Service'],
): { told: string | null; layers: ToldLayers | null; taskParts: TaskPart[] | null } {
  const told = briefOf(run, name, workflows, views, placeService);
  const frozen = run.workflow?.find((s) => s.name === name);
  const layers = frozen ? toldLayers(frozen, told) : null;
  const task = layers?.task ?? told;
  return { told, layers, taskParts: task === null ? null : taskPartsOf(run, task) };
}
