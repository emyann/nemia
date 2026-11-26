/**
 * The board's one media query hook (`lib/useMedia.ts`) and the three that read it: what each answers where there is no browser to ask,
 * and where there is one.
 */
import './tsx.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { useMedia } = await import('../src/lib/useMedia.ts');
const { useIsMobile } = await import('../src/hooks/use-mobile.ts');
const { useReducedMotion } = await import('../src/lib/useReducedMotion.ts');

/** What `hook` answers in a render. */
function answer(hook: () => boolean) {
  return renderToStaticMarkup(createElement(() => String(hook())));
}

/** While the test runs, a browser whose media queries match where `matches` says, and the queries it was asked; none for `undefined`. */
function withMedia(t: { onTestFinished: (fn: () => void) => void }, matches: ((query: string) => boolean) | undefined) {
  const asked: string[] = [];
  const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no matchMedia: the browser's global, put and taken back
  if (matches === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
  else
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no matchMedia: the browser's global, put and taken back
    Object.defineProperty(globalThis, 'matchMedia', {
      value: (media: string) => (asked.push(media), { media, matches: matches(media), addEventListener() {}, removeEventListener() {} }),
      configurable: true,
      writable: true,
    });
  t.onTestFinished(() => {
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no matchMedia: the browser's global, put and taken back
    if (before) Object.defineProperty(globalThis, 'matchMedia', before);
    // oxlint-disable-next-line landmines-testing/no-test-doubles -- Node has no matchMedia: the browser's global, put and taken back
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  });
  return asked;
}

describe('useMedia: whether a media query matches, and its fallback where there is no browser', () => {
  test('no browser to ask: each hook says its fallback — motion stopped, no sheet, not narrow', (t) => {
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
    assert.equal(answer(useIsMobile), 'false');
  });
  test('a browser: each hook says what its own query matches', (t) => {
    const asked = withMedia(t, () => true);
    assert.deepEqual([answer(useReducedMotion), answer(useIsMobile)], ['true', 'true']);
    assert.match(asked.find((query) => query.includes('reduced-motion')) ?? '', /prefers-reduced-motion: reduce/);
    assert.ok(asked.includes('(max-width: 767px)'), 'narrow under a tablet, 768 pixels');
  });
  test('a browser where nothing matches: none of them, the fallback of motion included', (t) => {
    withMedia(t, () => false);
    assert.deepEqual([answer(useReducedMotion), answer(useIsMobile)], ['false', 'false']);
  });
});
