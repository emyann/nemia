/**
 * A run's decision (`RunDecision`): what a person decides about a run, as the orchestrator's read model gives it (`runDecision`,
 * decide/decision.verb.ts) and `GET /api/runs/:runId/decision` serves it — the board reads it, and `nemia decide` prints its screen off the
 * same read. Data, never the lines a screen prints: each sentence it carries is the package's own, without a screen's label.
 */
import { Schema } from 'effect';
import { BaseHold, RunHolding, RunWaiting, StepUsed } from './run.ts';
import { DECIDE_LABELS, LESSON_STATES } from './words.ts';

const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);

/** A file a branch changed (`Change`, branches.ts). A binary file has null counts, never 0. */
const Change = Schema.Struct({
  path: Schema.String.annotate({ description: 'The file, by its path in the repository.' }),
  from: Schema.optionalKey(Schema.String.annotate({ description: 'Where a renamed file came from; absent for one not renamed.' })),
  added: Schema.NullOr(Schema.Finite).annotate({ description: 'The lines it added; null for a binary file, which has no line counts.' }),
  removed: Schema.NullOr(Schema.Finite).annotate({
    description: 'The lines it removed; null for a binary file, which has no line counts.',
  }),
});

/** A workspace package, a top-level directory, or `(root)`, and what a branch changed in it (`Group`, branches.ts). */
const Group = Schema.Struct({
  name: Schema.String.annotate({ description: 'The workspace package, top-level directory or (root) it is.' }),
  files: Schema.Finite.annotate({ description: 'How many files the branch changed in it.' }),
  added: Schema.Finite.annotate({ description: 'The lines the branch added in it.' }),
  removed: Schema.Finite.annotate({ description: 'The lines the branch removed in it.' }),
  binary: Schema.Finite.annotate({ description: 'How many of its changed files are binary.' }),
});

/**
 * What a branch touched, and among it what an agent reads and what decides a check (`Radius`, branches.ts); `deepWorkspaces`, the base's
 * `workspaces` globs with `**`, absent where nobody read them.
 */
const Radius = Schema.Struct({
  changes: List(Change).annotate({ description: 'Each file the branch changed, with its line counts.' }),
  groups: List(Group).annotate({ description: 'The parts of the repository the branch touched, with what it changed in each.' }),
  agentFacing: Strings.annotate({ description: 'The changed files an agent reads.' }),
  checkAffecting: Strings.annotate({ description: 'The changed files that decide a check.' }),
  lessons: List(Change).annotate({ description: 'The changes to a file where the next agent reads, for the lesson line.' }),
  deepWorkspaces: Schema.optionalKey(
    Strings.annotate({ description: "The base's workspaces globs that have **, as written; absent where nobody read them." }),
  ),
});

/** What a branch touched, or the sentence saying what it changed is not known. */
export const DecisionTouched = Schema.Struct({
  branch: Schema.String.annotate({ description: 'The branch read.' }),
  radius: Schema.Union([
    Radius,
    Schema.Struct({ error: Schema.String.annotate({ description: 'The sentence saying what the branch changed is not known.' }) }),
  ]).annotate({
    description:
      'What the branch touched: its files and their counts, its groups, what an agent reads and what decides a check; or the sentence saying it is not known.',
  }),
}).annotate({ identifier: 'DecisionTouched' });
export type DecisionTouched = typeof DecisionTouched.Type;

/** One file of a branch's check-affecting diff: its unified diff, cut at the read model's cap, and how many lines were cut. */
export const DiffFile = Schema.Struct({
  path: Schema.String.annotate({ description: 'The file, by its path in the repository.' }),
  lines: Strings.annotate({ description: "Its unified diff, a line each, cut at the read's cap; empty where its lines were left out." }),
  cut: Schema.Finite.annotate({ description: 'How many lines of its diff were cut.' }),
  /** The lines its hunks add and remove, counted over the whole diff before it is cut; absent from a decision read before them. */
  added: Schema.optionalKey(
    Schema.Finite.annotate({
      description: 'The lines its hunks add, counted over the whole diff before it is cut; absent from a decision read before them.',
    }),
  ),
  removed: Schema.optionalKey(
    Schema.Finite.annotate({
      description: 'The lines its hunks remove, counted over the whole diff before it is cut; absent from a decision read before them.',
    }),
  ),
  /** Whether a narrowed decision (`decisionNarrowed`, `?diffs=`) left its `lines` out, to be asked for by its path. */
  linesLeftOut: Schema.optionalKey(
    Schema.Boolean.annotate({
      description: 'Whether the read left its lines out, to be asked for by its path (`?diffs=<path>`); absent where it did not.',
    }),
  ),
}).annotate({ identifier: 'DiffFile' });
export type DiffFile = typeof DiffFile.Type;

/** A branch's check-affecting diff, a file each; `error`, the sentence saying it is not known, when the place did not say. */
export const SensitiveDiff = Schema.Struct({
  branch: Schema.String.annotate({ description: 'The branch whose diff this is.' }),
  files: List(DiffFile).annotate({ description: 'Each file of its check-affecting diff.' }),
  error: Schema.NullOr(Schema.String).annotate({
    description: 'The sentence saying its diff is not known, where the place did not say; null where it is.',
  }),
}).annotate({ identifier: 'SensitiveDiff' });
export type SensitiveDiff = typeof SensitiveDiff.Type;

/** The lesson line in the package's words, without its label, and which of its three it is (`LESSON_STATES`). */
export const Lesson = Schema.Struct({
  said: Schema.String.annotate({ description: "The lesson line in the package's words, without its label." }),
  state: Schema.Literals(LESSON_STATES).annotate({
    description: 'Which of its three the line is: written where the next agent reads, nothing, or unknown.',
  }),
}).annotate({
  identifier: 'Lesson',
  description:
    'The lesson line of the decision: whether the run wrote a lesson where the next agent reads, in words, and which of its three states it is.',
});
export type Lesson = typeof Lesson.Type;

/** A command `nemia decide` offers, which the board only copies: its label, the bare line, the sentence it ends, and its step. */
export const DecideCommand = Schema.Struct({
  label: Schema.Literals(DECIDE_LABELS).annotate({
    description:
      'What the command does, as nemia decide labels it: merge it, drop it, read it, once more, refresh, approve, send back, forget it.',
  }),
  command: Schema.String.annotate({ description: 'The bare line to type.' }),
  said: Schema.NullOr(Schema.String).annotate({ description: 'The sentence the line ends, where it has one; null otherwise.' }),
  step: Schema.NullOr(Schema.String).annotate({ description: 'The step the command acts on; null for one about the whole run.' }),
}).annotate({ identifier: 'DecideCommand' });
export type DecideCommand = typeof DecideCommand.Type;

/** Whether a branch ahead merges onto the base, as git's `merge-tree` answers it — clean, conflicted, or not known — without its words. */
const mergeWords = [
  Schema.Struct({ clean: Schema.Literal(true).annotate({ description: 'The branch merges cleanly.' }) }),
  Schema.Struct({
    clean: Schema.Literal(false).annotate({ description: 'The branch does not merge cleanly.' }),
    conflicts: Strings.annotate({ description: 'The files that conflict.' }),
  }),
  Schema.Struct({ error: Schema.String.annotate({ description: 'The sentence saying whether it merges is not known.' }) }),
] as const;

const mergeClean = Schema.Literal(true).annotate({ description: 'The branch merges cleanly.' });
const mergeConflicted = Schema.Literal(false).annotate({ description: 'The branch does not merge cleanly.' });
const mergeConflicts = Strings.annotate({ description: 'The files that conflict.' });
const mergeError = Schema.String.annotate({ description: 'The sentence saying whether it merges is not known.' });
const mergeSaid = Schema.String.annotate({ description: 'Whether it merges, in words.' });

/** Whether a branch ahead of the base still merges onto it, and that in words (`StandingMerge`, merges.ts). */
export const StandingMerge = Schema.Union([
  Schema.Struct({ clean: mergeClean, said: mergeSaid }),
  Schema.Struct({ clean: mergeConflicted, conflicts: mergeConflicts, said: mergeSaid }),
  Schema.Struct({ error: mergeError, said: mergeSaid }),
]).annotate({
  identifier: 'StandingMerge',
  description: 'Whether a branch ahead of the base still merges onto it: clean, with its conflicts, or not known, and that in words.',
});
export type StandingMerge = typeof StandingMerge.Type;

/** The keys every standing has, whichever way its branch stands. */
const standingFields = {
  said: Schema.String.annotate({ description: "The fact of where the branch stands, in the package's words." }),
  stat: Schema.NullOr(Schema.String).annotate({ description: 'How much it changed, as 3 files: +14 −1; null for nothing past the base.' }),
  merge: Schema.NullOr(StandingMerge).annotate({ description: 'Whether it still merges onto the base; null unless it is ahead.' }),
};
const standingBranch = Schema.String.annotate({ description: 'The result branch.' });

/**
 * Where one result branch stands against the base as git says it now — on it, ahead by N commits, gone, or unread — with the fact in the
 * package's words, how much it changed (`3 files: +14 −1`, null for nothing past the base) and whether it still merges (null unless ahead).
 */
export const Standing = Schema.Union([
  Schema.Struct({
    branch: standingBranch,
    where: Schema.Literal('on').annotate({ description: 'The branch is on the base.' }),
    ...standingFields,
  }),
  Schema.Struct({
    branch: standingBranch,
    where: Schema.Literal('ahead').annotate({ description: 'The branch is ahead of the base.' }),
    commits: Schema.Finite.annotate({ description: 'How many commits it is ahead by.' }),
    ...standingFields,
  }),
  Schema.Struct({
    branch: standingBranch,
    where: Schema.Literal('gone').annotate({ description: 'The branch is gone.' }),
    ...standingFields,
  }),
  Schema.Struct({
    branch: standingBranch,
    where: Schema.Literal('unread').annotate({ description: 'Git did not say where the branch stands.' }),
    why: Schema.String.annotate({ description: 'Why it was not read.' }),
    ...standingFields,
  }),
]).annotate({ identifier: 'Standing' });
export type Standing = typeof Standing.Type;

/** A branch of this run (`ours`) that does not merge cleanly onto another run's (`branch`, of `run`), and that in words. */
const Collision = Schema.Struct({
  run: Schema.String.annotate({ description: 'The other run, by id.' }),
  branch: Schema.String.annotate({ description: "The other run's branch that this run's does not merge onto cleanly." }),
  ours: Schema.String.annotate({ description: "This run's branch that does not merge onto it cleanly." }),
  merge: Schema.Union(mergeWords).annotate({ description: 'Whether they merge: clean, with its conflicts, or not known.' }),
  said: Schema.String.annotate({ description: 'The collision in words.' }),
});

const collisionBranch = Schema.String.annotate({ description: 'The branch ahead of the base.' });

/**
 * At an ending's decision: whether each branch ahead merges onto the base (`onto`), the other runs in flight on it, each branch of theirs
 * one of ours does not merge onto cleanly, the landing check that refused the merged tree though it merges (`semantic`), and the whole in
 * one line (`Collisions`, collide.ts).
 */
export const Collisions = Schema.Struct({
  onto: Schema.String.annotate({ description: 'The base branch the run lands onto.' }),
  base: List(
    Schema.Union([
      Schema.Struct({ branch: collisionBranch, clean: mergeClean, said: mergeSaid }),
      Schema.Struct({ branch: collisionBranch, clean: mergeConflicted, conflicts: mergeConflicts, said: mergeSaid }),
      Schema.Struct({ branch: collisionBranch, error: mergeError, said: mergeSaid }),
    ]),
  ).annotate({
    description: 'Whether each branch ahead merges onto the base: clean, with its conflicts, or not known, and that in words.',
  }),
  inFlight: Strings.annotate({ description: 'The other runs in flight on the same base.' }),
  colliding: List(Collision).annotate({
    description: 'Each branch of another run that a branch of this run does not merge onto cleanly, and that in words.',
  }),
  semantic: Schema.NullOr(
    Schema.Struct({
      step: Schema.String.annotate({ description: 'The step whose check refused the merged tree.' }),
      check: Schema.String.annotate({ description: 'The landing check that refused it.' }),
      sha: Schema.String.annotate({ description: 'The commit of the merged tree it refused.' }),
      said: Schema.String.annotate({ description: 'What it said, in words.' }),
    }),
  ).annotate({
    description:
      'The landing check that refused the merged tree though it merges: its step, the check, the commit and the words; null where none did.',
  }),
  said: Schema.String.annotate({ description: 'The whole of it in one line.' }),
}).annotate({
  identifier: 'Collisions',
  description: "At an ending's decision: whether its branches merge onto the base, and the other runs in flight its branches collide with.",
});
export type Collisions = typeof Collisions.Type;

/** The runs in flight a run is held at by the cap on them, and the cap (`RunSlot`, cap.ts). */
export const RunSlot = Schema.Struct({
  inFlight: Schema.Finite.annotate({ description: 'How many runs are in flight now.' }),
  cap: Schema.Finite.annotate({ description: 'The cap on runs in flight that holds this run.' }),
}).annotate({ identifier: 'RunSlot', description: 'The runs in flight a run is held at by the cap on them, and the cap.' });
export type RunSlot = typeof RunSlot.Type;

/** One option of a question a step asks: the letter `nemia decide` prints it by, its label, which an answer chooses, and what it means. */
export const DecisionOption = Schema.Struct({
  letter: Schema.String.annotate({ description: 'The letter nemia decide prints the option by.' }),
  label: Schema.String.annotate({ description: 'Its label, which an answer chooses word for word.' }),
  meaning: Schema.String.annotate({ description: 'What choosing it means.' }),
  recommended: Schema.Boolean.annotate({ description: 'Whether the step recommends it.' }),
}).annotate({ identifier: 'DecisionOption' });
export type DecisionOption = typeof DecisionOption.Type;

/**
 * One question a step asks, as an answer names it back: its number among the step's questions as `nemia decide` prints them (1, 2… across
 * the question fields of its output, in their order), the field it was asked under, its title, which an answer names word for word, its
 * body, its options, and whether several may be chosen together (`multiple`).
 */
export const DecisionQuestion = Schema.Struct({
  number: Schema.Finite.annotate({
    description:
      "Its number among the step's questions as nemia decide prints them, from 1, across the question fields of its output in their order.",
  }),
  field: Schema.String.annotate({ description: 'The output field it was asked under.' }),
  title: Schema.String.annotate({ description: 'Its title, which an answer names word for word.' }),
  body: Schema.String.annotate({ description: 'What it asks, at length.' }),
  options: List(DecisionOption).annotate({ description: 'Its options, each with its letter, label and meaning.' }),
  multiple: Schema.Boolean.annotate({ description: 'Whether several options may be chosen together.' }),
}).annotate({ identifier: 'DecisionQuestion' });
export type DecisionQuestion = typeof DecisionQuestion.Type;

/** The questions a step waiting on a person asks now, in its current closeout: what its approval or its next try answers. */
export const StepQuestions = Schema.Struct({
  step: Schema.String.annotate({ description: 'The step waiting on a person.' }),
  questions: List(DecisionQuestion).annotate({
    description: 'The questions its current closeout asks, which its approval or its next try answers.',
  }),
}).annotate({
  identifier: 'StepQuestions',
});
export type StepQuestions = typeof StepQuestions.Type;

/**
 * What there is to decide about a run: where each result branch stands, what each branch read touched, the lesson, the check-affecting
 * diffs, what each filed step consumed and their total, the run's cost and OVER BUDGET line (each the package's words without a screen's
 * label), the commands, the run whose ending holds the base this run's ending waits on (`baseHeldBy`), what the finished run awaits
 * (`direct` for one that worked on its base branch itself; null for a run still running with a step waiting on you), and the collisions
 * read at an ending's decision; and the questions each step waiting on you asks now (`questions`, a step that asks none left out, and
 * absent where none asks or from a decision read before them), which `answers` names back by title and label.
 */
export const Decidable = Schema.Struct({
  standings: List(Standing).annotate({
    description:
      'Where each result branch stands against the base now: on it, ahead, gone or unread, with what it changed and whether it still merges.',
  }),
  touched: List(DecisionTouched).annotate({ description: 'What each branch read touched.' }),
  lesson: Lesson,
  sensitive: List(SensitiveDiff).annotate({ description: "Each branch's check-affecting diff." }),
  used: Schema.Record(Schema.String, StepUsed).annotate({ description: 'What each filed step consumed, by its name.' }),
  total: StepUsed,
  cost: Schema.NullOr(Schema.String).annotate({ description: "The run's cost, in the package's words; null where none was measured." }),
  overBudget: Schema.NullOr(Schema.String).annotate({ description: 'The line saying the run is over its budget; null where it is not.' }),
  commands: List(DecideCommand).annotate({ description: 'The commands nemia decide offers for the run.' }),
  baseHeldBy: Schema.optionalKey(BaseHold),
  awaiting: Schema.NullOr(
    Schema.Struct({
      branches: Strings.annotate({ description: 'The result branches it awaits.' }),
      direct: Schema.Boolean.annotate({ description: 'Whether it worked on its base branch itself.' }),
    }),
  ).annotate({
    description:
      'What the finished run awaits: its branches, and direct for one that worked on its base branch itself; null for a run still running with a step waiting on a person.',
  }),
  collisions: Schema.NullOr(Collisions).annotate({ description: "The collisions read at an ending's decision; null elsewhere." }),
  questions: Schema.optionalKey(
    List(StepQuestions).annotate({
      description:
        'The questions each step waiting on a person asks now, which an answer names back by title and label; absent where none asks.',
    }),
  ),
}).annotate({ identifier: 'Decidable' });
export type Decidable = typeof Decidable.Type;

/**
 * A run's decision, in one order: `nothing`, in the package's words, for a run called off; `waiting` for a run whose roots wait on runs
 * that have not succeeded or been released, with the hold beside it for one a person holds too; `holding` alone for a run a person
 * holds, which offers
 * nothing; `running` while it runs and nobody is waited on, `held` beside it for a run the cap on runs in flight holds; `nothing` for a
 * run whose branches are already on its base; else what there is to decide (`Decidable`). A union of members told apart by their keys,
 * the first that decodes taken: a run waiting and held reads as waiting, with its hold.
 */
export const RunDecision = Schema.Union([
  Schema.Struct({ waiting: RunWaiting, holding: Schema.optionalKey(RunHolding) }),
  Schema.Struct({ holding: RunHolding }),
  Schema.Struct({
    running: Schema.Literal(true).annotate({ description: 'The run runs, and nobody is waited on.' }),
    held: Schema.optionalKey(RunSlot),
  }),
  Schema.Struct({
    nothing: Schema.String.annotate({ description: "The sentence saying there is nothing to decide, in the package's words." }),
  }),
  Decidable,
]).annotate({ identifier: 'RunDecision' });
export type RunDecision = typeof RunDecision.Type;

/**
 * `decision` read narrowly, as every read of it is: each check-affecting file's diff answered whole where `diffs` names its path (`*`
 * naming every one; `?diffs=`, comma-separated, an empty one naming none), every other with its lines left out (`linesLeftOut`), its path
 * and its counts kept; not given, none is whole, a decision reading as its summary. Anything but a decidable run is answered as it is.
 * Pure.
 * @param decision The run's decision, as it was worked out.
 * @param diffs The paths whose diffs are answered whole, * naming every one; undefined where the read names none.
 */
export const decisionNarrowed = (decision: RunDecision, diffs: readonly string[] | undefined) =>
  'sensitive' in decision
    ? {
        ...decision,
        sensitive: decision.sensitive.map((branch) => ({
          ...branch,
          files: branch.files.map((file) =>
            diffs !== undefined && (diffs.includes('*') || diffs.includes(file.path)) ? file : { ...file, lines: [], linesLeftOut: true },
          ),
        })),
      }
    : decision;
