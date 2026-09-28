/**
 * What an engine's pass reads of a store of settled tasks, on the files store and through the meter (`Engine.io()`): once
 * a pass has folded a settled task, the passes after it read only the feed's new bytes and the journals the feed names,
 * until the engine is made again (`tick-memo.ts`). Before 2026-09-25 every pass read every journal, twice.
 *
 * The harness is a `PromiseRunner` that lists nothing and refuses every spawn, so each task settles on its first pass and
 * the only bytes a pass reads are the journal's: a detached harness would read its run files through the same meter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createEngine, type PromiseRunner } from '../src/facade.ts';
import { scratch } from './scratch.ts';

const refusing: PromiseRunner = {
  spawn: async () => {
    throw Object.assign(new Error('not today'), { refused: true });
  },
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

const N = 40;

/** A store of `N` tasks that settled on the first pass, and an engine that has since folded each once more. */
const settledStore = async () => {
  const root = scratch('ae-memo-root-');
  const cwd = scratch('ae-memo-cwd-');
  const engine = createEngine({ root, harnesses: { refusing } });
  const ids: string[] = [];
  for (let i = 0; i < N; i++) ids.push(await engine.file({ brief: `task ${i}`, cwd }));
  const first = await engine.tick();
  assert.equal(first.views.length, 0, 'every task settled on the first pass');
  // The pass after the settling folds each again: the feed names each settling.
  await engine.tick();
  return { root, cwd, engine, ids };
};

const sizeOf = (file: string) => fs.statSync(file).size;
const journalsOf = (root: string) =>
  fs.readdirSync(path.join(root, 'tasks')).reduce((sum, f) => sum + sizeOf(path.join(root, 'tasks', f)), 0);

test('a pass over settled tasks nothing has written to reads no journal, and nothing of a feed with nothing new', async () => {
  const { engine } = await settledStore();
  const before = engine.io();
  const report = await engine.tick();
  const after = engine.io();
  assert.equal(report.tasks, N, 'every task is still counted');
  assert.deepEqual(report.refused, [], 'and no skipped task is refused');
  assert.equal(after.bytesRead - before.bytesRead, 0, 'no byte read');
  assert.equal(after.reads - before.reads, 0, 'no read made');
});

test("a pass after an entry is appended to one settled task reads the feed's new bytes and that one journal, and the pass after it nothing", async () => {
  const { root, engine, ids } = await settledStore();
  const feed = path.join(root, 'feed.jsonl');
  const feed0 = sizeOf(feed);
  await engine.stop(ids[7]!);
  const grown = sizeOf(feed) - feed0;
  assert.ok(grown > 0, 'the stop was written to the feed');
  const journal = sizeOf(path.join(root, 'tasks', `${ids[7]}.jsonl`));

  const before = engine.io();
  await engine.tick();
  const after = engine.io();
  // The feed's new bytes, then the one journal named: folded, and read again by its step, whose decision is nothing.
  assert.equal(
    after.bytesRead - before.bytesRead,
    grown + 2 * journal,
    `read ${after.bytesRead - before.bytesRead}; the feed grew ${grown} and the journal is ${journal}`,
  );
  assert.equal(after.reads - before.reads, 3);

  const again = engine.io();
  await engine.tick();
  assert.equal(engine.io().bytesRead - again.bytesRead, 0, 'folded, it is skipped again');
});

test("a task filed again under a settled task's id is folded again on the next pass", async () => {
  const { root, cwd, engine, ids } = await settledStore();
  await engine.file({ id: ids[3]!, brief: 'again', cwd });
  const before = engine.io();
  await engine.tick();
  const journal = sizeOf(path.join(root, 'tasks', `${ids[3]}.jsonl`));
  assert.ok(engine.io().bytesRead - before.bytesRead >= 2 * journal, 'its journal was read');
});

test('a fresh engine on the same store folds every task on its first pass, and reads the whole feed once to learn where it ends', async () => {
  const { root } = await settledStore();
  const engine = createEngine({ root, harnesses: { refusing } });
  const before = engine.io();
  await engine.tick();
  const first = engine.io().bytesRead - before.bytesRead;
  const journals = journalsOf(root);
  const feed = sizeOf(path.join(root, 'feed.jsonl'));
  assert.equal(first, feed + 2 * journals, `read ${first}: the feed's ${feed} bytes, and each journal twice (${journals} bytes)`);
  // Every task was settled before this engine was made, so its first pass wrote nothing for the feed to name.
  const second = engine.io();
  await engine.tick();
  assert.equal(engine.io().bytesRead - second.bytesRead, 0, 'its second pass reads nothing');
});
