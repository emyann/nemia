/**
 * One step of the runs a card's work went through (agent-orchestrator, src/inbox/card-work.ts, `reach`, which `cardWork` repeats): the run started from the card, then
 * each run a workflow node of one of them started (`startedBy`), and so on, in the order they were started. What a card's state, its
 * served `runs`, its waiters' release and `nemia inbox resend` read, worked out on every read and stored nowhere. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * A run as the walk reads it: its id, the card it was started from (null for none), the run whose workflow node started it (null for a
 * run started any other way), and when it was made, in milliseconds.
 */
export type WorkRun = {
  readonly id: string;
  readonly card: string | null;
  readonly startedBy: string | null;
  readonly created: number;
};

const reachSpec = spec<(card: string, runs: readonly WorkRun[], found: readonly string[]) => readonly string[]>({
  requires: ({ input: [, runs] }) => runs.every((r, i) => !runs.slice(0, i).some((o) => o.id === r.id)),
  ensures: {
    eachIsARun: {
      description: 'Every run reached is a run the store lists',
      condition: ({ input: [, runs], output }) => output.every((id) => runs.some((r) => r.id === id)),
    },
    startedFromTheCard: {
      description: 'Every run started from the card is reached',
      condition: ({ input: [card, runs], output }) => runs.every((r) => r.card !== card || output.includes(r.id)),
    },
    childrenFollow: {
      description: 'A run started by a run already found, carrying no card of its own, is reached',
      condition: ({ input: [, runs, found], output }) =>
        runs.every((r) => r.card !== null || r.startedBy === null || !found.includes(r.startedBy) || output.includes(r.id)),
    },
    onlyItsOwn: {
      description: 'No run is reached that was not started from the card or, carrying no card, by a run already found',
      condition: ({ input: [card, runs, found], output }) =>
        output.every((id) => {
          const run = runs.find((r) => r.id === id);
          return run !== undefined && (run.card === card || (run.card === null && run.startedBy !== null && found.includes(run.startedBy)));
        }),
    },
    eachOnce: {
      description: 'Each run is listed once',
      condition: ({ output }) => output.every((id, i) => !output.slice(0, i).includes(id)),
    },
  },
});

/** `reach`'s type, which `src/inbox/card-work.ts` takes: the runs one more step of the card's work reaches, given those already found. */
export type ReachOf = Implementation<typeof reachSpec>;
