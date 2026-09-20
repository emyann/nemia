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

// What the step left in its folder: the note it named in its closeout and the sketch it did not, a file of bytes, a directory,
// a link that leads out of the folder, and a name the files route refuses. All but the first three are things the folder holds
// that no name can reach, and the listing leaves them out.
const wrote = path.join(work, 'write');
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
fs.writeFileSync(path.join(wrote, 'note.md'), 'The tides.\n');
fs.writeFileSync(path.join(wrote, 'sketch.png'), PNG);
fs.writeFileSync(path.join(wrote, 'bundle.zip'), 'PK');
fs.writeFileSync(path.join(wrote, '..hidden.md'), 'not reachable by name');
fs.mkdirSync(path.join(wrote, 'scratch'), { recursive: true });
fs.writeFileSync(path.join(root, 'runs', 'f-notes', 'outside.md'), 'outside the folder');
fs.symlinkSync(path.join(root, 'runs', 'f-notes', 'outside.md'), path.join(wrote, 'link.md'));

/** A word about git, which a person reading a folder run must not meet: it has no repository, no branch and nothing to merge. */
const GIT_WORD = /\b(branch|base|merge|merged|diff|commit|worktree|repository|repo|git)\b/i;

test('the runs list shows a folder run with no repository, and says its kind', async () => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  const run = ((await res.json()) as { id: string; repo: unknown; place: unknown }[]).find((r) => r.id === 'f-notes');
  assert.ok(run, 'the folder run is listed');
  assert.equal(run.repo, null);
  assert.equal(run.place, 'folder');
});

test("a folder run's detail has no repository, base, branch or isolation — where its work is instead, and its step's folder", async () => {
  const res = await app.request('/api/runs/f-notes');
  assert.equal(res.status, 200);
  const run = (await res.json()) as Record<string, unknown> & { steps: { name: string; workspace: string | null; branch: string | null; note: string | null; status: string }[] };
  assert.deepEqual([run.repo, run.baseRef, run.branch, run.isolate, run.place], [null, null, null, null, 'folder']);
  // The one thing a person needs to find what it made, where a git run has a repository and a branch.
  assert.equal(run.work, work);
  const [write] = run.steps;
  assert.deepEqual([write!.name, write!.workspace, write!.branch], ['write', path.join(work, 'write'), null]);
  // And the sentences it carries — what the board reads out loud — name no git.
  for (const said of [run.warning, run.fromNote, ...run.steps.map((s) => s.note)]) {
    if (typeof said === 'string') assert.doesNotMatch(said, GIT_WORD, said);
  }
});

test("a folder run's decision reads, with nothing to merge and nothing about git", async () => {
  const res = await app.request('/api/runs/f-notes/decision');
  assert.equal(res.status, 200);
  const decision = (await res.json()) as {
    standings: unknown[]; touched: unknown[]; sensitive: unknown[];
    commands: { label: string; command: string; said: string | null }[];
    lesson: { said: string }; overBudget: string | null;
  };
  // No branch to stand against a base, none touched to diff, and none read in full.
  assert.deepEqual([decision.standings, decision.touched, decision.sensitive], [[], [], []]);
  // What `wf decide` offers instead: the one command, and nothing to merge or delete (cli.ts, `!git`).
  assert.deepEqual(decision.commands, [{ label: 'forget it', command: 'wf rm f-notes', said: 'forgets the run with its folders and files' }]);
  // Every sentence the board shows out of this answer, read for a git word. The lesson line is about a branch's diff, so the board
  // does not draw it for a folder run; it is checked here so a change that starts drawing it fails.
  for (const said of [...decision.commands.flatMap((c) => [c.command, c.said ?? '']), decision.overBudget ?? '']) {
    assert.doesNotMatch(said, GIT_WORD, said);
  }
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

test("a folder step carries every file its folder holds, by name, with its size and where the api serves it", async () => {
  const run = (await (await app.request('/api/runs/f-notes')).json()) as { steps: { files: { path: string; name?: string; url?: string; kind?: string; size?: number }[] }[] };
  const [write] = run.steps;
  // In name order, and only what a name reaches: not the directory, not the link out of the folder, not the name the route refuses.
  assert.deepEqual(write!.files, [
    { path: path.join(wrote, 'bundle.zip'), name: 'bundle.zip', url: '/api/runs/f-notes/steps/write/files/bundle.zip', kind: 'other', size: 2 },
    { path: path.join(wrote, 'note.md'), name: 'note.md', url: '/api/runs/f-notes/steps/write/files/note.md', kind: 'text', size: 11 },
    { path: path.join(wrote, 'sketch.png'), name: 'sketch.png', url: '/api/runs/f-notes/steps/write/files/sketch.png', kind: 'image', size: PNG.length },
  ]);
});

test("a folder step's file is served by name, and a name that is a path, or not in the folder, is refused", async () => {
  const base = '/api/runs/f-notes/steps/write/files';

  const note = await app.request(`${base}/note.md`);
  assert.deepEqual(
    [note.status, note.headers.get('content-type'), note.headers.get('cache-control'), note.headers.get('x-content-type-options'), await note.text()],
    [200, 'text/plain; charset=utf-8', 'no-store', 'nosniff', 'The tides.\n'],
  );
  // An agent's text on the board's origin runs no script of its, as a step's named file does not.
  assert.ok((note.headers.get('content-security-policy') ?? '').split(/\s*;\s*/).includes('sandbox'));
  assert.deepEqual(Buffer.from(await (await app.request(`${base}/sketch.png`)).arrayBuffer()), PNG);

  // Every one of these names a file on disk: only the refusal stands between it and the response. An encoded `..` alone never
  // reaches the route — a URL resolves it — so the path is spelled with the separator encoded instead.
  for (const name of ['..%2Foutside.md', 'scratch%2Fnothing.md', 'a%5Cb.md', '..hidden.md']) {
    const res = await app.request(`${base}/${name}`);
    assert.equal(res.status, 400, name);
    assert.match((await res.json() as { error: string }).error, /is not the name of a file: a name has no `\/`, `\\`, or `\.\.`/, name);
  }
  // Not a regular file in the folder: absent, a directory, and a link that leads out of it.
  for (const name of ['gone.md', 'scratch', 'link.md']) {
    const res = await app.request(`${base}/${name}`);
    assert.equal(res.status, 404, name);
    assert.match((await res.json() as { error: string }).error, /has no file '.*' in its folder/, name);
  }
});
