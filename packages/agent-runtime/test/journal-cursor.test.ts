/**
 * What an engine's pass reads of a store of tasks not settled, on the files store and through the meter (`Engine.io()`): the files
 * store keeps where it got to in each journal (`journalReader` in `core/engine/journal.ts`), so once a pass has read a journal, the
 * passes after it read only what was appended to it since.
 *
 * The harness is a `AsyncRunner` that starts every session and sees each working, and reads no file of its own: the only bytes a
 * pass reads are the journals' and the feed's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { Engine, Journal } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner, type AsyncSighting } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

const N = 12;

/** An engine over a fresh store of `N` tasks at work, past the passes that started them and saw them working. */
const workingStore = async () => {
  const root = scratch('ae-cursor-root-');
  const cwd = scratch('ae-cursor-cwd-');
  const sessions = new Map<string, AsyncSighting>();
  const working: AsyncRunner = {
    spawn: async (r) => {
      sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
    },
    observe: async () => new Map(sessions),
    stop: async () => {},
    logs: async () => '',
  };
  const engine = builtEngine(Engine.layer({ root, harnesses: { working: asyncOps(working) }, defaultHarness: 'working' }));
  const ids: string[] = [];
  for (let i = 0; i < N; i++) ids.push(await Effect.runPromise(engine.file({ brief: `task ${i}`, cwd })));
  const feed = path.join(root, 'feed.jsonl');
  let size = -1;
  while (size !== fs.statSync(feed).size) {
    size = fs.statSync(feed).size;
    await Effect.runPromise(engine.tick());
  }
  const report = await Effect.runPromise(engine.tick());
  assert.equal(report.views.length, N, 'every task is at work, none settled');
  return { root, engine, ids, feed };
};

const sizeOf = (file: string) => fs.statSync(file).size;

test('a pass over tasks at work whose journals nothing has written to reads no byte', async () => {
  const { engine } = await workingStore();
  const before = Effect.runSync(engine.io());
  const report = await Effect.runPromise(engine.tick());
  const after = Effect.runSync(engine.io());
  assert.equal(report.views.length, N, 'every task is still judged');
  assert.equal(after.bytesRead - before.bytesRead, 0, 'no byte read');
  assert.equal(after.reads - before.reads, 0, 'no read made');
});

test("a pass after another writer appends one event to one task's journal reads that line and the feed's growth, and nothing else", async () => {
  const { root, engine, ids, feed } = await workingStore();
  const journal = path.join(root, 'tasks', `${ids[4]}.jsonl`);
  const [feed0, journal0] = [sizeOf(feed), sizeOf(journal)];
  const at = new Date().toISOString();
  await Effect.runPromise(Journal.filesOps(root).append(ids[4], { kind: 'input', at, attempt: 1, text: 'more' } as never));
  const [grown, appended] = [sizeOf(feed) - feed0, sizeOf(journal) - journal0];
  assert.ok(grown > 0 && appended > 0, 'the event was written to the journal and the feed');

  const before = Effect.runSync(engine.io());
  await Effect.runPromise(engine.tick());
  const read = Effect.runSync(engine.io()).bytesRead - before.bytesRead;
  const wrote = sizeOf(feed) - feed0 - grown;
  assert.equal(wrote, 0, 'the pass wrote nothing of its own');
  assert.equal(read, grown + appended, `read ${read}; the feed grew ${grown} and the journal ${appended}`);
});

test('a view of a task at work whose journal nothing has written to reads no byte', async () => {
  const { engine, ids } = await workingStore();
  const before = Effect.runSync(engine.io());
  const view = await Effect.runPromise(engine.view(ids[0]));
  assert.ok(!view.state.settled, 'the task is at work');
  assert.equal(Effect.runSync(engine.io()).bytesRead - before.bytesRead, 0);
});
