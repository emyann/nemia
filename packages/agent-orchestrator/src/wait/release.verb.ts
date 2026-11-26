/**
 * `nemia release`: let go every run that waits on this one — `--after`, `nemia hold --until` and a card's `after:` alike — by a person's
 * hand, for a run that will not succeed on its own: one that failed and was merged by hand, or called off. It writes the person's own
 * file once and never takes it back, refused before anything is written. A controller, reaching the runtime through the client
 * (`runtime-client.ts`): the verb is a program that fails with its refusal (`Invalid`, `Missing`, `Conflict`) and dies of anything else the
 * store or the engine throws.
 */
import { Effect } from 'effect';
import type { Actor } from 'objects';
import { honoursAsks, type Released, type Run } from '../record/record.ts';
import { idRefusal } from '../forget/forget.ts';
import { assess } from '../tick/assess.ts';
import { readRun } from '../tick/told.verb.ts';
import { EngineService } from '../runtime-client.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** What `nemia release` did: the run, and the release that now stands on it. */
export type Releasing = { run: Run; released: Released };

/**
 * Release the waiters of a run — `nemia release <run>`: every run that waits on it (`--after`, `hold --until`, a card's `after:`) goes
 * on at the next tick, as if it had succeeded, and keeps going: the release is written once and never taken back, since a waiter that started
 * cannot be un-started. A waiter starts from its base branch as it is then, whatever the run did.
 *
 * Fails before anything is written, with what to do instead: an id that is not a run's (`idRefusal`, `Invalid`); a run not there
 * (`Missing`); and a run that has already succeeded, whose waiters it has freed already, or whose waiters were released before
 * (`Conflict`). Dies of anything else the store or the engine throws.
 * @param id The run whose waiters are released.
 * @param actor The caller who releases them, kept beside the release where it is known.
 */
export const release = Effect.fn('release')(function* (id: string, actor?: Actor) {
  const bad = idRefusal(id, 'release');
  if (bad) return yield* Effect.fail(new Invalid({ message: bad }));
  const door = yield* RunDoor;
  if (!(yield* door.runs.exists(RunId.read(id))))
    return yield* Effect.fail(
      new Missing({
        message: `no such run: ${id}. nemia release takes the run others wait on, by its id, as nemia ls lists it: nemia release <runId>.`,
      }),
    );
  const run = yield* door.runs.read(RunId.read(id));
  if (run.released)
    return yield* Effect.fail(new Conflict({ message: `${id}'s waiters were released at ${run.released.at}: nothing more to release.` }));
  if (honoursAsks(run) && assess((yield* readRun(yield* EngineService, run)).read).status === 'succeeded')
    return yield* Effect.fail(
      new Conflict({ message: `${id} has succeeded, so what waits on it goes on without a release: nemia ls shows them.` }),
    );
  const put = yield* door.released.put(RunId.read(id), actor);
  if (!put)
    return yield* Effect.fail(
      new Conflict({ message: `${id}'s waiters were released by another caller just now: nothing more to release.` }),
    );
  return { run: { ...run, released: put }, released: put } satisfies Releasing;
});
