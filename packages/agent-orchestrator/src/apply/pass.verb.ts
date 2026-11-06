/**
 * The tick's proposals pass: every approved proposal of every factory acted on by `applyProgram`, its run's state as this pass judged it
 * (`states`): one that succeeded applies a run-end proposal, one called off or gone drops it, one that runs, waits or sits failed leaves
 * it approved. Level-triggered: it reads the proposals and the runs afresh and carries nothing to the next pass. A proposal a read or a
 * write refuses is said in the daemon's log and left for the next pass; the pass itself goes on.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import type { ProposalsActed } from './act.verb.ts';
import type { Run } from '../record/record.ts';
import type { RunState } from './apply.ts';
import { applyProgram } from './apply.verb.ts';
import type { ProposalPlace } from '../propose/current.verb.ts';
import { ProposalDoor } from '../proposal/proposal.store.ts';

/** Each listed run's state as the pass read it: its judged status where it was judged, else unread; a run not listed is gone. */
export const runStatesOf = (runs: readonly Pick<Run, 'id'>[], judged: ReadonlyMap<string, { readonly status: RunState }>) => {
  const listed = new Set(runs.map((r) => r.id));
  return (run: string): RunState | undefined => judged.get(run)?.status ?? (listed.has(run) ? undefined : 'gone');
};

/** Every approved proposal of the store acted on, with `stateOf` its run's state: the names of those it moved, `<factory>/<name>`. */
export const proposalsPass = Effect.fn('proposalsPass')(function* (place: ProposalPlace, stateOf: (run: string) => RunState | undefined) {
  const door = (yield* ProposalDoor).proposals;
  const moved: string[] = [];
  for (const factory of yield* door.factories()) {
    for (const proposal of yield* door.list(factory)) {
      if (proposal.status.phase !== 'approved') continue;
      const name = proposal.metadata.name;
      const after = yield* Effect.result(applyProgram(factory, name, place, (run) => Effect.succeed(stateOf(run))));
      if (after._tag === 'Failure')
        yield* Effect.logWarning(`the proposal ${name} of ${factory} was not acted on this pass: ${after.failure.message}`);
      else if (after.success?.status.phase !== 'approved') moved.push(`${factory}/${name}`);
    }
  }
  return moved;
});

/**
 * The proposals pass as the tick runs it (`ProposalsAct`): at the store's root the pass was given, its runs' states as it judged them; a
 * refusal of the whole pass is said in the log and costs no other part of the tick.
 */
export const proposalsActed: ProposalsActed = (repo, runs, judged) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const acted = yield* Effect.result(proposalsPass({ home, repo: repo ?? home }, runStatesOf(runs, judged)));
    if (acted._tag === 'Failure') yield* Effect.logWarning(`the proposals were not acted on this pass: ${acted.failure.message}`);
  });
