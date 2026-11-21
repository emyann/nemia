/**
 * The routing keys of a step file, read and written: `routes:`, `when:` and `ends:` as lists of route words, `workflow:` as a workflow's
 * name, `card:` and `unlabel:` as what card a node files, and `route:` as a condition's eval (`RouteEval`) from its map — `{ from, table }`, `{ script }` — or `judge`, each refused in the
 * file's words where it cannot be read (`routingOf`), and written back as the parser reads it (`routeWritten`).
 */
import { NODE_CARDS, refuse, type NodeCard, type RouteEval, type StepKey, type StepSpec } from '../step/step.ts';
import type { FrontmatterValue } from '../frontmatter/frontmatter.ts';

/** A route's name, a step's `when:` and a condition's `routes:` and `ends:` alike: a lowercase word. */
const ROUTE_WORD = /^[a-z][a-z0-9-]*$/;

/**
 * The seven keys of routing, each read or refused: absent keys stay absent, so a step without them is the step it was.
 * @param step The step's name, which a refusal names.
 * @param meta The step's frontmatter keys, each as the text its line holds.
 */
export function routingOf(step: string, meta: Partial<Record<StepKey, string>>) {
  const { routes, route, ends } = conditionKeysOf(step, meta);
  const workflow = workflowOf(step, meta.workflow, routes !== undefined);
  const card = cardOf(step, meta.card, workflow);
  const unlabel = unlabelOf(step, meta.unlabel, card);
  return {
    ...(routes !== undefined && { routes }),
    ...(route !== undefined && { route }),
    ...(meta.when !== undefined && { when: wordsOf(step, 'when', meta.when) }),
    ...(ends !== undefined && { ends }),
    ...(workflow !== undefined && { workflow }),
    ...(card !== undefined && { card }),
    ...(unlabel !== undefined && { unlabel }),
  };
}

/** Whether `word` is one of `NODE_CARDS`. */
const isNodeCard = (word: string): word is NodeCard => (NODE_CARDS as readonly string[]).includes(word);

/**
 * `card:`, what card a node files: `backlog` on a node with no `workflow:`, `routed` or `given` on one with it.
 * @param step The step's name, which a refusal names.
 * @param written The text of its `card:` line, or undefined where it has none.
 * @param workflow The node's `workflow:`, read.
 */
function cardOf(step: string, written: string | undefined, workflow: string | undefined) {
  const card = written?.trim();
  if (card === undefined) return undefined;
  if (!isNodeCard(card))
    refuse(`${step}: \`card: ${card}\` is no card a node files. Write one of ${NODE_CARDS.join(', ')}: \`card: given\`.`);
  if (card === 'backlog' && workflow !== undefined)
    refuse(
      `${step}: \`card: backlog\` files the run's card back to the inbox, naming no workflow, and this node names \`workflow: ${workflow}\`. Delete one of the two lines.`,
    );
  if (card !== 'backlog' && workflow === undefined)
    refuse(`${step}: \`card: ${card}\` files a card for a workflow, and this node names none. Add \`workflow: <name>\`.`);
  return card;
}

/**
 * `unlabel:`, the label keys a backlog node files its card back without, on a `card: backlog` node alone.
 * @param step The step's name, which a refusal names.
 * @param written The text of its `unlabel:` line, or undefined where it has none.
 * @param card The node's `card:`, read.
 */
function unlabelOf(step: string, written: string | undefined, card: NodeCard | undefined) {
  if (written === undefined) return undefined;
  if (card !== 'backlog')
    refuse(
      `${step}: \`unlabel:\` names the label keys a backlog node files its card back without, and this step is no \`card: backlog\` node. Add \`card: backlog\`, or delete the line.`,
    );
  const keys = written
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keys.length) refuse(`${step}: \`unlabel:\` lists no label key. Name one, or delete the line.`);
  return keys;
}

/** A condition's own keys: `routes:` (two or more), `route:` beside it and never without it, and `ends:` on a condition alone. */
function conditionKeysOf(step: string, meta: Partial<Record<StepKey, string>>) {
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
    return {} satisfies Pick<StepSpec, 'routes' | 'route' | 'ends'> as Pick<StepSpec, 'routes' | 'route' | 'ends'>;
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
  return { routes, route, ...(ends !== undefined && { ends }) } satisfies Pick<StepSpec, 'routes' | 'route' | 'ends'> as Pick<
    StepSpec,
    'routes' | 'route' | 'ends'
  >;
}

/** `workflow:`, a workflow's name, on a node that is no condition. */
function workflowOf(step: string, written: string | undefined, condition: boolean) {
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
function wordsOf(step: string, key: 'routes' | 'when' | 'ends', value: string | undefined) {
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

/**
 * A condition's eval (`route:`), from its line: `judge`, or the JSON text `readKeys` kept of its map. Any other shape is refused.
 * @param step The condition's name, which a refusal names.
 * @param text The text of the `route:` line.
 */
export function routeOf(step: string, text: string) {
  if (text.trim() === 'judge') return { kind: 'judge' } satisfies RouteEval;
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
    return { kind: 'script', script: script.trim() } satisfies RouteEval;
  }
  if (keys === 'from,table') return tableOf(step, map.from, map.table) satisfies RouteEval;
  return refuse(`${step}: \`route:\` holds \`${keys || 'nothing'}\`, and a condition's eval is ${ROUTE_SHAPES}.`) satisfies RouteEval;
}

/** A table eval, `{ from: <step>.<field>, table: { <value>: <route> } }`, its rows each a word. */
function tableOf(step: string, from: unknown, table: unknown) {
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
  return { kind: 'table', from: from.trim(), table: rows } satisfies RouteEval;
}

/**
 * A condition's eval as its line writes it, the map `routeOf` reads back.
 * @param route The condition's eval.
 */
export const routeWritten = (route: RouteEval) =>
  (route.kind === 'judge'
    ? 'judge'
    : route.kind === 'script'
      ? { script: route.script }
      : { from: route.from, table: { ...route.table } }) satisfies FrontmatterValue as FrontmatterValue;
