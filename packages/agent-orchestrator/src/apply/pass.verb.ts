/**
 * The tick's proposals pass: every approved proposal of every factory acted on by `applyProgram`, its run's state as this pass judged it
 * (`states`): one that succeeded applies a run-end proposal, one called off or gone drops it, one that runs, waits or sits failed leaves
 * it approved. Level-triggered: it reads the proposals and the runs afresh and carries nothing to the next pass. A proposal a read or a
 * write refuses is said in the daemon's log and left for the next pass; the pass itself goes on.
 */
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { ProposalsAct, type ProposalsActed } from './act.verb.ts';
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
 * refusal of the whole pass is said in the log and costs no other part of the tick. Each proposal's factory says its own repositories.
 */
export const proposalsActed: ProposalsActed = (runs, judged) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const acted = yield* Effect.result(proposalsPass({ home }, runStatesOf(runs, judged)));
    if (acted._tag === 'Failure') yield* Effect.logWarning(`the proposals were not acted on this pass: ${acted.failure.message}`);
  });

/**
 * `program` (a tick's pass) with the proposals pass given to it: what every program that runs the pass is composed with — `nemia tick`
 * (`cli/main.ts`), the daemon's loop (`up`), and a test's — so every tick acts on proposals.
 */
export const withProposalsPass = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, ProposalsAct>> =>
  Effect.provideService(program, ProposalsAct, proposalsActed);
