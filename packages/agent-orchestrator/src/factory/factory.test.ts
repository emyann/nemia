/**
 * A factory's name and what `wf factory ls` says of the store's factories — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FACTORY, defaultFactoryRefusal, factoryLines, factoryNameRefusal, noFactoryLine } from './factory.ts';

test('REFUSED: a name that is empty, not lowercase, climbs, is hidden, starts with a dash or is past 40 characters', () => {
  for (const name of ['', 'Nemia', 'a/b', '.x', '-x', '..', '../x', 'a b', 'é', 'a'.repeat(41)])
    assert.ok(factoryNameRefusal(name), `refused: ${JSON.stringify(name)}`);
  assert.match(factoryNameRefusal('Nemia')!, /— nemia, say\.$/);
  assert.match(factoryNameRefusal('a/b')!, /^`a\/b` is not a factory's name: .* pipao or nemia-2, say\.$/);
  assert.match(factoryNameRefusal('')!, /this name is empty/);
});

test('a lowercase slug of up to 40 characters names a factory', () => {
  for (const name of ['pipao', 'nemia', 'nemia-2', '2x', 'a'.repeat(40)]) assert.equal(factoryNameRefusal(name), undefined, name);
});

test('the default factory is refused to add and rm in words of its own', () => {
  assert.equal(DEFAULT_FACTORY, 'default');
  assert.match(
    defaultFactoryRefusal('add'),
    /^`default` is the default factory: .* read, never written, so wf factory add does not take it/,
  );
  assert.match(defaultFactoryRefusal('rm'), /wf factory rm does not take it/);
});

test('wf factory ls: the default first, then each factory by name with its repositories, and one that does not read with why', () => {
  assert.deepEqual(factoryLines([]), ['default  every run and card that names no factory — read, never written']);
  assert.deepEqual(
    factoryLines([
      { name: 'pipao', file: '/s/factories/pipao.json', repos: ['/code/pipao'] },
      { name: 'broken', file: '/s/factories/broken.json', error: 'does not read as a factory: `repos` is missing' },
      { name: 'abc', file: '/s/factories/abc.json', repos: ['/code/a', '/code/b'] },
    ]),
    [
      'default  every run and card that names no factory — read, never written',
      'abc      /code/a, /code/b',
      'broken   /s/factories/broken.json does not read as a factory: `repos` is missing',
      'pipao    /code/pipao',
    ],
  );
});

test('no factory of that name: which there are, or that there is none but the default', () => {
  assert.equal(noFactoryLine('nope', ['pipao', 'abc']), 'no factory nope in the store. Its factories are: abc, pipao.');
  assert.match(noFactoryLine('nope', []), /It has none but the default: file one with wf factory add <name> --repo <path>\.$/);
});
