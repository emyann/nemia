/**
 * A spend cap on the task, at shipped defaults — fake `claude`s on PATH that answer as Claude Code 2.1.272 does.
 *
 * Measured first, by hand and by `test/live.test.ts` (`AE_LIVE=1`): `claude -p --max-budget-usd 0.01` ended a session
 * that crossed its cap with exit 1 and a result whose `subtype` is `error_max_budget_usd`; a `claude --bg` session given
 * the same flag read a file 42 times, spent $0.19 and ended `done`. So `claude-detached` hands a task's budget to the
 * harness on every attempt and records the end it prints, and `createEngine().file()` refuses a budget on `claude`, which
 * would keep none. The `claude --bg` runner is still given the flag when a task reaches it with one — through the Effect
 * door, which refuses no harness's words (open issue 6).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { createEngine } from '../src/facade.ts';
import { file, tick } from '../src/engine.ts';
import { Journal } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-budget-${label}-`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

/** The arguments of every run the fake recorded, in order. */
const runsIn = (log: string) => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]);
const valueOf = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

test('claude-detached at shipped defaults: a session that stops at its budget ends its attempt failed, reason budget, with what it cost — and its task settles failed, with no attempt 2', async () => {
  const bin = tmp('bin');
  const runs = path.join(bin, 'runs.jsonl');
  // What `claude -p --output-format json` printed when a session crossed its `--max-budget-usd` (2.1.272, keys trimmed).
  const result = {
    type: 'result', subtype: 'error_max_budget_usd', is_error: true, terminal_reason: 'budget_exhausted',
    errors: ['Reached maximum budget ($0.01)'], total_cost_usd: 0.01804, duration_api_ms: 718, num_turns: 2,
    session_id: '5e551011-0000-4000-8000-00000000b0d9',
  };
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === 'agents') { process.stdout.write('[]'); process.exit(0); }
require('node:fs').appendFileSync(${JSON.stringify(runs)}, JSON.stringify(args) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(result))} + '\\n');
process.exitCode = 1;
`, { mode: 0o755 });

  await onPath(bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), harness: 'claude-detached', budgetUsd: 0.01 });
    const until = Date.now() + 20_000;
    while (!(await engine.view(id)).state.settled && Date.now() < until) {
      await engine.tick();
      await sleep(100);
    }
    for (let i = 0; i < 3; i++) await engine.tick();
    const { state } = await engine.view(id);
    assert.equal(state.settled, 'failed');
    assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
    const [a] = state.attempts;
    assert.deepEqual([a!.ended, a!.reason, a!.exitCode], ['failed', 'budget', 1], 'it ended at its cap');
    assert.deepEqual(a!.usage, { costUsd: 0.01804, apiMs: 718 }, 'with what it spent getting there');
    assert.equal(a!.nativeId, result.session_id, 'a session a new filing could continue');
    const settled = (await engine.feed(0)).entries.find((e) => e.taskId === id && e.event.kind === 'settled')?.event;
    assert.match(settled?.kind === 'settled' ? settled.note ?? '' : '', /spent its budget\. File the task again with a larger one/, 'and the task says why it settled');

    const argvs = runsIn(runs);
    assert.equal(argvs.length, 1, 'claude -p ran once');
    assert.equal(valueOf(argvs[0]!, '--max-budget-usd'), '0.01', 'with the cap');
  });
});

test('claude --bg is given --max-budget-usd on the attempt of a task that reaches it with one — through the Effect door, since file() refuses a cap a --bg session would not keep', async () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const runs = path.join(bin, 'runs.jsonl');
  fs.writeFileSync(registry, '[]');
  // A registry, as `claude agents` keeps one: `--bg` adds a session, busy, so nothing reads a transcript; `rm` removes it.
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) process.exit(1);
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  fs.appendFileSync(${JSON.stringify(runs)}, JSON.stringify(args) + '\\n');
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
  save();
}
`, { mode: 0o755 });
  const root = tmp('root');
  const layer = Layer.mergeAll(Journal.layer(Journal.filesOps(root)), Runner.claude({ root }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));

  await onPath(bin, async () => {
    await run(file({ brief: 'the prompt', cwd: tmp('cwd'), budgetUsd: 0.5 }));
    await run(tick());

    // One attempt per start: a later turn of a task held open is spawned from the record the same way (`engine.test.ts`).
    const argvs = runsIn(runs);
    assert.equal(argvs.length, 1, 'the attempt');
    for (const args of argvs) {
      assert.equal(valueOf(args, '--max-budget-usd'), '0.5', 'the cap on each');
      assert.equal(args.at(-1), 'the prompt', 'a flag that takes a value of its own, so it cannot take the prompt');
    }
  });
});
