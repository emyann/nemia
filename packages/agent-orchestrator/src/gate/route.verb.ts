/**
 * `nemia route <run> <condition> <route>`, an entry of the command table: a person's route for a condition's try, written to the run's asks
 * folder (`routeAsk`), which wins over the condition's own answer on the next pass (`answeredRoute`). A controller, served on both sides:
 * the api's Run `route` (`POST /api/namespaces/:namespace/runs/:name/steps/:step/route`) calls it with its typed input (`RouteInput`).
 */
import { ROUTE_WORDS } from 'objects';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import type { Served } from '../command/entry.verb.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { WorkflowError, type StepSpec } from '../step/step.ts';
import { tryOf, type Run } from '../record/record.ts';
import { RunId } from '../record/record.model.ts';
import { asksDir } from '../record/record.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { routeAsk } from '../route/index.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';
import { StoreRoot } from '../config/root.store.ts';

/** The follower of a condition already filed or sent its card, which settles its route; undefined while none is. */
export const settledBy = (condition: string, run: Run, steps: readonly StepSpec[]): string | undefined =>
  steps.find((s) => s.after.includes(condition) && Boolean(run.steps[s.name]?.taskId || run.steps[s.name]?.sent))?.name;

/**
 * Why `route` cannot be given to `step` of `run`, in words that name the fix — or undefined, when it may: a step that is no condition, a
 * route not in its `routes:`, and a condition one of whose followers is filed or sent, whose route is taken. Pure.
 */
export function routeRefused(
  run: Run,
  steps: readonly StepSpec[],
  step: string,
  route: string,
): WorkflowError | Conflict | Missing | undefined {
  const condition = steps.find((s) => s.name === step);
  const line = `nemia route ${run.id} <condition> <route>`;
  if (!condition) return new Missing({ message: `${run.id} has no step ${step}. Name one of its conditions: ${line}.` });
  const routes = condition.routes;
  if (routes === undefined) {
    const conditions = steps.filter((s) => s.routes !== undefined).map((s) => s.name);
    return new WorkflowError(
      `${step} is no condition (it has no routes:), so it takes no route. ${conditions.length ? `Route one of ${conditions.join(', ')}: ${line}.` : `${run.id}'s workflow has no condition; approve or retry the step instead.`}`,
    );
  }
  if (!routes.includes(route))
    return new WorkflowError(
      `${step} has no route ${route}: its routes are ${routes.join(', ')}. Give one: nemia route ${run.id} ${step} <${routes.join('|')}>.`,
    );
  const settled = settledBy(step, run, steps);
  if (settled)
    return new Conflict({
      message: `${step}'s route is taken: ${settled}, after it, is already ${run.steps[settled]?.sent ? `sent (${run.steps[settled]?.sent?.card})` : 'filed'}. To route it again, cancel the run — nemia cancel ${run.id} — and start it again.`,
    });
  return undefined;
}

/** What `nemia route` takes: the run's id, the condition by its step's name, and the route, which the api reads off its path and body. */
export const RouteInput = Schema.Struct({ runId: Schema.String, step: Schema.String, route: Schema.String });
export type RouteInput = typeof RouteInput.Type;

/** `nemia route`: the route written for the try the condition is on, and the file it is in. */
export const ROUTE: Served<{ step: string; try: number; route: string; at: string; file: string }, RouteInput> = {
  ...ROUTE_WORDS,
  input: RouteInput,
  handler: Effect.fnUntraced(function* ({ runId: id, step, route }: RouteInput) {
    const home = yield* StoreRoot;
    const door = (yield* RunDoor).runs;
    if (!(yield* door.exists(RunId.read(id))))
      return yield* Effect.fail(new Missing({ message: `no such run: ${id}. nemia route takes a run by its id, as nemia ls lists it.` }));
    const run = yield* door.read(RunId.read(id));
    const refused = routeRefused(run, yield* stepsOf(run), step, route);
    if (refused) return yield* Effect.fail(refused);
    const n = tryOf(run, step);
    const at = new Date().toISOString();
    const file = path.join(asksDir(home, id), routeAsk(step, n));
    fs.mkdirSync(asksDir(home, id), { recursive: true });
    writeWhole(file, `${JSON.stringify({ route, at })}\n`);
    return { step, try: n, route, at, file };
  }),
};
