/**
 * `nemia assign`: put a run in someone's hand (`assign`) and give it back (`unassign`), each writing the person's own file, refused before
 * anything is written. A controller, reaching the runtime through the client (`runtime-client.ts`): each verb is a program that fails with
 * its refusal (`Invalid`, `Missing`, `Conflict`) and dies of anything else the store or the engine throws.
 */
import os from 'node:os';
import { Effect } from 'effect';
import type { Actor } from 'objects';
import type { Assignee, Run } from '../record/record.ts';
import { assignRefusal, assignStop, DEFAULT_FOR_MS } from './assignee.ts';
import { idRefusal } from '../forget/forget.ts';
import { judgedNow } from '../summary/summary.verb.ts';
import { RUN_PHASE_IN_PLAY } from '../phase/phase.ts';
import { EngineService } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';

/** What `nemia assign` did: the run, and the assignee put on it or given back. */
export type Assigning = { run: Run; assignee: Assignee };

/** The refusal of a run not there, naming the verb's forms. */
const missing = (id: string) =>
  new Missing({
    message: `no such run: ${id}. nemia assign takes a run by its id, as nemia ls lists it: nemia assign <runId> [--to <name>], or nemia assign <runId> --off.`,
  });

/**
 * Put a run in someone's hand — `nemia assign <run> [--to <name>] [--why] [--for <d>]`: what it asks of a person is theirs to answer, and
 * it waits on nobody else (`waitsOnYou`), until they give it back (`unassign`), the run is over, or an ask waits on them past `forMs`
 * (`assigneeStanding`), when the tick ends it. Nothing is refused because of it.
 *
 * Fails before anything is written, with what to do instead: an id that is not a run's (`Invalid`); a run not there (`Missing`); and what
 * `assignStop` refuses (`Conflict`) — a run cancelled, pruned or over, as the list judges it now (`judgedNow`), or one someone already has
 * in hand. An assignee whose time ran out and the tick has not ended yet is ended first, as the tick would. Writes `runs/<id>.assignee`
 * exclusively: two put at once are the first one's, and the second is refused. Dies of anything else the store or the engine throws.
 *
 * @param id The run's id.
 * @param said How long an ask may wait on them (`forMs`, an hour where not given), who they are (`name`: without one, the user this
 * process runs as, and none when the system has no name for it), the words for why, and the caller who puts it (`actor`) where known.
 */
export const assign = Effect.fn('assign')(function* (id: string, said: Partial<Omit<Assignee, 'at'>> = {}) {
  const bad = idRefusal(id, 'assign');
  if (bad) return yield* Effect.fail(new Invalid({ message: bad }));
  const door = yield* RunDoor;
  if (!(yield* door.runs.exists(RunId.read(id)))) return yield* Effect.fail(missing(id));
  const run = yield* door.runs.read(RunId.read(id));
  const [summary] = yield* judgedNow(yield* EngineService, yield* StoreRoot, [run]);
  const judged = summary !== undefined && summary.unreadable === null ? summary : undefined;
  const inPlay = judged ? RUN_PHASE_IN_PLAY[judged.phase] : true;
  const assigned = judged ? judged.assignee !== null : run.assignee !== undefined;
  const stop = assignStop({ cancelled: Boolean(run.cancelledAt), pruned: run.pruned !== undefined, inPlay, assigned });
  if (stop) return yield* Effect.fail(new Conflict({ message: assignRefusal(id, stop, run.assignee) }));
  if (run.assignee) yield* door.assignees.end(RunId.read(id), run.assignee.at, 'lapsed');
  const put = yield* door.assignees.put(RunId.read(id), {
    forMs: said.forMs ?? DEFAULT_FOR_MS,
    ...((said.name ?? osUser()) ? { name: said.name ?? osUser() } : {}),
    ...(said.why ? { why: said.why } : {}),
    ...(said.actor ? { actor: said.actor } : {}),
  });
  if (!put) {
    const again = yield* door.runs.read(RunId.read(id));
    return yield* Effect.fail(new Conflict({ message: assignRefusal(id, 'assigned', again.assignee) }));
  }
  return { run: { ...run, assignee: put }, assignee: put } satisfies Assigning;
});

/** Who this process runs as, by the name the system gives the user — or undefined, for a user it has no entry for. */
function osUser() {
  try {
    return os.userInfo().username || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Give a run back — `nemia assign <run> --off`: what it asks is the person's move again at once. Fails, before anything is written: an id
 * that is not a run's (`Invalid`), a run not there (`Missing`), a run nobody has in hand, and an assignee given back and put again since
 * it was read, which is a newer word and stays (the Run door's `assignees.end` takes only the one read, by its `at`) — each a `Conflict`;
 * dies of anything else the store throws. Reads no engine. Its receipt says it was given back, and by whom (`actor`, which the api hands
 * of its caller), and the feed's end of it carries them.
 * @param id The run's id.
 * @param actor Who gives it back, where known.
 */
export const unassign = Effect.fn('unassign')(function* (id: string, actor?: Actor) {
  const bad = idRefusal(id, 'assign');
  if (bad) return yield* Effect.fail(new Invalid({ message: bad }));
  const door = yield* RunDoor;
  if (!(yield* door.runs.exists(RunId.read(id)))) return yield* Effect.fail(missing(id));
  const run = yield* door.runs.read(RunId.read(id));
  const assignee = run.assignee;
  if (!assignee)
    return yield* Effect.fail(
      new Conflict({
        message: `nobody has ${id} in hand, so there is nothing to give back. To take it: nemia assign ${id} [--to <name>].`,
      }),
    );
  if (!(yield* door.assignees.end(RunId.read(id), assignee.at, 'given-back', actor)) && (yield* door.assignees.stands(RunId.read(id))))
    return yield* Effect.fail(
      new Conflict({
        message: `${id}'s assignee changed as it was given back: read it again (nemia ls ${id}), then give it back: nemia assign ${id} --off.`,
      }),
    );
  return { run, assignee } satisfies Assigning;
});
