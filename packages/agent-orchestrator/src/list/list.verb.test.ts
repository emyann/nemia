/**
 * `nemia ls`'s reading of a run (`list`, over `listReading`) says why the runtime holds a step's task queued, off the task's view: a run
 * started and ticked once, its root filed `queued` on the engine's stand-in, a wait planted on that task, and its row's note read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { staged } from '../../test/story.ts';
import type { Env } from '../config/config.store.ts';
import { advanceRun, list, runWith, startRun } from '../runner.ts';
import { runRecord } from '../record/record.store.ts';
import { standingSnapshot } from '../standing/standing.verb.ts';
import { engineOf } from '../runtime-client.ts';
import { main } from '../cli/main.ts';

const ROOT = scratch('wf-list-verb-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stage = staged({ runWith, main, engineOf, env: ENV });
const GI = 1024 ** 3;

test("a queued step's row says, in its note, the memory the runtime holds it back for", async () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, { 'README.md': 'a repo\n' });
  const run = await stage.runPlaced(startRun({ brief: 'read me', repo, workflowDir: dir }));
  const e = stage.board().e;
  await stage.runWith(e, advanceRun(runRecord(ROOT, run.id)));
  const taskId = runRecord(ROOT, run.id).steps.implement?.taskId;
  assert.ok(taskId, 'the root is filed');
  stage.board().plantWait(taskId, { for: 'memory', needBytes: 2.5 * GI, roomBytes: GI });
  const listed = await stage.runWith(
    e,
    Effect.flatMap(standingSnapshot(), (standing) => list(e, runRecord(ROOT, run.id), undefined, standing)),
  );
  const note = listed.steps.find((s) => s.name === 'implement')?.note;
  for (const fact of ['memory', '2.5Gi', '1Gi']) assert.ok(note?.includes(fact), fact);
});
