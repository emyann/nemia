/**
 * Run-core's model: a run, its steps, their tries and rounds, and its landing, as Schemas at the context's door (decisions Q3–Q6).
 * A declaration in S1: no read path decodes through it yet; the Run door (S2) will.
 */
import { Schema } from 'effect';
import { Actor } from 'objects';
import { foreignId, brandedCount, brandedId, type Count, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { stepTaskId, type LandingRecord, type RouteBy, type StepRecord } from './record.ts';
import { idRefusal } from '../forget/forget.ts';
import { FrozenWorkflowStep, StepName, WorkflowDir, WorkflowName } from '../folder/folder.model.ts';
import { TRY_CAUSES, upgradeTries } from '../retry/index.ts';
import { HarnessSettings } from '../harness-settings/harness-settings.model.ts';
import { REVISION_KINDS } from '../revisions/revisions.ts';
import type { StepSpec } from '../step/step.ts';

/** What a stored record is read through before `Run` reads it, as the store does: a try's former `then` read as its `cause`. */
export { upgradeTries };

/** A run's id, as `runId` mints it (`record.store.ts`) and `idRefusal` takes it. */
export const RunId = brandedId('RunId', (value) => idRefusal(value));
export type RunId = Id<'RunId'>;

/** A step's name and a workflow's: the definition's ids (`folder/folder.model.ts`), which a run's record names. */
export { StepName, WorkflowName };

/** A try's number within its step, from 1. */
export const TryNumber = brandedCount('TryNumber', 1);
export type TryNumber = Count<'TryNumber'>;

/** The runtime's task a try ran as: the runtime's id, held by key alone (only `runtime-client.ts` imports the runtime). */
export const TaskId = foreignId('TaskId');
export type TaskId = Id<'TaskId'>;

/**
 * A factory's name and a card's name, as a run holds them (`factory`, `scheduled.factory`, `from.inbox`): by key, since the factory's
 * and the inbox's models import this one; the same types as theirs.
 */
const FactoryName = foreignId('FactoryName');
const CardName = foreignId('CardName');

/** A check of a step's work, a task of its own (`checkTaskId`, record.ts:397). */
const CheckTask = Schema.Struct({ taskId: TaskId.OnRead });

/** Words said to a step before it was filed (`SaidBefore`, record.ts): when, and the words as said. */
const SaidBefore = Schema.Struct({ at: Schema.String, text: Schema.String });

/** Why a try was moved behind the next (`TRY_CAUSES`): a record's former `then` is read as it (`upgradeTries`) before this reads it. */
const TryCause = Schema.Literals(TRY_CAUSES).annotate({ identifier: 'TryCause' });

/**
 * A try behind a step's current one (`EarlierTry`): the task it ran as, its check, how it ended, and what a person gave the try
 * after it. Numbered by its place in the step's `tries`, from 1 (`tryOf`, record.ts:363): the record writes no number.
 */
export const Try = Schema.Struct({
  taskId: TaskId.OnRead,
  check: Schema.optional(CheckTask),
  cause: TryCause,
  model: Schema.optional(Schema.String),
  paused: Schema.optional(Schema.Literal(true)),
  budget: Schema.optional(Schema.Number),
}).annotate({ identifier: 'Try' });
export type Try = typeof Try.Type;

/** A key a member of the run's union refuses, since the other member names it: absent, or `undefined`. */
const none = Schema.optional(Schema.Undefined);

/**
 * What the run did with the merge an ending staged (`LandingRecord`, record.ts): the commit it made, the abort and why, or nothing
 * touched — exactly one, as the check holds it. Typed as the `LandingRecord` union every writer of `landed` is typed by, which the check
 * makes it: a member of the union refusing the others' keys would leave a reader's `'commit' in landed` narrowing nothing.
 */
export const Landing = Schema.Struct({
  commit: Schema.optional(Schema.String),
  aborted: Schema.optional(Schema.String),
  refusedOn: Schema.optional(Schema.String),
  untouched: Schema.optional(Schema.String),
})
  .check(
    Schema.makeFilter(
      (l) =>
        [l.commit, l.aborted, l.untouched].filter((v) => v !== undefined).length === 1 ||
        'a landing is one of `commit`, `aborted` or `untouched`: write the one the pass did (`LandingRecord`, record.ts)',
    ),
  )
  .annotate({ identifier: 'Landing' }) as unknown as Schema.Codec<LandingRecord>;
export type Landing = typeof Landing.Type;

/**
 * One step on a run's record (`StepRecord`): its current try's task — `null` while nothing of it is filed — and check, where it
 * works, the tries behind it, and what the run did with it. Its name is its key in the run's `steps`.
 */
/** A revision a run is behind the files on (`Pin`, revisions/revisions.ts): one of the revisions' own kinds (`REVISION_KINDS`). */
const Pin = Schema.Struct({ kind: Schema.Literals(REVISION_KINDS), name: Schema.String, n: Schema.Number, hash: Schema.String });

/** The route a condition's try took, as the tick copied it once (`RouteRecord`, record.ts). */
const RouteRecord = Schema.Struct({
  route: Schema.String,
  try: Schema.Number,
  by: Schema.Literals(['table', 'script', 'judge', 'person'] as const satisfies readonly RouteBy[]),
});

export const Step = Schema.Struct({
  taskId: Schema.NullOr(TaskId.OnRead),
  route: Schema.optional(RouteRecord),
  sent: Schema.optional(Schema.Struct({ card: Schema.String, at: Schema.String })),
  pinned: Schema.optional(Schema.Array(Pin)),
  workspace: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  check: Schema.optional(CheckTask),
  tries: Schema.optional(Schema.Array(Try)),
  handedOff: Schema.optional(TaskId.OnRead),
  landed: Schema.optional(Landing),
  filesRead: Schema.optional(Schema.Struct({ taskId: TaskId.OnRead, lacked: Schema.Record(Schema.String, Schema.String) })),
  closeoutHash: Schema.optional(Schema.String),
  declared: Schema.optional(Schema.Array(Schema.String)),
}).annotate({ identifier: 'Step' });
export type Step = typeof Step.Type;

/**
 * A loop asked round again by a person (`RoundAsk`, read off `runs/<id>.asks/round-<step>-<n>` by `roundAskIn` in record.store.ts):
 * the looping step, the round, the cap `--budget` raised, when, and the merge `nemia refresh --base` asks with it. Beside the record, not
 * in it; a loop's own round is a try moved behind with `cause: 'round'`.
 */
export const Round = Schema.Struct({
  step: StepName.OnRead,
  round: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  budget: Schema.optional(Schema.Number),
  at: Schema.String,
  merge: Schema.optional(
    Schema.Struct({
      target: StepName.OnRead,
      try: TryNumber.OnRead,
      onto: Schema.String,
      sha: Schema.String,
      landing: Schema.optional(Schema.Struct({ step: StepName.OnRead, check: TaskId.OnRead })),
    }),
  ),
}).annotate({ identifier: 'Round' });
export type Round = typeof Round.Type;

/** Each step's tasks in try order, from 1: the tries behind it, then its current one when filed. */
const tasksInOrder = (step: Step): Array<string> => [
  ...(step.tries ?? []).map((t) => t.taskId),
  ...(step.taskId === null ? [] : [step.taskId]),
];

/**
 * A try's task is `stepTaskId(run, step, n)` for its own number n (record.ts:401), as every filing names it (`tick/file.verb.ts:196`,
 * `:369`, `:587`, and the adoptions after a pass that died, `tick/advance.verb.ts:142`, `:175`, `:209`), or the task of the try
 * before it, which a recheck keeps
 * (`nextTry`, `retry/retry-ask.ts:187`) and a try answered into the session it holds open keeps (`tick/file.verb.ts:196`,
 * `tick/advance.verb.ts:138`). So a try lost from `tries` — a gap in the numbers — shows as the next one's task named for another try.
 */
const triesNamed = Schema.makeFilter((run: { id: string; steps: Readonly<Record<string, Step>> }) => {
  for (const [name, step] of Object.entries(run.steps)) {
    const tasks = tasksInOrder(step);
    const at = tasks.findIndex((task, i) => task !== stepTaskId(run, name, i + 1) && (i === 0 || task !== tasks[i - 1]));
    if (at !== -1)
      return `step ${name}'s try ${at + 1} ran as ${tasks[at]}, which is neither ${stepTaskId(run, name, at + 1)} nor the task of the try before it: a step's tries are filed under stepTaskId (record.ts:401) — put back the try its tries are missing, or the task id it was filed under`;
  }
  return true;
});

/**
 * A run never waits on itself: `afterRefusal` refuses an id the store has no record of (`wait/wait.ts:284`), and the run's own id is
 * minted untaken after it (`start/start.verb.ts:547`).
 */
const afterOthers = Schema.makeFilter(
  (run: { id: string; after?: ReadonlyArray<string> | undefined }) =>
    !(run.after ?? []).includes(run.id) ||
    `run ${run.id} waits on itself in its after, and would never be filed: take ${run.id} out of its after`,
);

/** What people approved at a gate, composed on read (`Approval`, record.ts). */
const Approval = Schema.Struct({
  step: Schema.String,
  try: Schema.Number,
  at: Schema.String,
  message: Schema.optional(Schema.String),
  budgets: Schema.optional(Schema.Record(Schema.String, Schema.Number)),
  actor: Schema.optional(Actor),
});

/** A loop a person ended, composed on read (`Acceptance`, record.ts). */
const Acceptance = Schema.Struct({
  step: Schema.String,
  try: Schema.Number,
  at: Schema.String,
  message: Schema.String,
  actor: Schema.optional(Actor),
});

/** A person's hold on a run, composed on read (`Hold`, record.ts). */
const Hold = Schema.Struct({
  at: Schema.String,
  until: Schema.Array(Schema.String),
  why: Schema.optional(Schema.String),
  by: Schema.optional(Schema.String),
  actor: Schema.optional(Actor),
});

/** What `nemia prune` removed of a run, composed on read (`Pruned`, record.ts). */
const Pruned = Schema.Struct({
  at: Schema.String,
  worktrees: Schema.Array(Schema.Struct({ path: Schema.String, bytes: Schema.Number })),
  artifacts: Schema.optional(Schema.Struct({ at: Schema.String, bytes: Schema.Number })),
});

/** A folder a step may reach beyond its workspace (`Mount`, record.ts). */
const Mount = Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean });

/** The store's pause, composed onto every run read (`Pause`, pause/pause.ts). */
const Pause = Schema.Struct({
  at: Schema.String,
  by: Schema.String,
  why: Schema.optional(Schema.String),
  timeoutMs: Schema.optional(Schema.Number),
  actor: Schema.optional(Actor),
});

/**
 * The fields every run's record has, whatever its place: what it was started on and with, frozen at start, its steps by name, and what
 * the tick wrote down of it. It names the workflow's folder it started on (`workflowDir`, read nominally, so no stored record is refused)
 * and the steps it froze at start (`workflow`, read loosely, `FrozenWorkflowStep`); the counters the tick keeps for the metrics
 * (`gatesTimed`, `deniedCounted`, `settlesCounted`, `runTimed`, `slotHeldAt`); the revisions it is behind (`pinned`, read loosely, the
 * revisions' own); and what `runRecord` composes on read and the store's write drops (`approvals`, `acceptances`, `pruned`, `hold`,
 * `pause`, and a person's `labels` and `saidBefore`), whose shapes a run written back is held to.
 */
/**
 * A step of the workflow a run froze, decoded loosely (`FrozenWorkflowStep`, so a record an older or newer tick wrote is not refused) and
 * typed as what `nemia start` froze into it, the parser's step (`StepSpec`): every reader of the frozen copy reads it as the parser's.
 */
const FrozenSteps = FrozenWorkflowStep as unknown as Schema.Codec<StepSpec>;

const runFields = {
  id: RunId.OnRead,
  /**
   * Where the run's first step works: its repository's checkout, or a folder run's own folder. Later steps inherit, fork or merge from it.
   */
  workspace: Schema.String,
  /** What the person actually asked for. This travels to EVERY step; it is the spec. */
  brief: Schema.String,
  workflowDir: WorkflowDir.OnRead,
  /**
   * The workflow as it was when the run started, read once by `nemia start` and never again.
   *
   * A fence, not a cache. The folder is a path anybody can edit — with `--no-worktree` a step works
   * in the very checkout it lives in — and a `check:` is the command that judges a step: one the step
   * could rewrite would be a step marking its own homework. Every pass reads this. Absent, the folder
   * is read.
   */
  workflow: Schema.optional(Schema.Array(FrozenSteps)),
  /**
   * The runs this one waits on (`nemia start --after`), frozen at start like the workflow: none of its steps is filed until
   * every one of them has landed (`runReady`). Absent on a run that waits on none.
   */
  after: Schema.optional(Schema.Array(RunId.OnRead)),
  /**
   * The runs this one is handed as context (`nemia start --from`, a card's `from:`), frozen at start: what each concluded is read once, on
   * the pass that files the roots, and none is ever waited on. Absent on a run handed none.
   */
  context: Schema.optional(Schema.Array(RunId.OnRead)),
  /**
   * The files `nemia start --input` copied into the run's own `inputs/` directory (`inputsDir` in record.store.ts), by name, in the order
   * given. Named on every step's brief that carries what was asked for (`inputsLine`), and under the run's line in `nemia decide`. Absent
   * on a run given none.
   */
  inputs: Schema.optional(Schema.Array(Schema.String)),
  /**
   * The inbox cards `nemia start --card` handed the run, by name, in the order given: each copied at start into the run's
   * `inputs/cards/<name>.md` (`cardsDir` in record.store.ts), so a card edited or removed since reads as it was. Named on every step's
   * brief beside the inputs (`inputsLine`). Absent on a run handed none.
   */
  cards: Schema.optional(Schema.Array(Schema.String)),
  /**
   * The digest's hex of the run's own copy of its workflow folder (`workflowFilesDir` in frozen.store.ts), which its next filings take:
   * every check and session is told the folder as `WF_WORKFLOW_FILES`. Taken at `nemia start` (`freezeWorkflowFiles`) and again wherever
   * the run's pins move (`renderAgain`), so a check line and the scripts it runs are the one revision. Absent on a run started before
   * the copy was taken.
   */
  workflowFiles: Schema.optional(Schema.String),
  /**
   * The digest's hex of the run's own copy of the carried folder beside its workflow's (`carriedFilesDir` in frozen.store.ts): every check
   * and session is told it as `WF_CARRIED_FILES`. Taken with `workflowFiles`, at `nemia start` and wherever the run's pins move
   * (`renderAgain`); absent where no `carried/` stands beside the workflow's folder.
   */
  carriedFiles: Schema.optional(Schema.String),
  /**
   * Where the run came from, when it was not typed at `nemia start`: `{ inbox: <name> }` for a card started out of the inbox
   * (`startFromInbox` in inbox.verb.ts), which keeps the card. The inbox's listing reads it to give the card its state, `started` while
   * this record stands, and `nemia inbox` to say it was `started as` this run, and `nemia decide` names the card under the run's line.
   * Absent on a run started any other way.
   */
  from: Schema.optional(Schema.Struct({ inbox: CardName.OnRead })),
  /**
   * The schedule that started the run, when the tick did (`startDue` in schedule.verb.ts): the factory, the workflow, and the fire it was
   * started for (`due`). The schedule's last run is read off it. Absent on a run started any other way.
   */
  scheduled: Schema.optional(Schema.Struct({ factory: FactoryName.OnRead, workflow: WorkflowName.OnRead, due: Schema.String })),
  /**
   * The steps this run is gated at beyond those its workflow gates (`gate: true`), frozen at start: `nemia start --gate <step>`, and an
   * inbox card's `gate:`. Each such step's closeout waits for a person — `nemia approve` — before anything after it is filed (`hasGate`).
   * Absent on a run given none.
   */
  gates: Schema.optional(Schema.Array(StepName.OnRead)),
  /**
   * The model each step this run names runs on, for this run alone, by the step's name, frozen at start: `nemia start --model
   * <step>=<model>`, and an inbox card's `model:`. Set on the step in `workflow` at start and on every revision the run takes after it
   * (`withModels`), so each filing reads it where it reads a step's `model:`; every other step runs on its agent's. Absent on a run given
   * none.
   */
  models: Schema.optional(Schema.Record(StepName.OnRead, Schema.String)),
  /**
   * The factory the run was started in (`nemia start --factory`), frozen at start: its hires filled the steps, and a repository run's
   * `repo` is one of its repositories. Absent on a run in the default factory, which is every record written before a run named its
   * factory.
   */
  factory: Schema.optional(FactoryName.OnRead),
  /**
   * The folders beyond its workspace each local step may read, frozen at start from the factory (`factoryMounts`): its repositories but
   * the run's own, each read-only, left out when it was no directory at start. Filed with every local step (`filedConfig`), named on its
   * brief (`mountsLine`), so a later change to the factory changes no run started. Absent: none.
   */
  mounts: Schema.optional(Schema.Array(Mount)),
  /**
   * The factory's volumes, frozen at start from its file (`factoryVolumes`): folders of the person's machine apart from its
   * repositories, each marked as the factory named it, left out when it was no directory at start. Filed with every local step beside
   * `mounts` (`volumeMounts`), a writable one writable only where the step's fence writes, and named on its brief. Kept apart from
   * `mounts` so that `writable:` never widens one by its folder's name. A writable volume is not the run's workspace: nothing commits,
   * lands or reverts what a step writes there. Absent: none.
   */
  volumes: Schema.optional(Schema.Array(Mount)),
  /**
   * The factory's harness settings, frozen at start from its file once judged (`harnessSettingsRefusal`): the settings of a harness each
   * step of the run on it is given on top of the repository's own, its own agent's laid over them (`filedConfig`), so a later change to
   * the factory changes no run started. Read as the record holds it, among the keys the store keeps unnamed, and judged again key by key
   * at each filing (`filedSettings`), so a hand-edited record files no key a factory may not set. Absent: none, and in the
   * default factory.
   */
  harnessSettings: Schema.optional(HarnessSettings),
  /**
   * The cost line the factory set for the run's workflow (`costLines`, `nemia factory cost-line set`), in dollars, frozen at start so a
   * later change to the factory changes no run started. A gate whose caps let the run cost more says so (`GateBudgets.line`,
   * `pastTheLine`), and no rule of auto approves it unasked (`withinBudget`); it cuts nothing. Absent: none set for the workflow, and in
   * the default factory.
   */
  costLine: Schema.optional(Schema.Finite),
  /**
   * Each result branch's commit, as this run's own tick last saw it once the run had finished (`tipsSeen`): what `nemia decide` offers to
   * land. Kept so that once a person has deleted the branch after the merge, git can still be asked whether that commit is on the base
   * (the place's `standing`, `standingNow`) — by this run's own `nemia decide`, and by a run that waits on it. Absent until the run has
   * finished.
   */
  tips: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  /**
   * When somebody called the run off, if they did.
   *
   * On the run rather than on a step, because that is what it is about: stopping the step in
   * flight is one consequence of it, and "file nothing further" is the other, and no step's task
   * can hold the second one.
   */
  cancelledAt: Schema.optional(Schema.String),
  /**
   * Who called the run off (objects' `Actor`), kept with `cancelledAt` in its file, the first cancellation's: absent on a run cancelled
   * in-process, and on one cancelled before actors were said.
   */
  cancelledBy: Schema.optional(Actor),
  /**
   * A person's labels on the run (`nemia label run`, and what `nemia start` copied once, at creation): free `key=value` pairs, never a
   * closed key (`factory`, `workflow`), which the run's whole map adds itself (`metadataLabels`). Composed onto every read of the store
   * from a file of its own, `runs/<id>.labels` (`labelled` in files.store.ts), never written into the record, and removed by `nemia rm`
   * with the run. Absent on a run nobody labelled.
   */
  labels: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  /**
   * What was said to each step before it was filed (`nemia say` to a step with no task and no try behind it), by step, in the order said:
   * when, and the words as said (`text`, an agent's in the frame that names it, as the engine journals words said to a session). Kept for
   * the step's first try, whose brief carries them (`saidBeforeSection`), and for no try after. Composed onto every read of the store from
   * a folder of its own, `runs/<id>.said/` (`runRecord` in record.store.ts), never written into the record, and removed by `nemia rm`
   * with the run. Absent on a run nobody said anything to before a step ran.
   */
  saidBefore: Schema.optional(Schema.Record(Schema.String, Schema.Array(SaidBefore))),
  /**
   * When the cap on runs in flight (`WF_MAX_RUNS`) first held this run, with nothing of it filed: written once, by the pass that held it.
   * What says the time before its first filing was a wait for a run slot (`timeline`). Absent on a run the cap never held.
   */
  slotHeldAt: Schema.optional(Schema.String),
  /**
   * The approvals whose gate wait the tick has put into the metrics (`gateWaits`), by step and try: each written by the pass that read the
   * approval first, so a pass after a restart, which reads the same approval, emits none again. `[]` on a run started with it; absent on a
   * record written before it, whose gates are never timed. A gate approved on a try that answered an earlier try's session is timed only
   * while `runTimed` is `false`.
   */
  gatesTimed: Schema.optional(Schema.Array(Schema.Struct({ step: Schema.String, try: Schema.Number }))),
  /**
   * The sessions whose denied calls the tick has handed the metrics (`deniedCalls`), by task: how many of its attempts, from the first, are
   * counted. Written by the pass that counts them, so a pass after a restart, which reads the same attempts, counts none again. `[]` on a
   * run started with it; absent on a record written before it, whose denied calls are never counted.
   */
  deniedCounted: Schema.optional(Schema.Array(Schema.Struct({ task: Schema.String, attempts: Schema.Number }))),
  /**
   * The tasks whose settle the tick has handed the metrics (`settlesDue`), a session's and a check's alike: each written by the pass that
   * first reads it settled, so a pass after a restart, which reads the same task settled, counts none again, and a task that settled
   * while no daemon read is counted by the first that does. `[]` on a run started with it; absent on a record written before it, whose
   * settles are never counted.
   */
  settlesCounted: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Whether the tick has handed the run's timeline to the metrics (`timelineFacts`): `false` on a run started with it, `true` once the
   * pass that read the run over, with nothing of it in flight, has written it, so a pass after a restart hands none again. Absent on a
   * record written before it, whose timeline is never handed over.
   */
  runTimed: Schema.optional(Schema.Boolean),
  /**
   * What people approved at a gate (`nemia approve`), each in a file of its own beside the retry asks —
   * `runs/<id>.asks/approve-<step>-<try>` — composed on read, as `cancelledAt` is (`runRecord` in record.store.ts), and never written into
   * the record: the tick owns the record, a person owns their word. An approval opens a gate for the try it names (`approvalOf`), and one
   * for an earlier try is spent. Absent when there are none.
   */
  approvals: Schema.optional(Schema.Array(Approval)),
  /**
   * What people accepted at a loop out of rounds (`nemia approve`), each in a file of its own beside the approvals —
   * `runs/<id>.asks/accept-<step>-<try>` — composed on read like them, and never written into the record. An acceptance ends the loop on a
   * person's word where the looping step asked for another round it has no rounds left for: what waits on it is filed as if it had said
   * `again: false`, with its findings still on the record (`acceptanceOf`). One for an earlier try is spent. Absent when there are none.
   */
  acceptances: Schema.optional(Schema.Array(Acceptance)),
  /**
   * When `nemia prune` removed the run's worktrees, and which, with what each held on disk — composed on read from a file of its own,
   * `runs/<id>.pruned`, as `cancelledAt` is (`runRecord` in record.store.ts), and never written into the record. A pruned run is read as it
   * was, off its record, its branches and its files directory, and nothing more of it is filed: every verb that would work in a worktree
   * refuses it (`prunedRefusal`), and so does every pass (`advance`). Absent on a run nobody pruned.
   */
  pruned: Schema.optional(Pruned),
  /**
   * That a person holds the run until other runs land (`nemia hold <run> --until <run>…`), and since when — composed on read from a file of
   * its own, `runs/<id>.hold`, as `cancelledAt` is, and never written into the record. While it stands the run files nothing new, and no
   * verb offers or takes an approval, a try, a round or an acceptance (`heldRefusal`): what is in flight runs on, and what a step asks
   * stays on its record, to be asked once the hold lifts. The tick lifts it once every run it names has landed, as `--after` reads
   * landed (`removeHold`); `nemia hold <run> --off` lifts it by hand. Absent on a run nobody holds.
   */
  hold: Schema.optional(Hold),
  /**
   * That a person paused the whole store (`nemia pause`), by whom and why — composed on read onto every run from the store's one file,
   * `pauseFile`, and never written into a record. While it stands the run files nothing new, no step, try, round or check, and
   * what a person writes meanwhile waits on its own files for the lift (`assess`); what is in flight runs on. Absent while the store is not
   * paused.
   */
  pause: Schema.optional(Pause),
  /**
   * What this run resolved of each kind it reads — its workflow folder, each step's agent, each skill and its factory's rules — with the
   * revision of each (`Pin`): written by the pass that resolves them, which is every pass while the run has filed nothing, and again by
   * the pass that takes a person's refresh. Never re-read from the folder for a run that has filed: `stepsOf` reads the frozen workflow,
   * and these say which revision that copy is. Absent on a record written before revisions, which pinned nothing.
   */
  pinned: Schema.optional(Schema.Array(Pin)),
  /**
   * Per step: the task the engine ran, and the workspace and branch it ran in.
   *
   * `taskId` is the step's OWN task, always — `apps/api` reads it. The run's check of the step's work
   * is a task of its own, under `check`, filed once the step has signed off and been handed off.
   *
   * Both are the CURRENT try's. A step tried again (`retries:`, `nemia retry`) keeps the tries it replaced
   * beside them, under `tries`, in order — so everything that reads `taskId` and `check` reads the try
   * that decides the step.
   */
  steps: Schema.Record(StepName.OnRead, Step),
  createdAt: Schema.String,
};

/**
 * A repository run (`RepositoryRun`, record.ts): its steps work on branches of one repository. Its `place` is absent, as on any record
 * that names no kind. `repo`, `baseRef`, `branch` and `isolate` are required: every repository run has written all four since the first
 * record (`nemia start`), so none a store holds lacks one.
 */
export const RepositoryRun = Schema.Struct({
  ...runFields,
  place: none,
  /** The repository the work is about. */
  repo: Schema.String,
  /** The commit the workspace started from, so a reviewer can diff against it. */
  baseRef: Schema.String,
  /** The repository's branch when the run started. */
  branch: Schema.String,
  /** Whether each step gets a worktree of its own. False only for `--no-worktree`. */
  isolate: Schema.Boolean,
  /**
   * The place skill a run named when a record said which place its verbs ran from, by name and digest. Read and kept, never written: a
   * run asks the place its program is given.
   */
  placeSkill: Schema.optional(Schema.Struct({ skill: Schema.String, version: Schema.String })),
  /**
   * The file whose presence says a merge is staged in the repository's checkout, as the place's `open` named it at `nemia start`, read
   * with a `stat` (`stagedHere`). Absent for a run started before the place named one, whose checkout is read through `status`.
   */
  stagedFile: Schema.optional(Schema.String),
}).annotate({ identifier: 'RepositoryRun' });

/**
 * A folder run (`FolderRun`, record.ts): a run of a team whose every step says `place: folder`, `place: { kind: 'folder' }` — an object so
 * that another kind can say which workspace it is. No repository, no base, no branch, no worktrees: a repository field on it is refused,
 * never dropped.
 */
export const FolderRun = Schema.Struct({
  ...runFields,
  place: Schema.Struct({ kind: Schema.Literal('folder') }),
  repo: none,
  baseRef: none,
  branch: none,
  isolate: none,
  placeSkill: none,
  stagedFile: none,
}).annotate({ identifier: 'FolderRun' });

/**
 * A run's record (`Run`, record.ts), the aggregate: a repository run or a folder run, by `place`, each held to the run's invariants. Read
 * as the store's reader reads it: a key neither names is kept on the record, and ignored here. Its encoded side is the record as stored,
 * which is record.ts's `Run`.
 */
export const Run = Schema.Union([RepositoryRun, FolderRun]).check(triesNamed, afterOthers).annotate({ identifier: 'Run' });
export type Run = typeof Run.Type;

/** Whether two types are one. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** A step's record names every field of `StepRecord` in record.ts, and no other: a field added to either fails the typecheck here. */
export const stepFieldsHeld: Same<keyof StepRecord, keyof Step> = true;

/** Run-core's part of the orchestrator's diagram (`model/diagram.model.ts`): its entities, and the ids it owns. */
export const recordModel = {
  entities: [RepositoryRun, FolderRun, Step, Try, Round, Landing],
  ids: { RunId: 'Run', TryNumber: 'Try' },
} satisfies ErModel;
