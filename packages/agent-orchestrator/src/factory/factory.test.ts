/**
 * A factory's name and what `wf factory ls` says of the store's factories — pure, as data.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FACTORY,
  defaultFactoryRefusal,
  factoryLines,
  factoryNameRefusal,
  fillsOf,
  hireRefusal,
  noFactoryLine,
  unfilledRefusal,
} from './factory.ts';

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
      { name: 'pipao', file: '/s/factories/pipao.json', repos: ['/code/pipao'], hires: {} },
      { name: 'broken', file: '/s/factories/broken.json', error: 'does not read as a factory: `repos` is missing' },
      { name: 'abc', file: '/s/factories/abc.json', repos: ['/code/a', '/code/b'], hires: {} },
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

test("wf factory ls: a factory's hires under its line, sorted by step, whatever order its file has them in", () => {
  assert.deepEqual(
    factoryLines([
      {
        name: 'pipao',
        file: '/s/factories/pipao.json',
        repos: ['/code/pipao'],
        hires: { 'build/review': 'agora', 'build/implement': 'ada' },
      },
    ]),
    [
      'default  every run and card that names no factory — read, never written',
      'pipao    /code/pipao',
      '         build/implement ← ada',
      '         build/review ← agora',
    ],
  );
});

test('REFUSED: a hire whose step is not <workflow>/<step>, or whose agent is no name', () => {
  for (const step of ['build', 'build/a/b', 'build/.x', '/x', 'build/', '.git/x', 'agents/x', 'skills/x', 'build/README'])
    assert.ok(hireRefusal(step, 'ada'), `refused: ${step}`);
  for (const agent of ['', 'a/b', '.ada', 'a b']) assert.ok(hireRefusal('build/implement', agent), `refused: ${JSON.stringify(agent)}`);
  assert.match(hireRefusal('build', 'ada')!, /^--step build names a step as <workflow>\/<step>/);
  assert.match(hireRefusal('build/a/b', 'ada')!, /^--step build\/a\/b names a step as <workflow>\/<step>/);
  assert.match(hireRefusal('agents/x', 'ada')!, /agents\/ holds the agents/);
  assert.match(hireRefusal('build/.x', 'ada')!, /`\.x` is not a step's name/);
  assert.match(hireRefusal('build/implement', 'a/b')!, /^`a\/b` is not an agent's name/);
});

test('a hire of a named agent into <workflow>/<step> is taken', () => {
  for (const [step, agent] of [
    ['build/implement', 'ada'],
    ['intake/frame-the-idea', 'iris-2'],
  ])
    assert.equal(hireRefusal(step, agent), undefined, `${step} ${agent}`);
});

test("a factory's fills for one workflow: its hires into that workflow's steps, by step, and none of another workflow's", () => {
  const hires = { 'build/implement': 'ada', 'build/review': 'agora', 'other/implement': 'otto', 'builder/implement': 'x' };
  assert.deepEqual(fillsOf(hires, 'build'), { implement: 'ada', review: 'agora' });
  assert.deepEqual(fillsOf(hires, 'other'), { implement: 'otto' });
  assert.deepEqual(fillsOf(hires, 'intake'), {});
});

test('REFUSED: every step no agent fills, naming the factory and the hire line for each; a step that names its agent or a remote one is filled', () => {
  const steps = [
    { name: 'implement', harness: undefined, agent: undefined },
    { name: 'review', harness: undefined, agent: { name: 'reviewer', keys: [], body: '', given: {} } },
    { name: 'ask', harness: 'a2a:helper', agent: undefined },
    { name: 'ship', harness: 'claude', agent: undefined },
  ];
  const why = unfilledRefusal(steps, 'pipao', 'build');
  assert.ok(why);
  assert.match(why, /^build: in the factory pipao, 2 steps name no agent, and pipao hires none into them: implement, ship\./);
  assert.match(why, /wf factory hire pipao <agent> --step build\/implement/);
  assert.match(why, /wf factory hire pipao <agent> --step build\/ship/);
  assert.doesNotMatch(why, /build\/review|build\/ask/);
  assert.equal(unfilledRefusal(steps.slice(1, 3), 'pipao', 'build'), undefined);
  assert.match(unfilledRefusal(steps.slice(0, 1), 'pipao', 'build')!, /^build: in the factory pipao, the step implement names no agent/);
});

test('the default factory is refused to hire and fire, since it is never written', () => {
  assert.match(defaultFactoryRefusal('hire'), /wf factory hire does not take it/);
  assert.match(defaultFactoryRefusal('fire'), /wf factory fire does not take it/);
});
