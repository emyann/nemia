/**
 * A task held open: an attempt that signs leaves the task `input-required` with nothing
 * running; an answer is a new attempt that continues the session; a close settles it. Walked through the engine, over a store in
 * memory and over the Effect layers, and each refusal of `answer` and `close` made to refuse, with nothing journalled.
 *
 * The Effect layers' harness lets a session go as `claude-bg`'s does: a session released is not listed. A process there is the
 * file store under a root and that harness, and a restart is a new one on the same two, reading only the store.
 *
 * `decide`'s half is in `decide.test.ts` (HELD OPEN); the words it journals are pinned in `journal-words.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Effect, Layer } from 'effect';
import {
  answer,
  close,
  file,
  InputRefused,
  Engine,
  Journal,
  Runner,
  testOps,
  tick,
  view,
  type Event,
  type Sighting,
  type SpawnRequest,
} from '../src/index.ts';
import { fold } from '../src/core/domain.ts';
import { parseBrief } from '../src/cli/main.ts';
import { taskLine } from '../src/cli/lines.ts';
import { scratch } from './scratch.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

/** Sign the session `name` off: done, with a closeout given a moment after its attempt started (`began`, as journalled). */
const signed = (sessions: Map<string, Sighting>, name: string, summary: string, began: string) =>
  sessions.set(name, {
    ...sessions.get(name)!,
    state: 'completed',
    busy: false,
    closeout: { payload: { outcome: 'done', summary }, at: Date.parse(began) + 1_000 },
  });

test('the Effect door: signed, it waits with its session released; answered after a restart, it resumes; closed, it settles', async () => {
  const root = scratch('ae-hold-open-');
  try {
    const sessions = new Map<string, Sighting>();
    const spawned: SpawnRequest[] = [];
    const released: string[] = [];
    const ops = testOps({ sessions, spawned });
    const harness = Runner.layer({
      ...ops,
      release: (s) =>
        Effect.sync(() => {
          released.push(s.sessionId);
          for (const [name, t] of sessions) if (t.sessionId === s.sessionId) sessions.delete(name);
        }),
    });
    const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) =>
      Effect.runPromise(e.pipe(Effect.provide(Layer.mergeAll(Journal.files(root), harness))));
    const phase = async (id: string) =>
      (await run(Effect.flatMap(Runner, (r) => r.observe).pipe(Effect.flatMap((o) => view(id, o))))).phase;

    const id = await run(file({ brief: 'draft the plan', cwd: '/repo', holdOpen: true, config: { model: 'opus', budgetUsd: 1 } }));
    await run(tick());
    signed(sessions, `ae/${id}/1`, 'a first draft', (await run(view(id, new Map()))).state.attempts[0].startedAt);
    await run(tick());
    assert.equal(await phase(id), 'input-required');
    assert.deepEqual(released, ['fake-1'], 'the signed session is let go: nothing runs while it waits');
    for (let i = 0; i < 3; i++) await run(tick());
    assert.equal(spawned.length, 1, 'and nothing is started while it waits, pass after pass');
    assert.equal(await phase(id), 'input-required');

    const input = await run(answer(id, 'shorter, please', { budgetUsd: 0.5 }));
    assert.equal(input.text, 'shorter, please');
    assert.deepEqual(input.config, { budgetUsd: 0.5 });
    await run(tick());
    assert.equal(spawned.length, 2);
    assert.equal(spawned[1].name, `ae/${id}/2`);
    assert.equal(spawned[1].resumeFrom, 'fake-1', 'it continues the session that signed');
    assert.equal(spawned[1].brief, 'shorter, please', 'told the answer, not the brief again');
    assert.deepEqual(
      spawned[1].config,
      { model: 'opus', budgetUsd: 0.5 },
      "under the answer's budget, laid over the rest of the filing's configuration",
    );
    assert.deepEqual(spawned[0].config, { model: 'opus', budgetUsd: 1 }, "the first turn under the filing's");
    assert.equal(await phase(id), 'running (working)');

    signed(sessions, `ae/${id}/2`, 'a shorter draft', (await run(view(id, new Map()))).state.attempts[1].startedAt);
    await run(tick());
    assert.equal(await phase(id), 'input-required', 'signed again: it waits again');
    await run(close(id));
    await run(tick());
    const settled = await run(view(id, new Map()));
    assert.equal(settled.phase, 'succeeded');
    const events = await run(Effect.flatMap(Journal, (j) => j.read(id)));
    assert.deepEqual(
      events.slice(-2).map((e) => (e.kind === 'settled' ? [e.kind, e.outcome, e.note] : [e.kind])),
      [['closed'], ['settled', 'succeeded', 'closed']],
    );
    assert.deepEqual(
      settled.state.attempts.map((a) => a.closeout),
      [
        { outcome: 'done', summary: 'a first draft' },
        { outcome: 'done', summary: 'a shorter draft' },
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the engine over the Effect layers refuses: InputRefused, and nothing journalled — a budget its harness would not keep refused by the harness, and a turn's configuration other than its spend cap", async () => {
  const journal = Journal.test();
  const layer = Layer.mergeAll(
    journal,
    Runner.layer({ ...testOps(), refuses: (t) => (t.config?.budgetUsd !== undefined ? 'keeps no cap' : undefined) }),
  );
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(Effect.result(e).pipe(Effect.provide(layer)));
  const refusedWith = async (e: Effect.Effect<unknown, unknown, Journal | Runner>, pattern: RegExp) => {
    const r = await run(e);
    assert.equal(r._tag, 'Failure');
    const err = (r as { failure: unknown }).failure;
    assert.ok(err instanceof InputRefused, String(err));
    assert.match(err.message, pattern);
  };
  const id = ((await run(file({ brief: 'b', cwd: '/r' }))) as { success: string }).success;
  await refusedWith(answer(id, 'go on'), /^`t-.*` was not filed to be held open/);
  await refusedWith(close(id), /^`t-.*` was not filed to be held open/);
  await refusedWith(answer('t-nope', 'go on'), /^`t-nope` is not a task on this board/);
  const held = ((await run(file({ brief: 'b', cwd: '/r', holdOpen: true }))) as { success: string }).success;
  await refusedWith(answer(held, ' '), /^`text` is empty/);
  await refusedWith(answer(held, 'go on'), /has not started an attempt yet/);
  const count = async (task: string) => ((await run(Effect.flatMap(Journal, (j) => j.read(task)))) as { success: Event[] }).success.length;
  assert.equal(await count(held), 1, 'nothing journalled');
  const unrecorded = ((await run(file({ brief: 'b', cwd: '/r', holdOpen: true }))) as { success: string }).success;
  await run(
    Effect.flatMap(Journal, (j) =>
      Effect.forEach(
        signedJournal().map((e) => (e.kind === 'ended' ? { ...e, nativeId: undefined } : e)),
        (e) => j.append(unrecorded, e),
      ),
    ),
  );
  await refusedWith(answer(unrecorded, 'go on'), /harness recorded no session for it/);
  assert.equal(await count(unrecorded), 4, 'nothing journalled');
  await run(Effect.flatMap(Journal, (j) => Effect.forEach(signedJournal(), (e) => j.append(held, e))));
  await refusedWith(answer(held, 'go on', { budgetUsd: 2 }), /^keeps no cap$/);
  await refusedWith(answer(held, 'go on', { model: 'opus' }), /^`config\.model` cannot be given to one turn/);
  await refusedWith(answer(held, 'go on', { budgetUsd: 0 }), /^`budgetUsd: 0` is not an amount of dollars/);
  assert.equal(await count(held), 4);
  assert.equal((await run(answer(held, 'go on')))._tag, 'Success');
  assert.equal(await count(held), 5);
});

/** A first attempt that started, spawned and ended signed: a held-open task waiting for its answer. */
const signedJournal = (): Event[] => [
  { kind: 'starting', at: new Date().toISOString(), attempt: 1 },
  { kind: 'spawned', at: new Date().toISOString(), attempt: 1 },
  {
    kind: 'ended',
    at: new Date().toISOString(),
    attempt: 1,
    sessionId: 's-1',
    observed: 'done',
    reason: 'harness',
    nativeId: 's-1',
    closeout: { ok: true },
  },
];

/**
 * The engine over a store in memory a test may write to by hand, and a harness the test moves. Its `write` writes a task's
 * journal by hand: the filing, held open unless said, then `events`.
 */
const board = (harnesses?: Record<string, 'claude-bg'>) => {
  const tasks = new Map<string, Event[]>();
  const journal: AsyncJournal = {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const fake: AsyncRunner = {
    async spawn(r) {
      const id = `s-${++n}`;
      sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(sessionId) {
      for (const [k, s] of sessions) if (s.sessionId === sessionId) sessions.set(k, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-hold-open-root-'), journal: asyncStore(journal), harnesses: harnesses ?? { fake: asyncOps(fake) } }),
  );
  const write = (id: string, events: Event[], filed: Partial<Extract<Event, { kind: 'filed' }>> = {}) =>
    tasks.set(id, [
      { kind: 'filed', at: new Date().toISOString(), brief: 'b', cwd: '/r', holdOpen: true, harness: 'fake', ...filed },
      ...events,
    ]);
  return { engine, sessions, tasks, write };
};

/** `fn` rejects with `InputRefused` or `FileRefused` and a message matching `pattern`, and `id`'s journal is as long as it was. */
const refuses = async (b: ReturnType<typeof board>, id: string, fn: () => Promise<unknown>, pattern: RegExp) => {
  const before = b.tasks.get(id)?.length ?? 0;
  await assert.rejects(fn, (e: Error & { _tag?: string }) => {
    assert.ok(e._tag === 'InputRefused' || e._tag === 'FileRefused', e.message);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal(b.tasks.get(id)?.length ?? 0, before, 'nothing journalled');
};

test('over a store in memory: signed, it waits; answered, it resumes; a stop settles it stopped, waiting', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file({ brief: 'draft', cwd: '/r', harness: 'fake', holdOpen: true }));
  await Effect.runPromise(b.engine.tick());
  signed(b.sessions, `ae/${id}/1`, 'drafted', (await Effect.runPromise(b.engine.view(id))).state.attempts[0].startedAt);
  await Effect.runPromise(b.engine.tick());
  const v = await Effect.runPromise(b.engine.view(id));
  assert.equal(v.phase, 'input-required');
  assert.equal(v.state.settled, null);
  const said = await Effect.runPromise(b.engine.answer(id, 'again'));
  assert.deepEqual(Object.keys(said), ['at', 'text'], 'no configuration given, none journalled');
  assert.deepEqual((await Effect.runPromise(b.engine.view(id))).state.inputs, [said]);
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view(id))).phase, 'running (working)');
  signed(b.sessions, `ae/${id}/2`, 'again', (await Effect.runPromise(b.engine.view(id))).state.attempts[1].startedAt);
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view(id))).phase, 'input-required');
  await Effect.runPromise(b.engine.stop(id));
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view(id))).phase, 'stopped');
});

test("answer refuses what is no answer: empty words, a budget that is not dollars, one its harness would not keep, one beside config, and any other key of a turn's", async () => {
  const b = board();
  b.write('t-w', signedJournal());
  await refuses(b, 't-w', () => Effect.runPromise(b.engine.answer('t-w', '')), /^`text` is empty\. Give the words/);
  await refuses(b, 't-w', () => Effect.runPromise(b.engine.answer('t-w', '  \n')), /^`text` is empty/);
  for (const budgetUsd of [0, -1, Number.NaN, Infinity, '5' as unknown as number]) {
    await refuses(
      b,
      't-w',
      () => Effect.runPromise(b.engine.answer('t-w', 'go', { config: { budgetUsd } })),
      /^`budgetUsd: .*` is not an amount of dollars\. Give dollars above 0/,
    );
  }
  await refuses(
    b,
    't-w',
    () => Effect.runPromise(b.engine.answer('t-w', 'go', { budgetUsd: 1 } as never)),
    /^`budgetUsd` is the harness's configuration: give it under `config`, as `answer\(id, text, \{ config: \{ budgetUsd: … \} \}\)`\.$/,
  );
  await refuses(
    b,
    't-w',
    () => Effect.runPromise(b.engine.answer('t-w', 'go', { config: { model: 'opus' } })),
    /^`config\.model` cannot be given to one turn/,
  );
  await refuses(
    b,
    't-w',
    () => Effect.runPromise(b.engine.answer('t-w', 'go', { config: 'cheap' as never })),
    /^`config: "cheap"` is not a turn's configuration/,
  );
  const bg = board({ bg: 'claude-bg' });
  bg.write('t-bg', signedJournal(), { harness: 'bg' });
  await refuses(
    bg,
    't-bg',
    () => Effect.runPromise(bg.engine.answer('t-bg', 'go', { config: { budgetUsd: 1 } })),
    /^`budgetUsd: 1` is a spend cap, and a `claude --bg` session does not keep one/,
  );
});

test('answer and close refuse a task that is not waiting for one, each saying what to do', async () => {
  const b = board();
  const cases: Array<[string, Event[], Partial<Extract<Event, { kind: 'filed' }>>, RegExp, RegExp]> = [
    [
      't-plain',
      signedJournal(),
      { holdOpen: undefined },
      /was not filed to be held open.*File it with `holdOpen: true` to answer it/,
      /to close it/,
    ],
    ['t-new', [], {}, /has not started an attempt yet/, /has not started an attempt yet/],
    [
      't-running',
      signedJournal().slice(0, 2),
      {},
      /attempt 1 is running\. `say` tells a running session something/,
      /attempt 1 is running\. `stop` ends it now/,
    ],
    [
      't-between',
      [
        ...signedJournal().slice(0, 2),
        {
          kind: 'ended',
          at: new Date().toISOString(),
          attempt: 1,
          sessionId: 's-1',
          observed: 'failed',
          reason: 'harness',
          nativeId: 's-1',
        },
      ],
      {},
      /attempt 1 ended `failed`, and the task is between attempts/,
      /between attempts/,
    ],
    [
      't-answered',
      [...signedJournal(), { kind: 'input', at: new Date().toISOString(), text: 'go' }],
      {},
      /has been answered already/,
      /has been answered already/,
    ],
    [
      't-closed',
      [...signedJournal(), { kind: 'closed', at: new Date().toISOString() }],
      {},
      /has been closed: the next pass settles it/,
      /has been closed/,
    ],
    [
      't-stopping',
      [...signedJournal(), { kind: 'stop-requested', at: new Date().toISOString() }],
      {},
      /has been asked to stop/,
      /has been asked to stop/,
    ],
    [
      't-settled',
      [...signedJournal(), { kind: 'settled', at: new Date().toISOString(), outcome: 'succeeded', note: 'closed' }],
      {},
      /has settled \(succeeded\)/,
      /has settled/,
    ],
  ];
  for (const [id, events, filed, answering, closing] of cases) {
    b.write(id, events, filed);
    await refuses(b, id, () => Effect.runPromise(b.engine.answer(id, 'go')), new RegExp(`^\`${id}\`.*${answering.source}`));
    await refuses(b, id, () => Effect.runPromise(b.engine.close(id)), new RegExp(`^\`${id}\`.*${closing.source}`));
  }
  const unrecorded = signedJournal().map((e) => (e.kind === 'ended' ? (({ nativeId: _, ...rest }) => rest)(e) : e)) as Event[];
  b.write('t-unrecorded', unrecorded);
  await refuses(
    b,
    't-unrecorded',
    () => Effect.runPromise(b.engine.answer('t-unrecorded', 'go')),
    /^`t-unrecorded`'s attempt 1 signed, but its harness recorded no session for it, so there is no conversation for an answer to continue\. `close` it/,
  );
  assert.equal((await Effect.runPromise(b.engine.view('t-unrecorded'))).phase, 'input-required');
  await Effect.runPromise(b.engine.close('t-unrecorded'));
  assert.equal(b.tasks.get('t-unrecorded')!.at(-1)!.kind, 'closed');
  await refuses(b, 't-nope', () => Effect.runPromise(b.engine.answer('t-nope', 'go')), /^`t-nope` is not a task on this board/);
  await refuses(b, 't-nope', () => Effect.runPromise(b.engine.close('t-nope')), /^`t-nope` is not a task on this board/);
  b.write('t-waits', signedJournal());
  await Effect.runPromise(b.engine.close('t-waits'));
  assert.equal(b.tasks.get('t-waits')!.at(-1)!.kind, 'closed', 'the control: the same board closes a task that waits');
});

test('file refuses a holdOpen that is not true', async () => {
  const b = board();
  for (const holdOpen of [false, 'yes', 1]) {
    await assert.rejects(
      Effect.runPromise(b.engine.file({ brief: 'b', cwd: '/r', harness: 'fake', holdOpen: holdOpen as true })),
      (e: Error & { _tag?: string }) => {
        assert.equal(e._tag, 'FileRefused', e.message);
        assert.match(e.message, /^`holdOpen: .*` is not a yes\. Give true/);
        return true;
      },
    );
  }
  assert.equal(b.tasks.size, 0);
});

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

test('ae answer prints the line it journalled, the words being everything after the id but --budget; ae close; each refusal exits 2', async () => {
  const root = scratch('ae-hold-open-cli-');
  try {
    const engine = builtEngine(Engine.layer({ root }));
    const waiting = async () => {
      const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: root, holdOpen: true }));
      await Effect.runPromise(
        Effect.flatMap(Journal, (j) => Effect.forEach(signedJournal(), (e) => j.append(id, e))).pipe(Effect.provide(Journal.files(root))),
      );
      return id;
    };
    const journal = async (id: string) =>
      Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(id)).pipe(Effect.provide(Journal.files(root))));
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [ae, ...args], { env: { ...process.env, AE_ROOT: root }, encoding: 'utf8' });

    const a = await waiting();
    const bad = run('answer', a, 'shorter', '--budget', '$5');
    assert.equal(bad.status, 2, bad.stderr);
    assert.match(bad.stderr, /^answer: `--budget \$5` is not an amount of dollars\. Write dollars above 0, digits only/);
    assert.match(run('answer', a, 'shorter', '--budget').stderr, /^answer: `--budget ` is not an amount of dollars/);
    assert.equal((await journal(a)).length, 4, 'nothing journalled');
    const ok = run('answer', a, 'shorter,', 'please', '--budget', '0.5');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /answered\s+shorter, please  \(budget \$0\.5\)\n/);
    const last = (await journal(a)).at(-1)!;
    assert.deepEqual(last.kind === 'input' ? [last.text, last.config] : last, ['shorter, please', { budgetUsd: 0.5 }]);
    const again = run('close', a);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /^close: `t-.*` has been answered already/);
    const empty = run('answer', a, '');
    assert.equal(empty.status, 2);
    assert.match(empty.stderr, /^answer: `text` is empty/);

    const c = await waiting();
    const closed = run('close', c);
    assert.equal(closed.status, 0, closed.stderr);
    assert.match(closed.stdout, /closed: the next tick settles it/);
    assert.equal((await journal(c)).at(-1)!.kind, 'closed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a brief says `holdOpen: true` or `false`, and nothing else', () => {
  const brief = (v: string) => `---\nholdOpen: ${v}\n---\ndo it`;
  assert.equal(parseBrief(brief('true'), '/r').holdOpen, true);
  assert.equal(Object.hasOwn(parseBrief(brief('false'), '/r'), 'holdOpen'), false, 'false: not held open, and no key');
  for (const bad of ['yes', 'True', '1']) {
    assert.throws(
      () => parseBrief(brief(bad), '/r'),
      (e: Error & { exitCode?: number }) =>
        e.exitCode === 2 && /^brief: `holdOpen: .*` is not true or false\. Write `holdOpen: true`/.test(e.message),
    );
  }
});

test('ae ls names the turn of a task held open, and counts no attempts: one per start', () => {
  const at = new Date().toISOString();
  const events: Event[] = [
    { kind: 'filed', at, brief: 'b', cwd: '/r', holdOpen: true },
    ...signedJournal(),
    { kind: 'input', at, text: 'again' },
    { kind: 'starting', at, attempt: 2 },
  ];
  const line = (n: number) => taskLine({ id: 't-1', state: fold('t-1', events.slice(0, n)), phase: 'x', sessionId: null });
  assert.doesNotMatch(line(4), /turn/, 'turn 0: nothing to name');
  assert.match(line(5), / x {17} turn 1  /, 'answered: a turn with no attempt yet');
  assert.match(line(6), / x {17} turn 1  /);
  for (const n of [4, 5, 6]) assert.doesNotMatch(line(n), /\d\/\d/, 'no count of attempts against a maximum');
});
