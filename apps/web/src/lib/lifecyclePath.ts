/**
 * A task's path through the runtime's lifecycle as the Debug panel draws it (`DebugPanel`): which state is lit, which routes of the
 * graph were taken to reach it, when the path is read again, and the stamp that keys it by the step's state. Pure, with file imports
 * only, so a node test reads it as the page does.
 */
import type { LifecycleTransition, MachineGraph, MachineVerb, StepPath } from './api/steps.ts';
import type { RunStepStatus } from 'objects';

/**
 * How often the path of a task still moving is read again while the panel is open: a move that changes no step's word says nothing on the
 * feed.
 */
export const PATH_POLL_MS = 2_000;

/**
 * How often a path is read again, as a query's `refetchInterval`: every `PATH_POLL_MS` for the current try while its task is filed and
 * not in one of the machine's `final` states, and never for an earlier try, a step not filed, a path not read yet, or a machine whose
 * final states are not known.
 * @param read The step's path as last read, or undefined while it is not read.
 * @param final The machine's final states, empty where they are not known.
 * @param current Whether the path is of the step's current try.
 */
export function pathPoll(read: StepPath | undefined, final: readonly string[], current: boolean) {
  if (!current || !read || read.taskId === null || final.length === 0) return false;
  const last = read.path.at(-1);
  return last && final.includes(last.state) ? false : PATH_POLL_MS;
}

/**
 * What keys a step's sub-resources by its state in the run object — its tries and what it was told (`stepTriesQuery`, `stepToldQuery`),
 * and its current try's path: its task, how many attempts it has had, and its current try, by number, round, phase, reason, outcome and
 * verdict. The feed's events read the object again, and a step that moved reads them again under a key of its own; what it cost, and
 * what a person said to it, move none of it.
 * @param step The step's status in the run object: its task, its attempts and its current try.
 */
export const stepStamp = <S extends Pick<RunStepStatus, 'taskId' | 'attempts' | 'current'>>(step: S) => {
  const c = step.current;
  const now = c
    ? [c.try, c.round, c.phase, c.reason, c.outcome ?? '-', c.verdict ? `${c.verdict.result}:${c.verdict.exit ?? '-'}` : '-'].join('.')
    : '-';
  return `${step.taskId ?? '-'}|${step.attempts.count}|${now}`;
};

/**
 * The state lit at step `at` of `path`: the state its journal said once that entry was on it; undefined for an empty path.
 * @param path The task's path, each entry a state its journal said.
 * @param at The index of the entry on the timeline; past the end, the last.
 */
export const litAt = (path: readonly LifecycleTransition[], at: number) => path[Math.min(at, path.length - 1)]?.state;

/**
 * The routes of the graph the path took up to step `at`, as the drawing names them (`from->to`): each move from one state to another
 * that an edge of the graph joins, or a verb a person takes from the one to the other — a stop, an answer or a close. A step that keeps
 * its state takes no route, and neither does a move nothing joins, which the timeline shows all the same.
 * @param path The task's path, each entry a state its journal said.
 * @param at The index of the entry on the timeline the routes are taken up to.
 * @param graph The machine's graph: its edges and the verbs a person takes.
 */
export function takenRoutes(path: readonly LifecycleTransition[], at: number, graph: Pick<MachineGraph, 'edges' | 'verbs'>) {
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
 * @param path The task's path, each entry a state its journal said.
 * @param i The index of the entry asked about.
 * @param verbs The verbs a person takes on the machine.
 */
export function byPerson(path: readonly LifecycleTransition[], i: number, verbs: readonly MachineVerb[]) {
  const [before, step] = [path[i - 1], path[i]];
  if (!before || !step || before.state === step.state) return undefined;
  return verbs.find((v) => v.entry === step.event && v.to === step.state && v.from.includes(before.state))?.verb;
}

/** A box on the page, as `getBoundingClientRect` gives one. */
type Box = { readonly top: number; readonly height: number };

/**
 * Where a scrolling `view` scrolled `scrollTop` down must scroll to show `box` centred: `null` when the box already lies whole inside the
 * view, and `undefined` when the box is not laid out yet (no height), so there is nothing to scroll to.
 * @param view The scrolling view's box on the page.
 * @param box The box to show, on the page.
 * @param scrollTop How far the view is scrolled down now, in pixels.
 */
export function centredScroll(view: Box, box: Box, scrollTop: number) {
  if (box.height === 0) return undefined;
  if (box.top >= view.top && box.top + box.height <= view.top + view.height) return null;
  return Math.max(0, scrollTop + box.top + box.height / 2 - (view.top + view.height / 2));
}
