/**
 * A person's marks on a run as a machine (agent-orchestrator, src/run-marks/run-marks.ts): what a mark asked for does to a run that
 * carries the marks it does (`runMarkMove`). A run's status is worked out from its steps and never written; what a person does to the
 * run as a whole is written, each in a file of its own beside the record — that it is called off, held, pruned — and read afresh by every
 * pass and every verb (`runMarkOf`). The store that writes those files asks this function first (`record/record.store.ts`,
 * `record/files.store.ts`), and the store's own test walks each pair of marks and an event against the files.
 *
 * The machine's words are declared here and taken by the code, so this file reads nothing of `src`. What a verb refuses for a reason
 * outside the marks — a run that already succeeded, a worktree that holds unsaved work — is that verb's own judgement, made before it
 * asks.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * The marks a run carries, one word for each set of the three a person can leave: `open` with none; `held` by a person's hold;
 * `called-off`; `pruned`, its worktrees removed; and each pair and the three together, so every set of files reads as some mark.
 */
export type RunMark =
  | 'open'
  | 'held'
  | 'called-off'
  | 'called-off-held'
  | 'pruned'
  | 'pruned-held'
  | 'called-off-pruned'
  | 'called-off-pruned-held';

/**
 * What marks a run: a hold put (`hold`), a hold lifted by a person or by the pass once its runs landed (`lift`), a call-off (`cancel`),
 * its worktrees pruned (`prune`), and a prune taken back where nothing was removed (`unprune`).
 */
export type RunMarkEvent = 'hold' | 'lift' | 'cancel' | 'prune' | 'unprune';

/** Why a mark is refused, by the mark that stands in its way, or the one it needs and does not find. */
export type RunMarkRefusal = 'cancelled' | 'pruned' | 'held' | 'not-held' | 'not-pruned';

/** What an event does to a run's marks: moves them, leaves them as they stand, or is refused. */
export type RunMarkMove =
  | { readonly kind: 'edge'; readonly to: RunMark }
  | { readonly kind: 'stays' }
  | { readonly kind: 'refused'; readonly as: RunMarkRefusal };

const calledOff = (mark: RunMark): boolean =>
  mark === 'called-off' || mark === 'called-off-held' || mark === 'called-off-pruned' || mark === 'called-off-pruned-held';
const pruned = (mark: RunMark): boolean =>
  mark === 'pruned' || mark === 'pruned-held' || mark === 'called-off-pruned' || mark === 'called-off-pruned-held';
const held = (mark: RunMark): boolean =>
  mark === 'held' || mark === 'called-off-held' || mark === 'pruned-held' || mark === 'called-off-pruned-held';
const refusedAs = (move: RunMarkMove, as: RunMarkRefusal): boolean => move.kind === 'refused' && move.as === as;

/** Whether `move` goes to marks that are called off, pruned and held as said. */
const goesTo = (move: RunMarkMove, to: { calledOff: boolean; pruned: boolean; held: boolean }): boolean =>
  move.kind === 'edge' && calledOff(move.to) === to.calledOff && pruned(move.to) === to.pruned && held(move.to) === to.held;

const runMarkMoveSpec = spec<(from: RunMark, event: RunMarkEvent) => RunMarkMove>({
  ensures: {
    aHoldIsPutOnAnOpenRunAlone: {
      description:
        'A hold is put exactly on a run with no mark; one called off is refused as cancelled, else one pruned as pruned, else one held as held',
      condition: ({ input: [from, event], output }) =>
        event !== 'hold' ||
        (calledOff(from)
          ? refusedAs(output, 'cancelled')
          : pruned(from)
            ? refusedAs(output, 'pruned')
            : held(from)
              ? refusedAs(output, 'held')
              : goesTo(output, { calledOff: false, pruned: false, held: true })),
    },
    aLiftTakesTheHoldAndNothingElse: {
      description: 'A lift takes a hold off and leaves every other mark: a run not held has none to lift',
      condition: ({ input: [from, event], output }) =>
        event !== 'lift' ||
        (held(from) ? goesTo(output, { calledOff: calledOff(from), pruned: pruned(from), held: false }) : refusedAs(output, 'not-held')),
    },
    aCallOffIsKeptOnceAndLeavesTheOtherMarks: {
      description: 'A call-off marks a run not called off, keeping its hold and its prune, and leaves one already called off as it stands',
      condition: ({ input: [from, event], output }) =>
        event !== 'cancel' ||
        (calledOff(from) ? output.kind === 'stays' : goesTo(output, { calledOff: true, pruned: pruned(from), held: held(from) })),
    },
    aPruneIsKeptOnceAndLeavesTheOtherMarks: {
      description: 'A prune marks a run not pruned, keeping its call-off and its hold, and leaves one already pruned as it stands',
      condition: ({ input: [from, event], output }) =>
        event !== 'prune' ||
        (pruned(from) ? output.kind === 'stays' : goesTo(output, { calledOff: calledOff(from), pruned: true, held: held(from) })),
    },
    aPruneTakenBackLeavesTheOtherMarks: {
      description: 'A prune taken back leaves the run as it was called off or held, and a run not pruned has none to take back',
      condition: ({ input: [from, event], output }) =>
        event !== 'unprune' ||
        (pruned(from) ? goesTo(output, { calledOff: calledOff(from), pruned: false, held: held(from) }) : refusedAs(output, 'not-pruned')),
    },
    aCallOffIsNeverTakenBack: {
      description: 'A run called off stays called off, whatever is asked of it',
      condition: ({ input: [from], output }) => !calledOff(from) || output.kind !== 'edge' || calledOff(output.to),
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type RunMarkMoved = Implementation<typeof runMarkMoveSpec>;
