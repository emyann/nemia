/**
 * What the inbox's search bar offers and keeps (src/lib/searchBar.ts) beyond what its two contracts prove: the offers a typed key narrows
 * to, the chips an address makes, the one text a filter set is kept as, a picked state's side, and the line that says where else a
 * search matches. `npm run e2e` looks at the bar itself.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { barChips, barOffers, elsewhereLine, keptRecent, pickedPhase, recentOf, searchKeys, viewOfRecent } from '../src/lib/searchBar.ts';

const counts = { notStarted: 1, blocked: 0, waiting: 2, working: 3, done: 4, failed: 0, cancelled: 0 };
const labels = [
  { key: 'area', value: 'board', cards: 3 },
  { key: 'area', value: 'runtime', cards: 2 },
  { key: 'work', value: 'fix', cards: 1 },
  { key: 'factory', value: 'nemia', cards: 5 },
  { key: 'workflow', value: 'build', cards: 5 },
];
const keys = searchKeys(labels, counts);

describe('searchKeys', () => {
  test('each key offers the values its cards hold, with their counts, in the api\'s order', () => {
    assert.deepEqual(
      keys.map((one) => one.key),
      ['area', 'work', 'factory', 'workflow', 'state'],
    );
    assert.deepEqual(keys[0]?.values, [
      { value: 'board', cards: 3 },
      { value: 'runtime', cards: 2 },
    ]);
    assert.deepEqual(keys[2]?.values, [{ value: 'nemia', cards: 5 }]);
  });
  test('state offers every phase with its count', () => {
    assert.equal(keys.at(-1)?.values.length, 7);
    assert.deepEqual(keys.at(-1)?.values.find((value) => value.value === 'working'), { value: 'working', cards: 3 });
  });
  test('a factory whose cards hold no label offers exactly the three', () => {
    assert.deepEqual(
      searchKeys([], counts).map((one) => one.key),
      ['factory', 'workflow', 'state'],
    );
  });
});

describe('barOffers', () => {
  test('a key and a colon offers only that key', () => {
    assert.deepEqual(
      barOffers(keys, 'area:', []).map((o) => o.key),
      ['area', 'area'],
    );
  });
  test('words match key=value, and a state matches by its phase', () => {
    assert.deepEqual(
      barOffers(keys, 'state:wa', []).map((o) => `${o.key}=${o.value}`),
      ['state=waiting'],
    );
    assert.equal(barOffers(keys, 'boa', []).length, 1);
  });
  test('a picked filter is not offered again, and one state at a time', () => {
    assert.equal(barOffers(keys, 'board', ['area=board']).length, 0);
    assert.equal(barOffers(keys, 'state:', ['state=working']).length, 0);
  });
  test('an unknown key offers nothing', () => {
    assert.equal(barOffers(keys, 'nope:', []).length, 0);
  });
});

describe('the chips of a view', () => {
  test('words, labels and a state, each by its id', () => {
    const chips = barChips({ search: 'landing', l: 'area=board,factory=nemia', phase: 'blocked' });
    assert.deepEqual(
      chips.map((c) => c.id),
      ['q', 'area=board', 'factory=nemia', 'state=blocked'],
    );
    assert.equal(chips[1]?.label, 'area: board');
  });
  test('no filter is no chip', () => {
    assert.equal(barChips({}).length, 0);
  });
});

describe('Recent', () => {
  test('a view is kept as one text and read back', () => {
    const view = { search: 'a b', l: 'area=board', cards: 'closed' as const, phase: 'done' as const };
    assert.deepEqual(viewOfRecent(recentOf(view)), view);
  });
  test('the same filters in any key order are one text', () => {
    assert.equal(recentOf({ phase: 'working', search: 'x' }), recentOf({ search: 'x', phase: 'working' }));
  });
  test('no filter is the empty text', () => {
    assert.equal(recentOf({}), '');
  });
});

describe('keptRecent', () => {
  test('the set used goes first and older sets keep their order', () => {
    assert.deepEqual(keptRecent(['b', 'c', 'd'], 'a'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(keptRecent(['b', 'c', 'd'], 'c'), ['c', 'b', 'd']);
  });
  test('five are kept, the oldest let go', () => {
    assert.deepEqual(keptRecent(['b', 'c', 'd', 'e', 'f'], 'a'), ['a', 'b', 'c', 'd', 'e']);
  });
});

describe('pickedPhase', () => {
  test('a closed phase switches to the Closed side', () => {
    assert.deepEqual(pickedPhase('done'), { phase: 'done', cards: 'closed' });
    assert.deepEqual(pickedPhase('working'), { phase: 'working', cards: undefined });
  });
});

describe('elsewhereLine', () => {
  test('one card of one factory', () => {
    assert.equal(elsewhereLine({ total: 1, factories: ['nemia'] }, 'open'), 'One open card of nemia does.');
  });
  test('several cards of one factory', () => {
    assert.equal(elsewhereLine({ total: 3, factories: ['nemia', 'nemia', 'nemia'] }, 'closed'), '3 closed cards of nemia do.');
  });
  test('cards of two factories', () => {
    assert.equal(elsewhereLine({ total: 2, factories: ['nemia', 'tsverify'] }, 'open'), '2 open cards of nemia and tsverify do.');
  });
  test('more cards than the read named', () => {
    assert.equal(elsewhereLine({ total: 9, factories: ['a', 'b', 'c', 'd', 'e'] }, 'open'), '9 open cards of other factories do.');
  });
  test('none says nothing', () => {
    assert.equal(elsewhereLine({ total: 0, factories: [] }, 'open'), null);
  });
});
