/**
 * A list item is sized for a list: no step of a run listed carries its artifacts folder (`artifactsFolder`), at either door of the
 * RunList and by a field, so a list reads no step's artifacts folder from disk; the run's own read (`GET /api/runs/:name`) still does.
 *
 * On the stand-ins: the runtime's test engine, its task settled by hand, and the test place, under the record this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Run, RunList } from 'objects';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { plantRecord, runKey, testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));

const R = 'li-shot';
const AT = '2026-11-04T10:00:00.000Z';

beforeEachTest(() => {
  Effect.runSync(engine().file({ id: `${R}-write`, brief: 'Write it.', cwd: root, harness: 'codex' }));
  standIn().settle(`${R}-write`, 'succeeded', {
    startedAt: AT,
    spawnedAt: AT,
    endedAt: '2026-11-04T10:05:00.000Z',
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] },
  });
  fs.mkdirSync(path.join(root, 'runs', R, 'artifacts', 'write'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', R, 'artifacts', 'write', 'shot.png'), 'png');
  plantRecord(root, runKey(R), JSON.stringify({
      id: R,
      place: { kind: 'folder' },
      workspace: path.join(root, 'runs', R, 'work'),
      brief: 'List it.',
      createdAt: AT,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'codex', workspace: 'folder' }],
      steps: { write: { taskId: `${R}-write` } },
    }));
});

const read = async <T>(address: string) => {
  const res = await app().request(address);
  assert.equal(res.status, 200, `${address}: ${await res.clone().text()}`);
  return (await res.json()) as T;
};

test("the run's own read carries each step's artifacts folder, and no list item at either door or by a field does", async () => {
  const run = await read<Run>(`/api/runs/${R}`);
  const write = run.status.steps.find((step) => step.name === 'write');
  assert.deepEqual(
    write?.artifactsFolder?.files.map((file) => ('name' in file ? file.name : file.path)),
    ['shot.png'],
  );
  for (const address of ['/api/runs', '/api/namespaces/default/runs', '/api/runs?fieldSelector=status.state%3Dfinished']) {
    const item = (await read<RunList>(address)).items.find((one) => one.metadata.name === R);
    assert.ok(item, `${address} lists ${R}`);
    assert.ok(item.status.steps.length > 0, `${address}: ${R}'s item has its steps`);
    assert.ok(
      item.status.steps.every((step) => !('artifactsFolder' in step)),
      `${address}: no step of a list item carries its artifacts folder`,
    );
  }
});
