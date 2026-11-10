/**
 * The store as every run route reads it: the engine an app reads through, as a service (`Engine`), and the store's root, which is the
 * package's own service, re-exported here so a route has one import site for both (`StoreRoot`, given at `app.ts` from `WF_ROOT`); every
 * task's view, a run found by its id, and the task a step's routes read. What the board's reading of a run stands on — the views of its
 * tasks, its workflow and steps, the feed's filing times, the run judged as its object — is the package's (`viewsFor`, `workflowsOf`,
 * `filedTimes`, `runObject`).
 */
import { Context, Effect, Layer, Tracer } from 'effect';
import {
  asked,
  engine,
  engineOf,
  runsAtOnce,
  runWith,
  PlaceService,
  type EngineService,
  stepNames,
  type Unreadable,
  type Views,
  workflowsOf,
} from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';

/**
 * The engine the api reads through — `list`, `view` and `logs` — one for an app, built with its runtime (`live`: the package's
 * `engine(env)`). The api's process, started without `--no-tick`, is the store's daemon, and ticks on this engine (main.ts), so a board
 * served by it keeps the store ticking; its routes still file and advance nothing but through `nemia`'s own verbs, and an api under
 * `--no-tick` ticks nothing. The one write through it from a route is a try's removal (`DELETE /api/namespaces/:namespace/runs/:runId`),
 * `nemia rm`'s own code, which closes a task that waits for a word nobody will give once the record is gone.
 */
export class Engine extends Context.Service<Engine, ReturnType<typeof engine>>()('api/Engine') {
  /** The package's engine over the store and the settings `env` names (`engine(env)`). */
  static readonly live = (env: Parameters<typeof engine>[0]): Layer.Layer<Engine> => Layer.sync(Engine)(() => engine(env));

  /**
   * The api's engine over the runtime's layer `runtime`, wrapped as `live` wraps its own (`engineOf`, which files every task queued):
   * how a test gives the app the runtime's stand-in, `Engine.over(engine().layer)` of `testEngine`.
   */
  static over(runtime: Parameters<typeof engineOf>[0]): Layer.Layer<Engine> {
    return Layer.sync(Engine)(() => engineOf(runtime));
  }
}

/**
 * The store's root, as the api's own reads and writes take it — your workflows, agents and skills, and a try's folder, looked for and
 * written under it — and as the package takes it too: one service (`orchestrator/StoreRoot`), given by the app's layer from `WF_ROOT`
 * (`storeConfigLayer`, `app.ts`, which gives the store's settings too, `StoreConfig`), with no default, so an app given none does not
 * compile. A test that gives another root moves where the api looks for yours.
 *
 * What the package still reads off a root of its own, as its modules load — the runs (`runsAtOnce`, `findRun`), the inbox and the queue,
 * the daemon's file — is named in `packages/agent-orchestrator/test/global-roots.baseline.ts`, and is owed its own threading; a test that
 * means to move those sets `WF_ROOT` before it imports the package, as `test/harness.ts` does.
 */
export { StoreConfig, StoreRoot } from 'agent-orchestrator';
import { StoreConfig, StoreRoot } from 'agent-orchestrator';

type Reader = Engine['Service'];

/**
 * One verb of the engine, `read`, run to a Promise: what it succeeds with; its refusal as an `Error` whose `exitCode` is 2 and whose
 * message is led by `verb` (`output: …`), as a caller of the command line reads it (`asked`); and any other failure — a `JournalError`, a
 * `RunnerError` — as it failed, so `unreadableJournal` still recognises one task's journal. Takes no service: it is the Effect a verb of
 * the request's engine already is.
 */
export const engineRead = <A, F>(verb: string, read: Effect.Effect<A, F>): Promise<A> => Effect.runPromise(asked(verb, read));

/**
 * The engine's view of every task in its store, over one observation, by task id.
 *
 * `list` observes the harnesses once and folds every task's journal against that; `view` observes
 * afresh on each call. A task the engine has no record of is simply absent, which reads exactly as
 * `view`'s empty state does: no brief, so `unknown`. One whose journal does not read is in `unreadable` instead, and in no view
 * (`judgedUnlessUnreadable`).
 */
export async function everyView(e: Reader): Promise<{ views: Views; unreadable: Unreadable }> {
  const listed = await engineRead('list', e.list());
  return {
    views: new Map(listed.views.map((view) => [view.id, view])),
    unreadable: new Map(listed.unreadable.map(({ taskId, why }) => [taskId, why])),
  };
}

/** Found among the ids the store lists (`runs.find`), not read by path, so no id can name a file outside it. */
export const findRun = (id: string): Run | undefined => runsAtOnce.runs.find(id);

export const noSuchRun = (id: string) =>
  `No run '${id}' in this store. GET /api/runs (or \`nemia ls\`) lists the runs it has; check WF_ROOT if you expected it here.`;

/**
 * The run and the task a step's routes read — null for a step not filed yet — or why there is no such step to read: no run by
 * that id, or no step by that name on the run's page, which shows those on the record and any the folder has gained (`stepNames`).
 */
export function taskOfStep(id: string, step: string, home: string): { run: Run; taskId: string | null } | { error: string } {
  const run = findRun(id);
  if (!run) return { error: noSuchRun(id) };
  if (!stepNames(run, workflowsOf(run, home).steps).includes(step)) {
    return { error: `Run '${id}' has no step '${step}'. GET /api/runs/${id} lists the steps it has.` };
  }
  return { run, taskId: run.steps[step]?.taskId ?? null };
}

/**
 * A package program run for a request: over the engine `e` (`runWith`), the place the app's layer gave, the store's root and its
 * settings (`at`), its
 * spans children of the request's own on the app's tracer where `at.trace` names them (`RequestTrace`). Rejects with what the program
 * failed with or died of, as `runWith` does.
 */
export const runPlaced = <A, E>(
  at: Placed,
  e: Engine['Service'],
  program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot | StoreConfig>,
): Promise<A> =>
  runWith(
    e,
    tracedIn(
      at.trace,
      program.pipe(
        Effect.provideService(PlaceService, at.placeService),
        Effect.provideService(StoreRoot, at.home),
        Effect.provideService(StoreConfig, at.config),
      ),
    ),
  );

/**
 * The trace a request's programs join: the tracer of the app's runtime, and the request's server span (`saidRequest`,
 * request/request.ts). A program `runWith` runs starts a fiber of its own, outside the app's runtime, so without it its spans would go to
 * Effect's default tracer, each a root of its own, and never reach the collector.
 */
export type RequestTrace = { readonly tracer: Tracer.Tracer; readonly span: Tracer.AnySpan };

/** `program` traced on the request's tracer under its span, or as it was where there is none. */
const tracedIn = <A, E, R>(trace: RequestTrace | undefined, program: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  trace === undefined ? program : program.pipe(Effect.withParentSpan(trace.span), Effect.withTracer(trace.tracer));

/**
 * Where a request's package program runs: the place the app's layer gave, the store's root, and the trace its spans join
 * (`Served.placeService`, `Served.home`, `Served.trace`). `trace` is required, so that a site that has a request's names it, and one that
 * has none says so with `undefined`.
 */
export type Placed = {
  readonly placeService: PlaceService['Service'];
  readonly home: string;
  readonly config: StoreConfig['Service'];
  readonly trace: RequestTrace | undefined;
};

/** The place a helper's package programs run on and the trace they join, without the root it takes apart: a request's `Served` is one. */
export type RunsOn = Pick<Placed, 'placeService' | 'config' | 'trace'>;
