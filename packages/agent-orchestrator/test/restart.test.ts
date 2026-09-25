/**
 * A daemon restarted onto a store the engine before thin runtime stage 4c left: filings with no `queued` key, which that engine admitted
 * itself under its own ceiling, beside two Claude Code sessions at work. The new engine reads a filing with no key as queued, so nothing
 * starts that the orchestrator has not admitted, and the orchestrator admits in the order the old engine did — momentum, filing time, id —
 * per pool, under `WF_MAX_CONCURRENT`, counting the sessions already at work.
 *
 * An admitted task starts on the engine's next pass: a store's first pass admits, and its second starts, one pass (about 4 s) later than
 * when the old engine admitted and started in one. At the shipped ceiling of 2 the two at work fill claude's pool, and the restarted
 * daemon admits no claude task until one ends (the first case); the ceiling then raised to 5 shows the order past the two (the second).
 *
 * And the other way: a store the new engine wrote, read by the engine it replaced, which knows neither the `queued` key nor the `admitted`
 * event. That engine's `fold` has no default case, so an event of a kind it does not know is passed over; the journal replayed with both
 * stripped folds to the same state, bar the two facts it never had.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { nameFor } from 'agent-runtime';
import { fold } from 'agent-runtime/effect';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-restart-');
// WF_ROOT is read as the module loads, so it is set before the import rather than after it; the ceilings on every pass.
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_RUNS;
const { engine, readRun, start, tick } = await import('../src/runner.ts');
const { rewriteRun } = await import('../src/store.ts');

// The engine's journals, one file a task, where `engine()` keeps them (`$WF_ROOT/engine`), what's left reaped by `scratch` after the file.
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
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
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
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
${runUntilGate('args.at(-1)')}
`, { mode: 0o755 });
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.CODEX_HOME = scratch('wf-restart-codex-home-');
  const rows = (list: Array<{ name: string; state: string }>) =>
    fs.writeFileSync(registry, JSON.stringify(list.map((r, i) => ({ ...r, sessionId: `0000000${i}-0000-4000-8000-000000000000`, status: r.state === 'working' ? 'busy' : 'idle', kind: 'background', startedAt: T0 }))));
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
const atWork = (id: string, s: number) => journal(id, [filed(id, s, { config: { background: true } }), { kind: 'starting', at: at(s + 1), attempt: 1 }, { kind: 'spawned', at: at(s + 2), attempt: 1 }]);
const sessionName = (id: string) => nameFor(id, 1);

/** A one-step team, and a run of it for real over a fresh repository, its step then named as the old tick filed it. */
const solo = (() => {
  const dir = scratch('wf-restart-team-');
  fs.writeFileSync(path.join(dir, 'solo.md'), '---\nretries: 1\n---\ndo it\n');
  return dir;
})();
const runNaming = (record: { taskId: string; tries?: Array<{ taskId: string; then: 'retries' }> }) => {
  const repo = scratch('wf-restart-repo-');
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: repo, stdio: 'ignore' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const run = start({ brief: 'restart', repo, workflowDir: solo, isolate: false });
  assert.ok(rewriteRun({ ...readRun(run.id), steps: { solo: record } }));
  return run.id;
};
/** An earlier try, failed: what a try's task was filed after. */
const failed = (id: string, s: number) => journal(id, [
  filed(id, s), { kind: 'starting', at: at(s + 1), attempt: 1 }, { kind: 'spawned', at: at(s + 2), attempt: 1 },
  { kind: 'ended', at: at(s + 3), attempt: 1, sessionId: `native-${id}`, observed: 'failed', reason: 'harness' },
  { kind: 'settled', at: at(s + 4), outcome: 'failed' },
]);

const e = engine();
const admission = async (id: string) => (await e.view(id)).admission;
const attempts = async (id: string) => (await e.view(id)).state.attempts.length;
const CLAUDE = ['try-b', 'try-a', 'try-c', 'orphan', 'root-new', 'root-old'];
const CODEX = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6'];

// The store the old engine left. Two Claude Code sessions at work, which it started.
atWork('w1', 0);
atWork('w2', 1);
fake.rows([{ name: sessionName('w1'), state: 'working' }, { name: sessionName('w2'), state: 'working' }]);
// Waiting claude tasks. Tries carry momentum — each filed with the old `priority: 1` — and two were filed in one millisecond, the later
// id first on disk. A run's first step carries none, and an id no run names none, whenever it was filed.
for (const [id, s] of [['try-b', 20], ['try-a', 20], ['try-c', 30]] as const) {
  failed(`${id}-was`, 2);
  pending(id, s, { priority: 1 });
  runNaming({ taskId: id, tries: [{ taskId: `${id}-was`, then: 'retries' }] });
}
pending('orphan', 5);
pending('root-new', 10);
runNaming({ taskId: 'root-new' });
pending('root-old', 15);
runNaming({ taskId: 'root-old' });
// Six codex tasks, in a pool of their own.
CODEX.forEach((id, i) => pending(id, 40 + i, { harness: 'codex' }));

test('REFUSED at shipped defaults: the two sessions at work fill claude\'s pool, so the restarted daemon admits no claude task and starts none; codex takes its own two', async () => {
  delete process.env.WF_MAX_CONCURRENT;
  await tick(e);
  for (const id of [...CLAUDE, ...CODEX]) assert.equal(await attempts(id), 0, `${id} started on the pass that admitted it`);
  assert.deepEqual(await Promise.all(CLAUDE.map(admission)), CLAUDE.map(() => 'queued'));
  assert.deepEqual(await Promise.all(CODEX.map(admission)), ['admitted', 'admitted', 'queued', 'queued', 'queued', 'queued']);
  await tick(e);
  for (const id of CLAUDE) {
    assert.equal(await admission(id), 'queued', `${id} still waits`);
    assert.equal(await attempts(id), 0);
  }
  assert.deepEqual(await Promise.all(CODEX.map(attempts)), [1, 1, 0, 0, 0, 0], 'the pass after admitting starts');
});

test('under a raised ceiling, the daemon admits in the old order — momentum, filing, id — a pass before it starts, and one more per session ended', async () => {
  process.env.WF_MAX_CONCURRENT = '5';
  // Three claude tasks beside the two at work, the tries first and the two filed at once by id; codex up to its own five, beside the two
  // at work since the first case (an admission is spent on the start it let through, so theirs reads as none).
  await tick(e);
  for (const id of CLAUDE) assert.equal(await attempts(id), 0, `${id} started on the pass that admitted it`);
  assert.deepEqual(await Promise.all(CLAUDE.map(admission)), ['admitted', 'admitted', 'admitted', 'queued', 'queued', 'queued'], 'try-a, try-b, try-c');
  assert.deepEqual(await Promise.all(CODEX.map(admission)), [undefined, undefined, 'admitted', 'admitted', 'admitted', 'queued']);

  // The second pass starts what was admitted, and admits nothing more: the pools are full.
  await tick(e);
  for (const id of ['try-a', 'try-b', 'try-c', 'x1', 'x2', 'x3', 'x4', 'x5']) assert.equal(await attempts(id), 1, `${id} started`);
  for (const id of ['orphan', 'root-new', 'root-old', 'x6']) assert.equal(await admission(id), 'queued', `${id} waits`);

  // One session ends: the next pass admits exactly one more, the earliest filing of those with none, which no run names; the pass after
  // starts it.
  fake.rows([{ name: sessionName('w1'), state: 'done' }, { name: sessionName('w2'), state: 'working' }]);
  await tick(e);
  assert.equal((await e.view('w1')).state.settled, 'succeeded');
  assert.deepEqual(await Promise.all(['orphan', 'root-new', 'root-old'].map(admission)), ['admitted', 'queued', 'queued']);
  await tick(e);
  assert.equal(await attempts('orphan'), 1);
  assert.equal(await attempts('root-new'), 0);
});

test('rolled back: the store this engine wrote, its `queued` keys and `admitted` events stripped, folds as the engine before it would', () => {
  const ids = fs.readdirSync(TASKS).map((f) => f.replace(/\.jsonl$/, ''));
  const read = (id: string) => fs.readFileSync(path.join(TASKS, `${id}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { kind: string; queued?: boolean });
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
