/**
 * Whether a run's frame says time measured to the instant its list was read at (agent-orchestrator, src/runlist/runlist.ts,
 * `measuredToNow`). A RunList asked by state lays the frame's parts on each run's status (`framePartsOf`): of them, the wall
 * time (`wallMs`) and where it went (`clock`) run until `now` for a run still going — one that waits on a person or is in flight — and
 * stop where its work stopped for a finished one (`clockUntilOf`), so a finished run's stand still. A status with no state carries no
 * frame (a plain list, a run read alone). A watch compares a run leaving those two parts out exactly where this holds
 * (`runWatchVersion`), so time passing alone is no change of the run, as in Kubernetes a status is what a controller writes, never a clock
 * the server ticks.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunState } from 'objects';

/** Whether `state` is that of a run whose work has not stopped: it waits on a person, or something of it moves. */
const going = (state: RunState | undefined): boolean => state === 'waiting' || state === 'inFlight';

const measuredToNowSpec = spec<(state: RunState | undefined) => boolean>({
  ensures: {
    aRunGoingIsMeasuredToNow: {
      description: "A run that waits on a person or is in flight has its frame's wall time and clock measured to the instant of the read",
      condition: ({ input: [state], output }) => !going(state) || output,
    },
    aFinishedRunStandsStill: {
      description: "A finished run's wall time and clock stop where its work stopped, so they are not measured to the read",
      condition: ({ input: [state], output }) => state !== 'finished' || !output,
    },
    noFrameNothingMeasured: {
      description: 'A status with no state carries no frame, so nothing of it is measured to the read',
      condition: ({ input: [state], output }) => state !== undefined || !output,
    },
  },
});

/**
 * `measuredToNow`'s type, which `src/runlist/runlist.ts` takes: whether the frame of a run in `state` (`status.state`, undefined where its
 * status carries no frame) has its `wallMs` and `clock` measured to the instant its list was read at.
 */
export type MeasuredToNow = Implementation<typeof measuredToNowSpec>;
