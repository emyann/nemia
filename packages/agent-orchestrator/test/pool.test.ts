/**
 * Pools by subscription, at shipped defaults, through the orchestrator's admission (thin runtime stage 4c): the client's `engine()`, which
 * files every task `queued`, and `tick()`, which admits off the runtime's report. `WF_MAX_CONCURRENT` is unset, so the ceiling is 2.
 *
 * A fake `claude` and `codex` first on PATH run until the test opens their gate — a file named for the task's id, which is its brief — and
 * `claude agents` prints a registry and counts itself. The tasks are filed straight through the client, with no run record, so `advance`
 * views none of them: every `claude agents` call a pass makes is the runtime's observe, or admission's.
 *
 * These are the runtime's own `pool.test.ts` cases, moved with the rule. An admitted task starts on the runtime's next pass, so a freed
 * slot is taken one pass later than when the runtime admitted: each case ticks once to admit and once to start.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from 'agent-runtime';
import { checkBrief } from '../src/check.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-pool-');
// WF_ROOT is read as the module loads, so it is set before the import rather than after it; the ceiling on every pass.
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
const { engine, tick } = await import('../src/runner.ts');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The fakes, their gates, and the count of `claude agents` calls. */
const fakes = () => {
  const bin = scratch('wf-pool-bin-');
  const gates = scratch('wf-pool-gates-');
  const registry = path.join(bin, 'registry.json');
  const counter = path.join(bin, 'agents-calls');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(counter, '');
  const runUntilGate = (prompt: string) => `
const gate = require('node:path').join(${JSON.stringify(gates)}, ${prompt});
const wait = () => (fs.existsSync(gate) ? process.exit(0) : setTimeout(wait, 50));
wait();
`;
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'agents') {
  fs.appendFileSync(${JSON.stringify(counter)}, 'agents\\n');
  process.stdout.write(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
  process.exit(0);
}
// A job reads its brief as the first line on its stdin; \`claude-detached\` takes it as \`-p\`'s value.
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
  process.env.CODEX_HOME = scratch('wf-pool-codex-home-');
  return {
    gates,
    open: (id: string) => fs.writeFileSync(path.join(gates, id), ''),
    agentsCalls: () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean).length,
  };
};

const fake = fakes();
const e = engine();
const cwd = scratch('wf-pool-cwd-');

/** A task filed as the tick files one, through the client: its brief is its id, the gate that ends it. */
const file = (id: string, harness: string) =>
  e.file({ id, cwd, harness, brief: harness === 'check' ? checkBrief(`while [ ! -e ${JSON.stringify(path.join(fake.gates, id))} ]; do sleep 0.05; done`, { WF_RUN: 'r', WF_STEP: id }) : id });

const attempts = async (id: string) => (await e.view(id)).state.attempts.length;

/** Until every task is `phase` — a detached worker publishes a moment after the pass spawns it. */
const until = async (ids: string[], phase: string) => {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const phases = await Promise.all(ids.map(async (id) => (await e.view(id)).phase));
    if (phases.every((p) => p === phase)) return;
    if (Date.now() > deadline) assert.fail(`never all ${phase}: ${ids.map((id, i) => `${id} ${phases[i]}`).join(', ')}`);
    await sleep(50);
  }
};

/** Every task on the board stopped and settled, so the next case starts on an empty pool. */
const drain = async () => {
  for (const v of await e.list()) if (!v.state.settled) await e.stop(v.id);
  const deadline = Date.now() + 15_000;
  while ((await e.list()).some((v) => !v.state.settled)) {
    assert.ok(Date.now() < deadline, 'the board drains');
    await e.tick();
    await sleep(50);
  }
};

test("REFUSED at shipped defaults: a claude-detached session counts against claude's ceiling, the third claude task waits, and codex keeps its own", async () => {
  try {
    await file('a1', 'claude-detached');
    await file('a2', 'claude');
    await tick(e);
    assert.equal(await attempts('a1') + await attempts('a2'), 0, 'admitted on this pass, started on the next');
    assert.deepEqual([(await e.view('a1')).admission, (await e.view('a2')).admission], ['admitted', 'admitted']);
    await tick(e);
    await until(['a1', 'a2'], 'running (working)');

    for (const [id, harness] of [['b1', 'claude'], ['b2', 'claude-detached'], ['c1', 'codex'], ['c2', 'codex'], ['c3', 'codex']]) await file(id!, harness!);
    await tick(e);
    await tick(e);
    assert.equal(await attempts('b1'), 0, 'a claude task waits: one claude and one claude-detached session fill the pool');
    assert.equal(await attempts('b2'), 0, 'and so does a claude-detached one');
    assert.equal((await e.view('b1')).admission, 'queued');
    assert.equal(await attempts('c1') + await attempts('c2'), 2, 'codex is not counted in that pool');
    assert.equal(await attempts('c3'), 0, 'and has a ceiling of its own');

    // The claude-detached session ends. The slot it frees is the pool's, and goes to the next task in it: b1, filed first.
    fake.open('a1');
    await until(['a1'], 'running (done)');
    await tick(e);
    assert.equal((await e.view('a1')).state.settled, 'succeeded');
    assert.equal((await e.view('b1')).admission, 'admitted', 'b1 is admitted into the slot a claude-detached session freed');
    assert.equal(await attempts('b1'), 0, 'and starts a pass later');
    await tick(e);
    assert.equal(await attempts('b1'), 1, 'b1 took the slot');
    assert.equal(await attempts('b2'), 0, 'and the pool is full again');
    assert.equal((await e.view('b2')).admission, 'queued');
  } finally {
    await drain();
  }
});

test('REFUSED at shipped defaults: a check keeps its own pool beside a full Claude Code one, and a third check waits', async () => {
  try {
    await file('p1', 'claude');
    await file('p2', 'claude-detached');
    await tick(e);
    await tick(e);
    await until(['p1', 'p2'], 'running (working)');

    for (const [id, harness] of [['q1', 'claude-detached'], ['d1', 'check'], ['d2', 'check'], ['d3', 'check']]) await file(id!, harness!);
    await tick(e);
    await tick(e);
    assert.equal(await attempts('q1'), 0, 'the Claude Code pool is full');
    assert.equal(await attempts('d1') + await attempts('d2'), 2, 'a check is not counted in it');
    assert.equal(await attempts('d3'), 0, 'and has a ceiling of its own');
  } finally {
    await drain();
  }
});

test('one pass — the runtime\'s tick, admission and admit — asks `claude agents` once, with claude tasks at work and waiting', async () => {
  try {
    for (const id of ['s1', 's2', 's3', 's4']) await file(id, 'claude');
    await tick(e);
    await tick(e);
    await until(['s1', 's2'], 'running (working)');
    assert.equal((await e.view('s3')).admission, 'queued');

    // Admission here reads the views the runtime's pass built; a read of `e.list()` or `e.view` for it would ask the harness again.
    const before = fake.agentsCalls();
    await tick(e);
    assert.equal(fake.agentsCalls() - before, 1, 'one observe for the whole pass');
    assert.equal(await attempts('s3'), 0, 'and s3 still waits');
  } finally {
    await drain();
  }
});
