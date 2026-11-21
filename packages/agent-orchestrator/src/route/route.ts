/**
 * A condition's route, decided from facts on disk and evaluated nowhere: the route a closed table picks for a producer's fact
 * (`tableRoute`), what a script's answer file reads as (`scriptRoute`), and what becomes of a node not yet filed (`nodeFate`), each pure
 * and proved by its contract under `contracts/`. Worked out on every pass; nothing is carried between passes.
 */
import type { NodeFate } from '../../contracts/join.contract.ts';
import type { ScriptRoute } from '../../contracts/route-answer.contract.ts';
import type { TableRoute } from '../../contracts/route-table.contract.ts';
import { stopsFollowers } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';
import type { NodeKind } from 'objects';

export type { Fate } from '../../contracts/join.contract.ts';
export type { ScriptAnswer, ScriptRead, ScriptVerdict } from '../../contracts/route-answer.contract.ts';
export type { RouteTable, TablePick } from '../../contracts/route-table.contract.ts';

/**
 * The route the table holds for the producer's value, when the value is a string with a row of the table's own naming a declared route;
 * else none. A value spelled as a prototype key ("constructor") has no row.
 * @param table The condition's table eval: the producer's field and its rows, each a value to a route.
 * @param routes The routes the condition declares.
 * @param value The producer's value of the table's field, of any type.
 */
export const tableRoute: TableRoute = (table, routes, value) => {
  if (typeof value !== 'string' || !Object.hasOwn(table.table, value)) return { kind: 'unsigned' };
  const row = table.table[value];
  return row !== undefined && routes.includes(row) ? { kind: 'route', route: row } : { kind: 'unsigned' };
};

/**
 * A script condition's read: only a clean exit whose answer names a declared route is a route; every other case a word of its own.
 * @param verdict What the script exited with: its exit code, or `unfinished` where it did not end.
 * @param answer The answer the script wrote, or undefined where it wrote none.
 * @param routes The routes the condition declares.
 */
export const scriptRoute: ScriptRoute = (verdict, answer, routes) => {
  if (verdict === 'unfinished') return { kind: 'stopped' };
  if (verdict !== 0) return { kind: 'failed' };
  if (answer === undefined) return { kind: 'unsigned' };
  if (answer.kind === 'unsure') return { kind: 'blocked', unsure: answer.unsure };
  return routes.includes(answer.route) ? { kind: 'route', route: answer.route } : { kind: 'unsigned' };
};

/**
 * What a node not yet filed does on this pass, from its `when:`, its condition's answer and its parents' words.
 * @param when The node's `when:` routes, or undefined on a node with none.
 * @param answered The route its condition answered, or undefined where it has not.
 * @param parents The words of the node's parents (`StepStatus`), as this pass reads them.
 */
export const nodeFate: NodeFate = (when, answered, parents) => {
  if (when !== undefined && answered !== undefined && !when.includes(answered)) return 'skipped';
  if (parents.length > 0 && parents.every((p) => p === 'skipped')) return 'skipped';
  if (parents.some((p) => stopsFollowers(p))) return 'unreachable';
  if (when !== undefined && answered === undefined) return 'waits';
  const satisfied = (p: string) => {
    if (p === 'verified' || p === 'unverified' || p === 'sent') return true;
    return false;
  };
  if (!parents.every((p) => satisfied(p) || p === 'skipped')) return 'waits';
  return parents.length === 0 || parents.some(satisfied) ? 'ready' : 'waits';
};

/** What kind of node a step is: a condition (`routes:`), a card node (`workflow:` or `card:`), a command (`run:`), or a step. */
export type { NodeKind };

/**
 * What kind of node a step is: a condition (`routes:`), a route to a workflow (`workflow:`), a command (`run:`), or a step.
 * @param step The step read: its `routes`, its `workflow` and `card`, and its `run`.
 */
export const nodeKind = (step: Pick<StepSpec, 'routes' | 'workflow' | 'card' | 'run'>) => {
  const kind: NodeKind =
    step.routes !== undefined ? 'condition' : isCardNode(step) ? 'workflow' : step.run !== undefined ? 'command' : 'step';
  return kind;
};

/**
 * Whether a step is a node that files a card and runs nothing: a `workflow:` node, or a `card: backlog` node, which names no workflow.
 * @param step The step read: its `workflow` and its `card`.
 */
export const isCardNode = (step: Pick<StepSpec, 'workflow' | 'card'>) => step.workflow !== undefined || step.card !== undefined;

/**
 * The one condition among a `when:` node's parents (load holds there is exactly one); undefined on a node with no `when:`.
 * @param step The node read: its `when:` and its parents.
 * @param steps The workflow's steps, among which its parents are.
 */
export const conditionOf = (step: StepSpec, steps: readonly StepSpec[]) =>
  step.when === undefined ? undefined : steps.find((s) => step.after.includes(s.name) && s.routes !== undefined);
