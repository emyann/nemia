/**
 * The api tests' reads of a run: the run object (`GET /api/runs/:id`, `RunAnswer`), a step of it by name, and the object's sub-resources —
 * a step's tries, one try, a try's closeout and what the step was told — each on its route and named by the package's type of its answer.
 * A read that does not answer 200 throws, naming the route and what it answered, so a test reads the field it means and nothing else.
 *
 * `linesOf` is the lines read beside the object (`…/lines`, `RunLinesAnswer`), for what the object leaves out on purpose — the lines a
 * person types (`decide`, `refresh`, each step's `approve`, `retry` and `say`), `fromNote` and `workflowPage`.
 *
 * `runListOf` is the RunList (`GET /api/runs`), plain and whole unless a query says otherwise: its items are `Run` objects, a run
 * read by `metadata.name`, `spec.*` and `status.*`, and beside them the runs it leaves unjudged (`unjudged`, each with why). `listedOf`
 * is one run of the plain list, `unjudgedOf` why the list leaves one unjudged, and `framedOf` one run as a list asked by state has it,
 * with the board's frame parts (`status.state`, `wallMs`, `clock`, …). `lsOf` is one run as `nemia ls` lists it (`GET
 * /api/listing/:runId`), its record and its steps' words whether judged or not: what the RunList leaves out of a run it cannot judge.
 */
import type { RunObject, RunsListed } from 'agent-orchestrator';
import type { Run, RunList } from 'objects';
import type { RunAnswer, RunLinesAnswer } from '../src/runs/runs.ts';

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
 * What the step's try `n` signed off with, or why it does not read (`…/tries/:try/closeout`); with no `n`, its current try's, as the
 * board's step shows it — null where the step has no try yet.
 */
export async function closeoutOf(app: Asked, id: string, step: string, n?: number): Promise<RunObject.TryCloseout | null> {
  const which = n ?? (await triesOf(app, id, step)).find((t) => t.current)?.try;
  if (which === undefined) return null;
  return (await ok(app, `${at(id, step)}/tries/${which}/closeout`)) as RunObject.TryCloseout;
}

/** What the step was told: its body, the told text, its layers and its task's parts (`…/steps/:step/told`). */
export const toldOf = async (app: Asked, id: string, step: string): Promise<RunObject.StepTold> =>
  (await ok(app, `${at(id, step)}/told`)) as RunObject.StepTold;

/** The lines read beside the run object (`…/lines`): what the object leaves out on purpose (this file's head). */
export const linesOf = async (app: Asked, id: string): Promise<RunLinesAnswer> =>
  (await ok(app, `/api/runs/${encodeURIComponent(id)}/lines`)) as RunLinesAnswer;

/**
 * The RunList `GET /api/runs` answers with `query` (`labelSelector=`, `fieldSelector=`, … without its `?`): every run where it says no
 * limit.
 */
export const runListOf = async (app: Asked, query = ''): Promise<RunList> =>
  (await ok(app, `/api/runs${query === '' ? '' : `?${query.replace(/^\?/, '')}`}`)) as RunList;

/** Every run the plain RunList judges (`items`), in its order: none of those it leaves unjudged. */
export const listedRuns = async (app: Asked, query = ''): Promise<Run[]> => [...(await runListOf(app, query)).items];

/** Why the plain RunList leaves the run `name` unjudged (its `unjudged` entry's `error`); null where it has no such entry. */
export const unjudgedOf = async (app: Asked, name: string): Promise<string | null> =>
  (await runListOf(app)).unjudged?.find((entry) => entry.name === name)?.error ?? null;

/** The run `name` as the plain RunList judges it, thrown where the list does not hold it judged. */
export async function listedOf(app: Asked, name: string): Promise<Run> {
  const list = await runListOf(app);
  const run = list.items.find((item) => item.metadata.name === name);
  if (run) return run;
  const unjudged = list.unjudged?.find((entry) => entry.name === name);
  throw new Error(`the RunList has no judged run '${name}'${unjudged ? `: it is unjudged, ${unjudged.error}` : ''}`);
}

/**
 * The run `name` as a list asked by state has it (`fieldSelector=status.state!=finished`, then `=finished`), with the board's frame parts
 * on its status, thrown where neither holds it judged.
 */
export async function framedOf(app: Asked, name: string): Promise<Run> {
  for (const selector of ['status.state!%3Dfinished', 'status.state%3Dfinished']) {
    const run = (await runListOf(app, `fieldSelector=${selector}`)).items.find((item) => item.metadata.name === name);
    if (run) return run;
  }
  throw new Error(`no list asked by state holds the run '${name}' judged`);
}

/**
 * The run `id` as `nemia ls` lists it (`GET /api/listing/:runId`): its record, and its judgement or why it is left unjudged. `ls` reads the
 * daemon's two ceilings, which the harness sets to a word it refuses: the read is made with neither set (no cap), each put back after.
 */
export async function lsOf(app: Asked, id: string): Promise<RunsListed['runs'][number]> {
  const ceilings = { WF_MAX_RUNS: process.env.WF_MAX_RUNS, WF_MAX_CONCURRENT: process.env.WF_MAX_CONCURRENT };
  delete process.env.WF_MAX_RUNS;
  delete process.env.WF_MAX_CONCURRENT;
  try {
    const [run] = ((await ok(app, `/api/listing/${encodeURIComponent(id)}`)) as RunsListed).runs;
    if (!run) throw new Error(`GET /api/listing/${id} lists no run`);
    return run;
  } finally {
    for (const [key, value] of Object.entries(ceilings)) if (value !== undefined) process.env[key] = value;
  }
}
