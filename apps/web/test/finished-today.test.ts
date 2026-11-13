/**
 * The runs finished today, as the Overview's strip reads them (`finishedTodayQuery`, src/lib/api/runs.ts): the finished runs' RunList
 * read page by page from the newest while `readsOnToday` says so (proved by contracts/finished-today.contract.ts), and only today's kept.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { finishedTodayQuery, readsOnToday, type FinishedRun } from '../src/lib/api/runs.ts';
import { detail, runList, runObject } from './run-fixtures.ts';

/** The day the strip counts, from its midnight. */
const DAY_START = Date.parse('2026-09-13T00:00:00.000Z');

/** A finished run whose work stopped at `finishedAt`. */
const finishedRun = (id: string, finishedAt: string) =>
  runObject(detail({ id, status: 'succeeded', moving: false }), { state: 'finished', finishedAt, outcome: 'succeeded' });

/** Each page the api answers, by the `continue` it was asked with ('' for the first), and the URLs it was asked. */
function answering(t: { after: (fn: () => void) => void }, pages: Record<string, unknown>): string[] {
  const asked: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://board');
    asked.push(url.pathname + url.search);
    const body = pages[url.searchParams.get('continue') ?? ''];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  return asked;
}

/** The runs finished since `DAY_START`, read through a client of their own. */
async function readToday(): Promise<FinishedRun[]> {
  const client = new QueryClient();
  try {
    return await client.fetchQuery(finishedTodayQuery(undefined, DAY_START));
  } finally {
    client.clear();
  }
}

test('finishedTodayQuery: reads the finished pages until one reaches into the day before, and keeps only what finished today', async (t) => {
  await t.test('a page holding a run of yesterday is the last read: the third page is never asked', async (tt) => {
    const asked = answering(tt, {
      '': runList([finishedRun('r-5', '2026-09-13T09:00:00.000Z'), finishedRun('r-4', '2026-09-13T08:00:00.000Z')], { continue: 'p2' }),
      p2: runList([finishedRun('r-3', '2026-09-13T01:00:00.000Z'), finishedRun('r-2', '2026-09-12T23:00:00.000Z')], { continue: 'p3' }),
      p3: runList([finishedRun('r-1', '2026-09-12T20:00:00.000Z')]),
    });
    const runs = await readToday();
    assert.deepEqual(
      runs.map((run) => run.id),
      ['r-5', 'r-4', 'r-3'],
    );
    assert.equal(asked.length, 2, `two pages asked, not ${asked.length}: ${asked.join(', ')}`);
    for (const url of asked) assert.match(decodeURIComponent(url), /fieldSelector=status\.state=finished/);
    assert.match(asked[1], /continue=p2/);
  });
  await t.test('REFUSED: a page with no run ends the read though it answers a token', async (tt) => {
    const asked = answering(tt, { '': runList([], { continue: 'again' }), again: runList([], { continue: 'again' }) });
    assert.equal((await readToday()).length, 0);
    assert.equal(asked.length, 1);
  });
  await t.test('a run that finished at the very instant the day began is today\'s: kept, and the read goes on past it', async (tt) => {
    assert.equal(readsOnToday({ finishedMs: [DAY_START], next: true }, DAY_START), true);
    answering(tt, { '': runList([finishedRun('r-1', new Date(DAY_START).toISOString())]) });
    assert.deepEqual(
      (await readToday()).map((run) => run.id),
      ['r-1'],
    );
  });
});
