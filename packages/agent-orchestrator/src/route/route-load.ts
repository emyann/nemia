/**
 * What load refuses of a workflow's routing (the design's §1): `routeRefusal`, which `validate` calls beside its loops' rules. Pure.
 */
import type { Workflow } from '../step/step.ts';

/**
 * Why a workflow's routing cannot run, or `undefined` where it closes (the design's §1, *What load refuses*): every `when:` waits on
 * exactly one condition and names its routes, and none it ends on (`whenRefusal`); every route is taken by a node or ended on, a table is
 * closed over its producer's enum and the condition's routes, and a condition cuts no workspace, has no check, files no try of its own and
 * spends no budget but a judge's (`conditionRefusal`); a workflow node files a card and nothing else (`workflowNodeRefusal`). The loops'
 * own rule, that no span crosses a condition, is `validate`'s, beside the loops'.
 */
export function routeRefusal(steps: readonly Workflow[]): string | undefined {
  const byName = new Map(steps.map((s) => [s.name, s]));
  for (const s of steps) {
    const refused =
      judgeRefusal(s) ??
      whenRefusal(s, byName) ??
      (s.routes === undefined ? undefined : conditionRefusal(s, steps, byName)) ??
      workflowNodeRefusal(s);
    if (refused !== undefined) return refused;
  }
  return undefined;
}

/**
 * Why a condition may not be a judge yet: a judge's closeout owes no `route` field, its mode is not held read-only, and its brief names no
 * target, so it would run as a session that may write and sign off with no route, its followers waiting for good.
 */
function judgeRefusal(s: Workflow): string | undefined {
  return s.route?.kind === 'judge'
    ? `${s.name}: \`route: judge\` is not built yet: a judge's closeout would owe no route. Give the condition a table (\`route: { from: <step>.<field>, table: { <value>: <route> } }\`) or a script (\`route: { script: <path> }\`).`
    : undefined;
}

/** Why a node's `when:` takes no route: it waits on no condition or on two, names a route its condition lacks, or one it ends on. */
function whenRefusal(s: Workflow, byName: ReadonlyMap<string, Workflow>): string | undefined {
  if (s.when === undefined) return undefined;
  const among = s.after.filter((a) => byName.get(a)?.routes !== undefined);
  const [condition] = among;
  if (among.length !== 1 || condition === undefined) {
    return among.length === 0
      ? `${s.name}: \`when: ${s.when.join(', ')}\` names routes, and ${s.name} waits on no condition. Add the condition whose routes these are to \`after:\`, or delete the line.`
      : `${s.name}: \`when: ${s.when.join(', ')}\`, and ${s.name} waits on two conditions, ${among.join(' and ')}: a node takes the route of one. Wait on the one whose route it takes, and put a node after the other.`;
  }
  const routes = byName.get(condition)?.routes ?? [];
  const off = s.when.find((w) => !routes.includes(w));
  if (off !== undefined) {
    return `${s.name}: \`when: ${off}\` is no route of ${condition}, whose routes are ${routes.join(', ')}. Name one of them, or add \`${off}\` to ${condition}'s \`routes:\`.`;
  }
  const ended = s.when.find((w) => byName.get(condition)?.ends?.includes(w));
  if (ended === undefined) return undefined;
  return `${s.name}: \`when: ${ended}\`, and ${condition} ends the run on ${ended} (\`ends:\`), so nothing after it runs there. Take ${ended} out of ${condition}'s \`ends:\`, or out of this \`when:\`.`;
}

/** Why a condition does not close: an `ends:` off its routes, a route nobody takes, a key it cannot use, or a table not closed. */
function conditionRefusal(c: Workflow, steps: readonly Workflow[], byName: ReadonlyMap<string, Workflow>): string | undefined {
  const routes = c.routes ?? [];
  const notRoute = c.ends?.find((e) => !routes.includes(e));
  if (notRoute !== undefined) {
    return `${c.name}: \`ends: ${notRoute}\` is no route of this condition, whose routes are ${routes.join(', ')}. Name one of them, or add it to \`routes:\`.`;
  }
  const followers = steps.filter((s) => s.after.includes(c.name));
  const untaken = routes.find((r) => !c.ends?.includes(r) && !followers.some((f) => f.when === undefined || f.when.includes(r)));
  if (untaken !== undefined) {
    return `${c.name}: the route \`${untaken}\` is taken by no node, so a run that answers it would stop with nothing to do. Add a node after ${c.name} with \`when: ${untaken}\`, or name it in \`ends: [${untaken}]\` to end the run there.`;
  }
  return conditionKeyRefusal(c) ?? (c.route?.kind === 'table' ? tableRefusal(c, c.route, byName) : undefined);
}

/** Why a workflow node does more than file its card: an agent, a workspace, a check or a gate. */
function workflowNodeRefusal(w: Workflow): string | undefined {
  if (w.workflow === undefined) return undefined;
  const extra = w.agent != null ? 'an agent' : w.workspace ? 'a workspace' : w.check ? 'a check' : w.gate ? 'a gate' : undefined;
  if (extra === undefined) return undefined;
  return `${w.name}: \`workflow: ${w.workflow}\` files a card for ${w.workflow} and does nothing else, and this node has ${extra}. Delete the line that gives it ${extra}; put the work on a step of its own before it.`;
}

/** The keys a condition cannot use, each with why: a budget only a judge may carry, so it is judged apart. */
const CONDITION_REFUSES: ReadonlyArray<readonly [keyof Workflow & ('workspace' | 'check' | 'retries' | 'resume' | 'budget'), string]> = [
  ['workspace', 'it cuts no worktree and commits nothing, working where its first parent worked'],
  ['check', 'it does no work a check could judge: its answer is a route'],
  ['retries', 'it files no try of its own; only a person asks it again, with nemia retry, before any follower is filed'],
  ['resume', 'it continues no session'],
  ['budget', 'only a judge (`route: judge`) has a session to spend on'],
];

/** Why a condition carries a key it cannot use: a workspace, a check, retries, a resume, or a budget on any but a judge. */
function conditionKeyRefusal(c: Workflow): string | undefined {
  const used = CONDITION_REFUSES.find(([key]) => c[key] !== undefined && !(key === 'budget' && c.route?.kind === 'judge'));
  return used && `${c.name}: \`${used[0]}:\` on a condition, and ${used[1]}. Delete the line.`;
}

/**
 * Why a table is not closed: its producer is not one the condition waits on or reads, or its rows and the field's enum and the routes
 * differ.
 */
function tableRefusal(
  c: Workflow,
  table: { from: string; table: Readonly<Record<string, string>> },
  byName: ReadonlyMap<string, Workflow>,
): string | undefined {
  const [producer = '', ...rest] = table.from.split('.');
  const field = rest.join('.');
  const named = `${c.name}: \`route: { from: ${table.from} }\``;
  if (!c.after.includes(producer) && !c.input?.includes(producer)) {
    return `${named} reads ${producer}, which ${c.name} does not wait on. Add ${producer} to \`after:\` and \`input:\`, or read a field of a step it waits on.`;
  }
  const schema = byName.get(producer)?.output?.schema;
  const property = schema?.properties[field];
  if (property === undefined) {
    return `${named} reads \`${field}\`, which ${producer} declares no \`output:\` field of. Declare it in ${producer}'s output schema, with its values as an \`enum\`, or name a field it declares.`;
  }
  const values = Array.isArray(property.enum) ? property.enum.filter((v): v is string => typeof v === 'string') : undefined;
  if (values === undefined || !values.length) {
    return `${named} reads \`${field}\`, whose schema in ${producer}'s output names no \`enum\`, so the table cannot be closed over its values. Give the field \`enum: [...]\`, the values ${producer} may say.`;
  }
  const outside = Object.keys(table.table).find((k) => !values.includes(k));
  if (outside !== undefined) {
    return `${c.name}: \`table: { ${outside}: … }\` is no value of ${table.from}, whose values are ${values.join(', ')}. Delete the row, or add \`${outside}\` to the field's \`enum\`.`;
  }
  const rowless = values.find((v) => !Object.hasOwn(table.table, v));
  if (rowless !== undefined) {
    return `${c.name}: ${table.from} may say \`${rowless}\`, and the table has no row for it. Add \`${rowless}: <route>\` to \`table:\`.`;
  }
  const offList = Object.entries(table.table).find(([, r]) => !c.routes?.includes(r));
  if (offList !== undefined) {
    return `${c.name}: \`table: { ${offList[0]}: ${offList[1]} }\` routes to \`${offList[1]}\`, which is not in \`routes:\` (${c.routes?.join(', ')}). Name one of them, or add it to \`routes:\`.`;
  }
  return undefined;
}
