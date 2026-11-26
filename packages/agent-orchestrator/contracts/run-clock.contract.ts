/**
 * Where a going run's wall time went, measured to the read from what its status record holds (agent-orchestrator,
 * src/run-status/run-status.ts, `clockNow`). The daemon's pass writes a run's observed status to `/registry/runstatus/<id>` only when it
 * differs from the record (`recordDue`, observed.contract.ts), so the times measured to the read are left out of what is compared: the
 * record holds the clock as measured at the instant it was written (`at`) and the one part of it that grows while nothing else of the
 * status moves (`growing`: the sessions while one is at work, else the checks, else a person's turn, else the slot, else the rest). A
 * read lays the clock to its own instant: the time passed since `at` goes to the growing part and to the wall time, and every other part
 * stands still, so the five still add up to the wall time. A change of which part grows is a change of the record, written by the next
 * pass. A clock read before `at` (a clock set back) gains nothing. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunClock } from 'objects';

/** A part of a run's clock that grows with time: every key of `RunClock` but the wall time, which grows with whichever does. */
export type ClockPart = 'sessionsMs' | 'checksMs' | 'personMs' | 'slotMs' | 'restMs';

/** The most milliseconds a clock or an instant is taken to hold here: far past any run, and summed with another still exact. */
const MOST = 1e15;

/** Whether `ms` is a whole number of milliseconds a clock may hold. */
const held = (ms: number) => Number.isInteger(ms) && ms >= 0 && ms <= MOST;

/** The milliseconds passed from `at` to `now`, none where `now` is before it. */
const elapsed = (at: number, now: number) => (now > at ? now - at : 0);

/** Whether `part` stands where it stood: it is not the growing one, and is as recorded. */
const stands = (recorded: RunClock, output: RunClock, growing: ClockPart, part: ClockPart) =>
  part === growing || output[part] === recorded[part];

const clockNowSpec = spec<(recorded: RunClock, growing: ClockPart, at: number, now: number) => RunClock>({
  requires: ({ input: [recorded, , at, now] }) =>
    held(recorded.wallMs) &&
    held(recorded.sessionsMs) &&
    held(recorded.checksMs) &&
    held(recorded.personMs) &&
    held(recorded.slotMs) &&
    held(recorded.restMs) &&
    held(at) &&
    held(now),
  ensures: {
    theGrowingPartGainsTheTimePassed: {
      description: 'The part that grows gains exactly the time passed since the record was written, none for a clock read before it',
      condition: ({ input: [recorded, growing, at, now], output }) => output[growing] === recorded[growing] + elapsed(at, now),
    },
    theWallTimeGainsTheTimePassed: {
      description: 'The wall time gains exactly the time passed since the record was written, none for a clock read before it',
      condition: ({ input: [recorded, , at, now], output }) => output.wallMs === recorded.wallMs + elapsed(at, now),
    },
    everyOtherPartStandsStill: {
      description: 'Every part but the growing one is what the record holds',
      condition: ({ input: [recorded, growing], output }) =>
        stands(recorded, output, growing, 'sessionsMs') &&
        stands(recorded, output, growing, 'checksMs') &&
        stands(recorded, output, growing, 'personMs') &&
        stands(recorded, output, growing, 'slotMs') &&
        stands(recorded, output, growing, 'restMs'),
    },
  },
});

/**
 * `clockNow`'s type, which `src/run-status/run-status.ts` takes: the clock a status record holds (`recorded`, measured at `at`, epoch ms)
 * laid to the instant of the read (`now`, epoch ms), the time passed given to `growing`.
 */
export type ClockNow = Implementation<typeof clockNowSpec>;
