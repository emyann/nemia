/**
 * The board's reads and writes decode the api's answers where they enter (the objects' client, src/lib/api/objects.ts, with `decoded`
 * of read.ts): an answer that does not decode is refused with the route, the first wrong key, what was there and the fix; a key the board
 * does not know is dropped; a refusal of the api's stays in its words. Every read and write goes through the objects' client, whose
 * fetch is the board's only one (`test/structure.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { decodes } from '../src/lib/api/decodes.ts';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { openRunsQuery, rowsOf, runsQuery, runsSelectedQuery, type OpenRuns } from '../src/lib/api/runs.ts';
import { agentOf, judged, runViewOf, sinceOf, type RunRow } from '../src/lib/api/judged.ts';
import type { StepView } from '../src/lib/runView.ts';
import { detail, runList, runObject, step } from './run-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

type TimelineTry = StepView['timeline'][number];

/** A try of a step whose session started at `spawnedAt` and ended at `endedAt`, null while it runs; a check where `check` gives one. */
const tried = (n: number, spawnedAt: string, endedAt: string | null, check?: [string, string | null]): TimelineTry => {
  const span = (from: string, to: string | null) => ({
    taskId: `t-${n}`,
    at: to === null ? ('running' as const) : ('ended' as const),
    filedAt: from,
    spawnedAt: from,
    endedAt: to,
    attempts: 1,
    queuedMs: 0,
    ranMs: null,
    queued: '0s',
    ran: '',
  });
  return { try: n, round: 1, session: span(spawnedAt, endedAt), sessionOf: null, check: check ? span(...check) : null, used: null };
};

/** The run `runViewOf` is shown: two steps, the first given an agent, its tries `timeline`, in `namespace`. */
const object = (timeline: TimelineTry[], namespace?: string) => {
  const view = detail({ id: 'r-1', steps: [step({ name: 'plan', timeline }), step({ name: 'land', timeline: [] })] });
  const graph = {
    roots: ['plan'],
    edges: [
      { from: 'plan', to: 'land', kind: 'after' as const },
      { from: 'plan', to: 'land', kind: 'input' as const },
    ],
  };
  const run = runObject(view, { graph }, namespace);
  const [plan, land] = run.spec.steps;
  return {
    ...run,
    spec: {
      ...run.spec,
      steps: [
        { ...plan, name: 'plan', agent: 'planner' },
        { ...land, name: 'land' },
      ],
    },
  };
};

const readRuns = runsQuery.queryFn as unknown as () => Promise<RunRow[]>;

/** The frame read for `factory`, or for every factory, with no context of a query's. */
const readOpen = (factory?: string) => (openRunsQuery(factory).queryFn as unknown as () => Promise<OpenRuns>)();

test("runViewOf: the one view of a run off its object — its factory from its namespace, each step's agent (agentOf) and since (sinceOf)", async (t) => {
  await t.test("a step's since is the earliest spawnedAt of a session or check of it that has not ended", () => {
    const run = object([
      tried(1, '2026-10-12T10:00:00.000Z', '2026-10-12T10:05:00.000Z'),
      tried(2, '2026-10-12T10:20:00.000Z', null, ['2026-10-12T10:10:00.000Z', null]),
      tried(3, '2026-10-12T10:15:00.000Z', null),
    ]);
    const [plan, land] = runViewOf(run).steps;
    assert.equal(sinceOf(plan), '2026-10-12T10:10:00.000Z');
    assert.equal(sinceOf(land), null, 'a step never tried has none');
  });
  await t.test('REFUSED: a step all of whose spans have ended has no since', () => {
    const run = object([
      tried(1, '2026-10-12T10:00:00.000Z', '2026-10-12T10:05:00.000Z', ['2026-10-12T10:06:00.000Z', '2026-10-12T10:07:00.000Z']),
    ]);
    assert.equal(sinceOf(runViewOf(run).steps[0]), null);
  });
  await t.test("the factory is the run's namespace, none for the default factory's", () => {
    assert.equal(runViewOf(object([], 'harbour')).factory, 'harbour');
    assert.equal(runViewOf(object([], 'default')).factory, null);
    assert.equal(runViewOf(object([])).factory, null);
  });
  await t.test("each step's agent is the one its spec froze, none for a step given none; the graph keeps no input edge", () => {
    const row = runViewOf(object([]));
    assert.deepEqual(
      row.steps.map((s) => [s.name, agentOf(s)]),
      [
        ['plan', 'planner'],
        ['land', null],
      ],
    );
    assert.deepEqual(row.graph.edges, [{ from: 'plan', to: 'land', kind: 'after' }]);
    assert.deepEqual([row.id, row.createdAt], ['r-1', '2026-09-30T05:00:00.000Z']);
  });
  await t.test('a run the list could not judge is said unjudged: its name, its factory and why, and nothing judged of it', () => {
    const unjudged = { name: 'r-9', namespace: 'harbour', error: 'journal t-9 does not read', state: 'inFlight' as const };
    assert.deepEqual(rowsOf(runList([], {}, [unjudged, { name: 'r-8', namespace: 'default', error: 'x' }])), [
      { id: 'r-8', factory: null, unjudged: 'x' },
      { id: 'r-9', factory: 'harbour', unjudged: 'journal t-9 does not read' },
    ]);
  });
});

test('every run is the plain RunList whole, a label selector going with it, each run it could not judge a row in name order', async (t) => {
  const asked: string[] = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    const list = runList([runObject(detail({ id: 'r-2' }))], {}, [{ name: 'r-1', namespace: 'default', error: 'unread' }]);
    return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  const rows = await readRuns();
  assert.deepEqual(
    rows.map((row) => [row.id, judged(row) ? null : row.unjudged]),
    [
      ['r-1', 'unread'],
      ['r-2', null],
    ],
  );
  await (runsSelectedQuery('team=blue').queryFn as unknown as () => Promise<RunRow[]>)();
  assert.deepEqual(asked.map(decodeURIComponent), ['/api/runs', '/api/runs?labelSelector=team=blue'], 'no state, no page: the list whole');
});

test("the frame is the RunList of the runs not finished, split by each run's state, with the list's counts and asOf", async (t) => {
  const asked: string[] = [];
  const before = globalThis.fetch;
  const clock = { wallMs: 5, sessionsMs: 1, checksMs: 1, personMs: 1, slotMs: 1, restMs: 1 };
  const stepCosts = [
    { step: 'plan', cost: { usd: 1.5, measured: 1, unmeasured: 0, said: '$1.50' } },
    { step: 'land', cost: null },
  ];
  const parts = { wallMs: 5, clock, finishedAt: null, outcome: null };
  const list = runList(
    [
      runObject(detail({ id: 'r-1' }), { ...parts, state: 'waiting', stepCosts, waitingSince: '2026-10-12T11:57:00.000Z' }),
      runObject(detail({ id: 'r-3' }), { ...parts, state: 'inFlight', stepCosts: null, waitingSince: null }),
    ],
    { asOf: '2026-10-12T12:00:00.000Z', counts: { waiting: 1, inFlight: 2, finished: 7 } },
    [{ name: 'r-2', error: 'unread', state: 'inFlight' }],
  );
  globalThis.fetch = async (input) => {
    asked.push(String(input));
    return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  t.after(() => {
    globalThis.fetch = before;
  });
  const open = await readOpen();
  assert.equal(open.asOf, '2026-10-12T12:00:00.000Z');
  assert.deepEqual(open.counts, { waiting: 1, inFlight: 2, finished: 7 });
  assert.deepEqual(
    open.waiting.map((run) => (judged(run) ? [run.id, run.wallMs, run.clock, run.stepCosts, run.waitingSince] : [run.id])),
    [['r-1', 5, clock, stepCosts, '2026-10-12T11:57:00.000Z']],
  );
  assert.deepEqual(
    open.inFlight.map((run) => (judged(run) ? [run.id, null, run.wallMs] : [run.id, run.unjudged])),
    [
      ['r-2', 'unread'],
      ['r-3', null, 5],
    ],
  );
  await readOpen('a b');
  assert.deepEqual(asked.map(decodeURIComponent), [
    '/api/runs?fieldSelector=status.state!=finished',
    '/api/namespaces/a b/runs?fieldSelector=status.state!=finished',
  ]);
  assert.deepEqual(openRunsQuery().queryKey, ['runs-open']);
  assert.deepEqual(openRunsQuery('a b').queryKey, ['runs-open', 'a b']);
});

test('REFUSED: a run whose status is no word the board knows is an answer unread, of the list', async (t) => {
  const run = runObject();
  (run.status as { status: string }).status = 'nonsense';
  answering(t, runList([run]));
  const err: unknown = await readRuns().then(
    () => assert.fail('a status of no word was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof UnreadAnswer, String(err));
  assert.equal(err.route, 'GET /api/runs');
});

test("a read the api refused still rejects in the api's words and status, not as an answer unread", async (t) => {
  answering(t, { error: 'no run x' }, 404);
  const err: unknown = await readRuns().then(
    () => assert.fail('a 404 was read'),
    (e: unknown) => e,
  );
  assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
  assert.equal(err.status, 404);
  assert.equal(err.message, 'no run x');
});

test("read.ts hands out the decode the objects' client reads every answer with, and its three refusals, and nothing else", async () => {
  assert.deepEqual(Object.keys(await import('../src/lib/api/read.ts')).sort(), ['ReadRefusal', 'UnreadAnswer', 'WriteRefusal', 'decoded']);
});

test('decodes takes a schema that decodes its type, and the compiler refuses one that does not', () => {
  const taken = decodes<{ a: string; b?: number }>()(Schema.Struct({ a: Schema.String, b: Schema.optional(Schema.Number) }));
  assert.ok(Schema.isSchema(taken));
  // @ts-expect-error -- a schema that decodes `any`.
  decodes<{ a: string }>()(Schema.Any);
  // @ts-expect-error -- a key the type requires, made optional.
  decodes<{ a: string }>()(Schema.Struct({ a: Schema.optional(Schema.String) }));
  // @ts-expect-error -- a key of the type left out.
  decodes<{ a: string; b: number }>()(Schema.Struct({ a: Schema.String }));
  // @ts-expect-error -- a word of the type left out.
  decodes<{ a: 'x' | 'y' }>()(Schema.Struct({ a: Schema.Literal('x') }));
});
