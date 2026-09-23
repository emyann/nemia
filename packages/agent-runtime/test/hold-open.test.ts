/**
 * A task held open (R1, thin runtime stage 2 part 4): an attempt that signs leaves the task `input-required` with nothing
 * running; an answer is a new attempt that continues the session; a close settles it. Walked through both doors — the
 * facade and the Effect door — and each refusal of `answer` and `close` made to refuse, with nothing journalled.
 *
 * `decide`'s half is in `decide.test.ts` (HELD OPEN); the words it journals are pinned in `journal-words.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Effect, Layer } from 'effect';
import {
  answer, close, file, InputRefused, Journal, Runner, testOps, tick, view, type Event, type Sighting, type SpawnRequest,
} from '../src/index.ts';
import { createEngine, type PromiseJournal, type PromiseRunner } from '../src/facade.ts';
import { fold } from '../src/domain.ts';
import { parseBrief, taskLine } from '../src/cli.ts';

/** Sign the session `name` off: done, with a closeout given after its attempt started. */
const signed = (sessions: Map<string, Sighting>, name: string, summary: string) => sessions.set(name, {
  ...sessions.get(name)!, state: 'done', busy: false,
  closeout: { payload: { outcome: 'done', summary }, at: Date.now() + 60_000 },
});

test('the Effect door: signed, it waits with its session released; answered after a restart, it resumes; closed, it settles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-hold-open-'));
  try {
    const sessions = new Map<string, Sighting>();
    const spawned: SpawnRequest[] = [];
    const released: string[] = [];
    // A harness that lets a session go as `claude-bg`'s does: no longer listed once released.
    const ops = testOps({ sessions, spawned });
    const harness = Runner.layer({ ...ops, release: (s) => Effect.sync(() => {
      released.push(s.sessionId);
      for (const [name, t] of sessions) if (t.sessionId === s.sessionId) sessions.delete(name);
    }) });
    // A process: the file store under `root`, and the harness. A restart is a new one on the same two.
    const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) =>
      Effect.runPromise(e.pipe(Effect.provide(Layer.mergeAll(Journal.files(root), harness))));
    const phase = async (id: string) => (await run(Effect.flatMap(Runner, (r) => r.observe).pipe(Effect.flatMap((o) => view(id, o))))).phase;

    const id = await run(file({ brief: 'draft the plan', cwd: '/repo', holdOpen: true, budgetUsd: 1 }));
    await run(tick());
    signed(sessions, `ae/${id}/1`, 'a first draft');
    await run(tick());
    assert.equal(await phase(id), 'input-required');
    assert.deepEqual(released, ['fake-1'], 'the signed session is let go: nothing runs while it waits');
    for (let i = 0; i < 3; i++) await run(tick());
    assert.equal(spawned.length, 1, 'and nothing is started while it waits, pass after pass');
    assert.equal(await phase(id), 'input-required');

    const input = await run(answer(id, 'shorter, please', 0.5));
    assert.equal(input.text, 'shorter, please');
    assert.equal(input.budgetUsd, 0.5);
    // A new process, reading only the store: the answer is on the record, so the turn is too.
    await run(tick());
    assert.equal(spawned.length, 2);
    assert.equal(spawned[1]!.name, `ae/${id}/2`);
    assert.equal(spawned[1]!.resumeFrom, 'fake-1', 'it continues the session that signed');
    assert.equal(spawned[1]!.brief, 'shorter, please', 'told the answer, not the brief again');
    assert.equal(spawned[1]!.budgetUsd, 0.5, "under the answer's budget");
    assert.equal(spawned[0]!.budgetUsd, 1, "the first turn under the filing's");
    assert.equal(await phase(id), 'running (working)');

    signed(sessions, `ae/${id}/2`, 'a shorter draft');
    await run(tick());
    assert.equal(await phase(id), 'input-required', 'signed again: it waits again');
    await run(close(id));
    await run(tick());
    const settled = await run(view(id, new Map()));
    assert.equal(settled.phase, 'succeeded');
    const events = await run(Effect.flatMap(Journal, (j) => j.read(id)));
    assert.deepEqual(events.slice(-2).map((e) => e.kind === 'settled' ? [e.kind, e.outcome, e.note] : [e.kind]), [['closed'], ['settled', 'succeeded', 'closed']]);
    assert.deepEqual(settled.state.attempts.map((a) => a.closeout), [
      { outcome: 'done', summary: 'a first draft' }, { outcome: 'done', summary: 'a shorter draft' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the Effect door refuses as the facade does: InputRefused, and nothing journalled', async () => {
  const journal = Journal.test();
  const layer = Layer.mergeAll(journal, Runner.layer({ ...testOps(), refuses: (t) => (t.budgetUsd !== undefined ? 'keeps no cap' : undefined) }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(Effect.result(e).pipe(Effect.provide(layer)));
  const refusedWith = async (e: Effect.Effect<unknown, unknown, Journal | Runner>, pattern: RegExp) => {
    const r = await run(e);
    assert.equal(r._tag, 'Failure');
    const err = (r as { failure: unknown }).failure;
    assert.ok(err instanceof InputRefused, String(err));
    assert.match(err.message, pattern);
  };
  const id = (await run(file({ brief: 'b', cwd: '/r' })) as { success: string }).success;
  await refusedWith(answer(id, 'go on'), /^`t-.*` was not filed to be held open/);
  await refusedWith(close(id), /^`t-.*` was not filed to be held open/);
  await refusedWith(answer('t-nope', 'go on'), /^`t-nope` is not a task on this board/);
  const held = (await run(file({ brief: 'b', cwd: '/r', holdOpen: true })) as { success: string }).success;
  await refusedWith(answer(held, ' '), /^`text` is empty/);
  await refusedWith(answer(held, 'go on'), /has not started an attempt yet/);
  const count = async (task: string) => ((await run(Effect.flatMap(Journal, (j) => j.read(task)))) as { success: Event[] }).success.length;
  assert.equal(await count(held), 1, 'nothing journalled');
  // Waiting, the words are taken; a budget its harness would not keep is refused by the harness, at this door too.
  await run(Effect.flatMap(Journal, (j) => Effect.forEach(signedJournal(), (e) => j.append(held, e))));
  await refusedWith(answer(held, 'go on', 2), /^keeps no cap$/);
  assert.equal(await count(held), 4);
  assert.equal((await run(answer(held, 'go on')))._tag, 'Success');
  assert.equal(await count(held), 5);
});

/** A first attempt that started, spawned and ended signed: a held-open task waiting for its answer. */
const signedJournal = (): Event[] => [
  { kind: 'starting', at: new Date().toISOString(), attempt: 1 },
  { kind: 'spawned', at: new Date().toISOString(), attempt: 1 },
  { kind: 'ended', at: new Date().toISOString(), attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 's-1', closeout: { ok: true } },
];

/** The facade over a store in memory a test may write to by hand, and a harness the test moves. */
const board = (harnesses?: Record<string, PromiseRunner | 'claude-bg'>) => {
  const tasks = new Map<string, Event[]>();
  const journal: PromiseJournal = {
    async append(taskId, event) { tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]); },
    async read(taskId) { return [...(tasks.get(taskId) ?? [])]; },
    async list() { return [...tasks.keys()].sort(); },
    async feed() { return { entries: [], cursor: 0 }; },
  };
  const sessions = new Map<string, Sighting>();
  let n = 0;
  const fake: PromiseRunner = {
    async spawn(r) { const id = `s-${++n}`; sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id }); },
    async observe() { return new Map(sessions); },
    async stop(sessionId) { for (const [k, s] of sessions) if (s.sessionId === sessionId) sessions.set(k, { ...s, state: 'stopped', busy: false }); },
    async logs() { return ''; },
  };
  const engine = createEngine({ journal, harnesses: harnesses ?? { fake } });
  /** Write a task's journal by hand: the filing, held open unless said, then `events`. */
  const write = (id: string, events: Event[], filed: Partial<Extract<Event, { kind: 'filed' }>> = {}) => tasks.set(id, [
    { kind: 'filed', at: new Date().toISOString(), brief: 'b', cwd: '/r', maxAttempts: 2, holdOpen: true, harness: 'fake', ...filed }, ...events]);
  return { engine, sessions, tasks, write };
};

/** `fn` rejects with exit code 2 and a message matching `pattern`, and `id`'s journal is as long as it was. */
const refuses = async (b: ReturnType<typeof board>, id: string, fn: () => Promise<unknown>, pattern: RegExp) => {
  const before = b.tasks.get(id)?.length ?? 0;
  await assert.rejects(fn, (e: Error & { exitCode?: number }) => {
    assert.equal(e.exitCode, 2, e.message);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal(b.tasks.get(id)?.length ?? 0, before, 'nothing journalled');
};

test('the facade: signed, it waits; answered, it resumes; a stop settles it stopped, waiting', async () => {
  const b = board();
  const id = await b.engine.file({ brief: 'draft', cwd: '/r', harness: 'fake', holdOpen: true });
  await b.engine.tick();
  signed(b.sessions, `ae/${id}/1`, 'drafted');
  await b.engine.tick();
  const v = await b.engine.view(id);
  assert.equal(v.phase, 'input-required');
  assert.equal(v.state.settled, null);
  const said = await b.engine.answer(id, 'again');
  assert.deepEqual(Object.keys(said), ['at', 'text'], 'no budget given, none journalled');
  assert.deepEqual((await b.engine.view(id)).state.inputs, [said]);
  await b.engine.tick();
  assert.equal((await b.engine.view(id)).phase, 'running (working)');
  signed(b.sessions, `ae/${id}/2`, 'again');
  await b.engine.tick();
  assert.equal((await b.engine.view(id)).phase, 'input-required');
  await b.engine.stop(id);
  await b.engine.tick();
  assert.equal((await b.engine.view(id)).phase, 'stopped');
});

test('answer refuses what is no answer: empty words, a budget that is not dollars, one its harness would not keep', async () => {
  const b = board();
  b.write('t-w', signedJournal());
  await refuses(b, 't-w', () => b.engine.answer('t-w', ''), /^answer: `text` is empty\. Give the words/);
  await refuses(b, 't-w', () => b.engine.answer('t-w', '  \n'), /^answer: `text` is empty/);
  for (const budgetUsd of [0, -1, Number.NaN, Infinity, '5' as unknown as number]) {
    await refuses(b, 't-w', () => b.engine.answer('t-w', 'go', { budgetUsd }), /^answer: `budgetUsd: .*` is not an amount of dollars\. Give dollars above 0/);
  }
  const bg = board({ bg: 'claude-bg' });
  bg.write('t-bg', signedJournal(), { harness: 'bg' });
  await refuses(bg, 't-bg', () => bg.engine.answer('t-bg', 'go', { budgetUsd: 1 }), /^answer: `budgetUsd: 1` is a spend cap, and a `claude --bg` session does not keep one/);
});

test('answer and close refuse a task that is not waiting for one, each saying what to do', async () => {
  const b = board();
  const cases: Array<[string, Event[], Partial<Extract<Event, { kind: 'filed' }>>, RegExp, RegExp]> = [
    ['t-plain', signedJournal(), { holdOpen: undefined }, /was not filed to be held open.*File it with `holdOpen: true` to answer it/, /to close it/],
    ['t-new', [], {}, /has not started an attempt yet/, /has not started an attempt yet/],
    ['t-running', signedJournal().slice(0, 2), {}, /attempt 1 is running\. `say` tells a running session something/, /attempt 1 is running\. `stop` ends it now/],
    ['t-between', [...signedJournal().slice(0, 2), { kind: 'ended', at: new Date().toISOString(), attempt: 1, sessionId: 's-1', observed: 'failed', reason: 'harness', nativeId: 's-1' }], {},
      /attempt 1 ended `failed`, and the task is between attempts/, /between attempts/],
    ['t-answered', [...signedJournal(), { kind: 'input', at: new Date().toISOString(), text: 'go' }], {}, /has been answered already/, /has been answered already/],
    ['t-closed', [...signedJournal(), { kind: 'closed', at: new Date().toISOString() }], {}, /has been closed: the next pass settles it/, /has been closed/],
    ['t-stopping', [...signedJournal(), { kind: 'stop-requested', at: new Date().toISOString() }], {}, /has been asked to stop/, /has been asked to stop/],
    ['t-settled', [...signedJournal(), { kind: 'settled', at: new Date().toISOString(), outcome: 'succeeded', note: 'closed' }], {}, /has settled \(succeeded\)/, /has settled/],
  ];
  for (const [id, events, filed, answering, closing] of cases) {
    b.write(id, events, filed);
    await refuses(b, id, () => b.engine.answer(id, 'go'), new RegExp(`^answer: \`${id}\`.*${answering.source}`));
    await refuses(b, id, () => b.engine.close(id), new RegExp(`^close: \`${id}\`.*${closing.source}`));
  }
  await refuses(b, 't-nope', () => b.engine.answer('t-nope', 'go'), /^answer: `t-nope` is not a task on this board/);
  await refuses(b, 't-nope', () => b.engine.close('t-nope'), /^close: `t-nope` is not a task on this board/);
  // And the control: the same board takes both from a task that waits.
  b.write('t-waits', signedJournal());
  await b.engine.close('t-waits');
  assert.equal(b.tasks.get('t-waits')!.at(-1)!.kind, 'closed');
});

test('file refuses a holdOpen that is not true', async () => {
  const b = board();
  for (const holdOpen of [false, 'yes', 1]) {
    await assert.rejects(b.engine.file({ brief: 'b', cwd: '/r', harness: 'fake', holdOpen: holdOpen as true }), (e: Error & { exitCode?: number }) => {
      assert.equal(e.exitCode, 2);
      assert.match(e.message, /^file: `holdOpen: .*` is not a yes\. Give true/);
      return true;
    });
  }
  assert.equal(b.tasks.size, 0);
});

// ─── ae ──────────────────────────────────────────────────────────────────────

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

test('ae answer prints the line it journalled, the words being everything after the id but --budget; ae close; each refusal exits 2', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-hold-open-cli-'));
  try {
    const engine = createEngine({ root });
    const waiting = async () => {
      const id = await engine.file({ brief: 'b', cwd: root, holdOpen: true });
      await Effect.runPromise(Effect.flatMap(Journal, (j) => Effect.forEach(signedJournal(), (e) => j.append(id, e))).pipe(Effect.provide(Journal.files(root))));
      return id;
    };
    const journal = async (id: string) => Effect.runPromise(Effect.flatMap(Journal, (j) => j.read(id)).pipe(Effect.provide(Journal.files(root))));
    const run = (...args: string[]) => spawnSync(process.execPath, [ae, ...args], { env: { ...process.env, AE_ROOT: root }, encoding: 'utf8' });

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
    assert.deepEqual(last.kind === 'input' ? [last.text, last.budgetUsd] : last, ['shorter, please', 0.5]);
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
    assert.throws(() => parseBrief(brief(bad), '/r'), (e: Error & { exitCode?: number }) =>
      e.exitCode === 2 && /^brief: `holdOpen: .*` is not true or false\. Write `holdOpen: true`/.test(e.message));
  }
});

test('ae ls counts the current turn\'s attempts against maxAttempts, and names the turn', () => {
  const at = new Date().toISOString();
  const events: Event[] = [
    { kind: 'filed', at, brief: 'b', cwd: '/r', maxAttempts: 2, holdOpen: true }, ...signedJournal(),
    { kind: 'input', at, text: 'again' }, { kind: 'starting', at, attempt: 2 },
  ];
  const line = (n: number) => taskLine({ id: 't-1', state: fold('t-1', events.slice(0, n)), phase: 'x', sessionId: null });
  assert.match(line(4), / 1\/2  /, 'turn 0: every attempt');
  assert.match(line(5), / 0\/2 turn 1  /, 'answered: a turn with none yet');
  assert.match(line(6), / 1\/2 turn 1  /);
});
