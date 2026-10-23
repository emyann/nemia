/**
 * The engine's verbs, written once on the `Engine` service, and their refusals. Two engines over one store — one built once, one
 * provided its layer for each call — give each verb the same answer, since what a task is lives in the store; each refusal is a tagged
 * error, and `refusalWords(verb)` words it as `ae` and a layer above say it: behind the verb, exit code 2.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import {
  Engine,
  refusalWords,
  type EngineOptions,
  type EngineShape,
  type Event,
  type FeedEntry,
  type Sighting,
  type TickReport,
} from '../src/index.ts';
import { VERBS as LIFECYCLE_VERBS } from '../src/core/lifecycle.ts';
import { scratch } from './scratch.ts';
import { asyncOps, asyncStore, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';

/** A store in memory, which both engines are handed. */
const memoryJournal = (): AsyncJournal => {
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

/**
 * A harness whose sessions are a map, that hears words, keeps a transcript of them and each stream apart; `observe` rejects while
 * `unreadable` is set.
 */
const fakeHarness = (sessions: Map<string, Sighting>, heard: string[], unreadable = { now: false }): AsyncRunner => ({
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
  async output(name, stream, lastBytes) {
    return `${stream} of ${name}${lastBytes === undefined ? '' : `, its last ${lastBytes} bytes`}`;
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

/** One store and one harness, and two engines over them: one built once, and one provided its layer for each call. */
const engines = () => {
  const sessions = new Map<string, Sighting>();
  const heard: string[] = [];
  const unreadable = { now: false };
  const options: EngineOptions = {
    root: scratch('ae-verbs-'),
    journal: asyncStore(memoryJournal()),
    harnesses: { fake: asyncOps(fakeHarness(sessions, heard, unreadable)), claude: 'claude' },
    defaultHarness: 'fake',
  };
  const layer = Engine.layer(options);
  const effect = <A, E>(f: (e: EngineShape) => Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(Engine.use(f).pipe(Effect.provide(layer)));
  return { effect, built: builtEngine(Engine.layer(options)), sessions, heard, unreadable, options };
};

/** What a call rejected with; a call that resolved fails the test. */
const failure = (p: Promise<unknown>): Promise<Error & { _tag?: string; exitCode?: number; cause?: unknown }> =>
  p.then(
    (v) => assert.fail(`resolved with ${JSON.stringify(v)}`),
    (e) => e,
  );

/** The verbs the `Engine` service has: a verb added or dropped is a change to the runtime's face, and to this list. */
const VERBS = [
  'admit',
  'answer',
  'answerAsk',
  'close',
  'compact',
  'drain',
  'feed',
  'file',
  'follow',
  'forget',
  'hold',
  'interrupt',
  'io',
  'kept',
  'list',
  'logs',
  'mcpSignIn',
  'mcpSignInState',
  'mcpSignOut',
  'mcpState',
  'output',
  'path',
  'quota',
  'removeBody',
  'say',
  'start',
  'stop',
  'sweep',
  'tallied',
  'tick',
  'transcript',
  'view',
  'watch',
];

test('one store, two engines — one built once, one provided its layer for each call — and each verb gives the same answer through either', async (t) => {
  const s = story(t);
  const { effect, built, sessions, heard } = engines();

  await s.test('the Engine service has the verbs pinned, each a function', async () => {
    const service = await effect((e) => Effect.succeed(e));
    assert.deepEqual(Object.keys(service).sort(), VERBS);
    for (const verb of VERBS) assert.equal(typeof service[verb as keyof EngineShape], 'function', verb);
  });

  await s.test('filed through either, each reads the same: view, list, feed, and no output before an attempt', async () => {
    assert.equal(await effect((e) => e.file({ brief: 'one', cwd: '/r', id: 'one', queued: true })), 'one');
    assert.equal(await Effect.runPromise(built.file({ brief: 'two', cwd: '/r', id: 'two', queued: true })), 'two');
    assert.deepEqual(await effect((e) => e.view('one')), await Effect.runPromise(built.view('one')));
    assert.deepEqual(await effect((e) => e.list(['one', 'two'])), await Effect.runPromise(built.list(['one', 'two'])));
    assert.deepEqual(await effect((e) => e.list()), await Effect.runPromise(built.list()));
    assert.deepEqual(await effect((e) => e.feed(0)), await Effect.runPromise(built.feed(0)));
    assert.deepEqual(
      [await effect((e) => e.output('one', 'stdout')), await Effect.runPromise(built.output('two', 'stdout'))],
      [undefined, undefined],
    );
  });

  await s.test('watch and start run through either engine, and each stops', async () => {
    type Handle = { stop: () => void };
    const firstOf = async <A>(begin: (got: (a: A) => void, failed: (e: unknown) => void) => Promise<Handle>): Promise<A> => {
      const got: A[] = [];
      let heardOne!: () => void;
      let failed!: (e: unknown) => void;
      const once = new Promise<void>((resolve, reject) => ((heardOne = resolve), (failed = reject)));
      const handle = await begin((a) => (got.push(a), heardOne()), failed);
      await once;
      handle.stop();
      return got[0];
    };

    const heardByService = await firstOf<FeedEntry>((onEntry, onError) => effect((e) => e.watch({ onEntry, onError })));
    const heardByPromise = await firstOf<FeedEntry>(async (onEntry, onError) => Effect.runSync(built.watch({ onEntry, onError })));
    assert.deepEqual(heardByService, heardByPromise);
    assert.equal(heardByService.event.kind, 'filed');

    const tickedByService = await firstOf<TickReport>((onTick, onError) => effect((e) => e.start({ intervalMs: 1, onTick, onError })));
    const tickedByPromise = await firstOf<TickReport>(async (onTick, onError) =>
      Effect.runSync(built.start({ intervalMs: 1, onTick, onError })),
    );
    assert.deepEqual([tickedByService.tasks, tickedByPromise.tasks], [2, 2]);
    assert.equal(sessions.size, 0, 'queued, neither started');
  });

  await s.test('admitted and ticked through either, each reads the same: view, logs, output of the latest attempt, path', async () => {
    assert.deepEqual(await effect((e) => e.admit(['one'])), ['one']);
    assert.deepEqual(await Effect.runPromise(built.admit(['two'])), ['two']);
    const report = await effect((e) => e.tick());
    assert.deepEqual([report.tasks, sessions.size, report.observed.fake?.calls], [2, 2, 1]);
    const again = await Effect.runPromise(built.tick());
    assert.deepEqual(Object.keys(again).sort(), Object.keys(report).sort());
    for (const id of ['one', 'two']) {
      const view = await Effect.runPromise(built.view(id));
      assert.equal(view.phase, 'running (working)', id);
      assert.deepEqual(await effect((e) => e.view(id)), view, id);
      assert.equal(await effect((e) => e.logs(id)), await Effect.runPromise(built.logs(id)));
      const observed = Effect.runSync(built.io()).observed;
      assert.deepEqual(
        [await effect((e) => e.output(id, 'stderr', 5)), await Effect.runPromise(built.output(id, 'stdout'))],
        [`stderr of ae/${id}/1, its last 5 bytes`, `stdout of ae/${id}/1`],
        'asked of the latest attempt, by the name the engine chose',
      );
      assert.deepEqual(Effect.runSync(built.io()).observed, observed, 'output observes nothing');
      const path = await Effect.runPromise(built.path(id));
      assert.deepEqual(
        path.map((s) => `${s.state} <- ${s.event}`),
        ['submitted <- filed', 'submitted <- admitted', 'starting <- starting', 'working <- spawned'],
        id,
      );
      assert.deepEqual(await effect((e) => e.path(id)), path, id);
    }
    assert.deepEqual([await effect((e) => e.path('ghost')), await Effect.runPromise(built.path('ghost'))], [[], []]);
  });

  await s.test('words said through either reach the harness, journalled, and read back the same', async () => {
    const toOne = await effect((e) => e.say('one', 'from the service'));
    const toTwo = await Effect.runPromise(built.say('two', 'from the built engine'));
    assert.deepEqual(
      [toOne.text, toTwo.text, heard],
      ['from the service', 'from the built engine', ['from the service', 'from the built engine']],
    );
    assert.deepEqual(await effect((e) => e.transcript('one')), await Effect.runPromise(built.transcript('one')));
    assert.deepEqual((await Effect.runPromise(built.view('one'))).state.said, [toOne]);
  });

  await s.test('a stop through either is asked; io and sweep read the same', async () => {
    await effect((e) => e.stop('one'));
    await Effect.runPromise(built.stop('two'));
    for (const id of ['one', 'two']) assert.equal((await effect((e) => e.view(id))).state.stopRequested, true, id);

    const io = await effect((e) => e.io());
    assert.deepEqual(Object.keys(io).sort(), Object.keys(Effect.runSync(built.io())).sort());

    const none = { removable: 0, bytes: 0, kept: 0, removed: 0, removedBytes: 0 };
    assert.deepEqual(
      [await effect((e) => e.sweep()), await Effect.runPromise(built.sweep({ yes: true }))],
      [none, none],
      'a store that keeps no bodies has none',
    );
  });

  await s.test('follow of a task whose harness streams, before its first attempt, is nothing to follow, and no refusal', async () => {
    await Effect.runPromise(built.file({ brief: 'late', cwd: '/r', id: 'late', harness: 'claude', queued: true }));
    assert.equal(await effect((e) => e.follow('late')), undefined);
  });
});

test('a brief filed in parts is kept once, read back whole, and a body its journal names is refused removal', async () => {
  const sessions = new Map<string, Sighting>();
  const options: EngineOptions = {
    root: scratch('ae-verbs-bodies-'),
    harnesses: { fake: asyncOps(fakeHarness(sessions, [])) },
    defaultHarness: 'fake',
  };
  const effect = <A, E>(f: (e: EngineShape) => Effect.Effect<A, E>): Promise<A> =>
    Effect.runPromise(Engine.use(f).pipe(Effect.provide(Engine.layer(options))));
  const shared = `## Context\n${'the same context, said again. '.repeat(60)}\n`;
  const briefParts = [`## Task\nthe first, ${'its own words. '.repeat(80)}\n`, shared];
  await effect((e) => e.file({ brief: briefParts.join(''), briefParts, cwd: '/r', id: 'one', queued: true }));
  await effect((e) => e.file({ brief: briefParts.slice(1).join(''), briefParts: briefParts.slice(1), cwd: '/r', id: 'two', queued: true }));
  assert.deepEqual(
    [(await effect((e) => e.view('one'))).state.brief, (await effect((e) => e.view('two'))).state.brief],
    [briefParts.join(''), shared],
    'each brief reads back whole',
  );
  const counted = { removable: 0, bytes: 0, kept: 2, removed: 0, removedBytes: 0 };
  assert.deepEqual(await effect((e) => e.sweep()), counted, 'the shared part is one body');

  const ref = createHash('sha256').update(shared, 'utf8').digest('hex');
  const tagged = await failure(effect((e) => e.removeBody(ref)));
  assert.equal(tagged._tag, 'BodyRefused', tagged.message);
  assert.equal(
    tagged.message,
    `Body ${ref} is still named by task one's journal, and a body is removed only once no journal and no feed entry names it: leave it.`,
  );
  assert.deepEqual(await effect((e) => e.sweep({ yes: true })), counted, 'a sweep removes nothing a journal names');
});

test('a long-lived task through either engine: filed with its restart policy, idle and left open across passes, and ended by a stop alone', async () => {
  const { effect, built, sessions, heard } = engines();
  await effect((e) => e.file({ brief: 'one', cwd: '/r', id: 'one', restartPolicy: 'Always' }));
  await Effect.runPromise(built.file({ brief: 'two', cwd: '/r', id: 'two', restartPolicy: 'Always' }));
  await Effect.runPromise(built.tick());
  assert.equal(sessions.size, 2);
  for (const [name, s] of sessions) sessions.set(name, { ...s, state: 'input-required', busy: false, held: true });
  for (let pass = 0; pass < 3; pass++) {
    await effect((e) => e.tick());
    await Effect.runPromise(built.tick());
  }
  for (const id of ['one', 'two']) {
    const view = await Effect.runPromise(built.view(id));
    assert.deepEqual([view.phase, view.state.restartPolicy, view.state.settled], ['idle', 'Always', null], id);
    assert.deepEqual(await effect((e) => e.view(id)), view, id);
  }
  assert.deepEqual(
    [...sessions.values()].map((s) => s.state),
    ['input-required', 'input-required'],
    'no pass stopped an idle session',
  );
  assert.equal((await effect((e) => e.say('one', 'look again'))).text, 'look again', 'an idle session hears its next words');
  assert.equal((await Effect.runPromise(built.say('two', 'and again'))).text, 'and again');
  for (const [name, s] of sessions) sessions.set(name, { ...s, state: 'completed', busy: false, held: true });
  await Effect.runPromise(built.tick());
  assert.equal((await effect((e) => e.say('one', 'once more'))).text, 'once more', 'a session listed done, its process held, hears too');
  assert.equal((await Effect.runPromise(built.say('two', 'and once more'))).text, 'and once more');
  assert.deepEqual(heard.slice(-2), ['once more', 'and once more']);
  sessions.set('ae/one/1', { ...sessions.get('ae/one/1')!, held: false });
  assert.match(
    (await failure(effect((e) => e.say('one', 'gone')))).message,
    /^`one`'s session is `done` on its harness, not running: the next pass writes its end\./,
    'a session listed done with no process is gone, and refused as for a job',
  );
  sessions.set('ae/one/1', { ...sessions.get('ae/one/1')!, held: true });

  await effect((e) => e.stop('one'));
  await Effect.runPromise(built.stop('two'));
  for (let pass = 0; pass < 3; pass++) await Effect.runPromise(built.tick());
  for (const id of ['one', 'two']) assert.equal((await effect((e) => e.view(id))).state.settled, 'stopped', id);
});

test('each refusal is a tagged error, and refusalWords words it behind the verb, exit code 2: a row per verb and fault, nothing journalled', async (t) => {
  const { effect, built } = engines();
  await Effect.runPromise(built.file({ brief: 'one', cwd: '/r', id: 'one' }));
  const untyped = <F>(f: F) => f as (...args: unknown[]) => never;
  const cases: Array<[string, string, () => Promise<unknown>, RegExp]> = [
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: 'b', cwd: '/r', harness: 'nope' })),
      /^`harness: nope` is not a harness this engine has\. Its harnesses are: fake, claude\.$/,
    ],
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: 'b', cwd: '/r', harness: 'claude', config: { permissionMode: 'yolo' } })),
      /^`permissionMode: yolo` is not a mode Claude Code has\./,
    ],
    ['file', 'FileRefused', () => effect((e) => e.file({ brief: ' ', cwd: '/r' })), /^`brief` is empty/],
    ['tick', 'TickRefused', () => effect((e) => untyped(e.tick)(3)), /takes nothing|handed/],
    ['admit', 'AdmitRefused', () => effect((e) => e.admit(['ghost'])), /`ghost`/],
    ['list', 'ListRefused', () => effect((e) => untyped(e.list)('one')), /^takes the task ids to view/],
    ['transcript', 'TranscriptRefused', () => effect((e) => e.transcript('ghost')), /^`ghost` is not a task on this board\./],
    [
      'transcript',
      'TranscriptRefused',
      () => effect((e) => e.transcript('one', undefined, { attempt: 99 })),
      /^`attempt: 99` is no attempt of this task: it has no attempt yet\./,
    ],
    ['say', 'SayRefused', () => effect((e) => e.say('ghost', 'hi')), /^`ghost` is not a task on this board\./],
    ['say', 'SayRefused', () => effect((e) => e.say('one', ' ')), /^`text` is empty\./],
    ['interrupt', 'InterruptRefused', () => effect((e) => e.interrupt('ghost')), /^`ghost` is not a task on this board\./],
    [
      'interrupt',
      'InterruptRefused',
      () => effect((e) => e.interrupt('one')),
      /^the `fake` harness cannot end a turn without ending its session: only a session on streaming input takes it\./,
    ],
    ['answer', 'InputRefused', () => effect((e) => e.answer('one', 'go on')), /`one`/],
    [
      'answer',
      'InputRefused',
      () => effect((e) => e.answer('one', 'go on', { budgetUsd: 1 } as never)),
      /^`budgetUsd` is the harness's configuration/,
    ],
    ['close', 'InputRefused', () => effect((e) => e.close('one')), /`one`/],
    ['stop', 'StopRefused', () => effect((e) => e.stop('ghost')), /^`ghost` is not a task on this board\./],
    ['output', 'OutputRefused', () => effect((e) => e.output('ghost', 'stdout')), /^`ghost` is not a task on this board\./],
    ['follow', 'FollowRefused', () => effect((e) => e.follow('ghost')), /^`ghost` is not a task on this board\./],
    [
      'follow',
      'FollowRefused',
      () => effect((e) => e.follow('one')),
      /^the `fake` harness does not stream its sessions: read its transcript again \(`transcript`\) for what is new\.$/,
    ],
    [
      'output',
      'OutputRefused',
      () => effect((e) => e.output('one', 'both' as never)),
      /^`both` is not a stream: ask for `stdout` or `stderr`\.$/,
    ],
    ...[0, -1, 1.5, Number.NaN, '5'].map((lastBytes): [string, string, () => Promise<unknown>, RegExp] => [
      'output',
      'OutputRefused',
      () => effect((e) => e.output('one', 'stdout', lastBytes as never)),
      new RegExp(`^\`lastBytes: ${String(lastBytes).replace('.', '\\.')}\` is not a count of bytes`),
    ]),
    [
      'file',
      'FileRefused',
      () => effect((e) => e.file({ brief: 'one two', briefParts: ['one', 'three'], cwd: '/r' })),
      /^`briefParts` do not join into `brief`/,
    ],
    [
      'removeBody',
      'BodyRefused',
      () => effect((e) => e.removeBody('f'.repeat(64))),
      /^This store keeps no bodies, so there is no body f{64} to remove\.$/,
    ],
    [
      'sweep',
      'BodyRefused',
      () => effect((e) => untyped(e.sweep)({ yes: 'please' })),
      /^takes nothing to count the bodies no journal names, or `\{ yes: true \}` to remove them; it was handed \{"yes":"please"\}\.$/,
    ],
    ['quota', 'QuotaRefused', () => effect((e) => e.quota('fake')), /^the `fake` harness reports no quota\. Ask one that does: claude\.$/],
    [
      'mcpState',
      'McpStateRefused',
      () => effect((e) => e.mcpState({})),
      /^takes at least one server, and was handed none: a state is read of the servers a record holds\./,
    ],
    [
      'mcpSignIn',
      'McpSignInRefused',
      () => effect((e) => e.mcpSignIn('github', { type: 'http', url: 'https://e.example/mcp' })),
      /^`github` names no OAuth client with a callback port, and a sign-in is made through one\./,
    ],
    [
      'mcpSignOut',
      'McpSignInRefused',
      () => effect((e) => e.mcpSignOut('github', { type: 'http', url: 'https://e.example/mcp' })),
      /^`github` names no OAuth client with a callback port, and a sign-in is made through one\./,
    ],
    [
      'forget',
      'ForgetRefused',
      () => effect((e) => untyped(e.forget)('one')),
      /^takes the ids of settled tasks, a list of one or more strings/,
    ],
    ...[[[]], [['one'], { yes: 'y' }], [['one'], { yes: true, all: true }]].map(
      (args): [string, string, () => Promise<unknown>, RegExp] => [
        'forget',
        'ForgetRefused',
        () => effect((e) => untyped(e.forget)(...args)),
        new RegExp(
          `it was handed ${args
            .map((a) => JSON.stringify(a))
            .join(', ')
            .replace(/[[\]{}]/g, '\\$&')}: nothing was forgotten\\.$`,
        ),
      ],
    ),
    [
      'forget',
      'ForgetRefused',
      () => effect((e) => e.forget(['one'])),
      /^this store keeps no way to forget a task: nothing was forgotten\.$/,
    ],
    [
      'kept',
      'KeptRefused',
      () => effect((e) => untyped(e.kept)({ yes: true })),
      /^takes nothing, and measures every task the store lists; it was handed \{"yes":true\}: nothing was measured\.$/,
    ],
    ...[[{ yes: 'y' }], [{ other: 1 }], [{ yes: true }, { yes: true }], ['--yes']].map(
      (args): [string, string, () => Promise<unknown>, RegExp] => [
        'compact',
        'CompactRefused',
        () => effect((e) => untyped(e.compact)(...args)),
        new RegExp(
          `^takes nothing to count .* or \`\\{ yes: true \\}\` to rewrite them; it was handed ${args
            .map((a) => JSON.stringify(a))
            .join(', ')
            .replace(/[[\]{}]/g, '\\$&')}: nothing was written\\.$`,
        ),
      ],
    ),
  ];
  for (const [verb, tag, refused, words] of cases) {
    await t.test(`${verb}: ${words.source.slice(0, 80)}`, async () => {
      const tagged = await failure(refused());
      assert.equal(tagged._tag, tag, `${verb}: ${tagged.message}`);
      assert.match(tagged.message, words, verb);
      const plain = refusalWords(verb)(tagged) as Error & { _tag?: string; exitCode?: number };
      assert.deepEqual([plain.message, plain.exitCode, plain._tag], [`${verb}: ${tagged.message}`, 2, undefined], verb);
    });
  }
  await t.test('output refuses a task whose harness keeps no whole streams, naming logs', async () => {
    await Effect.runPromise(built.file({ brief: 'mixed', cwd: '/r', id: 'mixed', harness: 'claude', queued: true }));
    const tagged = await failure(effect((e) => e.output('mixed', 'stdout')));
    assert.equal(tagged._tag, 'OutputRefused');
    assert.equal(
      tagged.message,
      'the `claude` harness keeps no whole streams: it mixes them in one log. `logs` gives what its session printed.',
    );
  });
  await t.test('nothing refused was journalled', async () => {
    assert.deepEqual(
      (await Effect.runPromise(built.feed(0))).entries.map((e) => [e.taskId, e.event.kind]),
      [
        ['one', 'filed'],
        ['mixed', 'filed'],
      ],
      'nothing refused was journalled',
    );
  });
});

test("refusalWords and the failures beside the refusals: say's failure that is no refusal carries its cause and no exit code, interrupt journals nothing and is no lifecycle verb, an engine's options refused as ae says it", async (t) => {
  await t.test(
    "say's failure that is not a refusal is SayUnsent, with its cause, and refusalWords words it behind the verb with the cause and no exit code",
    async () => {
      const { effect, built, unreadable } = engines();
      await Effect.runPromise(built.file({ brief: 'one', cwd: '/r', id: 'one' }));
      await Effect.runPromise(built.tick());
      unreadable.now = true;
      const unsent = await failure(effect((e) => e.say('one', 'hi')));
      assert.equal(unsent._tag, 'SayUnsent');
      assert.match(
        unsent.message,
        /^the `fake` registry could not be read \(.*the registry is not there.*\), so ae\/one\/1 could not be found\./,
      );
      const plain = refusalWords('say')(unsent) as Error & { _tag?: string; exitCode?: number };
      assert.deepEqual([plain.message, plain.exitCode, plain._tag], [`say: ${unsent.message}`, undefined, undefined]);
      assert.ok(unsent.cause instanceof Error && plain.cause instanceof Error, 'each carries what failed');
      assert.equal(plain.cause.message, unsent.cause.message);
    },
  );

  await t.test('interrupt is no lifecycle verb: it is on no VERBS entry, and a refusal of it journals nothing', async () => {
    const { effect, built } = engines();
    assert.ok(
      !LIFECYCLE_VERBS.map((v) => v.verb as string).includes('interrupt'),
      'an interrupt journals no entry the next pass reads as a state',
    );
    await Effect.runPromise(built.file({ brief: 'one', cwd: '/r', id: 'one' }));
    await failure(effect((e) => e.interrupt('one')));
    assert.deepEqual(
      (await Effect.runPromise(built.feed(0))).entries.map((e) => [e.taskId, e.event.kind]),
      [['one', 'filed']],
      'nothing of the interrupt was journalled',
    );
  });

  await t.test("interrupt's refusal of a task settled is tagged and worded", async () => {
    const { effect, built } = engines();
    await Effect.runPromise(built.file({ brief: 'one', cwd: '/r', id: 'one' }));
    await Effect.runPromise(built.stop('one'));
    const asked = await failure(effect((e) => e.interrupt('one')));
    assert.equal(asked._tag, 'InterruptRefused');
    const plain = refusalWords('interrupt')(asked) as Error & { exitCode?: number };
    assert.deepEqual([plain.message, plain.exitCode], [`interrupt: ${asked.message}`, 2]);
  });

  await t.test('options an engine cannot be built from: EngineRefused from the layer, worded by refusalWords as ae says it', async () => {
    const options: EngineOptions = {
      root: scratch('ae-verbs-refused-'),
      journal: asyncStore(memoryJournal()),
      maxConcurrent: 0,
    };
    const refused = await failure(Effect.runPromise(Engine.use((e) => Effect.succeed(e)).pipe(Effect.provide(Engine.layer(options)))));
    assert.equal(refused._tag, 'EngineRefused');
    assert.match(refused.message, /^`maxConcurrent: 0` is not a ceiling\./);
    const plain = refusalWords('ae')(refused) as Error & { exitCode?: number };
    assert.deepEqual([plain.message, plain.exitCode], [`ae: ${refused.message}`, 2]);
  });
});
