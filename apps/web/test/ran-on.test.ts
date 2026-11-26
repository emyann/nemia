import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { ranOnWords } from '../src/lib/ranOn.ts';

describe('what a step’s latest attempt ran on, in the board’s words: the tag or checkout, then the harness, or not recorded', () => {
  const claude = { name: 'claude', version: '2.1.316' };
  test('an install', () =>
    assert.equal(ranOnWords({ release: { kind: 'install', tag: 'v1.2.0' }, harness: claude, model: null }), 'v1.2.0 · claude 2.1.316'));
  test('a checkout', () =>
    assert.equal(ranOnWords({ release: { kind: 'checkout', root: '/c' }, harness: claude, model: null }), 'checkout · claude 2.1.316'));
  test('a release with no harness version', () =>
    assert.equal(ranOnWords({ release: { kind: 'checkout', root: '/c' }, harness: null, model: null }), 'checkout'));
  test('the model its session ran on, last', () =>
    assert.equal(ranOnWords({ release: null, harness: claude, model: 'claude-opus-5-5' }), 'claude 2.1.316 · claude-opus-5-5'));
  test('nothing recorded', () => assert.equal(ranOnWords({ release: null, harness: null, model: null }), 'not recorded'));
  test('no attempt yet', () => assert.equal(ranOnWords(undefined), null));
});
