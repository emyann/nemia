/**
 * What a picker offers past the open runs (`finishedPagesQuery`, src/lib/api/runs.ts, read by `usePickerRuns`): the finished runs a page
 * at a time, each page asked from the token the one before it answered, so a finished run on any page can still be picked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { finishedPagesQuery } from '../src/lib/api/runs.ts';
import { detail, runList, runObject } from './run-fixtures.ts';

/** A finished run whose work stopped at `finishedAt`. */
const finishedRun = (id: string, finishedAt: string) =>
  runObject(detail({ id, status: 'succeeded', moving: false }), { state: 'finished', finishedAt, outcome: 'succeeded' });

test('finishedPagesQuery: a finished run only the second page holds is offered once the next page is asked', async (t) => {
  const asked: URL[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://board');
    asked.push(url);
    const body =
      url.searchParams.get('continue') === 'p2'
        ? runList([finishedRun('r-old', '2026-01-01T00:00:00.000Z')])
        : runList([finishedRun('r-new', '2026-09-13T00:00:00.000Z')], { continue: 'p2' });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = new QueryClient();
  t.after(() => {
    client.clear();
    globalThis.fetch = before;
  });
  const first = await client.fetchInfiniteQuery(finishedPagesQuery());
  assert.deepEqual(
    first.pages.flatMap((page) => page.runs.map((run) => run.id)),
    ['r-new'],
  );
  const both = await client.fetchInfiniteQuery({ ...finishedPagesQuery(), pages: 2 });
  assert.deepEqual(
    both.pages.flatMap((page) => page.runs.map((run) => run.id)),
    ['r-new', 'r-old'],
    'the run of page 2 is offered',
  );
  assert.equal(asked.at(-1)?.searchParams.get('continue'), 'p2', "the second page is asked from the first page's token");
  for (const url of asked) assert.equal(url.searchParams.get('fieldSelector'), 'status.state=finished', `${url} asks by state`);
});
