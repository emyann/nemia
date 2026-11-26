/**
 * The api tests' reads of a run: the run object (`GET /api/runs/:id`, `RunAnswer`), a step of it by name, and the object's sub-resources —
 * a step's tries, one try, a try's closeout and what the step was told — each on its route and named by the package's type of its answer.
 * A read that does not answer 200 throws, naming the route and what it answered, so a test reads the field it means and nothing else.
 *
 * `linesOf` is the lines read beside the object (`…/lines`, `RunLinesAnswer`), for what the object leaves out on purpose — the lines a
 * person types (`decide`, `refresh`, each step's `approve`, `retry` and `say`), `fromNote` and `workflowPage`.
 *
 * `runListOf` is the RunList (`GET /api/runs`), plain and its first page (`LIST_PAGE`) unless a query says otherwise: its items are
 * `Run` objects, a run read by `metadata.name`, `spec.*` and `status.*`, and beside them the runs it leaves unjudged (`unjudged`, each
 * with why). `listedRuns` is every run of the plain list, on a page of the most a list answers where the query asks no `limit`,
 * `listedOf` one run of it, `unjudgedOf` why the list leaves one unjudged, and `framedOf` one run as a list asked by state has it,
 * with the board's frame parts (`status.state`, `wallMs`, `clock`, …).
 */
import type { RunObject } from 'agent-orchestrator';
import { LIST_PAGE, type Run, type RunList } from 'objects';
import type { Run as RunAnswer, RunLines as RunLinesAnswer } from 'objects';

/** What a test reads through: the app, or anything that answers a request as it does. */
export type Asked = { request: (url: string) => Response | Promise<Response> };

/** A step of the run object, as `status.steps` holds it. */
type ObjectStep = RunAnswer['status']['steps'][number];

/** The body `url` answers, which must be a 200. */
async function ok(app: Asked, url: string) {
  const res = await app.request(url);
  if (res.status !== 200) throw new Error(`GET ${url} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

const at = (id: string, step: string) => `/api/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(step)}`;

/** The run object of the run `id`. */
export const objectOf = async (app: Asked, id: string) => (await ok(app, `/api/runs/${encodeURIComponent(id)}`)) as RunAnswer;

/** The step `name` of the run object, thrown for where the object has none. */
export function stepOf(run: RunAnswer, name: string) {
  const step = run.status.steps.find((s) => s.name === name);
  if (!step) throw new Error(`run ${run.metadata.name} has no step '${name}': it has ${run.status.steps.map((s) => s.name).join(', ')}`);
  return step satisfies ObjectStep;
}

/** The frozen spec of the step `name` (`spec.steps`), or undefined where the run froze none of it. */
export const specOf = (run: RunAnswer, name: string) =>
  run.spec.steps.find((s) => s.name === name) satisfies RunAnswer['spec']['steps'][number] | undefined;

/** The step's tries, earliest first, the current one last (`…/steps/:step/tries`). */
export const triesOf = async (app: Asked, id: string, step: string) =>
  [...((await ok(app, `${at(id, step)}/tries`)) as RunObject.StepTries).tries] satisfies RunObject.StepTry[];

/**
 * What the step's try `n` signed off with, or why it does not read (`…/tries/:try/closeout`); with no `n`, its current try's, as the
 * board's step shows it — null where the step has no try yet.
 */
export async function closeoutOf(app: Asked, id: string, step: string, n?: number) {
  const which = n ?? (await triesOf(app, id, step)).find((t) => t.current)?.try;
  if (which === undefined) return null satisfies RunObject.TryCloseout | null;
  return (await ok(app, `${at(id, step)}/tries/${which}/closeout`)) as RunObject.TryCloseout satisfies RunObject.TryCloseout | null;
}

/** What the step was told: its body, the told text, its layers and its task's parts (`…/steps/:step/told`). */
export const toldOf = async (app: Asked, id: string, step: string) => (await ok(app, `${at(id, step)}/told`)) as RunObject.StepTold;

/** The lines read beside the run object (`…/lines`): what the object leaves out on purpose (this file's head). */
export const linesOf = async (app: Asked, id: string) => (await ok(app, `/api/runs/${encodeURIComponent(id)}/lines`)) as RunLinesAnswer;

/**
 * The RunList `GET /api/runs` answers with `query` (`labelSelector=`, `fieldSelector=`, … without its `?`): its first
 * page, `LIST_PAGE.byDefault` runs, where it says no limit.
 */
export const runListOf = async (app: Asked, query = '') =>
  (await ok(app, `/api/runs${query === '' ? '' : `?${query.replace(/^\?/, '')}`}`)) as RunList;

/** `query` asking a page of the most a list answers (`LIST_PAGE.most`) where it asks no `limit` of its own: every run of a test's store. */
const everyRun = (query: string) =>
  /(^|[?&])limit=/.test(query) ? query : [query.replace(/^\?/, ''), `limit=${LIST_PAGE.most}`].filter(Boolean).join('&');

/** Every run the plain RunList judges (`items`), in its order, on a page of the most a list answers: none of those it leaves unjudged. */
export const listedRuns = async (app: Asked, query = '') => [...(await runListOf(app, everyRun(query))).items] satisfies Run[];

/** Why the plain RunList leaves the run `name` unjudged (its `unjudged` entry's `error`); null where it has no such entry. */
export const unjudgedOf = async (app: Asked, name: string) =>
  ((await runListOf(app, everyRun(''))).unjudged?.find((entry) => entry.name === name)?.error ?? null) satisfies string | null;

/** The run `name` as the plain RunList judges it, thrown where the list does not hold it judged. */
export async function listedOf(app: Asked, name: string) {
  const list = await runListOf(app, everyRun(''));
  const run = list.items.find((item) => item.metadata.name === name);
  if (run) return run;
  const unjudged = list.unjudged?.find((entry) => entry.name === name);
  throw new Error(`the RunList has no judged run '${name}'${unjudged ? `: it is unjudged, ${unjudged.error}` : ''}`);
}

/**
 * The run `name` as a list asked by state has it (`fieldSelector=status.state!=finished`, then `=finished`), with the board's frame parts
 * on its status, thrown where neither holds it judged.
 */
export async function framedOf(app: Asked, name: string) {
  for (const selector of ['status.state!%3Dfinished', 'status.state%3Dfinished']) {
    const run = (await runListOf(app, `fieldSelector=${selector}`)).items.find((item) => item.metadata.name === name);
    if (run) return run;
  }
  throw new Error(`no list asked by state holds the run '${name}' judged`);
}
