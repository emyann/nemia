/**
 * The runs in two reads over HTTP (`GET /api/runs-open`, `GET /api/runs-finished`), beside the whole list (`GET /api/runs`): together
 * they answer every run the whole list answers, once, each row the whole list's own with the address of its workflow's page; `?ofFactory=`
 * keeps one factory's; and a page asked wrongly is a 422 naming the field and what it was given.
 *
 * On the stand-ins: the runtime's test engine, each task filed and moved by hand (`engine().settle`), and the test place, under
 * the run records this file seeds. One story, so its checkpoints read one engine, one app and the runs it seeded in turn.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { FinishedListing, OpenListing, RunListing } from './runs.ts';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';
import { names } from '../../test/named.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

/** An instant `m` minutes into the fixtures' hour. */
const at = (m: number) => new Date(Date.UTC(2026, 9, 4, 10, m)).toISOString();

const DONE = { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Could not.', needs: 'a key', artifacts: [] };

/** A task on the engine, at work from `from`, and signed `closeout` at `to` where one is given. */
function journalled(taskId: string, from: string, end?: { to: string; closeout: typeof DONE | typeof BLOCKED }): void {
  Effect.runSync(engine().file({ id: taskId, brief: 'Write it.', cwd: root, harness: 'codex' }));
  const begun = { startedAt: from, spawnedAt: from };
  if (!end) standIn().settle(taskId, 'running (working)', begun);
  else
    standIn().settle(taskId, end.closeout.outcome === 'done' ? 'succeeded' : 'failed', {
      ...begun,
      endedAt: end.to,
      exitCode: 0,
      closeout: end.closeout,
    });
}

/** A folder run of one step, created at `created`, of `factory` where one is named. */
function aRun(id: string, created: string, factory?: string): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      place: { kind: 'folder' },
      workspace: path.join(root, 'runs', id, 'work'),
      brief: `List ${id}.`,
      createdAt: created,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'codex', workspace: 'folder' }],
      steps: { write: { taskId: `${id}-write` } },
      ...(factory ? { factory } : {}),
    }),
  );
}

/** A run whose step signed off done at minute `to`: finished. */
const finished = (id: string, created: number, to: number, factory?: string) => {
  journalled(`${id}-write`, at(created), { to: at(to), closeout: DONE });
  aRun(id, at(created), factory);
};

beforeEachTest(() => {
  finished('l-first', 0, 50, 'nemia');
  finished('l-second', 5, 20);
  finished('l-third', 10, 30, 'nemia');
  finished('l-fourth', 15, 40);
  finished('l-fifth', 16, 45, 'pipao');
  journalled('l-asks-write', at(20), { to: at(25), closeout: BLOCKED });
  aRun('l-asks', at(20), 'nemia');
  journalled('l-moves-write', at(30));
  aRun('l-moves', at(30));
});

const read = async <T>(address: string): Promise<T> => {
  const res = await app().request(address);
  assert.equal(res.status, 200, `${address}: ${await res.clone().text()}`);
  return (await res.json()) as T;
};

/** Every finished page of `query`, two rows a page. */
const everyPage = async (query = ''): Promise<FinishedListing[]> => {
  const first = await read<FinishedListing>(`/api/runs-finished?size=2&page=1${query}`);
  const rest: FinishedListing[] = [];
  for (let page = 2; page <= first.pages; page++) rest.push(await read<FinishedListing>(`/api/runs-finished?size=2&page=${page}${query}`));
  return [first, ...rest];
};

/** A row of either read as the whole list answers the run: without what the two reads add. */
const listingOf = (row: object): object => {
  const {
    wallMs: _w,
    finishedAt: _f,
    outcome: _o,
    clock: _c,
    stepCosts: _s,
    waitingSince: _p,
    ...listing
  } = row as Record<string, unknown>;
  return listing;
};

test("the runs read in two halves answer the whole list: open and finished, a factory's own, a page at a time", async (t) => {
  const s = story(t);
  await s.test(
    'the two reads answer every run of the whole list, once, each row its own with its workflow page; the counts add up',
    async () => {
      const whole = await read<RunListing[]>('/api/runs');
      const open = await read<OpenListing>('/api/runs-open');
      const pages = await everyPage();
      assert.deepEqual(
        [open.waiting.map((run) => run.id), open.inFlight.map((run) => run.id)],
        [['l-asks'], ['l-moves']],
        'a blocked sign-off waits on a person; a session at work is in flight',
      );
      assert.deepEqual(open.counts, { waiting: 1, inFlight: 1, finished: 5 });
      assert.deepEqual(
        pages.map((page) => page.runs.map((run) => run.id)),
        [['l-first', 'l-fifth'], ['l-fourth', 'l-third'], ['l-second']],
        'newest first by when their work stopped, which is not the order they were created in',
      );
      assert.deepEqual([pages[0].total, pages[0].pages, pages[0].size], [5, 3, 2]);
      const rows = [...open.waiting, ...open.inFlight, ...pages.flatMap((page) => page.runs)];
      assert.equal(rows.length, whole.length);
      assert.equal(open.counts.waiting + open.counts.inFlight + open.counts.finished, whole.length);
      for (const row of rows) {
        assert.ok('workflowPage' in row, `${row.id} carries the address of its workflow's page`);
        assert.deepEqual(
          listingOf(row),
          whole.find((run) => run.id === row.id),
          row.id,
        );
      }
      assert.deepEqual(
        pages[0].runs.map((run) => [run.finishedAt, run.wallMs, run.outcome]),
        [
          [at(50), 50 * 60_000, 'succeeded'],
          [at(45), 29 * 60_000, 'succeeded'],
        ],
      );
    },
  );
  await s.test(
    'every row of both reads carries a clock whose parts add up to its wall time; the costs and the wait are the waiting row’s alone',
    async () => {
      const open = await read<OpenListing>('/api/runs-open');
      const [row] = open.waiting;
      assert.deepEqual(row.stepCosts, [{ step: 'write', cost: null }], 'a session that measured no cost cost nothing known');
      assert.ok(row.clock);
      const { wallMs, sessionsMs, checksMs, personMs, slotMs, restMs } = row.clock;
      assert.equal(sessionsMs + checksMs + personMs + slotMs + restMs, wallMs);
      assert.equal(wallMs, row.wallMs);
      assert.equal(sessionsMs, 5 * 60_000);
      assert.deepEqual([checksMs, slotMs, restMs], [0, 0, 0]);
      assert.equal(personMs, wallMs - 5 * 60_000, 'from its blocked sign-off until now');
      assert.equal(row.waitingSince, at(25), 'its present wait began as its blocked sign-off ended');
      assert.equal(
        wallMs - personMs,
        Date.parse(row.waitingSince) - Date.parse(row.createdAt),
        'its one wait is its whole wait on a person',
      );
      assert.equal('stepCosts' in open.inFlight[0], false);
      assert.equal('waitingSince' in open.inFlight[0], false);
      const [moving] = open.inFlight;
      assert.ok(moving.clock, 'a row in flight carries its clock, which its Clock cell breaks down');
      assert.equal(moving.clock.wallMs, moving.wallMs);
      const parts = ['sessionsMs', 'checksMs', 'personMs', 'slotMs', 'restMs'] as const;
      assert.equal(
        parts.reduce((sum, part) => sum + moving.clock![part], 0),
        moving.wallMs,
      );
      const [done] = (await read<FinishedListing>('/api/runs-finished')).runs;
      assert.ok(done.clock, 'a finished row carries one too');
      assert.equal(done.clock.wallMs, done.wallMs, 'read where its work stopped, so its parts add up to the row');
      assert.equal(
        parts.reduce((sum, part) => sum + done.clock![part], 0),
        done.wallMs,
      );
    },
  );
  await s.test(
    '?ofFactory= keeps the runs of one factory, default those that name none, and a name no run carries answers empty',
    async () => {
      const nemia = await read<OpenListing>('/api/runs-open?ofFactory=nemia');
      assert.deepEqual(nemia.counts, { waiting: 1, inFlight: 0, finished: 2 });
      assert.deepEqual(
        (await everyPage('&ofFactory=nemia')).flatMap((page) => page.runs.map((run) => run.id)),
        ['l-first', 'l-third'],
      );
      assert.deepEqual((await read<OpenListing>('/api/runs-open?ofFactory=default')).counts, { waiting: 0, inFlight: 1, finished: 2 });
      assert.deepEqual(
        (await read<FinishedListing>('/api/runs-finished?ofFactory=default')).runs.map((run) => run.id),
        ['l-fourth', 'l-second'],
      );
      const none = await read<OpenListing>('/api/runs-open?ofFactory=no-such-factory');
      assert.deepEqual([none.counts, none.waiting, none.inFlight], [{ waiting: 0, inFlight: 0, finished: 0 }, [], []]);
      const empty = await read<FinishedListing>('/api/runs-finished?ofFactory=no-such-factory');
      assert.deepEqual([empty.runs, empty.total, empty.pages], [[], 0, 1]);
    },
  );
  await s.test(
    'asked without a page or a size, the finished runs answer page 1 of nine; a page past the last is an empty page, 200',
    async () => {
      const first = await read<FinishedListing>('/api/runs-finished');
      assert.deepEqual([first.page, first.size, first.runs.length, first.pages], [1, 9, 5, 1]);
      const past = await read<FinishedListing>('/api/runs-finished?page=4&size=2');
      assert.deepEqual([past.runs, past.total, past.page, past.pages], [[], 5, 4, 3]);
    },
  );
});

test('GET /api/runs-finished refuses with a 422 a page that is no whole number from 1, a size that is none from 1 to 100', async (t) => {
  const rows = [
    ...['0', '-1', '1.5', 'abc', ''].map((page) => ({ query: `page=${page}`, field: 'page', value: page })),
    ...['0', '101', 'abc'].map((size) => ({ query: `size=${size}`, field: 'size', value: size })),
  ];
  for (const { query, field, value } of rows)
    await t.test(query, async () => {
      const res = await app().request(`/api/runs-finished?${query}`);
      const body = (await res.json()) as { error?: string };
      assert.equal(res.status, 422, JSON.stringify(body));
      assert.deepEqual(Object.keys(body), ['error'], 'the refusal and nothing else');
      names(body.error, field, `\`${value}\``);
    });
});
