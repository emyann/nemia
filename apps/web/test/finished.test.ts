/**
 * The finished runs a page at a time (src/lib/finished.ts, `finishedRunsQuery` in src/lib/api/runs.ts): the answer decoded as the api
 * gives it, the page kept in the address beside the factory, what Newer and Older lead to, and a page past the last said.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { FINISHED_SIZE, finishedRunsQuery, type FinishedPage } from '../src/lib/api/runs.ts';
import { finishedSearch, newerOf, olderOf, pageAt, pageSaid, pageSearch, pastLast, rowsSaid } from '../src/lib/finished.ts';
import { summary } from './run-fixtures.ts';

/** A finished row as the api answers it: the list's own row with its three facts. */
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  ...summary([['plan', 'verified ✓']], { id, status: 'succeeded', moving: false }),
  wallMs: 1_660_000,
  finishedAt: '2026-09-13T00:27:40.000Z',
  outcome: 'succeeded',
  ...extra,
});

/** One page as `GET /api/runs-finished` answers it, when it was read (`asOf`) included. */
const answer = (extra: Record<string, unknown> = {}) => ({
  asOf: '2026-09-13T01:00:00.000Z',
  total: 634,
  page: 3,
  size: 9,
  pages: 71,
  runs: [row('r-2', { outcome: 'undecided', somethingNew: 1 }), row('r-1')],
  ...extra,
});

/** The board's read of a page of the finished runs, the api answering `value`: the page decoded, or rejected with why it is not read. */
async function read(value: unknown): Promise<FinishedPage> {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = new QueryClient();
  try {
    return await client.fetchQuery(finishedRunsQuery(undefined, 3));
  } finally {
    client.clear();
    globalThis.fetch = before;
  }
}

/** Why `value` is not read as a page, or that it is. */
const refusal = (value: unknown): Promise<string> =>
  read(value).then(
    () => 'decoded',
    (err: Error) => err.message,
  );

test("the finished read decodes the api's answer, when it was read included, and drops a key the board does not know", async () => {
  const page = await read(answer());
  assert.deepEqual([page.total, page.page, page.size, page.pages], [634, 3, 9, 71]);
  assert.deepEqual(
    page.runs.map((run) => [run.id, run.outcome, run.wallMs, run.finishedAt]),
    [
      ['r-2', 'undecided', 1_660_000, '2026-09-13T00:27:40.000Z'],
      ['r-1', 'succeeded', 1_660_000, '2026-09-13T00:27:40.000Z'],
    ],
  );
  assert.equal(page.asOf, '2026-09-13T01:00:00.000Z', 'the instant every time on the page is said against');
  assert.equal('somethingNew' in page.runs[0], false);
  assert.equal(page.runs[0].steps[0].name, 'plan', "a row keeps the list's own keys");
});

test('REFUSED: an outcome the board has no word for, a row that does not say when it finished, and pages that are no number', async () => {
  assert.match(await refusal(answer({ runs: [row('r-1', { outcome: 'shelved' })] })), /outcome/);
  const { finishedAt: _dropped, ...unfinished } = row('r-1');
  assert.match(await refusal(answer({ runs: [unfinished] })), /finishedAt/);
  assert.match(await refusal(answer({ pages: '71' })), /pages/);
  assert.match(await refusal(answer({ asOf: undefined })), /asOf/);
  assert.equal(await refusal(answer()), 'decoded');
});

test('the address round-trips: a page and a factory in, the same out, and the first page is the bare address', () => {
  const at = { factory: 'nemia', page: 3 };
  assert.deepEqual(finishedSearch(at), at);
  assert.deepEqual(finishedSearch(pageSearch(at, 3)), at);
  assert.deepEqual(finishedSearch({ factory: 'nemia', page: '3' }), at, 'a page read off the address as digits');
  assert.deepEqual(pageSearch(at, 1), { factory: 'nemia' });
  assert.deepEqual(pageSearch({}, 1), {}, 'REFUSED: the first page never spells ?page=1');
  assert.deepEqual(finishedSearch(pageSearch({}, 1)), {});
  assert.deepEqual(pageSearch({ factory: 'nemia', tab: 'x' }, 4), { factory: 'nemia', tab: 'x', page: 4 }, 'every other key is kept');
  assert.equal(pageAt(finishedSearch({})), 1);
  assert.equal(pageAt(finishedSearch(at)), 3);
});

test('REFUSED: a page that is no whole number past the first is no page', () => {
  for (const page of [1, 0, -2, 2.5, 'abc', '', '1', '2.5', '-3', null, undefined, [3], Number.NaN]) {
    assert.deepEqual(finishedSearch({ factory: 'nemia', page }), { factory: 'nemia' }, JSON.stringify(page));
  }
});

test('what Newer and Older lead to: none at each end, and from a page past the last, Newer is the last', () => {
  assert.deepEqual([newerOf(1, 3), olderOf(1, 3)], [null, 2]);
  assert.deepEqual([newerOf(2, 3), olderOf(2, 3)], [1, 3]);
  assert.deepEqual([newerOf(3, 3), olderOf(3, 3)], [2, null]);
  assert.deepEqual([newerOf(1, 1), olderOf(1, 1)], [null, null]);
  assert.deepEqual([newerOf(80, 71), olderOf(80, 71)], [71, null]);
});

test('REFUSED: a page past the last is said, not drawn empty', () => {
  const past = { total: 634, page: 80, size: 9, pages: 71 };
  assert.equal(pastLast(past), true);
  assert.equal(pageSaid(past), 'Page 80 is past the last, 71.');
  assert.equal(rowsSaid(past), 'No run on this page, of 634');
  assert.equal(pastLast({ page: 71, pages: 71 }), false);
  assert.equal(pastLast({ page: 1, pages: 1 }), false, 'an empty store has one page, and the first is not past it');
});

test('the pager says the rows a page shows and where it stands', () => {
  assert.equal(rowsSaid({ total: 634, page: 3, size: 9, pages: 71 }), 'Runs 19–27 of 634');
  assert.equal(rowsSaid({ total: 634, page: 71, size: 9, pages: 71 }), 'Runs 631–634 of 634');
  assert.equal(rowsSaid({ total: 0, page: 1, size: 9, pages: 1 }), 'No finished runs');
  assert.equal(pageSaid({ page: 3, pages: 71 }), 'Page 3 / 71');
});

test('the query asks for nine a page, by page and by factory, under a key of its factory and page', async (t) => {
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
  const one = await client.fetchQuery(finishedRunsQuery('harbour', 2));
  await client.fetchQuery(finishedRunsQuery(undefined, 1));
  assert.deepEqual(asked, ['/api/runs-finished?page=2&size=9&ofFactory=harbour', '/api/runs-finished?page=1&size=9']);
  assert.equal(one.runs.length, 2);
  assert.deepEqual(finishedRunsQuery('harbour', 2).queryKey, ['runs-finished', 'harbour', 2]);
  assert.deepEqual(finishedRunsQuery(undefined, 1).queryKey, ['runs-finished', null, 1]);
});
