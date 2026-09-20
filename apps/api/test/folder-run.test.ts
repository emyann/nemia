/**
 * A folder run (`workspace: folder`, `place: { kind: 'folder' }` on the record), as the board reads it: no repository, no base, no
 * branch. The list, the detail and the decision answer for it without throwing, and say what the record says — null where a git run
 * has a repository — rather than a git run's words. In a scratch store, with no git repository anywhere.
 *
 * And a folder team as the board finds and files for it, with the repository the api is pointed at a plain directory that is no
 * repository at all: `repoOf` resolves a path and never asks git, so the api runs, the store's own workflows list, and a card for a
 * team that works in folders is filed with no `repo:` — and refused with one.
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
// What the board is pointed at: a plain directory, no git, no `workflows/` of its own. The api reads it as any repository.
const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-folder-here-'));
process.env.HKB_REPO = notARepo;

// A folder team of the store's own, as `workflows/note` is: every step says `workspace: folder`, so it looks at no repository.
const team = path.join(root, 'workflows', 'notes');
fs.mkdirSync(team, { recursive: true });
fs.writeFileSync(path.join(team, 'write.md'), '---\nworkspace: folder\npermissionMode: dontAsk\nallow: Edit(**)\n---\nWrite the note.\n');
// And one that works on a repository, to hold the two apart.
const onRepo = path.join(root, 'workflows', 'change');
fs.mkdirSync(onRepo, { recursive: true });
fs.writeFileSync(path.join(onRepo, 'implement.md'), '---\n---\nMake the change.\n');

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

test('the workflows listing says which teams work in folders, with the repository a plain directory', async () => {
  const res = await app.request('/api/workflows');
  assert.equal(res.status, 200);
  const listed = (await res.json()) as { name: string; from: string; folderTeam: boolean; error: string | null }[];
  // The board runs pointed at a directory that is no repository: `repoOf` resolves a path and never asks git, so the store's own list.
  const folderTeams = listed.filter((w) => w.folderTeam).map((w) => w.name);
  assert.deepEqual(folderTeams, ['notes'], listed.map((w) => `${w.name} (${w.from}) ${w.folderTeam}`).join(', '));
  assert.equal(listed.find((w) => w.name === 'change')?.folderTeam, false, 'a team that works on a repository is not one');
});

test('REFUSED: POST /api/inbox files a card for a folder team with a repository — filed without one, refused with one', async () => {
  const json = { 'content-type': 'application/json' };
  const filed = await app.request('/api/inbox', { method: 'POST', headers: json, body: JSON.stringify({ body: 'a note on tides', workflow: 'notes', from: 'yours' }) });
  assert.equal(filed.status, 201);
  assert.equal(((await filed.json()) as { repo: string | null }).repo, null, 'filed with no repository');

  const refused = await app.request('/api/inbox', { method: 'POST', headers: json, body: JSON.stringify({ body: 'a note on tides', workflow: 'notes', from: 'yours', repo: notARepo }) });
  assert.equal(refused.status, 422);
  const { error } = (await refused.json()) as { error: string };
  assert.match(error, /^--repo .*: this card's workflow has steps that say `workspace: folder`/);
  assert.match(error, /File the card without a repository, or name a workflow whose steps work on one\.$/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'inbox')).length, 1, 'nothing more written');
});
