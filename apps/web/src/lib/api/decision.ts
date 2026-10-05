/**
 * What the CLI's `decide` shows a person about a run (`GET /api/runs/:id/decision`, apps/api/src/decide/decision.ts), each type with the
 * schema `get` decodes it with.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';
import { RunHoldingSchema, RunWaitingSchema, StringsSchema, type RunHolding, type RunWaiting } from './judged.ts';
import { StepUsedSchema, type StepUsed } from './usage.ts';

/** Mirrors `Change` in agent-orchestrator's branches/branches.ts: a file a branch changed. A binary file has null counts, never 0. */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** Decodes a `Change`. */
const ChangeSchema = Schema.Struct({
  path: Schema.String,
  from: Schema.optionalKey(Schema.String),
  added: Schema.NullOr(Schema.Number),
  removed: Schema.NullOr(Schema.Number),
}) satisfies Schema.Schema<Change>;

/** Mirrors `Group` in agent-orchestrator's branches/branches.ts: a workspace package, a top-level directory, or `(root)`. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

/** Decodes a `Group`. */
const GroupSchema = Schema.Struct({
  name: Schema.String,
  files: Schema.Number,
  added: Schema.Number,
  removed: Schema.Number,
  binary: Schema.Number,
}) satisfies Schema.Schema<Group>;

/**
 * Mirrors `Radius` in agent-orchestrator's branches/branches.ts: what a branch touched, and among it what an agent reads and what decides
 * a check.
 */
export type Radius = { changes: Change[]; groups: Group[]; agentFacing: string[]; checkAffecting: string[]; lessons: Change[] };

/** Decodes a `Radius`. */
const RadiusSchema = Schema.Struct({
  changes: Schema.mutable(Schema.Array(ChangeSchema)),
  groups: Schema.mutable(Schema.Array(GroupSchema)),
  agentFacing: StringsSchema,
  checkAffecting: StringsSchema,
  lessons: Schema.mutable(Schema.Array(ChangeSchema)),
}) satisfies Schema.Schema<Radius>;

/** Mirrors `Touched` in apps/api/src/decide/decision.ts: a branch, and its radius or why git could not read it. */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** Decodes a `Touched`. */
const TouchedSchema = Schema.Struct({
  branch: Schema.String,
  radius: Schema.Union([RadiusSchema, Schema.Struct({ error: Schema.String })]),
}) satisfies Schema.Schema<Touched>;

/** Mirrors `DiffFile` in apps/api/src/decide/decision.ts: one file's unified diff, cut to the api's cap, and how many lines were cut. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** Decodes a `DiffFile`. */
const DiffFileSchema = Schema.Struct({ path: Schema.String, lines: StringsSchema, cut: Schema.Number }) satisfies Schema.Schema<DiffFile>;

/** Mirrors `SensitiveDiff` in apps/api/src/decide/decision.ts. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/** Decodes a `SensitiveDiff`. */
const SensitiveDiffSchema = Schema.Struct({
  branch: Schema.String,
  files: Schema.mutable(Schema.Array(DiffFileSchema)),
  error: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<SensitiveDiff>;

/** Mirrors `Lesson` in apps/api/src/decide/decision.ts: the CLI `decide`'s lesson line without its label, and which of its three it is. */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/** Decodes a `Lesson`. */
const LessonSchema = Schema.Struct({
  said: Schema.String,
  state: Schema.Literals(['written', 'nothing', 'unknown']),
}) satisfies Schema.Schema<Lesson>;

/**
 * Mirrors `DecideCommand` in apps/api/src/decide/decision.ts: a command the CLI's `decide` prints. The board runs one of them itself,
 * `accept` (`acceptLoop`).
 */
export type DecideCommand = {
  label: 'ship it' | 'drop it' | 'read it' | 'once more' | 'accept' | 'merge' | 'approve' | 'send back' | 'forget it';
  command: string;
  said: string | null;
  step: string | null;
};

/** Decodes a `DecideCommand`. */
export const DecideCommandSchema = Schema.Struct({
  label: Schema.Literals(['ship it', 'drop it', 'read it', 'once more', 'accept', 'merge', 'approve', 'send back', 'forget it']),
  command: Schema.String,
  said: Schema.NullOr(Schema.String),
  step: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<DecideCommand>;

/**
 * Mirrors `Standing` in apps/api/src/decide/decision.ts: where one result branch stands against the base branch as git says it now — on it,
 * ahead of it by N commits, or gone — with the fact in the package's words and how much it changed, as the CLI's `decide` prints beside the
 * branch (git's `--shortstat`); `stat` is null where git said nothing of it.
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

/** Decodes a `StandingMerge`, each of its three with its words. */
const StandingMergeSchema = Schema.Union([
  Schema.Struct({ clean: Schema.Literal(true), said: Schema.String }),
  Schema.Struct({ clean: Schema.Literal(false), conflicts: StringsSchema, said: Schema.String }),
  Schema.Struct({ error: Schema.String, said: Schema.String }),
]) satisfies Schema.Schema<StandingMerge>;

/** The keys every `Standing` has, whichever way it stands. */
const StandingFields = { said: Schema.String, stat: Schema.NullOr(Schema.String), merge: Schema.NullOr(StandingMergeSchema) };

/** Decodes a `Standing`, each way a branch stands with the facts every one has. */
const StandingSchema = Schema.Union([
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('on'), ...StandingFields }),
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('ahead'), commits: Schema.Number, ...StandingFields }),
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('gone'), ...StandingFields }),
]) satisfies Schema.Schema<Standing>;

/** Mirrors `Decidable` in apps/api/src/decide/decision.ts. */
export type Decidable = {
  /** Where each result branch stands, and how much it changed: the facts under the run's result, as the CLI's `decide` prints them. */
  standings: Standing[];
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  total: StepUsed;
  /** What the run has cost, as the CLI's `decide` prints it after its steps, without its label; null before any attempt has ended. */
  cost: string | null;
  /** The CLI `decide`'s OVER BUDGET line: why each step held on its budget is held; null when none is. */
  overBudget: string | null;
  commands: DecideCommand[];
  /**
   * The run finished and nobody has decided it, as the package reads it — what the CLI's `prune` refuses without `--unmerged`: the result
   * branches, and `direct` for a run that worked on its base branch itself (its branch is the base branch). Null for a run still running
   * with a step waiting on you.
   */
  awaiting: { branches: string[]; direct: boolean } | null;
};

/** Decodes a `Decidable`. */
const DecidableSchema = Schema.Struct({
  standings: Schema.mutable(Schema.Array(StandingSchema)),
  touched: Schema.mutable(Schema.Array(TouchedSchema)),
  lesson: LessonSchema,
  sensitive: Schema.mutable(Schema.Array(SensitiveDiffSchema)),
  used: Schema.Record(Schema.String, StepUsedSchema),
  total: StepUsedSchema,
  cost: Schema.NullOr(Schema.String),
  overBudget: Schema.NullOr(Schema.String),
  commands: Schema.mutable(Schema.Array(DecideCommandSchema)),
  awaiting: Schema.NullOr(Schema.Struct({ branches: StringsSchema, direct: Schema.Boolean })),
}) satisfies Schema.Schema<Decidable>;

/**
 * Mirrors `RunDecision` in apps/api/src/decide/decision.ts: `waiting` for a run whose roots wait on runs not shipped — with `holding`
 * beside it for one a person holds too — `holding` alone for a run a person holds (the CLI's `hold`), which offers nothing, `running` while
 * nobody is waited on, `nothing` for a run called off or shipped.
 */
export type RunDecision =
  | { waiting: RunWaiting; holding?: RunHolding }
  | { holding: RunHolding }
  | { running: true }
  | { nothing: string }
  | Decidable;

/**
 * Decodes a `RunDecision`. A union takes the first member that decodes and drops the keys it does not know, so a run waiting and held
 * is read as waiting, with its hold, before the member of a hold alone.
 */
const RunDecisionSchema = Schema.Union([
  Schema.Struct({ waiting: RunWaitingSchema, holding: Schema.optionalKey(RunHoldingSchema) }),
  Schema.Struct({ holding: RunHoldingSchema }),
  Schema.Struct({ running: Schema.Literal(true) }),
  Schema.Struct({ nothing: Schema.String }),
  DecidableSchema,
]) satisfies Schema.Schema<RunDecision>;

/**
 * What the CLI's `decide` shows a person about a run. Read once for each state of the run, never on the page's beat: the api
 * runs `git diff` for it. `stamp` is the run's state (`decisionStamp`), so a step that moves — a retry filed and settled,
 * a round gone — reads it again, once; and while it does, the decision last read stays on the page, rather than the
 * section going blank and the canvas under it jumping up and back.
 */
export const decisionQuery = (id: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'decision', stamp],
    queryFn: () => get(`/api/runs/${encodeURIComponent(id)}/decision`, RunDecisionSchema),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
