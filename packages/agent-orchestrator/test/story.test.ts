/**
 * The story helper (`test/story.ts`): checkpoints run in order and share their state, and once one fails every later one is filed
 * skipped, naming it. Told over a fake runner that records what it was given, so a failing checkpoint fails nothing here.
 */
import { afterAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { story, type Teller } from './story.ts';

/** What the fake runner was given: each checkpoint's name, and its skip note or whether its body ran and threw. */
type Filed = { name: string; skip?: string; threw?: unknown };

/** The context the fake runner hands a body: it records a skip on the checkpoint's entry. */
type Sub = { skip: (note?: string) => void; entry: Filed };

/**
 * A runner that runs each body in turn, as Vitest runs a describe's tests, and records it; a throw is kept, as the runner keeps a
 * test's failure. `done` is when every body filed so far has run.
 */
const recorder = (): { t: Teller<Sub>; filed: Filed[]; done: () => Promise<void> } => {
  const filed: Filed[] = [];
  let chain = Promise.resolve();
  const t: Teller<Sub> = (name, how) => {
    const entry: Filed = { name };
    filed.push(entry);
    chain = chain.then(async () => {
      try {
        await how({ skip: (note) => void (entry.skip = note), entry });
      } catch (error) {
        entry.threw = error;
      }
    });
  };
  return { t, filed, done: () => chain };
};

test('checkpoints run in order, each named as filed, and share the state the story built', async () => {
  const { t, filed, done } = recorder();
  const s = story(t);
  const seen: string[] = [];
  let shared = 0;
  s.test('first', (sub) => {
    assert.equal(sub.entry, filed[0], "a body is handed its test's own context");
    shared += 1;
    seen.push('first');
  });
  s.test('second', () => {
    shared += 1;
    seen.push('second');
  });
  await done();
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(shared, 2);
  assert.deepEqual(filed.map((f) => f.name), ["first", "second"]);
  assert.ok(filed.every((f) => f.skip === undefined && f.threw === undefined));
  assert.equal(s.failed(), undefined);
});

test('REFUSED: after a checkpoint fails, the next is filed skipped with its name, its body never runs, and the error surfaces', async () => {
  const { t, filed, done } = recorder();
  const s = story(t);
  const broke = new Error('the gate did not hold');
  let thirdRan = false;
  s.test('first', () => {});
  s.test('second', () => {
    throw broke;
  });
  s.test('third', () => {
    thirdRan = true;
  });
  await done();
  assert.equal(thirdRan, false, 'a checkpoint after a failure never runs');
  assert.equal(filed[1]?.threw, broke, "the failing checkpoint's own error is what its test fails with");
  assert.equal(filed[2]?.name, 'third');
  assert.ok(filed[2]?.skip?.includes('second'), 'the skip names the checkpoint that failed');
  assert.equal(s.failed(), 'second');
});

describe("a story told on Vitest's own test files its checkpoints as the describe's tests", () => {
  const s = story(test);
  let n = 0;
  s.test('one', () => {
    n += 1;
  });
  s.test('two', () => {
    n += 1;
  });
  afterAll(() => {
    assert.equal(n, 2);
  });
});
