/**
 * The finished runs a page at a time (src/lib/finished.ts, `finishedRunsQuery` in src/lib/api/runs.ts): the RunList asked by state read
 * as a page, the trail of tokens kept in the address beside the factory, what Newer and Older lead to, and a token past the last said.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { FINISHED_SIZE, finishedRunsQuery, type FinishedPage } from '../src/lib/api/runs.ts';
import { finishedSearch, newerOf, olderTrailOf, pageSaid, pastLast, rowsSaid, trailOf, trailSearch } from '../src/lib/finished.ts';
import { detail, runList, runObject } from './run-fixtures.ts';

/** Where a finished run's wall time went, as the api answers it: five parts that add up to its `wallMs`. */
const CLOCK = { wallMs: 1_660_000, sessionsMs: 1_200_000, checksMs: 300_000, personMs: 100_000, slotMs: 60_000, restMs: 0 };

/** A finished run as the list asked `status.state=finished` carries it: its object, with its finish, its outcome and its clock. */
const finishedRun = (id: string, outcome: 'succeeded' | 'undecided' = 'succeeded') =>
  runObject(detail({ id, status: 'succeeded', moving: false }), {
    state: 'finished',
    wallMs: 1_660_000,
    clock: CLOCK,
    stepCosts: null,
    waitingSince: null,
    finishedAt: '2026-09-13T00:27:40.000Z',
    outcome,
  });

/** One page as `GET /api/runs?fieldSelector=status.state=finished&limit=9` answers it: its counts, `asOf` and the next token. */
const answer = (next: string | null = 'f.next') =>
  runList([finishedRun('r-2', 'undecided'), finishedRun('r-1')], {
    asOf: '2026-09-13T01:00:00.000Z',
    counts: { waiting: 1, inFlight: 2, finished: 634 },
    ...(next === null ? {} : { continue: next }),
  });

/** The board's read of a page of the finished runs from the token `from`, the api answering `value`. */
async function read(value: unknown, older: string[] = []): Promise<FinishedPage> {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = new QueryClient();
  try {
    return await client.fetchQuery(finishedRunsQuery(undefined, older));
  } finally {
    client.clear();
    globalThis.fetch = before;
  }
}

test('finishedSearch, trailOf, newerOf, olderTrailOf, pageSaid and rowsSaid: the finished pager by its trail', async (t) => {
  await t.test('the address round-trips: a trail and a factory in, the same out, and the first page is the bare address', () => {
    assert.equal(finishedSearch({ older: 'bogus' }).older, undefined, 'a trail that is no token reads as the first page');
    assert.equal(finishedSearch({ older: 'f.a~bogus' }).older, undefined, 'and so does one a piece of which is none');
    const at = { factory: 'nemia', older: 'f.a~f.b' };
    assert.deepEqual(finishedSearch(at), at);
    assert.deepEqual(trailOf(finishedSearch(at)), ['f.a', 'f.b']);
    assert.deepEqual(finishedSearch(trailSearch(at, ['f.a', 'f.b'])), at);
    assert.deepEqual(trailSearch(at, []), { factory: 'nemia' });
    assert.deepEqual(trailSearch({}, []), {}, 'REFUSED: the first page never spells an empty trail');
    assert.deepEqual(trailSearch({ factory: 'nemia', tab: 'x' }, ['f.a']), { factory: 'nemia', tab: 'x', older: 'f.a' }, 'every key kept');
    assert.deepEqual(trailOf(finishedSearch({})), []);
  });
  await t.test('REFUSED: a trail that is no string of tokens, or holds an empty one, is no trail', () => {
    for (const older of ['', '~', 'f.a~', '~f.a', 'f.a~~f.b', 3, null, undefined, ['f.a']]) {
      assert.deepEqual(finishedSearch({ factory: 'nemia', older }), { factory: 'nemia' }, JSON.stringify(older));
    }
  });
  await t.test("Older puts the page's continue on the trail, Newer takes the last off: none at each end", () => {
    const first = { trail: [], next: 'f.a', count: 9 };
    assert.deepEqual([newerOf(first), olderTrailOf(first)], [null, ['f.a']]);
    const second = { trail: ['f.a'], next: 'f.b', count: 9 };
    assert.deepEqual([newerOf(second), olderTrailOf(second)], [[], ['f.a', 'f.b']]);
    const last = { trail: ['f.a', 'f.b'], next: null, count: 7 };
    assert.deepEqual([newerOf(last), olderTrailOf(last)], [['f.a'], null]);
    const only = { trail: [], next: null, count: 3 };
    assert.deepEqual([newerOf(only), olderTrailOf(only)], [null, null]);
  });
  await t.test('a token past the last gives a page of no row: said so, Newer pops it, and Older leads nowhere', () => {
    const past = { trail: ['f.a', 'f.gone'], next: null, count: 0, total: 25, size: 9 };
    assert.equal(pastLast(past), true);
    assert.equal(pageSaid(past), 'Page 3 is past the last, 3.');
    assert.equal(rowsSaid(past), 'No run on this page, of 25');
    assert.deepEqual([newerOf(past), olderTrailOf({ ...past, next: 'f.x' })], [['f.a'], null]);
    assert.equal(pastLast({ trail: [], count: 0 }), false, 'an empty store has one page, and the first is not past it');
  });
  await t.test('the rows of a page and where it stands, from the total, the trail and its count', () => {
    assert.equal(rowsSaid({ trail: ['f.a'], next: 'f.b', count: 9, total: 30, size: 9 }), 'Runs 10–18 of 30');
    assert.equal(rowsSaid({ trail: ['f.a', 'f.b', 'f.c'], next: null, count: 3, total: 30, size: 9 }), 'Runs 28–30 of 30');
    assert.equal(rowsSaid({ trail: [], next: null, count: 0, total: 0, size: 9 }), 'No finished runs');
    assert.equal(pageSaid({ trail: ['f.a'], next: 'f.b', count: 9, total: 30, size: 9 }), 'Page 2 / 4');
    assert.equal(pageSaid({ trail: [], next: null, count: 0, total: 0, size: 9 }), 'Page 1 / 1');
  });
});

test('finishedRunsQuery: the RunList asked by state read as a page, nine at a time, from the last token of the trail', async (t) => {
  await t.test("each row the run's with its finish, outcome and clock; the total the list's count, and its next token", async () => {
    const page = await read(answer());
    assert.equal(page.total, 634);
    assert.equal(page.continue, 'f.next');
    assert.deepEqual(
      page.runs.map((run) => [run.id, run.outcome, run.wallMs, run.finishedAt]),
      [
        ['r-2', 'undecided', 1_660_000, '2026-09-13T00:27:40.000Z'],
        ['r-1', 'succeeded', 1_660_000, '2026-09-13T00:27:40.000Z'],
      ],
    );
    assert.equal(page.asOf, '2026-09-13T01:00:00.000Z', 'the instant every time on the page is said against');
    assert.deepEqual(page.runs[0].clock, CLOCK, 'a row carries the clock its cell breaks down');
    assert.equal((await read(answer(null))).continue, null, 'the last page has no next');
  });
  await t.test('REFUSED: an outcome the board has no word for', async () => {
    const shelved = answer();
    (shelved.items[0].status as { outcome: string }).outcome = 'shelved';
    await assert.rejects(read(shelved), /outcome/);
  });
  await t.test('the query asks the finished state nine a page, by factory and token, under a key of its factory and token', async (t) => {
    const asked: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = async (input) => {
      asked.push(String(input));
      return new Response(JSON.stringify(answer()), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new QueryClient();
    t.after(() => {
      client.clear();
      globalThis.fetch = before;
    });
    assert.equal(FINISHED_SIZE, 9);
    await client.fetchQuery(finishedRunsQuery('harbour', ['f.a', 'f.b']));
    await client.fetchQuery(finishedRunsQuery(undefined, []));
    const urls = asked.map((at) => new URL(at, 'http://board'));
    assert.deepEqual(
      urls.map((url) => [url.pathname, Object.fromEntries(url.searchParams)]),
      [
        ['/api/namespaces/harbour/runs', { fieldSelector: 'status.state=finished', limit: '9', continue: 'f.b' }],
        ['/api/runs', { fieldSelector: 'status.state=finished', limit: '9' }],
      ],
    );
    assert.deepEqual(finishedRunsQuery('harbour', ['f.a', 'f.b']).queryKey, ['runs-finished', 'harbour', 'f.b']);
    assert.deepEqual(finishedRunsQuery(undefined, []).queryKey, ['runs-finished', null, null]);
  });
});
