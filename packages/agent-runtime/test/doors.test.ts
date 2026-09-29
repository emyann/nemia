/**
 * The engine through both doors: the `Engine` service of `agent-runtime/effect` and `createEngine` of `agent-runtime`, which is that
 * service with each verb run as a Promise. Each has every verb the other has; each verb gives the same answer through either, over
 * one store; and each refusal is a tagged error at the Effect door and the same words behind the verb, exit code 2, at the Promise
 * door.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import {
  createEngine,
  type EngineOptions,
  type Event,
  type FeedEntry,
  type PromiseJournal,
  type PromiseRunner,
  type Sighting,
  type TickReport,
} from '../src/facade.ts';
import { Engine, type EngineShape } from '../src/index.ts';
import { scratch } from './scratch.ts';

/** A store in memory, which both doors are handed. */
const memoryJournal = (): PromiseJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after = 0) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness whose sessions are a map, that hears words and keeps a transcript of them; `observe` rejects while `unreadable` is set. */
const fakeHarness = (sessions: Map<string, Sighting>, heard: string[], unreadable = { now: false }): PromiseRunner => ({
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
  },
  async observe() {
    if (unreadable.now) throw new Error('the registry is not there');
    return new Map(sessions);
  },
  async stop(id) {
    for (const [n, s] of sessions) if (s.sessionId === id) sessions.set(n, { ...s, state: 'canceled' });
  },
  async logs(id) {
    return `logs of ${id}`;
  },
  async transcript() {
    return {
      events: heard.map((text, i) => ({
        id: String(i),
        at: '2026-09-28T00:00:00.000Z',
        role: 'user' as const,
        kind: 'text' as const,
        text,
      })),
      cursor: String(heard.length),
    };
  },
  async say(_session, text) {
    heard.push(text);
  },
});

/** One store and one harness, and the engine over them through each door. */
const doors = () => {
  const sessions = new Map<string, Sighting>();
  const heard: string[] = [];
  const unreadable = { now: false };
  const options: EngineOptions = {
    root: scratch('ae-doors-'),
    journal: memoryJournal(),
    harnesses: { fake: fakeHarness(sessions, heard, unreadable), claude: 'claude' },
    defaultHarness: 'fake',
  };
  const layer = Engine.layer(options);
  const effect = <A, E>(f: (e: EngineShape) => Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(Engine.use(f).pipe(Effect.provide(layer)));
  return { effect, promise: createEngine(options), sessions, heard, unreadable, options };
};

/** What a call rejected with; a call that resolved fails the test. */
const failure = (p: Promise<unknown>): Promise<Error & { _tag?: string; exitCode?: number; cause?: unknown }> =>
  p.then(
    (v) => assert.fail(`resolved with ${JSON.stringify(v)}`),
    (e) => e,
  );

/** Where the service's verbs and the Promise door's differ: each verb one has and the other lacks, worded with where it goes. */
const verbDrift = (service: readonly string[], promise: readonly string[]): string[] => [
  ...service
    .filter((n) => !promise.includes(n))
    .map((n) => `createEngine has no \`${n}\`: run the service's verb as a Promise in promiseEngine (src/facade/engine.ts)`),
  ...promise
    .filter((n) => !service.includes(n))
    .map((n) => `the Engine service has no \`${n}\`: add it to EngineShape and make (src/service/engine.ts)`),
];

test('REFUSED: a verb one door has and the other lacks', () => {
  assert.deepEqual(verbDrift(['file', 'tick', 'say'], ['file', 'tick', 'answer']), [
    "createEngine has no `say`: run the service's verb as a Promise in promiseEngine (src/facade/engine.ts)",
    'the Engine service has no `answer`: add it to EngineShape and make (src/service/engine.ts)',
  ]);
});

test('each door has every verb the other has', async () => {
  const { effect, promise } = doors();
  const service = await effect((e) => Effect.succeed(e));
  assert.ok(Object.keys(service).includes('say') && Object.keys(promise).length >= 15, 'both doors are read');
  assert.deepEqual(verbDrift(Object.keys(service), Object.keys(promise)), []);
});

test('each verb gives the same answer through either door, over one store', async () => {
  const { effect, promise, sessions, heard } = doors();
  assert.equal(await effect((e) => e.file({ brief: 'one', cwd: '/r', id: 'one', queued: true })), 'one');
  assert.equal(await promise.file({ brief: 'two', cwd: '/r', id: 'two', queued: true }), 'two');
  assert.deepEqual(await effect((e) => e.view('one')), await promise.view('one'));
  assert.deepEqual(await effect((e) => e.list(['one', 'two'])), await promise.list(['one', 'two']));
  assert.deepEqual(await effect((e) => e.list()), await promise.list());
  assert.deepEqual(await effect((e) => e.feed(0)), await promise.feed(0));

  assert.deepEqual(await effect((e) => e.admit(['one'])), ['one']);
  assert.deepEqual(await promise.admit(['two']), ['two']);
  const report = await effect((e) => e.tick());
  assert.deepEqual([report.tasks, sessions.size, report.observed.fake?.calls], [2, 2, 1]);
  const again = await promise.tick();
  assert.deepEqual(Object.keys(again).sort(), Object.keys(report).sort());
  for (const id of ['one', 'two']) {
    const view = await promise.view(id);
    assert.equal(view.phase, 'running (working)', id);
    assert.deepEqual(await effect((e) => e.view(id)), view, id);
    assert.equal(await effect((e) => e.logs(id)), await promise.logs(id));
    const path = await promise.path(id);
    assert.deepEqual(
      path.map((s) => `${s.state} <- ${s.event}`),
      ['submitted <- filed', 'submitted <- admitted', 'starting <- starting', 'working <- spawned'],
      id,
    );
    assert.deepEqual(await effect((e) => e.path(id)), path, id);
  }
  assert.deepEqual([await effect((e) => e.path('ghost')), await promise.path('ghost')], [[], []]);

  const toOne = await effect((e) => e.say('one', 'from the service'));
  const toTwo = await promise.say('two', 'from the promise');
  assert.deepEqual([toOne.text, toTwo.text, heard], ['from the service', 'from the promise', ['from the service', 'from the promise']]);
  assert.deepEqual(await effect((e) => e.transcript('one')), await promise.transcript('one'));
  assert.deepEqual((await promise.view('one')).state.said, [toOne]);

  await effect((e) => e.stop('one'));
  await promise.stop('two');
  for (const id of ['one', 'two']) assert.equal((await effect((e) => e.view(id))).state.stopRequested, true, id);

  const io = await effect((e) => e.io());
  assert.deepEqual(Object.keys(io).sort(), Object.keys(promise.io()).sort());
});

test('watch and start run through either door, and each stops', async () => {
  const { effect, promise } = doors();
  await promise.file({ brief: 'one', cwd: '/r', id: 'one' });
  type Handle = { stop: () => void };
  const firstOf = async <A>(begin: (got: (a: A) => void, failed: (e: unknown) => void) => Promise<Handle>): Promise<A> => {
    const got: A[] = [];
    let heard!: () => void;
    let failed!: (e: unknown) => void;
    const once = new Promise<void>((resolve, reject) => ((heard = resolve), (failed = reject)));
    const handle = await begin((a) => (got.push(a), heard()), failed);
    await once;
    handle.stop();
    return got[0];
  };

  const heardByService = await firstOf<FeedEntry>((onEntry, onError) => effect((e) => e.watch({ onEntry, onError })));
  const heardByPromise = await firstOf<FeedEntry>(async (onEntry, onError) => promise.watch({ onEntry, onError }));
  assert.deepEqual(heardByService, heardByPromise);
  assert.equal(heardByService.event.kind, 'filed');

  const tickedByService = await firstOf<TickReport>((onTick, onError) => effect((e) => e.start({ intervalMs: 1, onTick, onError })));
  const tickedByPromise = await firstOf<TickReport>(async (onTick, onError) => promise.start({ intervalMs: 1, onTick, onError }));
  assert.deepEqual([tickedByService.tasks, tickedByPromise.tasks], [1, 1]);
});

test('each refusal is a tagged error at the Effect door, and its words behind the verb, exit code 2, at the Promise door', async () => {
  const { effect, promise } = doors();
  await promise.file({ brief: 'one', cwd: '/r', id: 'one' });
  const untyped = <F>(f: F) => f as (...args: unknown[]) => never;
  const cases: Array<[string, string, () => Promise<unknown>, () => Promise<unknown>, RegExp]> = [
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: 'b', cwd: '/r', harness: 'nope' })),
      () => promise.file({ brief: 'b', cwd: '/r', harness: 'nope' }),
      /^`harness: nope` is not a harness this engine has\. Its harnesses are: fake, claude\.$/,
    ],
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: 'b', cwd: '/r', harness: 'claude', config: { permissionMode: 'yolo' } })),
      () => promise.file({ brief: 'b', cwd: '/r', harness: 'claude', config: { permissionMode: 'yolo' } }),
      /^`permissionMode: yolo` is not a mode Claude Code has\./,
    ],
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: ' ', cwd: '/r' })),
      () => promise.file({ brief: ' ', cwd: '/r' }),
      /^`brief` is empty/,
    ],
    ['tick', 'TickRefused', () => effect((e) => untyped(e.tick)(3)), async () => untyped(promise.tick)(3), /takes nothing|handed/],
    ['admit', 'AdmitRefused', () => effect((e) => e.admit(['ghost'])), () => promise.admit(['ghost']), /`ghost`/],
    [
      'list',
      'ListRefused',
      () => effect((e) => untyped(e.list)('one')),
      async () => untyped(promise.list)('one'),
      /^takes the task ids to view/,
    ],
    [
      'transcript',
      'TranscriptRefused',
      () => effect((e) => e.transcript('ghost')),
      () => promise.transcript('ghost'),
      /^`ghost` is not a task on this board\./,
    ],
    [
      'say',
      'SayRefused',
      () => effect((e) => e.say('ghost', 'hi')),
      () => promise.say('ghost', 'hi'),
      /^`ghost` is not a task on this board\./,
    ],
    ['say', 'SayRefused', () => effect((e) => e.say('one', ' ')), () => promise.say('one', ' '), /^`text` is empty\./],
    ['answer', 'InputRefused', () => effect((e) => e.answer('one', 'go on')), () => promise.answer('one', 'go on'), /`one`/],
    [
      'answer',
      'InputRefused',
      () => effect((e) => e.answer('one', 'go on', { budgetUsd: 1 } as never)),
      () => promise.answer('one', 'go on', { budgetUsd: 1 } as never),
      /^`budgetUsd` is the harness's configuration/,
    ],
    ['close', 'InputRefused', () => effect((e) => e.close('one')), () => promise.close('one'), /`one`/],
  ];
  for (const [verb, tag, viaService, viaPromise, words] of cases) {
    const tagged = await failure(viaService());
    assert.equal(tagged._tag, tag, `${verb}: ${tagged.message}`);
    assert.match(tagged.message, words, verb);
    const plain = await failure(viaPromise());
    assert.deepEqual([plain.message, plain.exitCode, plain._tag], [`${verb}: ${tagged.message}`, 2, undefined], verb);
  }
  assert.deepEqual(
    (await promise.feed(0)).entries.map((e) => [e.taskId, e.event.kind]),
    [['one', 'filed']],
    'nothing refused was journalled',
  );
  assert.throws(
    () => untyped(promise.list)('one'),
    (e: Error & { exitCode?: number }) => e.exitCode === 2 && e.message.startsWith('list: takes the task ids'),
    'the Promise door throws a list refusal at the call, as it always has',
  );
});

test("say's failure that is not a refusal is SayUnsent at the Effect door, with its cause, and an Error with the cause and no exit code at the Promise door", async () => {
  const { effect, promise, unreadable } = doors();
  for (const id of ['one', 'two']) await promise.file({ brief: id, cwd: '/r', id });
  await promise.tick();
  unreadable.now = true;
  const unsent = await failure(effect((e) => e.say('one', 'hi')));
  assert.equal(unsent._tag, 'SayUnsent');
  assert.match(
    unsent.message,
    /^the `fake` registry could not be read \(.*the registry is not there.*\), so ae\/one\/1 could not be found\./,
  );
  const plain = await failure(promise.say('two', 'hi'));
  assert.deepEqual(
    [plain.message, plain.exitCode, plain._tag],
    [`say: ${unsent.message.replaceAll('ae/one/1', 'ae/two/1')}`, undefined, undefined],
  );
  assert.ok(unsent.cause instanceof Error && plain.cause instanceof Error, 'each carries what failed');
  assert.equal(plain.cause.message, unsent.cause.message);
});

test('options an engine cannot be built from: EngineRefused from the layer, and a throw at the call from createEngine', async () => {
  const options = { journal: memoryJournal(), maxConcurrent: 2 } as unknown as EngineOptions;
  const refused = await failure(Effect.runPromise(Engine.use((e) => Effect.succeed(e)).pipe(Effect.provide(Engine.layer(options)))));
  assert.equal(refused._tag, 'EngineRefused');
  assert.match(refused.message, /^`maxConcurrent` is retired/);
  assert.throws(
    () => createEngine(options),
    (e: Error & { exitCode?: number }) => e.exitCode === 2 && e.message === `createEngine: ${refused.message}`,
  );
});
