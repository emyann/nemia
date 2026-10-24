/**
 * The runtime's model: a task, its attempts, the session each runs, the entries of its journal, where it runs and what it may
 * reach, as Schemas at the context's door, beside its glossary rows (`glossary.json`). A declaration in S1: no read path decodes
 * through it yet, and nothing it names is reshaped (`docs/model.md`).
 *
 * A stored field holds an id's read form (`OnRead`), which takes any string, so a journal written before a check still reads; the
 * create form (`OnCreate`, `create`) is the check a door holds a new id to.
 */
import { Schema } from 'effect';
import { brandedCount, brandedId, foreignId, type Count, type Id } from './brand.ts';
import { erDiagram, type ErModel } from './er.ts';
import { FORMER_REASONS, HarnessArgsSchema, StoredEventSchema, UsageSchema } from './event-schema.ts';

/** The most bytes a file's name may hold on the file systems a store is kept on. */
const NAME_BYTES = 255;

/**
 * Why `value` cannot name a task, or `undefined`: a task's id is its journal file's name (`<id>.jsonl`), so it is what a file's name
 * can hold — not empty, no `/`, no control character, not `.` or `..`, at most 255 bytes. It takes every id in use: the runtime's
 * `t-<base36>-<8>` (`file`, `engine/filing.ts`) and the orchestrator's `<runId>-<step>` and `<runId>-<step>-try<n>`, whose step may
 * hold spaces and punctuation.
 */
export const taskIdRefusal = (value: string): string | undefined => {
  if (value === '') return 'A task id is empty. Give the task an id, or leave `id` out and the runtime mints one.';
  if (value === '.' || value === '..')
    return `A task id may not be \`${value}\`, which names a folder. Give it a name with a letter in it.`;
  if (value.includes('/')) return `The task id ${JSON.stringify(value)} holds a \`/\`, which no file's name can. Use \`-\` in its place.`;
  if (/\p{Cc}/u.test(value)) return `The task id ${JSON.stringify(value)} holds a control character. Take it out.`;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > NAME_BYTES) return `The task id is ${bytes} bytes, past the ${NAME_BYTES} a file's name holds. Shorten it.`;
  return undefined;
};

/** A task's id: the name of its journal (`taskIdRefusal`), minted by `file` when the caller gives none. */
export const TaskId = brandedId('TaskId', taskIdRefusal);
export type TaskId = Id<'TaskId'>;

/** An attempt's number within its task, from 1 (`attempts.length + 1`, `domain.ts`). */
export const AttemptNumber = brandedCount('AttemptNumber', 1);
export type AttemptNumber = Count<'AttemptNumber'>;

/** The harness's own id for a session, the one `--resume` takes: minted by the harness, so the runtime reads it and never checks it. */
export const SessionId = foreignId('SessionId');
export type SessionId = Id<'SessionId'>;

/** One agent's conversation on a harness, known by the harness's own id. */
export const Session = Schema.Struct({ nativeId: SessionId.OnRead }).annotate({ identifier: 'Session' });
export type Session = typeof Session.Type;

/**
 * Where a task's session runs: the machine its engine runs on, the only place there is (decision Q17). Implicit, so a task holds no
 * field for it; one is added when a second place exists.
 */
export const ExecutionPlace = Schema.Literal('host');
export type ExecutionPlace = typeof ExecutionPlace.Type;

/**
 * One folder a session may reach beyond its `cwd`, as a Pod's container is given a volume mount: its absolute path, and whether the
 * session may only read it. The harness's `Mount` (`harness/mounts.ts`) in the model; `model.test.ts` holds the two to one shape.
 */
export const Mount = Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean }).annotate({ identifier: 'Mount' });
export type Mount = typeof Mount.Type;

/** A task's harness arguments, as `HarnessArgsSchema` reads them, with its mounts named as the model's. Carried, never read by `decide`. */
export const HarnessArgs = Schema.StructWithRest(
  Schema.Struct({ ...HarnessArgsSchema.schema.fields, mounts: Schema.optional(Schema.Array(Mount)) }),
  HarnessArgsSchema.records,
).annotate({ identifier: 'HarnessArgs' });
export type HarnessArgs = typeof HarnessArgs.Type;

const Outcome = Schema.Literals(['succeeded', 'failed', 'stopped']).annotate({ identifier: 'Outcome' });
const EndReason = Schema.Literals(['harness', 'lost', 'unstartable', 'operator', 'deadline']).annotate({
  identifier: 'EndReason',
});
const Monotonic = Schema.Struct({ boot: Schema.String, ms: Schema.Number });
const Strings = Schema.Array(Schema.String);

/** One start of a task's session, as the fold holds it (`Attempt`, `domain.ts`): whatever ends it settles the task. */
export const Attempt = Schema.Struct({
  n: AttemptNumber.OnRead,
  startedAt: Schema.String,
  startedMono: Schema.optional(Monotonic),
  spawnedAt: Schema.NullOr(Schema.String),
  spawnedMono: Schema.optional(Monotonic),
  ended: Schema.NullOr(Outcome),
  endedAt: Schema.NullOr(Schema.String),
  endedMono: Schema.optional(Monotonic),
  reason: Schema.NullOr(EndReason),
  nativeId: Schema.NullOr(SessionId.OnRead),
  resumeFrom: Schema.optional(SessionId.OnRead),
  nudge: Schema.optional(Schema.String),
  closeout: Schema.optional(Schema.Unknown),
  closedOut: Schema.optional(Schema.Boolean),
  former: Schema.optional(Schema.Literals(FORMER_REASONS)),
  usage: Schema.NullOr(UsageSchema),
  exitCode: Schema.NullOr(Schema.Number),
  denials: Schema.optional(Schema.Array(Schema.Struct({ tool: Schema.String, what: Schema.optional(Schema.String) }))),
  skills: Schema.optional(Strings),
  files: Schema.optional(Strings),
  ranOn: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
  turn: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  gapSince: Schema.optional(Schema.String),
  gapMono: Schema.optional(Monotonic),
  processes: Schema.optional(Schema.Array(Schema.Number)),
}).annotate({ identifier: 'Attempt' });
export type Attempt = typeof Attempt.Type;

const Said = Schema.Struct({
  at: Schema.String,
  attempt: AttemptNumber.OnRead,
  text: Schema.String,
  after: Schema.optional(Schema.NullOr(Schema.Struct({ kind: Schema.String, id: Schema.String }))),
});
const Input = Schema.Struct({ at: Schema.String, text: Schema.String, config: Schema.optional(HarnessArgsSchema) });

/** Why a task's attempts do not number 1, 2, 3…, or nothing when they do. */
const attemptsGap = (attempts: ReadonlyArray<{ readonly n: number }>): string | undefined => {
  const at = attempts.findIndex((a, i) => a.n !== i + 1);
  return at === -1
    ? undefined
    : `Attempt ${at + 1} of the task is numbered ${attempts[at]?.n}: a task's attempts number from 1 with no gap. Start the next one at \`attempts.length + 1\`.`;
};

/**
 * The runtime's unit of work, the aggregate: a brief filed to run on a harness, with its attempts, as its journal folds (`State`,
 * `domain.ts`). Never stored: it is the fold of its journal's entries.
 *
 * Its invariant: its attempts number from 1 with no gap, each started at `attempts.length + 1` (`domain.ts:988`, a turn's start, and
 * `domain.ts:1099`, a restart), which `engine.ts:323` journals as the `starting` entry the fold pushes.
 */
export const Task = Schema.Struct({
  taskId: TaskId.OnRead,
  filedAt: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Number),
  brief: Schema.String,
  cwd: Schema.String,
  harness: Schema.optional(Schema.String),
  deadlineSeconds: Schema.optional(Schema.Number),
  resumeFrom: Schema.optional(SessionId.OnRead),
  config: Schema.optional(HarnessArgs),
  closeoutSchema: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  attempts: Schema.Array(Attempt),
  said: Schema.Array(Said),
  holdOpen: Schema.optional(Schema.Literal(true)),
  restartPolicy: Schema.optional(Schema.Literal('Always')),
  labels: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  traceparent: Schema.optional(Schema.String),
  queued: Schema.optional(Schema.Boolean),
  admitted: Schema.optional(Schema.Number),
  inputs: Schema.Array(Input),
  closed: Schema.Boolean,
  stopRequested: Schema.Boolean,
  settled: Schema.NullOr(Outcome),
})
  .check(Schema.makeFilter((task) => attemptsGap(task.attempts) ?? true))
  .annotate({ identifier: 'Task' });
export type Task = typeof Task.Type;

/** One entry of a task's journal: the task it belongs to and the event, in any shape a runtime has written (`StoredEventSchema`). */
export const JournalEntry = Schema.Struct({
  taskId: TaskId.OnRead,
  event: StoredEventSchema.annotate({ identifier: 'Event' }),
}).annotate({ identifier: 'JournalEntry' });
export type JournalEntry = typeof JournalEntry.Type;

/** The place a session runs, as the diagram draws it: a node of its one value, since no task holds a field for it. */
const PlaceNode = Schema.Struct({ place: ExecutionPlace }).annotate({ identifier: 'ExecutionPlace' });

/** The runtime's model, as the printer reads it. */
export const runtimeModel = {
  entities: [Task, Attempt, Session, JournalEntry, HarnessArgs, Mount, PlaceNode],
  ids: { TaskId: 'Task', SessionId: 'Session' },
} satisfies ErModel;

/** The runtime's entity-relation diagram, as `docs/model.md` holds it between its `diagram:runtime-model` markers. */
export const runtimeModelDiagram = (): string => erDiagram(runtimeModel);
