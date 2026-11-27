/**
 * A start in a factory refuses a workflow node that starts a run of a workflow the factory does not offer, before any run is written:
 * `Invalid`, exit 2, naming the node and the attach that offers it. The rest of what a start in a factory refuses is
 * `factory-start.test.ts`'s. The store is the file's own, at `ROOT`, given as `ENV`.
 */
import { clearFactories, runFolderNames, keysUnder, addFactoryAt, attachWorkflowAt } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { startRun, runWith as runEngine } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { told } from './typed.ts';

const ROOT = scratch('wf-factory-nodes-');
const ENV: Record<string, string | undefined> = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1' };
const stage = staged({ runWith: runEngine, main: told, engineOf, env: ENV });

/** The runs written under the store: none after a refusal. */
const runsWritten = () => [...runFolderNames(ROOT), ...keysUnder(ROOT, '/registry/runs/')] satisfies string[];

describe('a workflow node whose workflow the factory does not offer refuses the start, and a node it offers does not', () => {
  let repo!: string;
  let courier!: string;
  beforeAll(() => {
    const t = teardowns();
    clearFactories(ROOT);
    repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    stage.place().world.repository(repo, { 'README.md': 'x\n' });
    addFactoryAt(ROOT, { name: 'acme', volumes: [`${repo}:rw`] });
    const team = fs.mkdtempSync(path.join(ROOT, 'team-'));
    courier = path.join(team, 'courier');
    fs.mkdirSync(courier);
    fs.writeFileSync(path.join(courier, 'hand-on.md'), '---\nplace: git\nworkflow: waybill\n---\nHand it on.\n');
    attachWorkflowAt(ROOT, { factory: 'acme', workflow: 'courier' });
    return t.end;
  });
  const s = story(test);
  const start = () => stage.runPlaced(startRun({ brief: 'hand it on', repo, workflowDir: courier, isolate: false, factory: 'acme' }));
  s.test('REFUSED: the node names a workflow the factory has not attached, the node and the attach named, no run written', async () => {
    const before = runsWritten();
    await assert.rejects(start, (err: Error & { _tag?: string; exitCode?: number }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Invalid', 2], err.message);
      assert.ok(err.message.includes('hand-on'), err.message);
      assert.ok(err.message.includes('nemia factory attach acme waybill'), err.message);
      return true;
    });
    assert.deepEqual(runsWritten(), before, 'no run written');
  });
});
