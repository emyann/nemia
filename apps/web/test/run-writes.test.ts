/**
 * A write that changes a run (src/lib/runWrites.ts): it reads the frame's light answer again at once, and no component that makes such a
 * write invalidates the whole list by hand, which would leave the frame to the feed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { finishedRunsQuery, openRunsQuery } from '../src/lib/api/runs.ts';
import { runsMoved } from '../src/lib/runWrites.ts';
import { bell, until, WAITED } from './waits.ts';

const SRC = path.resolve(import.meta.dirname, '../src');
const COMPONENTS = path.join(SRC, 'components');

/** The components that make a write that changes a run. */
const WRITES = ['Ask.tsx', 'Gate.tsx', 'HoldRun.tsx', 'LiftHold.tsx', 'PruneRun.tsx', 'RemoveRun.tsx', 'StartRun.tsx', 'TryAgent.tsx'];

/** Whether `text` invalidates the whole list of the runs by its bare key, in place of `runsMoved`. */
const byHand = (text: string): boolean => /queryKey:\s*\[\s*'runs'\s*\]/.test(text);

/** Every source file under `dir` that spells the bare key of the whole list, by its path from `dir`, and how many times. */
const byHandIn = (dir: string): Array<{ file: string; times: number }> =>
  fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({
      file: file.split(path.sep).join('/'),
      times: [...fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/queryKey:\s*\[\s*'runs'\s*\]/g)].length,
    }))
    .filter((found) => found.times > 0);

test('a write that changes a run reads each page of the finished runs again', WAITED, async (t) => {
  const asked: string[] = [];
  const rang = bell();
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    rang.ring();
    return new Response(JSON.stringify({ total: asked.length, page: 2, size: 9, pages: 1, runs: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new QueryClient();
  const page = new QueryObserver(client, finishedRunsQuery('harbour', 2));
  const seen = bell();
  const stop = page.subscribe(seen.ring);
  t.after(() => {
    stop();
    client.clear();
    globalThis.fetch = before;
  });
  const total = () => page.getCurrentResult().data?.total;
  await until(t, () => total() === 1, 'the first read of the page', { bell: seen });
  await runsMoved(client);
  await until(
    t,
    () => total() === 2,
    () => `the page read again: ${total()}`,
    { bell: seen },
  );
  assert.deepEqual(asked, Array(2).fill('/api/runs-finished?page=2&size=9&ofFactory=harbour'));
});

test("REFUSED: a write that changes a run reads the frame's answer again at once, a factory's with it", WAITED, async (t) => {
  const asked: string[] = [];
  const rang = bell();
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    const waiting = asked.filter((url) => url === String(input)).length === 1 ? 2 : 1;
    rang.ring();
    return new Response(JSON.stringify({ counts: { waiting, inFlight: 0, finished: 0 }, waiting: [], inFlight: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new QueryClient();
  const every = new QueryObserver(client, openRunsQuery());
  const one = new QueryObserver(client, openRunsQuery('harbour'));
  const seen = bell();
  const stops = [every.subscribe(seen.ring), one.subscribe(seen.ring)];
  t.after(() => {
    for (const stop of stops) stop();
    client.clear();
    globalThis.fetch = before;
  });
  const counts = () => [every.getCurrentResult().data?.counts.waiting, one.getCurrentResult().data?.counts.waiting];
  await until(t, () => counts().every((count) => count === 2), 'the first read of each light answer', { bell: seen });
  assert.equal(asked.length, 2);
  await runsMoved(client);
  await until(
    t,
    () => counts().every((count) => count === 1),
    () => `each light answer read again: ${JSON.stringify(counts())}`,
    {
      bell: seen,
    },
  );
  assert.deepEqual([...asked].sort(), [
    '/api/runs-open',
    '/api/runs-open',
    '/api/runs-open?ofFactory=harbour',
    '/api/runs-open?ofFactory=harbour',
  ]);
});

test('no write that changes a run invalidates the whole list by hand: each calls runsMoved', () => {
  for (const file of WRITES) {
    const text = fs.readFileSync(path.join(COMPONENTS, file), 'utf8');
    assert.ok(text.includes('runsMoved('), `${file} calls runsMoved`);
    assert.equal(byHand(text), false, `${file} invalidates ['runs'] by hand: call runsMoved, which reads the frame's answer too`);
  }
  assert.deepEqual(
    byHandIn(SRC),
    [{ file: 'lib/api/runs.ts', times: 1 }],
    "only the query's own definition spells the key of the whole list: a write calls runsMoved",
  );
});

test('REFUSED: the scan reads every folder of the source, not the components alone', () => {
  assert.deepEqual(byHandIn(COMPONENTS), [], 'no component spells the key');
  assert.equal(byHandIn(path.join(SRC, 'lib')).length, 1, "the scan is not deaf: it finds the query's own definition under lib");
});

test("REFUSED: a hand-written invalidation of the whole list is found, across a line break too; a run's own record is not", () => {
  assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });"), true);
  assert.equal(byHand("queryClient.invalidateQueries({\n  queryKey:\n    ['runs'],\n});"), true);
  assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });"), false);
});
