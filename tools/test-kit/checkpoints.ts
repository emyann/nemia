/**
 * A story told as one describe: a person's walk, its checkpoints named tests that share the state the walk built.
 *
 *     describe('a gated run waits for its approval, then goes on', () => {
 *       const s = story(test);
 *       s.test('start freezes the gate', async () => { … });
 *       s.test('the tick holds the gated step', async () => { … });
 *     });
 *
 * Once a checkpoint fails, every later one is filed skipped, naming the one that failed: what comes after a broken step reads a state
 * the story never meant, so its failures would be noise. A checkpoint is declared by a call named `test`, which is how a citation of
 * its name resolves (`tools/guards/test/claude-md-cites.test.ts`).
 *
 * Every workspace's tests take it from here, `test-kit/checkpoints`.
 */

import { afterAll, afterEach, beforeAll, beforeEach, vi, type TestAPI, type TestContext } from 'vitest';

/** What a checkpoint's body is handed: the test's own context. */
type Body<T> = (t: T) => unknown;

/** The part of a test's context a checkpoint needs: Vitest's `TestContext` is one. */
export type Skips = { skip: (note?: string) => void };

/** The runner's call that files a test, its context `T`: Vitest's `test` is one. */
export type Teller<T> = (name: string, fn: (t: T) => Promise<void>) => unknown;

/** A story's checkpoints: `test(name, body)` files one, skipped once an earlier one failed. */
export type Story<T> = {
  test: (name: string, body: Body<T>) => void;
  /** The checkpoint that failed, if one did. */
  failed: () => string | undefined;
};

/**
 * The checkpoints of a story told in a `describe`, each a test filed by `test`, in order. A body's error is rethrown in its own test,
 * so the report shows the one failure at the step it happened, and the checkpoints after it are skipped with that step's name as the
 * note.
 *
 * @param test the runner's call that files each checkpoint as a test: Vitest's `test`.
 */
export function story(test: TestAPI): Story<TestContext>;
export function story<T extends Skips>(test: Teller<T>): Story<T>;
export function story<T extends Skips>(test: Teller<T>): Story<T> {
  let failed: string | undefined;
  return {
    test: (name, body) => {
      test(name, async (sub: T) => {
        if (failed !== undefined) {
          sub.skip(`after "${failed}" failed`);
          return;
        }
        try {
          await body(sub);
        } catch (error) {
          failed = name;
          throw error;
        }
      });
    },
    failed: () => failed,
  };
}

/** What a helper that tears down what it made reads of a test, or of a `describe`'s setup (`Held`): where it files the teardown. */
export type Finishes = { onTestFinished: (fn: () => void | Promise<void>) => void };

/** The teardowns a `describe`'s setup filed, run once its tests are done. */
export type Held = {
  /** Files `fn` to run when the describe's tests are done, after those filed before it. */
  onTestFinished: (fn: () => Promise<void> | void) => void;
  /** Runs each teardown filed, in the order filed: what the `beforeAll` that made it returns. */
  end: () => Promise<void>;
};

/**
 * A holder for what a `describe`'s setup tears down: a test whose subtests became a `describe` filed its teardowns on its own
 * context, which a `beforeAll` has not; it files them here, and returns `end`, which Vitest runs after the describe's last test.
 */
export function teardowns(): Held {
  const fns: ((...args: never[]) => unknown)[] = [];
  return {
    onTestFinished: (fn) => {
      fns.push(fn);
    },
    end: async () => {
      for (const fn of fns.splice(0)) await fn();
    },
  };
}

/**
 * The context a story's checkpoints share, in a `describe`: what a parent test's own context was to its subtests under `node:test`. A
 * teardown filed on it runs once the describe's tests are done (its `afterAll`, which this files), and its `signal` aborts then.
 * Called in the describe's body.
 */
export function outlived(): Held & { signal: AbortSignal } {
  const held = teardowns();
  const control = new AbortController();
  afterAll(async () => {
    control.abort();
    await held.end();
  });
  return { ...held, signal: control.signal };
}

/**
 * `Date` faked for every test of the describe this is called in, from `now`, and carried from one test to the next: the kit's seat
 * restores the real timers after each test (the describe's own `beforeAll`, run after this one's, reads it faked too), where a story's
 * checkpoints, under `node:test` subtests of one test, shared one clock.
 * @param now the moment the describe's first test starts at, in milliseconds since the epoch.
 */
export function heldDate(now: number): void {
  let at = now;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: at });
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: at });
  });
  afterEach(() => {
    at = Date.now();
  });
}
