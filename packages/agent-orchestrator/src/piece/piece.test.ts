import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { firstPiece } from './piece.ts';

describe('firstPiece gives what split gives first, for each text a separator cuts or does not', () => {
  for (const [text, separator] of [
    ['one\ntwo', '\n'],
    ['one', '\n'],
    ['', '\n'],
    ['\nlead', '\n'],
    ['--flag=value', '='],
    ['a/b/c', '/'],
  ] as const)
    test(JSON.stringify([text, separator]), () => assert.equal(firstPiece(text, separator), text.split(separator)[0]));
});
