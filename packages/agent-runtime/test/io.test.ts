/**
 * What a pass costs, as the runtime reports it: a tick's wall time and each harness's observes (`TickReport.ms`, `.observed`), and the
 * running totals of what the runtime read and started (`Engine.io()`). Facts for the layer above to compose; nothing here decides on them.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { HarnessSpec } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner, type AsyncSighting } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A harness whose session exits 0 at once, run by the engine's detached worker. */
const quick: HarnessSpec = { name: 'quick', command: () => ({ cmd: 'true', args: [] }) };

const settledEngine = async () => {
  const root = scratch('ae-io-root-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { quick }, defaultHarness: 'quick' }));
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  const until = Date.now() + 20_000;
  while (!(await Effect.runPromise(engine.view(id))).state.settled && Date.now() < until) {
    await Effect.runPromise(engine.tick());
    await sleep(50);
  }
  assert.ok((await Effect.runPromise(engine.view(id))).state.settled, 'the task settled');
  return { root, engine, id };
};

test('a tick says what it took and what each harness listed, and a directory of run files starts no process to be read', async () => {
  const { engine } = await settledEngine();
  const report = await Effect.runPromise(engine.tick());
  assert.equal(typeof report.ms, 'number');
  assert.ok(report.ms >= 0);
  assert.deepEqual(Object.keys(report.observed), ['quick'], 'one entry per harness observed in the pass');
  const o = report.observed.quick;
  assert.ok(o.calls >= 1, 'the pass observed the harness');
  assert.equal(o.listed, o.calls, 'each observe listed the one run file there is');
  assert.equal(o.spawned, 0, 'reading run files starts nothing');
  assert.ok(o.ms >= 0 && o.ms <= report.ms + 1, 'an observe inside the pass takes no longer than the pass');
});

test('a tick counts the observes that could not read their harness (`unread`), and the attempt they could not read is left as it was', async () => {
  const sessions = new Map<string, AsyncSighting>();
  let failing = false;
  const flaky: AsyncRunner = {
    spawn: async (r) => {
      sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
    },
    observe: async () => {
      if (failing) throw new Error('registry: timed out');
      return new Map(sessions);
    },
    stop: async () => {},
    logs: async () => '',
  };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-io-root-'), harnesses: { flaky: asyncOps(flaky) }, defaultHarness: 'flaky' }),
  );
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  await Effect.runPromise(engine.tick());
  const read = await Effect.runPromise(engine.tick());
  assert.equal(read.observed.flaky.unread, 0, 'a read that answered left nothing unread');
  failing = true;
  const unread = await Effect.runPromise(engine.tick());
  assert.deepEqual(
    [unread.observed.flaky.calls, unread.observed.flaky.listed, unread.observed.flaky.unread],
    [1, 0, 1],
    'one observe, nothing listed, one unread',
  );
  assert.equal(Effect.runSync(engine.io()).observed.flaky.unread, 1, 'and the running total has it');
  failing = false;
  assert.equal((await Effect.runPromise(engine.tick())).observed.flaky.unread, 0);
  assert.equal((await Effect.runPromise(engine.view(id))).state.attempts[0].ended, null, 'the attempt still runs');
});

test("a tick counts only the observes made during it; io() counts every observe, a view's too — a view of a task not settled, on a harness that cannot find, observes", async () => {
  const { engine } = await settledEngine();
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  const first = await Effect.runPromise(engine.tick());
  const before = Effect.runSync(engine.io()).observed.quick;
  await Effect.runPromise(engine.view(id));
  const afterView = Effect.runSync(engine.io()).observed.quick;
  assert.ok(afterView.calls > before.calls, 'a view observes, and is counted');
  const second = await Effect.runPromise(engine.tick());
  assert.equal(second.observed.quick.calls, first.observed.quick.calls, "the view's observe is not charged to the next pass");
  assert.equal(
    Effect.runSync(engine.io()).observed.quick.calls,
    afterView.calls + second.observed.quick.calls,
    'the running total has both',
  );
  const until = Date.now() + 20_000;
  while (!(await Effect.runPromise(engine.view(id))).state.settled && Date.now() < until) {
    await Effect.runPromise(engine.tick());
    await sleep(50);
  }
});

test('io() counts the bytes of a journal a view reads, and the worker a pass starts', async () => {
  const root = scratch('ae-io-root-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { quick }, defaultHarness: 'quick' }));
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));

  const read0 = Effect.runSync(engine.io());
  await Effect.runPromise(engine.view(id));
  const read1 = Effect.runSync(engine.io());
  const journal = fs.statSync(path.join(root, 'tasks', `${id}.jsonl`)).size;
  assert.ok(
    read1.bytesRead - read0.bytesRead >= journal,
    `a view read the journal's ${journal} bytes (read ${read1.bytesRead - read0.bytesRead})`,
  );
  assert.ok(read1.reads > read0.reads);

  const spawn0 = Effect.runSync(engine.io()).spawned;
  await Effect.runPromise(engine.tick());
  assert.ok(Effect.runSync(engine.io()).spawned - spawn0 >= 1, 'the pass that started the attempt started its worker');
  const until = Date.now() + 20_000;
  while (!(await Effect.runPromise(engine.view(id))).state.settled && Date.now() < until) {
    await Effect.runPromise(engine.tick());
    await sleep(50);
  }
});

test("a view on an engine that never read the task reads its journal once, settled or observed: it views the fold it chose what to ask by, and a harness held in memory makes every read counted the journal's", async () => {
  const sessions = new Map<string, { sessionId: string; state: 'working' | 'done'; busy: boolean }>();
  const inMemory = {
    spawn: async (r: { name: string }) => {
      sessions.set(r.name, { sessionId: `s-${sessions.size}`, state: 'working', busy: true });
    },
    observe: async () => new Map(sessions),
    stop: async () => {},
    logs: async () => '',
  };
  const root = scratch('ae-io-root-');
  const made = () => builtEngine(Engine.layer({ root, harnesses: { inMemory: asyncOps(inMemory) }, defaultHarness: 'inMemory' }));
  const engine = made();
  const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-io-cwd-') }));
  await Effect.runPromise(engine.tick());
  await Effect.runPromise(engine.tick());
  const cold = made();
  const observed0 = Effect.runSync(cold.io()).reads;
  const working = await Effect.runPromise(cold.view(id));
  assert.equal(working.phase, 'running (working)');
  assert.equal(Effect.runSync(cold.io()).reads - observed0, 1, 'a task in flight, observed, is one read');
  for (const [name, s] of sessions) sessions.set(name, { ...s, state: 'done', busy: false });
  await Effect.runPromise(engine.tick());
  const later = made();
  const settled0 = Effect.runSync(later.io()).reads;
  assert.ok((await Effect.runPromise(later.view(id))).state.settled, 'the task settled');
  assert.equal(Effect.runSync(later.io()).reads - settled0, 1, 'a settled task, read off its record, is one read');
  const again = Effect.runSync(later.io()).reads;
  await Effect.runPromise(later.view(id));
  assert.equal(Effect.runSync(later.io()).reads - again, 0, 'and once read, a journal nothing has written to since is not read again');
});
