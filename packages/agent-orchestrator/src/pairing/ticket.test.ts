/**
 * The short code a pairing is approved by: drawn from an alphabet a person cannot misread, shown `XXXX-XXXX`, and read back in either
 * case, with or without its dash. Where a ticket stands is its contract's (`contracts/ticket.contract.ts`), proved, not tested here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, codeRead, codeShown, shortCode } from './ticket.ts';

test('a short code is eight characters of an alphabet with no 0, O, 1, I or L, shown XXXX-XXXX and read back as typed', () => {
  assert.ok(!'0O1IL'.split('').some((c) => CODE_ALPHABET.includes(c)));
  for (let i = 0; i < 50; i++) {
    const code = shortCode();
    assert.equal(code.length, 8);
    assert.ok(
      code.split('').every((c) => CODE_ALPHABET.includes(c)),
      code,
    );
    const shown = codeShown(code);
    assert.match(shown, /^.{4}-.{4}$/);
    for (const typed of [shown, code, shown.toLowerCase(), ` ${code.toLowerCase()} `]) assert.equal(codeRead(typed), code, typed);
  }
});

test('REFUSED: a text of another length or with a character outside the alphabet reads as no code', () => {
  for (const typed of ['', 'K7QM-3XR', 'K7QM-3XRPP', 'K7QM-3XR0', 'K7QM-3XRO', 'K7QM-3XRL', 'K7QM 3XR!'])
    assert.equal(codeRead(typed), undefined, typed);
});
