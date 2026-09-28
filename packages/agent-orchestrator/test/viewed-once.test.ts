/**
 * `viewedOnce` (views.ts): the engine `wf ls` and `wf decide` read, whose `view` of a task is read once for the whole command. A verb that
 * changes a task drops what was read of that task, a pass or a verb it does not know drops everything, and a view that failed is asked again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Engine, TaskView } from 'agent-runtime';
import { viewedOnce } from '../src/views.ts';

/** An engine that counts the views asked of it, and fails a view of `bad` the first time. */
const counting = () => {
  const asked = new Map<string, number>();
  let failOnce = true;
  const engine = {
    async view(id: string) {
      asked.set(id, (asked.get(id) ?? 0) + 1);
      if (id === 'bad' && failOnce) {
        failOnce = false;
        throw new Error('no journal');
      }
      return { id, phase: 'done' } as unknown as TaskView;
    },
    async list() {
      return { views: [], unreadable: [] };
    },
    async io() {
      return {};
    },
    async answer() {},
    async stop() {},
    async tick() {
      return {};
    },
    async rename() {},
  };
  return { e: viewedOnce(engine as unknown as Engine), asked };
};

test('a task is viewed once for a command, however many times the command reads it', async () => {
  const { e, asked } = counting();
  await Promise.all([e.view('a'), e.view('a'), e.view('b')]);
  await e.view('a');
  await e.list();
  await e.view('a');
  assert.deepEqual(Object.fromEntries(asked), { a: 1, b: 1 });
});

test('a verb that changes a task drops its view alone; a pass, and a verb the memo does not know, drop every view', async () => {
  const { e, asked } = counting();
  await e.view('a');
  await e.view('b');
  await e.answer('a', 'go on');
  await e.view('a');
  await e.view('b');
  assert.deepEqual(Object.fromEntries(asked), { a: 2, b: 1 }, 'answer names a');
  await e.tick();
  await e.view('a');
  await e.view('b');
  assert.deepEqual(Object.fromEntries(asked), { a: 3, b: 2 }, 'a pass moves every task');
  await (e as unknown as { rename(): Promise<void> }).rename();
  await e.view('b');
  assert.deepEqual(Object.fromEntries(asked), { a: 3, b: 3 }, 'an unknown verb');
});

test('a view that failed is not kept: the next read asks the engine again', async () => {
  const { e, asked } = counting();
  await assert.rejects(e.view('bad'), /no journal/);
  assert.equal((await e.view('bad')).id, 'bad');
  await e.view('bad');
  assert.equal(asked.get('bad'), 2);
});
