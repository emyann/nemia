/** What `wf decide` shows a person about a run (`GET /api/runs/:id/decision`, apps/api/src/decide/decision.ts). */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { RunHolding, RunWaiting } from './judged.ts';
import type { StepUsed } from './usage.ts';

/** Mirrors `Change` in agent-orchestrator's radius.ts: a file a branch changed. A binary file has null counts, never 0. */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** Mirrors `Group` in agent-orchestrator's radius.ts: a workspace package, a top-level directory, or `(root)`. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

/** Mirrors `Radius` in agent-orchestrator's radius.ts: what a branch touched, and among it what an agent reads and what decides a check. */
export type Radius = { changes: Change[]; groups: Group[]; agentFacing: string[]; checkAffecting: string[]; lessons: Change[] };

/** Mirrors `Touched` in apps/api/src/decide/decision.ts: a branch, and its radius or why git could not read it. */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** Mirrors `DiffFile` in apps/api/src/decide/decision.ts: one file's unified diff, cut to the api's cap, and how many lines were cut. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** Mirrors `SensitiveDiff` in apps/api/src/decide/decision.ts. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/** Mirrors `Lesson` in apps/api/src/decide/decision.ts: `wf decide`'s lesson line without its label, and which of its three it is. */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/**
 * Mirrors `DecideCommand` in apps/api/src/decide/decision.ts: a command `wf decide` prints. The board runs one of them itself, `accept`
 * (`acceptLoop`).
 */
export type DecideCommand = {
  label: 'ship it' | 'drop it' | 'read it' | 'once more' | 'accept' | 'approve' | 'send back' | 'forget it';
  command: string;
  said: string | null;
};

/**
 * Mirrors `Standing` in apps/api/src/decide/decision.ts: where one result branch stands against the base branch as git says it now — on it,
 * ahead of it by N commits, or gone — with the fact in the package's words and how much it changed, as `wf decide` prints beside the branch
 * (git's `--shortstat`); `stat` is null where git said nothing of it.
 */
export type Standing = (
  | { branch: string; where: 'on' }
  | { branch: string; where: 'ahead'; commits: number }
  | { branch: string; where: 'gone' }
) & { said: string; stat: string | null; merge: StandingMerge | null };

/**
 * Mirrors `StandingMerge` in apps/api/src/decide/decision.ts: whether a branch ahead of the base still merges onto it as the base is now,
 * as git's `merge-tree` answers it — clean, the files it conflicts in, or why git could not say — and that in words. Null for a branch not
 * ahead.
 */
export type StandingMerge = ({ clean: true } | { clean: false; conflicts: string[] } | { error: string }) & { said: string };

/** Mirrors `Decidable` in apps/api/src/decide/decision.ts. */
export type Decidable = {
  /** Where each result branch stands, and how much it changed: the facts under the run's result, as `wf decide` prints them. */
  standings: Standing[];
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  total: StepUsed;
  /** What the run has cost, as `wf decide` prints it after its steps, without its label; null before any attempt has ended. */
  cost: string | null;
  /** `wf decide`'s OVER BUDGET line: why each step held on its budget is held; null when none is. */
  overBudget: string | null;
  commands: DecideCommand[];
  /**
   * The run finished and nobody has decided it, as the package reads it — what `wf prune` refuses without `--unmerged`: the result branches,
   * and `direct` for a run that worked on its base branch itself (its branch is the base branch). Null for a run still running with a step waiting on you.
   */
  awaiting: { branches: string[]; direct: boolean } | null;
};

/**
 * Mirrors `RunDecision` in apps/api/src/decide/decision.ts: `waiting` for a run whose roots wait on runs not shipped — with `holding`
 * beside it for one a person holds too — `holding` alone for a run a person holds (`wf hold`), which offers nothing, `running` while nobody
 * is waited on, `nothing` for a run called off or shipped.
 */
export type RunDecision =
  | { waiting: RunWaiting; holding?: RunHolding }
  | { holding: RunHolding }
  | { running: true }
  | { nothing: string }
  | Decidable;

/**
 * What `wf decide` shows a person about a run. Read once for each state of the run, never on the page's beat: the api
 * runs `git diff` for it. `stamp` is the run's state (`decisionStamp`), so a step that moves — a retry filed and settled,
 * a round gone — reads it again, once; and while it does, the decision last read stays on the page, rather than the
 * section going blank and the canvas under it jumping up and back.
 */
export const decisionQuery = (id: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'decision', stamp],
    queryFn: () => get<RunDecision>(`/api/runs/${encodeURIComponent(id)}/decision`),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
