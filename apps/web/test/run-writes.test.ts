/**
 * A write that changes a run (src/lib/runWrites.ts): it reads the frame's light answer again at once, and no component that makes such a
 * write invalidates the whole list by hand, which would leave the frame to the feed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { openRunsQuery } from '../src/lib/api/runs.ts';
import { runsMoved } from '../src/lib/runWrites.ts';
import { bell, until, WAITED } from './waits.ts';

const COMPONENTS = path.resolve(import.meta.dirname, '../src/components');

/** The components that make a write that changes a run. */
const WRITES = ['Ask.tsx', 'Gate.tsx', 'HoldRun.tsx', 'LiftHold.tsx', 'PruneRun.tsx', 'RemoveRun.tsx', 'StartRun.tsx', 'TryAgent.tsx'];

/** Whether `text` invalidates the whole list of the runs by its bare key, in place of `runsMoved`. */
const byHand = (text: string): boolean => /queryKey:\s*\[\s*'runs'\s*\]/.test(text);

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
  const others = fs
    .readdirSync(COMPONENTS, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && byHand(fs.readFileSync(path.join(COMPONENTS, file), 'utf8')));
  assert.equal(others.length, 0, `${others.join(', ')} invalidate ['runs'] by hand: call runsMoved`);
});

test("REFUSED: a hand-written invalidation of the whole list is found, across a line break too; a run's own record is not", () => {
  assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });"), true);
  assert.equal(byHand("queryClient.invalidateQueries({\n  queryKey:\n    ['runs'],\n});"), true);
  assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });"), false);
});
