/**
 * The run page's reads decode the api's answers where they enter (`get`): a run's object (`runObjectQuery`), a step's tries
 * (`stepTriesQuery`), its decision (`decisionQuery`), a step's conversation (`readTranscript`) and its try's path (`stepPathQuery`). Each
 * reads back what the api gave, every union in its shapes; a key the api leaves out stays out and one the board does not know is dropped.
 * Which keys each answer has is the objects' Schemas' (`objects`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { readGone, runObjectQuery, stepTriesQuery } from '../src/lib/api/run.ts';
import type { Run, StepTry } from 'objects';
import { decisionQuery, type RunDecision } from '../src/lib/api/decision.ts';
import { readTranscript, stepPathQuery, type StepPath } from '../src/lib/api/steps.ts';
import { decidable, detail, step, machine, stepPath, transcript } from './run-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readObject = runObjectQuery('r-1').queryFn as unknown as () => Promise<Run>;
const readTries = stepTriesQuery('r-1', 'implement', 'stamp').queryFn as unknown as () => Promise<readonly StepTry[]>;
const readDecision = decisionQuery('r-1', 'stamp').queryFn as unknown as () => Promise<RunDecision>;
const readPath = stepPathQuery('r-1', 'implement', 'stamp', null, () => false).queryFn as unknown as () => Promise<StepPath>;

/** A step's tries as the api answers them, the current one carrying the closeout whose files are read. */
const tries = () => {
  const [first, current] = step().tries;
  return [first, { ...current, closeout: step().closeout }];
};

/** A try's path through the runtime's lifecycle, in its own states: one edge under a guard and one without. */
const LIFECYCLE_PATH = stepPath({
  path: [
    { state: 'submitted', event: 'filed', at: '2026-09-30T05:01:00.000Z' },
    { state: 'working', event: 'spawned', at: '2026-09-30T05:02:00.000Z' },
  ],
  lifecycle: machine({
    initial: 'submitted',
    states: ['submitted', 'working', 'completed'],
    final: ['completed'],
    edges: [
      { from: 'submitted', event: 'start', guard: 'hasSlot', to: 'working', action: 'spawn' },
      { from: 'working', event: 'exit', to: 'completed', action: 'record' },
    ],
    verbs: [{ verb: 'close', entry: 'closed', by: 'person', from: ['working'], to: 'completed', guard: 'awaitsWord' }],
  }),
});

test("get, the run page's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not know, and keeps a 404 the api's", async (t) => {
  await t.test("a step's tries decode as the api gave them, each union in its every shape", async (t) => {
    answering(t, { tries: tries() });
    assert.deepEqual(await readTries(), tries());
  });
  await t.test(
    'a file a closeout names keeps what the api served it with, or pruned it with: a bare path does not swallow either',
    async (t) => {
      answering(t, { tries: tries() });
      const [artifact, pruned, bare] = (await readTries()).at(-1)?.closeout?.artifacts ?? [];
      assert.deepEqual(artifact, {
        path: 'shot.png',
        name: 'shot.png',
        url: '/api/runs/r-1/steps/implement/files/shot.png',
        kind: 'image',
        size: 2048,
      });
      assert.deepEqual(pruned, { path: 'old.log', pruned: 'removed by wf prune --artifacts', prunedAt: '2026-09-30T06:00:00.000Z' });
      assert.deepEqual(bare, { path: 'RESPONSE.md' });
    },
  );
  await t.test("a key the board does not know is dropped from a step's tries, not refused", async (t) => {
    const [first, current] = tries();
    answering(t, { colour: 'blue', tries: [first, { ...current, mood: 'calm' }] });
    const read = await readTries();
    assert.equal(Object.hasOwn(read.at(-1) ?? {}, 'mood'), false);
    assert.deepEqual(read, tries());
  });
  await t.test("a run gone is still the api's 404 in its words, never an answer unread", async (t) => {
    answering(t, { error: "No run 'r-1' in this store." }, 404);
    const err: unknown = await readObject().then(
      () => assert.fail('a 404 was read'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
    assert.equal(err.status, 404);
    assert.equal(readGone(err), true);
  });
  await t.test('a word the board does not know in a closed field of a try is refused at decode, never shown', async (t) => {
    const attempts = { count: 1, latest: { startedAt: '2026-09-30T05:00:00.000Z', ended: 'failed', endedAt: null, reason: 'mystery' } };
    const [first, current] = tries();
    for (const strange of [
      { ...current, attempts },
      { ...current, phase: 'mystery' },
    ]) {
      answering(t, { tries: [first, strange] });
      const err: unknown = await readTries().then(
        () => assert.fail('a word the board does not know was read'),
        (e: unknown) => e,
      );
      assert.ok(err instanceof UnreadAnswer, String(err));
    }
  });
  await t.test("a run's decision decodes as the api gave it, in each of its shapes", async (t) => {
    const holding = detail().holding;
    const waiting = detail().waiting;
    assert.ok(holding && waiting);
    for (const answer of [decidable(), { holding }, { waiting }, { running: true }, { nothing: 'landed' }] as RunDecision[]) {
      answering(t, answer);
      assert.deepEqual(await readDecision(), answer);
    }
  });
  await t.test('a run waiting on runs and held too keeps both: the member of a hold alone does not swallow it', async (t) => {
    const { holding, waiting } = detail();
    answering(t, { waiting, holding });
    assert.deepEqual(await readDecision(), { waiting, holding });
  });
  await t.test("a step's conversation and its try's path decode as the api gave them; an event says only what it has", async (t) => {
    answering(t, transcript());
    const read = await readTranscript('r-1', 'implement');
    assert.deepEqual(read, transcript());
    assert.equal(Object.hasOwn(read.events[0], 'tool') || Object.hasOwn(read.events[0], 'result'), false);
    answering(t, LIFECYCLE_PATH);
    assert.deepEqual(await readPath(), LIFECYCLE_PATH);
    const [, unguarded] = (await readPath()).lifecycle.edges;
    assert.equal(Object.hasOwn(unguarded, 'guard'), false, 'an edge under no guard is read without one');
  });
  await t.test('a tool called without an input, as Claude Code may record it, is read without one', async (t) => {
    const call = { id: 'e-1', at: '2026-09-30T05:02:00.000Z', role: 'assistant', kind: 'tool_use', tool: { name: 'Stop' } } as const;
    answering(t, transcript({ events: [call] }));
    const [event] = (await readTranscript('r-1', 'implement')).events;
    assert.deepEqual(event, call);
  });
});
