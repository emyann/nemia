/**
 * A run's steps, read as a program (`stepsOf`): the workflow the record froze, with no door and no root, or for a record that froze none,
 * its folder read through the Workflow door the program is given, at the store's root it is given (`StoreRoot`) — never the disk at the
 * module's root. Read again on every call, never kept between passes. A controller, since the door reaches `record.store.ts`, which no
 * store beneath it may close a cycle over (`test/boundary.test.ts`); the refusal and the frozen read are pure (`steps.ts`).
 */
import { Cause, Effect, Option } from 'effect';
import type { Workflow } from '../workflow.ts';
import { orderSteps } from '../workflow.ts';
import { StoreRoot } from '../config/root.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { WorkflowDir } from '../folder/folder.model.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';
import { runStore } from './files.store.ts';
import { isRepositoryRun, type Run } from './record.ts';
import { frozenStepsOf, UnloadedFolder, unloadedFolder } from './steps.ts';
import { resultBranches, type BranchReader } from '../branches/branches.store.ts';
import type { ParentRun } from '../wait/wait.ts';

/**
 * The run's steps: the workflow it froze at `nemia start`, in the order they run (`frozenStepsOf`), read with no door and no root.
 *
 * The folder is read only for a record that froze no workflow, never for a run `nemia start` froze, so nothing written into the folder
 * after `nemia start` reaches it: through the Workflow door, with the run's places, its repository's and the store's root the program was
 * given (`StoreRoot`), with no hires, since such a record names no factory. Given no root, it fails `Invalid` naming how to give one; a
 * folder that does not load — any failure or defect of the read but an interruption — fails `UnloadedFolder`.
 */
export const stepsOf = (run: Run): Effect.Effect<Workflow[], Refusal> => {
  const frozen = frozenStepsOf(run);
  if (frozen !== undefined) return Effect.succeed(frozen);
  return Effect.gen(function* () {
    const root = yield* Effect.serviceOption(StoreRoot);
    if (Option.isNone(root))
      return yield* Effect.fail(
        new Invalid({
          message: `run ${run.id} froze no workflow, and its folder was read with no store root: provide StoreRoot where the program is composed (storeRootLayer, src/config/root.store.ts).`,
        }),
      );
    const door = yield* WorkflowDoor;
    const steps = yield* Effect.suspend(() =>
      door.workflows.read(WorkflowDir.read(run.workflowDir), { repo: run.repo, home: root.value }),
    ).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.fail(new UnloadedFolder(run, wordsOf(Cause.squash(cause)))),
      ),
    );
    return orderSteps(steps);
  });
};

const wordsOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Why the tick leaves `run` out of its pass, read now: the words of its unfrozen folder that does not load (`unloadedFolder`); undefined
 * for a run whose steps read. Fails any other refusal.
 */
export const unloadedOf = (run: Run): Effect.Effect<string | undefined, Refusal> =>
  stepsOf(run).pipe(
    Effect.as(undefined),
    Effect.catchIf(
      (err) => err instanceof UnloadedFolder,
      (err) => Effect.succeed(unloadedFolder(err)),
    ),
  );

/**
 * The run's steps (`stepsOf`), or none for a run whose folder does not load (`UnloadedFolder`): for a read that judges nothing of the
 * run, as a pause's finishing tasks and held checks are. Fails any other refusal.
 */
export const stepsOrNone = (run: Run): Effect.Effect<Workflow[], Refusal> =>
  stepsOf(run).pipe(
    Effect.catchIf(
      (err) => err instanceof UnloadedFolder,
      () => Effect.succeed([]),
    ),
  );

/**
 * Each run's steps (`stepsOrNone`), read once, by its id: for the synchronous reads of a pass or a list, which are handed a lookup
 * (`(run) => among.get(run.id) ?? []`) rather than reading the folder once per helper.
 */
export const stepsAmong = (runs: readonly Run[]): Effect.Effect<ReadonlyMap<string, readonly Workflow[]>, Refusal> =>
  Effect.map(
    Effect.forEach(runs, (run) => Effect.map(stepsOrNone(run), (steps) => [run.id, steps] as const)),
    (pairs) => new Map(pairs),
  );

/**
 * A run another waits on, as its record and `git` say it without the engine: the record, when the store has one, and the result branches
 * it names that git no longer has and cannot find on the base by their recorded tips (`BranchReader.landed`). What `nemia start --after`
 * refuses an edge by (`afterRefusal`), and where `parentOf` starts. A record whose steps cannot be read — no frozen workflow, and its
 * folder gone — names no result branch; one whose branches were not read names none gone.
 */
export const parentRecord = (id: string, git: BranchReader): Effect.Effect<Pick<ParentRun, 'record' | 'gone'>> =>
  Effect.gen(function* () {
    let record: Run;
    try {
      record = runStore.runs.read(id);
    } catch {
      return {};
    }
    const steps = yield* Effect.orElseSucceed(stepsOf(record), (): Workflow[] => []);
    const branches = steps.length ? resultBranches(record, steps) : [];
    const cut = isRepositoryRun(record) ? record : undefined;
    const gone = cut ? branches.filter((b) => git.unread(cut, b) === undefined && !git.has(cut.repo, b) && !git.landed(cut, b)) : [];
    return { record, ...(gone.length ? { gone } : {}) };
  });
