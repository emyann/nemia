/**
 * Which of a run's result branches its one judgement asks where they stand (agent-orchestrator, src/summary/judged.verb.ts,
 * `branchesAsked`): what the run object, the runs list, the tick's informer and `nemia decide` all read a run's standings, its
 * `toDecide` and its decision off, so none of them reads a branch another does not. It replaces `toDecideBranches`, which asked only a
 * succeeded run with no merging step, while `nemia decide` asked every result branch of a run neither running nor called off: an ending
 * approved first that never ran, whose work a person merged by hand, was `approve` on the board and nothing to approve on `nemia decide`.
 *
 * The pass asks git of exactly the runs that cut worktrees and were not called off (`asksOwn`, src/standing/standing.verb.ts), so a
 * branch asked here is one `standing.json` holds: a run that worked on its base branch itself is never asked of, as a branch the pass did
 * not read would read unread and keep the run's judgement from resting.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the branches asked are judged from, off the record and the run's assessment. `isolate`: the run cut worktrees of its own
 * (`Run.isolate`). `cancelled`: a person called it off (`Run.cancelledAt`). `running`: `assess` says it is `running`. `results`: its result
 * steps' branches, in the order of its steps (`resultBranches`), a branch possibly named by two steps.
 */
export type RunAsked = {
  readonly isolate: boolean;
  readonly cancelled: boolean;
  readonly running: boolean;
  readonly results: readonly string[];
};

/** A run whose standings decide something: it cut worktrees, nobody called it off, and it is no longer running. */
const decides = (r: RunAsked): boolean => r.isolate && !r.cancelled && !r.running;

const branchesAskedSpec = spec<(r: RunAsked) => readonly string[]>({
  ensures: {
    noneWhileRunning: {
      description: 'A run still running asks git nothing: nothing of it is decided on where its branches stand',
      condition: ({ input: [r], output }) => !r.running || output.length === 0,
    },
    noneCalledOff: {
      description: 'A run called off asks git nothing: there is nothing to decide about it',
      condition: ({ input: [r], output }) => !r.cancelled || output.length === 0,
    },
    noneOnTheBase: {
      description:
        'A run that worked on its base branch itself asks git nothing: its branch is the base, and no pass reads it for the run',
      condition: ({ input: [r], output }) => r.isolate || output.length === 0,
    },
    everyResultOfAFinishedRun: {
      description:
        'A run that cut worktrees, not called off and no longer running, asks of every result branch, whatever its status and whether or not a step of it merges',
      condition: ({ input: [r], output }) => !decides(r) || r.results.every((b) => output.includes(b)),
    },
    onlyResults: {
      description: 'Only a result branch of the run is asked of',
      condition: ({ input: [r], output }) => output.every((b) => r.results.includes(b)),
    },
    eachOnce: {
      description: 'Each branch is asked of once, though two result steps name it',
      condition: ({ output }) => output.every((b, i) => output.indexOf(b) === i),
    },
  },
});

/** `branchesAsked`'s type, which the code takes: it then imports nothing of tsverify. */
export type BranchesAsked = Implementation<typeof branchesAskedSpec>;
