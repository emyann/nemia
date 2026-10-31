/**
 * The run page's reads decode the api's answers where they enter (`get`): a run's detail (`runQuery`), its decision (`decisionQuery`), a
 * step's conversation (`readTranscript`) and its try's path (`stepPathQuery`). Each reads back what the api gave, every union in its
 * shapes; a key the api leaves out stays out and one the board does not know is dropped. Which keys each answer has is
 * `test/wire.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReadRefusal, UnreadAnswer } from '../src/lib/api/read.ts';
import { runGone, runQuery, type RunDetail } from '../src/lib/api/detail.ts';
import { decisionQuery, type RunDecision } from '../src/lib/api/decision.ts';
import { readTranscript, stepPathQuery, type StepPath } from '../src/lib/api/steps.ts';
import { decidable, detail, step, stepPath, transcript } from './run-fixtures.ts';

/** Every read answering `body` as JSON, with `status`, for the length of the test. */
function answering(t: { after: (fn: () => void) => void }, body: unknown, status = 200) {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  t.after(() => {
    globalThis.fetch = before;
  });
}

const readDetail = runQuery('r-1').queryFn as unknown as () => Promise<RunDetail>;
const readDecision = decisionQuery('r-1', 'stamp').queryFn as unknown as () => Promise<RunDecision>;
const readPath = stepPathQuery('r-1', 'implement', 'stamp', null, () => false).queryFn as unknown as () => Promise<StepPath>;

/** `value` without `keys`, as an api that does not send them answers. */
const without = (value: object, ...keys: string[]): object => Object.fromEntries(Object.entries(value).filter(([k]) => !keys.includes(k)));

test("get, the run page's reads: each decodes what the api gives, keeps out what it leaves out, drops what the board does not know, and keeps a 404 the api's", async (t) => {
  await t.test("a run's detail decodes as the api gave it, each union in its every shape", async (t) => {
    answering(t, detail());
    assert.deepEqual(await readDetail(), detail());
  });
  await t.test("a run's detail from no inbox card has neither `from` nor `fromNote`, and they stay absent", async (t) => {
    const bare = without(detail(), 'from', 'fromNote');
    answering(t, bare);
    const read = await readDetail();
    assert.equal(Object.hasOwn(read, 'from') || Object.hasOwn(read, 'fromNote'), false);
    assert.deepEqual(read, bare);
  });
  await t.test(
    'a file a closeout names keeps what the api served it with, or pruned it with: a bare path does not swallow either',
    async (t) => {
      answering(t, detail());
      const [artifact, pruned, bare] = (await readDetail()).steps[0].closeout?.artifacts ?? [];
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
  await t.test("a key the board does not know is dropped from a run's detail and its steps, not refused", async (t) => {
    answering(t, { ...detail(), colour: 'blue', steps: [{ ...step(), mood: 'calm' }] });
    const read = await readDetail();
    assert.equal(Object.hasOwn(read, 'colour'), false);
    assert.equal(Object.hasOwn(read.steps[0], 'mood'), false);
    assert.deepEqual(read, detail());
  });
  await t.test("a run gone is still the api's 404 in its words, never an answer unread", async (t) => {
    answering(t, { error: "No run 'r-1' in this store." }, 404);
    const err: unknown = await readDetail().then(
      () => assert.fail('a 404 was read'),
      (e: unknown) => e,
    );
    assert.ok(err instanceof ReadRefusal && !(err instanceof UnreadAnswer), String(err));
    assert.equal(err.status, 404);
    assert.equal(runGone(err), true);
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
    answering(t, stepPath());
    assert.deepEqual(await readPath(), stepPath());
  });
  await t.test('a tool called without an input, as Claude Code may record it, is read without one', async (t) => {
    const call = { id: 'e-1', at: '2026-09-30T05:02:00.000Z', role: 'assistant', kind: 'tool_use', tool: { name: 'Stop' } } as const;
    answering(t, transcript({ events: [call] }));
    const [event] = (await readTranscript('r-1', 'implement')).events;
    assert.deepEqual(event, call);
  });
});
