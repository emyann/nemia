/**
 * The engine's contract, as walks: `WALKS` holds, for every verb the stand-in keeps (`testEngine`, `src/service/test-engine.ts`), the
 * sequences an engine is asked and the one answer each must give (`says`), written once and run on both the real engine
 * (`engine-contract.boundary.test.ts`) and the stand-in (`engine-contract.test.ts`) through `walksOn`. A walk is written against a
 * `Side`: an engine's verbs, and the hand that moves a task where no walk can wait for a session.
 *
 * What a walk answers is compared as `told` tells it: a moment as `<time>`, a session's id as `<session>` (`SESSION_KEYS`), a refusal by
 * its tag, and no monotonic moment. `UNKEPT` names the verbs the stand-in does not keep, which die naming themselves; `unwalked` names a
 * verb of the engine that is in neither list. `APART` holds what the stand-in cannot say as the engine does, each proven of both sides, and
 * `failing` the walks of a verb a side does not say: a stand-in that lies fails one.
 */
import assert from 'node:assert/strict';
import { Cause, Effect, Exit } from 'effect';
import type { EngineShape } from '../src/index.ts';
import { noTranscript } from '../src/harness/transcript.ts';

/** Where a walk moves a task: at work, or settled. */
export type Moved = 'working' | 'succeeded' | 'failed' | 'stopped';

/** What a session ended with: its process's exit code, what it stated, and the text it printed, stream by stream. */
export type End = {
  readonly exitCode?: number;
  readonly closeout?: unknown;
  readonly printed?: { readonly stdout?: string; readonly stderr?: string };
};

/**
 * One side of the contract: an engine, and `settle`, which leaves the task `id` in `moved` — on the real engine by moving its session
 * and running the passes that read it, on the stand-in by hand. `stopped` is asked after a `stop`.
 */
export type Side = {
  readonly engine: EngineShape;
  readonly settle: (id: string, moved: Moved, end?: End) => Promise<void>;
};

/** One walk: what it shows, the sequence it asks of a side, and the one answer both sides give, as `told` tells it. */
export type Walk = { readonly name: string; readonly walk: (side: Side) => Promise<unknown>; readonly says: unknown };

/** A moment as the engine writes one. */
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The keys whose value names a session: a view's, an attempt's own, and the one an answered turn continues. */
const SESSION_KEYS = ['sessionId', 'nativeId', 'resumeFrom'];

/** `value` as both sides say it, read after its own JSON: see the file's head. */
function toldOf(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (key !== undefined && SESSION_KEYS.includes(key)) return '<session>';
    return MOMENT.test(value) ? '<time>' : value;
  }
  if (Array.isArray(value)) return value.map((one) => toldOf(one));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([name]) => !name.endsWith('Mono'))
      .map(([name, one]) => [name, toldOf(one, name)]),
  );
}

/** What a walk answered, as both sides say it. */
export const told = (value: unknown): unknown => toldOf(value === undefined ? null : JSON.parse(JSON.stringify(value)));

/** What a verb answers: its answer, `null` for none, or `{ refused }` naming the tag of what it failed with. */
export async function asked<A, E>(verb: Effect.Effect<A, E>): Promise<A | null | { refused: string }> {
  const exit = await Effect.runPromiseExit(verb);
  if (Exit.isSuccess(exit)) return exit.value ?? null;
  const failed = Cause.squash(exit.cause) as { _tag?: string; message?: string };
  if (failed._tag === undefined) throw new Error(`a verb died: ${failed.message}`);
  return { refused: failed._tag };
}

/** A task as the walks file one. */
const task = (id: string) => ({ id, brief: `do ${id}`, cwd: '/r' });

/** The state both sides say of a task filed with `task(id)` and nothing more, before any attempt. */
const filed = (id: string) => ({
  taskId: id,
  brief: `do ${id}`,
  cwd: '/r',
  attempts: [],
  said: [],
  inputs: [],
  closed: false,
  stopRequested: false,
  settled: null,
  filedAt: '<time>',
  harness: 'test',
  queued: false,
});

/** The view both sides give of a task nothing was filed under. */
const blank = (id: string) => ({
  id,
  state: { taskId: id, brief: '', cwd: '', attempts: [], said: [], inputs: [], closed: false, stopRequested: false, settled: null },
  phase: 'pending',
  sessionId: null,
  admission: 'queued',
});

/** The one attempt both sides say of a started task: in flight, or ended as `over` says. */
const attempt = (over: Record<string, unknown> = {}) => ({
  n: 1,
  startedAt: '<time>',
  spawnedAt: '<time>',
  ended: null,
  endedAt: null,
  reason: null,
  nativeId: null,
  usage: null,
  exitCode: null,
  ...over,
});

const FILE: readonly Walk[] = [
  {
    name: 'a task filed is answered by its id, and is pending with no attempt and no session',
    walk: async ({ engine }) => [await asked(engine.file(task('a'))), await asked(engine.view('a'))],
    says: ['a', { id: 'a', state: filed('a'), phase: 'pending', sessionId: null }],
  },
  {
    name: 'a task filed to wait says its admission is queued, and one filed with what it asks carries it',
    walk: async ({ engine }) => {
      await asked(engine.file({ ...task('a'), queued: true, priority: 2, closeoutSchema: { type: 'object' } }));
      return asked(engine.view('a'));
    },
    says: {
      id: 'a',
      state: { ...filed('a'), queued: true, priority: 2, closeoutSchema: { type: 'object' } },
      phase: 'pending',
      sessionId: null,
      admission: 'queued',
    },
  },
  {
    name: 'a task filed with no id is given one, and is viewed under it',
    walk: async ({ engine }) => {
      const id = await Effect.runPromise(engine.file({ brief: 'do it', cwd: '/r' }));
      return { given: id.length > 0, brief: (await Effect.runPromise(engine.view(id))).state.brief };
    },
    says: { given: true, brief: 'do it' },
  },
];

const VIEW: readonly Walk[] = [
  {
    name: 'a task nothing was filed under is pending, with an empty state, waiting for the word to start',
    walk: ({ engine }) => asked(engine.view('nope')),
    says: blank('nope'),
  },
  {
    name: 'a task at work has one attempt in flight and a session',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working');
      return asked(engine.view('a'));
    },
    says: { id: 'a', state: { ...filed('a'), attempts: [attempt()] }, phase: 'working', session: 'working', sessionId: '<session>' },
  },
  {
    name: 'a task whose session completed has succeeded, its attempt done by its harness with what it stated and its exit code',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'succeeded', { exitCode: 0, closeout: { ok: 1 } });
      return asked(engine.view('a'));
    },
    says: {
      id: 'a',
      state: {
        ...filed('a'),
        settled: 'succeeded',
        attempts: [
          attempt({ ended: 'succeeded', endedAt: '<time>', reason: 'harness', nativeId: '<session>', exitCode: 0, closeout: { ok: 1 } }),
        ],
      },
      phase: 'succeeded',
      sessionId: '<session>',
    },
  },
  {
    name: 'a task whose session failed has failed, with its exit code and nothing stated',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'failed', { exitCode: 3 });
      return asked(engine.view('a'));
    },
    says: {
      id: 'a',
      state: {
        ...filed('a'),
        settled: 'failed',
        attempts: [attempt({ ended: 'failed', endedAt: '<time>', reason: 'harness', nativeId: '<session>', exitCode: 3 })],
      },
      phase: 'failed',
      sessionId: '<session>',
    },
  },
];

const STOP: readonly Walk[] = [
  {
    name: 'a stop of a task nothing was filed under is refused',
    walk: ({ engine }) => asked(engine.stop('nope')),
    says: { refused: 'StopRefused' },
  },
  {
    name: 'a stop of a pending task is taken and shown, and the task settles stopped with no attempt',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const answer = await asked(engine.stop('a'));
      const asking = await asked(engine.view('a'));
      await settle('a', 'stopped');
      return [answer, asking, await asked(engine.view('a'))];
    },
    says: [
      null,
      { id: 'a', state: { ...filed('a'), stopRequested: true }, phase: 'pending', sessionId: null },
      { id: 'a', state: { ...filed('a'), stopRequested: true, settled: 'stopped' }, phase: 'stopped', sessionId: null },
    ],
  },
  {
    name: 'a stop of a task at work is shown on it, and the task settles stopped, its attempt ended by the person who asked',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working');
      await asked(engine.stop('a'));
      const asking = (await Effect.runPromise(engine.view('a'))).state.stopRequested;
      await settle('a', 'stopped');
      return [asking, await asked(engine.view('a'))];
    },
    says: [
      true,
      {
        id: 'a',
        state: {
          ...filed('a'),
          stopRequested: true,
          settled: 'stopped',
          attempts: [attempt({ ended: 'stopped', endedAt: '<time>', reason: 'operator', nativeId: '<session>' })],
        },
        phase: 'stopped',
        sessionId: '<session>',
      },
    ],
  },
  {
    name: 'a stop of a settled task is refused',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'succeeded', { exitCode: 0 });
      return asked(engine.stop('a'));
    },
    says: { refused: 'StopRefused' },
  },
];

const LOGS: readonly Walk[] = [
  {
    name: 'a task with no session yet, filed or not, says so',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      return [await asked(engine.logs('nope')), await asked(engine.logs('a'))];
    },
    says: ['(no session yet)', '(no session yet)'],
  },
];

const FEED: readonly Walk[] = [
  {
    name: 'an engine nothing was filed on has an empty feed, its cursor at the start',
    walk: ({ engine }) => asked(engine.feed(0)),
    says: { entries: [], cursor: 0 },
  },
];

const HOLD: readonly Walk[] = [
  {
    name: 'holding the attached sessions for a scope that holds none ends with the scope',
    walk: ({ engine }) => asked(Effect.scoped(engine.hold())),
    says: null,
  },
];

const DRAIN: readonly Walk[] = [
  {
    name: 'a drain is put for a holder and lifted with null',
    walk: async ({ engine }) => [await asked(engine.drain(4242)), await asked(engine.drain(null))],
    says: [null, null],
  },
  {
    name: 'a drain for a holder that is no process id is refused',
    walk: ({ engine }) => asked(engine.drain(-1)),
    says: { refused: 'DrainRefused' },
  },
];

const OUTPUT: readonly Walk[] = [
  {
    name: 'a stream of a task nothing was filed under is refused',
    walk: ({ engine }) => asked(engine.output('nope', 'stdout')),
    says: { refused: 'OutputRefused' },
  },
  {
    name: 'a stream of a task whose session printed nothing is no text',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const before = await asked(engine.output('a', 'stdout'));
      await settle('a', 'working');
      return [before, await asked(engine.output('a', 'stderr'))];
    },
    says: [null, null],
  },
  {
    name: 'a stream of a settled task is the text its session printed on it, whole or its last bytes, and no text for a stream it left empty',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await asked(engine.file(task('b')));
      await settle('a', 'succeeded', { exitCode: 0, printed: { stdout: 'one\ntwo\n', stderr: 'warned\n' } });
      await settle('b', 'failed', { exitCode: 1, printed: { stderr: 'broke\n' } });
      return [
        await asked(engine.output('a', 'stdout')),
        await asked(engine.output('a', 'stderr')),
        await asked(engine.output('a', 'stdout', 4)),
        await asked(engine.output('a', 'stdout', 400)),
        await asked(engine.output('b', 'stdout')),
        await asked(engine.output('b', 'stderr')),
      ];
    },
    says: ['one\ntwo\n', 'warned\n', 'two\n', 'one\ntwo\n', null, 'broke\n'],
  },
  {
    name: 'a stream of a task at work is the text its session has printed so far',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working', { printed: { stdout: 'so far\n' } });
      return asked(engine.output('a', 'stdout'));
    },
    says: 'so far\n',
  },
  {
    name: 'a stream that is neither, and a count of bytes that is none, are refused',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'succeeded', { exitCode: 0, printed: { stdout: 'one\n' } });
      return [
        await asked(engine.output('a', 'both' as never)),
        await asked(engine.output('a', 'stdout', 0)),
        await asked(engine.output('a', 'stdout', 1.5)),
      ];
    },
    says: [{ refused: 'OutputRefused' }, { refused: 'OutputRefused' }, { refused: 'OutputRefused' }],
  },
  {
    name: 'a stream of a task forgotten is refused',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'succeeded', { exitCode: 0, printed: { stdout: 'one\n' } });
      await asked(engine.forget(['a'], { yes: true }));
      return asked(engine.output('a', 'stdout'));
    },
    says: { refused: 'OutputRefused' },
  },
];

const LIST: readonly Walk[] = [
  {
    name: 'an engine nothing was filed on lists no task, and none unreadable',
    walk: ({ engine }) => asked(engine.list()),
    says: { views: [], unreadable: [] },
  },
  {
    name: 'every task is listed as it is viewed, and the ids given list theirs, in the order given and each once',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('b')));
      await asked(engine.file(task('a')));
      await asked(engine.file({ ...task('c'), queued: true }));
      await settle('a', 'succeeded', { exitCode: 0, closeout: { ok: 1 } });
      await settle('b', 'working');
      const every = await Effect.runPromise(engine.list());
      const viewed: boolean[] = [];
      for (const view of every.views)
        viewed.push(JSON.stringify(told(view)) === JSON.stringify(told(await Effect.runPromise(engine.view(view.id)))));
      const some = await Effect.runPromise(engine.list(['c', 'a', 'c']));
      return {
        every: every.views.map((view) => `${view.id} ${view.phase}`).sort(),
        unreadable: every.unreadable,
        asViewed: viewed,
        some: some.views.map((view) => `${view.id} ${view.phase} ${view.admission ?? ''}`),
        none: await asked(engine.list([])),
      };
    },
    says: {
      every: ['a succeeded', 'b working', 'c pending'],
      unreadable: [],
      asViewed: [true, true, true],
      some: ['c pending queued', 'a succeeded '],
      none: { views: [], unreadable: [] },
    },
  },
  {
    name: 'an id nothing was filed under is listed as it is viewed',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      return asked(engine.list(['nope', 'a']));
    },
    says: { views: [blank('nope'), { id: 'a', state: filed('a'), phase: 'pending', sessionId: null }], unreadable: [] },
  },
  {
    name: 'a list handed something other than task ids is refused',
    walk: async ({ engine }) => [await asked(engine.list('a' as never)), await asked(engine.list([1] as never))],
    says: [{ refused: 'ListRefused' }, { refused: 'ListRefused' }],
  },
];

const SAY: readonly Walk[] = [
  {
    name: 'a word to a task nothing was filed under, to one not started and to one settled is refused, and none is kept',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const refused = [await asked(engine.say('nope', 'hi')), await asked(engine.say('a', 'hi'))];
      await settle('a', 'succeeded', { exitCode: 0 });
      return [...refused, await asked(engine.say('a', 'hi')), (await Effect.runPromise(engine.view('a'))).state.said];
    },
    says: [{ refused: 'SayRefused' }, { refused: 'SayRefused' }, { refused: 'SayRefused' }, []],
  },
  {
    name: 'a word to a task at work is answered as said to its attempt, and the task keeps it',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working');
      return [await asked(engine.say('a', 'hello')), (await Effect.runPromise(engine.view('a'))).state.said];
    },
    says: [{ at: '<time>', attempt: 1, text: 'hello', after: null }, [{ at: '<time>', attempt: 1, text: 'hello', after: null }]],
  },
  {
    name: 'empty words, or whitespace alone, are refused before the task is looked for, and none is kept',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working');
      const refused = [await asked(engine.say('nope', '')), await asked(engine.say('a', '')), await asked(engine.say('a', ' \n\t'))];
      return [...refused, (await Effect.runPromise(engine.view('a'))).state.said];
    },
    says: [{ refused: 'SayRefused' }, { refused: 'SayRefused' }, { refused: 'SayRefused' }, []],
  },
];

const INTERRUPT: readonly Walk[] = [
  {
    name: 'an interrupt of a task nothing was filed under, of one not started and of one settled is refused; of one at work it ends the turn and journals nothing',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const unstarted = [await asked(engine.interrupt('nope')), await asked(engine.interrupt('a'))];
      await settle('a', 'working');
      const working = await asked(engine.interrupt('a'));
      const after = (await Effect.runPromise(engine.view('a'))).state;
      await settle('a', 'succeeded', { exitCode: 0 });
      return [...unstarted, working, after.said, after.attempts.at(-1)?.ended ?? null, await asked(engine.interrupt('a'))];
    },
    says: [
      { refused: 'InterruptRefused' },
      { refused: 'InterruptRefused' },
      { at: '<time>', attempt: 1 },
      [],
      null,
      { refused: 'InterruptRefused' },
    ],
  },
];

const TRANSCRIPT: readonly Walk[] = [
  {
    name: 'a transcript of a task nothing was filed under, or of an attempt the task has not, is refused',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const unstarted = [await asked(engine.transcript('nope')), await asked(engine.transcript('a', undefined, { attempt: 1 }))];
      await settle('a', 'working');
      return [...unstarted, await asked(engine.transcript('a', undefined, { attempt: 2 }))];
    },
    says: [{ refused: 'TranscriptRefused' }, { refused: 'TranscriptRefused' }, { refused: 'TranscriptRefused' }],
  },
  {
    name: 'a transcript of a task not started reads nothing, and one at work reads its latest attempt or the one named',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const unstarted = await asked(engine.transcript('a'));
      await settle('a', 'working');
      return [unstarted, await asked(engine.transcript('a')), await asked(engine.transcript('a', undefined, { attempt: 1 }))];
    },
    says: [
      { events: [], cursor: noTranscript().cursor },
      { events: [], cursor: noTranscript().cursor },
      { events: [], cursor: noTranscript().cursor },
    ],
  },
];

/** A forget's report, as far as both sides say it: whether anything went, and the tasks it names. */
const reported = (report: Awaited<ReturnType<typeof asked<{ forgotten: boolean; tasks: { taskId: string }[] }, unknown>>>): unknown =>
  report && 'tasks' in report ? { forgotten: report.forgotten, tasks: report.tasks.map((t) => t.taskId) } : report;

const FORGET: readonly Walk[] = [
  {
    name: 'a forget of a task nothing was filed under, of one pending and of one at work is refused, and the task stays',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const refused = [await asked(engine.forget(['nope'], { yes: true })), await asked(engine.forget(['a'], { yes: true }))];
      await settle('a', 'working');
      return [...refused, await asked(engine.forget(['a'], { yes: true })), (await Effect.runPromise(engine.view('a'))).state.brief];
    },
    says: [{ refused: 'ForgetRefused' }, { refused: 'ForgetRefused' }, { refused: 'ForgetRefused' }, 'do a'],
  },
  {
    name: 'a forget of a settled task with no yes names it and forgets nothing; with yes the task is gone',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'failed', { exitCode: 1 });
      const dry = reported(await asked(engine.forget(['a'])));
      const kept = (await Effect.runPromise(engine.view('a'))).state.settled;
      return [dry, kept, reported(await asked(engine.forget(['a'], { yes: true }))), await asked(engine.view('a'))];
    },
    says: [{ forgotten: false, tasks: ['a'] }, 'failed', { forgotten: true, tasks: ['a'] }, blank('a')],
  },
];

/** The tasks a `kept` names, sorted, or the refusal it gave: the sizes are each side's own (`APART`). */
const named = (report: Awaited<ReturnType<typeof asked<{ tasks: { taskId: string }[] }, unknown>>>): unknown =>
  report && 'tasks' in report ? report.tasks.map((t) => t.taskId).sort() : report;

const KEPT: readonly Walk[] = [
  {
    name: 'kept names a task filed, one at work and one settled each once, and no task never filed',
    walk: async ({ engine, settle }) => {
      const none = named(await asked(engine.kept()));
      for (const id of ['a', 'b', 'c']) await asked(engine.file(task(id)));
      await settle('b', 'working');
      await settle('c', 'failed', { exitCode: 1 });
      return [none, named(await asked(engine.kept()))];
    },
    says: [[], ['a', 'b', 'c']],
  },
  {
    name: 'kept handed an argument is refused, and a task forgotten is named no more',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await asked(engine.file(task('b')));
      await settle('a', 'failed', { exitCode: 1 });
      const handed: ReturnType<EngineShape['kept']> = Reflect.apply(engine.kept, engine, [['a']]);
      const refused = await asked(handed);
      await asked(engine.forget(['a'], { yes: true }));
      return [refused, named(await asked(engine.kept()))];
    },
    says: [{ refused: 'KeptRefused' }, ['b']],
  },
  {
    name: 'kept names the harness each task was filed on, the default one for a task filed on none',
    walk: async ({ engine }) => {
      await asked(engine.file({ ...task('a'), harness: 'test' }));
      await asked(engine.file(task('b')));
      const report = await asked(engine.kept());
      return report && 'tasks' in report ? report.tasks.map((t) => [t.taskId, t.harness ?? null]) : report;
    },
    says: [
      ['a', 'test'],
      ['b', 'test'],
    ],
  },
];

const ANSWER: readonly Walk[] = [
  {
    name: 'answering an ask of a task nothing was filed under, of one not started, of one at work that holds none open and of one settled is refused, and journals nothing',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      const given = { id: 'q1', answers: { 'Which way?': 'This one' } };
      const unstarted = [await asked(engine.answerAsk('nope', given)), await asked(engine.answerAsk('a', given))];
      await settle('a', 'working');
      const working = await asked(engine.answerAsk('a', given));
      const after = (await Effect.runPromise(engine.view('a'))).state;
      await settle('a', 'succeeded', { exitCode: 0 });
      return [...unstarted, working, after.said, after.attempts.at(-1)?.ended ?? null, await asked(engine.answerAsk('a', given))];
    },
    says: [
      { refused: 'AnswerRefused' },
      { refused: 'AnswerRefused' },
      { refused: 'AnswerRefused' },
      [],
      null,
      { refused: 'AnswerRefused' },
    ],
  },
];

/** A task held open as the walks file one: its turn signed, it waits on a person's answer. */
const heldOpen = (id: string) => ({ ...task(id), holdOpen: true as const });

/** A view's phase, the answers kept on its state, and its attempts: what an answered turn is told by. */
const turnOf = async (engine: EngineShape, id: string) => {
  const { phase, state } = await Effect.runPromise(engine.view(id));
  return { phase, inputs: state.inputs, attempts: state.attempts };
};

/** The attempt of a turn its session completed, as both sides say it. */
const SIGNED = attempt({ ended: 'succeeded', endedAt: '<time>', reason: 'harness', nativeId: '<session>', exitCode: 0 });

/** The answer the walk gives, as both sides keep it. */
const INPUT = { at: '<time>', text: 'make it smaller' };

const ANSWER_TURN: readonly Walk[] = [
  {
    name: "an answer to a task held open that waits is kept as its input, and the answer's turn is the next attempt, carrying its turn",
    walk: async ({ engine, settle }) => {
      await asked(engine.file(heldOpen('a')));
      await settle('a', 'succeeded', { exitCode: 0 });
      const waiting = await turnOf(engine, 'a');
      const given = await asked(engine.answer('a', 'make it smaller'));
      const answered = await turnOf(engine, 'a');
      await settle('a', 'working');
      const turning = await turnOf(engine, 'a');
      await settle('a', 'succeeded', { exitCode: 0 });
      return [waiting, given, answered, turning, await turnOf(engine, 'a')];
    },
    says: [
      { phase: 'input-required', inputs: [], attempts: [SIGNED] },
      INPUT,
      { phase: 'between-attempts', inputs: [INPUT], attempts: [SIGNED] },
      {
        phase: 'working',
        inputs: [INPUT],
        attempts: [SIGNED, attempt({ n: 2, turn: 1, nudge: 'make it smaller', resumeFrom: '<session>' })],
      },
      {
        phase: 'input-required',
        inputs: [INPUT],
        attempts: [SIGNED, { ...SIGNED, n: 2, turn: 1, nudge: 'make it smaller', resumeFrom: '<session>' }],
      },
    ],
  },
  {
    name: 'answering a task nothing was filed under, one not held open, one not started, one at work, one answered already, with no words, or its cap beside its config, is refused, and keeps only the answer it took',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('job')));
      await asked(engine.file(heldOpen('a')));
      const unstarted = [
        await asked(engine.answer('nope', 'go')),
        await asked(engine.answer('job', 'go')),
        await asked(engine.answer('a', 'go')),
      ];
      await settle('a', 'working');
      const working = await asked(engine.answer('a', 'go'));
      await settle('a', 'succeeded', { exitCode: 0 });
      const empty = await asked(engine.answer('a', '  '));
      const capBesideConfig = { budgetUsd: 1 } as never;
      const uncapped = await asked(engine.answer('a', 'go', capBesideConfig));
      await asked(engine.answer('a', 'go'));
      const twice = await asked(engine.answer('a', 'again'));
      return [...unstarted, working, empty, uncapped, twice, (await turnOf(engine, 'a')).inputs.map((i) => i.text)];
    },
    says: [...Array.from({ length: 7 }, () => ({ refused: 'InputRefused' })), ['go']],
  },
];

/** A server a factory might record, remote and plain: what the state read is handed. */
const SERVER = { type: 'http' as const, url: 'https://e.example/mcp' };

const MCP_STATE: readonly Walk[] = [
  {
    name: 'a state read is refused a record that is no map of remote servers by name, an empty one, and an entry with no url',
    walk: async ({ engine }) => [
      await asked(engine.mcpState(undefined as never)),
      await asked(engine.mcpState([SERVER] as never)),
      await asked(engine.mcpState({})),
      await asked(engine.mcpState({ local: { command: 'npx' } as never })),
      await asked(engine.mcpState({ github: SERVER, local: { command: 'npx' } as never })),
    ],
    says: [
      { refused: 'McpStateRefused' },
      { refused: 'McpStateRefused' },
      { refused: 'McpStateRefused' },
      { refused: 'McpStateRefused' },
      { refused: 'McpStateRefused' },
    ],
  },
  {
    name: 'a state read journals nothing and touches no task: a task filed beside it is untouched, and no task is made',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      await asked(engine.mcpState({ github: SERVER }));
      const list = await asked(engine.list());
      return [(list as { views: unknown[] }).views.length, (await Effect.runPromise(engine.view('a'))).phase];
    },
    says: [1, 'pending'],
  },
];

/** What `io` answers on `engine` now. */
const ioOf = (engine: EngineShape) => Effect.runPromise(engine.io());

const IO: readonly Walk[] = [
  {
    name: 'the totals are the reads, bytes, spawns, writes and locks, and the observes by harness',
    walk: async ({ engine }) => Object.keys(await ioOf(engine)).sort(),
    says: ['bytesRead', 'lockWaitMs', 'locks', 'observed', 'reads', 'spawned', 'writes'],
  },
  {
    name: 'a view of a filed task counts a read, and a list after it takes none away',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      const before = (await ioOf(engine)).reads;
      await Effect.runPromise(engine.view('a'));
      const viewed = (await ioOf(engine)).reads;
      await asked(engine.list());
      const listed = (await ioOf(engine)).reads;
      return [viewed > before, listed >= viewed];
    },
    says: [true, true],
  },
];

/** A server signed in to through an OAuth client, as GitHub is: what a sign-in and a sign-out are handed. */
const SIGNING = { ...SERVER, oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 } };

const MCP_SIGN_IN: readonly Walk[] = [
  {
    name: 'a sign-in is refused a server with no OAuth client or no callback port, and one that is no remote server',
    walk: async ({ engine }) => [
      await asked(engine.mcpSignIn('github', SERVER)),
      await asked(engine.mcpSignIn('github', { ...SERVER, oauth: { clientId: 'Iv23li' } })),
      await asked(engine.mcpSignIn('local', { command: 'npx' } as never)),
    ],
    says: [{ refused: 'McpSignInRefused' }, { refused: 'McpSignInRefused' }, { refused: 'McpSignInRefused' }],
  },
];

const MCP_SIGN_IN_STATE: readonly Walk[] = [
  {
    name: 'a server never signed in to from this engine reads none, and asking spawns nothing and touches no task',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      const state = await asked(engine.mcpSignInState('github'));
      return [state, (await Effect.runPromise(engine.view('a'))).phase];
    },
    says: [{ state: 'none' }, 'pending'],
  },
];

const MCP_SIGN_OUT: readonly Walk[] = [
  {
    name: 'a sign-out is refused a server with no OAuth client, as a sign-in is',
    walk: async ({ engine }) => [await asked(engine.mcpSignOut('github', SERVER))],
    says: [{ refused: 'McpSignInRefused' }],
  },
];

/** The contract: every kept verb's walks. */
export const WALKS = {
  file: FILE,
  view: VIEW,
  stop: STOP,
  logs: LOGS,
  feed: FEED,
  output: OUTPUT,
  list: LIST,
  say: SAY,
  interrupt: INTERRUPT,
  answerAsk: ANSWER,
  answer: ANSWER_TURN,
  transcript: TRANSCRIPT,
  forget: FORGET,
  kept: KEPT,
  hold: HOLD,
  drain: DRAIN,
  mcpState: MCP_STATE,
  mcpSignIn: MCP_SIGN_IN,
  mcpSignInState: MCP_SIGN_IN_STATE,
  mcpSignOut: MCP_SIGN_OUT,
  io: IO,
} as const;

/** A verb the stand-in keeps. */
export type Kept = keyof typeof WALKS;

/** The verbs of the engine the stand-in does not keep: each dies naming itself. A verb of `EngineShape` in neither list is unwalked. */
export const UNKEPT = [
  'tick',
  'admit',
  'follow',
  'path',
  'quota',
  'close',
  'watch',
  'tallied',
  'start',
  'up',
  'sweep',
  'removeBody',
  'compact',
] as const satisfies readonly Exclude<keyof EngineShape, Kept>[];

/** The verbs of `verbs` that are neither walked in `walks` nor named in `unkept`. */
export const unwalked = (
  verbs: readonly string[],
  walks: Readonly<Record<string, readonly Walk[] | undefined>> = WALKS,
  unkept: readonly string[] = UNKEPT,
): string[] => verbs.filter((verb) => !walks[verb]?.length && !unkept.includes(verb));

/** What `walk` answers on `side`, as both sides say it. */
export const walked = async (walk: Walk, side: Side): Promise<unknown> => told(await walk.walk(side));

/** The walks of `verb` that a side `sideOf` makes, a new one for each, does not answer as the contract says, by name. */
export async function failing(verb: Kept, sideOf: () => Side): Promise<string[]> {
  const failed: string[] = [];
  for (const walk of WALKS[verb]) {
    try {
      assert.deepStrictEqual(await walked(walk, sideOf()), walk.says);
    } catch {
      failed.push(walk.name);
    }
  }
  return failed;
}

/**
 * Every walk of the contract as a test of the side `sideOf` makes, a new one for each: its name, `<verb>: <walk>`, and its body. The
 * file of a side declares each with `test`, so the runner counts the test as that file's.
 */
export const walksOn = (sideOf: () => Side): (readonly [name: string, body: () => Promise<void>])[] =>
  Object.entries(WALKS).flatMap(([verb, walks]) =>
    walks.map((walk) => [`${verb}: ${walk.name}`, async () => assert.deepStrictEqual(await walked(walk, sideOf()), walk.says)] as const),
  );

/**
 * One thing the stand-in cannot say as the engine does: what it is, why, the sequence that shows it, and what the stand-in answers,
 * as `told` tells it. The stand-in's side proves the answer; the real engine's proves it answers otherwise.
 */
export type Apart = {
  readonly name: string;
  readonly why: string;
  readonly walk: (side: Side) => Promise<unknown>;
  readonly standIn: unknown;
};

/** What the stand-in does not hold of the engine: a test that needs one of these needs the real engine, in a boundary file. */
export const APART: readonly Apart[] = [
  {
    name: 'what a read costs',
    why: 'the engine counts the files it opened and their bytes, and the stand-in opens none: `io` counts each read verb a test asked as one read, and no byte, spawn, write, lock or observe. A test that needs the files a read opened, or their bytes, needs the real engine, in a boundary file.',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      const before = await ioOf(engine);
      await Effect.runPromise(engine.view('a'));
      const after = await ioOf(engine);
      return [after.reads - before.reads, after.bytesRead - before.bytesRead];
    },
    standIn: [1, 0],
  },
  {
    name: 'the state of a server a record holds',
    why: 'a state is read inside a Claude Code session, and the stand-in opens none: it answers what a test planted (`plantMcpState`), where an engine with no Claude Code harness refuses the read and one with it spawns a CLI. A test that needs a state read for real needs the real engine, with a Claude Code harness, in a boundary file.',
    walk: ({ engine }) => asked(engine.mcpState({ github: SERVER })),
    standIn: { read: true, servers: [{ name: 'github', status: 'pending' }] },
  },
  {
    name: 'a sign-in to a server with an OAuth client',
    why: 'a sign-in stores a secret with the `claude` CLI and holds a Claude Code session, and the stand-in spawns neither: it answers an address built from the client id and waits until a test settles it (`settleSignIn`), where an engine with no Claude Code harness refuses the sign-in. A test of the real one gives `mcpSignInVerbsOf` its seams (`src/service/mcp-sign-in.test.ts`).',
    walk: ({ engine }) => asked(engine.mcpSignIn('github', SIGNING)),
    standIn: {
      authUrl: 'https://github.com/login/oauth/authorize?client_id=Iv23liQBfm9prqhvXkuY&state=stand-in',
      until: '<time>',
    },
  },
  {
    name: 'a sign-out of a server with an OAuth client',
    why: 'a sign-out runs `claude mcp remove`, and the stand-in spawns nothing: it answers that it signed out, where an engine with no Claude Code harness refuses it.',
    walk: ({ engine }) => asked(engine.mcpSignOut('github', SIGNING)),
    standIn: { signedOut: true },
  },
  {
    name: 'the feed after a filing',
    why: 'the feed is the journal, entry by entry, and the stand-in keeps none',
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      return asked(engine.feed(0));
    },
    standIn: { entries: [], cursor: 0 },
  },
  {
    name: 'the logs of a started task',
    why: "a session's logs are its harness's, and the stand-in has none",
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'working');
      return asked(engine.logs('a'));
    },
    standIn: '(the test engine keeps no logs)',
  },
  {
    name: 'a filing the engine refuses',
    why: 'the engine judges a filing against its harnesses and their words; the stand-in files what it is handed',
    walk: ({ engine }) => asked(engine.file({ id: 'a', brief: '', cwd: 'r' })),
    standIn: 'a',
  },
  {
    name: 'whether the statement a task asked for came',
    why: 'the engine reads it off the end its harness reported; a test that needs it settles the attempt with `closedOut`',
    walk: async ({ engine, settle }) => {
      await asked(engine.file({ ...task('a'), closeoutSchema: { type: 'object' } }));
      await settle('a', 'succeeded', { exitCode: 0, closeout: { ok: 1 } });
      return (await Effect.runPromise(engine.view('a'))).state.attempts[0]?.closedOut ?? null;
    },
    standIn: null,
  },
  {
    name: 'the monotonic moments of an attempt',
    why: 'the engine journals them beside the wall clock for the durations it decides on, and the stand-in decides on none',
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'failed', { exitCode: 1 });
      return Object.keys((await Effect.runPromise(engine.view('a'))).state.attempts[0] ?? {}).filter((key) => key.endsWith('Mono'));
    },
    standIn: [],
  },
  {
    name: 'what a forget frees',
    why: "a forget's sizes and sessions are the store's and the harness's",
    walk: async ({ engine, settle }) => {
      await asked(engine.file(task('a')));
      await settle('a', 'failed', { exitCode: 1 });
      return asked(engine.forget(['a']));
    },
    standIn: { forgotten: false, tasks: [{ taskId: 'a', journalBytes: 0, feedLines: 0, sessions: [] }] },
  },
  {
    name: 'what is kept of a task',
    why: "the sizes kept are the store's and the harness's, and the stand-in answers what a test planted",
    walk: async ({ engine }) => {
      await asked(engine.file(task('a')));
      return asked(engine.kept());
    },
    standIn: { tasks: [{ taskId: 'a', harness: 'test', journal: 0, bodies: 0, output: 0, files: 0 }] },
  },
];

/** What the sequence of `apart` answers on `side`, as both sides say it. */
export const apartOn = async (apart: Apart, side: Side): Promise<unknown> => told(await apart.walk(side));
