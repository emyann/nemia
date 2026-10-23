/**
 * What an engine's pass reads of a store of settled tasks, on the files store and through the meter (`Engine.io()`): once
 * a pass has folded a settled task, the passes after it read only the feed's new bytes and what was appended to the journals the
 * feed names, until the engine is made again (`core/engine/memo.ts`): the files store reads a journal's bytes once per engine
 * (`journalReader` in `core/engine/journal.ts`).
 *
 * The harness is a `AsyncRunner` that lists nothing and refuses every spawn, so each task settles on its first pass and
 * the only bytes a pass reads are the journal's: a detached harness would read its run files through the same meter.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { story } from './checkpoints.ts';

const refusing: AsyncRunner = {
  spawn: async () => {
    throw Object.assign(new Error('not today'), { refused: true });
  },
  observe: async () => new Map(),
  stop: async () => {},
  logs: async () => '',
};

const N = 40;

/**
 * A store of `N` tasks that settled on the first pass, and an engine whose second pass has folded each once more: the feed names each
 * settling.
 */
const settledStore = async () => {
  const root = scratch('ae-memo-root-');
  const cwd = scratch('ae-memo-cwd-');
  const engine = builtEngine(Engine.layer({ root, harnesses: { refusing: asyncOps(refusing) } }));
  const ids: string[] = [];
  for (let i = 0; i < N; i++) ids.push(await Effect.runPromise(engine.file({ brief: `task ${i}`, cwd })));
  const first = await Effect.runPromise(engine.tick());
  assert.equal(first.views.length, 0, 'every task settled on the first pass');
  await Effect.runPromise(engine.tick());
  return { root, cwd, engine, ids };
};

const sizeOf = (file: string) => fs.statSync(file).size;
const journalsOf = (root: string) =>
  fs.readdirSync(path.join(root, 'tasks')).reduce((sum, f) => sum + sizeOf(path.join(root, 'tasks', f)), 0);

test("a quiet board costs nothing per pass, and one append costs its own bytes: the feed's new ones and what was appended to the one journal it names", async (t) => {
  const s = story(t);
  const { root, cwd, engine, ids } = await settledStore();

  await s.test('a pass over settled tasks nothing has written to reads no journal, and nothing of a feed with nothing new', async () => {
    const before = Effect.runSync(engine.io());
    const report = await Effect.runPromise(engine.tick());
    const after = Effect.runSync(engine.io());
    assert.equal(report.tasks, N, 'every task is still counted');
    assert.deepEqual(report.refused, [], 'and no skipped task is refused');
    assert.equal(after.bytesRead - before.bytesRead, 0, 'no byte read');
    assert.equal(after.reads - before.reads, 0, 'no read made');
  });

  await s.test(
    "a task filed again under a settled task's id: the next pass reads the feed's new bytes and what was appended to that one journal, once each",
    async () => {
      const feed = path.join(root, 'feed.jsonl');
      const feed0 = sizeOf(feed);
      const journalFile = path.join(root, 'tasks', `${ids[7]}.jsonl`);
      const journal0 = sizeOf(journalFile);
      await Effect.runPromise(engine.file({ brief: 'task 7, filed again under its id', cwd, id: ids[7] }));
      const grown = sizeOf(feed) - feed0;
      assert.ok(grown > 0, 'the filing was written to the feed');
      const appended = sizeOf(journalFile) - journal0;
      assert.ok(appended > 0, 'the filing was written to the journal');

      const before = Effect.runSync(engine.io());
      await Effect.runPromise(engine.tick());
      const after = Effect.runSync(engine.io());
      assert.equal(
        after.bytesRead - before.bytesRead,
        grown + appended,
        `read ${after.bytesRead - before.bytesRead}; the feed grew ${grown} and the journal ${appended}`,
      );
      assert.equal(after.reads - before.reads, 2, "the feed's new bytes, then what was appended to the one journal it names, once");
    },
  );

  await s.test('the pass after it reads nothing: folded, the task is skipped again', async () => {
    const again = Effect.runSync(engine.io());
    await Effect.runPromise(engine.tick());
    assert.equal(Effect.runSync(engine.io()).bytesRead - again.bytesRead, 0, 'folded, it is skipped again');
  });
});

test('a fresh engine on a settled store: what its first passes read, with a feed beside the journals and with none', async (t) => {
  await t.test(
    'a fresh engine on the same store folds every task on its first pass, and reads none of the feed: its memo has nothing to forget',
    async () => {
      const { root } = await settledStore();
      const engine = builtEngine(Engine.layer({ root, harnesses: { refusing: asyncOps(refusing) } }));
      const before = Effect.runSync(engine.io());
      await Effect.runPromise(engine.tick());
      const first = Effect.runSync(engine.io()).bytesRead - before.bytesRead;
      const journals = journalsOf(root);
      assert.ok(sizeOf(path.join(root, 'feed.jsonl')) > 0, 'the feed names every filing and settling');
      assert.equal(first, journals, `read ${first}: each journal once (${journals} bytes), and no byte of the feed`);
      const second = Effect.runSync(engine.io());
      await Effect.runPromise(engine.tick());
      assert.equal(
        Effect.runSync(engine.io()).bytesRead - second.bytesRead,
        0,
        'its second pass reads nothing: every task settled before this engine was made, so its first pass wrote nothing for the feed to name',
      );
    },
  );

  await t.test(
    'a fresh engine on a store whose journals have no feed beside them reads the feed from its start once one is written: a settled task filed again is folded again',
    async () => {
      const { root, cwd, ids } = await settledStore();
      fs.rmSync(path.join(root, 'feed.jsonl'));
      const engine = builtEngine(Engine.layer({ root, harnesses: { refusing: asyncOps(refusing) } }));
      await Effect.runPromise(engine.tick());
      assert.equal(fs.existsSync(path.join(root, 'feed.jsonl')), false, 'its first pass folded every task and wrote no feed');
      const journal = path.join(root, 'tasks', `${ids[5]}.jsonl`);
      const journal0 = sizeOf(journal);
      await Effect.runPromise(engine.file({ id: ids[5], brief: 'again', cwd }));
      const appended = sizeOf(journal) - journal0;
      const before = Effect.runSync(engine.io());
      await Effect.runPromise(engine.tick());
      const read = Effect.runSync(engine.io()).bytesRead - before.bytesRead;
      assert.equal(
        read,
        sizeOf(path.join(root, 'feed.jsonl')) + appended,
        `read ${read}: the feed written since, from its start, and what was appended to the one journal it names`,
      );
    },
  );
});
