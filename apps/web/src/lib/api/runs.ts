/** Every run, as the Runs page and the Factory list them (`GET /api/runs`, apps/api/src/runs.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { get } from './read.ts';
import type { RunGraph } from './graph.ts';
import type { RunHolding, RunStatus, RunToDecide, RunWaiting, Spent, StepNeeds } from './judged.ts';

/** Mirrors `PlaceKind` in agent-orchestrator's run.ts: the kind of workspace a run's steps work in — git's worktrees, or folders the run makes. */
export type PlaceKind = 'git' | 'folder';

/** Mirrors `RunSummary` in apps/api/src/runs.ts. */
export type RunSummary = {
  id: string;
  /** The repository a git run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  place: PlaceKind;
  /** Where a folder run's work is: the directory its steps' folders are made under. Null on a git run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from: its last segment names the workflow (`workflowNameOf`). */
  workflowDir: string;
  createdAt: string;
  /**
   * When the run started: the first filing of any of its tasks, off the engine's feed — for a run started `--after` runs, or held for a run
   * slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /** The runs this one waits on (`wf start --after`), as its record froze them: the edges from their cards to its card on the Factory. */
  after: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  /** The runs a person holds this one until (`wf hold`), as its hold file names them: the edges from their cards to its card, as `after`'s are. None for a run nobody holds. */
  heldUntil: string[];
  /** The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. */
  holding: RunHolding | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it, or a step or check a tick would still file — the roots of a
   * run waiting on runs that may still ship among them, and not those of one waiting on a run that never ships without a person.
   */
  moving: boolean;
  /** What the run has cost so far, every step's tries together, as `wf ls` adds it up (`Spent`); null until a cost was measured. */
  cost: Spent | null;
  /**
   * `note` is what `wf ls` prints beside the status — the try or round a step is on, or the one due — and null where it prints nothing.
   * `needs` and `blockedByHarness` are what a person has to know to act on it (`StepNeeds`).
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null } & StepNeeds>;
  /** The steps as a graph, as the run's page has it: the Factory's card draws its flow off it, with no read of the run. */
  graph: RunGraph;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget. Empty on a cancelled run.
   */
  waitingOnYou: string[];
  /** `waitingOnYou` as `wf ls` names it after `→ waiting on you:`, one entry a step: its name, or for a step at its gate, `approve plan`. */
  onYou: string[];
  /** What a person has to decide about the run's result (`RunToDecide`); null while there is nothing — which is every run still going. */
  toDecide: RunToDecide | null;
};

/** Every run. Read again on each event of the workflow feed (`useFeed`), and every 5 s while the feed is not followed — every minute while it is. */
export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get<RunSummary[]>('/api/runs'),
  refetchInterval: () => pace(5_000),
});
