/**
 * Pools by subscription, at shipped defaults — a fake `claude` and `codex` on PATH whose sessions run until the test
 * opens their gate, and a `check` as agent-workflows declares one: a command, and no pool.
 *
 * The ceiling was per harness, and `claude` and `claude-detached` both run Claude Code on one subscription, so a ceiling
 * of 2 let four Claude Code sessions run. A harness declares the pool it is counted in, its own name by default, and the
 * engine's own Claude Code harnesses are counted in one — so a caller that names no pool, as every caller does, is
 * counted right.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeDetached, codex, createEngine, type Engine, type HarnessSpec } from '../src/facade.ts';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-pool-${label}-`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A fake `claude` and `codex`, and a directory of gates. `claude agents` prints a registry, and `claude --bg --name <n>`
 * adds a session to it, working and busy. `claude -p` and `codex exec` run until a file named for their prompt is in
 * `gates` — the prompt is the task's id — so a test ends one session and leaves the rest running.
 */
const fakes = () => {
  const bin = tmp('bin');
  const gates = tmp('gates');
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
if (args[0] === '--bg') {
  const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
  process.exit(0);
}
${runUntilGate('args[args.indexOf("-p") + 1]')}
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'codex'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
${runUntilGate('args.at(-1)')}
`, { mode: 0o755 });
  return { bin, gates, open: (id: string) => fs.writeFileSync(path.join(gates, id), '') };
};

/** A `check` as agent-workflows declares one: a command that runs and exits, with no pool named. */
const checkIn = (gates: string): HarnessSpec => ({
  name: 'check',
  command: (r) => ({ cmd: 'sh', args: ['-c', 'while [ ! -e "$1" ]; do sleep 0.05; done', 'check', path.join(gates, r.brief)] }),
});

/** Run `f` with the fakes first on PATH, and Codex reading an empty config; every session let go afterwards. */
const atDefaults = async (f: (fake: ReturnType<typeof fakes>) => Promise<void>) => {
  const fake = fakes();
  const prev = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
  process.env.PATH = `${fake.bin}:${prev.PATH}`;
  process.env.CODEX_HOME = tmp('codex-home');
  try { await f(fake); } finally {
    for (const id of ['a1', 'a2', 'b1', 'b2', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3']) fake.open(id);
    process.env.PATH = prev.PATH;
    if (prev.CODEX_HOME === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prev.CODEX_HOME;
  }
};

/** Until every task's session is observed as `phase` — a detached worker registers a moment after the pass spawns it. */
const until = async (engine: Engine, ids: string[], phase: string) => {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const phases = await Promise.all(ids.map(async (id) => (await engine.view(id)).phase));
    if (phases.every((p) => p === phase)) return;
    if (Date.now() > deadline) assert.fail(`never all ${phase}: ${ids.map((id, i) => `${id} ${phases[i]}`).join(', ')}`);
    await sleep(50);
  }
};

const attempts = async (engine: Engine, id: string) => (await engine.view(id)).state.attempts.length;

test("a claude-detached session counts against claude's ceiling, and codex keeps its own — at createEngine()'s own harnesses", async () => {
  await atDefaults(async (fake) => {
    const engine = createEngine({ root: tmp('root'), maxConcurrent: 2 });
    const cwd = tmp('cwd');
    const task = (id: string, harness: string) => engine.file({ brief: id, cwd, harness, id });

    await task('a1', 'claude-detached');
    await task('a2', 'claude');
    await engine.tick();
    await until(engine, ['a1', 'a2'], 'running (working)');

    for (const [id, harness] of [['b1', 'claude'], ['b2', 'claude-detached'], ['c1', 'codex'], ['c2', 'codex'], ['c3', 'codex']]) await task(id!, harness!);
    const report = await engine.tick();
    assert.equal(await attempts(engine, 'b1'), 0, 'a claude task waits: one claude and one claude-detached session fill the pool');
    assert.equal(await attempts(engine, 'b2'), 0, 'and so does a claude-detached one');
    assert.equal(await attempts(engine, 'c1') + await attempts(engine, 'c2'), 2, 'codex is not counted in that pool');
    assert.equal(await attempts(engine, 'c3'), 0, 'and has a ceiling of its own');
    assert.deepEqual(report.running, { claude: 2, codex: 2 }, 'counted by pool');

    // The claude-detached session ends. The slot it frees is the pool's, and goes to the next task in it: a claude one.
    fake.open('a1');
    await until(engine, ['a1'], 'running (done)');
    await engine.tick();
    assert.equal((await engine.view('a1')).state.settled, 'succeeded');
    assert.equal(await attempts(engine, 'b1'), 1, 'b1 took the slot a claude-detached session freed');
    assert.equal(await attempts(engine, 'b2'), 0, 'and the pool is full again');
  });
});

test('a check keeps its own pool beside a full Claude Code one — declared as agent-workflows declares it, with no pool', async () => {
  await atDefaults(async (fake) => {
    const engine = createEngine({
      root: tmp('root'), maxConcurrent: 2,
      harnesses: { claude: 'claude-bg', codex, 'claude-detached': claudeDetached, check: checkIn(fake.gates) },
    });
    const cwd = tmp('cwd');
    const task = (id: string, harness: string) => engine.file({ brief: id, cwd, harness, id });

    await task('a1', 'claude');
    await task('a2', 'claude-detached');
    await engine.tick();
    await until(engine, ['a1', 'a2'], 'running (working)');

    for (const [id, harness] of [['b1', 'claude-detached'], ['d1', 'check'], ['d2', 'check'], ['d3', 'check']]) await task(id!, harness!);
    const report = await engine.tick();
    assert.equal(await attempts(engine, 'b1'), 0, 'the Claude Code pool is full');
    assert.equal(await attempts(engine, 'd1') + await attempts(engine, 'd2'), 2, 'a check is not counted in it');
    assert.equal(await attempts(engine, 'd3'), 0, 'and has a ceiling of its own');
    assert.deepEqual(report.running, { claude: 2, check: 2 });
  });
});
