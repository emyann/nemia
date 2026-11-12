/**
 * The routing keys of a step file, read and written: `routes:`, `when:` and `ends:` as lists of route words, `workflow:` as a workflow's
 * name, and `route:` as a condition's eval (`RouteEval`) from its map — `{ from, table }`, `{ script }` — or `judge`, each refused in the
 * file's words where it cannot be read (`routingOf`), and written back as the parser reads it (`routeWritten`).
 */
import { refuse, type RouteEval, type StepKey, type StepSpec } from '../step/step.ts';
import type { FrontmatterValue } from '../frontmatter/frontmatter.ts';

/** A route's name, a step's `when:` and a condition's `routes:` and `ends:` alike: a lowercase word. */
const ROUTE_WORD = /^[a-z][a-z0-9-]*$/;

/** The five keys of routing, each read or refused: absent keys stay absent, so a step without them is the step it was. */
export function routingOf(
  step: string,
  meta: Partial<Record<StepKey, string>>,
): Pick<StepSpec, 'routes' | 'route' | 'when' | 'ends' | 'workflow'> {
  const { routes, route, ends } = conditionKeysOf(step, meta);
  const workflow = workflowOf(step, meta.workflow, routes !== undefined);
  return {
    ...(routes !== undefined && { routes }),
    ...(route !== undefined && { route }),
    ...(meta.when !== undefined && { when: wordsOf(step, 'when', meta.when) }),
    ...(ends !== undefined && { ends }),
    ...(workflow !== undefined && { workflow }),
  };
}

/** A condition's own keys: `routes:` (two or more), `route:` beside it and never without it, and `ends:` on a condition alone. */
function conditionKeysOf(step: string, meta: Partial<Record<StepKey, string>>): Pick<StepSpec, 'routes' | 'route' | 'ends'> {
  const routes = wordsOf(step, 'routes', meta.routes);
  const route = meta.route === undefined ? undefined : routeOf(step, meta.route);
  const ends = wordsOf(step, 'ends', meta.ends);
  if (routes === undefined) {
    if (route !== undefined)
      refuse(
        `${step}: \`route:\` says how a condition answers, and this step declares no \`routes:\`. Add \`routes: [<a>, <b>]\`, the routes it may answer, or delete the line.`,
      );
    if (ends !== undefined)
      refuse(
        `${step}: \`ends: ${meta.ends}\` names routes on which the run ends, and this step is no condition. Move the line to the condition, beside its \`routes:\`, or delete it.`,
      );
    return {};
  }
  if (routes.length < 2) {
    refuse(
      `${step}: \`routes: ${meta.routes}\` names ${routes.length} route, and a condition chooses between two or more. Add the other route — \`routes: [${routes[0] ?? 'a'}, <another>]\` — or delete the line to make the step a plain step.`,
    );
  }
  if (route === undefined) {
    refuse(
      `${step}: \`routes:\` makes this step a condition, and it says no \`route:\` — how its route is answered. Add \`route: { from: <step>.<field>, table: { <value>: <route> } }\`, \`route: { script: <path> }\` or \`route: judge\`.`,
    );
  }
  return { routes, route, ...(ends !== undefined && { ends }) };
}

/** `workflow:`, a workflow's name, on a node that is no condition. */
function workflowOf(step: string, written: string | undefined, condition: boolean): string | undefined {
  const workflow = written?.trim();
  if (workflow === undefined) return undefined;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(workflow)) {
    refuse(
      `${step}: \`workflow: ${workflow}\` names no workflow: a workflow's name is a lowercase word, its folder's — \`workflow: build\`.`,
    );
  }
  if (condition) {
    refuse(
      `${step}: \`workflow:\` and \`routes:\` are both set, and a node is a condition or a route to a workflow. Keep one, and put the other on a node of its own.`,
    );
  }
  return workflow;
}

/** A list of route words, or refused naming the item that is none: duplicates are refused, a list saying one route twice says less. */
function wordsOf(step: string, key: 'routes' | 'when' | 'ends', value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const words = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = words.find((w) => !ROUTE_WORD.test(w));
  if (bad !== undefined) {
    refuse(`${step}: \`${key}:\` lists \`${bad}\`, and a route is a lowercase word — \`web\`, \`build-backend\`. Rename it.`);
  }
  const twice = words.find((w, i) => words.indexOf(w) !== i);
  if (twice !== undefined) refuse(`${step}: \`${key}:\` lists \`${twice}\` twice. Delete one.`);
  if (!words.length) refuse(`${step}: \`${key}:\` lists no route. Name one, or delete the line.`);
  return words;
}

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const ROUTE_SHAPES = '`route: { from: <step>.<field>, table: { <value>: <route> } }`, `route: { script: <path> }` or `route: judge`';

/** A condition's eval (`route:`), from its line: `judge`, or the JSON text `readKeys` kept of its map. Any other shape is refused. */
export function routeOf(step: string, text: string): RouteEval {
  if (text.trim() === 'judge') return { kind: 'judge' };
  let map: unknown;
  try {
    map = text.trim().startsWith('{') ? JSON.parse(text) : undefined;
  } catch {
    map = undefined;
  }
  if (!isMap(map)) refuse(`${step}: \`route: ${text}\` is no eval a condition takes. Write ${ROUTE_SHAPES}.`);
  const keys = Object.keys(map).sort().join(',');
  if (keys === 'script') {
    const script = map.script;
    if (typeof script !== 'string' || !script.trim())
      refuse(
        `${step}: \`route: { script: … }\` names no file. Name the script, from the workflow's folder: \`route: { script: routes/pick.ts }\`.`,
      );
    return { kind: 'script', script: script.trim() };
  }
  if (keys === 'from,table') return tableOf(step, map.from, map.table);
  return refuse(`${step}: \`route:\` holds \`${keys || 'nothing'}\`, and a condition's eval is ${ROUTE_SHAPES}.`);
}

/** A table eval, `{ from: <step>.<field>, table: { <value>: <route> } }`, its rows each a word. */
function tableOf(step: string, from: unknown, table: unknown): RouteEval {
  if (typeof from !== 'string' || !/^[^.\s]+\.[^.\s]+$/.test(from.trim())) {
    refuse(
      `${step}: \`route: { from: ${JSON.stringify(from)} }\` names no field: write the producer's step and its output field, \`from: plan.surface\`.`,
    );
  }
  if (!isMap(table) || !Object.keys(table).length) {
    refuse(`${step}: \`route: { table: … }\` is a map from the field's values to routes: \`table: { web: web, docs: docs }\`.`);
  }
  const rows: Record<string, string> = {};
  for (const [value, routed] of Object.entries(table)) {
    if (typeof routed !== 'string')
      refuse(`${step}: \`route: { table: { ${value}: … } }\` routes to no word. Name one of the condition's \`routes:\`.`);
    rows[value] = routed.trim();
  }
  return { kind: 'table', from: from.trim(), table: rows };
}

/** A condition's eval as its line writes it, the map `routeOf` reads back. */
export const routeWritten = (route: RouteEval): FrontmatterValue =>
  route.kind === 'judge' ? 'judge' : route.kind === 'script' ? { script: route.script } : { from: route.from, table: { ...route.table } };
