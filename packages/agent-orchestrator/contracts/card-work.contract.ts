/**
 * The runs a card's work went through (agent-orchestrator, src/inbox/card-work.ts, `cardWork`): the run started from the card, then
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

/**
 * Whether `run` belongs to the work of `card`: started from it, or started, carrying no card of its own, by a run that belongs to it.
 * Walks up at most `runs.length` runs, so a loop of `startedBy` a hand-edited record makes ends, read as belonging to no card.
 */
const belongs = (run: WorkRun, runs: readonly WorkRun[], card: string) => {
  let at: WorkRun | undefined = run;
  for (let i = 0; i <= runs.length && at !== undefined; i++) {
    if (at.card === card) return true;
    if (at.card !== null || at.startedBy === null) return false;
    const parent: string = at.startedBy;
    at = runs.find((r) => r.id === parent);
  }
  return false;
};

const cardWorkSpec = spec<(card: string, runs: readonly WorkRun[]) => readonly string[]>({
  requires: ({ input: [, runs] }) =>
    runs.every((r, i) => !runs.slice(0, i).some((o) => o.id === r.id) && (i === 0 || (runs[i - 1]?.created ?? 0) <= r.created)),
  ensures: {
    eachIsARun: {
      description: 'Every run of the work is a run the store lists',
      condition: ({ input: [, runs], output }) => output.every((id) => runs.some((r) => r.id === id)),
    },
    startedFromTheCard: {
      description: 'Every run started from the card is part of its work',
      condition: ({ input: [card, runs], output }) => runs.every((r) => r.card !== card || output.includes(r.id)),
    },
    childrenFollow: {
      description: 'A run a node of the work started, carrying no card of its own, is part of the work',
      condition: ({ input: [, runs], output }) =>
        runs.every((r) => r.card !== null || r.startedBy === null || !output.includes(r.startedBy) || output.includes(r.id)),
    },
    onlyItsOwn: {
      description: "No run is part of a card's work that was not started from it or, through nodes, by a run started from it",
      condition: ({ input: [card, runs], output }) =>
        output.every((id) => {
          const run = runs.find((r) => r.id === id);
          return run !== undefined && belongs(run, runs, card);
        }),
    },
    eachOnce: {
      description: 'Each run is listed once',
      condition: ({ output }) => output.every((id, i) => !output.slice(0, i).includes(id)),
    },
    inStartOrder: {
      description: 'The runs are listed in the order they were made, those made at the same instant in the order the store lists them',
      condition: ({ input: [, runs], output }) =>
        output.every((id, i) => {
          const next = output[i + 1];
          const a = runs.find((r) => r.id === id);
          const b = next === undefined ? undefined : runs.find((r) => r.id === next);
          return a === undefined || b === undefined || a.created <= b.created;
        }),
    },
  },
});

/** `cardWork`'s type, which `src/inbox/card-work.ts` takes: the ids of the runs the work of `card` went through, in start order. */
export type CardWorkOf = Implementation<typeof cardWorkSpec>;
