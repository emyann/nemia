/**
 * `expectInstant` (test/e2e/board.ts) read across a turning day: the board draws an instant with the clock it has, and the assertion
 * reads the words afterwards, so a midnight between the two gives two forms and both are the board's. The clock of this process is
 * frozen, never waited for, and the drawn text is written here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Locator, Page } from 'playwright';
import { DREW_WITHIN_MS, expectInstant } from './e2e/board.ts';
import { instantWhole } from '../src/lib/instant.ts';

/** Where the browser of this test is, and the instant the page drew: 10:58 PM on 15 October, the evening before the day that turns. */
const ZONE = 'America/Montreal';
const AT = '2026-10-16T02:58:00.000Z';

/** A `<time>` as `expectInstant` reads one: its zone from the page, its `datetime`, its text and its title, all said here. */
const drawn = (text: string, title = `When it was filed: ${instantWhole(new Date(AT), ZONE)}`): Locator =>
  ({
    page: () => ({ evaluate: async () => ZONE }) as unknown as Page,
    getAttribute: async (name: string) => (name === 'datetime' ? AT : title),
    textContent: async () => text,
  }) as unknown as Locator;

/** Runs `body` with every `new Date()` of this process answering `iso`, and puts the real clock back. */
async function atClock(iso: string, body: () => Promise<void>): Promise<void> {
  const real = globalThis.Date;
  const fixed = new real(iso).getTime();
  globalThis.Date = new Proxy(real, {
    construct: (target, args) => (args.length === 0 ? new target(fixed) : Reflect.construct(target, args)),
  });
  try {
    await body();
  } finally {
    globalThis.Date = real;
  }
}

test('the words the page drew before midnight pass an assertion that reads them after it', async () => {
  await atClock('2026-10-16T04:00:30.000Z', async () => {
    await expectInstant(drawn('10:58 PM'), 'When it was filed: ', 'when the card was filed');
    await expectInstant(drawn('15 Oct 10:58 PM'), 'When it was filed: ', 'when the card was filed');
  });
});

test('a text that is no clock of the window is refused, and the refusal names both forms', async () => {
  await atClock('2026-10-16T04:00:30.000Z', async () => {
    const err = await expectInstant(drawn('9:58 PM'), 'When it was filed: ', 'when the card was filed').then(
      () => null,
      (e: Error) => e,
    );
    assert.ok(err, 'a text of another hour is refused');
    assert.equal(err.message, 'when the card was filed reads as the board writes it, 10:58 PM or 15 Oct 10:58 PM — it reads "9:58 PM"');
  });
});

test('a clock further back than the window is no form of the page', async () => {
  await atClock('2026-10-16T04:00:30.000Z', async () => {
    assert.ok(DREW_WITHIN_MS < 24 * 60 * 60 * 1000, 'the window is shorter than a day, so it holds at most two forms');
  });
  await atClock('2026-10-16T05:30:00.000Z', async () => {
    const err = await expectInstant(drawn('10:58 PM'), 'When it was filed: ', 'when the card was filed').then(
      () => null,
      (e: Error) => e,
    );
    assert.ok(err, 'an hour and a half after midnight the page can no longer say today');
    assert.match(err.message, /reads as the board writes it, 15 Oct 10:58 PM — it reads "10:58 PM"/);
  });
});

test('the whole instant on hover is still refused when it is wrong', async () => {
  await atClock('2026-10-16T04:00:30.000Z', async () => {
    const err = await expectInstant(drawn('10:58 PM', 'When it was filed: never'), 'When it was filed: ', 'the filing').then(
      () => null,
      (e: Error) => e,
    );
    assert.ok(err, 'a title that is not the instant whole is refused');
    assert.match(err.message, /says the whole instant on hover/);
  });
});
