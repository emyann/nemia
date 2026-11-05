/**
 * The words of a run's routing, laid over where each step stands: the route a condition answered (`answeredRoute`), and what that makes of
 * the nodes after it (`routedWords`, `runWords`) — `skipped` off the route taken, `sent` for a workflow node that filed its card, and a
 * table condition's own word. Pure, worked out on every pass from facts, carrying nothing between passes.
 */
import type { Verdict } from '../check/check.ts';
import type { Closeout } from '../closeout/index.ts';
import { satisfiesAfter, tryOf, type CloseoutAsked, type Run, type StepStatus, type TaskPhase } from '../record/record.ts';
import type { RouteEval, Workflow } from '../step/step.ts';
import { approvalOf, hasGate, standing, type SpendOf } from '../status/status.ts';
import { conditionOf, nodeFate, nodeKind, tableRoute } from '../route/index.ts';

/**
 * Whether a condition's route is settled for the run: a node after it has been filed, or sent its card. Until then a table's copy on the
 * record yields to its producer's closeout, read afresh, so a producer tried again proposes its route anew.
 */
export const routeSettled = (condition: Workflow, run: Run, steps: readonly Workflow[]): boolean =>
  steps.some((s) => s.after.includes(condition.name) && Boolean(run.steps[s.name]?.taskId || run.steps[s.name]?.sent));

/** What a table answers off its producer's signed closeout, read afresh; undefined until the producer has signed off on its work. */
function tableRead(
  by: Extract<RouteEval, { kind: 'table' }>,
  routes: readonly string[],
  closeoutOf: (step: string) => Closeout | undefined,
  wordOf: (step: string) => StepStatus,
): { kind: 'route'; route: string } | { kind: 'unsigned' } | undefined {
  const [producer = '', ...field] = by.from.split('.');
  const said = satisfiesAfter(wordOf(producer)) ? closeoutOf(producer) : undefined;
  return said ? tableRoute(by, routes, said.output?.[field.join('.')]) : undefined;
}

/**
 * The route a condition answered on the try it is on, and who said it — or `unsigned`, a table with no row for its producer's fact, or
 * `undefined` while nothing has answered. A person's word first (`nemia route`, its file composed onto the record as `by: 'person'` by
 * `readRun`), then what the record holds for the try (`StepRecord.route`, which the tick copies once), then, for a table, the producer's
 * signed closeout looked up in it (`tableRoute`), and for a judge or a script its own signed closeout's `route` (a script's answer file is
 * read as its closeout, `scriptCloseouts` in route.store.ts). Pure.
 *
 * @param wordOf The word each step reads on this pass: a producer is read only once it signed off on its work.
 */
export function answeredRoute(
  condition: Workflow,
  run: Run,
  closeoutOf: (step: string) => Closeout | undefined,
  wordOf: (step: string) => StepStatus,
  steps: readonly Workflow[],
): { kind: 'route'; route: string } | { kind: 'unsigned' } | undefined {
  const routes = condition.routes ?? [];
  const kept = run.steps[condition.name]?.route;
  const keeps = kept !== undefined && kept.try === tryOf(run, condition.name) && routes.includes(kept.route);
  const by = condition.route;
  if (keeps && (kept.by !== 'table' || by?.kind !== 'table' || routeSettled(condition, run, steps)))
    return { kind: 'route', route: kept.route };
  if (by?.kind === 'table') return tableRead(by, routes, closeoutOf, wordOf) ?? (keeps ? { kind: 'route', route: kept.route } : undefined);
  if (by !== undefined && satisfiesAfter(wordOf(condition.name))) {
    const route = closeoutOf(condition.name)?.output?.route;
    return typeof route === 'string' && routes.includes(route) ? { kind: 'route', route } : undefined;
  }
  return undefined;
}

/**
 * The words of a run's routing, laid over where each step stands (`standing`): what no one step's own work says, since it turns on another
 * node's answer. In the steps' order, each read off the words before it. Pure, and carries nothing between passes.
 *
 * - A node never filed is `skipped` when its condition answered a route its `when:` does not take, or one in the condition's `ends:`, or
 *   when every node it waits on is skipped (`nodeFate`).
 * - A workflow node that filed its card (`StepRecord.sent`) is `sent`.
 * - A table condition, never filed, is `unverified` once its table answers a route, `unsigned` when it answers none, and `awaiting
 *   approval` in between where it is gated and the try it is on is not approved, as a gated step is. A judge condition reads as a step,
 *   and so does a script condition, but that a clean exit with no route it declares is `unsigned` (`scriptWord`).
 *
 * A workflow with none of the routing keys reads exactly as `standing` read it.
 */
export function routedWords(
  steps: readonly Workflow[],
  run: Run,
  stood: ReadonlyMap<string, StepStatus>,
  closeoutOf: (step: string) => Closeout | undefined,
): Map<string, StepStatus> {
  const words = new Map(stood);
  const wordOf = (name: string): StepStatus => words.get(name) ?? 'pending';
  for (const step of steps) {
    const routed = routedWord(step, steps, run, closeoutOf, wordOf);
    if (routed !== undefined) words.set(step.name, routed);
  }
  return words;
}

/** One node's routing word, off the words of the nodes before it, or `undefined` where its own standing says it. */
function routedWord(
  step: Workflow,
  steps: readonly Workflow[],
  run: Run,
  closeoutOf: (step: string) => Closeout | undefined,
  wordOf: (step: string) => StepStatus,
): StepStatus | undefined {
  const record = run.steps[step.name];
  if (record?.sent) return nodeKind(step) === 'workflow' ? 'sent' : undefined;
  if (record?.taskId) return step.route?.kind === 'script' ? scriptWord(step, run, closeoutOf, wordOf) : undefined;
  if (offRoute(step, steps, run, closeoutOf, wordOf)) return 'skipped';
  if (step.route?.kind !== 'table' || wordOf(step.name) !== 'pending') return undefined;
  const answer = answeredRoute(step, run, closeoutOf, wordOf, steps);
  if (answer === undefined) return undefined;
  if (answer.kind === 'unsigned') return 'unsigned';
  return hasGate(step, run) && !approvalOf(run, step.name) ? 'awaiting approval' : 'unverified';
}

/**
 * A filed script condition's word: `unsigned` where its task exited 0 and it signed off with no route it declares (no answer file, an
 * undeclared route), which its standing reads `unverified`; else its standing's (a route, `blocked`, `failed`, `stopped`, running).
 */
function scriptWord(
  step: Workflow,
  run: Run,
  closeoutOf: (step: string) => Closeout | undefined,
  wordOf: (step: string) => StepStatus,
): StepStatus | undefined {
  if (wordOf(step.name) !== 'unverified') return undefined;
  return answeredRoute(step, run, closeoutOf, wordOf, [])?.kind === 'route' ? undefined : 'unsigned';
}

/** Every step's word on this pass: where it stands (`standing`), with its routing laid over it (`routedWords`). Pure. */
export function runWords(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  spendOf: SpendOf = () => undefined,
  verdictOf: (step: string) => Verdict | undefined = () => undefined,
): Map<string, StepStatus> {
  const stood = steps.map((s): [string, StepStatus] => [
    s.name,
    standing(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, verdictOf).status,
  ]);
  return routedWords(steps, run, new Map(stood), closeoutOf);
}

/** Whether a node never filed is off the route taken: off its condition's `when:`, after a route its condition ends on, or after skips. */
function offRoute(
  step: Workflow,
  steps: readonly Workflow[],
  run: Run,
  closeoutOf: (step: string) => Closeout | undefined,
  wordOf: (step: string) => StepStatus,
): boolean {
  const parents = step.after.map(wordOf);
  const condition = conditionOf(step, steps);
  const answered = condition ? answeredRoute(condition, run, closeoutOf, wordOf, steps) : undefined;
  if (nodeFate(step.when, answered?.kind === 'route' ? answered.route : undefined, parents) === 'skipped') return true;
  return step.after.some((name) => {
    const parent = steps.find((s) => s.name === name);
    if (parent?.ends === undefined) return false;
    const said = answeredRoute(parent, run, closeoutOf, wordOf, steps);
    return said?.kind === 'route' && parent.ends.includes(said.route);
  });
}
