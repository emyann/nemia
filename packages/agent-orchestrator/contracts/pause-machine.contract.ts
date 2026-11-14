/**
 * The store's pause as a machine (agent-orchestrator, src/pause-machine/pause-machine.ts): what an event does to a store in each mode
 * (`pauseMove`). The mode is read afresh from the pause's file on every pass and by every verb (`pauseModeOf`), never carried, and the
 * verbs and the pass that write that file ask this function first (`pause/pause.store.ts`): the laws below say every answer it gives,
 * so the result is open nowhere, and the store's own test walks each pair of a mode and an event against the file.
 *
 * The machine's words are declared here and taken by the code, so this file reads nothing of `src` and stands before the code does.
 *
 * The laws are a person's: a store paused is not paused again, a pause is lifted by a resume or by its holder's end and by nothing else,
 * and a cut is never given its time back.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What a store's pause gives the sessions at work: `none` where no pause stands; `holding`, a pause with no timeout, under which each
 * runs on to its end (a take-over's own); `draining`, a pause with a timeout, under which each stops when its tool call ends and is cut
 * once the timeout passes; `cut`, a timeout of 0, under which each call is cut at once. Under each of the three nothing new starts.
 */
export type PauseMode = 'none' | 'holding' | 'draining' | 'cut';

/**
 * What moves a store's pause: a pause put with no timeout (`put`), with one (`put-timeout`) or at once (`put-now`); the timeout of the
 * pause that stands cut to 0 (`cut`); a person's resume (`resume`); and the end of the process that holds the pause (`lapse`).
 */
export type PauseEvent = 'put' | 'put-timeout' | 'put-now' | 'cut' | 'resume' | 'lapse';

/** How a move is refused: a pause that stands in the way (`Conflict`), or none to act on (`Missing`). */
export type PauseRefusal = 'Conflict' | 'Missing';

/** What an event does to a store in a mode: moves it to another, leaves it as it stands, or is refused. */
export type PauseMove =
  | { readonly kind: 'edge'; readonly to: PauseMode }
  | { readonly kind: 'stays' }
  | { readonly kind: 'refused'; readonly as: PauseRefusal };

/** The events that put a pause, each naming what the pause gives a call in flight. */
const puts = (event: PauseEvent): boolean => event === 'put' || event === 'put-timeout' || event === 'put-now';

/** Whether `move` is the move to `mode`. */
const goesTo = (move: PauseMove, mode: PauseMode): boolean => move.kind === 'edge' && move.to === mode;

/** Whether `move` is the refusal `as`. */
const refusedAs = (move: PauseMove, as: 'Conflict' | 'Missing'): boolean => move.kind === 'refused' && move.as === as;

const pauseMoveSpec = spec<(from: PauseMode, event: PauseEvent) => PauseMove>({
  ensures: {
    aPausedStoreIsNotPausedAgain: {
      description: 'A pause is refused, as a conflict, exactly on a store already paused: the pause that stands is lifted first',
      condition: ({ input: [from, event], output }) => !puts(event) || refusedAs(output, 'Conflict') === (from !== 'none'),
    },
    aPutLandsWhereItsTimeoutSays: {
      description:
        'A store not paused takes the pause it is given: with no timeout its sessions run on, with one they drain, and at once they are cut',
      condition: ({ input: [from, event], output }) =>
        from !== 'none' || !puts(event) || goesTo(output, event === 'put' ? 'holding' : event === 'put-timeout' ? 'draining' : 'cut'),
    },
    nothingToCutOrResume: {
      description: 'A cut and a resume are refused, as missing, exactly on a store no pause stands on',
      condition: ({ input: [from, event], output }) =>
        (event !== 'cut' && event !== 'resume') || refusedAs(output, 'Missing') === (from === 'none'),
    },
    aResumeLiftsWhateverStands: {
      description: 'A resume lifts the pause that stands, whatever it gives the calls in flight',
      condition: ({ input: [from, event], output }) => event !== 'resume' || from === 'none' || goesTo(output, 'none'),
    },
    aCutCutsWhateverStands: {
      description: 'A cut takes a pause whose sessions run on or drain to cut, and leaves one already cut as it stands',
      condition: ({ input: [from, event], output }) =>
        event !== 'cut' || from === 'none' || (from === 'cut' ? output.kind === 'stays' : goesTo(output, 'cut')),
    },
    aLapseLiftsAPauseAndNothingElse: {
      description: 'The end of the process that holds a pause lifts it, and on a store not paused changes nothing',
      condition: ({ input: [from, event], output }) =>
        event !== 'lapse' || (from === 'none' ? output.kind === 'stays' : goesTo(output, 'none')),
    },
    aCutIsNeverGivenItsTimeBack: {
      description: 'A pause that cut its calls moves only to no pause: nothing gives a cut call its time back',
      condition: ({ input: [from], output }) => from !== 'cut' || output.kind !== 'edge' || output.to === 'none',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type PauseMoved = Implementation<typeof pauseMoveSpec>;
