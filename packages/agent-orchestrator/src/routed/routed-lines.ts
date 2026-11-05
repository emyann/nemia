/**
 * What `nemia ls` and `nemia decide` say of a run's routing (`routedRows`): a node off the route `skipped (<condition>: <route>)`, a
 * workflow node `sent → <card>`, a condition never filed its route, and the line that routes it by hand. Pure.
 */
import type { Workflow } from '../step/step.ts';
import type { Closeout } from '../closeout/index.ts';
import type { CloseoutAsked, Run, StepStatus, TaskPhase } from '../record/record.ts';
import type { Verdict } from '../check/check.ts';
import type { SpendOf } from '../status/status.ts';
import { codedStep, REASON_OF, type CodedStep } from '../phase/phase.ts';
import { answeredRoute, personRouted, runWords } from './routed-words.ts';

/** A step's row as the routing words it: what to say, its code, and the line that routes a condition by hand. */
/** A routed step's row: its whole line, or (`besides`) words said after the line its own work gives, as a gate's proposed route. */
export type RoutedRow = (CodedStep & { message: string; note?: string }) | { besides: string };

/** The line a person types to route a condition by hand. */
export const routeLine = (run: Pick<Run, 'id'>, condition: Workflow): string =>
  `nemia route ${run.id} ${condition.name} <${(condition.routes ?? []).join('|')}>`;

/** The condition a skipped node is off the route of: its `when:` condition, or a condition before it whose route ends. */
const conditionBefore = (step: Workflow, steps: readonly Workflow[]): Workflow | undefined =>
  steps.find((s) => step.after.includes(s.name) && s.routes !== undefined);

/** What `routedRows` reads of a listing (`ListingInput`): the engine's word for a task's phase, as the list is given it. */
export type RoutedInput = {
  readonly steps: readonly Workflow[];
  readonly run: Run;
  readonly phaseOf: (taskId: string) => string;
  readonly closeoutOf: (step: string) => Closeout | { error: string } | undefined;
  readonly askedCloseout?: (taskId: string) => CloseoutAsked;
  readonly spendOf?: SpendOf;
  readonly verdictOf?: (step: string) => Verdict | undefined;
};

/** The engine's word as a step's standing reads it: a session that stopped to ask is still at work, and what is not settled runs. */
export const settledOf =
  (phaseOf: (taskId: string) => string) =>
  (taskId: string): TaskPhase => {
    const word = phaseOf(taskId);
    if (word === 'input-required') return 'succeeded';
    return word === 'succeeded' || word === 'failed' || word === 'stopped' || word === 'unknown' ? word : 'running';
  };

/** A listing's closeouts as the routing reads them: one nobody can read is none. */
const readableOf =
  (input: RoutedInput) =>
  (name: string): Closeout | undefined => {
    const c = input.closeoutOf(name);
    return c && !('error' in c) ? c : undefined;
  };

/** Every step's word on this pass (`runWords`), off a listing's input: the engine's words as a step's standing reads them. */
export const listedWords = (input: RoutedInput): Map<string, StepStatus> =>
  runWords(input.steps, input.run, settledOf(input.phaseOf), readableOf(input), input.askedCloseout, input.spendOf, input.verdictOf);

/**
 * The rows the routing words for a run's steps never filed, by name: every other step reads as its own work says. A skipped node says the
 * condition and the route taken; a sent node its card; a condition never filed (a table, or one a person routed) the route it answers, or
 * that its table answers none, with the line that routes it by hand while no node after it is filed; a filed condition that stopped on no
 * route of its own (`blocked`, `unsigned`) that line too, and one a person routed its route.
 *
 * @param words Every step's word on this pass (`runWords`), where the caller judged them already; else judged here (`listedWords`).
 */
export function routedRows(input: RoutedInput, words?: ReadonlyMap<string, StepStatus>): Map<string, RoutedRow> {
  const { steps, run } = input;
  const rows = new Map<string, RoutedRow>();
  if (!steps.some((s) => s.routes !== undefined)) return rows;
  const closeoutOf = readableOf(input);
  const said = words ?? listedWords(input);
  const wordOf = (name: string): StepStatus => said.get(name) ?? 'pending';
  const routeOf = (condition: Workflow): string | undefined => {
    const said = answeredRoute(condition, run, closeoutOf, wordOf, steps);
    return said?.kind === 'route' ? said.route : undefined;
  };
  const needsOf = (name: string): string | undefined => closeoutOf(name)?.needs ?? undefined;
  for (const step of steps) {
    const row = rowOf(step, steps, run, wordOf(step.name), { routeOf, needsOf });
    if (row) rows.set(step.name, row);
  }
  return rows;
}

/** What a row reads of the pass beyond a step's word: the route each condition answers, and what a step that signed off blocked needs. */
type RowReads = {
  readonly routeOf: (condition: Workflow) => string | undefined;
  readonly needsOf: (step: string) => string | undefined;
};

/** One step's routed row, off its word on the pass and the route each condition answers; undefined where its own work says it. */
function rowOf(step: Workflow, steps: readonly Workflow[], run: Run, word: StepStatus, reads: RowReads): RoutedRow | undefined {
  const record = run.steps[step.name];
  if (word === 'sent' && record?.sent) return { message: `sent → ${record.sent.card}`, ...codedStep(REASON_OF.sent) };
  if (word === 'skipped') {
    const condition = conditionBefore(step, steps);
    const route = condition ? reads.routeOf(condition) : undefined;
    return { message: condition && route ? `skipped (${condition.name}: ${route})` : 'skipped', ...codedStep(REASON_OF.skipped) };
  }
  if (step.routes === undefined) return undefined;
  const settled = steps.some((s) => s.after.includes(step.name) && Boolean(run.steps[s.name]?.taskId || run.steps[s.name]?.sent));
  const offer = settled ? {} : { note: `route it by hand: ${routeLine(run, step)}` };
  if (record?.taskId) return filedRow(step, run, word, reads, offer);
  if (word === 'unsigned') return { message: 'unsigned: its table answers no route', ...codedStep(REASON_OF.unsigned), ...offer };
  const route = reads.routeOf(step);
  if (route === undefined) return undefined;
  if (word === 'awaiting approval') return { besides: `proposes ${route}` };
  return { message: `routed: ${route}`, ...codedStep(REASON_OF[word]), ...offer };
}

/**
 * A filed condition's row: one that stopped on no route of its own (`blocked`, a script's unsure answer; `unsigned`) says so with the line
 * that routes it by hand while no node after it is filed, and one a person routed says the route; undefined where its own work says it.
 */
function filedRow(step: Workflow, run: Run, word: StepStatus, reads: RowReads, offer: { note?: string }): RoutedRow | undefined {
  if (word === 'blocked') {
    const needs = reads.needsOf(step.name);
    return { message: needs ? `blocked: ${needs}` : 'blocked', ...codedStep(REASON_OF.blocked), ...offer };
  }
  if (word === 'unsigned') return { message: 'unsigned: it answered no route of its own', ...codedStep(REASON_OF.unsigned), ...offer };
  const route = reads.routeOf(step);
  return word === 'unverified' && route !== undefined && personRouted(step, run)
    ? { message: `routed: ${route}`, ...codedStep(REASON_OF.unverified), ...offer }
    : undefined;
}
