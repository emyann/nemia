/**
 * The finished runs' page as a list asked by `status.state=finished` cuts it (`finishedPageOf`, run-list.ts): what the laws of
 * `finishedBefore` (contracts/finished-order.contract.ts) leave to the door — the `continue` token, `f.` and the base64url of the
 * `finishedAt` and the name of the last run a page answered, read back to them and refused `Invalid` where it is no such token, a
 * name-order token included and the other way round; and where a page starts when the run the token names is gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Invalid } from '../refusal/refusal.ts';
import { continueToken, continuedAfter, pageOf } from '../object/page.ts';
import { byFinishedPlace, finishedAfter, finishedPageOf, finishedToken, type Finished } from './run-list.ts';

/** A finished run's place: its name and when its work stopped, `m` minutes into the fixtures' hour. */
const run = (name: string, m: number): Finished => ({ name, finishedAt: new Date(Date.UTC(2026, 10, 5, 10, m)).toISOString() });

/** The runs in the finished order, newest first, two together by name as `<` compares them. */
const ordered = (runs: readonly Finished[]): Finished[] => [...runs].sort(byFinishedPlace);

/** What an answer holds, failing the test where it is a refusal. */
const ok = <A>(answer: A | Invalid): A => {
  if (answer instanceof Invalid) assert.fail(`refused ${answer._tag}`);
  return answer;
};

/** Every page of `sorted` walked by `limit`, each page's names, with `between` run on the list before each next page. */
const walk = (sorted: Finished[], limit: number, between: (list: Finished[]) => Finished[] = (l) => l): string[][] => {
  const pages: string[][] = [];
  let list = sorted;
  let token: string | undefined;
  do {
    const cut = ok(finishedPageOf(list, { limit, continue: token }));
    pages.push(cut.items.map((r) => r.name));
    token = cut.continue;
    list = between(list);
  } while (token !== undefined && pages.length < 20);
  return pages;
};

/** Five finished runs: two stopped together at 10:30, named `B` and `a`, where `<` and `localeCompare` disagree. */
const RUNS = ordered([run('r-old', 5), run('a', 30), run('B', 30), run('r-new', 50), run('r-mid', 20)]);

test('the finished order is newest first, and two that stopped together come by name as `<` compares them: B before a', () => {
  assert.deepEqual(
    RUNS.map((r) => r.name),
    ['r-new', 'B', 'a', 'r-mid', 'r-old'],
  );
  assert.ok('B'.localeCompare('a') > 0, 'localeCompare would put a first: the order is not its');
});

test('a finished token reads back to the finishedAt and the name it was made of', () => {
  for (const one of [run('a', 1), run('é/ü?+=', 59)]) {
    const token = finishedToken(one);
    assert.match(token, /^f\.[A-Za-z0-9_-]+$/);
    assert.deepEqual(ok(finishedAfter(token)), one);
  }
});

test('successive pages of the finished runs concatenate to the whole order, no run twice and none skipped', () => {
  for (const limit of [1, 2, 3, 5, 9])
    assert.deepEqual(
      walk(RUNS, limit).flat(),
      RUNS.map((r) => r.name),
      `limit ${limit}`,
    );
  assert.deepEqual(walk(RUNS, 2), [['r-new', 'B'], ['a', 'r-mid'], ['r-old']]);
});

test('a run removed after its page was answered skips none of the runs after it', () => {
  const pages = walk(RUNS, 2, (list) => list.filter((r) => r.name !== 'B'));
  assert.deepEqual(pages, [['r-new', 'B'], ['a', 'r-mid'], ['r-old']]);
});

test('the last page says nothing remains and gives no continue; a page says how many runs are after it', () => {
  const first = ok(finishedPageOf(RUNS, { limit: 2 }));
  assert.equal(first.remainingItemCount, 3);
  const last = ok(finishedPageOf(RUNS, { limit: 9 }));
  assert.equal(last.remainingItemCount, 0);
  assert.equal(last.continue, undefined);
});

test('REFUSED Invalid: a name-order token on the finished order, a finished token on the name order, and a token that is none', () => {
  const nameToken = continueToken('r-mid');
  const finished = finishedToken(run('r-mid', 20));
  assert.ok(finishedAfter(nameToken) instanceof Invalid, 'a name token on the finished order');
  assert.ok(finishedPageOf(RUNS, { limit: 2, continue: nameToken }) instanceof Invalid);
  assert.ok(continuedAfter(finished) instanceof Invalid, 'a finished token on the name order');
  assert.ok(pageOf(['a', 'b'], (n) => n, { limit: 1, continue: finished }) instanceof Invalid);
  for (const bad of ['f.', 'f.!!', `f.${Buffer.from('[1,2]').toString('base64url')}`, `f.${Buffer.from('["x"]').toString('base64url')}`])
    assert.ok(finishedAfter(bad) instanceof Invalid, bad);
  assert.ok(finishedPageOf(RUNS, { limit: 0 }) instanceof Invalid, 'a limit that is no whole number from 1');
});
