/**
 * A try's check's output on its route (`checkOutput`, `…/tries/:try/check/output`): the query bound to the orchestrator's entry, its
 * stream, its page and its match, and what the route refuses by its status. How a page is cut is the contract's, and how lines are
 * numbered and matched the orchestrator's: here, only the wiring of each key.
 *
 * On the stand-ins: the runtime's test engine, the step's task and its check's filed and settled by hand, and the test place, under the
 * records this file seeds: one whose check's task is filed, and one whose check's task the engine never held.
 */
import { root } from '../../test/harness.ts';
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Schema } from 'effect';
import { type CheckOutput, ReadFailed } from 'objects';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const R = 'r-check-output';
const GONE = 'r-check-output-gone';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
/** The record of the run `id`, its one step's task `t-co` and its check's task `check`. */
const seeded = (id: string, check: string) =>
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Check output',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-11-21T06:00:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.', harness: 'claude', check: 'npm test' }],
      steps: { implement: { taskId: 't-co', check: { taskId: check } } },
    }),
  );
seeded(R, 'c-co');
seeded(GONE, 'c-gone');
beforeEachTest(() => {
  Effect.runSync(engine().file({ id: 't-co', brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle('t-co', 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Built it.', needs: null, artifacts: [] },
  });
  Effect.runSync(engine().file({ id: 'c-co', brief: 'npm test', cwd: '/code/app', harness: 'claude' }));
  standIn().settle('c-co', 'failed', {
    exitCode: 1,
    printed: { stdout: 'ok 1 - a\nnot ok 2 - b\nok 3 - c\nFAIL 4 - d\nok 5 - e\n', stderr: 'npm error Test failed.\n' },
  });
});

const at = `/api/runs/${R}/steps/implement/tries`;
const get = async (url: string) => {
  const res = await app().request(url);
  return { status: res.status, body: (await res.json()) as CheckOutput };
};
const numbers = (body: CheckOutput) => body.lines.map((l) => l.n);

describe("a try's check's output answers on its route, its query bound to the read", () => {
  test('stdout by default, stderr when asked, each from its own stream', async () => {
    const out = await get(`${at}/1/check/output`);
    assert.equal(out.status, 200);
    assert.deepEqual([out.body.taskId, out.body.stream, out.body.total, numbers(out.body)], ['c-co', 'stdout', 5, [1, 2, 3, 4, 5]]);
    const err = await get(`${at}/1/check/output?stream=stderr`);
    assert.equal(err.status, 200);
    assert.deepEqual([err.body.stream, err.body.lines], ['stderr', [{ n: 1, text: 'npm error Test failed.' }]]);
  });
  test('limit answers next, and from reads on from it', async () => {
    const first = await get(`${at}/1/check/output?limit=2`);
    assert.deepEqual([numbers(first.body), first.body.next], [[1, 2], 3]);
    const on = await get(`${at}/1/check/output?from=${first.body.next}&limit=2`);
    assert.deepEqual([numbers(on.body), on.body.next], [[3, 4], 5]);
  });
  test('last ends at the last line', async () => {
    const { body } = await get(`${at}/1/check/output?last=3`);
    assert.deepEqual([numbers(body), body.next], [[3, 4, 5], undefined]);
  });
  test('match answers how many lines it found, each under its number', async () => {
    const { body } = await get(`${at}/1/check/output?match=fail`);
    assert.deepEqual([numbers(body), body.matched, body.total], [[4], 1, 5]);
  });
  test('before reads the page back from a line, and answers the line lines are held before', async () => {
    const back = await get(`${at}/1/check/output?before=5&limit=2`);
    assert.deepEqual([numbers(back.body), back.body.before, back.body.next], [[3, 4], 3, 5]);
  });
  test('REFUSED: before with from is a 422', async () => {
    assert.equal((await get(`${at}/1/check/output?before=3&from=1`)).status, 422);
  });
  test('REFUSED: a check whose task the engine cannot read is a 502, ReadFailed', async () => {
    const res = await app().request(`/api/runs/${GONE}/steps/implement/tries/1/check/output`);
    assert.equal(res.status, 502);
    const body = Schema.decodeUnknownSync(ReadFailed)(await res.json());
    assert.ok(body.error.length > 0, 'it says what to do next');
  });
  test('REFUSED: last with limit is a 422, a stream that is none a 400, a try the step lacks a 404', async () => {
    assert.equal((await get(`${at}/1/check/output?last=2&limit=2`)).status, 422);
    assert.equal((await get(`${at}/1/check/output?stream=both`)).status, 400);
    assert.equal((await get(`${at}/7/check/output`)).status, 404);
  });
});
