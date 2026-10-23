/**
 * The look's scroll bar, held where no browser is needed: the rule in the board's styles, read as text and refused with each of its
 * parts cut out, and the mark of what scrolls (`markScrolls`), on a stand-in for the document and a scheduler stepped by hand. What
 * a browser draws from them is read in `e2e/bars.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BAR, LINGER_MS, markScrolls, type Later, type ScrollSource } from '../src/lib/useScrollMark.ts';

const STYLES = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');

/** Where the rule for browsers that know the scroll bar's parts starts, where the rule for the others does, and where both end. */
const PARTS = '@supports selector(::-webkit-scrollbar)';
const OTHERS = '@supports not selector(::-webkit-scrollbar)';
const INK = '@property --bar-ink';

/** What each part of the rule must say, by name: in the parts' block, in the others', or anywhere in the styles. */
const SAID: ReadonlyArray<{ what: string; where: 'parts' | 'others' | 'styles'; says: RegExp }> = [
  { what: 'an 8-pixel lane', where: 'parts', says: /::-webkit-scrollbar\s*\{\s*width:\s*8px;\s*height:\s*8px;\s*\}/ },
  {
    what: 'the ground through the track and the corner',
    where: 'parts',
    says: /::-webkit-scrollbar-track,\s*::-webkit-scrollbar-corner\s*\{\s*background-color:\s*transparent;\s*\}/,
  },
  { what: 'no arrows', where: 'parts', says: /::-webkit-scrollbar-button\s*\{\s*display:\s*none;\s*\}/ },
  {
    what: 'a thumb in the ink of what it scrolls',
    where: 'parts',
    says: /::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*var\(--bar-ink\);[^}]*\}/,
  },
  {
    what: 'no thumb on a conversation that follows its stream',
    where: 'parts',
    says: /:where\(\[data-autoscrolling\]\)::-webkit-scrollbar-thumb\s*\{\s*background-color:\s*transparent;\s*\}/,
  },
  { what: 'no ink at rest', where: 'parts', says: /\[data-scroll-bar\]\s*\{\s*--bar-ink:\s*transparent;/ },
  {
    what: 'the ink taken back by what a marked thing holds',
    where: 'parts',
    says: /:where\(\[data-scroll-bar\]:not\(:root\)\)\s*>\s*\*,\s*:where\(:root\[data-scroll-bar\]\)\s*>\s*body\s*>\s*\*\s*\{\s*--bar-ink:\s*transparent;/,
  },
  {
    what: 'the thumb in outline while it scrolls',
    where: 'parts',
    says: /\[data-scroll-bar='shown'\]\s*\{\s*--bar-ink:\s*var\(--md-sys-color-outline\);/,
  },
  {
    what: 'the thumb in on-surface-variant under the pointer',
    where: 'parts',
    says: /::-webkit-scrollbar-thumb:hover\s*\{[^}]*background-color:\s*var\(--md-sys-color-on-surface-variant\);\s*\}/,
  },
  {
    what: 'the thumb in on-surface while held',
    where: 'parts',
    says: /::-webkit-scrollbar-thumb:active\s*\{[^}]*background-color:\s*var\(--md-sys-color-on-surface\);\s*\}/,
  },
  {
    what: 'no fade when nothing may move',
    where: 'parts',
    says: /prefers-reduced-motion:\s*reduce\)\s*\{\s*\[data-scroll-bar\]\s*\{\s*transition:\s*none;/,
  },
  { what: 'a thin bar where the parts are unknown', where: 'others', says: /scrollbar-width:\s*thin;/ },
  {
    what: 'its ink while it scrolls where the parts are unknown',
    where: 'others',
    says: /\[data-scroll-bar='shown'\]\s*\{\s*scrollbar-color:\s*var\(--md-sys-color-outline\)\s+transparent;/,
  },
  { what: 'the ink as an inherited colour', where: 'styles', says: /@property --bar-ink\s*\{\s*syntax:\s*'<color>';\s*inherits:\s*true;/ },
  { what: 'both colour schemes on the root', where: 'styles', says: /:root\s*\{\s*color-scheme:\s*light dark;/ },
];

/**
 * What of the look's scroll bar rule `css` does not say, by name; none when the rule is whole. Each block is read from its own name to
 * the next one that is there, and the last to the ink's.
 */
function unsaid(css: string): string[] {
  const [parts, others, ink] = [css.indexOf(PARTS), css.indexOf(OTHERS), css.indexOf(INK)];
  const blocks = {
    parts: parts >= 0 && ink > parts ? css.slice(parts, others > parts ? others : ink) : '',
    others: others >= 0 && ink > others ? css.slice(others, ink) : '',
    styles: css,
  };
  return SAID.filter(({ where, says }) => !says.test(blocks[where])).map(({ what }) => what);
}

/** A stand-in for an element: what was written on it, in order. */
type Stand = { written: string[]; setAttribute: (name: string, value: string) => void };
const stand = (): Stand => {
  const written: string[] = [];
  return { written, setAttribute: (name, value) => void written.push(`${name}=${value}`) };
};

/** A stand-in for the document, which keeps the listener it is given, and a scheduler that runs what is due only when stepped. */
function world() {
  let heard: ((event: Event) => void) | undefined;
  const calls: string[] = [];
  const source: ScrollSource = {
    addEventListener: (type: string, listener: unknown, options?: unknown) => {
      calls.push(`add ${type} ${JSON.stringify(options)}`);
      heard = listener as (event: Event) => void;
    },
    removeEventListener: (type: string, listener: unknown) => {
      calls.push(`remove ${type}`);
      if (heard === listener) heard = undefined;
    },
  };
  const due: Array<{ run: () => void; ms: number; live: boolean }> = [];
  const later: Later = (run, ms) => {
    const entry = { run, ms, live: true };
    due.push(entry);
    return () => void (entry.live = false);
  };
  return {
    source,
    later,
    calls,
    listening: () => heard !== undefined,
    scroll: (target: unknown) => heard?.({ target } as Event),
    waits: () => due.filter((entry) => entry.live).map((entry) => entry.ms),
    step: () => {
      for (const entry of due.splice(0)) if (entry.live) entry.run();
    },
  };
}

test('markScrolls: what scrolled shown, and at rest once its linger has passed', async (t) => {
  await t.test(
    'a scroll marks what scrolled shown, and at rest once the linger has passed with no other; the mark is written only as it changes',
    () => {
      const { source, later, calls, scroll, waits, step } = world();
      markScrolls(source, later);
      assert.deepEqual(calls, ['add scroll {"capture":true,"passive":true}'], 'one listener, on the way down, that cannot stop a scroll');
      const box = stand();
      scroll(box);
      assert.deepEqual(box.written, [`${BAR}=shown`], 'a scroll marks the element shown');
      assert.deepEqual(waits(), [LINGER_MS], 'and its rest is due after the linger');
      scroll(box);
      assert.deepEqual(box.written, [`${BAR}=shown`], 'a second scroll writes nothing: it is shown already');
      assert.deepEqual(waits(), [LINGER_MS], 'and puts its rest off: the first is taken back');
      step();
      assert.deepEqual(box.written, [`${BAR}=shown`, `${BAR}=rest`], 'the linger passed, it is at rest');
      scroll(box);
      assert.deepEqual(box.written.at(-1), `${BAR}=shown`, 'and a scroll after its rest shows it again');
    },
  );
  await t.test("REFUSED: the first scroll's rest does not fire while a second is still to linger", () => {
    const { source, later, scroll, step } = world();
    markScrolls(source, later);
    const box = stand();
    scroll(box);
    scroll(box);
    step();
    assert.deepEqual(box.written, [`${BAR}=shown`, `${BAR}=rest`], 'stepped once, one rest is written: the rest put off never ran');
  });
  await t.test("the page's own scroll marks the document's root, and each thing that scrolls has its own rest", () => {
    const { source, later, scroll, step } = world();
    markScrolls(source, later);
    const [root, box] = [stand(), stand()];
    scroll({ documentElement: root });
    scroll(box);
    assert.deepEqual([root.written, box.written], [[`${BAR}=shown`], [`${BAR}=shown`]], 'the root for the page, the element for itself');
    scroll(null);
    scroll({ no: 'element' });
    step();
    assert.deepEqual([root.written.at(-1), box.written.at(-1)], [`${BAR}=rest`, `${BAR}=rest`]);
  });
  await t.test('undone, nothing listens, and what was shown is at rest with no rest left due', () => {
    const { source, later, calls, listening, scroll, waits } = world();
    const undo = markScrolls(source, later);
    const box = stand();
    scroll(box);
    undo();
    assert.equal(listening(), false, 'the listener is taken off');
    assert.equal(calls.at(-1), 'remove scroll');
    assert.deepEqual(box.written, [`${BAR}=shown`, `${BAR}=rest`], 'what was shown is put at rest');
    assert.deepEqual(waits(), [], 'and no rest is left due');
  });
});

/** The text of the board's file at `file`, from `from` to `to`, two names it must hold in that order. */
function sliceOf(file: string, from: string, to: string): string {
  const text = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'src', file), 'utf8');
  const [start, end] = [text.indexOf(from), text.indexOf(to, text.indexOf(from) + from.length)];
  assert.ok(start >= 0 && end > start, `${file} holds ${from}, then ${to}`);
  return text.slice(start, end);
}

test("the scroll bar in the board's source: the rule in its styles, and the frame that marks what scrolls", async (t) => {
  await t.test("REFUSED: the look's scroll bar rule is in the board's styles; with a block cut out, what it said is named", () => {
    assert.deepEqual(unsaid(STYLES), [], 'the rule is whole');
    const [parts, others, ink] = [STYLES.indexOf(PARTS), STYLES.indexOf(OTHERS), STYLES.indexOf(INK)];
    assert.ok(parts >= 0 && others > parts && ink > others, 'the three names the slices end on are there, in order');
    const noParts = unsaid(STYLES.slice(0, parts) + STYLES.slice(others));
    assert.deepEqual(
      noParts,
      SAID.filter(({ where }) => where === 'parts').map(({ what }) => what),
      'the parts cut out: each is named',
    );
    const noOthers = unsaid(STYLES.slice(0, others) + STYLES.slice(ink));
    assert.deepEqual(
      noOthers,
      SAID.filter(({ where }) => where === 'others').map(({ what }) => what),
      'the others cut out: each is named',
    );
    assert.deepEqual(unsaid(STYLES.replace('color-scheme: light dark;', '')), ['both colour schemes on the root'], 'the schemes cut out');
    assert.deepEqual(unsaid(STYLES.replace("[data-scroll-bar='shown'] {\n      --bar-ink", "[data-scroll-bar='lit'] {\n      --bar-ink")), [
      'the thumb in outline while it scrolls',
    ]);
  });
  await t.test("the frame marks what scrolls once, in its root, and the sidebar's list hides no scroll bar", () => {
    assert.match(sliceOf('routes/__root.tsx', 'function Root()', 'return ('), /\n\s*useScrollMark\(\);/, 'Root calls the hook');
    const list = sliceOf('components/ui/sidebar.tsx', 'function SidebarContent(', 'function SidebarGroup(');
    assert.match(list, /overflow-auto/, 'the list scrolls');
    assert.doesNotMatch(list, /no-scrollbar/, 'and wears nothing that hides its bar');
  });
});
