/**
 * The run as one object, as Kubernetes spells a resource: `apiVersion`, `kind`, `metadata`, the frozen record a run was started with
 * (`spec`) and what the orchestrator judges of it now (`status`); its sub-resources' answers, each a Schema of its own (`StepTries`,
 * `StepTry`, `TryCloseout`, `StepTold`); and a person's labels on a run or a card, with an edit of them and what it answers (`Labels`,
 * `LabelEdit`, `Labelled`). The orchestrator builds each from a run's records and holds its own types equal to them
 * (`packages/agent-orchestrator/src/object/run.model.ts`); the words each field is one of are `words.ts`'s.
 *
 * Plain JSON throughout — structs, closed literal unions, arrays, strings, numbers, nulls, no brand and no check — so effect's OpenAPI
 * writes each into a document that imports back into a Schema decoding the same object.
 */
import { Schema } from 'effect';
import { API_VERSION } from './meta.ts';
import { ObjectGraph } from './graph.ts';
import {
  ANSWER_VIA,
  ARTIFACT_KINDS,
  ATTEMPT_ENDS,
  CHECK_RESULTS,
  ENGINE_OUTCOMES,
  HANDED_HOW,
  OUTCOMES,
  PEAK_MARKS,
  PLACE_KINDS,
  RAISE_BY,
  RETRY_MODES,
  REVISION_KINDS,
  RUN_PHASES,
  RUN_REASONS,
  RUN_STATUSES,
  RUNS_IN_BY,
  SAID_AFTER,
  SPAN_AT,
  STEP_PHASES,
  STEP_REASONS,
  STEP_STATUSES,
  TOLD_VIA,
  TRY_CAUSES,
  WAIT_ON,
} from './words.ts';

/** An array as the package's types hold one, mutable, so a page built off the object keeps their types. */
const List = <S extends Schema.Top>(item: S) => Schema.mutable(Schema.Array(item));
const Strings = List(Schema.String);
const NullString = Schema.NullOr(Schema.String);
const NullNumber = Schema.NullOr(Schema.Finite);
const NullBoolean = Schema.NullOr(Schema.Boolean);

const StepStatusWord = Schema.Literals(STEP_STATUSES);
const StepPhase = Schema.Literals(STEP_PHASES);
const StepReason = Schema.Literals(STEP_REASONS);

/**
 * The run's name, when it was made, and the labels it is found by, one map (`metadataLabels`): its `workflow`, the `factory` it was
 * started in (`default` for the default one, as the feed says it), and a person's labels on it (`nemia label run`), as `-l` selects them.
 */
export const RunMetadata = Schema.Struct({
  name: Schema.String,
  creationTimestamp: Schema.String,
  labels: Schema.Record(Schema.String, Schema.String),
}).annotate({ identifier: 'RunMetadata' });
export type RunMetadata = typeof RunMetadata.Type;

/**
 * One step as the run froze it: what it waits on (`after`), whose declared output it is handed (`input`), and on a looping step the step
 * a round runs again and how many rounds it may run (`loop`, `rounds`; null on any other); then the rest of its frontmatter the board
 * shows, each null where the step does not set it: `fence` is the fence word the run froze for its session, said in this layer's word.
 */
export const RunSpecStep = Schema.Struct({
  name: Schema.String,
  after: Strings,
  input: Strings,
  loop: NullString,
  rounds: NullNumber,
  harness: NullString,
  model: NullString,
  effort: NullString,
  context: NullNumber,
  workspace: NullString,
  place: NullString,
  resume: NullString,
  fence: NullString,
  sandbox: NullString,
  tools: Schema.NullOr(Strings),
  deadlineSeconds: NullNumber,
}).annotate({ identifier: 'RunSpecStep' });
export type RunSpecStep = typeof RunSpecStep.Type;

/**
 * What the run was started with, frozen: its steps, its brief, the kind of place its work is on, and for a repository run the repository,
 * the base commit and branch its result goes to and whether it cut worktrees (null on a folder run); a folder run's work directory (null
 * on a repository run); the workflow folder it was started from, the agent a try from an agent's page tried, the runs it waits on and is
 * handed as context, and the inbox card it was started from (null for none).
 */
export const RunSpec = Schema.Struct({
  steps: List(RunSpecStep),
  brief: Schema.String,
  place: Schema.Literals(PLACE_KINDS),
  repo: NullString,
  baseRef: NullString,
  branch: NullString,
  isolate: NullBoolean,
  work: NullString,
  workflowDir: Schema.String,
  try: Schema.NullOr(Schema.Struct({ agent: Schema.String })),
  after: Strings,
  context: Strings,
  from: Schema.NullOr(Schema.Struct({ inbox: Schema.String })),
}).annotate({ identifier: 'RunSpec' });
export type RunSpec = typeof RunSpec.Type;

/** A check's verdict as codes (`CheckVerdict`, check.ts). */
const CheckVerdict = Schema.Struct({ result: Schema.Literals(CHECK_RESULTS), exit: NullNumber });

/**
 * The short of a step's current try (the page's `StepTry`): its number and the round of its loop it was filed in, where it stands as codes,
 * and how it signed off and its check's verdict where it has them (null where not).
 */
export const TryShort = Schema.Struct({
  try: Schema.Finite,
  round: Schema.Finite,
  phase: StepPhase,
  reason: StepReason,
  outcome: Schema.NullOr(Schema.Literals(OUTCOMES)),
  verdict: Schema.NullOr(CheckVerdict),
}).annotate({ identifier: 'TryShort' });
export type TryShort = typeof TryShort.Type;

/** A raise of a step's cap the package takes, and how it is asked for (`StepRaise`, retry/raise.ts). */
export const StepRaise = Schema.Struct({
  by: Schema.Literals(RAISE_BY),
  above: Schema.Finite,
  said: Schema.String,
  modes: List(Schema.Literals(RETRY_MODES)),
  own: Schema.NullOr(StepStatusWord),
}).annotate({ identifier: 'StepRaise' });
export type StepRaise = typeof StepRaise.Type;

/** One task on the clock (`TaskSpan`, timeline.ts). */
const TaskSpanSchema = Schema.Struct({
  taskId: Schema.String,
  at: Schema.Literals(SPAN_AT),
  filedAt: NullString,
  spawnedAt: NullString,
  endedAt: NullString,
  attempts: Schema.Finite,
  queuedMs: NullNumber,
  ranMs: NullNumber,
  queued: Schema.String,
  ran: Schema.String,
});

/** What a session consumed (`Consumed`, status.ts): each count where it was measured. */
const Consumed = Schema.Struct({
  responses: Schema.optionalKey(Schema.Finite),
  toolCalls: Schema.optionalKey(Schema.Finite),
  inputTokens: Schema.optionalKey(Schema.Finite),
  outputTokens: Schema.optionalKey(Schema.Finite),
  costUsd: Schema.optionalKey(Schema.Finite),
  apiMs: Schema.optionalKey(Schema.Finite),
  toolMs: Schema.optionalKey(Schema.Finite),
  cacheReadTokens: Schema.optionalKey(Schema.Finite),
  cacheWriteTokens: Schema.optionalKey(Schema.Finite),
  uncachedTokens: Schema.optionalKey(Schema.Finite),
  peakContextTokens: Schema.optionalKey(Schema.Finite),
  firstContextTokens: Schema.optionalKey(Schema.Finite),
  firstCacheWriteTokens: Schema.optionalKey(Schema.Finite),
  compactions: Schema.optionalKey(Schema.Finite),
  rebuiltCaches: Schema.optionalKey(Schema.Finite),
});

const PeakMark = Schema.NullOr(Schema.Literals(PEAK_MARKS));

/** What a step's try consumed, in `nemia decide`'s words, its peak against its `context:` (`StepUsed`, usage.ts). */
export const StepUsed = Schema.Struct({
  usage: Schema.NullOr(Consumed),
  used: Schema.String,
  cost: Schema.String,
  costUsd: NullNumber,
  apiMs: NullNumber,
  toolMs: NullNumber,
  read: NullString,
  peak: PeakMark,
  rebuilt: Schema.Finite,
}).annotate({ identifier: 'StepUsed' });
export type StepUsed = typeof StepUsed.Type;

/** What sessions cost together, each once (`Spent`, judged.verb.ts). */
export const Spent = Schema.Struct({
  usd: Schema.Finite,
  measured: Schema.Finite,
  unmeasured: Schema.Finite,
  said: Schema.String,
}).annotate({ identifier: 'Spent' });
export type Spent = typeof Spent.Type;

/** One try of a step on the clock (`TimelineTry`, timeline.ts), with what its session used in `nemia decide`'s words (null for none). */
const TimelineTry = Schema.Struct({
  try: Schema.Finite,
  round: Schema.Finite,
  session: Schema.NullOr(TaskSpanSchema),
  sessionOf: NullNumber,
  check: Schema.NullOr(TaskSpanSchema),
  used: Schema.NullOr(StepUsed),
  turn: Schema.optionalKey(Schema.Struct({ asked: Schema.Boolean, heldFrom: NullString, spawnedAt: NullString, endedAt: NullString })),
});

/**
 * The time of several tasks together (`TimelineTotal`, timeline.ts): a round of a loop, or the whole run's, and what the sessions it counts
 * cost (null until a cost was measured).
 */
const TimelineTotal = Schema.Struct({
  loop: NullString,
  round: NullNumber,
  tasks: Schema.Finite,
  inFlight: Schema.Finite,
  queuedMs: Schema.Finite,
  ranMs: Schema.Finite,
  wallMs: NullNumber,
  queued: Schema.String,
  ran: Schema.String,
  wall: Schema.String,
  cost: Schema.NullOr(Spent),
});

/** A check's stream as a person reads it: its last lines, and whether there were more (`StepLog`, checks.verb.ts). */
const StepLog = Schema.Struct({ lines: Strings, truncated: Schema.Boolean });

/** A step's check: its command, its task, its verdict and, refused, what it said (`StepCheck`, checks.verb.ts). */
export const StepCheck = Schema.Struct({
  command: Schema.String,
  taskId: NullString,
  verdict: Schema.NullOr(CheckVerdict),
  refused: Schema.NullOr(Schema.Struct({ exit: Schema.String, stdout: Schema.NullOr(StepLog), stderr: StepLog, unreadable: NullString })),
}).annotate({ identifier: 'StepCheck' });
export type StepCheck = typeof StepCheck.Type;

/** The release a session ran on (`SessionRelease`, release.ts): an install's tag, or a checkout's folder. */
const SessionReleaseSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('install'), tag: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('checkout'), root: Schema.String }),
]).annotate({ identifier: 'SessionRelease' });

/** How many attempts a try's task made, and how the latest went (`StepAttempts`, tries.verb.ts). */
export const StepAttempts = Schema.Struct({
  count: Schema.Finite,
  latest: Schema.NullOr(
    Schema.Struct({
      startedAt: Schema.String,
      ended: Schema.NullOr(Schema.Literals(ENGINE_OUTCOMES)),
      endedAt: NullString,
      reason: Schema.NullOr(Schema.Literals(ATTEMPT_ENDS)),
      release: Schema.NullOr(SessionReleaseSchema),
      harness: Schema.NullOr(Schema.Struct({ name: Schema.String, version: Schema.String })),
    }),
  ),
}).annotate({ identifier: 'StepAttempts' });
export type StepAttempts = typeof StepAttempts.Type;

/** What the engine filed a step's current try with (`StepFiled`, told.verb.ts), the fence it was filed with said in this layer's word. */
const StepFiled = Schema.Struct({
  model: NullString,
  askedModel: NullString,
  effort: NullString,
  contextTokens: NullNumber,
  fence: NullString,
  runsIn: Schema.NullOr(Schema.Struct({ mode: Schema.String, by: Schema.Literals(RUNS_IN_BY) })),
  remote: Schema.NullOr(Schema.Struct({ name: Schema.String, address: NullString })),
  bridge: Schema.NullOr(Schema.Struct({ url: NullString, why: NullString })),
  tools: Schema.NullOr(Strings),
  deadlineSeconds: NullNumber,
});

/** A file a closeout named, or a step's folder holds (`StepArtifact`, files.store.ts): served, pruned, or only its path. */
const StepArtifact = Schema.Union([
  Schema.Struct({
    path: Schema.String,
    name: Schema.String,
    url: Schema.String,
    kind: Schema.Literals(ARTIFACT_KINDS),
    size: Schema.Finite,
  }),
  Schema.Struct({ path: Schema.String, pruned: Schema.String, prunedAt: Schema.String }),
  Schema.Struct({ path: Schema.String }),
]);

/**
 * A step's gate, awaiting approval or approved (`StepGate`, tries.verb.ts) — and a looping step's, once a person approved its try out of
 * rounds as it stands (`nemia approve` of a loop), its approval that acceptance.
 */
const StepGate = Schema.Struct({
  awaiting: Schema.Boolean,
  approval: Schema.NullOr(Schema.Struct({ try: Schema.Finite, at: Schema.String, message: NullString })),
});

/** Words a person said to a session while it ran (`Said`, say.ts). */
const Said = Schema.Struct({
  at: Schema.String,
  attempt: Schema.Finite,
  text: Schema.String,
  after: Schema.optionalKey(Schema.NullOr(Schema.Struct({ kind: Schema.Literals(SAID_AFTER), id: Schema.String }))),
});

/** A step's cap, and what its tries have cost of it. */
const StepBudget = Schema.Struct({ usd: Schema.Finite, said: Schema.String, of: NullString, over: Schema.Boolean });

/**
 * A step now: where it stands as codes and in its word, the raise of its cap the package takes (null where none), its tries on the clock
 * (`TimelineTry`), the short of its current try (null while it has none); then all the board shows of it but its tries whole and what
 * it was told (its sub-resources) — its task and place, its folder's files, its note, what it needs of a person, its gate, what was said
 * to it and asked of it, its current try's check and attempts, and what it used, cost and may cost. The lines a person types for it are
 * the command table's, not the step's: the lines read beside the object builds them (`runLines`, lines.verb.ts).
 */
export const RunStepStatus = Schema.Struct({
  name: Schema.String,
  phase: StepPhase,
  reason: StepReason,
  status: StepStatusWord,
  on: Schema.NullOr(Schema.Literals(WAIT_ON)),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)),
  message: Schema.String,
  verdict: Schema.NullOr(CheckVerdict),
  raise: Schema.NullOr(StepRaise),
  timeline: List(TimelineTry),
  current: Schema.NullOr(TryShort),
  filed: Schema.NullOr(StepFiled),
  taskId: NullString,
  workspace: NullString,
  branch: NullString,
  files: List(StepArtifact),
  filesError: NullString,
  note: NullString,
  roundDue: Schema.Boolean,
  needs: NullString,
  waitingFor: Schema.NullOr(Schema.Struct({ words: Schema.String, advice: Schema.String })),
  approve: NullString,
  denied: Schema.NullOr(Schema.Struct({ words: Schema.String, calls: Strings })),
  sessionUnread: NullString,
  lastLine: NullString,
  gate: Schema.NullOr(StepGate),
  said: List(Said),
  asked: Schema.NullOr(
    Schema.Struct({
      try: Schema.Finite,
      mode: Schema.Literals(RETRY_MODES),
      model: NullString,
      message: NullString,
      stopFirst: Schema.Boolean,
    }),
  ),
  check: Schema.NullOr(StepCheck),
  attempts: StepAttempts,
  used: Schema.NullOr(StepUsed),
  spent: Schema.NullOr(Spent),
  budget: Schema.NullOr(StepBudget),
}).annotate({ identifier: 'RunStepStatus' });
export type RunStepStatus = typeof RunStepStatus.Type;

/** The runs a run waits on or is held until, each that has not landed and why it never will on its own (`RunWaiting`, `RunHolding`). */
const waitedRun = { run: Schema.String, missing: Schema.Boolean, cancelledAt: NullString, gone: Strings };

/** What a person has to decide (`RunToDecide`, judged.verb.ts): an approval at a gate, or the result branches. */
const RunToDecide = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('approve'),
    step: Schema.String,
    says: NullString,
    filed: Schema.Boolean,
    back: Strings,
    onto: NullString,
    said: Schema.String,
    command: Schema.String,
  }),
  Schema.Struct({ kind: Schema.Literal('result'), branches: Strings, said: Schema.String, command: Schema.String }),
]);

/** One kind and name the run or a step of it is behind the files on (`Drift`, revisions.ts). */
const Drift = Schema.Struct({
  kind: Schema.Literals(REVISION_KINDS),
  name: Schema.String,
  pinned: Schema.Finite,
  now: Schema.Finite,
  step: Schema.optionalKey(Schema.String),
});

/**
 * The run now: the runs list's judged fields (`judgedFields`) — its word and codes, whether it moves, its cost, time at work and tokens,
 * what it waits on, its hold and what a person has to decide — then its graph, where its time went as a whole (`Timeline`'s rounds, run
 * and slot), and each step; and the rest of what the board shows of it but the lines to type, which are the command table's: when it
 * started and was called off, what a prune took and would find, the runs it is held until, what its sessions read, who it waits on, its
 * gates, a warning on its folder, and the kinds it is behind the files on.
 */
export const RunStatus = Schema.Struct({
  status: Schema.Literals(RUN_STATUSES),
  phase: Schema.Literals(RUN_PHASES),
  reason: Schema.Literals(RUN_REASONS),
  on: Schema.NullOr(Schema.Literals(WAIT_ON)),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)),
  moving: Schema.Boolean,
  cost: Schema.NullOr(Spent),
  atWork: Schema.NullOr(Schema.Struct({ ms: Schema.Finite, since: NullString, endedAt: NullString })),
  tokens: Schema.NullOr(
    Schema.Struct({
      total: Schema.Finite,
      input: Schema.Finite,
      output: Schema.Finite,
      cacheRead: NullNumber,
      cacheWrite: NullNumber,
      uncached: NullNumber,
      measured: Schema.Finite,
      unmeasured: Schema.Finite,
      said: Schema.String,
      split: Schema.String,
    }),
  ),
  waiting: Schema.NullOr(
    Schema.Struct({
      runs: List(Schema.Struct(waitedRun)),
      word: Schema.String,
      advice: Schema.String,
      waitingOnYou: Schema.Boolean,
    }),
  ),
  holding: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      runs: List(Schema.Struct({ ...waitedRun, landed: Schema.Boolean })),
      word: Schema.String,
      advice: Schema.String,
      waitingOnYou: Schema.Boolean,
    }),
  ),
  toDecide: Schema.NullOr(RunToDecide),
  graph: ObjectGraph,
  timeline: Schema.Struct({
    rounds: List(TimelineTotal),
    run: TimelineTotal,
    slot: Schema.NullOr(Schema.Struct({ from: Schema.String, filedAt: NullString, ms: NullNumber, queued: Schema.String })),
  }),
  steps: List(RunStepStatus),
  startedAt: NullString,
  cancelledAt: NullString,
  pruned: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      worktrees: List(Schema.Struct({ path: Schema.String, bytes: Schema.Finite })),
      artifacts: Schema.NullOr(Schema.Struct({ at: Schema.String, bytes: Schema.Finite })),
    }),
  ),
  onDisk: Schema.Struct({ worktrees: Schema.Boolean, files: Schema.Boolean }),
  holdUntil: Strings,
  read: Schema.NullOr(Schema.Struct({ said: Schema.String, peak: PeakMark, rebuilt: Schema.Finite })),
  waitingOnYou: Strings,
  waitingOnYouWords: Strings,
  gates: Strings,
  warning: NullString,
  kinds: List(Drift),
}).annotate({ identifier: 'RunStatus' });
export type RunStatus = typeof RunStatus.Type;

/** The run as one object: `nemia/v1`'s `Run`. */
export const Run = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Run'),
  metadata: RunMetadata,
  spec: RunSpec,
  status: RunStatus,
}).annotate({ identifier: 'Run' });
export type Run = typeof Run.Type;

/** A closeout's questions under one field of its output (`Asked`, question.ts). */
const Asked = Schema.Struct({
  field: Schema.String,
  questions: List(
    Schema.Struct({
      title: Schema.String,
      body: Schema.String,
      options: List(Schema.Struct({ label: Schema.String, meaning: Schema.String })),
      recommended: Schema.NullOr(Schema.Union([Schema.String, List(Schema.String)])),
      multiple: Schema.Boolean,
    }),
  ),
});

/** A JSON object whose keys a step's workflow decides (a closeout's `output`, the schema it was read by). */
const Fields = Schema.Record(Schema.String, Schema.Unknown);

/**
 * What a try signed off with, as the page reads it (`StepCloseout`, tries.verb.ts): its outcome, summary, body and needs, the files and
 * values it handed on, the fields its workflow asked for (`output`) and the schema they were read by, the replies to findings, its
 * questions, what it left out or was refused, and the closeout as it came (`raw`).
 */
export const StepCloseout = Schema.Struct({
  apiVersion: NullString,
  outcome: Schema.Literals(OUTCOMES),
  summary: Schema.String,
  body: NullString,
  needs: NullString,
  artifacts: List(StepArtifact),
  values: List(Schema.Struct({ name: Schema.String, value: Schema.String, link: NullString })),
  refused: Strings,
  output: Fields,
  missing: Strings,
  replies: Schema.NullOr(List(Schema.Struct({ finding: Schema.String, answer: Schema.String, why: Schema.String }))),
  schema: Fields,
  questions: List(Asked),
  raw: Schema.Unknown,
}).annotate({ identifier: 'StepCloseout' });
export type StepCloseout = typeof StepCloseout.Type;

/** Why a try's closeout does not read, and what it held (`StepUnreadable`, tries.verb.ts). */
export const StepUnreadable = Schema.Struct({ error: Schema.String, raw: Schema.Unknown }).annotate({ identifier: 'StepUnreadable' });
export type StepUnreadable = typeof StepUnreadable.Type;

/**
 * One try of a step whole (`StepTry`, tries.verb.ts): its number, round and why it was moved behind (null for the current), its task, where
 * it stands as codes and in words, its attempts, check, closeout or why that does not read, and a person's answer to it.
 */
export const StepTry = Schema.Struct({
  try: Schema.Finite,
  round: Schema.Finite,
  cause: Schema.NullOr(Schema.Literals(TRY_CAUSES)),
  current: Schema.Boolean,
  taskId: NullString,
  note: NullString,
  phase: StepPhase,
  reason: StepReason,
  on: Schema.NullOr(Schema.Literals(WAIT_ON)),
  via: Schema.NullOr(Schema.Literals(ANSWER_VIA)),
  message: Schema.String,
  attempts: StepAttempts,
  check: Schema.NullOr(StepCheck),
  closeout: Schema.NullOr(StepCloseout),
  unreadable: Schema.NullOr(StepUnreadable),
  answer: NullString,
}).annotate({ identifier: 'StepTry' });
export type StepTry = typeof StepTry.Type;

/** A step's tries, earliest first, the current one last: `GET /api/runs/:runId/steps/:step/tries`. */
export const StepTries = Schema.Struct({ tries: List(StepTry) }).annotate({ identifier: 'StepTries' });
export type StepTries = typeof StepTries.Type;

/** What a try of a step signed off with, or why it does not read (each null where there is none): `…/tries/:try/closeout`. */
export const TryCloseout = Schema.Struct({
  try: Schema.Finite,
  closeout: Schema.NullOr(StepCloseout),
  unreadable: Schema.NullOr(StepUnreadable),
}).annotate({ identifier: 'TryCloseout' });
export type TryCloseout = typeof TryCloseout.Type;

/** What a step was told by layer (`ToldLayers`, brief.ts). */
const ToldLayers = Schema.Struct({
  agent: NullString,
  instructions: NullString,
  custom: NullString,
  factory: NullString,
  agentSkills: Strings,
  policy: Schema.String,
  addedSkills: Strings,
  fence: List(Schema.Struct({ key: Schema.String, value: Schema.String })),
  folderFiles: Schema.Boolean,
  task: NullString,
  via: Schema.Literals(TOLD_VIA),
});

/** A part of a step's task (`TaskPart`, told.verb.ts): its own text, or a run's section, with how the run was handed. */
const TaskPart = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('text'), text: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('from'),
    run: Schema.String,
    asked: Schema.String,
    body: Schema.String,
    how: Schema.optionalKey(Schema.Literals(HANDED_HOW)),
  }),
]);

/**
 * What a step was told (`toldOf`, told.verb.ts): its own body in the workflow (null where none shows it), its brief, by layer, and its
 * task by part: `GET /api/runs/:runId/steps/:step/told`.
 */
export const StepTold = Schema.Struct({
  body: NullString,
  told: NullString,
  layers: Schema.NullOr(ToldLayers),
  taskParts: Schema.NullOr(List(TaskPart)),
}).annotate({ identifier: 'StepTold' });
export type StepTold = typeof StepTold.Type;

/** A person's labels: a key to its value, Kubernetes' `map[string]string`. */
export const Labels = Schema.Record(Schema.String, Schema.String).annotate({ identifier: 'Labels' });

/**
 * An edit of a run's or a card's labels: kubectl's words, `key=value` to set and `key-` to remove, and whether a set may change a
 * value.
 */
export const LabelEdit = Schema.Struct({
  labels: Schema.Array(Schema.String),
  overwrite: Schema.optionalKey(Schema.Boolean),
}).annotate({ identifier: 'LabelEdit' });
export type LabelEdit = typeof LabelEdit.Type;

/** What an edit did: the run or the card, by its name, its person labels after (`labels`) and before (`was`). */
export const Labelled = Schema.Struct({
  kind: Schema.Literals(['Run', 'Card']),
  name: Schema.String,
  labels: Labels,
  was: Labels,
}).annotate({ identifier: 'Labelled' });
export type Labelled = typeof Labelled.Type;
