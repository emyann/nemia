/**
 * What the login service's unit runs, against the daemon a take-over stopped (agent-orchestrator, src/service/service.ts):
 * `unitRunning`, read from the system's own word on the unit (`UnitState`: systemd's `MainPID`, launchd's `pid`), never from the
 * store's lease. The daemon lets the lease go (`stoppedAt`) as its `up` scope closes, before its process has ended; a start asked of a
 * unit whose main process is still the stopped daemon is a start of a unit already active, which systemd answers at once and does
 * nothing for, and the unit then goes inactive as that process exits (`SuccessExitStatus=143`, so `Restart=on-failure` does not start
 * it). So the take-over waits until the unit no longer runs the stopped daemon before it starts it (`takeOver`, takeover.verb.ts),
 * and a start that leaves no daemon ticking the store is refused by what the unit runs then (`startedPassed`): "was started" only where
 * the unit runs a process, and the command that starts it where it runs none.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { UnitState } from '../src/service/service.ts';

/**
 * What the unit runs: the daemon the take-over stopped (`old`), another process (`other`), no process (`none`), or the system could not
 * say (`unknown`). Implement moves it into `src/service/service.ts`, beside `UnitState`.
 */
export type UnitRunning = 'old' | 'other' | 'none' | 'unknown';

/**
 * `state` is the system's word on the unit (`systemdState`, `launchdState`), or null where the system's program could not be asked
 * (`stateOf`, service.verb.ts); `old` is the pid of the daemon the take-over signalled, or null where it signalled none (`nemia service
 * restart` where nothing ticked the store).
 */
const unitRunningSpec = spec<(state: UnitState | null, old: number | null) => UnitRunning>({
  ensures: {
    unknownExactlyWhenTheSystemCannotSay: {
      description: 'What the unit runs is unknown exactly when the system could not be asked: never guessed from the lease',
      condition: ({ input: [state], output }) => (state === null) === (output === 'unknown'),
    },
    noneExactlyWhenTheUnitHasNoProcess: {
      description: 'The unit runs nothing exactly when the system says it has no main process: what a start must change',
      condition: ({ input: [state], output }) => (state !== null && state.pid === null) === (output === 'none'),
    },
    oldExactlyWhenItsMainProcessIsTheStoppedDaemon: {
      description:
        'The unit still runs the stopped daemon exactly when its main process is the pid that was signalled: a start asked then does nothing',
      condition: ({ input: [state, old], output }) =>
        (state !== null && state.pid !== null && old !== null && state.pid === old) === (output === 'old'),
    },
    nothingStoppedIsNeverOld: {
      description: 'Where no daemon was signalled, whatever process the unit runs is never read as the stopped one',
      condition: ({ input: [, old], output }) => old !== null || output !== 'old',
    },
    anotherProcessIsOther: {
      description: 'A main process that is not the stopped daemon is another one: the unit runs, and a start was not lost',
      condition: ({ input: [state, old], output }) =>
        (state !== null && state.pid !== null && state.pid !== old) === (output === 'other'),
    },
  },
});
export type UnitRunningOf = Implementation<typeof unitRunningSpec>;
