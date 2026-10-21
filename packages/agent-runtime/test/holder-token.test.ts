/**
 * The holder's bearer token on disk (`src/a2a/holder-token.ts`), read back as a viewer's `credentials` reads it
 * (`holderTokenOf`): what the writer wrote, nothing for a store that holds none, and nothing made by the read.
 *
 * It touches files under a scratch root and nothing else: no process, no socket, no engine, so it is no boundary test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forgetToken, holderTokenOf, tokenFolderOf, tokenOf, writeToken } from '../src/a2a/holder-token.ts';
import { scratch } from './scratch.ts';

test('holderTokenOf answers what writeToken wrote', () => {
  const root = scratch('token-read');
  const token = tokenOf();
  writeToken(root, token);
  assert.equal(holderTokenOf(root), token);
});

test('holderTokenOf answers nothing for a store with no a2a folder, and makes none', () => {
  const root = scratch('token-none');
  assert.equal(holderTokenOf(root), undefined);
  assert.equal(fs.existsSync(tokenFolderOf(root)), false, 'the read makes no folder');
});

test('holderTokenOf answers nothing once the token is forgotten', () => {
  const root = scratch('token-forgotten');
  writeToken(root, tokenOf());
  forgetToken(root);
  assert.equal(holderTokenOf(root), undefined);
  assert.equal(fs.existsSync(tokenFolderOf(root)), true, 'the folder the hold made stays; the token alone is gone');
});
