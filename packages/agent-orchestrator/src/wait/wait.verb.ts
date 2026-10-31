/**
 * `nemia hold`: hold a run until other runs land (`hold`), and lift a hold by hand (`unhold`), each writing the person's own file, refused
 * before anything is written. A controller, reaching the runtime through the client (`runtime-client.ts`): each verb is a program that
 * fails with its refusal (`Invalid`, `Missing`, `Conflict`) and dies of anything else the store, git or the engine throws.
 */
import os from 'node:os';
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { type Hold, type Run } from '../record/record.ts';
import { holdRefusal } from './wait.ts';
import { idRefusal } from '../forget/forget.ts';
import { assess } from '../tick/assess.ts';
import { stepsOf } from '../record/record.store.ts';
import { standingLiveOf } from '../standing/standing.verb.ts';
import {
  closeoutAsked,
  closeoutReader,
  exitVerdicts,
  harnessBlocked,
  parentRead,
  spendReader,
  taskPhasesRead,
} from '../views/views.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** What `nemia hold` did: the run, and the hold that now stands on it. */
export type Holding = { run: Run; hold: Hold };

/**
 * Hold a run until other runs land — `nemia hold <run> --until <run>…`: while any of them has not landed, as `nemia decide` says it of
 * that run (`parentRead`, which `--after` reads), nothing of this run is filed and nothing of it is asked of a person (`assess`); what
 * is in flight runs on. The tick lifts the hold on the pass that reads every one of them landed (`advanceRun`).
 *
 * Fails before anything is written, with what to do instead: an id that is not a run's (`idRefusal`), and one named after `--until`,
 * whose fix keeps the run to hold (`Invalid`); a run not there (`Missing`); and what `holdRefusal` refuses (`Conflict`) — nothing
 * named, a run cancelled, pruned, landed (as `--after` reads it, where the branches stand now: `standingLiveOf`) or succeeded with
 * nothing left but a person's merge, asked of the engine only for a run nothing else refuses, a run already held, a folder run; and of
 * each run named: twice, the run itself, one not there, a folder run, another repository or base branch, `--no-worktree`, cancelled, a
 * result branch gone, already landed — and one that already waits on this run, through `--after` or a hold. Writes `runs/<id>.hold`,
 * exclusively: a hold two people put at once is the first one's, and the second is refused as already held. Dies of anything else the
 * store, git or the engine throws.
 *
 * @param said The person's words for why (`--why`), and who they are (`--by`): without a name, the user this process runs as, and none
 *   when the system has no name for it.
 */
export const hold = Effect.fn('hold')(function* (id: string, until: readonly string[], said: Pick<Hold, 'why' | 'by'> = {}) {
  const bad = idRefusal(id, 'hold');
  if (bad) return yield* Effect.fail(new Invalid({ message: bad }));
  for (const named of until) {
    const badUntil = idRefusal(named, 'hold', `nemia hold ${id} --until`);
    if (badUntil) return yield* Effect.fail(new Invalid({ message: `--until ${badUntil}` }));
  }
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia hold takes a run by its id, as nemia ls lists it: nemia hold <runId> --until <runId>.`,
      }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const git = yield* standingLiveOf([id, ...until]);
  const read = new Map(
    yield* Effect.all(
      [...new Set(until)].filter((u) => u !== id).map((u) => Effect.map(parentRead(u, git), (parent) => [u, parent] as const)),
      { concurrency: 'unbounded' },
    ),
  );
  let finished: 'landed' | 'succeeded' | undefined;
  if (until.length && !run.cancelledAt && !run.pruned && !run.hold) {
    if ((yield* parentRead(id, git)).landed) finished = 'landed';
    else {
      const steps = yield* tried(() => stepsOf(run));
      const { views, phaseOf } = yield* taskPhasesRead(run);
      const { asks, rounds } = yield* (yield* RunDoor).asks.read(RunId.read(id));
      const { status } = assess(
        steps,
        run,
        phaseOf,
        closeoutReader(views, run),
        closeoutAsked(views),
        exitVerdicts(views, run),
        asks,
        rounds,
        harnessBlocked(views),
        spendReader(views),
      );
      if (status === 'succeeded') finished = 'succeeded';
    }
  }
  const others = yield* (yield* RunDoor).runs.list();
  const refused = holdRefusal(run, until, (u) => read.get(u) ?? { landed: false }, others, finished);
  if (refused) return yield* Effect.fail(new Conflict({ message: refused }));
  const put = yield* (yield* RunDoor).holds.put(RunId.read(id), until, { ...said, by: said.by ?? osUser() });
  if (!put) {
    const again = yield* (yield* RunDoor).runs.read(RunId.read(id));
    return yield* Effect.fail(
      new Conflict({
        message: holdRefusal(again, until, (u) => read.get(u) ?? { landed: false }, []) ?? `${id} is already held: nemia ls ${id}.`,
      }),
    );
  }
  return { run: { ...run, hold: put }, hold: put } satisfies Holding;
});

/** Who this process runs as, by the name the system gives the user — or undefined, for a user it has no entry for. */
function osUser(): string | undefined {
  try {
    return os.userInfo().username || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lift a person's hold by hand — `nemia hold <run> --off`: the run goes on at the next tick, and what its steps asked while it was held is
 * asked again. Fails, before anything is written: an id that is not a run's (`Invalid`), a run not there (`Missing`), a run nobody holds,
 * and a hold lifted and put again since it was read, which is a person's newer word and stays (`runStore.holds.lift` takes only the hold
 * read, by its `at`) — each a `Conflict`; dies of anything else the store throws. Reads no engine, so it requires nothing.
 */
export const unhold = Effect.fn('unhold')(function* (id: string) {
  const bad = idRefusal(id, 'hold');
  if (bad) return yield* Effect.fail(new Invalid({ message: bad }));
  if (!(yield* (yield* RunDoor).runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({ message: `no such run: ${id}. nemia hold takes a run by its id, as nemia ls lists it: nemia hold <runId> --off.` }),
    );
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const held = run.hold;
  if (!held)
    return yield* Effect.fail(
      new Conflict({
        message: `${id} is not held, so there is no hold to lift. To hold it until other runs land: nemia hold ${id} --until <runId>.`,
      }),
    );
  if (!(yield* (yield* RunDoor).holds.lift(RunId.read(id), held.at)) && (yield* (yield* RunDoor).holds.stands(RunId.read(id))))
    return yield* Effect.fail(
      new Conflict({
        message: `${id}'s hold changed as it was lifted: read it again (nemia ls ${id}), then lift it: nemia hold ${id} --off.`,
      }),
    );
  return { run, hold: held } satisfies Holding;
});
