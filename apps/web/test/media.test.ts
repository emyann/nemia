/**
 * The board's one media query hook (`lib/useMedia.ts`) and the three that read it: what each answers where there is no browser to ask,
 * and where there is one.
 */
import './tsx.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { useMedia } = await import('../src/lib/useMedia.ts');
const { useIsMobile } = await import('../src/hooks/use-mobile.ts');
const { useSheetPreview } = await import('../src/lib/useSheetPreview.ts');
const { useReducedMotion } = await import('../src/lib/useReducedMotion.ts');

/** What `hook` answers in a render. */
function answer(hook: () => boolean): string {
  return renderToStaticMarkup(createElement(() => String(hook())));
}

/** While the test runs, a browser whose media queries match where `matches` says, and the queries it was asked; none for `undefined`. */
function withMedia(t: { after: (fn: () => void) => void }, matches: ((query: string) => boolean) | undefined): string[] {
  const asked: string[] = [];
  const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  if (matches === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
  else
    Object.defineProperty(globalThis, 'matchMedia', {
      value: (media: string) => (asked.push(media), { media, matches: matches(media), addEventListener() {}, removeEventListener() {} }),
      configurable: true,
      writable: true,
    });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'matchMedia', before);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  });
  return asked;
}

test('useMedia: whether a media query matches, and its fallback where there is no browser', async (t) => {
  await t.test('no browser to ask: each hook says its fallback — motion stopped, no sheet, not narrow', (t) => {
    withMedia(t, undefined);
    assert.equal(
      answer(() => useMedia('(min-width: 1px)', true)),
      'true',
    );
    assert.equal(
      answer(() => useMedia('(min-width: 1px)', false)),
      'false',
    );
    assert.equal(answer(useReducedMotion), 'true');
    assert.equal(answer(useSheetPreview), 'false');
    assert.equal(answer(useIsMobile), 'false');
  });
  await t.test('a browser: each hook says what its own query matches', (t) => {
    const asked = withMedia(t, () => true);
    assert.deepEqual([answer(useReducedMotion), answer(useSheetPreview), answer(useIsMobile)], ['true', 'true', 'true']);
    assert.match(asked.find((query) => query.includes('reduced-motion')) ?? '', /prefers-reduced-motion: reduce/);
    assert.match(
      asked.find((query) => query.includes('hover')) ?? '',
      /\(hover: none\), \(max-width: 599px\)/,
      'a sheet under 600 pixels or with no hover',
    );
    assert.ok(asked.includes('(max-width: 767px)'), 'narrow under a tablet, 768 pixels');
  });
  await t.test('a browser where nothing matches: none of them, the fallback of motion included', (t) => {
    withMedia(t, () => false);
    assert.deepEqual([answer(useReducedMotion), answer(useSheetPreview), answer(useIsMobile)], ['false', 'false', 'false']);
  });
});
