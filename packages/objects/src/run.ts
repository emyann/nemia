/**
 * The run as one object, as Kubernetes spells a resource: `apiVersion`, `kind`, `metadata`, the frozen record a run was started with
 * (`spec`) and what the orchestrator judges of it now (`status`). Its sub-resources' answers are each a Schema of its own beside it: a
 * step's tries and closeouts in `run-tries.ts` (`StepTries`, `StepTry`, `TryCloseout`), what a step was told in `run-told.ts`
 * (`StepTold`); and a person's labels on a run or a card, with an edit of them and what it answers, in `labels.ts` (`Labels`,
 * `LabelEdit`, `Labelled`). The orchestrator builds each from a run's records and holds its own types equal to them
 * (`packages/agent-orchestrator/src/object/run.model.ts`); the words each field is one of are `words.ts`'s.
 *
 * Plain JSON throughout — structs, closed literal unions, arrays, strings, numbers, nulls, no brand and no check — so effect's OpenAPI
 * writes each into a document that imports back into a Schema decoding the same object.
 */
import { Schema } from 'effect';
import { Actor } from './token.ts';
import {
  CheckVerdict,
  PeakMark,
  Said,
  Spent,
  StepArtifact,
  StepAttempts,
  StepBudget,
  StepCheck,
  StepFiled,
  StepGate,
  StepUsed,
  TimelineTotal,
  TimelineTry,
} from './run-step.ts';
export { CheckOutput, SessionReleaseSchema, StepLog, StepUsed } from './run-step.ts';
import { API_VERSION, listOf } from './meta.ts';
import { RunClock, RunListMeta } from './run-frame.ts';
import { ObjectGraph } from './graph.ts';
import {
  ANSWER_VIA,
  FIELD_SHAPES,
  GATE_AT,
  OUTCOMES,
  PLACE_KINDS,
  RAISE_BY,
  RETRY_MODES,
  REVISION_KINDS,
  RUN_OUTCOMES,
  RUN_PHASES,
  RUN_REASONS,
  RUN_STATES,
  RUN_STATUSES,
  STEP_PHASES,
  STEP_REASONS,
  STEP_STATUSES,
  WAIT_ON,
} from './words.ts';
import { runCodesLegal, stepCodesLegal, tryCodesLegal, type RunCodes, type StepCodes, type TryCodes } from './codes.ts';

/** An array as the package's types hold one, mutable, so a page built off the object keeps their types. */
const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);
const NullNumber = Schema.NullOr(Schema.Finite);
const NullBoolean = Schema.NullOr(Schema.Boolean);

/**
 * The checks that hold a served object to codes the package makes (`codes.ts`): its phase is its reason's, a wait says what it waits
 * on, an answer awaited where it is asked. An object with any other set is refused as it is encoded, and as a client decodes it.
 */
const codesRefused = (what: string, codes: { phase: string; reason: string; on?: unknown; via?: unknown }) =>
  `${what} is served with codes nothing makes together — phase ${codes.phase}, reason ${codes.reason}` +
  `${'on' in codes ? `, on ${String(codes.on)}, via ${String(codes.via)}` : ''}: a reason has one phase (STEP_PHASE_OF, RUN_PHASE_OF in ` +
  'objects), Waiting alone says what it waits on, and AwaitingAnswer alone where it is asked. Build the codes from the reason.';
export const STEP_CODES = Schema.makeFilter((step: StepCodes) => stepCodesLegal(step) || codesRefused('a step', step));
const TRY_CODES = Schema.makeFilter((tried: TryCodes) => tryCodesLegal(tried) || codesRefused('a try', tried));
const RUN_CODES = Schema.makeFilter((run: RunCodes) => runCodesLegal(run) || codesRefused('a run', run));

/** The check that a step names the run whose ending holds the base (`baseHeldBy`) exactly when it waits on it (`on: base`). */
const BASE_HELD = Schema.makeFilter(
  (step: { on: (typeof WAIT_ON)[number] | null; baseHeldBy?: unknown }) =>
    (step.on === 'base') === (step.baseHeldBy !== undefined) ||
    `a step is served ${step.on === 'base' ? 'waiting on the base with no baseHeldBy' : `with a baseHeldBy while it waits on ${String(step.on)}`}: set baseHeldBy, the run whose ending holds the base, exactly where on is base.`,
);

const StepStatusWord = Schema.Literals(STEP_STATUSES);
const StepPhase = Schema.Literals(STEP_PHASES);
const StepReason = Schema.Literals(STEP_REASONS);

/**
 * The run's name, its namespace (its factory, `default` for none), when it was made, and the labels it is found by, one map
 * (`metadataLabels`): its `workflow`, the `factory` it was started in (`default` for the default one, as the feed says it), and a
 * person's labels on it (`nemia label run`), as `-l` selects them; its `resourceVersion`, opaque, moved by every change of what is served
 * of it. `namespace` and `resourceVersion` are absent on an object served before the Run had them.
 */
export const RunMetadata = Schema.Struct({
  name: Schema.String.annotate({ description: "The run's id, as nemia ls lists it." }),
  namespace: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The factory the run was started in; default for a run of none. Absent on an object served before runs had one.',
    }),
  ),
  creationTimestamp: Schema.String.annotate({ description: 'When the run was made, an ISO 8601 time.' }),
  labels: Schema.Record(Schema.String, Schema.String).annotate({
    description: "The labels the run is found by (-l): its workflow, its factory, and a person's own (nemia label run).",
  }),
  resourceVersion: Schema.optionalKey(
    Schema.String.annotate({
      description: 'Opaque, moved by every change of what is served of the run: hand it back to a watch to read on from there.',
    }),
  ),
}).annotate({ identifier: 'RunMetadata', description: "The run's name, its factory, when it was made, and its labels." });
export type RunMetadata = typeof RunMetadata.Type;

/**
 * One step as the run froze it: what it waits on (`after`), whose declared output it is handed (`input`), and on a looping step the step
 * a round runs again and how many rounds it may run (`loop`, `rounds`; null on any other); then the rest of its frontmatter the board
 * shows, each null where the step does not set it: `fence` is the fence word the run froze for its session, said in this layer's word; and
 * the agent it is given, by name, absent for a step given none.
 */
export const RunSpecStep = Schema.Struct({
  name: Schema.String.annotate({ description: "The step's name in its workflow." }),
  after: Strings.annotate({ description: 'The steps that must finish first (after:); empty where it starts at once.' }),
  input: Strings.annotate({ description: 'The steps whose declared output it is handed in its brief, as data (input:).' }),
  loop: NullString.annotate({
    description: 'On a looping step, the step a round runs again when its closeout says again: true (loop:); null on any other.',
  }),
  rounds: NullNumber.annotate({ description: 'On a looping step, how many rounds it may run (rounds:); null on any other.' }),
  harness: NullString.annotate({
    description: 'What runs its session (harness:), or `a2a:<name>` for a remote A2A agent; null where unset.',
  }),
  model: NullString.annotate({
    description: "The model the harness runs its session on (model:); null where unset, the harness's own default.",
  }),
  effort: NullString.annotate({ description: 'How hard the harness thinks, in its own words (effort:); null where unset.' }),
  context: NullNumber.annotate({
    description: "Its session's context window in tokens (context:); null where unset, the model's whole window.",
  }),
  workspace: NullString.annotate({
    description:
      "base for a step that runs in the repository's own working tree rather than a worktree of its own (workspace:); null where unset.",
  }),
  place: NullString.annotate({
    description: 'Where its work is (place:): folder, a folder the run makes, or git, on branches of a repository; null where unset.',
  }),
  resume: NullString.annotate({
    description: 'The step whose session this one continues instead of starting cold (resume:); null where unset.',
  }),
  fence: NullString.annotate({
    description:
      "The fence the run froze for its session, in this layer's word: whether it asks, denies or allows what no rule decides; null where unset.",
  }),
  sandbox: NullString.annotate({ description: 'The sandbox the run froze for a harness that fences by one (sandbox:); null where unset.' }),
  tools: Schema.NullOr(Strings).annotate({
    description: "The only tools its session may have, in the harness's names (tools:); null where unset, the harness's own set.",
  }),
  deadlineSeconds: NullNumber.annotate({
    description: 'How many seconds its session may run before it is stopped (deadlineSeconds:); null where unset.',
  }),
  agent: Schema.optionalKey(Schema.String.annotate({ description: 'The agent the step is given, by name; absent for a step given none.' })),
  /**
   * The fields of its declared output, in its schema's order, each with the shape its `x-shape` marked (`FIELD_SHAPES`, null where none);
   * absent for a step that declares none, or frozen before the run kept them.
   */
  fields: Schema.optionalKey(
    List(
      Schema.Struct({
        name: Schema.String.annotate({ description: 'The name of the field.' }),
        shape: Schema.NullOr(Schema.Literals(FIELD_SHAPES)).annotate({
          description: 'What the field stands for by its x-shape marker: questions, budgets, link or commit; null where it marked none.',
        }),
      }),
    ).annotate({
      description:
        "The fields of its declared output in its schema's order, each with the shape its x-shape marked (null where none); absent for a step that declares none.",
    }),
  ),
}).annotate({ identifier: 'RunSpecStep' });
export type RunSpecStep = typeof RunSpecStep.Type;

/**
 * What the run was started with, frozen: its steps, its brief, the kind of place its work is on, and for a repository run the repository,
 * the base commit and branch its result goes to and whether it cut worktrees (null on a folder run); a folder run's work directory (null
 * on a repository run); the workflow folder it was started from, the agent a try from an agent's page tried, the runs it waits on and is
 * handed as context, and the inbox card it was started from (null for none).
 */
export const RunSpec = Schema.Struct({
  steps: List(RunSpecStep).annotate({ description: "Each step as the run froze it, in the workflow's order." }),
  brief: Schema.String.annotate({ description: 'What the run was asked to do, in the words it was started with.' }),
  place: Schema.Literals(PLACE_KINDS).annotate({ description: 'The kind of place its work is on: a git repository, or a folder.' }),
  repo: NullString.annotate({ description: 'The repository a repository run works on; null on a folder run.' }),
  baseRef: NullString.annotate({ description: 'The base commit a repository run started from; null on a folder run.' }),
  branch: NullString.annotate({ description: "The base branch a repository run's result goes to; null on a folder run." }),
  isolate: NullBoolean.annotate({ description: 'Whether a repository run cut worktrees of its own for its steps; null on a folder run.' }),
  work: NullString.annotate({ description: "A folder run's work directory; null on a repository run." }),
  workflowDir: Schema.String.annotate({ description: 'The workflow folder the run was started from.' }),
  try: Schema.NullOr(Schema.Struct({ agent: Schema.String.annotate({ description: 'The name of the agent tried.' }) })).annotate({
    description: "The agent a try from an agent's page tried; null for any other run.",
  }),
  after: Strings.annotate({ description: 'The runs its first steps wait on to land (nemia start --after).' }),
  context: Strings.annotate({ description: 'The runs whose conclusions it is handed as context.' }),
  from: Schema.NullOr(Schema.Struct({ inbox: Schema.String.annotate({ description: "The inbox card's id." }) })).annotate({
    description: 'The inbox card it was started from; null for none.',
  }),
}).annotate({
  identifier: 'RunSpec',
  description: 'What the run was asked to do: its brief, its workflow, and where it works. Never changes.',
});
export type RunSpec = typeof RunSpec.Type;

/**
 * The short of a step's current try (the page's `StepTry`): its number and the round of its loop it was filed in, where it stands as codes,
 * and how it signed off and its check's verdict where it has them (null where not).
 */
export const TryShort = Schema.Struct({
  try: Schema.Finite.annotate({ description: "The current try's number, from 1." }),
  round: Schema.Finite.annotate({ description: "The round of the step's loop the try was filed in, from 1." }),
  phase: StepPhase.annotate({ description: 'Where the try is in its life, as a code: the phase its reason stands in.' }),
  reason: StepReason.annotate({ description: 'Why the try is in its phase, as a code.' }),
  outcome: Schema.NullOr(Schema.Literals(OUTCOMES)).annotate({
    description: 'How the try signed off (done or blocked); null while it has not.',
  }),
  verdict: Schema.NullOr(CheckVerdict).annotate({ description: "Its check's verdict, a result and the exit; null while it has none." }),
})
  .check(TRY_CODES)
  .annotate({ identifier: 'TryShort' });
export type TryShort = typeof TryShort.Type;

/** A raise of a step's cap the package takes, and how it is asked for (`StepRaise`, retry/raise.ts). */
export const StepRaise = Schema.Struct({
  by: Schema.Literals(RAISE_BY).annotate({
    description: 'How the raise is asked for: retry (nemia retry --budget) or round (nemia retry --round --budget).',
  }),
  above: Schema.Finite.annotate({
    description: 'What a new budget has to be more than: what the tries have cost, or the cap a session was ended at.',
  }),
  said: Schema.String.annotate({ description: 'That amount, in dollars.' }),
  modes: List(Schema.Literals(RETRY_MODES)).annotate({
    description: 'For a try, the ways the package takes it (continue, fresh, recheck); empty for a round.',
  }),
  own: Schema.NullOr(StepStatusWord).annotate({
    description: 'How the step ended on its own work, its budget aside (blocked, unsigned, failed…); null for a round.',
  }),
}).annotate({ identifier: 'StepRaise' });
export type StepRaise = typeof StepRaise.Type;

/**
 * The run whose ending step works on the base branch in the repository's own working tree now, and that step (`CheckoutHold`, cap.ts):
 * what an ending of a run waits on while it waits on the base (`WAIT_ON`'s `base`), on the step that waits (`RunStepStatus`'s
 * `baseHeldBy`) and on its decision (`Decidable`'s).
 */
export const BaseHold = Schema.Struct({
  run: Schema.String.annotate({ description: "The run whose ending holds the base branch in the repository's own working tree." }),
  step: Schema.String.annotate({ description: 'Its ending step that works there now.' }),
}).annotate({
  identifier: 'BaseHold',
  description:
    "The run whose ending step works on the base branch in the repository's own working tree now, which an ending of this run waits on: present only while it waits on the base (on: base), absent otherwise.",
});
export type BaseHold = typeof BaseHold.Type;

/**
 * A step now: where it stands as codes and in its word, the raise of its cap the package takes (null where none), its tries on the clock
 * (`TimelineTry`), the short of its current try (null while it has none); then all the board shows of it but its tries whole and what
 * it was told (its sub-resources) — its task and place, its folder's files, its note, what it needs of a person, its gate, what was said
 * to it and asked of it, its current try's check and attempts, and what it used, cost and may cost. The lines a person types for it are
 * the command table's, not the step's: the lines read beside the object builds them (`runLines`, lines.verb.ts).
 */
export const RunStepStatus = Schema.Struct({
  name: Schema.String.annotate({ description: "The step's name in its workflow." }),
  phase: StepPhase.annotate({ description: 'Where the step is in its life, as a code: the phase its reason stands in.' }),
  reason: StepReason.annotate({ description: 'Why the step is in its phase, as a code.' }),
  status: StepStatusWord.annotate({ description: 'The step in one word, as nemia ls says it.' }),
  on: Schema.NullOr(Schema.Literals(WAIT_ON)).annotate({
    description: 'What the step waits on, set exactly when its reason is Waiting; null otherwise.',
  }),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)).annotate({
    description: 'Where an awaited answer is asked, set only when its reason is AwaitingAnswer: session or closeout. Null otherwise.',
  }),
  /** The run whose ending holds the base the step waits on, and that ending (`BaseHold`): present exactly when `on` is `base`. */
  baseHeldBy: Schema.optionalKey(BaseHold),
  message: Schema.String.annotate({ description: 'Where the step stands, in the sentence a person reads.' }),
  verdict: Schema.NullOr(CheckVerdict).annotate({
    description: "Its current try's check verdict, a result and the exit; null where it has none.",
  }),
  raise: Schema.NullOr(StepRaise).annotate({
    description: "The raise of the step's cap the package takes, and how it is asked for; null where none.",
  }),
  timeline: List(TimelineTry).annotate({
    description: 'Each try of the step on the clock: its session and check, when each was filed, ran and ended, and what its session used.',
  }),
  current: Schema.NullOr(TryShort).annotate({
    description: 'The short of its current try: its number, round, codes, sign-off and verdict; null while it has none.',
  }),
  filed: Schema.NullOr(StepFiled).annotate({
    description:
      'What the engine filed its current try with: model, effort, context, fence, tools and deadline; null while none was filed.',
  }),
  taskId: NullString.annotate({ description: 'The task of its current try; null while none was filed.' }),
  workspace: NullString.annotate({ description: 'The folder the step works in; null where it has none yet.' }),
  branch: NullString.annotate({ description: "The branch the step's work is on; null where it has none." }),
  files: List(StepArtifact).annotate({
    description: "Every file a folder run's step folder holds, each served, pruned, or only its path; empty where there is no folder.",
  }),
  filesError: NullString.annotate({ description: "Why the step's folder could not be read; null where it was." }),
  note: NullString.annotate({
    description:
      'What nemia ls prints beside the step, for one tried again or in a loop past its first round (try 2, by retries: 1; round 2 of 3); null where it prints nothing.',
  }),
  roundDue: Schema.Boolean.annotate({ description: "Whether a looping step's next round is due, which its note words." }),
  needs: NullString.annotate({
    description: 'The question of a step whose current try signed off blocked, from its closeout; null for any other step.',
  }),
  waitingFor: Schema.NullOr(
    Schema.Struct({
      words: Schema.String.annotate({ description: 'What the harness says the session waits for.' }),
      advice: Schema.String.annotate({ description: 'What a person does about it.' }),
    }),
  ).annotate({
    description: 'What its harness says the session waits for, and what a person does about it; null where the harness said nothing.',
  }),
  approve: NullString.annotate({
    description: 'What nemia ls asks of a person for a step waiting at its gate (approve plan); null for any other step.',
  }),
  denied: Schema.NullOr(
    Schema.Struct({
      words: Schema.String.annotate({ description: 'The line that says what was denied.' }),
      calls: Strings.annotate({ description: 'Each denied call as a permission rule names it.' }),
    }),
  ).annotate({
    description:
      'What the harness denied its current try: each call as a permission rule names it, and the line that says them; null where nothing was denied.',
  }),
  sessionUnread: NullString.annotate({
    description: "Why the runtime could not read the step's session, in its words; null where it was read.",
  }),
  lastLine: NullString.annotate({ description: "What the step's session said last, on a run read alone; null where nothing was read." }),
  gate: Schema.NullOr(StepGate).annotate({
    description: 'Its gate, awaiting approval or approved, with the budgets it proposes; null for a step that is no gate.',
  }),
  said: List(Said).annotate({ description: "Words said to the step's session while it ran (nemia say), as the engine journalled them." }),
  asked: Schema.NullOr(
    Schema.Struct({
      try: Schema.Finite.annotate({ description: 'The number of the try asked for.' }),
      mode: Schema.Literals(RETRY_MODES).annotate({ description: 'How it was asked for: continue, fresh or recheck.' }),
      model: NullString.annotate({ description: 'The model it was asked to run on; null where none was asked.' }),
      message: NullString.annotate({ description: 'What the person said with the ask (nemia retry --message); null where nothing.' }),
      stopFirst: Schema.Boolean.annotate({ description: 'Whether its session is stopped first.' }),
    }),
  ).annotate({
    description:
      'A try asked of the step (nemia retry) and not yet filed: its number, its mode, the model and message it was asked with, and whether its session is stopped first; null where none is asked.',
  }),
  check: Schema.NullOr(StepCheck).annotate({
    description: 'The check its current try is judged by, the first that refused else the first not passed; null for a step with no check.',
  }),
  checks: Schema.optionalKey(
    Schema.Array(StepCheck).annotate({
      description:
        "Every check of its current try, in the step's order, where its step has several; absent for a step with one, whose check is `check`, or none.",
    }),
  ),
  attempts: StepAttempts,
  used: Schema.NullOr(StepUsed).annotate({ description: 'What its tries consumed; null where nothing was measured.' }),
  spent: Schema.NullOr(Spent).annotate({
    description: "What its tries' sessions cost together; null until one was measured or a session at work said what it has spent.",
  }),
  budget: Schema.NullOr(StepBudget).annotate({
    description: 'Its cap in dollars and what its tries have cost of it, and whether they are over; null for a step with no budget.',
  }),
  /** How many questions its closeout asks, on a step waiting on a person whose closeout asks some (`Listing`'s `asks`); left out else. */
  asks: Schema.optionalKey(
    Schema.Finite.annotate({
      description: 'How many questions its closeout asks, on a step waiting on a person whose closeout asks some; left out otherwise.',
    }),
  ),
  /**
   * Every file of the step's artifacts folder, named by a closeout or not (`folderFiles`, files.store.ts, linked under `…/artifacts/`),
   * with why the folder did not read (null where it did); absent on a step not filed yet, or from an older api.
   */
  artifactsFolder: Schema.optionalKey(
    Schema.Struct({
      files: List(StepArtifact).annotate({
        description: "Every file of the step's artifacts folder, each served, pruned, or only its path.",
      }),
      error: NullString.annotate({ description: 'Why the folder did not read; null where it did.' }),
    }).annotate({
      description:
        "Every file of the step's artifacts folder, named by a closeout or not, with why the folder did not read; absent on a step not filed yet.",
    }),
  ),
})
  .check(STEP_CODES, BASE_HELD)
  .annotate({ identifier: 'RunStepStatus' });
export type RunStepStatus = typeof RunStepStatus.Type;

/** The runs a run waits on or is held until, each that has not landed and why it never will on its own (`RunWaiting`, `RunHolding`). */
const waitedRun = {
  run: Schema.String.annotate({ description: "The waited-on run's id." }),
  missing: Schema.Boolean.annotate({ description: 'Whether the store has no such run.' }),
  cancelledAt: NullString.annotate({ description: 'When the run was called off; null where it was not.' }),
  gone: Strings.annotate({ description: 'The result branches the run recorded that are gone; empty where none is.' }),
};

/** The runs a run's roots wait on that have not landed (`RunWaiting`, judged.verb.ts), in the package's words. */
export const RunWaiting = Schema.Struct({
  runs: List(Schema.Struct(waitedRun)).annotate({
    description:
      'Each run waited on that has not landed, and why it never will on its own where it will not: missing, called off, or its branches gone.',
  }),
  word: Schema.String.annotate({ description: 'What nemia ls prints under the run for its wait.' }),
  advice: Schema.String.annotate({ description: 'The line nemia decide prints under it: what to do about the wait.' }),
  waitingOnYou: Schema.Boolean.annotate({ description: 'Whether a run it waits on never lands without a person.' }),
}).annotate({
  identifier: 'RunWaiting',
  description: "The runs a run's roots wait on that have not landed, with the words nemia ls and nemia decide print for the wait.",
});
export type RunWaiting = typeof RunWaiting.Type;

/** A person's hold on a run (`RunHolding`, judged.verb.ts), in the package's words. */
export const RunHolding = Schema.Struct({
  at: Schema.String.annotate({ description: 'When the hold was put (nemia hold).' }),
  runs: List(Schema.Struct({ ...waitedRun, landed: Schema.Boolean.annotate({ description: 'Whether the run landed.' }) })).annotate({
    description:
      'The runs the hold waits for, each with why it never lands on its own where it will not, and whether it landed; empty for a hold that names none.',
  }),
  word: Schema.String.annotate({
    description: "What nemia ls prints under the run for its hold, with the person's why and name where the hold has them.",
  }),
  advice: Schema.String.annotate({ description: 'The line nemia decide prints under it.' }),
  waitingOnYou: Schema.Boolean.annotate({
    description: 'Whether the hold waits on a person: exactly when a run it names never lands on its own.',
  }),
  actor: Schema.optionalKey(Actor),
}).annotate({
  identifier: 'RunHolding',
  description: "A person's hold on the run (nemia hold): when it was put, and the runs it waits on.",
});
export type RunHolding = typeof RunHolding.Type;

/** What a person has to decide (`RunToDecide`, judged.verb.ts): an approval at a gate, or the result branches. */
const RunToDecide = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('approve').annotate({ description: "An approval at the gate of the run's last step." }),
    step: Schema.String.annotate({ description: 'The step waiting at its gate, by name.' }),
    says: NullString.annotate({
      description:
        "What it would do, the first line of the step's own note; null where it has none, and for a gated step that has signed off.",
    }),
    filed: Schema.Boolean.annotate({ description: 'Whether the step has run.' }),
    back: Strings.annotate({ description: 'The steps a send-back goes to.' }),
    onto: NullString.annotate({ description: "The base branch the run's result is on its way to; null where none." }),
    said: Schema.String.annotate({ description: 'What nemia ls prints after to decide:.' }),
    command: Schema.String.annotate({ description: 'The command that approves it (nemia approve).' }),
  }),
  Schema.Struct({
    kind: Schema.Literal('result').annotate({
      description: "A decision on the run's result: nothing waits at a gate and the branches are ahead of the base branch.",
    }),
    branches: Strings.annotate({ description: 'The result branches ahead of the base branch, to merge or drop by hand.' }),
    said: Schema.String.annotate({ description: 'What nemia ls prints after to decide:.' }),
    command: Schema.String.annotate({ description: 'The command that shows what to decide (nemia decide).' }),
  }),
]);

/** A step of the run that is a gate, and where its approval is beside it (`GATE_AT`). */
export const RunGate = Schema.Struct({
  step: Schema.String.annotate({ description: 'The step that is a gate, by name.' }),
  at: Schema.Literals(GATE_AT).annotate({
    description:
      "Where the gate's approval is beside its step: after, its closeout waits for an approval before anything after it is filed; before, it is approved before it runs (an ending on the base branch).",
  }),
});

/** One kind and name the run or a step of it is behind the files on (`Drift`, revisions.ts). */
export const RunDrift = Schema.Struct({
  kind: Schema.Literals(REVISION_KINDS).annotate({ description: 'What kind it is: an agent, a skill or a workflow.' }),
  name: Schema.String.annotate({ description: 'Its name.' }),
  pinned: Schema.Finite.annotate({ description: 'The revision the run resolved.' }),
  now: Schema.Finite.annotate({
    description: 'The revision of what the files hold now, which may be lower than pinned where they went back to older content.',
  }),
  step: Schema.optionalKey(
    Schema.String.annotate({ description: "The step that already ran on the pinned revision; absent for the run's own pin." }),
  ),
});

/**
 * What one step of a run has cost, every try's session together; `cost` null until one was measured or a session at work said what it
 * has spent.
 */
export const StepCost = Schema.Struct({
  step: Schema.String.annotate({ description: 'The step, by name.' }),
  cost: Schema.NullOr(Spent).annotate({
    description:
      "What every try's session of the step cost together; null until one was measured or a session at work said what it has spent.",
  }),
}).annotate({ identifier: 'StepCost' });
export type StepCost = typeof StepCost.Type;

/**
 * The run now: the runs list's judged fields (`judgedFields`) — its word and codes, whether it moves, its cost, time at work and tokens,
 * what it waits on, its hold and what a person has to decide — then its graph, where its time went as a whole (`Timeline`'s rounds, run
 * and slot), and each step; and the rest of what the board shows of it but the lines to type, which are the command table's: when it
 * started and was called off, what a prune took (with its words, as `nemia ls` says them) and would find, the runs it is held until,
 * what its sessions read, who it waits on, its gates, a warning on its folder, and the kinds it is behind the files on.
 */
export const RunStatus = Schema.Struct({
  status: Schema.Literals(RUN_STATUSES).annotate({
    description:
      'The run in one word, worked out from its steps on every pass: running, succeeded, failed, cancelled, awaiting approval (stopped at a gate), or waiting (stopped on a person for anything else).',
  }),
  phase: Schema.Literals(RUN_PHASES).annotate({ description: 'Where the run is in its life, as a code: the phase its reason stands in.' }),
  reason: Schema.Literals(RUN_REASONS).annotate({
    description: 'Why the run is in its phase, as a code. A run stopped on a person takes the reason of its first step that waits.',
  }),
  on: Schema.NullOr(Schema.Literals(WAIT_ON)).annotate({
    description:
      "What the run waits on, set exactly when its reason is Waiting: run (other runs), limit (the limit on runs in flight), base (the base branch, while another run lands there), pause (the store's pause) or hold (a hold only a person lifts). Null otherwise.",
  }),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)).annotate({
    description:
      'Where an awaited answer is asked, set only when its reason is AwaitingAnswer: session (a question in a live session) or closeout (a step signed off blocked). Null otherwise.',
  }),
  moving: Schema.Boolean.annotate({
    description: 'Whether anything of the run is in flight or due: a session or check at work, or something the next pass would file.',
  }),
  cost: Schema.NullOr(Spent).annotate({
    description: 'What every try of every step has cost together; null until one was measured or a session at work said what it has spent.',
  }),
  atWork: Schema.NullOr(
    Schema.Struct({
      ms: Schema.Finite.annotate({ description: 'The milliseconds its sessions and checks have been at work.' }),
      since: NullString.annotate({ description: 'Since when one is at work now; null where none is.' }),
      endedAt: NullString.annotate({ description: 'When the last one ended; null where none has.' }),
    }),
  ).annotate({
    description:
      'The time the run has spent at work, its sessions and checks together: milliseconds, since when one is at work now, and when the last ended; null while nothing of it ran.',
  }),
  tokens: Schema.NullOr(
    Schema.Struct({
      total: Schema.Finite.annotate({ description: 'The tokens its sessions used, input and output.' }),
      input: Schema.Finite.annotate({ description: 'The input tokens.' }),
      output: Schema.Finite.annotate({ description: 'The output tokens.' }),
      cacheRead: NullNumber.annotate({ description: 'The input tokens read from the cache; null where not measured.' }),
      cacheWrite: NullNumber.annotate({ description: 'The input tokens written to the cache; null where not measured.' }),
      uncached: NullNumber.annotate({
        description: 'The input tokens neither read from the cache nor written to it; null where not measured.',
      }),
      measured: Schema.Finite.annotate({ description: 'How many tries were measured.' }),
      unmeasured: Schema.Finite.annotate({ description: 'How many tries were not.' }),
      said: Schema.String.annotate({ description: 'The total in words.' }),
      split: Schema.String.annotate({ description: 'Its parts in words.' }),
    }),
  ).annotate({
    description:
      'The tokens its sessions used, every try together: the total and its parts, how many tries were measured and how many were not, and both said in words; null until one was measured.',
  }),
  waiting: Schema.NullOr(RunWaiting).annotate({
    description: "The runs this run's first steps wait on to land (nemia start --after); null where it waits on none.",
  }),
  holding: Schema.NullOr(RunHolding).annotate({
    description:
      'The hold a person put on the run (nemia hold): the runs it waits for and whether it needs a person; null where nobody holds it.',
  }),
  toDecide: Schema.NullOr(RunToDecide).annotate({
    description: 'What a person has to decide of the run now, as nemia decide says it; null where nothing.',
  }),
  graph: ObjectGraph.annotate({ description: "The run's steps as a graph: its nodes, the edges between them, and its roots." }),
  timeline: Schema.Struct({
    rounds: List(TimelineTotal).annotate({ description: 'Each round of each of its loops on the clock.' }),
    run: TimelineTotal.annotate({ description: 'The run in total on the clock.' }),
    slot: Schema.NullOr(
      Schema.Struct({
        from: Schema.String.annotate({ description: 'The instant the wait for a slot is counted from.' }),
        filedAt: NullString.annotate({ description: 'When its first task was filed; null while none was.' }),
        ms: NullNumber.annotate({ description: 'The milliseconds it waited; null where it cannot be measured.' }),
        queued: Schema.String.annotate({ description: 'The wait in words.' }),
      }),
    ).annotate({ description: 'How long it waited for a run slot before its first task was filed; null where it did not.' }),
  }).annotate({
    description:
      "Where the run's time went as a whole: each round of its loops, the run in total, and how long it waited for a run slot before its first task was filed.",
  }),
  steps: List(RunStepStatus).annotate({ description: "Each step of the run as it stands now, in the workflow's order." }),
  startedAt: NullString.annotate({ description: "When the run's first task was filed; null while nothing of it was." }),
  cancelledAt: NullString.annotate({ description: 'When a person called the run off (nemia cancel); null where nobody did.' }),
  cancelledBy: Schema.optionalKey(Actor),
  pruned: Schema.NullOr(
    Schema.Struct({
      at: Schema.String.annotate({ description: 'When the prune ran, an ISO 8601 time.' }),
      worktrees: List(
        Schema.Struct({
          path: Schema.String.annotate({ description: 'The worktree removed.' }),
          bytes: Schema.Finite.annotate({ description: 'The bytes it held.' }),
        }),
      ).annotate({ description: 'Each worktree it removed.' }),
      artifacts: Schema.NullOr(
        Schema.Struct({
          at: Schema.String.annotate({ description: 'When the files directory was removed, an ISO 8601 time.' }),
          bytes: Schema.Finite.annotate({ description: 'The bytes it held.' }),
        }),
      ).annotate({ description: 'The files directory the prune removed where --artifacts took it; null where it did not.' }),
      said: Schema.optionalKey(
        Schema.String.annotate({ description: 'The prune in words, as nemia ls says it; absent where none was said.' }),
      ),
    }),
  ).annotate({
    description:
      'What nemia prune removed of the run: when, each worktree with the bytes it held, its files directory where --artifacts took it, and the prune in words; null for a run never pruned.',
  }),
  onDisk: Schema.Struct({
    worktrees: Schema.Boolean.annotate({ description: 'Whether its worktrees are still on disk.' }),
    files: Schema.Boolean.annotate({ description: "Whether its steps' files directory is still on disk." }),
  }).annotate({
    description: "What of the run is still on disk: its worktrees, and its steps' files directory.",
  }),
  holdUntil: Strings.annotate({ description: 'The runs the hold on this run waits for; empty where it names none or nobody holds it.' }),
  read: Schema.NullOr(
    Schema.Struct({
      said: Schema.String.annotate({ description: 'What its sessions read into their context, in words.' }),
      peak: PeakMark.annotate({ description: 'The largest read of one session against its cap: cap or large; null where below both.' }),
      rebuilt: Schema.Finite.annotate({ description: 'How many times a context was rebuilt.' }),
    }),
  ).annotate({
    description:
      'What its sessions read into their context: in words, the largest read of one session, and how many times a context was rebuilt; null where none was measured.',
  }),
  waitingOnYou: Strings.annotate({ description: 'The steps a person has to act on, by name; empty where none waits on one.' }),
  waitingOnYouWords: Strings.annotate({ description: 'What each of those steps waits on a person for, in words, one line a step.' }),
  gates: List(RunGate).annotate({
    description:
      'The steps of the run that are gates, in the order they run, each with where its approval is: after the step, its closeout waiting on it, or before it, for an ending approved first.',
  }),
  warning: NullString.annotate({ description: "A warning about the run's workflow folder, in words; null where there is none." }),
  kinds: List(RunDrift).annotate({
    description:
      'The agents, skills and workflow the run pinned that have changed in the files since: each with the revision pinned and the one now.',
  }),
  /**
   * Where its work ended up (`resultBranches`): the branches of its result steps that have one, named as soon as one does, landed or
   * not; left out where none has.
   */
  result: Schema.optionalKey(
    Strings.annotate({
      description:
        "The branches the run's work ended up on, named as soon as a result step has one, landed or not. Left out where none has.",
    }),
  ),
  /**
   * The parts of the board's frame, present on a list asked by a field (`?fieldSelector=status.state…` or `status.outcome…`) alone and
   * measured to its `metadata.asOf`: a plain list, a run read alone and their watches never carry them. Its state in the list
   * (`RUN_STATES`); its wall time in ms, from its creation until its work stopped or until `asOf`; where that time went (`clock`, frozen at
   * its finish for a finished run, null where a task of it does not read); each step's cost and when its present wait on a person began
   * (`stepCosts`, `waitingSince`, for a waiting run, null otherwise or where it is not dated); when its work stopped and how it ended
   * (`finishedAt`, `outcome`, for a finished run, null otherwise).
   */
  state: Schema.optionalKey(
    Schema.Literals(RUN_STATES).annotate({
      description:
        "The run's state in a list asked by fieldSelector: waiting (on a person), inFlight, or finished. Present on such a list alone.",
    }),
  ),
  wallMs: Schema.optionalKey(
    Schema.Finite.annotate({
      description:
        "The run's wall time in milliseconds, from its creation until its work stopped, or until the list's asOf for one still going. Present on a list asked by fieldSelector alone.",
    }),
  ),
  clock: Schema.optionalKey(
    Schema.NullOr(RunClock).annotate({
      description:
        "Where the run's wall time went, frozen at its finish for a finished run; null where a task of it does not read. Present on a list asked by fieldSelector alone.",
    }),
  ),
  stepCosts: Schema.optionalKey(
    Schema.NullOr(List(StepCost)).annotate({
      description: "Each step's cost, for a run that waits on a person; null otherwise. Present on a list asked by fieldSelector alone.",
    }),
  ),
  waitingSince: Schema.optionalKey(
    NullString.annotate({
      description:
        "When the run's present wait on a person began; null for a run that does not wait or whose wait is not dated. Present on a list asked by fieldSelector alone.",
    }),
  ),
  finishedAt: Schema.optionalKey(
    NullString.annotate({
      description: "When a finished run's work stopped; null for one not finished. Present on a list asked by fieldSelector alone.",
    }),
  ),
  outcome: Schema.optionalKey(
    Schema.NullOr(Schema.Literals(RUN_OUTCOMES)).annotate({
      description:
        "How a finished run ended: succeeded, failed, cancelled, or undecided (its result waits on a person's decision); null for one not finished. Present on a list asked by fieldSelector alone.",
    }),
  ),
})
  .annotate({ description: 'The run as it stands now, judged on this read.' })
  .check(RUN_CODES)
  .annotate({ identifier: 'RunStatus' });
export type RunStatus = typeof RunStatus.Type;

/** The run as one object: `nemia/v1`'s `Run`. */
export const Run = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version of the objects this api serves.' }),
  kind: Schema.Literal('Run').annotate({ description: 'The kind of this object: a run, one pass of a workflow.' }),
  metadata: RunMetadata,
  spec: RunSpec,
  status: RunStatus,
}).annotate({ identifier: 'Run' });
export type Run = typeof Run.Type;

/**
 * A run that is in the list and could not be judged, so is no `Run`: its name, its namespace (its factory, `default` for none), and why,
 * in the words the list says it with.
 */
export const RunUnjudged = Schema.Struct({
  name: Schema.String.annotate({ description: "The run's id." }),
  namespace: Schema.optionalKey(Schema.String.annotate({ description: 'The factory the run was started in; default for a run of none.' })),
  error: Schema.String.annotate({ description: 'Why the run could not be judged, in the words the list says it with.' }),
  /**
   * Each step's word as the engine last read it off the run's record — `unreadable` for one a task of which does not read, `pending` for
   * one with none — and its branch, null where it has none; left out by a list that read none.
   */
  steps: Schema.optionalKey(
    List(
      Schema.Struct({
        name: Schema.String.annotate({ description: "The step's name." }),
        message: Schema.String.annotate({ description: "The step's word as the engine last read it: unreadable, pending or its own." }),
        branch: NullString.annotate({ description: 'Its branch; null where it has none.' }),
      }),
    ).annotate({
      description:
        "Each step's word as the engine last read it off the run's record (unreadable, pending…) and its branch; left out by a list that read none.",
    }),
  ),
  /** Its state in the list (`RUN_STATES`), on a list asked by state alone: what its summary says, which reads without its tasks. */
  state: Schema.optionalKey(
    Schema.Literals(RUN_STATES).annotate({ description: 'Its state in the list, on a list asked by state alone: what its summary says.' }),
  ),
}).annotate({ identifier: 'RunUnjudged' });
export type RunUnjudged = typeof RunUnjudged.Type;

/**
 * A page of the runs (`RunList`): `listOf('Run', Run)`, and beside it `unjudged`, each run of the page a task of which does not read, left
 * out of `items` since it cannot be judged into a `Run`. A departure from Kubernetes, whose list holds objects alone: a run dropped with no
 * word would read as gone, and a page refused for one journal would blank every other run of it. A run of a list is judged without the
 * reads a poll should not pay for: no harness is asked for a blocked session's last line and no drift is read, so each step's `lastLine` is
 * null and `kinds` empty there; the run read alone (`GET …/runs/<name>`) says them. Its metadata is `RunListMeta`, and a list asked by a
 * field (`?fieldSelector=status.state…` or `status.outcome…`) still judges its whole namespace to count it, whatever its `limit`.
 */
export const RunList = Schema.Struct({
  ...listOf('Run', Run).fields,
  metadata: RunListMeta,
  unjudged: Schema.optionalKey(
    Schema.Array(RunUnjudged).annotate({
      description:
        'Each run of the page a task of which does not read, left out of items since it cannot be judged; absent where there is none.',
    }),
  ),
}).annotate({ identifier: 'RunList' });
export type RunList = typeof RunList.Type;
