/**
 * Whether the kernel's OOM killer ended a process of a step's session or check (agent-orchestrator, src/out-of-memory/out-of-memory.ts,
 * `outOfMemory`), and whose memory ran out: the task's own limit, or the machine's. Read off what the runtime carries on the attempt
 * (`Attempt.memory`: its limit in bytes, its peak where the kernel kept one, how many processes of its cgroup any OOM killer ended
 * (`oomKills`, `memory.events`' `oom_kill`), and how many times the cgroup's own limit was reached (`oom`, `memory.events`' `oom`)).
 *
 * A kill with the limit reached is the limit's, and names the knob that raises it: the step's own `memory:` where it names one, else the
 * daemon's default (`WF_MEMORY_LIMIT`), the only other place a session's limit comes from (`limitsOf`, src/tick/file.verb.ts). A kill with
 * the limit never reached is the machine's: its OOM killer ended a process of the cgroup while the whole machine ran out, and no limit
 * knob would have saved it, so none is named. A record written before the runtime carried `oom` reads as it read then, the limit's.
 *
 * The runtime carries the record and judges nothing of it; this is the orchestrator's judgement, read off the attempt on every pass,
 * never off a transition. An attempt with no record — one a former runtime ran, or one run under no limit — says nothing, and so does
 * one in which no process was killed.
 *
 * `AttemptMemory` is written out here, as a pure file of the orchestrator writes a runtime's shape (views-words.ts), and is held equal to
 * the runtime's `MemoryUse` by a type-level check in src/runtime-client.ts. `OutOfMemoryKill` is what the words are written from
 * (`outOfMemoryWords`, src/out-of-memory/out-of-memory.ts) and what the run's `retries:` reads to run a check again rather than continue
 * its session (`retriesDue`, src/retry/retry.ts). Both are imported from here by the code, as src/route/route.ts imports its contracts'
 * types.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What a task's own cgroup said of its memory as an attempt ended, as the runtime's `MemoryUse` carries it: `oom` absent on a record a
 * runtime wrote before it carried the count.
 */
export type AttemptMemory = { limitBytes: number; peakBytes?: number; oomKills: number; oom?: number };

/**
 * A session or a check the kernel's OOM killer ended a process of: how many it killed, the limit and the peak in bytes (the peak null
 * where the kernel kept none), and whose memory ran out — `limit`, the task's own, with the knob that raises it (`step`, the step's own
 * `memory:`, or `default`, the daemon's `WF_MEMORY_LIMIT`, where the step names none); or `machine`, the whole machine's, which no limit
 * knob raises.
 */
export type OutOfMemoryKill =
  | { by: 'limit'; kills: number; limitBytes: number; peakBytes: number | null; raise: 'step' | 'default' }
  | { by: 'machine'; kills: number; limitBytes: number; peakBytes: number | null };

/** Whether `m` says the kernel's OOM killer ended a process of the cgroup, whoever's memory ran out. */
const killed = (m: AttemptMemory | undefined): boolean => m !== undefined && m.oomKills >= 1;

/** Whether `m` says the cgroup's own limit was reached: a record that predates the count (`oom` absent) is read as it was then, yes. */
const limitReached = (m: AttemptMemory): boolean => m.oom === undefined || m.oom >= 1;

const outOfMemorySpec = spec<(memory: AttemptMemory | undefined, own: string | undefined) => OutOfMemoryKill | undefined>({
  /**
   * What the runtime records (`cgroupMemoryOf`, agent-runtime src/harness/cgroup.ts): counts of kills and of the limit reached that are
   * whole numbers, none below zero, read off the cgroup's `memory.events`, and a limit and a peak that are whole numbers of bytes, read
   * off `memory.max` and `memory.peak` (a `NaN` is no byte count, and no result could equal it). `own` is the frozen step's `memory:`, a
   * quantity the loader read, or nothing.
   */
  requires: ({ input: [memory] }) =>
    memory === undefined ||
    (Number.isInteger(memory.oomKills) &&
      memory.oomKills >= 0 &&
      (memory.oom === undefined || (Number.isInteger(memory.oom) && memory.oom >= 0)) &&
      Number.isInteger(memory.limitBytes) &&
      (memory.peakBytes === undefined || Number.isInteger(memory.peakBytes))),
  ensures: {
    noRecordSaysNothing: {
      description: 'An attempt with no memory record — a former journal, or a task under no limit — says nothing of memory',
      condition: ({ input: [memory], output }) => (memory === undefined ? output === undefined : true),
    },
    noKillSaysNothing: {
      description: 'An attempt in which no process was killed says nothing of memory, whatever its peak and however often its limit was reached',
      condition: ({ input: [memory], output }) => (memory !== undefined && memory.oomKills === 0 ? output === undefined : true),
    },
    aKillIsSaid: {
      description: "An attempt in which the kernel's OOM killer ended a process says so",
      condition: ({ input: [memory], output }) => (killed(memory) ? output !== undefined : true),
    },
    saidAsRecorded: {
      description: 'What it says is what the runtime recorded: the kills, the limit, and the peak or null where none was kept',
      condition: ({ input: [memory], output }) =>
        output === undefined ||
        (memory !== undefined &&
          output.kills === memory.oomKills &&
          output.limitBytes === memory.limitBytes &&
          output.peakBytes === (memory.peakBytes ?? null)),
    },
    theLimitsWhenItWasReached: {
      description: "A kill in a cgroup whose own limit was reached is the limit's",
      condition: ({ input: [memory], output }) =>
        output === undefined || memory === undefined || memory.oom === undefined || memory.oom < 1 || output.by === 'limit',
    },
    aFormerRecordReadsAsBefore: {
      description: "A kill on a record written before the runtime carried oom is the limit's, as it was said then",
      condition: ({ input: [memory], output }) =>
        output === undefined || memory === undefined || memory.oom !== undefined || output.by === 'limit',
    },
    theMachinesWhenItWasNot: {
      description: "A kill in a cgroup whose own limit was never reached is the machine's",
      condition: ({ input: [memory], output }) =>
        output === undefined || memory === undefined || limitReached(memory) || output.by === 'machine',
    },
    raiseTheStepsOwn: {
      description: "A kill at the limit of a step that names its own memory: tells it to raise that, since the daemon's default does not reach it",
      condition: ({ input: [, own], output }) => output === undefined || output.by !== 'limit' || own === undefined || output.raise === 'step',
    },
    elseTheDefault: {
      description: "A kill at the limit of a step that names no memory: ran under the daemon's default, and is told of WF_MEMORY_LIMIT",
      condition: ({ input: [, own], output }) =>
        output === undefined || output.by !== 'limit' || own !== undefined || output.raise === 'default',
    },
    theMachinesNamesNoLimitKnob: {
      description: "A kill of the machine's names no limit to raise: neither the step's memory: nor WF_MEMORY_LIMIT would have saved it",
      condition: ({ output }) => output === undefined || output.by !== 'machine' || !('raise' in output),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type OutOfMemory = Implementation<typeof outOfMemorySpec>;
