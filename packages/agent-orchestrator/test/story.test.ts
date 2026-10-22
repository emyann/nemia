/**
 * The story helper (`test/story.ts`): checkpoints run in order and share their state, and once one fails every later one is filed
 * skipped, naming it. Told over a fake context that records what it was given, so a failing checkpoint fails nothing here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { story, type Teller } from './story.ts';

/** What the fake context was given: each checkpoint's name, and its skip reason or whether its body ran and threw. */
type Filed = { name: string; skip?: string; threw?: unknown };

/** A context that runs each body at once, as node does, and records it; a throw is kept, as node keeps a subtest's failure. */
const recorder = (): { t: Teller<'sub'>; filed: Filed[] } => {
  const filed: Filed[] = [];
  const t = {
    async test(name: string, how: ((sub: 'sub') => void | Promise<void>) | { skip: string }) {
      if (typeof how !== 'function') {
        filed.push({ name, skip: how.skip });
        return;
      }
      const entry: Filed = { name };
      filed.push(entry);
      try {
        await how('sub');
      } catch (error) {
        entry.threw = error;
      }
    },
  } as Teller<'sub'>;
  return { t, filed };
};

test('checkpoints run in order, each named as filed, and share the state the story built', async () => {
  const { t, filed } = recorder();
  const s = story(t);
  const seen: string[] = [];
  let shared = 0;
  await s.test('first', (sub) => {
    assert.equal(sub, 'sub', "a body is handed the subtest's own context");
    shared += 1;
    seen.push('first');
  });
  await s.test('second', () => {
    shared += 1;
    seen.push('second');
  });
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(shared, 2);
  assert.deepEqual(filed, [{ name: 'first' }, { name: 'second' }]);
  assert.equal(s.failed(), undefined);
});

test('REFUSED: after a checkpoint fails, the next is filed skipped with its name, its body never runs, and the error surfaces', async () => {
  const { t, filed } = recorder();
  const s = story(t);
  const broke = new Error('the gate did not hold');
  let thirdRan = false;
  await s.test('first', () => {});
  await s.test('second', () => {
    throw broke;
  });
  await s.test('third', () => {
    thirdRan = true;
  });
  assert.equal(thirdRan, false, 'a checkpoint after a failure never runs');
  assert.equal(filed[1]?.threw, broke, "the failing checkpoint's own error is what its subtest fails with");
  assert.equal(filed[2]?.name, 'third');
  assert.ok(filed[2]?.skip?.includes('second'), 'the skip names the checkpoint that failed');
  assert.equal(s.failed(), 'second');
});

test("a story told on node's own context files its checkpoints as subtests", async (t) => {
  const s = story(t);
  let n = 0;
  await s.test('one', () => {
    n += 1;
  });
  await s.test('two', () => {
    n += 1;
  });
  assert.equal(n, 2);
});
