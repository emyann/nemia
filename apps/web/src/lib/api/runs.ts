/** Every run, as the Runs page and the Factory list them (`GET /api/runs`, apps/api/src/runs/runs.ts). */
import { queryOptions } from '@tanstack/react-query';
import { pace } from '../feed.ts';
import { get } from './read.ts';
import type { RunGraph } from './graph.ts';
import type { RunHolding, RunStatus, RunToDecide, RunWaiting, Spent, StepNeeds } from './judged.ts';

/** Mirrors `PlaceKind` in agent-orchestrator's record/record.ts: the kind of workspace a run's steps work in — git's worktrees, or folders the run makes. */
export type PlaceKind = 'git' | 'folder';

/** Mirrors `RunSummary` in apps/api/src/runs/runs.ts. */
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
  /** The agent it tried, for a try started from an agent's page; null for every other run. */
  try: { agent: string } | null;
  createdAt: string;
  /**
   * When the run started: the first filing of any of its tasks, off the engine's feed — for a run started `--after` runs, or held for a run
   * slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That `wf prune` removed the run's worktrees, and its files too once `--artifacts` did, in `wf prune`'s words — what it removed and what it
   * kept — for the mark beside its status; null on a run never pruned.
   */
  pruned: { said: string } | null;
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
  /**
   * Why the run is not judged, when a task it reads has a journal that does not read, in the runtime's words; null for every run whose
   * tasks read. Such a run is answered off its record alone: `running`, moving, the unreadable step's status `unreadable`.
   */
  unreadable: string | null;
};

/** Every run. Read again on each event of the workflow feed (`useFeed`), and every 5 s while the feed is not followed — every minute while it is. */
export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get<RunSummary[]>('/api/runs'),
  refetchInterval: () => pace(5_000),
});

/**
 * Remove a try's run, as `wf rm` removes it: its record, and the folders it worked in. The api removes only a try, and not one still in flight;
 * rejects with its refusal in full — the package's words, which say to cancel it first — or the api's own about the request.
 */
export async function removeRun(id: string): Promise<{ id: string; removed: true }> {
  const route = `/api/runs/${encodeURIComponent(id)}`;
  const res = await fetch(route, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = (await res.json().catch(() => undefined)) as { removed?: unknown; error?: unknown } | undefined;
  if (res.ok && body?.removed === true) return { id, removed: true };
  throw new Error(typeof body?.error === 'string' ? body.error : `DELETE ${route} answered ${res.status} ${res.statusText}`);
}

/**
 * Lift a person's hold on a run, as `wf hold <run> --off` lifts it: the hold's file removed, and the run goes on at the next tick. Rejects
 * with the api's refusal in full — the package's words for a run nobody holds — or its own about the request.
 */
export async function liftHold(id: string): Promise<{ id: string; lifted: true }> {
  const route = `/api/runs/${encodeURIComponent(id)}/hold`;
  const res = await fetch(route, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = (await res.json().catch(() => undefined)) as { lifted?: unknown; error?: unknown } | undefined;
  if (res.ok && body?.lifted === true) return { id, lifted: true };
  throw new Error(typeof body?.error === 'string' ? body.error : `DELETE ${route} answered ${res.status} ${res.statusText}`);
}

/** What a prune gives back beyond the run's worktrees, as `wf prune` takes it: `--artifacts`, its files; `--unmerged`, a run nobody merged. */
export type PruneHow = { artifacts: boolean; unmerged: boolean };

/** What the api answers a prune with: `wf prune`'s lines, and how many places it could not remove (`left`), which those lines name. */
export type Pruned = { id: string; pruned: true; lines: string[]; left: number };

/**
 * Prune a finished run, as `wf prune <run> --yes` does: its worktrees removed, and its files with `artifacts`; a run nobody merged only with
 * `unmerged`. No branch is deleted. Rejects with the api's refusal in full — the package's words for a run not over, one already pruned, or
 * one nobody merged — or its own about the request.
 */
export async function pruneRun(id: string, how: PruneHow): Promise<Pruned> {
  const route = `/api/runs/${encodeURIComponent(id)}/prune`;
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(how) });
  const body = (await res.json().catch(() => undefined)) as
    | { pruned?: unknown; lines?: unknown; left?: unknown; error?: unknown }
    | undefined;
  if (res.ok && body?.pruned === true) {
    const lines = Array.isArray(body.lines) ? body.lines.filter((line): line is string => typeof line === 'string') : [];
    return { id, pruned: true, lines, left: Array.isArray(body.left) ? body.left.length : 0 };
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST ${route} answered ${res.status} ${res.statusText}`);
}
