/**
 * Run-core's model: a run, its steps, their tries and rounds, and its landing, as Schemas at the context's door (decisions Q3–Q6).
 * A declaration in S1: no read path decodes through it yet; the Run door (S2) will.
 */
import { Schema } from 'effect';
import { foreignId, brandedCount, brandedId, type Count, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { stepTaskId } from './record.ts';
import { idRefusal } from '../forget/forget.ts';
import { stepNameRefusal } from '../folder/folder.ts';
import { workflowNameRefusal } from '../factory/factory.ts';
import { TRY_CAUSES, upgradeTries } from '../retry/index.ts';

/** What a stored record is read through before `Run` reads it, as the store does: a try's former `then` read as its `cause`. */
export { upgradeTries };

/** A run's id, as `runId` mints it (`record.store.ts`) and `idRefusal` takes it. */
export const RunId = brandedId('RunId', (value) => idRefusal(value));
export type RunId = Id<'RunId'>;

/** A step's name: its file's name in its workflow's folder, without `.md` (`stepNameRefusal`). */
export const StepName = brandedId('StepName', stepNameRefusal);
export type StepName = Id<'StepName'>;

/** A workflow's name: its folder's (`workflowNameRefusal`). */
export const WorkflowName = brandedId('WorkflowName', workflowNameRefusal);
export type WorkflowName = Id<'WorkflowName'>;

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

/**
 * What the run did with the merge an ending staged (`LandingRecord`, record.ts:479): the commit it made, the abort and why, or nothing
 * touched — exactly one, as the `LandingRecord` union every writer of `landed` is typed by holds it.
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
        'a landing is one of `commit`, `aborted` or `untouched`: write the one the pass did (`LandingRecord`, record.ts:479)',
    ),
  )
  .annotate({ identifier: 'Landing' });
export type Landing = typeof Landing.Type;

/**
 * One step on a run's record (`StepRecord`): its current try's task — `null` while nothing of it is filed — and check, where it
 * works, the tries behind it, and what the run did with it. Its name is its key in the run's `steps`.
 */
export const Step = Schema.Struct({
  taskId: Schema.NullOr(TaskId.OnRead),
  workspace: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  check: Schema.optional(CheckTask),
  tries: Schema.optional(Schema.Array(Try)),
  handedOff: Schema.optional(TaskId.OnRead),
  landed: Schema.optional(Landing),
  filesRead: Schema.optional(Schema.Struct({ taskId: TaskId.OnRead, lacked: Schema.Record(Schema.String, Schema.String) })),
  closeoutHash: Schema.optional(Schema.String),
}).annotate({ identifier: 'Step' });
export type Step = typeof Step.Type;

/**
 * A loop asked round again by a person (`RoundAsk`, read off `runs/<id>.asks/round-<step>-<n>` by `roundAskIn` in record.store.ts):
 * the looping step, the round, the cap `--budget` raised, when, and the merge `nemia merge` asks with it. Beside the record, not in
 * it; a loop's own round is a try moved behind with `cause: 'round'`.
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

/**
 * A run's record (`Run`, record.ts:37), the aggregate: what it was started on and with, frozen at start, its steps by name, and what
 * the tick wrote down of it. A repository run names its repository, base, branch and worktrees; a folder run, `place: { kind:
 * 'folder' }` and none of them. Left out, as no relation of the model: the frozen workflow and the revisions pinned (the
 * definitions' and the revisions' own, S5), the counters the tick keeps for the metrics (`gatesTimed`, `deniedCounted`,
 * `settlesCounted`, `runTimed`, `slotHeldAt`), and what `readRun` composes on read and never writes (`approvals`, `acceptances`,
 * `pruned`, `hold`, `pause`). Read as the store's reader reads it: a key it does not name is kept on the record, and ignored here.
 */
export const Run = Schema.Struct({
  id: RunId.OnRead,
  workspace: Schema.String,
  brief: Schema.String,
  workflowDir: Schema.String,
  after: Schema.optional(Schema.Array(RunId.OnRead)),
  context: Schema.optional(Schema.Array(RunId.OnRead)),
  inputs: Schema.optional(Schema.Array(Schema.String)),
  from: Schema.optional(Schema.Struct({ inbox: CardName.OnRead })),
  scheduled: Schema.optional(Schema.Struct({ factory: FactoryName.OnRead, workflow: WorkflowName.OnRead, due: Schema.String })),
  gates: Schema.optional(Schema.Array(StepName.OnRead)),
  factory: Schema.optional(FactoryName.OnRead),
  mounts: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean }))),
  place: Schema.optional(Schema.Struct({ kind: Schema.Literal('folder') })),
  repo: Schema.optional(Schema.String),
  baseRef: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  isolate: Schema.optional(Schema.Boolean),
  placeSkill: Schema.optional(Schema.Struct({ skill: Schema.String, version: Schema.String })),
  stagedFile: Schema.optional(Schema.String),
  tips: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cancelledAt: Schema.optional(Schema.String),
  steps: Schema.Record(StepName.OnRead, Step),
  createdAt: Schema.String,
})
  .check(triesNamed, afterOthers)
  .annotate({ identifier: 'Run' });
export type Run = typeof Run.Type;

/** Run-core's part of the orchestrator's diagram (`model/diagram.model.ts`): its entities, and the ids it owns. */
export const recordModel = {
  entities: [Run, Step, Try, Round, Landing],
  ids: { RunId: 'Run', StepName: 'Step', TryNumber: 'Try', WorkflowName: 'Workflow' },
} satisfies ErModel;
