/**
 * A folder run (`workspace: folder`, `place: { kind: 'folder' }` on the record), as the board reads it: no repository, no base, no
 * branch. The list, the detail and the decision answer for it without throwing, and say what the record says — null where a git run
 * has a repository — rather than a git run's words. In a scratch store, with no git repository anywhere.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-folder-'));
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');

const at = '2026-09-19T00:10:00.000Z';
const work = path.join(root, 'runs', 'f-notes', 'work');

/** A task's journal, as the engine writes it: filed in the step's folder, and signed off. */
function signedOff(taskId: string, cwd: string): void {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), [
    { kind: 'filed', at, brief: 'Write it.', cwd, maxAttempts: 1, harness: 'claude' },
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    { kind: 'ended', at, attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout: { outcome: 'done', summary: 'Wrote it.', needs: null, artifacts: [] } },
    { kind: 'settled', at, outcome: 'succeeded' },
  ].map((e) => `${JSON.stringify(e)}\n`).join(''));
}

// A folder run whose one step signed off: its record as `wf start` writes one, with `place` and none of a git run's fields.
fs.mkdirSync(path.join(work, 'write'), { recursive: true });
signedOff('t-write', path.join(work, 'write'));
fs.writeFileSync(path.join(root, 'runs', 'f-notes.json'), JSON.stringify({
  id: 'f-notes', place: { kind: 'folder' }, workspace: work, brief: 'Write a note.', createdAt: at,
  workflowDir: path.join(root, 'no-such-workflow'),
  workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'claude', workspace: 'folder' }],
  steps: { write: { taskId: 't-write', workspace: path.join(work, 'write'), branch: null } },
}));

test('the runs list shows a folder run with no repository, and says its kind', async () => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  const run = ((await res.json()) as { id: string; repo: unknown; place: unknown }[]).find((r) => r.id === 'f-notes');
  assert.ok(run, 'the folder run is listed');
  assert.equal(run.repo, null);
  assert.equal(run.place, 'folder');
});

test("a folder run's detail has no repository, base, branch or isolation, and its step's folder", async () => {
  const res = await app.request('/api/runs/f-notes');
  assert.equal(res.status, 200);
  const run = (await res.json()) as Record<string, unknown> & { steps: { name: string; workspace: string | null; branch: string | null; status: string }[] };
  assert.deepEqual([run.repo, run.baseRef, run.branch, run.isolate, run.place], [null, null, null, null, 'folder']);
  const [write] = run.steps;
  assert.deepEqual([write!.name, write!.workspace, write!.branch], ['write', path.join(work, 'write'), null]);
});

test("a folder run's decision reads, with nothing to merge", async () => {
  const res = await app.request('/api/runs/f-notes/decision');
  assert.equal(res.status, 200);
  const decision = (await res.json()) as { standings: unknown[]; touched: unknown[]; commands: unknown[] };
  // No branch to stand against the base, none touched to diff, and no command to merge one.
  assert.deepEqual([decision.standings, decision.touched, decision.commands], [[], [], []]);
});
