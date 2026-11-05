/**
 * A condition's route, decided from facts on disk and evaluated nowhere: the route a closed table picks for a producer's fact
 * (`tableRoute`), what a script's answer file reads as (`scriptRoute`), and what becomes of a node not yet filed (`nodeFate`), each pure
 * and proved by its contract under `contracts/`. Worked out on every pass; nothing is carried between passes.
 */
import type { NodeFate } from '../../contracts/join.contract.ts';
import type { ScriptRoute } from '../../contracts/route-answer.contract.ts';
import type { TableRoute } from '../../contracts/route-table.contract.ts';
import { stopsFollowers } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';

export type { Fate } from '../../contracts/join.contract.ts';
export type { ScriptAnswer, ScriptRead, ScriptVerdict } from '../../contracts/route-answer.contract.ts';
export type { RouteTable, TablePick } from '../../contracts/route-table.contract.ts';

/**
 * The route the table holds for the producer's value, when the value is a string with a row of the table's own naming a declared route;
 * else none. A value spelled as a prototype key ("constructor") has no row.
 */
export const tableRoute: TableRoute = (table, routes, value) => {
  if (typeof value !== 'string' || !Object.hasOwn(table.table, value)) return { kind: 'unsigned' };
  const row = table.table[value];
  return row !== undefined && routes.includes(row) ? { kind: 'route', route: row } : { kind: 'unsigned' };
};

/** A script condition's read: only a clean exit whose answer names a declared route is a route; every other case a word of its own. */
export const scriptRoute: ScriptRoute = (verdict, answer, routes) => {
  if (verdict === 'unfinished') return { kind: 'stopped' };
  if (verdict !== 0) return { kind: 'failed' };
  if (answer === undefined) return { kind: 'unsigned' };
  if (answer.kind === 'unsure') return { kind: 'blocked', unsure: answer.unsure };
  return routes.includes(answer.route) ? { kind: 'route', route: answer.route } : { kind: 'unsigned' };
};

/** What a node not yet filed does on this pass, from its `when:`, its condition's answer and its parents' words. */
export const nodeFate: NodeFate = (when, answered, parents) => {
  if (when !== undefined && answered !== undefined && !when.includes(answered)) return 'skipped';
  if (parents.length > 0 && parents.every((p) => p === 'skipped')) return 'skipped';
  if (parents.some((p) => stopsFollowers(p))) return 'unreachable';
  if (when !== undefined && answered === undefined) return 'waits';
  const satisfied = (p: string): boolean => p === 'verified' || p === 'unverified' || p === 'sent';
  if (!parents.every((p) => satisfied(p) || p === 'skipped')) return 'waits';
  return parents.length === 0 || parents.some(satisfied) ? 'ready' : 'waits';
};

/** What kind of node a step is: a condition (`routes:`), a route to a workflow (`workflow:`), or a step. */
export type NodeKind = 'step' | 'condition' | 'workflow';

export const nodeKind = (step: Pick<Workflow, 'routes' | 'workflow'>): NodeKind =>
  step.routes !== undefined ? 'condition' : step.workflow !== undefined ? 'workflow' : 'step';

/** The one condition among a `when:` node's parents (load holds there is exactly one); undefined on a node with no `when:`. */
export const conditionOf = (step: Workflow, steps: readonly Workflow[]): Workflow | undefined =>
  step.when === undefined ? undefined : steps.find((s) => step.after.includes(s.name) && s.routes !== undefined);
