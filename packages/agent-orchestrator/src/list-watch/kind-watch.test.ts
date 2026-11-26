/**
 * What a watch from a revision sends of a kind's objects (`changesOf`) and the revision each is at (`revisionTable`), over the rows and
 * the records a kind's table (`WATCHED_KINDS`) names. `objectChange`'s four laws are proved by its contract.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { changesOf, revisionTable, WATCHED_KINDS, WATCHED_KIND_NAMES, type RowSeen } from './kind-watch.ts';

const CARDS = '/registry/cards/';
const TRIES = '/registry/cardtries/';

/** A row of a prefix: the key under it, its revision, the revision its life began at, and whether it deletes. */
const row = (prefix: string, name: string, revision: number, createRevision = revision, deleted = false) =>
  ({ prefix, key: `${prefix}${name}`, revision, createRevision, deleted }) satisfies RowSeen & { prefix: string };

test('a card edited and its try written after the revision give one MODIFIED each, at the latest revision, in revision order', () => {
  const changes = changesOf('Card', 4, [row(CARDS, 'a', 6, 1), row(CARDS, 'b', 7, 2), row(TRIES, 'a', 9, 8)]);
  assert.deepEqual(
    changes.map((c) => [c.name, c.change, c.revision]),
    [
      ['b', 'MODIFIED', 7],
      ['a', 'MODIFIED', 9],
    ],
  );
});

test('a card made after the revision is ADDED, one made and removed after it is sent nothing, one removed is DELETED', () => {
  const changes = changesOf('Card', 4, [
    row(CARDS, 'new', 6, 6),
    row(CARDS, 'blink', 7, 7),
    row(CARDS, 'blink', 8, 7, true),
    row(CARDS, 'held', 9, 1, true),
  ]);
  assert.deepEqual(
    changes.map((c) => [c.name, c.change]),
    [
      ['new', 'ADDED'],
      ['held', 'DELETED'],
    ],
  );
});

test('only a record beside an object moved: the object is MODIFIED, and its own record does not stand in the change', () => {
  const changes = changesOf('Card', 4, [row(TRIES, 'a', 6, 6)]);
  assert.deepEqual(
    changes.map((c) => [c.name, c.change, c.standing]),
    [['a', 'MODIFIED', false]],
  );
});

test('a factory record names every object of its namespace; a library definition names one by its name in every namespace', () => {
  const [hires] = changesOf('Hire', 2, [row('/registry/factories/', 'acme', 5, 1)]);
  assert.deepEqual([hires?.namespace, hires?.name, hires?.change], ['acme', null, 'MODIFIED']);
  const [agent] = changesOf('Agent', 2, [row('/registry/definitions/', '_library/agent/coder', 5, 5)]);
  assert.deepEqual([agent?.namespace, agent?.name, agent?.change], [null, 'coder', 'ADDED']);
  assert.deepEqual(changesOf('Agent', 2, [row('/registry/definitions/', '_library/skill/coder', 5, 5)]), [], 'a skill is no agent');
});

test('an object is at the highest revision of the records that name it, none of another, and none where none does', () => {
  const held = new Map([
    [
      '/registry/factories/',
      new Map([
        ['/registry/factories/acme', 7],
        ['/registry/factories/other', 3],
      ]),
    ],
    ['/registry/definitions/', new Map([['/registry/definitions/acme/workflow/build', 9]])],
  ]);
  const of = revisionTable('Hire', held);
  assert.equal(of('acme', 'build.code'), 9);
  assert.equal(of('other', 'build.code'), 3);
  assert.equal(of('nowhere', 'x'), 0);
  assert.equal(of(undefined, 'x'), 0);
});

test('a library agent is at its record in every namespace; a factory-tree one in its own', () => {
  const held = new Map([
    [
      '/registry/definitions/',
      new Map([
        ['/registry/definitions/_library/agent/coder', 4],
        ['/registry/definitions/acme/agent/coder', 8],
        ['/registry/definitions/acme/agent/odd%2Fname', 6],
      ]),
    ],
  ]);
  const of = revisionTable('Agent', held);
  assert.equal(of('acme', 'coder'), 8);
  assert.equal(of('other', 'coder'), 4);
  assert.equal(of(undefined, 'coder'), 4);
  assert.equal(of('acme', 'odd/name'), 6);
});

test('every watched kind is made of some record', () => {
  for (const kind of WATCHED_KIND_NAMES) assert.ok(WATCHED_KINDS[kind].length > 0, kind);
});
