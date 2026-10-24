/**
 * What the CLI's `decide` shows a person about a run (`GET /api/runs/:id/decision`, apps/api/src/decide/decision.ts), each type with the
 * schema `get` decodes it with.
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';
import { RunHoldingSchema, RunWaitingSchema, StringsSchema, type RunHolding, type RunWaiting } from './judged.ts';
import { StepUsedSchema, type StepUsed } from './usage.ts';

/** Mirrors `Change` in agent-orchestrator's branches/branches.ts: a file a branch changed. A binary file has null counts, never 0. */
export type Change = { path: string; from?: string; added: number | null; removed: number | null };

/** Decodes a `Change`. */
const ChangeSchema = decodes<Change>()(
  Schema.Struct({
    path: Schema.String,
    from: Schema.optionalKey(Schema.String),
    added: Schema.NullOr(Schema.Number),
    removed: Schema.NullOr(Schema.Number),
  }),
);

/** Mirrors `Group` in agent-orchestrator's branches/branches.ts: a workspace package, a top-level directory, or `(root)`. */
export type Group = { name: string; files: number; added: number; removed: number; binary: number };

/** Decodes a `Group`. */
const GroupSchema = decodes<Group>()(
  Schema.Struct({
    name: Schema.String,
    files: Schema.Number,
    added: Schema.Number,
    removed: Schema.Number,
    binary: Schema.Number,
  }),
);

/**
 * Mirrors `Radius` in agent-orchestrator's branches/branches.ts: what a branch touched, and among it what an agent reads and what decides
 * a check; `deepWorkspaces`, the base's `workspaces` globs with `**`, absent where nobody read them.
 */
export type Radius = {
  changes: Change[];
  groups: Group[];
  agentFacing: string[];
  checkAffecting: string[];
  lessons: Change[];
  deepWorkspaces?: string[];
};

/** Decodes a `Radius`. */
const RadiusSchema = decodes<Radius>()(
  Schema.Struct({
    changes: Schema.mutable(Schema.Array(ChangeSchema)),
    groups: Schema.mutable(Schema.Array(GroupSchema)),
    agentFacing: StringsSchema,
    checkAffecting: StringsSchema,
    lessons: Schema.mutable(Schema.Array(ChangeSchema)),
    deepWorkspaces: Schema.optionalKey(StringsSchema),
  }),
);

/** Mirrors `Touched` in apps/api/src/decide/decision.ts: a branch, and its radius or the sentence saying what it changed is not known. */
export type Touched = { branch: string; radius: Radius | { error: string } };

/** Decodes a `Touched`. */
const TouchedSchema = decodes<Touched>()(
  Schema.Struct({
    branch: Schema.String,
    radius: Schema.Union([RadiusSchema, Schema.Struct({ error: Schema.String })]),
  }),
);

/** Mirrors `DiffFile` in apps/api/src/decide/decision.ts: one file's unified diff, cut to the api's cap, and how many lines were cut. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** Decodes a `DiffFile`. */
const DiffFileSchema = decodes<DiffFile>()(Schema.Struct({ path: Schema.String, lines: StringsSchema, cut: Schema.Number }));

/** Mirrors `SensitiveDiff` in apps/api/src/decide/decision.ts. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/** Decodes a `SensitiveDiff`. */
const SensitiveDiffSchema = decodes<SensitiveDiff>()(
  Schema.Struct({
    branch: Schema.String,
    files: Schema.mutable(Schema.Array(DiffFileSchema)),
    error: Schema.NullOr(Schema.String),
  }),
);

/** Mirrors `Lesson` in apps/api/src/decide/decision.ts: the CLI `decide`'s lesson line without its label, and which of its three it is. */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/** Decodes a `Lesson`. */
const LessonSchema = decodes<Lesson>()(
  Schema.Struct({
    said: Schema.String,
    state: Schema.Literals(['written', 'nothing', 'unknown']),
  }),
);

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
const DecideCommandSchema = decodes<DecideCommand>()(
  Schema.Struct({
    label: Schema.Literals(['ship it', 'drop it', 'read it', 'once more', 'accept', 'merge', 'approve', 'send back', 'forget it']),
    command: Schema.String,
    said: Schema.NullOr(Schema.String),
    step: Schema.NullOr(Schema.String),
  }),
);

/**
 * Mirrors `Standing` in apps/api/src/decide/decision.ts: where one result branch stands against the base branch as git says it now — on it,
 * ahead of it by N commits, gone, or unread, `why` saying its place did not say — with the fact in the package's words and how much it
 * changed, as the CLI's `decide` prints beside the branch (`3 files: +14 −1`, or the sentence saying what it changed is not known); `stat`
 * is null for a branch with nothing past the base.
 */
export type Standing = (
  | { branch: string; where: 'on' }
  | { branch: string; where: 'ahead'; commits: number }
  | { branch: string; where: 'gone' }
  | { branch: string; where: 'unread'; why: string }
) & { said: string; stat: string | null; merge: StandingMerge | null };

/**
 * Mirrors `StandingMerge` in apps/api/src/decide/decision.ts: whether a branch ahead of the base still merges onto it as the base is now,
 * as git's `merge-tree` answers it — clean, the files it conflicts in, or why git could not say — and that in words. Null for a branch not
 * ahead.
 */
export type StandingMerge = ({ clean: true } | { clean: false; conflicts: string[] } | { error: string }) & { said: string };

/** Decodes a `StandingMerge`, each of its three with its words. */
const StandingMergeSchema = decodes<StandingMerge>()(
  Schema.Union([
    Schema.Struct({ clean: Schema.Literal(true), said: Schema.String }),
    Schema.Struct({ clean: Schema.Literal(false), conflicts: StringsSchema, said: Schema.String }),
    Schema.Struct({ error: Schema.String, said: Schema.String }),
  ]),
);

/** Mirrors `MergeWord` in agent-orchestrator: a `StandingMerge` without its words. */
export type MergeWord = { clean: true } | { clean: false; conflicts: string[] } | { error: string };

/** Decodes a `MergeWord`. */
const MergeWordSchema = decodes<MergeWord>()(
  Schema.Union([
    Schema.Struct({ clean: Schema.Literal(true) }),
    Schema.Struct({ clean: Schema.Literal(false), conflicts: StringsSchema }),
    Schema.Struct({ error: Schema.String }),
  ]),
);

/**
 * Mirrors `Collision` in agent-orchestrator: a branch of this run (`ours`) that does not merge cleanly onto another run's (`branch`, of
 * `run`), as git's `merge-tree` says it, and that in words.
 */
export type Collision = { run: string; branch: string; ours: string; merge: MergeWord; said: string };

/** Decodes a `Collision`. */
const CollisionSchema = decodes<Collision>()(
  Schema.Struct({
    run: Schema.String,
    branch: Schema.String,
    ours: Schema.String,
    merge: MergeWordSchema,
    said: Schema.String,
  }),
);

/**
 * Mirrors `Collisions` in agent-orchestrator, read at an ending's gate: whether each branch ahead merges onto the base (`onto`) as it is
 * now, the other runs in flight on it, each branch of theirs one of ours does not merge onto cleanly, the ending whose landing check
 * refused the merged tree though it merges cleanly (`semantic`), and the whole in one line.
 */
export type Collisions = {
  onto: string;
  base: (StandingMerge & { branch: string })[];
  inFlight: string[];
  colliding: Collision[];
  semantic: { step: string; check: string; sha: string; said: string } | null;
  said: string;
};

/** Decodes a `Collisions`. */
const CollisionsSchema = decodes<Collisions>()(
  Schema.Struct({
    onto: Schema.String,
    base: Schema.mutable(
      Schema.Array(
        Schema.Union([
          Schema.Struct({ branch: Schema.String, clean: Schema.Literal(true), said: Schema.String }),
          Schema.Struct({ branch: Schema.String, clean: Schema.Literal(false), conflicts: StringsSchema, said: Schema.String }),
          Schema.Struct({ branch: Schema.String, error: Schema.String, said: Schema.String }),
        ]),
      ),
    ),
    inFlight: StringsSchema,
    colliding: Schema.mutable(Schema.Array(CollisionSchema)),
    semantic: Schema.NullOr(Schema.Struct({ step: Schema.String, check: Schema.String, sha: Schema.String, said: Schema.String })),
    said: Schema.String,
  }),
);

/** The keys every `Standing` has, whichever way it stands. */
const StandingFields = { said: Schema.String, stat: Schema.NullOr(Schema.String), merge: Schema.NullOr(StandingMergeSchema) };

/** Decodes a `Standing`, each way a branch stands with the facts every one has. */
const StandingSchema = decodes<Standing>()(
  Schema.Union([
    Schema.Struct({ branch: Schema.String, where: Schema.Literal('on'), ...StandingFields }),
    Schema.Struct({ branch: Schema.String, where: Schema.Literal('ahead'), commits: Schema.Number, ...StandingFields }),
    Schema.Struct({ branch: Schema.String, where: Schema.Literal('gone'), ...StandingFields }),
    Schema.Struct({ branch: Schema.String, where: Schema.Literal('unread'), why: Schema.String, ...StandingFields }),
  ]),
);

/**
 * Mirrors `CheckoutHold` in agent-orchestrator's cap/cap.ts: the run whose ending step has the repository's own checkout, and that step.
 */
export type CheckoutHold = { run: string; step: string };

/** Decodes a `CheckoutHold`. */
const CheckoutHoldSchema = decodes<CheckoutHold>()(Schema.Struct({ run: Schema.String, step: Schema.String }));

/** Mirrors `RunSlot` in agent-orchestrator's cap/cap.ts: the runs in flight a run is held at by the cap on them, and the cap. */
export type RunSlot = { inFlight: number; cap: number };

/** Decodes a `RunSlot`. */
const RunSlotSchema = decodes<RunSlot>()(Schema.Struct({ inFlight: Schema.Number, cap: Schema.Number }));

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
  /** The run whose ending step has the repository's own checkout while this run's waits for it; absent when none holds it. */
  checkout?: CheckoutHold;
  /**
   * The run finished and nobody has decided it, as the package reads it — what the CLI's `prune` refuses without `--unmerged`: the result
   * branches, and `direct` for a run that worked on its base branch itself (its branch is the base branch). Null for a run still running
   * with a step waiting on you.
   */
  awaiting: { branches: string[]; direct: boolean } | null;
  /**
   * At an ending's gate, or an ending whose landing failed its check: the runs in flight on the base its branches collide with, and in
   * which files, and the semantic conflict; null for any other decision.
   */
  collisions: Collisions | null;
};

/** Decodes a `Decidable`. */
const DecidableSchema = decodes<Decidable>()(
  Schema.Struct({
    standings: Schema.mutable(Schema.Array(StandingSchema)),
    touched: Schema.mutable(Schema.Array(TouchedSchema)),
    lesson: LessonSchema,
    sensitive: Schema.mutable(Schema.Array(SensitiveDiffSchema)),
    used: Schema.Record(Schema.String, StepUsedSchema),
    total: StepUsedSchema,
    cost: Schema.NullOr(Schema.String),
    overBudget: Schema.NullOr(Schema.String),
    commands: Schema.mutable(Schema.Array(DecideCommandSchema)),
    checkout: Schema.optionalKey(CheckoutHoldSchema),
    awaiting: Schema.NullOr(Schema.Struct({ branches: StringsSchema, direct: Schema.Boolean })),
    collisions: Schema.NullOr(CollisionsSchema),
  }),
);

/**
 * Mirrors `RunDecision` in apps/api/src/decide/decision.ts: `waiting` for a run whose roots wait on runs not shipped — with `holding`
 * beside it for one a person holds too — `holding` alone for a run a person holds (the CLI's `hold`), which offers nothing, `running` while
 * nobody is waited on — with `held` for a run the cap on runs in flight holds — `nothing` for a run called off or shipped.
 */
export type RunDecision =
  | { waiting: RunWaiting; holding?: RunHolding }
  | { holding: RunHolding }
  | { running: true; held?: RunSlot }
  | { nothing: string }
  | Decidable;

/**
 * Decodes a `RunDecision`. A union takes the first member that decodes and drops the keys it does not know, so a run waiting and held
 * is read as waiting, with its hold, before the member of a hold alone.
 */
const RunDecisionSchema = decodes<RunDecision>()(
  Schema.Union([
    Schema.Struct({ waiting: RunWaitingSchema, holding: Schema.optionalKey(RunHoldingSchema) }),
    Schema.Struct({ holding: RunHoldingSchema }),
    Schema.Struct({ running: Schema.Literal(true), held: Schema.optionalKey(RunSlotSchema) }),
    Schema.Struct({ nothing: Schema.String }),
    DecidableSchema,
  ]),
);

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
