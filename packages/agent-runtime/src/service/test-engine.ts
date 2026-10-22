/**
 * The engine's stand-in, `testEngine()`: the `Engine` service kept by hand in a layer (`layer`), with no journal, no harness and no pass,
 * for a test of a layer above the runtime. A test settles a task itself (`settle`), leaving with its end the text its session printed
 * (`printed`), which `output` then answers stream by stream, and reads back what the engine was asked: each task (`tasks`), every filing
 * by id (`filings`) and by what it was filed with (`specs`), each stop taken (`stopped`), each word said (`said`), each interrupt asked
 * (`interrupts`) and each `forget` call by call (`forgets`); `refuseSay(n)` refuses the next `n` says as the runtime refuses a session
 * not running; `keeps(id, sizes)` plants what `kept` answers of a task, and `failKept(n)` fails the next `n` as a store that does not
 * list fails one; `plantTranscript(id, n, events)` plants what `transcript` reads of an attempt, and `restart(id)` starts a task's next;
 * `plantMcpState(name, state)` plants the state a server reads as, `failMcpState(why)` makes the next read a look that failed, and
 * `mcpReads` counts the reads asked, which is how a test proves a pass read a record's states once rather than once per task.
 *
 * It keeps `file`, `view`, `list`, `stop`, `logs`, `feed`, `output`, `say`, `interrupt`, `transcript`, `forget`, `kept`,
 * `mcpState` and `io`, each
 * answering what the real engine answers over a harness that costs nothing: `test/engine-walks.ts` holds the walks both run, and `APART`
 * there what this one cannot say. Every other verb dies naming itself. Reached from another package through `agent-runtime/testing`
 * alone, and by no file of a `src`.
 */
import { Effect, Layer } from 'effect';
import type { Attempt, Said, SessionAsk, State } from '../core/index.ts';
import { JournalError, StopRefused, type TaskView } from '../core/engine/index.ts';
import {
  attemptRefusal,
  DrainRefused,
  drainRefusalOf,
  Engine,
  isTranscriptCursor,
  ListRefused,
  listRefusalOf,
  TRANSCRIPT_START,
  TranscriptRefused,
  type EngineShape,
} from './engine.ts';
import type { McpServerState, McpServersRead } from '../harness/mcp-state.ts';
import type { RemoteMcpServer } from '../harness/seam.ts';

/** One event of a session's transcript, as `transcript` answers it. */
type TranscriptEvent = Effect.Success<ReturnType<EngineShape['transcript']>>['events'][number];
import { ForgetRefused } from './forget.ts';
import { KeptRefused, type KeptReport } from './kept.ts';
import { mcpStateRefusal, type EngineIo, type TaskSpec } from './options.ts';
import { McpStateRefused } from './mcp-state.ts';
import { notACount, notAStream, OutputRefused } from './output.ts';
import { SayRefused } from './say.ts';
import { InterruptRefused } from './interrupt.ts';
import { AnswerRefused, type Answering } from './answer.ts';

/** One answer asked of the stand-in: the task, the ask by its id, and each question's answer by the question's own text. */
export type TestAnswer = { taskId: string; id: string; answers: Record<string, string> };

/** A task as it was filed: its spec, under the id it was filed with or given. */
export type TestFiling = TaskSpec & { readonly id: string };

/** The text a session printed, stream by stream: a stream left out printed nothing. */
export type Printed = { readonly stdout?: string; readonly stderr?: string };

/** What `settle` lays over a task's attempt, field for field, and the text its session printed, kept beside it. */
export type TestEnd = Partial<Attempt> & { readonly printed?: Printed };

/**
 * A task the stand-in holds: what it was filed with and when, the phase `settle` left it in, whether a stop was asked, what was said to
 * it, its attempt in flight or last, `null` until it starts, those before it (`earlier`, by `restart`), the transcript planted for each
 * attempt by its `n`, and the text its session printed.
 */
export type TestTask = {
  spec: TestFiling;
  phase: string;
  filedAt: string;
  stopRequested: boolean;
  said: Said[];
  attempt: Attempt | null;
  earlier: Attempt[];
  transcripts: Map<number, TranscriptEvent[]>;
  printed: Printed;
  /** The questions of its session waiting on a person, planted by `plantAsk`, and those whose call took an answer (`answerAsk`). */
  asks: SessionAsk[];
  asksTaken: string[];
  /**
   * Whether its harness says what its session holds open at all: false until an ask is planted, true from then on, and true still
   * once every ask of it is gone. A harness that says reports `[]` while none waits; one that cannot say reports nothing, which is
   * no absence (`Sighting.asks`), so the two are not the same view.
   */
  asksSaid: boolean;
};

/** How an attempt ended, by the phase its task settled in. */
const ENDED = { succeeded: 'done', failed: 'failed', stopped: 'stopped' } as const;

/** The outcome a phase word is, or `null` for a task not settled. */
const outcomeOf = (phase: string): keyof typeof ENDED | null => (Object.hasOwn(ENDED, phase) ? (phase as keyof typeof ENDED) : null);

/** The session a started task of the stand-in runs in. */
const sessionOf = (id: string): string => `native-${id}`;

/** The state of a task nothing was filed under, as the engine folds an empty journal. */
const blank = (taskId: string): State => ({
  taskId,
  brief: '',
  cwd: '',
  attempts: [],
  said: [],
  inputs: [],
  closed: false,
  stopRequested: false,
  settled: null,
});

/** The state of a held task, as the engine folds its filing, its one attempt and what was said to it. */
const stateOf = (id: string, t: TestTask): State => ({
  ...blank(id),
  filedAt: t.filedAt,
  brief: t.spec.brief,
  cwd: t.spec.cwd,
  harness: t.spec.harness ?? 'test',
  deadlineSeconds: t.spec.deadlineSeconds,
  resumeFrom: t.spec.resumeFrom,
  config: t.spec.config,
  closeoutSchema: t.spec.closeoutSchema,
  ...(t.spec.holdOpen ? { holdOpen: true as const } : {}),
  ...(t.spec.restartPolicy === 'Always' ? { restartPolicy: 'Always' as const } : {}),
  queued: t.spec.queued === true,
  ...(t.spec.priority === undefined ? {} : { priority: t.spec.priority }),
  ...(t.spec.labels === undefined ? {} : { labels: t.spec.labels }),
  attempts: [...t.earlier, ...(t.attempt ? [t.attempt] : [])],
  said: [...t.said],
  stopRequested: t.stopRequested,
  settled: outcomeOf(t.phase),
});

/** What a task looks like to `view`: a task never filed as the engine reads an empty journal, a held one as `settle` left it. */
const viewOf = (id: string, t: TestTask | undefined): TaskView => {
  if (!t) return { id, state: blank(id), phase: 'pending', sessionId: null, admission: 'queued' };
  const waits = t.spec.queued === true && !t.attempt && outcomeOf(t.phase) === null;
  return {
    id,
    state: stateOf(id, t),
    phase: t.phase,
    sessionId: t.attempt ? sessionOf(id) : null,
    ...(waits ? { admission: 'queued' } : {}),
    ...(t.asksSaid ? { asks: t.asks.map((ask) => ({ ...ask })) } : {}),
    ...(t.asksTaken.length ? { asksTaken: [...t.asksTaken] } : {}),
  };
};

/**
 * The one attempt of a task settled in `phase`: begun and spawned now, ended as the phase says, by its harness or, for a stop, by the
 * person who asked, and its session named once it has ended; then `end` over it.
 */
const attemptOf = (t: TestTask, phase: string, end: Partial<Attempt>): Attempt => {
  const at = new Date().toISOString();
  const outcome = outcomeOf(phase);
  return {
    n: t.attempt?.n ?? t.earlier.length + 1,
    startedAt: t.attempt?.startedAt ?? at,
    spawnedAt: t.attempt?.spawnedAt ?? at,
    ended: outcome ? ENDED[outcome] : null,
    endedAt: outcome ? at : null,
    reason: outcome === null ? null : outcome === 'stopped' ? 'operator' : 'harness',
    nativeId: outcome ? sessionOf(t.spec.id) : null,
    usage: null,
    exitCode: null,
    ...end,
  };
};

/** The cursor after the first `count` events of a planted transcript: the real reader's shape, its offset the count. */
const plantedCursor = (count: number): string => (count === 0 ? TRANSCRIPT_START : `${count}.${'0'.repeat(16)}`);

/**
 * `transcript` over the tasks a stand-in holds: refuses a task not held, an attempt it has not and a cursor no read gave, as the engine
 * does over Claude Code; then the events planted for the attempt named, or the latest, after the cursor's count, and the cursor after
 * them. A task not started reads no events.
 */
const transcriptOf =
  (tasks: Map<string, TestTask>): EngineShape['transcript'] =>
  (id, after, options = {}) => {
    const refuse = (message: string) => Effect.fail(new TranscriptRefused({ message }));
    const t = tasks.get(id);
    if (!t) return refuse(unknown(id));
    if (after !== undefined && !isTranscriptCursor(after))
      return refuse(
        `\`${after}\` is not a cursor a transcript read gave. Pass the \`cursor\` the last read returned, or none to read from the start.`,
      );
    const attempts = stateOf(id, t).attempts;
    const named = attemptRefusal(attempts, options.attempt);
    if (named !== undefined) return refuse(named);
    const n = options.attempt ?? attempts.at(-1)?.n;
    const events = n === undefined ? [] : (t.transcripts.get(n) ?? []);
    const from = after === undefined ? 0 : Number(after.split('.')[0]);
    return Effect.succeed({ events: events.slice(from), cursor: plantedCursor(Math.max(from, events.length)) });
  };

/** The verbs whose asking `io` counts as one read each: what the stand-in answers out of what it holds. */
const READS = ['view', 'list', 'logs', 'output', 'transcript'] as const;

/**
 * `verbs` with each read of `READS` counted once as it is asked, and `io`, which answers the count so far: the reads a test's verbs
 * asked, where the engine counts the files it opened. No byte, spawn, write or lock is counted, and no harness observed (`APART`).
 */
const countedOf = <V extends Pick<EngineShape, (typeof READS)[number]>>(verbs: V): V & Pick<EngineShape, 'io'> => {
  let reads = 0;
  const counted = Object.fromEntries(
    READS.map((verb) => [
      verb,
      (...args: unknown[]) =>
        Effect.suspend(() => {
          reads += 1;
          return Reflect.apply(verbs[verb], verbs, args) as Effect.Effect<unknown, unknown>;
        }),
    ]),
  ) as unknown as Pick<EngineShape, (typeof READS)[number]>;
  const io = (): Effect.Effect<EngineIo> =>
    Effect.sync(() => ({ bytesRead: 0, reads, spawned: 0, writes: 0, locks: 0, lockWaitMs: 0, observed: {} }));
  return { ...verbs, ...counted, io };
};

/** A verb the stand-in does not keep: a test that reaches it has outgrown the stand-in. */
const unkept = (verb: string) => () =>
  Effect.die(
    new Error(`the test engine keeps no \`${verb}\`: add it to src/service/test-engine.ts, with its walk in test/engine-walks.ts`),
  );

/** The words the engine refuses a task it holds nothing of with. */
const unknown = (id: string): string => `\`${id}\` is not a task on this board.`;

/** What a test reads back and moves by hand, beside the layer: see the file's head. */
export type TestEngine = {
  readonly layer: Layer.Layer<Engine>;
  readonly tasks: Map<string, TestTask>;
  readonly filings: string[];
  readonly specs: TestFiling[];
  readonly stopped: string[];
  readonly forgets: { taskIds: string[]; yes: boolean }[];
  readonly said: { taskId: string; text: string }[];
  /** Each task an interrupt was asked of, in the order asked, whether or not it was refused. */
  readonly interrupts: string[];
  /** Each ask an answer was asked of, in the order asked, whether or not it was refused. */
  readonly answered: TestAnswer[];
  /** Each holder a drain was put for, or null where one was lifted, in order. */
  readonly drains: (number | null)[];
  /** Refuses the next `times` says, whatever the task. */
  readonly refuseSay: (times: number) => void;
  /**
   * Leaves the task `id` in `phase`, any word: `pending` takes its attempt away; `succeeded`, `failed` and `stopped` settle it and end
   * its attempt; any other word is an attempt in flight. A task stopped before it started settles with no attempt, as the engine
   * settles one, unless `end` is given. `end` is laid over the attempt, field for field, but its `printed`, the text the session
   * printed, which the task keeps until a settle gives another. Throws for a task never filed.
   */
  readonly settle: (id: string, phase: string, end?: TestEnd) => TestTask;
  /** Plants the transcript the attempt `n` of the task `id` read, in place of what was planted before. Throws for a task never filed. */
  readonly plantTranscript: (id: string, n: number, events: readonly TranscriptEvent[]) => void;
  /** Plants a question of a task's session waiting on a person, which `view` says and `answerAsk` answers. */
  readonly plantAsk: (id: string, ask: SessionAsk) => void;
  /**
   * Cuts every question of the task's session that waits on a person, as a holder that let the session go cuts them: its harness
   * goes on saying what it holds open, and says it holds none. Throws for a task never filed.
   */
  readonly cutAsks: (id: string) => void;
  /**
   * Ends the task `id`'s attempt in flight as its harness ended it, failed, and starts the next at work, as a long-lived task restarts;
   * an attempt a settle already ended is kept as it ended. Throws for a task never filed or not started.
   */
  readonly restart: (id: string) => TestTask;
  /** Plants what `kept` answers of the task `id`, in bytes, in place of what was planted before; a task not held is never named. */
  readonly keeps: (id: string, sizes: TestKeeps) => void;
  /** Fails the next `times` asks of `kept` with a `JournalError`, as the engine fails one over a store that does not list. */
  readonly failKept: (times: number) => void;
  /** The record of each `mcpState` read asked, by the server names it was handed, in order: one entry per read. */
  readonly mcpReads: Array<readonly string[]>;
  /** Plants the state the server `name` reads as, in place of what was planted before; one planted nothing reads `pending`. */
  readonly plantMcpState: (name: string, state: TestMcpState) => void;
  /** Makes every `mcpState` read a look that failed, with `why`; `undefined` lets them read again. */
  readonly failMcpState: (why: string | undefined) => void;
};

/**
 * `output` over the tasks a stand-in holds: refuses a stream that is neither, a count of bytes that is none and a task not held, as
 * the engine does and in its order; then the text the task's session printed on `stream`, whole or its last `lastBytes` bytes, and
 * `undefined` for a task with no attempt or a stream left empty.
 */
const outputOf =
  (tasks: Map<string, TestTask>): EngineShape['output'] =>
  (id, stream, lastBytes) => {
    const refuse = (message: string) => Effect.fail(new OutputRefused({ message }));
    if (stream !== 'stdout' && stream !== 'stderr') return refuse(notAStream(stream));
    if (lastBytes !== undefined && !(Number.isSafeInteger(lastBytes) && lastBytes > 0)) return refuse(notACount(lastBytes));
    const t = tasks.get(id);
    if (!t) return refuse(unknown(id));
    const text = t.attempt ? t.printed[stream] : undefined;
    return Effect.succeed(text === undefined || lastBytes === undefined ? text : Buffer.from(text).subarray(-lastBytes).toString());
  };

/** What a test plants of a task for `kept` to answer, in bytes: a part left out is 0, and `records` left out is no record kept. */
export type TestKeeps = {
  readonly journal?: number;
  readonly bodies?: number;
  readonly output?: number;
  readonly files?: number;
  readonly records?: number;
};

/**
 * `kept` over the tasks a stand-in holds and the sizes planted: refuses an argument as the engine does, fails while `failures` has
 * any left, as the engine fails over a store that does not list, then names each task held once, in the order filed, with what was
 * planted of it, 0 where nothing was, and no `records` where none was.
 */
const keptVerbOf = (tasks: Map<string, TestTask>, sizes: Map<string, TestKeeps>, failures: { left: number }): EngineShape['kept'] =>
  function () {
    if (arguments.length > 0) {
      return Effect.fail(
        new KeptRefused({
          message: `takes nothing, and measures every task the store lists; it was handed ${[...arguments].map((a) => JSON.stringify(a)).join(', ')}: nothing was measured.`,
        }),
      );
    }
    if (failures.left > 0) {
      failures.left -= 1;
      return Effect.fail(new JournalError({ taskId: '*', message: 'the test engine was told to fail this kept: its store does not list' }));
    }
    const of = (taskId: string): KeptReport['tasks'][number] => {
      const { journal = 0, bodies = 0, output = 0, files = 0, records } = sizes.get(taskId) ?? {};
      return {
        taskId,
        harness: tasks.get(taskId)?.spec.harness ?? 'test',
        journal,
        bodies,
        output,
        files,
        ...(records === undefined ? {} : { records }),
      };
    };
    return Effect.sync(() => ({ tasks: [...tasks.keys()].map(of) }));
  };

/**
 * What a test plants of one server's state: its words, and the tool count and error that go with them. A server a test plants nothing
 * for reads `pending`, as the real read reads a server the harness named nothing of.
 */
export type TestMcpState = Omit<McpServerState, 'name'>;

/**
 * `mcpState` over what a test planted: refuses a record as the real verb refuses one (`mcpStateRefusal`, its own words and its own
 * order), counts the read in `reads`, then answers a planted look that failed, else each server of the record once, in the record's
 * order, with what was planted of it and `pending` where nothing was.
 *
 * It keeps no harness, so unlike the real verb it refuses no engine for having none: that difference is declared on `APART`.
 */
const mcpStateOf = (
  planted: Map<string, TestMcpState>,
  reads: Array<readonly string[]>,
  failures: { why: string | undefined },
): EngineShape['mcpState'] =>
  function (servers: Record<string, RemoteMcpServer>) {
    const refused = mcpStateRefusal(servers);
    if (refused) return Effect.fail(new McpStateRefused({ message: refused }));
    reads.push(Object.keys(servers));
    const why = failures.why;
    if (why !== undefined) return Effect.succeed<McpServersRead>({ read: false, why });
    return Effect.succeed<McpServersRead>({
      read: true,
      servers: Object.keys(servers).map((name) => ({ name, ...(planted.get(name) ?? { status: 'pending' as const }) })),
    });
  };

/**
 * `forget` over the tasks a stand-in holds: each call kept in `forgets`, a task not held or not settled (`settledIn`) refused as
 * the engine refuses it, and, with `yes`, the tasks dropped; its report names each task with no size.
 */
const forgetVerbOf =
  (tasks: Map<string, TestTask>, forgets: TestEngine['forgets'], settledIn: (id: string) => unknown): EngineShape['forget'] =>
  (taskIds, options) =>
    Effect.gen(function* () {
      const yes = options?.yes === true;
      forgets.push({ taskIds: [...taskIds], yes });
      for (const id of taskIds)
        if (!settledIn(id))
          return yield* Effect.fail(
            new ForgetRefused({
              taskId: id,
              message: tasks.has(id) ? `${id} has not settled: stop it first` : `no task ${id} in this store`,
            }),
          );
      if (yes) for (const id of taskIds) tasks.delete(id);
      return { forgotten: yes, tasks: taskIds.map((taskId) => ({ taskId, journalBytes: 0, feedLines: 0, sessions: [] })) };
    });

/**
 * `interrupt` over what a stand-in holds: every ask noted in `interrupts`, whether it was taken or refused, and refused in the engine's
 * own words for a task it does not hold, one settled, and one whose attempt has not started. Any attempt in flight has a turn to end:
 * a stand-in holds no sighting to read a session between turns by.
 */
const interruptAskedOf =
  (tasks: Map<string, TestTask>, interrupts: string[], settledIn: (id: string) => string | null) => (taskId: string) =>
    Effect.gen(function* () {
      interrupts.push(taskId);
      const refuse = (message: string) => Effect.fail(new InterruptRefused({ message }));
      const t = tasks.get(taskId);
      if (!t) return yield* refuse(unknown(taskId));
      if (settledIn(taskId))
        return yield* refuse(`\`${taskId}\` has settled (${t.phase}): no session of it is running, and no turn is in it.`);
      if (!t.attempt) return yield* refuse(`\`${taskId}\` has not started an attempt yet, so there is no turn to end.`);
      return { at: new Date().toISOString(), attempt: t.attempt.n };
    });

/**
 * `answerAsk` over what a stand-in holds: every answer noted in `answered`, whether it was taken or refused, and refused in the
 * engine's own words for a task it does not hold, one settled, one whose attempt has not started, and an ask its session does not hold
 * open — which a stand-in holds only where one was planted (`plantAsk`). Taken, the ask leaves `asks` and joins `asksTaken`, as a
 * held call that took an answer leaves it on the session's record.
 */
const answerAskedOf =
  (tasks: Map<string, TestTask>, answered: TestAnswer[], settledIn: (id: string) => string | null) => (taskId: string, given: Answering) =>
    Effect.gen(function* () {
      answered.push({ taskId, id: given.id, answers: given.answers });
      const refuse = (message: string) => Effect.fail(new AnswerRefused({ message }));
      const t = tasks.get(taskId);
      if (!t) return yield* refuse(unknown(taskId));
      if (settledIn(taskId))
        return yield* refuse(`\`${taskId}\` has settled (${t.phase}): no session of it is running, and no turn is in it.`);
      if (!t.attempt) return yield* refuse(`\`${taskId}\` has not started an attempt yet, so there is no turn to end.`);
      if (!t.asks.some((ask) => ask.id === given.id)) {
        return yield* refuse(
          `\`${taskId}\` has no ask \`${given.id}\` waiting on a person: read its asks again, and answer one its session still holds open.`,
        );
      }
      t.asks = t.asks.filter((ask) => ask.id !== given.id);
      t.asksTaken = [...t.asksTaken, given.id];
      return { at: new Date().toISOString(), attempt: t.attempt.n };
    });

/**
 * `say` over what a stand-in holds: the words journalled on the task and noted in `said`, with where its transcript stood (`after`),
 * and refused in the engine's own words for a task it does not hold, one settled, one not started, and the next `refuseSay` asks.
 */
const sayAskedOf =
  (
    tasks: Map<string, TestTask>,
    said: { taskId: string; text: string }[],
    sayRefusals: { left: number },
    settledIn: (id: string) => string | null,
  ) =>
  (taskId: string, text: string) =>
    Effect.gen(function* () {
      const refuse = (message: string) => Effect.fail(new SayRefused({ message }));
      if (typeof text !== 'string' || !text.trim()) return yield* refuse('`text` is empty. Give the words the session should hear.');
      const t = tasks.get(taskId);
      if (!t) return yield* refuse(unknown(taskId));
      if (settledIn(taskId)) return yield* refuse(`\`${taskId}\` has settled (${t.phase}): no session of it is running to hear anything.`);
      if (!t.attempt) return yield* refuse(`\`${taskId}\` has not started an attempt yet, so there is no session to hear anything.`);
      if (sayRefusals.left > 0) {
        sayRefusals.left -= 1;
        return yield* refuse(`${taskId}'s attempt is not running yet: ask again`);
      }
      const last = t.transcripts.get(t.attempt.n)?.at(-1);
      const heard: Said = {
        at: new Date().toISOString(),
        attempt: t.attempt.n,
        text,
        after: last === undefined ? null : { kind: last.kind, id: last.id },
      };
      t.said.push(heard);
      said.push({ taskId, text });
      return heard;
    });

/** The kept verbs over what a stand-in holds. */
const keptOf = (
  held: Omit<
    TestEngine,
    | 'layer'
    | 'refuseSay'
    | 'settle'
    | 'keeps'
    | 'failKept'
    | 'plantAsk'
    | 'cutAsks'
    | 'plantTranscript'
    | 'restart'
    | 'plantMcpState'
    | 'failMcpState'
    | 'mcpReads'
  >,
  sayRefusals: { left: number },
  sizes: Map<string, TestKeeps>,
  keptFailures: { left: number },
) => {
  const { tasks, filings, specs, stopped, forgets, said, interrupts, answered } = held;
  const settledIn = (id: string) => {
    const t = tasks.get(id);
    return t ? outcomeOf(t.phase) : null;
  };
  return {
    file: (spec) =>
      Effect.sync(() => {
        const filed: TestFiling = { ...spec, id: spec.id ?? `t-${filings.length + 1}` };
        filings.push(filed.id);
        specs.push(filed);
        tasks.set(filed.id, {
          spec: filed,
          phase: 'pending',
          filedAt: new Date().toISOString(),
          stopRequested: false,
          said: [],
          attempt: null,
          earlier: [],
          transcripts: new Map(),
          printed: {},
          asks: [],
          asksTaken: [],
          asksSaid: false,
        });
        return filed.id;
      }),
    view: (id) => Effect.sync(() => viewOf(id, tasks.get(id))),
    list: (...args) => {
      const refused = listRefusalOf(args);
      if (refused) return Effect.fail(new ListRefused({ message: refused }));
      const [taskIds] = args;
      const ids = taskIds === undefined ? [...tasks.keys()] : [...new Set(taskIds)];
      return Effect.succeed({ views: ids.map((id) => viewOf(id, tasks.get(id))), unreadable: [] });
    },
    stop: (id) =>
      Effect.gen(function* () {
        const t = tasks.get(id);
        if (!t) return yield* Effect.fail(new StopRefused({ message: unknown(id) }));
        if (settledIn(id))
          return yield* Effect.fail(new StopRefused({ message: `\`${id}\` has settled (${t.phase}): there is nothing left to stop.` }));
        t.stopRequested = true;
        stopped.push(id);
      }),
    logs: (id) => Effect.sync(() => (tasks.get(id)?.attempt ? '(the test engine keeps no logs)' : '(no session yet)')),
    feed: () => Effect.succeed({ entries: [], cursor: 0 }),
    output: outputOf(tasks),
    say: sayAskedOf(tasks, said, sayRefusals, settledIn),
    interrupt: interruptAskedOf(tasks, interrupts, settledIn),
    answerAsk: answerAskedOf(tasks, answered, settledIn),
    transcript: transcriptOf(tasks),
    forget: forgetVerbOf(tasks, forgets, settledIn),
    kept: keptVerbOf(tasks, sizes, keptFailures),
  } satisfies Partial<EngineShape>;
};

/** The task `id` of `tasks`, for a hand that moves it: thrown for one never filed, in words saying what to do `before` it. */
const taskFor = (tasks: Map<string, TestTask>, id: string, before: string): TestTask => {
  const t = tasks.get(id);
  if (!t) throw new Error(`the test engine holds no task ${id}: file it before ${before}`);
  return t;
};

/**
 * The task `id` started again: the attempt it had kept as an earlier try — as it ended, where a settle ended it, else failed now — and a
 * new attempt at work in its place.
 */
const restartIn = (tasks: Map<string, TestTask>, id: string): TestTask => {
  const t = tasks.get(id);
  if (!t?.attempt) throw new Error(`the test engine holds no started task ${id}: settle it at work before restarting it`);
  t.earlier.push(t.attempt.ended ? t.attempt : attemptOf(t, 'failed', {}));
  t.attempt = null;
  t.attempt = attemptOf(t, 'running (working)', {});
  t.phase = 'running (working)';
  return t;
};

/**
 * What the stand-in holds about MCP states: what a read answers for each server planted, the failure a read is made to answer instead,
 * and every read asked of it, in order — with the verb that serves them and the two a test moves them by.
 */
const mcpHeld = () => {
  const planted = new Map<string, TestMcpState>();
  const failure: { why: string | undefined } = { why: undefined };
  const mcpReads: Array<readonly string[]> = [];
  return {
    mcpState: mcpStateOf(planted, mcpReads, failure),
    read: {
      mcpReads,
      plantMcpState: (name: string, state: TestMcpState) => void planted.set(name, state),
      failMcpState: (why: string | undefined) => void Object.assign(failure, { why }),
    },
  };
};

/**
 * A stand-in with no task on it, and the layer that serves it: new at each call, so two share nothing.
 *
 * @returns The layer a test gives where the `Engine` service is asked, and what it reads back and moves by hand (`TestEngine`).
 */
export const testEngine = (): TestEngine => {
  const held = {
    tasks: new Map<string, TestTask>(),
    filings: [] as string[],
    specs: [] as TestFiling[],
    stopped: [] as string[],
    forgets: [] as { taskIds: string[]; yes: boolean }[],
    said: [] as { taskId: string; text: string }[],
    interrupts: [] as string[],
    answered: [] as TestAnswer[],
    drains: [] as (number | null)[],
  };
  const sayRefusals = { left: 0 };
  const sizes = new Map<string, TestKeeps>();
  const keptFailures = { left: 0 };
  const mcp = mcpHeld();
  const layer = Layer.succeed(Engine)(
    Engine.of({
      ...countedOf(keptOf(held, sayRefusals, sizes, keptFailures)),
      mcpState: mcp.mcpState,
      tick: unkept('tick'),
      admit: unkept('admit'),
      follow: unkept('follow'),
      path: unkept('path'),
      quota: unkept('quota'),
      answer: unkept('answer'),
      close: unkept('close'),
      watch: unkept('watch'),
      tallied: unkept('tallied'),
      start: unkept('start'),
      sweep: unkept('sweep'),
      removeBody: unkept('removeBody'),
      compact: unkept('compact'),
      hold: () => Effect.succeed(null),
      drain: (holder) =>
        drainRefusalOf(holder) === undefined
          ? Effect.sync(() => void held.drains.push(holder))
          : Effect.fail(new DrainRefused({ message: drainRefusalOf(holder)! })),
    }),
  );
  const settle = (id: string, phase: string, end?: TestEnd): TestTask => {
    const t = taskFor(held.tasks, id, 'settling it');
    const unstarted = phase === 'pending' || (phase === 'stopped' && !t.attempt && !end);
    const { printed, ...over } = end ?? {};
    t.attempt = unstarted ? null : attemptOf(t, phase, over);
    if (printed) t.printed = printed;
    t.phase = phase;
    return t;
  };
  const asking = (id: string, what: string, asks: (held: SessionAsk[]) => SessionAsk[]) => {
    const t = taskFor(held.tasks, id, `${what} its asks`);
    t.asks = asks(t.asks);
    t.asksSaid = true;
  };
  const plantAsk = (id: string, ask: SessionAsk) => asking(id, 'planting', (now) => [...now, { ...ask }]);
  const cutAsks = (id: string) => asking(id, 'cutting', () => []);
  const plantTranscript = (id: string, n: number, events: readonly TranscriptEvent[]) =>
    void taskFor(held.tasks, id, 'planting its transcript').transcripts.set(n, [...events]);
  const restart = (id: string): TestTask => restartIn(held.tasks, id);
  const refuseSay = (times: number) => void Object.assign(sayRefusals, { left: times });
  const keeps = (id: string, planted: TestKeeps) => void sizes.set(id, planted);
  const failKept = (times: number) => void Object.assign(keptFailures, { left: times });
  return {
    layer,
    ...held,
    ...mcp.read,
    refuseSay,
    settle,
    keeps,
    failKept,
    plantAsk,
    cutAsks,
    plantTranscript,
    restart,
  };
};
