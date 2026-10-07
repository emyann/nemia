/**
 * How the e2e splits its pages between workers (e2e/workers.ts): every page visited once, each worker's in the pages' order, never an
 * empty worker; how many workers a machine takes, each bound proven by a machine where it alone binds; and the refusal of two workers
 * that share a store, an api port or an app, made to refuse. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apart, PER_WORKER_BYTES, shard, workersFor, type Seat } from './e2e/workers.ts';

const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

test('seven pages over three workers go round in turn, each worker keeping the order of the pages', () => {
  assert.deepEqual(shard(SEVEN, 3), [
    ['a', 'd', 'g'],
    ['b', 'e'],
    ['c', 'f'],
  ]);
});

test('every page is visited once, by one worker, whatever the number of workers', () => {
  for (const n of [1, 2, 3, 6, 7]) {
    const shards = shard(SEVEN, n);
    assert.equal(shards.length, n);
    assert.deepEqual(shards.flat().sort(), [...SEVEN], `${n} workers`);
  }
});

test("a worker's pages keep the order they are given, which is the pages' order, not their names'", () => {
  assert.deepEqual(shard(['z', 'y', 'x', 'w'], 2), [
    ['z', 'x'],
    ['y', 'w'],
  ]);
});

test('no worker is empty: more workers than pages are cut to the pages, and no page still makes one worker', () => {
  assert.deepEqual(shard(['a', 'b'], 5), [['a'], ['b']]);
  assert.deepEqual(shard([], 3), [[]]);
});

/** A machine where no bound but the one a test names binds. */
const ROOMY = { cores: 64, freeBytes: 64 * PER_WORKER_BYTES, pages: 100 };

test('half the cores bind the workers on a machine with memory and pages to spare', () => {
  assert.equal(workersFor({ ...ROOMY, cores: 12 }), 6);
  assert.equal(workersFor({ ...ROOMY, cores: 5 }), 2);
});

test('free memory binds them on a machine with cores to spare', () => {
  assert.equal(workersFor({ ...ROOMY, freeBytes: 3 * PER_WORKER_BYTES + 1 }), 3);
  assert.equal(workersFor({ ...ROOMY, freeBytes: 3 * PER_WORKER_BYTES - 1 }), 2);
});

test('the pages bind them when there are fewer pages than either', () => {
  assert.equal(workersFor({ ...ROOMY, pages: 4 }), 4);
});

test('at least one worker, on a machine with one core or no free memory', () => {
  assert.equal(workersFor({ ...ROOMY, cores: 1 }), 1);
  assert.equal(workersFor({ ...ROOMY, freeBytes: 0 }), 1);
});

test('a number asked for wins over the machine, cut to the pages', () => {
  assert.equal(workersFor({ ...ROOMY, cores: 2, freeBytes: 0, asked: 5 }), 5);
  assert.equal(workersFor({ ...ROOMY, pages: 3, asked: 5 }), 3);
});

/** Two workers apart in everything. */
const TWO: Seat[] = [
  { worker: 0, store: '/tmp/nemia-e2e-a', apiPort: '41001', base: 'http://127.0.0.1:42001' },
  { worker: 1, store: '/tmp/nemia-e2e-b', apiPort: '41002', base: 'http://127.0.0.1:42002' },
];

const refusal = (what: string, value: string) => (err: Error) =>
  new RegExp(`^workers 0 and 1 share one ${what}, ${value.replace(/[.]/g, '\\.')}: each worker seeds a store of its own`).test(err.message);

test('workers apart in store, api and app pass', () => {
  apart(TWO);
  apart(TWO.map(({ worker, store }) => ({ worker, store })));
});

test('REFUSED: two workers that point at one store, naming both and the store', () => {
  assert.throws(() => apart([TWO[0], { ...TWO[1], store: '/tmp/nemia-e2e-a' }]), refusal('store', '/tmp/nemia-e2e-a'));
  assert.throws(
    () =>
      apart([
        { worker: 0, store: '/tmp/nemia-e2e-a' },
        { worker: 1, store: '/tmp/x/../nemia-e2e-a/' },
      ]),
    refusal('store', '/tmp/nemia-e2e-a'),
    'the same store spelled two ways',
  );
});

test('REFUSED: two workers that point at one api', () => {
  assert.throws(() => apart([TWO[0], { ...TWO[1], apiPort: '41001' }]), refusal('api port', '41001'));
});

test('REFUSED: two workers that point at one app', () => {
  assert.throws(() => apart([TWO[0], { ...TWO[1], base: 'http://127.0.0.1:42001' }]), refusal('app', 'http://127.0.0.1:42001'));
});
