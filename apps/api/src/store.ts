/**
 * The store as every run route reads it: the engine an app reads through, as a service (`Engine`), and the store's root, which is the
 * package's own service, re-exported here so a route has one import site for both (`StoreRoot`, given at `app.ts` from `WF_ROOT`); every
 * task's view, a run found by its id, one run judged (`judgedOn`), and the task a step's routes read. What the board's reading of a run
 * stands on — the views of its tasks, its workflow and steps, the feed's filing times — is the package's (`viewsFor`, `workflowsOf`,
 * `filedTimes`).
 */
import { Context, Effect, Layer } from 'effect';
import {
  asked,
  engine,
  engineOf,
  judge,
  judgedUnlessUnreadable,
  runStore,
  runWith,
  PlaceService,
  type EngineService,
  standingReader,
  standingSnapshot,
  standingsOf,
  stepNames,
  type Unreadable,
  viewsFor,
  type Views,
  workflowsOf,
} from 'agent-orchestrator';
import type { Workflow } from 'agent-orchestrator/workflow';
import { isRepositoryRun, type Run } from 'agent-orchestrator/run';

/**
 * The engine the api reads through — `list`, `view` and `logs` — one for an app, built with its runtime (`live`: the package's
 * `engine()`). The api's process, started without `--no-tick`, is the store's daemon, and ticks on this engine (main.ts), so a board
 * served by it keeps the store ticking; its routes still file and advance nothing but through `nemia`'s own verbs, and an api under
 * `--no-tick` ticks nothing. The one write through it from a route is a try's removal (`DELETE /api/runs/:id`), `nemia rm`'s own code,
 * which closes a task that waits for a word nobody will give once the record is gone.
 */
export class Engine extends Context.Service<Engine, ReturnType<typeof engine>>()('api/Engine') {
  static readonly live: Layer.Layer<Engine> = Layer.sync(Engine)(engine);

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
 * (`storeRootLayer`, `app.ts`), with no default, so an app given none does not compile. A test that gives another root moves where the
 * api looks for yours.
 *
 * What the package still reads off a root of its own, as its modules load — the runs (`runStore`, `findRun`), the inbox and the queue,
 * the daemon's file — is named in `packages/agent-orchestrator/test/global-roots.baseline.ts`, and is owed its own threading; a test that
 * means to move those sets `WF_ROOT` before it imports the package, as `test/harness.ts` does.
 */
export { StoreRoot } from 'agent-orchestrator';

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

/**
 * The folder a step of a folder run works in, off the run's record (`folderPlace` made it): null for a step of a repository run, which
 * works on a branch, and for one the run has not filed yet, which has no folder.
 */
export const workFolderOf = (run: Run, step: string): string | null => (isRepositoryRun(run) ? null : (run.steps[step]?.workspace ?? null));

/** Found among the ids the store lists (`runs.find`), not read by path, so no id can name a file outside it. */
export const findRun = (id: string): Run | undefined => runStore.runs.find(id);

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
 * The views of `run`'s tasks over `e`, and what the run is judged as off them, its steps `names` of `workflows`, where its branches stand
 * read off `standing.json` (`standingSnapshot`): or, when its unfrozen folder does not load or a task it reads does not, why it is not
 * judged (`judgedUnlessUnreadable`). Rejects with what the engine's reads die of.
 */
export const judgedOn = (
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  run: Run,
  names: readonly string[],
  workflows: readonly Workflow[] | null,
) =>
  runPlaced(
    placeService,
    e,
    Effect.gen(function* () {
      const { views, reader, unreadable } = yield* viewsFor(e, [run]);
      const git = standingReader(yield* standingSnapshot());
      const standings = (status: Parameters<typeof standingsOf>[2], steps: Parameters<typeof standingsOf>[1]) =>
        standingsOf(run, steps, status, git);
      const read = yield* judgedUnlessUnreadable(run, unreadable, () => judge(run, names, workflows, views, { reader, git, standings }));
      return { views, read };
    }),
  );

/**
 * A package program run for a request: over the engine `e` (`runWith`) and the place the app's layer gave (`Served.placeService`). Rejects
 * with what the program failed with or died of, as `runWith` does.
 */
export const runPlaced = <A, E>(
  place: PlaceService['Service'],
  e: Engine['Service'],
  program: Effect.Effect<A, E, EngineService | PlaceService>,
): Promise<A> => runWith(e, program.pipe(Effect.provideService(PlaceService, place)));
