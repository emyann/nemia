/**
 * `nemia hold`: hold a run until other runs ship (`hold`), and lift a hold by hand (`unhold`), each writing the person's own file, refused
 * before anything is written. A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import os from 'node:os';
import type { Engine } from '../runtime-client.ts';
import { type Hold, type Run } from '../record/record.ts';
import { holdRefusal } from './wait.ts';
import { idRefusal } from '../forget/forget.ts';
import { assess } from '../tick/assess.ts';
import { stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, parentOf, spendReader, taskPhases } from '../views/views.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';

/** What `nemia hold` did: the run, and the hold that now stands on it. */
export type Holding = { run: Run; hold: Hold };

/**
 * Hold a run until other runs ship — `nemia hold <run> --until <run>…`: while any of them has not shipped, as `nemia decide` says it of that run
 * (`parentOf`, which `--after` reads), nothing of this run is filed and nothing of it is asked of a person (`assess`); what is in flight
 * runs on. The tick lifts the hold on the pass that reads every one of them shipped (`advance`).
 *
 * Refused before anything is written, exit 2, with what to do instead: an id that is not a run's (`idRefusal`), and one named after
 * `--until`, whose fix keeps the run to hold; a run not there, and what `holdRefusal` refuses — nothing named, a run cancelled, pruned,
 * shipped (as `--after` reads it) or succeeded with nothing left but a person's merge, asked of the engine only for a run nothing else
 * refuses, a run already held, a folder run; and of each run
 * named: twice, the run itself, one not there, a folder run, another repository or base branch, `--no-worktree`, cancelled, a result branch
 * gone, already shipped — and one that already waits on this run, through `--after` or a hold. Writes `runs/<id>.hold`, exclusively: a hold
 * two people put at once is the first one's, and the second is refused as already held.
 *
 * @param said The person's words for why (`--why`), and who they are (`--by`): without a name, the user this process runs as, and none
 *   when the system has no name for it.
 */
export async function hold(e: Engine, id: string, until: readonly string[], said: Pick<Hold, 'why' | 'by'> = {}): Promise<Holding> {
  const bad = idRefusal(id, 'hold');
  if (bad) throw new Invalid({ message: bad });
  for (const named of until) {
    const badUntil = idRefusal(named, 'hold', `nemia hold ${id} --until`);
    if (badUntil) throw new Invalid({ message: `--until ${badUntil}` });
  }
  if (!runStore.runs.exists(id))
    throw new Missing({
      message: `no such run: ${id}. nemia hold takes a run by its id, as nemia ls lists it: nemia hold <runId> --until <runId>.`,
    });
  const run = runStore.runs.read(id);
  const read = new Map(await Promise.all([...new Set(until)].filter((u) => u !== id).map(async (u) => [u, await parentOf(e, u)] as const)));
  let finished: 'shipped' | 'succeeded' | undefined;
  if (until.length && !run.cancelledAt && !run.pruned && !run.hold) {
    if ((await parentOf(e, id)).shipped) finished = 'shipped';
    else {
      const steps = stepsOf(run);
      const { views, phaseOf } = await taskPhases(e, run);
      const { asks, rounds } = runStore.asks.read(id);
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
  const refused = holdRefusal(run, until, (u) => read.get(u) ?? { shipped: false }, runStore.runs.list(), finished);
  if (refused) throw new Conflict({ message: refused });
  const put = runStore.holds.put(id, until, { ...said, by: said.by ?? osUser() });
  if (!put)
    throw new Conflict({
      message:
        holdRefusal(runStore.runs.read(id), until, (u) => read.get(u) ?? { shipped: false }, []) ?? `${id} is already held: nemia ls ${id}.`,
    });
  return { run: { ...run, hold: put }, hold: put };
}

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
 * asked again. Refused, exit 2: an id that is not a run's, a run not there, a run nobody holds, and a hold lifted and put again since it
 * was read, which is a person's newer word and stays (`runStore.holds.lift` takes only the hold read, by its `at`).
 */
export function unhold(id: string): Holding {
  const bad = idRefusal(id, 'hold');
  if (bad) throw new Invalid({ message: bad });
  if (!runStore.runs.exists(id))
    throw new Missing({ message: `no such run: ${id}. nemia hold takes a run by its id, as nemia ls lists it: nemia hold <runId> --off.` });
  const run = runStore.runs.read(id);
  if (!run.hold)
    throw new Conflict({
      message: `${id} is not held, so there is no hold to lift. To hold it until other runs ship: nemia hold ${id} --until <runId>.`,
    });
  if (!runStore.holds.lift(id, run.hold.at) && runStore.holds.stands(id))
    throw new Conflict({
      message: `${id}'s hold changed as it was lifted: read it again (nemia ls ${id}), then lift it: nemia hold ${id} --off.`,
    });
  return { run, hold: run.hold };
}
