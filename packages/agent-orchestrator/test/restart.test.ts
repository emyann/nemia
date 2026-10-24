/**
 * A daemon restarted onto a store an engine that knew no admission left: filings with no `queued` key, which that engine admitted
 * itself under its own ceiling, beside two Claude Code sessions at work. The new engine reads a filing with no key as queued, so nothing
 * starts that it has not admitted, and it admits in the order the old engine did — the filed `priority`, filing time, id — per pool,
 * under the `WF_MAX_CONCURRENT` that `engine()` read when it was built, counting the sessions already at work.
 *
 * An admitted task starts on the engine's next pass: a store's first pass admits, and its second starts, one pass (about 4 s) later than
 * when the old engine admitted and started in one. At the shipped ceiling of 2 the two at work fill claude's pool, and the restarted
 * daemon admits no claude task until one ends (the first case); a daemon restarted again with the ceiling raised to 5, a fresh engine
 * that never saw a filing, shows the order past the two off the journals alone (the second).
 *
 * And the other way: a store the new engine wrote, read by the engine it replaced, which knows neither the `queued` key nor the `admitted`
 * event. That engine's `fold` has no default case, so an event of a kind it does not know is passed over; the journal replayed with both
 * stripped folds to the same state, bar the two facts it never had.
 *
 * The store the old engine left holds two Claude Code sessions at work, which it started, and claude tasks waiting: tries carrying
 * momentum, each filed with `priority: 1`, two of them filed in one millisecond, the later id first on disk; a run's first step
 * and an id no run names, which carry none whenever they were filed; and six codex tasks, in a pool of their own.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as the module loads; `WF_MAX_CONCURRENT` is read by `engine()`. Every
 * run a pass answers from its memo of runs at rest is judged in full as well, and a difference throws (`WF_VERIFY_REST`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { nameFor, fold } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { Effect } from 'effect';
import { testPlace } from '../place/memory/index.ts';
import { runGiven, runOver } from './placed.ts';

const ROOT = scratch('wf-restart-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { engine, startRun, tickRun, runWith: runEngine } = await import('../src/runner.ts');
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { readRun } = await import('../src/record/record.store.ts');
const { rewriteRun } = await import('../src/record/record.store.ts');

/** The engine's journals, one file a task, where `engine()` keeps them (`$WF_ROOT/engine`); `scratch` reaps what is left after the file. */
const TASKS = path.join(ROOT, 'engine', 'tasks');
const T0 = Date.parse('2026-09-25T08:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

/** A fake `claude` and `codex` on PATH: sessions that run until their gate opens, and a registry the test writes. */
const fakes = () => {
  const bin = scratch('wf-restart-bin-');
  const gates = scratch('wf-restart-gates-');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  const runUntilGate = (prompt: string) => `
const gate = require('node:path').join(${JSON.stringify(gates)}, ${prompt});
const wait = () => (fs.existsSync(gate) ? process.exit(0) : setTimeout(wait, 50));
wait();
`;
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'agents') { process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8')); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') process.exit(0);
if (args.includes('--input-format')) {
  let got = '';
  process.stdin.on('data', (c) => {
    got += c;
    const nl = got.indexOf('\\n');
    if (nl === -1) return;
    process.stdin.pause();
    const prompt = JSON.parse(got.slice(0, nl)).message.content;
    ${runUntilGate('prompt')}
  });
} else {
  const prompt = args[args.indexOf('-p') + 1];
  ${runUntilGate('prompt')}
}
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, 'codex'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
${runUntilGate('args.at(-1)')}
`,
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.CODEX_HOME = scratch('wf-restart-codex-home-');
  const rows = (list: Array<{ name: string; state: string }>) =>
    fs.writeFileSync(
      registry,
      JSON.stringify(
        list.map((r, i) => ({
          ...r,
          sessionId: `0000000${i}-0000-4000-8000-000000000000`,
          status: r.state === 'working' ? 'busy' : 'idle',
          kind: 'background',
          startedAt: T0,
        })),
      ),
    );
  return { rows };
};
const fake = fakes();

/** A journal as the old engine wrote it: its events, one a line, and no `queued` key on the filing. */
const journal = (id: string, events: object[]) => {
  fs.mkdirSync(TASKS, { recursive: true });
  fs.writeFileSync(path.join(TASKS, `${id}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
};
const cwd = scratch('wf-restart-cwd-');
const filed = (id: string, s: number, extra: object = {}) => ({ kind: 'filed', at: at(s), brief: id, cwd, harness: 'claude', ...extra });
/** Pending, as the old engine left a task it had not started: filed and nothing else. */
const pending = (id: string, s: number, extra: object = {}) => journal(id, [filed(id, s, extra)]);
/** A background session the old engine started, which the registry lists at work. */
const atWork = (id: string, s: number) =>
  journal(id, [
    filed(id, s, { config: { background: true } }),
    { kind: 'starting', at: at(s + 1), attempt: 1 },
    { kind: 'spawned', at: at(s + 2), attempt: 1 },
  ]);
const sessionName = (id: string) => nameFor(id, 1);

/** A one-step team, and a run of it for real over a fresh repository, its step then named as the old tick filed it. */
const solo = (() => {
  const dir = scratch('wf-restart-team-');
  fs.writeFileSync(path.join(dir, 'solo.md'), '---\nplace: git\nretries: 1\n---\ndo it\n');
  return dir;
})();
const runNaming = async (record: { taskId: string; tries?: Array<{ taskId: string; cause: 'retries' }> }) => {
  const repo = scratch('wf-restart-repo-');
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'restart', repo, workflowDir: solo, isolate: false }));
  assert.ok(rewriteRun({ ...readRun(run.id), steps: { solo: record } }));
  return run.id;
};
/** An earlier try, failed: what a try's task was filed after. */
const failed = (id: string, s: number) =>
  journal(id, [
    filed(id, s),
    { kind: 'starting', at: at(s + 1), attempt: 1 },
    { kind: 'spawned', at: at(s + 2), attempt: 1 },
    { kind: 'ended', at: at(s + 3), attempt: 1, sessionId: `native-${id}`, observed: 'failed', reason: 'harness' },
    { kind: 'settled', at: at(s + 4), outcome: 'failed' },
  ]);

let e = engine();
const admission = async (id: string) => (await Effect.runPromise(e.view(id))).admission;
const attempts = async (id: string) => (await Effect.runPromise(e.view(id))).state.attempts.length;
const CLAUDE = ['try-b', 'try-a', 'try-c', 'orphan', 'root-new', 'root-old'];
const CODEX = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];

atWork('w1', 0);
atWork('w2', 1);
fake.rows([
  { name: sessionName('w1'), state: 'working' },
  { name: sessionName('w2'), state: 'working' },
]);
for (const [id, s] of [
  ['try-b', 20],
  ['try-a', 20],
  ['try-c', 30],
] as const) {
  failed(`${id}-was`, 2);
  pending(id, s, { priority: 1 });
  await runNaming({ taskId: id, tries: [{ taskId: `${id}-was`, cause: 'retries' }] });
}
pending('orphan', 5);
pending('root-new', 10);
await runNaming({ taskId: 'root-new' });
pending('root-old', 15);
await runNaming({ taskId: 'root-old' });
CODEX.forEach((id, i) => pending(id, 40 + i, { harness: 'codex' }));

test("REFUSED at shipped defaults: the two sessions at work fill claude's pool, so the restarted daemon admits no claude task and starts none; codex takes its own two", async () => {
  await runWith(e, tickRun());
  for (const id of [...CLAUDE, ...CODEX]) assert.equal(await attempts(id), 0, `${id} started on the pass that admitted it`);
  assert.deepEqual(
    await Promise.all(CLAUDE.map(admission)),
    CLAUDE.map(() => 'queued'),
  );
  assert.deepEqual(await Promise.all(CODEX.map(admission)), ['admitted', 'admitted', 'queued', 'queued', 'queued', 'queued']);
  await runWith(e, tickRun());
  for (const id of CLAUDE) {
    assert.equal(await admission(id), 'queued', `${id} still waits`);
    assert.equal(await attempts(id), 0);
  }
  assert.deepEqual(await Promise.all(CODEX.map(attempts)), [1, 1, 0, 0, 0, 0], 'the pass after admitting starts');
});

test('restarted under a raised ceiling, a fresh engine admits in the old order — priority, filing, id — a pass before it starts, and one more per session ended', async () => {
  process.env.WF_MAX_CONCURRENT = '5';
  e = engine();
  await runWith(e, tickRun());
  for (const id of CLAUDE) assert.equal(await attempts(id), 0, `${id} started on the pass that admitted it`);
  assert.deepEqual(
    await Promise.all(CLAUDE.map(admission)),
    ['admitted', 'admitted', 'admitted', 'queued', 'queued', 'queued'],
    'three claude tasks beside the two at work, the tries first and the two filed at once by id: try-a, try-b, try-c',
  );
  assert.deepEqual(
    await Promise.all(CODEX.map(admission)),
    [undefined, undefined, 'admitted', 'admitted', 'admitted', 'queued'],
    'codex up to its own five, beside the two at work since the first case: an admission is spent on the start it let through, so theirs reads as none',
  );

  await runWith(e, tickRun());
  for (const id of ['try-a', 'try-b', 'try-c', 'x1', 'x2', 'x3', 'x4', 'x5'])
    assert.equal(await attempts(id), 1, `${id} started on the second pass`);
  for (const id of ['orphan', 'root-new', 'root-old', 'x6'])
    assert.equal(await admission(id), 'queued', `${id} waits: the second pass admits nothing more, the pools are full`);

  fake.rows([
    { name: sessionName('w1'), state: 'done' },
    { name: sessionName('w2'), state: 'working' },
  ]);
  await runWith(e, tickRun());
  assert.equal((await Effect.runPromise(e.view('w1'))).state.settled, 'succeeded');
  assert.deepEqual(
    await Promise.all(['orphan', 'root-new', 'root-old'].map(admission)),
    ['admitted', 'queued', 'queued'],
    'one session ended: the next pass admits exactly one more, the earliest filing of those with none, which no run names',
  );
  await runWith(e, tickRun());
  assert.equal(await attempts('orphan'), 1, 'the pass after starts it');
  assert.equal(await attempts('root-new'), 0);
});

test('rolled back: the store this engine wrote, its `queued` keys and `admitted` events stripped, folds as the engine before it would', () => {
  const ids = fs.readdirSync(TASKS).map((f) => f.replace(/\.jsonl$/, ''));
  const read = (id: string) =>
    fs
      .readFileSync(path.join(TASKS, `${id}.jsonl`), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { kind: string; queued?: boolean });
  const without = ({ queued: _, admitted: __, ...state }: ReturnType<typeof fold>) => state;
  let admitted = 0;
  for (const id of ids) {
    const events = read(id);
    admitted += events.filter((ev) => ev.kind === 'admitted').length;
    const stripped = events.filter((ev) => ev.kind !== 'admitted').map(({ queued: _, ...ev }) => ev);
    assert.deepEqual(without(fold(id, stripped as never)), without(fold(id, events as never)), id);
  }
  assert.ok(admitted >= 9, `the store carries the admissions it made (${admitted})`);
});
