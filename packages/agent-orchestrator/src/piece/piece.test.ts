import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstPiece } from './piece.ts';

test('firstPiece gives what split gives first, for each text a separator cuts or does not', async (t) => {
  for (const [text, separator] of [
    ['one\ntwo', '\n'],
    ['one', '\n'],
    ['', '\n'],
    ['\nlead', '\n'],
    ['--flag=value', '='],
    ['a/b/c', '/'],
  ] as const)
    await t.test(JSON.stringify([text, separator]), () => assert.equal(firstPiece(text, separator), text.split(separator)[0]));
});
