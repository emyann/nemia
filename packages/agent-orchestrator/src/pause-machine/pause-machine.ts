/**
 * The store's pause as a state machine: the mode a store is in (`PauseMode`), read afresh from its pause on every pass and by every
 * verb (`pauseModeOf`), never carried; the events that move it (`PauseEvent`), and what each does in each mode (`pauseMove`), proved
 * law by law (contracts/pause-machine.contract.ts). The verbs and the pass that write the pause's file ask `pauseMove` before they
 * write (`pause/pause.store.ts`), so a move it does not make is one nothing writes; what the pause does in each mode is a table over the
 * modes (`SESSIONS_UNDER`, `DRAIN_OF`), so a mode added with no line there fails the typecheck. The machine's words — its modes, its
 * events, a move — are the contract's, which this file takes and hands on: the contract is written first and reads nothing of the
 * code. `pauseDiagram` prints it for the package's README, between `diagram:pause` markers. Pure.
 *
 * Whether a process holds the pause is a fact beside the mode, not a mode: it decides when a `lapse` is seen, and nothing else.
 */
import type { PauseEvent, PauseMode, PauseMove, PauseMoved } from '../../contracts/pause-machine.contract.ts';

export type { PauseEvent, PauseMode, PauseMove, PauseRefusal } from '../../contracts/pause-machine.contract.ts';

/** A mode a pause stands in: every mode but `none`. */
export type PausedMode = Exclude<PauseMode, 'none'>;

/** Every mode, in the order the diagram names them. */
export const PAUSE_MODES: readonly PauseMode[] = ['none', 'holding', 'draining', 'cut'];

/** Every event, each with the fact that makes it, as the diagram says it. */
export const PAUSE_EVENTS: Readonly<Record<PauseEvent, string>> = {
  put: 'paused with no timeout',
  'put-timeout': 'paused with a timeout',
  'put-now': 'paused at once',
  cut: 'cut at once',
  resume: 'resumed',
  lapse: 'the process that holds it ended',
};

/** The mode a pause that stands is in, by the timeout it gives a call in flight: none, 0, or another. */
export const pausedModeOf = (pause: { timeoutMs?: number }): PausedMode =>
  pause.timeoutMs === undefined ? 'holding' : pause.timeoutMs === 0 ? 'cut' : 'draining';

/** The mode a store is in by the pause read from its file (`pausedModeOf`); `none` where no pause stands. */
export const pauseModeOf = (pause: { timeoutMs?: number } | null): PauseMode => (pause === null ? 'none' : pausedModeOf(pause));

/** The event a pause put with `timeoutMs` is: none, one, or 0. */
export const putEvent = (timeoutMs: number | undefined): PauseEvent =>
  timeoutMs === undefined ? 'put' : timeoutMs === 0 ? 'put-now' : 'put-timeout';

/** What `event` does to a store in the mode `from` (contracts/pause-machine.contract.ts). */
export const pauseMove: PauseMoved = (from: PauseMode, event: PauseEvent): PauseMove => {
  if (event === 'put' || event === 'put-timeout' || event === 'put-now') {
    if (from !== 'none') return { kind: 'refused', as: 'Conflict' };
    return { kind: 'edge', to: event === 'put' ? 'holding' : event === 'put-timeout' ? 'draining' : 'cut' };
  }
  if (event === 'lapse') return from === 'none' ? { kind: 'stays' } : { kind: 'edge', to: 'none' };
  if (from === 'none') return { kind: 'refused', as: 'Missing' };
  if (event === 'resume') return { kind: 'edge', to: 'none' };
  return from === 'cut' ? { kind: 'stays' } : { kind: 'edge', to: 'cut' };
};

/** What each working session does under a pause in each mode, in words. */
export const SESSIONS_UNDER: Readonly<Record<PausedMode, string>> = {
  holding: 'each working session runs on to its end',
  draining: 'each working session stops when its current tool call ends, cut once the timeout passes',
  cut: 'each working session is cut at once and parks',
};

/**
 * What a pass does with the sessions' drain in each mode: `lift` it where no pause stands, `put` it at the pause's timeout where the
 * pause has one, and `leave` it as it stands under a pause with none.
 */
export const DRAIN_OF: Readonly<Record<PauseMode, 'lift' | 'put' | 'leave'>> = {
  none: 'lift',
  holding: 'leave',
  draining: 'put',
  cut: 'put',
};

/** One move the machine draws: from a mode to another, by the event that makes it. */
export type PauseEdge = { readonly from: PauseMode; readonly to: PauseMode; readonly event: PauseEvent };

/** Every move `pauseMove` makes between two modes, read off it: each mode asked each event. */
export const pauseEdges = (): PauseEdge[] =>
  PAUSE_MODES.flatMap((from) =>
    (Object.keys(PAUSE_EVENTS) as PauseEvent[]).flatMap((event) => {
      const move = pauseMove(from, event);
      return move.kind === 'edge' ? [{ from, to: move.to, event }] : [];
    }),
  );

/** The store's pause as a Mermaid state diagram: every move `pauseMove` makes, by the fact that makes it. */
export const pauseDiagram = (): string =>
  ['stateDiagram-v2', '  [*] --> none', ...pauseEdges().map((e) => `  ${e.from} --> ${e.to}: ${PAUSE_EVENTS[e.event]}`)].join('\n');
