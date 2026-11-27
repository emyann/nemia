/**
 * The board's one copy control (`lib/useCopy.ts`): what it says once pressed, and when it rests, under node's fake timers; how it copies
 * where the page has no clipboard, as outside a secure context; and that every place of the board that copies goes through it.
 */
import { describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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

/**
 * While the test runs, a page whose `execCommand('copy')` answers `answers`, recording the text selected when it is asked, and saying
 * once the copy answered whether the textarea it was selected in is gone and the focus back where it was.
 */
function withSelectionCopy(t: { onTestFinished: (fn: () => void) => void }, answers: boolean) {
  const asked: string[] = [];
  const held = new Set<{ value: string; selected: boolean }>();
  const focused = { focus: () => void (page.activeElement = focused) };
  const page = {
    activeElement: focused as object | null,
    body: { appendChild: (node: { value: string; selected: boolean }) => void held.add(node) },
    createElement: () => {
      const area = {
        value: '',
        style: {},
        selected: false,
        setAttribute: () => undefined,
        select: () => {
          area.selected = true;
          page.activeElement = area;
        },
        remove: () => void held.delete(area),
      };
      return area;
    },
    execCommand: (command: string) => {
      const selected = [...held].find((node) => node.selected);
      if (command === 'copy' && selected) asked.push(selected.value);
      return answers;
    },
  };
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no document: the browser's global, put and taken back
  Object.defineProperty(globalThis, 'document', { value: page, configurable: true });
  t.onTestFinished(() => {
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no document: the browser's global, put and taken back
    if (before) Object.defineProperty(globalThis, 'document', before);
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no document: the browser's global, put and taken back
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return { asked, left: () => ({ held: held.size, focusBack: page.activeElement === focused }) };
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
  test('a page with no clipboard, as outside a secure context, copies through a selected textarea and says copied', async (t) => {
    withClipboard(t, undefined);
    const page = withSelectionCopy(t, true);
    const said: CopySaid[] = [];
    copyAndSay('2e13', (word) => said.push(word));
    await settled();
    assert.deepEqual(page.asked, ['2e13'], 'the text selected when copy is asked is the text whole');
    assert.deepEqual(said, ['copied']);
    assert.deepEqual(page.left(), { held: 0, focusBack: true }, 'the textarea gone, the focus back where it was');
  });
  test('a clipboard that refuses the write copies through the selection instead', async (t) => {
    withClipboard(t, false);
    const page = withSelectionCopy(t, true);
    const said: CopySaid[] = [];
    copyAndSay('npx nemia status', (word) => said.push(word));
    await settled();
    assert.deepEqual(page.asked, ['npx nemia status']);
    assert.deepEqual(said, ['copied']);
  });
  test('a page with no clipboard whose selection copy refuses too says failed, and leaves nothing behind', async (t) => {
    withClipboard(t, undefined);
    const page = withSelectionCopy(t, false);
    const said: CopySaid[] = [];
    copyAndSay('2e13', (word) => said.push(word));
    await settled();
    assert.deepEqual(said, ['failed']);
    assert.deepEqual(page.left(), { held: 0, focusBack: true });
  });
  test('a page with neither a clipboard nor a document says failed and throws nothing', async (t) => {
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

/** Every source file under `dir` but the stories, by its absolute path. */
const sources = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('.stories.'))
    .map((file) => path.join(dir, file));

describe('every place of the board that copies goes through copyAndSay', () => {
  const web = path.resolve(import.meta.dirname, '..');
  const writes = /clipboard\s*\??\.\s*writeText|execCommand\s*\(/;
  test('only lib/useCopy.ts writes the clipboard', () => {
    const helper = path.join(web, 'src', 'lib', 'useCopy.ts');
    assert.ok(writes.test(readFileSync(helper, 'utf8')), "the pattern finds the helper's own writes");
    const others = sources(path.join(web, 'src'))
      .filter((file) => file !== helper && writes.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(web, file));
    assert.deepEqual(others, []);
  });
  test("the card menu's Copy its name goes through copyAndSay", () => {
    const menu = readFileSync(path.join(web, 'src', 'components', 'inbox', 'CardActions.tsx'), 'utf8');
    assert.match(menu, /label: 'Copy its name',\s*onAction: \(\) =>\s*copyAndSay\(entry\.name/);
  });
});
