/**
 * A person's marks on a run as a state machine: the marks a run carries (`RunMark`), read afresh from the files beside its record by
 * every pass and every verb (`runMarkOf`), never carried; the events that move them (`RunMarkEvent`), and what each does
 * (`runMarkMove`), proved law by law (contracts/run-marks.contract.ts). The store that writes those files asks `runMarkMove` before it
 * writes (`record/record.store.ts`, `record/files.store.ts`); what the marks mean to a pass is a table over them (`MARK_MEANS`), so a
 * mark added with no line there fails the typecheck. `runMarksDiagram` prints it for the package's README, between
 * `diagram:run-marks` markers. The machine's words are the contract's, which this file takes and hands on. Pure.
 *
 * A run's status is not here: it is worked out from its steps on every pass (`assess`) and never written.
 */
import type { RunMark, RunMarkEvent, RunMarkMove, RunMarkMoved, RunMarkRefusal } from '../../contracts/run-marks.contract.ts';

export type { RunMark, RunMarkEvent, RunMarkMove, RunMarkRefusal } from '../../contracts/run-marks.contract.ts';

/** A mark's three parts: whether the run is called off, pruned, held. */
type Parts = { readonly cancelled: boolean; readonly pruned: boolean; readonly held: boolean };

/** Each mark's parts, and so every mark: a mark added to the contract with no line here fails the typecheck. */
const PARTS: Readonly<Record<RunMark, Parts>> = {
  open: { cancelled: false, pruned: false, held: false },
  held: { cancelled: false, pruned: false, held: true },
  'called-off': { cancelled: true, pruned: false, held: false },
  'called-off-held': { cancelled: true, pruned: false, held: true },
  pruned: { cancelled: false, pruned: true, held: false },
  'pruned-held': { cancelled: false, pruned: true, held: true },
  'called-off-pruned': { cancelled: true, pruned: true, held: false },
  'called-off-pruned-held': { cancelled: true, pruned: true, held: true },
};

/** Every mark, in the order the diagram names them. */
export const RUN_MARKS = Object.keys(PARTS) as RunMark[];

/** Every event, each with the fact that makes it, as the diagram says it. */
export const RUN_MARK_EVENTS: Readonly<Record<RunMarkEvent, string>> = {
  hold: 'held',
  lift: 'its hold lifted',
  cancel: 'called off',
  prune: 'pruned',
  unprune: 'its prune taken back',
};

/** The marks a run carries, by which of its three files are there: called off, pruned, held. Every set of them is some mark. */
export const runMarkOf = (run: Parts): RunMark => {
  if (run.cancelled) {
    if (run.pruned) return run.held ? 'called-off-pruned-held' : 'called-off-pruned';
    return run.held ? 'called-off-held' : 'called-off';
  }
  if (run.pruned) return run.held ? 'pruned-held' : 'pruned';
  return run.held ? 'held' : 'open';
};

/** The move to the marks `to`. */
const to = (parts: Parts): RunMarkMove => ({ kind: 'edge', to: runMarkOf(parts) });

/** The refusal `as`. */
const refused = (as: RunMarkRefusal): RunMarkMove => ({ kind: 'refused', as });

/** A hold put on a run whose marks are `at`: refused by the first mark that stands in its way, called off before pruned before held. */
const holdOn = (at: Parts): RunMarkMove => {
  if (at.cancelled) return refused('cancelled');
  if (at.pruned) return refused('pruned');
  return at.held ? refused('held') : to({ ...at, held: true });
};

/** What `event` does to a run carrying the marks `from` (contracts/run-marks.contract.ts). */
export const runMarkMove: RunMarkMoved = (from: RunMark, event: RunMarkEvent): RunMarkMove => {
  const at = PARTS[from];
  if (event === 'hold') return holdOn(at);
  if (event === 'lift') return at.held ? to({ ...at, held: false }) : refused('not-held');
  if (event === 'cancel') return at.cancelled ? { kind: 'stays' } : to({ ...at, cancelled: true });
  if (event === 'prune') return at.pruned ? { kind: 'stays' } : to({ ...at, pruned: true });
  return at.pruned ? to({ ...at, pruned: false }) : refused('not-pruned');
};

/**
 * What each mark means to a pass: whether the run will never file anything again (`endedForGood`: called off or pruned), and whether a
 * person's ask of it is honoured and anything is asked of a person (`honoursAsks`: none of the three).
 */
export const MARK_MEANS: Readonly<Record<RunMark, { readonly endedForGood: boolean; readonly honoursAsks: boolean }>> = {
  open: { endedForGood: false, honoursAsks: true },
  held: { endedForGood: false, honoursAsks: false },
  'called-off': { endedForGood: true, honoursAsks: false },
  'called-off-held': { endedForGood: true, honoursAsks: false },
  pruned: { endedForGood: true, honoursAsks: false },
  'pruned-held': { endedForGood: true, honoursAsks: false },
  'called-off-pruned': { endedForGood: true, honoursAsks: false },
  'called-off-pruned-held': { endedForGood: true, honoursAsks: false },
};

/** One move the machine draws: from marks to others, by the event that makes it. */
export type RunMarkEdge = { readonly from: RunMark; readonly to: RunMark; readonly event: RunMarkEvent };

/** Every move `runMarkMove` makes between two marks, read off it: each mark asked each event. */
export const runMarkEdges = (): RunMarkEdge[] =>
  RUN_MARKS.flatMap((from) =>
    (Object.keys(RUN_MARK_EVENTS) as RunMarkEvent[]).flatMap((event) => {
      const move = runMarkMove(from, event);
      return move.kind === 'edge' ? [{ from, to: move.to, event }] : [];
    }),
  );

/** A person's marks on a run as a Mermaid state diagram: every move `runMarkMove` makes, by the fact that makes it. */
export const runMarksDiagram = (): string =>
  ['stateDiagram-v2', '  [*] --> open', ...runMarkEdges().map((e) => `  ${e.from} --> ${e.to}: ${RUN_MARK_EVENTS[e.event]}`)].join('\n');
