import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ranOnWords } from '../src/lib/ranOn.ts';

test('what a step’s latest attempt ran on, in the board’s words: the tag or checkout, then the harness, or not recorded', async (t) => {
  const claude = { name: 'claude', version: '2.1.316' };
  await t.test('an install', () =>
    assert.equal(ranOnWords({ release: { kind: 'install', tag: 'v1.2.0' }, harness: claude }), 'v1.2.0 · claude 2.1.316'),
  );
  await t.test('a checkout', () =>
    assert.equal(ranOnWords({ release: { kind: 'checkout', root: '/c' }, harness: claude }), 'checkout · claude 2.1.316'),
  );
  await t.test('a release with no harness version', () =>
    assert.equal(ranOnWords({ release: { kind: 'checkout', root: '/c' }, harness: null }), 'checkout'),
  );
  await t.test('nothing recorded', () => assert.equal(ranOnWords({ release: null, harness: null }), 'not recorded'));
  await t.test('no attempt yet', () => assert.equal(ranOnWords(undefined), null));
});
