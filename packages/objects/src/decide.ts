/**
 * A run's decision (`RunDecision`): what a person decides about a run, as the orchestrator's read model gives it (`runDecision`,
 * decide/decision.verb.ts) and `GET /api/runs/:runId/decision` serves it — the board reads it, and `nemia decide` prints its screen off the
 * same read. Data, never the lines a screen prints: each sentence it carries is the package's own, without a screen's label.
 */
import { Schema } from 'effect';
import { RunHolding, RunWaiting, StepUsed } from './run.ts';
import { DECIDE_LABELS, LESSON_STATES } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);

/** A file a branch changed (`Change`, branches.ts). A binary file has null counts, never 0. */
const Change = Schema.Struct({
  path: Schema.String,
  from: Schema.optionalKey(Schema.String),
  added: Schema.NullOr(Schema.Finite),
  removed: Schema.NullOr(Schema.Finite),
});

/** A workspace package, a top-level directory, or `(root)`, and what a branch changed in it (`Group`, branches.ts). */
const Group = Schema.Struct({
  name: Schema.String,
  files: Schema.Finite,
  added: Schema.Finite,
  removed: Schema.Finite,
  binary: Schema.Finite,
});

/**
 * What a branch touched, and among it what an agent reads and what decides a check (`Radius`, branches.ts); `deepWorkspaces`, the base's
 * `workspaces` globs with `**`, absent where nobody read them.
 */
const Radius = Schema.Struct({
  changes: List(Change),
  groups: List(Group),
  agentFacing: Strings,
  checkAffecting: Strings,
  lessons: List(Change),
  deepWorkspaces: Schema.optionalKey(Strings),
});

/** What a branch touched, or the sentence saying what it changed is not known. */
export const DecisionTouched = Schema.Struct({
  branch: Schema.String,
  radius: Schema.Union([Radius, Schema.Struct({ error: Schema.String })]),
}).annotate({ identifier: 'DecisionTouched' });
export type DecisionTouched = typeof DecisionTouched.Type;

/** One file of a branch's check-affecting diff: its unified diff, cut at the read model's cap, and how many lines were cut. */
export const DiffFile = Schema.Struct({
  path: Schema.String,
  lines: Strings,
  cut: Schema.Finite,
  /** The lines its hunks add and remove, counted over the whole diff before it is cut; absent from a decision read before them. */
  added: Schema.optionalKey(Schema.Finite),
  removed: Schema.optionalKey(Schema.Finite),
  /** Whether a narrowed decision (`decisionNarrowed`, `?diffs=`) left its `lines` out, to be asked for by its path. */
  linesLeftOut: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'DiffFile' });
export type DiffFile = typeof DiffFile.Type;

/** A branch's check-affecting diff, a file each; `error`, the sentence saying it is not known, when the place did not say. */
export const SensitiveDiff = Schema.Struct({
  branch: Schema.String,
  files: List(DiffFile),
  error: Schema.NullOr(Schema.String),
}).annotate({ identifier: 'SensitiveDiff' });
export type SensitiveDiff = typeof SensitiveDiff.Type;

/** The lesson line in the package's words, without its label, and which of its three it is (`LESSON_STATES`). */
export const Lesson = Schema.Struct({ said: Schema.String, state: Schema.Literals(LESSON_STATES) }).annotate({ identifier: 'Lesson' });
export type Lesson = typeof Lesson.Type;

/** A command `nemia decide` offers, which the board only copies: its label, the bare line, the sentence it ends, and its step. */
export const DecideCommand = Schema.Struct({
  label: Schema.Literals(DECIDE_LABELS),
  command: Schema.String,
  said: Schema.NullOr(Schema.String),
  step: Schema.NullOr(Schema.String),
}).annotate({ identifier: 'DecideCommand' });
export type DecideCommand = typeof DecideCommand.Type;

/** Whether a branch ahead merges onto the base, as git's `merge-tree` answers it — clean, conflicted, or not known — without its words. */
const mergeWords = [
  Schema.Struct({ clean: Schema.Literal(true) }),
  Schema.Struct({ clean: Schema.Literal(false), conflicts: Strings }),
  Schema.Struct({ error: Schema.String }),
] as const;

/** Whether a branch ahead of the base still merges onto it, and that in words (`StandingMerge`, merges.ts). */
export const StandingMerge = Schema.Union([
  Schema.Struct({ clean: Schema.Literal(true), said: Schema.String }),
  Schema.Struct({ clean: Schema.Literal(false), conflicts: Strings, said: Schema.String }),
  Schema.Struct({ error: Schema.String, said: Schema.String }),
]).annotate({ identifier: 'StandingMerge' });
export type StandingMerge = typeof StandingMerge.Type;

/** The keys every standing has, whichever way its branch stands. */
const standingFields = { said: Schema.String, stat: Schema.NullOr(Schema.String), merge: Schema.NullOr(StandingMerge) };

/**
 * Where one result branch stands against the base as git says it now — on it, ahead by N commits, gone, or unread — with the fact in the
 * package's words, how much it changed (`3 files: +14 −1`, null for nothing past the base) and whether it still merges (null unless ahead).
 */
export const Standing = Schema.Union([
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('on'), ...standingFields }),
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('ahead'), commits: Schema.Finite, ...standingFields }),
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('gone'), ...standingFields }),
  Schema.Struct({ branch: Schema.String, where: Schema.Literal('unread'), why: Schema.String, ...standingFields }),
]).annotate({ identifier: 'Standing' });
export type Standing = typeof Standing.Type;

/** A branch of this run (`ours`) that does not merge cleanly onto another run's (`branch`, of `run`), and that in words. */
const Collision = Schema.Struct({
  run: Schema.String,
  branch: Schema.String,
  ours: Schema.String,
  merge: Schema.Union(mergeWords),
  said: Schema.String,
});

/**
 * At an ending's decision: whether each branch ahead merges onto the base (`onto`), the other runs in flight on it, each branch of theirs
 * one of ours does not merge onto cleanly, the landing check that refused the merged tree though it merges (`semantic`), and the whole in
 * one line (`Collisions`, collide.ts).
 */
export const Collisions = Schema.Struct({
  onto: Schema.String,
  base: List(
    Schema.Union([
      Schema.Struct({ branch: Schema.String, clean: Schema.Literal(true), said: Schema.String }),
      Schema.Struct({ branch: Schema.String, clean: Schema.Literal(false), conflicts: Strings, said: Schema.String }),
      Schema.Struct({ branch: Schema.String, error: Schema.String, said: Schema.String }),
    ]),
  ),
  inFlight: Strings,
  colliding: List(Collision),
  semantic: Schema.NullOr(Schema.Struct({ step: Schema.String, check: Schema.String, sha: Schema.String, said: Schema.String })),
  said: Schema.String,
}).annotate({ identifier: 'Collisions' });
export type Collisions = typeof Collisions.Type;

/**
 * The run whose ending step works on the base branch in the repository's own working tree now, and that step (`CheckoutHold`, cap.ts):
 * what an ending of this run waits on, the base (`WAIT_ON`'s `base`).
 */
export const BaseHold = Schema.Struct({ run: Schema.String, step: Schema.String }).annotate({ identifier: 'BaseHold' });
export type BaseHold = typeof BaseHold.Type;

/** The runs in flight a run is held at by the cap on them, and the cap (`RunSlot`, cap.ts). */
export const RunSlot = Schema.Struct({ inFlight: Schema.Finite, cap: Schema.Finite }).annotate({ identifier: 'RunSlot' });
export type RunSlot = typeof RunSlot.Type;

/**
 * What there is to decide about a run: where each result branch stands, what each branch read touched, the lesson, the check-affecting
 * diffs, what each filed step consumed and their total, the run's cost and OVER BUDGET line (each the package's words without a screen's
 * label), the commands, the run whose ending holds the base this run's ending waits on (`baseHeldBy`), what the finished run awaits
 * (`direct` for one that worked on its base branch itself; null for a run still running with a step waiting on you), and the collisions
 * read at an ending's decision.
 */
export const Decidable = Schema.Struct({
  standings: List(Standing),
  touched: List(DecisionTouched),
  lesson: Lesson,
  sensitive: List(SensitiveDiff),
  used: Schema.Record(Schema.String, StepUsed),
  total: StepUsed,
  cost: Schema.NullOr(Schema.String),
  overBudget: Schema.NullOr(Schema.String),
  commands: List(DecideCommand),
  baseHeldBy: Schema.optionalKey(BaseHold),
  awaiting: Schema.NullOr(Schema.Struct({ branches: Strings, direct: Schema.Boolean })),
  collisions: Schema.NullOr(Collisions),
}).annotate({ identifier: 'Decidable' });
export type Decidable = typeof Decidable.Type;

/**
 * A run's decision, in one order: `nothing`, in the package's words, for a run called off; `waiting` for a run whose roots wait on runs
 * that have not landed, with the hold beside it for one a person holds too; `holding` alone for a run a person holds, which offers
 * nothing; `running` while it runs and nobody is waited on, `held` beside it for a run the cap on runs in flight holds; `nothing` for a
 * run whose branches are already on its base; else what there is to decide (`Decidable`). A union of members told apart by their keys,
 * the first that decodes taken: a run waiting and held reads as waiting, with its hold.
 */
export const RunDecision = Schema.Union([
  Schema.Struct({ waiting: RunWaiting, holding: Schema.optionalKey(RunHolding) }),
  Schema.Struct({ holding: RunHolding }),
  Schema.Struct({ running: Schema.Literal(true), held: Schema.optionalKey(RunSlot) }),
  Schema.Struct({ nothing: Schema.String }),
  Decidable,
]).annotate({ identifier: 'RunDecision' });
export type RunDecision = typeof RunDecision.Type;

/**
 * `decision` read narrowly, as `?diffs=` asks it (comma-separated paths, an empty one naming none): each check-affecting file's diff
 * answered whole where `diffs` names its path, every other with its lines left out (`linesLeftOut`), its path and its counts kept.
 * Anything but a decidable run is answered as it is. Pure.
 */
export const decisionNarrowed = (decision: RunDecision, diffs: readonly string[]): RunDecision =>
  'sensitive' in decision
    ? {
        ...decision,
        sensitive: decision.sensitive.map((branch) => ({
          ...branch,
          files: branch.files.map((file) => (diffs.includes(file.path) ? file : { ...file, lines: [], linesLeftOut: true })),
        })),
      }
    : decision;
