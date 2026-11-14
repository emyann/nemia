/**
 * What a step was told and filed with, for the run page: the brief whole, and by layer from what the run froze (`toldLayers`); and what
 * the engine filed its current try with (`StepFiled`): the model, the fence, the mode its session runs in, the remote agent it was sent to
 * and its bridge, off the engine's record of its task.
 */
import { handedParts, type HandedPart, type Run, type StepRecord, type ToldLayers, toldLayers } from '../run.ts';
import { remoteNameOf, type StepSpec } from '../workflow.ts';
import { briefNow } from '../tick/told.verb.ts';
import type { Views } from '../summary/reads.verb.ts';
import type { PlaceService } from '../place/place.store.ts';
import { type Bridge, bridgeOf } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { remoteAgents } from '../runtime-client.ts';
import { runsInOf } from './runs-in.ts';
import type { HandedHow, RunsInBy, TaskSource } from 'objects';

/**
 * What the engine filed a step's current try with, off its record of the task: what the step runs with where its workflow
 * leaves a field to the engine. Each field is null where the task was filed without it — a deadline, which is then no limit; a
 * model, effort or tools, which are then the harness's own; a permission mode, which its harness chooses, and `runsIn` says.
 */
export type StepFiled = {
  model: string | null;
  /**
   * The model a person's `nemia retry --model` asked this try for, off the run's record (`EarlierTry.model`): what tells a model the
   * try was filed on from a default. Null when nobody asked.
   */
  askedModel: string | null;
  effort: string | null;
  /** The context window the try was filed with, in tokens (`contextTokens`): null for the model's whole window. */
  contextTokens: number | null;
  /**
   * The fence the try was filed with, as the engine's task names it: Claude Code's permission mode, or Codex's sandbox (a step's
   * `sandbox:`).
   */
  permissionMode: string | null;
  /**
   * The permission mode the session runs in, off its last attempt's `ranIn`, which the runtime measured (`runsInOf`): the mode filed
   * (`filed`); the harness's choice when none was (`default`); or another its harness ran it in than the one filed (`harness`), as Claude
   * Code dropping `auto` on a model or Codex narrowing its sandbox. Null where the runtime measured none: no attempt yet, a session that
   * has not said its mode, or a harness that cannot say one.
   */
  runsIn: { mode: string; by: RunsInBy } | null;
  /**
   * The remote A2A agent the try was sent to, for a step that says `harness: a2a:<name>` (`remoteOf`): its name, and its address as the
   * store's `a2a-agents.json` gives it now — origin and path, never a query or a secret, which is never in the file — or null where the
   * file does not declare it or cannot be read. Null for a local harness, whose mode is `runsIn`.
   */
  remote: { name: string; address: string | null } | null;
  /**
   * The session's web link, for a step whose sessions are bridged (`remote: true`), off its task's view (`bridgeOf`): its `url` where the
   * bridge is up, else `why` it is not. Null for a step not bridged, an A2A remote step among them.
   */
  bridge: Bridge | null;
  tools: string[] | null;
  deadlineSeconds: number | null;
};

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
  workflows: readonly StepSpec[] | null,
  views: Views,
  placeService: PlaceService['Service'],
): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? briefNow(step, run, workflows, placeService) : null;
}

/**
 * A part of a step's task (`handedParts`): a section's text with whose words it carries (`source`, which the cut always gives and
 * objects' Schema keeps optional), or a `## From run <id>` section, with `how` the
 * run was handed it as its record says — `waited` for a run it waited on (`after`), `read` for one handed as context (`context`) — and none
 * for a run the record names in neither.
 */
export type TaskPart =
  | { kind: 'text'; text: string; source?: TaskSource; step?: string }
  | (Extract<HandedPart, { kind: 'from' }> & { how?: HandedHow });

/**
 * `task`, step `name`'s, split into its parts (`handedParts`) at the headings the run writes, a `<step>` of one named by a step the run
 * froze — or, on a record that froze none, of `workflows` — and each `## From run` section's `how` read off `run`.
 */
function taskPartsOf(run: Run, name: string, workflows: readonly StepSpec[] | null, task: string): TaskPart[] {
  const steps = (run.workflow ?? workflows ?? []).map((s) => s.name);
  return handedParts(task, steps, name).map((part) => {
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
  workflows: readonly StepSpec[] | null,
  views: Views,
  placeService: PlaceService['Service'],
): { told: string | null; layers: ToldLayers | null; taskParts: TaskPart[] | null } {
  const told = briefOf(run, name, workflows, views, placeService);
  const frozen = run.workflow?.find((s) => s.name === name);
  const layers = frozen ? toldLayers(frozen, told) : null;
  const task = layers?.task ?? told;
  return { told, layers, taskParts: task === null ? null : taskPartsOf(run, name, workflows, task) };
}

/**
 * What the engine filed a step's current try with (`StepFiled`), off its record; null for no task, or one the engine has no record of. The
 * harness's arguments are the adapter's, under `config` (agent-runtime's `HarnessArgs`), which the engine carries unread.
 */
export function filedOf(record: StepRecord | undefined, views: Views, home: string): StepFiled | null {
  const view = record?.taskId ? views.get(record.taskId) : undefined;
  if (!view || phaseOfView(view) === 'unknown') return null;
  const { deadlineSeconds } = view.state;
  const { model, effort, contextTokens, permissionMode, tools } = view.state.config ?? {};
  return {
    model: model ?? null,
    askedModel: askedModelOf(record),
    effort: effort ?? null,
    contextTokens: contextTokens ?? null,
    permissionMode: permissionMode ?? null,
    runsIn: runsInOf(permissionMode, view.state.attempts.at(-1)?.ranIn),
    remote: remoteOf(view.state.harness, home),
    bridge: bridgeOf(views)(view.id),
    tools: tools ?? null,
    deadlineSeconds: deadlineSeconds ?? null,
  };
}

/**
 * The model a person's `nemia retry --model` asked a step's current try for: on the try its task replaced, where `nextTry` keeps the
 * model with the mode — found past any recheck, which replaced only a check, and kept the task.
 */
function askedModelOf(record: StepRecord | undefined): string | null {
  const tries = record?.tries ?? [];
  return [...tries].reverse().find((t) => t.cause !== 'recheck')?.model ?? null;
}

/**
 * The remote A2A agent a task was filed on (`StepFiled.remote`), or null for a local harness. Its address is read from the store's
 * `a2a-agents.json` on each request (`remoteAgents`), as the base URL given or, for an agent given by its card, the card's first interface:
 * origin and path alone, so a query string that carries a key is never shown. A file that does not declare the name, whose entry for it is
 * refused, or that is refused as it stands, gives no address — the run's page is still drawn, and `nemia up` says what is wrong with the
 * file.
 */
function remoteOf(harness: string | undefined, home: string): StepFiled['remote'] {
  const name = remoteNameOf(harness);
  if (name === undefined) return null;
  let agent: Record<string, unknown> | undefined;
  try {
    agent = remoteAgents(home).get(name);
  } catch {
    return { name, address: null };
  }
  const interfaces = (agent?.card as { supportedInterfaces?: Array<{ url?: unknown }> } | undefined)?.supportedInterfaces;
  const given = agent?.url ?? interfaces?.[0]?.url;
  if (typeof given !== 'string' || !URL.canParse(given)) return { name, address: null };
  const url = new URL(given);
  return { name, address: `${url.origin}${url.pathname === '/' ? '' : url.pathname}` };
}
