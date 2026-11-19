/**
 * The board's one copy control (`lib/useCopy.ts`): what it says once pressed, and when it rests, under node's fake timers.
 */
import { describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { COPY_REST_MS, copyAndSay, type CopySaid } from '../src/lib/useCopy.ts';

/** While the test runs, a clipboard that takes every write, refuses every write, or (`undefined`) none at all. */
function withClipboard(t: { onTestFinished: (fn: () => void) => void }, takes: boolean | undefined) {
  const written: string[] = [];
  const before = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const clipboard =
    takes === undefined
      ? undefined
      : {
          writeText: (text: string) => (takes ? (written.push(text), Promise.resolve()) : Promise.reject(new Error('NotAllowedError'))),
        };
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no clipboard: the browser's global, put and taken back
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  t.onTestFinished(() => {
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no clipboard: the browser's global, put and taken back
    if (before) Object.defineProperty(navigator, 'clipboard', before);
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no clipboard: the browser's global, put and taken back
    else Reflect.deleteProperty(navigator, 'clipboard');
  });
  return written;
}

/** Lets the clipboard's answer reach what waits on it. */
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('copyAndSay: a copy says copied or failed, then rests to copy', () => {
  test('a copy the clipboard takes says copied, and rests to copy at a second and a half and not a millisecond before', async (t) => {
    const written = withClipboard(t, true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const said: CopySaid[] = [];
    copyAndSay('2e13', (word) => said.push(word));
    await settled();
    assert.deepEqual(written, ['2e13'], 'what is copied is the text whole');
    assert.deepEqual(said, ['copied']);
    vi.advanceTimersByTime(1_499);
    assert.deepEqual(said, ['copied'], 'not rested at 1499 ms');
    vi.advanceTimersByTime(1);
    assert.deepEqual(said, ['copied', 'copy']);
  });
  test('a clipboard that refuses the write says failed, and rests the same', async (t) => {
    withClipboard(t, false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const said: CopySaid[] = [];
    copyAndSay('npx nemia status', (word) => said.push(word));
    await settled();
    assert.deepEqual(said, ['failed']);
    vi.advanceTimersByTime(COPY_REST_MS);
    assert.deepEqual(said, ['failed', 'copy']);
  });
  test('a page with no clipboard, as outside a secure context, says failed and throws nothing', async (t) => {
    withClipboard(t, undefined);
    const said: CopySaid[] = [];
    copyAndSay('2e13', (word) => said.push(word));
    await settled();
    assert.deepEqual(said, ['failed']);
  });
  test('stopped, as when the control leaves the page, it says nothing more', async (t) => {
    withClipboard(t, true);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const said: CopySaid[] = [];
    const stop = copyAndSay('2e13', (word) => said.push(word));
    await settled();
    stop();
    vi.advanceTimersByTime(COPY_REST_MS);
    assert.deepEqual(said, ['copied'], 'its rest cleared');
    const early: CopySaid[] = [];
    copyAndSay('2e13', (word) => early.push(word))();
    await settled();
    assert.deepEqual(early, [], 'stopped before the clipboard answered: nothing said');
  });
});
