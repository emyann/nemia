/**
 * `viewedOnce` (views.verb.ts): the engine `nemia ls` and `nemia decide` read, whose `view` of a task is read once for the whole command. A
 * verb that changes a task drops what was read of that task, a pass or a verb it does not know drops everything, and a view that failed is
 * asked again.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskView } from 'agent-runtime';
import { promised } from '../../test/promised.ts';
import { viewedOnce } from './views.verb.ts';
import { Effect } from 'effect';

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
      return { id, phase: 'succeeded' } as unknown as TaskView;
    },
    async list() {
      return { views: [], unreadable: [] };
    },
    async io() {
      return {};
    },
    async path() {
      return [];
    },
    async output() {
      return 'ok 1\n';
    },
    async answer() {},
    async admit() {},
    async stop() {},
    async tick() {
      return {};
    },
    async rename() {},
  };
  return { e: viewedOnce(promised(engine)), asked };
};

test('a task is viewed once for a command, however many times the command reads it', async () => {
  const { e, asked } = counting();
  await Promise.all(['a', 'a', 'b'].map((id) => Effect.runPromise(e.view(id))));
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.list());
  await Effect.runPromise(e.path('a'));
  await Effect.runPromise(e.output('a', 'stderr'));
  await Effect.runPromise(e.view('a'));
  assert.deepEqual(Object.fromEntries(asked), { a: 1, b: 1 }, 'a list, a path and a stream read, and change nothing');
});

test('a verb that changes a task drops its view alone; a pass, and a verb the memo does not know, drop every view', async () => {
  const { e, asked } = counting();
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  await Effect.runPromise(e.answer('a', 'go on'));
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  assert.deepEqual(Object.fromEntries(asked), { a: 2, b: 1 }, 'answer names a');
  await Effect.runPromise(e.tick());
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  assert.deepEqual(Object.fromEntries(asked), { a: 3, b: 2 }, 'a pass moves every task');
  await Effect.runPromise((e as unknown as { rename(): Effect.Effect<void> }).rename());
  await Effect.runPromise(e.view('b'));
  assert.deepEqual(Object.fromEntries(asked), { a: 3, b: 3 }, 'an unknown verb');
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.admit(['a']));
  await Effect.runPromise(e.view('a'));
  await Effect.runPromise(e.view('b'));
  assert.deepEqual(Object.fromEntries(asked), { a: 5, b: 3 }, 'an admission names the tasks it admits');
  await Effect.runPromise((e as unknown as { admit(ids: unknown): Effect.Effect<void> }).admit('a'));
  await Effect.runPromise(e.view('a'));
  assert.deepEqual(Object.fromEntries(asked), { a: 5, b: 3 }, 'an admission given no list, as a caller past the types may, names no task');
});

test('a view that failed is not kept: the next read asks the engine again', async () => {
  const { e, asked } = counting();
  await assert.rejects(Effect.runPromise(e.view('bad')), /no journal/);
  assert.equal((await Effect.runPromise(e.view('bad'))).id, 'bad');
  await Effect.runPromise(e.view('bad'));
  assert.equal(asked.get('bad'), 2);
});
