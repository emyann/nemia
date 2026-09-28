/**
 * A finished run pruned on the board (`POST /api/runs/:id/prune`), as `wf prune <run> --yes` prunes it: its worktrees removed, and its files
 * with `artifacts`, its record and every branch kept; the list and the page say it was pruned in the package's words. And every refusal
 * refused, in `wf prune`'s own words, with nothing touched: a run not over, a finished run nobody merged without `unmerged`, a run pruned
 * already, a folder run, a run the store has not, a body that is not the two switches, and a request from anywhere but the board.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, git for real — branches, a merge, a worktree cut for each run — and
 * the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store as its modules load: set first.
const root = scratch('hkb-api-prune-');
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { engine, prune, prunedKept, prunedWords, readRun } = await import('agent-orchestrator');

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const base = git('rev-parse', 'HEAD').trim();

const T0 = Date.parse('2026-09-28T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const journal = (taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((event) => `${JSON.stringify(event)}\n`).join(''));
const filed = { kind: 'filed', at: at(0), brief: 'Do it.', cwd: repo, maxAttempts: 1, harness: 'codex' };
const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
const signedOff = (taskId: string) => journal(taskId, [
  filed,
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
  { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout: DONE },
  { kind: 'settled', at: at(9), outcome: 'succeeded' },
]);
const working = (taskId: string) => journal(taskId, [filed, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(1), attempt: 1 }]);

const implement = { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' };
const worktreeOf = (id: string) => path.join(root, 'worktrees', id, 'implement');
const filesDir = (id: string) => path.join(root, 'runs', id, 'artifacts');
const branchOf = (id: string) => `wf/${id}/implement`;

/**
 * A git run of one step, `implement`, as `wf start` and the tick leave it: a result branch off main with its work committed — merged back
 * with `--no-ff` when `merge` says so — checked out in the step's worktree under the store, a file in the run's files directory, and the
 * step's task signed off and handed off, or still working.
 */
function gitRun(id: string, { merge, working: busy = false }: { merge: boolean; working?: boolean }): void {
  const branch = branchOf(id);
  git('checkout', '-q', '-b', branch);
  fs.writeFileSync(path.join(repo, `${id}.txt`), `${id}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', `the work of ${id}`);
  git('checkout', '-q', 'main');
  if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${branch}`, branch);
  git('worktree', 'add', '-q', worktreeOf(id), branch);
  write(path.join(filesDir(id), 'implement', 'shot.png'), 'a picture');
  const taskId = `${id}-implement`;
  if (busy) working(taskId);
  else signedOff(taskId);
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo, workspace: repo, baseRef: base, branch: 'main', isolate: true, brief: `Run ${id}`, createdAt: at(0),
    workflowDir: path.join(root, 'no-such-workflow'), workflow: [implement],
    steps: { implement: { taskId, workspace: worktreeOf(id), branch, ...(busy ? {} : { handedOff: taskId }) } },
  }));
}

gitRun('p-merged', { merge: true });
gitRun('p-unmerged', { merge: false });
gitRun('p-running', { merge: false, working: true });

// A run whose step failed and whose branch a person merged by hand all the same: on the base, however it got there, so shipped.
gitRun('p-failed-merged', { merge: true });
journal('p-failed-merged-implement', [
  filed,
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
  { kind: 'ended', at: at(9), attempt: 1, sessionId: 'ae/p-failed-merged-implement/1', observed: 'failed', reason: 'harness' },
  { kind: 'settled', at: at(9), outcome: 'failed' },
]);

// A run that worked on main itself (`--no-worktree`): no branch of its own to merge, and it waits on your decision all the same.
signedOff('p-direct-implement');
write(path.join(filesDir('p-direct'), 'implement', 'shot.png'), 'a picture');
write(path.join(root, 'runs', 'p-direct.json'), JSON.stringify({
  id: 'p-direct', repo, workspace: repo, baseRef: base, branch: 'main', isolate: false, brief: 'Run p-direct', createdAt: at(0),
  workflowDir: path.join(root, 'no-such-workflow'), workflow: [implement],
  steps: { implement: { taskId: 'p-direct-implement', workspace: repo, branch: 'main', handedOff: 'p-direct-implement' } },
}));

// A folder run whose one step signed off: its folder is its work, and never pruned.
const work = path.join(root, 'folders', 'p-folder');
fs.mkdirSync(path.join(work, 'write'), { recursive: true });
signedOff('p-folder-write');
write(path.join(root, 'runs', 'p-folder.json'), JSON.stringify({
  id: 'p-folder', place: { kind: 'folder' }, workspace: work, brief: 'Write a note.', createdAt: at(0),
  workflowDir: path.join(root, 'no-such-workflow'),
  workflow: [{ name: 'write', after: [], body: 'Write it.', harness: 'codex', workspace: 'folder' }],
  steps: { write: { taskId: 'p-folder-write', workspace: path.join(work, 'write'), branch: null } },
}));

const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: '127.0.0.1:8787' };
/** A prune as the board sends it: a POST with the two switches as JSON, through the same guard as every write. */
const pruneOn = (id: string, body: unknown = {}, headers: Record<string, string> = BOARD) =>
  app.request(`/api/runs/${id}/prune`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

type Summary = { id: string; pruned: { said: string } | null };
const listed = async (): Promise<Map<string, Summary>> => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  return new Map((await res.json() as Summary[]).map((r) => [r.id, r]));
};
const detail = async (id: string) => {
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200);
  return res.json() as Promise<{
    pruned: { at: string; worktrees: Array<{ path: string }>; artifacts: { at: string } | null } | null;
    onDisk: { worktrees: boolean; files: boolean };
  }>;
};

/**
 * What a refusal must leave as it was: every file of the run in the store's `runs/`, its files directory, its worktree, and every branch.
 */
const stateOf = (id: string) => ({
  runs: Object.fromEntries(fs.readdirSync(path.join(root, 'runs'))
    .filter((name) => name.startsWith(`${id}.`) && fs.statSync(path.join(root, 'runs', name)).isFile())
    .map((name) => [name, fs.readFileSync(path.join(root, 'runs', name), 'utf8')])),
  files: fs.existsSync(filesDir(id)),
  worktree: fs.existsSync(worktreeOf(id)),
  branches: git('branch', '--list', '--format=%(refname:short) %(objectname)').split('\n').filter(Boolean).sort(),
});
const hasBranch = (branch: string) => git('branch', '--list', branch).trim() !== '';

/** What `wf prune` says, without `--yes`, of the same run with the same switches: the words a refusal on the board must be. */
const packageSays = async (id: string, how: { artifacts?: boolean; unmerged?: boolean } = {}) => prune(engine(), id, how);

test("the decision's `awaiting` is what `wf prune` refuses without `--unmerged`: a run nobody merged, and one that worked on its base branch itself, whatever its outcome — never a failed run merged by hand", async () => {
  const awaiting = new Map<string, unknown>();
  for (const id of ['p-merged', 'p-unmerged', 'p-running', 'p-failed-merged', 'p-direct']) {
    const res = await app.request(`/api/runs/${id}/decision`);
    assert.equal(res.status, 200, id);
    const body = await res.json() as { awaiting?: unknown };
    awaiting.set(id, body.awaiting ?? null);
    const said = await packageSays(id, { artifacts: true });
    const refusedUnmerged = said.kind === 'refused' && said.refusal.includes(`wf prune ${id} --unmerged`);
    assert.equal(body.awaiting != null, refusedUnmerged, `${id}: ${JSON.stringify(body)} beside ${JSON.stringify(said)}`);
  }
  assert.deepEqual(Object.fromEntries(awaiting), {
    'p-merged': null,
    'p-unmerged': { branches: [branchOf('p-unmerged')], direct: false },
    'p-running': null,
    'p-failed-merged': null,
    'p-direct': { branches: ['main'], direct: true },
  });
});

test('a finished, merged run pruned on the board with its files is pruned as `wf prune --artifacts --yes` prunes it: worktree and files gone, marker written, branch kept, and the list and the page say so', async () => {
  const before = await listed();
  assert.equal(before.get('p-merged')!.pruned, null, 'a run nobody pruned says nothing of it');
  assert.deepEqual((await detail('p-merged')).onDisk, { worktrees: true, files: true }, 'its page says what a prune would find');
  const res = await pruneOn('p-merged', { artifacts: true });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.pruned, true);
  assert.deepEqual(body.worktrees.map((w: { path: string }) => w.path), [worktreeOf('p-merged')]);
  assert.equal(body.artifacts.path, filesDir('p-merged'));
  assert.deepEqual(body.left, []);
  assert.match(body.lines[0], /^p-merged {2}pruned: removed 1 worktree and its files, .* freed; its record and branches are kept$/);
  assert.equal(fs.existsSync(worktreeOf('p-merged')), false, 'its worktree is gone');
  assert.equal(fs.existsSync(filesDir('p-merged')), false, 'its files are gone');
  assert.ok(fs.existsSync(path.join(root, 'runs', 'p-merged.pruned')), 'it is marked pruned');
  assert.ok(hasBranch(branchOf('p-merged')), 'its branch is kept');
  assert.ok(fs.existsSync(path.join(root, 'runs', 'p-merged.json')), 'its record is kept');

  const pruned = readRun('p-merged').pruned!;
  assert.ok(pruned.artifacts, 'the marker says the files went');
  const run = (await listed()).get('p-merged')!;
  assert.deepEqual(run.pruned, { said: `${prunedWords(pruned)}; ${prunedKept(pruned)}` });
  assert.match(run.pruned!.said, /its worktrees were removed \(wf prune\), and its files were removed at .* \(wf prune --artifacts\); its branches and record are kept$/);
  const page = await detail('p-merged');
  assert.equal(page.pruned!.artifacts!.at, pruned.artifacts.at);
  assert.deepEqual(page.pruned!.worktrees.map((w) => w.path), [worktreeOf('p-merged')]);
  // Nothing left for a prune to find, so the board offers none: the prune that follows would be `nothing` (the next test).
  assert.deepEqual(page.onDisk, { worktrees: false, files: false });
});

test('REFUSED at shipped defaults: a run pruned already, with its files, is a 409 in the words of `wf prune`, and nothing is touched', async () => {
  for (const how of [{}, { artifacts: true }, { artifacts: true, unmerged: true }]) {
    const before = stateOf('p-merged');
    const said = await packageSays('p-merged', how);
    assert.equal(said.kind, 'nothing');
    const res = await pruneOn('p-merged', how);
    assert.equal(res.status, 409, JSON.stringify(how));
    assert.equal((await res.json()).error, `Nothing to prune: ${said.nothing}.`);
    assert.deepEqual(stateOf('p-merged'), before, JSON.stringify(how));
  }
});

test('REFUSED at shipped defaults: a finished run nobody merged, pruned without `unmerged`, is a 409 in the words of `wf prune`, naming `--unmerged`, and nothing is touched', async () => {
  for (const how of [{}, { artifacts: true }]) {
    const before = stateOf('p-unmerged');
    const said = await packageSays('p-unmerged', how);
    assert.equal(said.kind, 'refused');
    const res = await pruneOn('p-unmerged', how);
    assert.equal(res.status, 409, JSON.stringify(how));
    const { error } = await res.json();
    assert.equal(error, said.refusal);
    assert.match(error, /it finished and is not merged into main: pruned, none of its steps can be tried again, sent round or approved, and its branch is the one place its work is left/);
    assert.ok(error.includes(`wf prune p-unmerged --unmerged${how.artifacts ? ' --artifacts' : ''}`), error);
    assert.deepEqual(stateOf('p-unmerged'), before, JSON.stringify(how));
  }
});

test('a finished run nobody merged, pruned with `unmerged`, loses its worktree and keeps its branch — the only copy of its work — and its files', async () => {
  const res = await pruneOn('p-unmerged', { unmerged: true });
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(worktreeOf('p-unmerged')), false, 'its worktree is gone');
  assert.ok(hasBranch(branchOf('p-unmerged')), 'its branch is kept');
  assert.ok(fs.existsSync(filesDir('p-unmerged')), 'its files are kept without `artifacts`');
  const pruned = readRun('p-unmerged').pruned!;
  assert.equal(pruned.artifacts, undefined);
  assert.deepEqual((await listed()).get('p-unmerged')!.pruned, { said: `${prunedWords(pruned)}; ${prunedKept(pruned)}` });
  assert.match((await listed()).get('p-unmerged')!.pruned!.said, /; its branches, record and files are kept$/);
  // Its files are still there to give back, and nothing else.
  assert.deepEqual((await detail('p-unmerged')).onDisk, { worktrees: false, files: true });
});

test('REFUSED at shipped defaults: a run not over is a 409 in the words of `wf prune`, whatever the switches, and nothing is touched', async () => {
  for (const how of [{}, { unmerged: true }, { artifacts: true, unmerged: true }]) {
    const before = stateOf('p-running');
    const said = await packageSays('p-running', how);
    assert.equal(said.kind, 'refused');
    const res = await pruneOn('p-running', how);
    assert.equal(res.status, 409, JSON.stringify(how));
    const { error } = await res.json();
    assert.equal(error, said.refusal);
    assert.match(error, /^it is not over — wf decide p-running says it is still running/);
    assert.deepEqual(stateOf('p-running'), before, JSON.stringify(how));
  }
});

test('REFUSED at shipped defaults: a folder run is a 409 in the words of `wf prune`, and its folder stays', async () => {
  const said = await packageSays('p-folder', { artifacts: true, unmerged: true });
  const res = await pruneOn('p-folder', { artifacts: true, unmerged: true });
  assert.equal(res.status, 409);
  const { error } = await res.json();
  assert.equal(error, said.refusal);
  assert.match(error, /^a folder run: its steps' folders are its work/);
  assert.ok(fs.existsSync(path.join(work, 'write')));
  assert.equal(fs.existsSync(path.join(root, 'runs', 'p-folder.pruned')), false);
});

test('REFUSED at shipped defaults: a prune of a run the store has not — none by that id, an id no run can have — is a 404, and nothing is written', async () => {
  for (const id of ['no-such-run', 'Not_A_Run']) {
    const before = fs.readdirSync(path.join(root, 'runs')).sort();
    const res = await pruneOn(id, { artifacts: true });
    assert.equal(res.status, 404, id);
    assert.match((await res.json()).error, new RegExp(`^No run '${id}' in this store`), id);
    assert.deepEqual(fs.readdirSync(path.join(root, 'runs')).sort(), before, id);
  }
});

test('REFUSED at shipped defaults: a body that is not `wf prune`\'s two switches is a 400, before the run is read, and nothing is touched', async () => {
  gitRun('p-body', { merge: true });
  const cases: Array<[unknown, RegExp]> = [
    ['not json', /^POST …\/prune takes a JSON body: `\{ "artifacts"\?: boolean, "unmerged"\?: boolean \}`\.$/],
    [[], /^POST …\/prune takes a JSON object/],
    ['null', /^POST …\/prune takes a JSON object/],
    [{ artifacts: 'yes' }, /^POST …\/prune takes `artifacts` as true or false — `wf prune`'s --artifacts — and this request sent "yes"\.$/],
    [{ unmerged: 1 }, /^POST …\/prune takes `unmerged` as true or false — `wf prune`'s --unmerged — and this request sent 1\.$/],
    [{ yes: true, force: true }, /^POST …\/prune does not take `yes`, `force`/],
  ];
  for (const [body, words] of cases) {
    const before = stateOf('p-body');
    const res = await pruneOn('p-body', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, words);
    assert.deepEqual(stateOf('p-body'), before, JSON.stringify(body));
  }
  // The same run, sent the switches as the board sends them, is pruned: the refusals above were of the body alone.
  assert.equal((await pruneOn('p-body', { artifacts: false })).status, 200);
});

test('REFUSED at shipped defaults: a prune from a page on another site, addressed to another name, or not sent as JSON, before anything is read, and the run stands', async () => {
  gitRun('p-guard', { merge: true });
  const cases: Array<[Record<string, string>, number, RegExp]> = [
    [{ ...BOARD, 'sec-fetch-site': 'cross-site' }, 403, /refuses a request made by a page on another site/],
    [{ ...BOARD, 'sec-fetch-site': 'same-site' }, 403, /refuses a request made by a page on another site/],
    [{ ...BOARD, host: 'evil.example:8787' }, 403, /refuses a request addressed to evil\.example:8787/],
    [{ ...BOARD, 'content-type': 'text/plain' }, 415, /takes its body as `content-type: application\/json`/],
  ];
  for (const [headers, status, words] of cases) {
    const before = stateOf('p-guard');
    const res = await pruneOn('p-guard', { artifacts: true }, headers);
    assert.equal(res.status, status, JSON.stringify(headers));
    const { error } = await res.json();
    assert.match(error, words);
    assert.match(error, /^POST \/api\/runs\/p-guard\/prune /);
    assert.deepEqual(stateOf('p-guard'), before, JSON.stringify(headers));
  }
});
