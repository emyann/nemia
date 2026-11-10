/**
 * The cap on runs in flight as it holds between passes (`slotsOf`, `runSlots`): every run read as a pass reads it, for `nemia ls`, `nemia
 * decide`, the repository's checkout and the board's ceilings. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import { Cause, Deferred, Effect, Exit, Result } from 'effect';
import { asked, over, unreadableJournal, type Engine, type TaskView } from '../runtime-client.ts';
import type { Workflow } from '../workflow.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { admissionOrder, heldRuns, slotNeed, type RunSlot } from './cap.ts';
import { runTasks, type Run } from '../record/record.ts';
import { hasStarted } from '../wait/wait.ts';
import { assess } from '../tick/assess.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { unloadedFolder } from '../steps/steps.ts';
import { stepsOf } from '../steps/steps.verb.ts';
import { lastCeilings } from '../daemon/daemon.store.ts';
import { maxRuns } from '../config/config.store.ts';
import { parentsRead, passParents, type Parents } from '../views/views.verb.ts';
import { standingReader, type PassStanding } from '../standing/standing.verb.ts';
import type { PassRevisions } from '../revisions/pin.verb.ts';
import { readRun } from '../tick/told.verb.ts';

/** A run a task of which does not read (`unreadableJournal`), as a pass counts it: in flight, and asking the cap for nothing more. */
const UNJUDGED = { inFlight: true, wants: false } as const;

/**
 * The cap on runs in flight as it holds now (`slotsOf`): `cap`, 0 for none; `inFlight`, the runs that count against it in the order a
 * pass admits them (`admissionOrder`), null with no cap; and `held`, the runs it holds, each with the count it is held at (`heldRuns`).
 */
export type Slots = { cap: number; inFlight: string[] | null; held: Map<string, RunSlot> };

/** `e`, its `view` of a task answered from `listed`, the one look a read took, and of a task filed since by the engine itself. */
const seenIn = (e: Engine, listed: ReadonlyMap<string, TaskView>): Engine => ({
  ...e,
  view: (taskId: string) => {
    const seen = listed.get(taskId);
    return seen ? Effect.succeed(seen) : e.view(taskId);
  },
});

/**
 * What a run asks of the cap (`slotNeed`), judged off `listed` and `seen`, as a pass judges it; the run's parents read through `seen`, and
 * answered from `parents` where it holds them.
 */
const needOf = Effect.fnUntraced(function* (
  seen: Engine,
  listed: ReadonlyMap<string, TaskView>,
  run: Run,
  steps: Workflow[],
  parents: Parents,
) {
  const { read } = yield* readRun(seen, run, { steps, views: new Map(listed) });
  const { phaseOf } = read;
  const a = assess(read);
  const parent = yield* parentsRead(run, parents.git, parents.read).pipe(over(seen));
  return slotNeed(run, phaseOf, a, (id) => parent(id).landed, steps);
});

/**
 * Refuses a run a caller left out of the cap's count as ended at rest (`slotSettled`) where, judged afresh on a verified read, it is in
 * flight or wants a slot: leaving it out would have changed the answer.
 */
const leftOutRightly = (id: string, need: { inFlight: boolean; wants: boolean }): void => {
  if (need.inFlight || need.wants)
    throw new Error(
      `The ceilings left ${id} out as ended and at rest, and judged afresh it ${need.inFlight ? 'is in flight' : 'wants a run slot'} (WF_VERIFY_REST): the informer's judgement of it is stale, or \`slotSettled\` trusts a word it should not.`,
    );
};

/**
 * The cap on runs in flight, and the runs it counts and holds (`Slots`): every run of `runs` read as a pass reads it, between passes, over
 * one look at the harnesses (`e.list` of every run's tasks) — what `nemia ls`, `nemia decide`, the repository's checkout and the board's
 * ceilings say. Nothing read with no cap. A run a task of which does not read, its own or a run's it waits on, or whose unfrozen folder
 * does not load (`unloadedFolder`), is counted in flight (`UNJUDGED`), as the pass counts it; a record whose workflow does not read for
 * any other reason is left out, as nothing of it could be filed.
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, `WF_MAX_RUNS` of `env` (`maxRuns`, refused by name when it is not a count). The runs the runs wait on are read
 * through `parents` (`passParents`): a pass's, or the caller's, over the reader it read where the branches stand through.
 *
 * `settled` names the runs a caller would have left out of `runs` as neither in flight nor held (`slotSettled`), handed to check that
 * claim on a verified read (`WF_VERIFY_REST=1`): a run of them judged in flight or wanting a slot dies, naming it.
 */
export const slotsOf = Effect.fn('slotsOf')(function* (
  e: Engine,
  runs: readonly Run[] = storeRunsGiven(),
  env: NodeJS.ProcessEnv = process.env,
  parents: Parents,
  settled: ReadonlySet<string> = new Set(),
) {
  const cap = lastCeilings()?.runs ?? maxRuns(env);
  if (cap <= 0) return { cap: 0, inFlight: null, held: new Map() } satisfies Slots;
  const read = yield* asked('list', e.list(runs.flatMap(runTasks)));
  const listed = new Map(read.views.map((view) => [view.id, view]));
  const unreadable = new Set(read.unreadable.map((u) => u.taskId));
  const seen = seenIn(e, listed);
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    const read = yield* Effect.result(stepsOf(run));
    if (Result.isFailure(read)) {
      if (unloadedFolder(read.failure) !== undefined) needs.push({ id: run.id, createdAt: run.createdAt, ...UNJUDGED });
      continue;
    }
    const steps: Workflow[] = read.success;
    let need: { inFlight: boolean; wants: boolean } = UNJUDGED;
    if (!runTasks(run).some((taskId) => unreadable.has(taskId))) {
      const judged = yield* Effect.exit(needOf(seen, listed, run, steps, parents));
      if (Exit.isSuccess(judged)) need = judged.value;
      else if (unreadableJournal(Cause.squash(judged.cause)) === undefined) return yield* Effect.failCause(judged.cause);
    }
    if (settled.has(run.id)) leftOutRightly(run.id, need);
    needs.push({ id: run.id, createdAt: run.createdAt, ...need });
  }
  return { cap, inFlight: admissionOrder(needs.filter((n) => n.inFlight)).map((n) => n.id), held: heldRuns(needs, cap) } satisfies Slots;
});

/** Every run in the store, a run `given` names answered by the record it holds rather than read again: `slotsRead`'s listing. */
export const storeRunsGiven = (given?: (id: string) => Run | undefined): Run[] => runsAtOnce.runs.list(undefined, given);

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`slotsOf`'s `held`). None, and nothing read, with no
 * cap or no run that has nothing filed. The cap before any pass has written one is `env`'s `WF_MAX_RUNS`, as `slotsOf` reads it; the runs
 * the runs wait on are read through `parents`, as `slotsOf` reads them.
 */
export const runSlots = Effect.fn('runSlots')(function* (e: Engine, runs: readonly Run[], env: NodeJS.ProcessEnv, parents: Parents) {
  const cap = lastCeilings()?.runs ?? maxRuns(env);
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map<string, RunSlot>();
  return (yield* slotsOf(e, runs, env, parents)).held;
});

/**
 * What one pass reads once for every run it judges, and hands each: its one listing of the store (`runs`); the runs the cap holds over it
 * (`runSlots`), read on the first claim on a checkout that asks for them and kept for the rest of the pass, a read that failed asked again;
 * and the runs others wait on (`Parents`); and where the pass read its repositories stand (`passStanding`), which its parents are read
 * off — or, outside the tick's pass, where its caller read them (`standingNow`, `standingSnapshot`). Made by the pass and dropped with
 * it: the next reads the world again. And what resolving each run's kinds reads (`revisions`, `passRevisions`): one load and one
 * digest of each workflow folder a pass, shared by every run on it.
 */
export type PassRead = {
  runs: readonly Run[];
  slots: Effect.Effect<Map<string, RunSlot>, Refusal>;
  parents: Parents;
  standing: PassStanding;
  revisions: PassRevisions;
};

/**
 * What one pass reads once (`PassRead`), over `e` and the pass's listing `runs`, the cap read from `env` as `runSlots` reads it, and the
 * runs others wait on read off `standing`, and what resolving each run's kinds reads, which the caller made for the pass (`passRevisions`).
 */
export const passRead = (
  e: Engine,
  runs: readonly Run[],
  env: NodeJS.ProcessEnv,
  standing: PassStanding,
  revisions: PassRevisions,
): PassRead => {
  const parents = passParents(standingReader(standing));
  type Held = Deferred.Deferred<Map<string, RunSlot>, Refusal>;
  let held: Held | undefined;
  const slots = Effect.suspend(() => {
    if (held) return Deferred.await(held);
    const pending: Held = Deferred.makeUnsafe();
    held = pending;
    return runSlots(e, runs, env, parents).pipe(
      Effect.onExit((exit) => {
        if (Exit.isFailure(exit) && held === pending) held = undefined;
        return Deferred.done(pending, exit);
      }),
    );
  });
  return { runs, slots, parents, standing, revisions };
};
