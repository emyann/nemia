/**
 * `GET /api/runs/:runId/lines` answers the run's command lines (`runLines`) and the address of its workflow's page, off its record:
 * what the run object leaves out, read once for a run beside it.
 *
 * On the stand-ins: the runtime's test engine and the test place, under the records this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { runLines } from 'agent-orchestrator';
import type { RunLinesAnswer } from './runs.ts';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';
import { listedOf } from '../../test/run-reads.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const R = 'r-lines';
const FROM = 'r-lines-carded';
const UNFILED = 'r-lines-unfiled';
/** A run's record of two steps, `a` filed as `t-<id>` and `b` not yet, filed from the inbox's card `card` when one is given. */
const record = (id: string, card?: string) => ({
  id,
  repo: '/code/app',
  workspace: '/code/app',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'Line it',
  workflowDir: path.join(root, 'no-such-workflow'),
  createdAt: '2026-11-02T06:00:00.000Z',
  workflow: [
    { name: 'a', after: [], body: 'Do it.', harness: 'claude' },
    { name: 'b', after: ['a'], body: 'Read it.', harness: 'claude' },
  ],
  steps: { a: { taskId: `t-${id}` }, b: { taskId: null } },
  ...(card ? { from: { inbox: card } } : {}),
});
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
for (const [id, card] of [[R], [FROM, 'lines-card'], [UNFILED]] as const)
  fs.writeFileSync(path.join(root, 'runs', `${id}.json`), JSON.stringify(record(id, card)));
beforeEachTest(() => {
  for (const id of [R, FROM]) {
    Effect.runSync(engine().file({ id: `t-${id}`, brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
    standIn().settle(`t-${id}`, 'succeeded', {
      exitCode: 0,
      closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
    });
  }
});

/** The run's lines as the route answers them. */
const linesOf = async (id: string): Promise<RunLinesAnswer> => {
  const res = await app().request(`/api/runs/${id}/lines`);
  assert.equal(res.status, 200);
  return (await res.json()) as RunLinesAnswer;
};

test("the lines route answers the run's command lines per step, and its workflow's page: none for another repository's folder", async () => {
  const lines = await linesOf(R);
  const { workflowPage, ...rest } = lines;
  assert.deepEqual(rest, runLines(record(R)), "the package's lines of the run's record");
  assert.deepEqual(Object.keys(lines.steps), ['a', 'b']);
  assert.equal(lines.fromNote, null);
  assert.equal((await listedOf(app(), R)).metadata.name, R, 'the RunList has the run');
  assert.equal(workflowPage, null, 'a folder of another repository, in no factory: the board pages it on no address');
  const object = (await (await app().request(`/api/runs/${R}`)).json()) as Record<string, unknown>;
  assert.equal(object.decide, undefined, 'the object stays without the lines');
});

test('the lines route says the card a run was started from', async () => {
  assert.ok((await linesOf(FROM)).fromNote?.includes('lines-card'));
});

test('the lines route answers off the record alone: a run whose task the engine never filed still answers its lines', async () => {
  assert.deepEqual(Object.keys((await linesOf(UNFILED)).steps), ['a', 'b']);
});

test('REFUSED: no such run, or a path made of an id, is a 404', async () => {
  assert.equal((await app().request('/api/runs/r-nowhere/lines')).status, 404, 'no such run');
  assert.equal((await app().request(`/api/runs/..%2Fruns%2F${R}/lines`)).status, 404, 'a path is no id');
});
