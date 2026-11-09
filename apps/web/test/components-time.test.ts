/**
 * The board's time components (`src/components/time/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';
import { at } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { instantWhole, instantWords } = await import('../src/lib/instant.ts');

test('an instant on a page: its words against now, and on hover the whole instant, after what it is of where the caller says', async () => {
  const { Instant } = await import('../src/components/time/Instant.tsx');
  const whole = instantWhole(new Date(at));
  assert.match(whole, /^\d{1,2} Sep 2026, \d{1,2}:00:00 [AP]M$/);
  const words = instantWords(new Date(at), new Date());
  assert.equal(renderToStaticMarkup(createElement(Instant, { at })), `<time dateTime="${at}" title="${whole}">${words}</time>`);
  assert.equal(
    renderToStaticMarkup(createElement(Instant, { at, about: 'When its file was last written', className: 'font-mono' })),
    `<time dateTime="${at}" title="When its file was last written: ${whole}" class="font-mono">${words}</time>`,
  );
  const today = new Date().toISOString();
  assert.match(renderToStaticMarkup(createElement(Instant, { at: today })), />\d{1,2}:\d\d [AP]M<\/time>$/, 'the time alone today');
});

test('REFUSED: an instant that does not parse stands on its page in fixed words, hover included, and its page does not throw', async () => {
  const { Instant } = await import('../src/components/time/Instant.tsx');
  assert.equal(
    renderToStaticMarkup(createElement(Instant, { at: 'not a date', about: 'Queued at' })),
    '<time dateTime="not a date" title="Queued at: an unreadable time">an unreadable time</time>',
  );
});
