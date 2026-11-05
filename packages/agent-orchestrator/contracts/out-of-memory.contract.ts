/**
 * Whether a step's session passed its memory limit (agent-orchestrator, src/out-of-memory/out-of-memory.ts, `outOfMemory`), off what the
 * runtime carries on the attempt (`Attempt.memory`: its limit in bytes, its peak where the kernel kept one, and how many processes the
 * kernel's OOM killer ended in its cgroup), and which knob the words that say so name: the step's own `memory:` where it names one, else
 * the daemon's default (`WF_MEMORY_LIMIT`), which is the only other place a session's limit comes from (`limitsOf`,
 * src/tick/file.verb.ts).
 *
 * The runtime carries the record and judges nothing of it; this is the orchestrator's judgement, read off the attempt on every pass,
 * never off a transition. An attempt with no record — one a former runtime ran, or one run under no limit — says nothing, and so does
 * one whose limit no process passed.
 *
 * `AttemptMemory` is written out here, as a pure file of the orchestrator writes a runtime's shape (views-words.ts), and is held equal to
 * the runtime's `MemoryUse` by a type-level check in src/runtime-client.ts. `KilledAtLimit` is what the words are written from
 * (`outOfMemoryWords`, src/out-of-memory/out-of-memory.ts). Both are imported from here by the code, as src/route/route.ts imports its
 * contracts' types.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a task's own cgroup said of its memory as an attempt ended, as the runtime's `MemoryUse` carries it. */
export type AttemptMemory = { limitBytes: number; peakBytes?: number; oomKills: number };

/**
 * A session the kernel killed a process of at its memory limit: how many it killed, the limit and the peak in bytes (the peak null where
 * the kernel kept none), and which knob raises the limit — `step`, the step's own `memory:`, or `default`, the daemon's `WF_MEMORY_LIMIT`,
 * where the step names none.
 */
export type KilledAtLimit = { kills: number; limitBytes: number; peakBytes: number | null; raise: 'step' | 'default' };

/** Whether `m` says the kernel killed a process at the limit. */
const killed = (m: AttemptMemory | undefined): boolean => m !== undefined && m.oomKills >= 1;

const outOfMemorySpec = spec<(memory: AttemptMemory | undefined, own: string | undefined) => KilledAtLimit | undefined>({
  /**
   * What the runtime records (`cgroupMemoryOf`, agent-runtime src/harness/cgroup.ts): a count of kills that is a whole number, none
   * below zero, read off the cgroup's `memory.events`, and a limit and a peak that are whole numbers of bytes, read off `memory.max` and
   * `memory.peak` (a `NaN` is no byte count, and no result could equal it). `own` is the frozen step's `memory:`, a quantity the loader
   * read, or nothing.
   */
  requires: ({ input: [memory] }) =>
    memory === undefined ||
    (Number.isInteger(memory.oomKills) &&
      memory.oomKills >= 0 &&
      Number.isInteger(memory.limitBytes) &&
      (memory.peakBytes === undefined || Number.isInteger(memory.peakBytes))),
  ensures: {
    noRecordSaysNothing: {
      description: 'An attempt with no memory record — a former journal, or a task under no limit — says nothing of memory',
      condition: ({ input: [memory], output }) => (memory === undefined ? output === undefined : true),
    },
    noKillSaysNothing: {
      description: 'An attempt whose limit no process passed says nothing of memory, whatever its peak',
      condition: ({ input: [memory], output }) => (memory !== undefined && memory.oomKills === 0 ? output === undefined : true),
    },
    aKillIsSaid: {
      description: 'An attempt in which the kernel killed a process at its limit says so',
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
    raiseTheStepsOwn: {
      description: "A step that names its own memory: is told to raise it, since the daemon's default does not reach it",
      condition: ({ input: [, own], output }) => output === undefined || own === undefined || output.raise === 'step',
    },
    elseTheDefault: {
      description: "A step that names no memory: ran under the daemon's default, and is told of WF_MEMORY_LIMIT",
      condition: ({ input: [, own], output }) => output === undefined || own !== undefined || output.raise === 'default',
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type OutOfMemory = Implementation<typeof outOfMemorySpec>;
