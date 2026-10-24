/**
 * A task's path through the runtime's lifecycle as the Debug panel draws it (`DebugPanel`): which state is lit, which routes of the
 * graph were taken to reach it, when the path is read again, and the stamp that keys it by the step's state. Pure, with file imports
 * only, so a node test reads it as the page does.
 */
import type { MachineGraph, MachineVerb } from './api/machines.ts';
import type { LifecycleTransition, StepPath } from './api/steps.ts';

/**
 * How often the path of a task still moving is read again while the panel is open: a move that changes no step's word says nothing on the
 * feed.
 */
export const PATH_POLL_MS = 2_000;

/**
 * How often a path is read again, as a query's `refetchInterval`: every `PATH_POLL_MS` for the current try while its task is filed and
 * not in one of the machine's `final` states, and never for an earlier try, a step not filed, a path not read yet, or a machine whose
 * final states are not known.
 */
export function pathPoll(read: StepPath | undefined, final: readonly string[], current: boolean): number | false {
  if (!current || !read || read.taskId === null || final.length === 0) return false;
  const last = read.path.at(-1);
  return last && final.includes(last.state) ? false : PATH_POLL_MS;
}

/**
 * What keys the current try's path by the step's state in the run's record: its task, how many tries it has had, and its word. The
 * feed's `step` event reads the record again, and a step that moved reads its path again under a key of its own.
 */
export const pathStamp = (step: { taskId: string | null; tries: readonly unknown[]; status: string }): string =>
  `${step.taskId ?? '-'}|${step.tries.length}|${step.status}`;

/** The state lit at step `at` of `path`: the state its journal said once that entry was on it; undefined for an empty path. */
export const litAt = (path: readonly LifecycleTransition[], at: number): string | undefined => path[Math.min(at, path.length - 1)]?.state;

/**
 * The routes of the graph the path took up to step `at`, as the drawing names them (`from->to`): each move from one state to another
 * that an edge of the graph joins, or a verb a person takes from the one to the other — a stop, an answer or a close. A step that keeps
 * its state takes no route, and neither does a move nothing joins, which the timeline shows all the same.
 */
export function takenRoutes(path: readonly LifecycleTransition[], at: number, graph: Pick<MachineGraph, 'edges' | 'verbs'>): string[] {
  const routes = new Set([
    ...graph.edges.filter((e) => e.from !== e.to).map((e) => `${e.from}->${e.to}`),
    ...graph.verbs.flatMap((v) => v.from.map((from) => `${from}->${v.to}`)),
  ]);
  const taken = new Set<string>();
  for (let i = 1; i <= Math.min(at, path.length - 1); i++) {
    const id = `${path[i - 1].state}->${path[i].state}`;
    if (routes.has(id)) taken.add(id);
  }
  return [...taken];
}

/**
 * The verb a person wrote that moved the path at step `i`: the one that journals the step's entry and is taken from the state before to
 * the state after. Undefined for the first step, a step that keeps its state, and a move no verb makes so.
 */
export function byPerson(path: readonly LifecycleTransition[], i: number, verbs: readonly MachineVerb[]): string | undefined {
  const [before, step] = [path[i - 1], path[i]];
  if (!before || !step || before.state === step.state) return undefined;
  return verbs.find((v) => v.entry === step.event && v.to === step.state && v.from.includes(before.state))?.verb;
}

/** A box on the page, as `getBoundingClientRect` gives one. */
type Box = { readonly top: number; readonly height: number };

/**
 * Where a scrolling `view` scrolled `scrollTop` down must scroll to show `box` centred: `null` when the box already lies whole inside the
 * view, and `undefined` when the box is not laid out yet (no height), so there is nothing to scroll to.
 */
export function centredScroll(view: Box, box: Box, scrollTop: number): number | null | undefined {
  if (box.height === 0) return undefined;
  if (box.top >= view.top && box.top + box.height <= view.top + view.height) return null;
  return Math.max(0, scrollTop + box.top + box.height / 2 - (view.top + view.height / 2));
}
