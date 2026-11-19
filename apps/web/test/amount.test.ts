/**
 * An amount a person types (src/lib/amount.ts): the format its field shows it in, as the board writes money, and what the field's
 * text holds while it is typed, in the field's locale.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { AMOUNT_FORMATS, amountTyped, type AmountKind } from '../src/lib/amount.ts';
import { dollars } from '../src/lib/money.ts';

test('AMOUNT_FORMATS: dollars are drawn as the board writes money, to the cent; a count whole', () => {
  const format = new Intl.NumberFormat('en-US', AMOUNT_FORMATS.dollars);
  for (const usd of [16, 2.5, 0.25, 80, 1234.5]) assert.equal(format.format(usd).replace(',', ''), dollars(usd), String(usd));
  assert.equal(format.format(2.456), '$2.46', 'rounded to the cent');
  assert.equal(new Intl.NumberFormat('en-US', AMOUNT_FORMATS.count).format(1200), '1200');
});

test('amountTyped: the amount a field holds as it is typed, none where it is empty, and undefined for a text the field refuses', () => {
  const rows: Array<[string, AmountKind, string, number | null | undefined]> = [
    ['', 'dollars', 'en-US', null],
    ['$', 'dollars', 'en-US', null],
    ['12', 'dollars', 'en-US', 12],
    ['12.', 'dollars', 'en-US', 12],
    ['$12.5', 'dollars', 'en-US', 12.5],
    ['.25', 'dollars', 'en-US', 0.25],
    ['$1,234.56', 'dollars', 'en-US', 1234.56],
    ['12.345', 'dollars', 'en-US', undefined],
    ['12a', 'dollars', 'en-US', undefined],
    ['1.234,5 $', 'dollars', 'de-DE', 1234.5],
    ['7', 'count', 'en-US', 7],
    ['1.5', 'count', 'en-US', undefined],
  ];
  for (const [text, kind, locale, amount] of rows) assert.equal(amountTyped(text, kind, locale), amount, `${text} (${kind}, ${locale})`);
});
