/**
 * The api tests' reads of a run: the run object (`GET /api/runs/:id`, `RunAnswer`), a step of it by name, and the object's sub-resources —
 * a step's tries, one try, a try's closeout and what the step was told — each on its route and named by the package's type of its answer.
 * A read that does not answer 200 throws, naming the route and what it answered, so a test reads the field it means and nothing else.
 *
 * `pageRead` is the board's page (`?view=page`), read for what the object leaves out on purpose — the lines a person types (`decide`,
 * `refresh`, a step's `commands`), `fromNote` and `workflowPage` — until the board reads the object and those find their home.
 */
import type { RunObject } from 'agent-orchestrator';
import type { RunAnswer, RunPage } from '../src/runs/runs.ts';

/** What a test reads through: the app, or anything that answers a request as it does. */
export type Asked = { request: (url: string) => Response | Promise<Response> };

/** A step of the run object, as `status.steps` holds it. */
export type ObjectStep = RunAnswer['status']['steps'][number];

/** The body `url` answers, which must be a 200. */
async function ok(app: Asked, url: string): Promise<unknown> {
  const res = await app.request(url);
  if (res.status !== 200) throw new Error(`GET ${url} answered ${res.status}: ${await res.text()}`);
  return res.json();
}

const at = (id: string, step: string) => `/api/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(step)}`;

/** The run object of the run `id`. */
export const objectOf = async (app: Asked, id: string): Promise<RunAnswer> =>
  (await ok(app, `/api/runs/${encodeURIComponent(id)}`)) as RunAnswer;

/** The step `name` of the run object, thrown for where the object has none. */
export function stepOf(run: RunAnswer, name: string): ObjectStep {
  const step = run.status.steps.find((s) => s.name === name);
  if (!step) throw new Error(`run ${run.metadata.name} has no step '${name}': it has ${run.status.steps.map((s) => s.name).join(', ')}`);
  return step;
}

/** The frozen spec of the step `name` (`spec.steps`), or undefined where the run froze none of it. */
export const specOf = (run: RunAnswer, name: string): RunAnswer['spec']['steps'][number] | undefined =>
  run.spec.steps.find((s) => s.name === name);

/** The step's tries, earliest first, the current one last (`…/steps/:step/tries`). */
export const triesOf = async (app: Asked, id: string, step: string): Promise<RunObject.StepTry[]> => [
  ...((await ok(app, `${at(id, step)}/tries`)) as RunObject.StepTries).tries,
];

/** One try of the step (`…/tries/:try`). */
export const tryOf = async (app: Asked, id: string, step: string, n: number): Promise<RunObject.StepTry> =>
  (await ok(app, `${at(id, step)}/tries/${n}`)) as RunObject.StepTry;

/**
 * What the step's try `n` signed off with, or why it does not read (`…/tries/:try/closeout`); with no `n`, its current try's, as the page's
 * step carried it — null where the step has no try yet.
 */
export async function closeoutOf(app: Asked, id: string, step: string, n?: number): Promise<RunObject.TryCloseout | null> {
  const which = n ?? (await triesOf(app, id, step)).find((t) => t.current)?.try;
  if (which === undefined) return null;
  return (await ok(app, `${at(id, step)}/tries/${which}/closeout`)) as RunObject.TryCloseout;
}

/** What the step was told: its body, the told text, its layers and its task's parts (`…/steps/:step/told`). */
export const toldOf = async (app: Asked, id: string, step: string): Promise<RunObject.StepTold> =>
  (await ok(app, `${at(id, step)}/told`)) as RunObject.StepTold;

/** The board's page of the run (`?view=page`): read only for what the object leaves out on purpose (this file's head). */
export const pageRead = async (app: Asked, id: string): Promise<RunPage> =>
  (await ok(app, `/api/runs/${encodeURIComponent(id)}?view=page`)) as RunPage;
