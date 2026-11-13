/**
 * A write that changes a run (src/lib/runWrites.ts): it reads the frame's RunList again at once, and the run's own record with it in the
 * one call, and no file that makes such a write invalidates the whole list or a run's record by hand, which would leave the frame to the
 * feed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { MutationObserver, QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import { finishedRunsQuery, openRunsQuery } from '../src/lib/api/runs.ts';
import { runsMoved } from '../src/lib/runWrites.ts';
import { bell, until, WAITED } from './waits.ts';
import { runList } from './run-fixtures.ts';

const SRC = path.resolve(import.meta.dirname, '../src');
const COMPONENTS = path.join(SRC, 'components');

/** The files that make a write that changes a run, by their path from the source. */
const WRITES = [
  'components/gate/Ask.tsx',
  'lib/useApprove.ts',
  'components/run/HoldRun.tsx',
  'components/run/LiftHold.tsx',
  'components/run/PruneRun.tsx',
  'components/run/RemoveRun.tsx',
  'components/run/StartRun.tsx',
  'components/agent/TryAgent.tsx',
];

/**
 * Every invalidation of one run's own record (`['runs', id]`) written by hand in `text`, across line breaks: `runsMoved` given the run
 * reads it, with the list, so a write that refreshes it by hand is one that forgot the list or calls twice.
 */
const recordByHand = (text: string): number =>
  [...text.matchAll(/invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*'runs'\s*,\s*[^,\]\s]+\s*\]/g)].length;

/** Every source file under `dir` that refreshes a run's record by hand, by its path from `dir`, and how many times. */
const recordByHandIn = (dir: string): Array<{ file: string; times: number }> =>
  fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => ({ file: file.split(path.sep).join('/'), times: recordByHand(fs.readFileSync(path.join(dir, file), 'utf8')) }))
    .filter((found) => found.times > 0);

/**
 * The one write that refreshes a run's record and not the list: words said to a step's session change nothing the list shows at once
 * (`SessionComposer`'s own comment says so).
 */
const RECORD_ALONE = [{ file: 'components/step/session/SessionComposer.tsx', times: 1 }];

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

test("runsMoved: a write that changes a run reads the frame's answer and each page of the finished runs again", async (t) => {
  await t.test('a write that changes a run reads each page of the finished runs again', WAITED, async (t) => {
    const asked: string[] = [];
    const rang = bell();
    const before = globalThis.fetch;
    globalThis.fetch = async (input) => {
      asked.push(String(input));
      rang.ring();
      const metadata = { asOf: '2026-10-12T12:00:00.000Z', counts: { waiting: 0, inFlight: 0, finished: asked.length } };
      return new Response(JSON.stringify(runList([], metadata)), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const client = new QueryClient();
    const page = new QueryObserver(client, finishedRunsQuery('harbour', ['f.a']));
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
    assert.equal(asked.length, 2, 'the write has asked for the page again by the time it is done');
    await until(
      t,
      () => total() === 2,
      () => `the page read again: ${total()}`,
      { bell: seen },
    );
    assert.deepEqual(
      asked.map(decodeURIComponent),
      Array(2).fill('/api/namespaces/harbour/runs?limit=9&continue=f.a&fieldSelector=status.state=finished'),
    );
  });
  await t.test("REFUSED: a write that changes a run reads the frame's answer again at once, a factory's with it", WAITED, async (t) => {
    const asked: string[] = [];
    const rang = bell();
    const before = globalThis.fetch;
    globalThis.fetch = async (input) => {
      asked.push(String(input));
      const waiting = asked.filter((url) => url === String(input)).length === 1 ? 2 : 1;
      rang.ring();
      const metadata = { asOf: '2026-10-12T12:00:00.000Z', counts: { waiting, inFlight: 0, finished: 0 } };
      return new Response(JSON.stringify(runList([], metadata)), { status: 200, headers: { 'content-type': 'application/json' } });
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
    assert.deepEqual(asked.map(decodeURIComponent).sort(), [
      '/api/namespaces/harbour/runs?limit=500&fieldSelector=status.state!=finished',
      '/api/namespaces/harbour/runs?limit=500&fieldSelector=status.state!=finished',
      '/api/runs?limit=500&fieldSelector=status.state!=finished',
      '/api/runs?limit=500&fieldSelector=status.state!=finished',
    ]);
  });
});

test("runsMoved with a run: the run's own record, and its steps' reads, since a write can change a try without moving its step", async () => {
  const subs: QueryKey[] = [
    ['runs', 'a'],
    ['runs', 'a', 'steps', 'plan', 'tries', 's'],
    ['runs', 'a', 'steps', 'plan', 'told', 's'],
  ];
  const seeded: QueryKey[] = [
    ...subs,
    ['runs', 'a', 'lines'],
    ['runs', 'a', 'decision', 's'],
    ['runs', 'b', 'steps', 'plan', 'tries', 's'],
  ];
  const client = new QueryClient();
  for (const key of seeded) client.setQueryData(key, {});
  await runsMoved(client, 'a');
  assert.deepEqual(
    seeded.filter((key) => client.getQueryState(key)?.isInvalidated),
    subs,
    "its record, exactly, and its steps' tries and told at every stamp; never its lines, its decision or another run's",
  );
  client.clear();
});

test('the writes that change a run, in src: none invalidates the whole list by hand', async (t) => {
  await t.test('no write that changes a run invalidates the whole list by hand: each calls runsMoved', () => {
    for (const file of WRITES) {
      const text = fs.readFileSync(path.join(SRC, file), 'utf8');
      assert.ok(text.includes('runsMoved('), `${file} calls runsMoved`);
      assert.equal(byHand(text), false, `${file} invalidates ['runs'] by hand: call runsMoved, which reads the frame's answer too`);
    }
    assert.deepEqual(byHandIn(SRC), [], 'no file spells the key of the whole list, which no page reads: a write calls runsMoved');
  });
  await t.test('REFUSED: the scan reads every folder of the source, not the components alone', () => {
    assert.deepEqual(byHandIn(COMPONENTS), [], 'no component spells the key');
    const planted = scratch('web-run-writes-');
    fs.mkdirSync(path.join(planted, 'lib', 'api'), { recursive: true });
    fs.writeFileSync(path.join(planted, 'lib', 'api', 'runs.ts'), "export const q = { queryKey: ['runs'] };\n");
    assert.deepEqual(
      byHandIn(planted),
      [{ file: 'lib/api/runs.ts', times: 1 }],
      'the scan is not deaf: it finds the key in a folder under lib',
    );
  });
  await t.test(
    "REFUSED: a hand-written invalidation of the whole list is found, across a line break too; a run's own record is not",
    () => {
      assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });"), true);
      assert.equal(byHand("queryClient.invalidateQueries({\n  queryKey:\n    ['runs'],\n});"), true);
      assert.equal(byHand("void queryClient.invalidateQueries({ queryKey: ['runs', runId], exact: true });"), false);
    },
  );
});

test("the writes that change a run, in src: none refreshes a run's record by hand, without the list", async (t) => {
  await t.test("every write that refreshes a run's record does it through runsMoved, in one call, whichever file it is in", () => {
    assert.deepEqual(
      recordByHandIn(SRC),
      RECORD_ALONE,
      "a write that changes a run calls runsMoved(queryClient, id), which reads the run's record and the list: never the record by hand",
    );
  });
  await t.test("REFUSED: a planted write hook that refreshes a run's record alone is found, across a line break too", () => {
    const planted = `export function useNudge(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => nudge(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['runs', runId],
        exact: true,
      });
    },
  });
}`;
    assert.equal(recordByHand(planted), 1);
    assert.equal(recordByHand("void queryClient.invalidateQueries({ queryKey: ['runs', run.id], exact: true });"), 1);
    assert.equal(recordByHand('void runsMoved(queryClient, runId);'), 0, 'the one call is not a hand-written refresh');
    assert.equal(recordByHand("queryClient.invalidateQueries({ queryKey: ['runs'] });"), 0, "the whole list's key is byHand's to find");
  });
});

test("useRound: a round asked for reads the run's record and the run list again, since the api changes what the list shows at once", async (t) => {
  await import('./tsx.ts');
  const { roundAsk } = await import('../src/components/gate/Ask.tsx');
  const before = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = async (input) => {
    sent.push(String(input));
    return new Response(JSON.stringify({ step: 'review', round: 3, file: '/store/runs/r-1.asks/round-review-3' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new QueryClient();
  t.after(() => {
    client.clear();
    globalThis.fetch = before;
  });
  const moved: QueryKey[] = [['runs'], ['runs-open', 'harbour'], ['runs-finished', 'harbour', 'f.a'], ['runs', 'r-1']];
  const kept: QueryKey[] = [
    ['runs', 'r-1', 'decision', 's'],
    ['runs', 'r-2'],
  ];
  for (const key of [...moved, ...kept]) client.setQueryData(key, {});
  const ask = new MutationObserver(
    client,
    roundAsk(client, 'r-1', () => Promise.resolve('harbour')),
  );
  await ask.mutate({ step: 'review', budget: 3 });
  assert.equal(sent.length, 1, 'the round was asked of the api');
  assert.deepEqual(
    [...moved, ...kept].filter((key) => client.getQueryState(key)?.isInvalidated),
    moved,
    "the list, the frame's answer, the finished pages and the run's record; never its decision or another run",
  );
});
