/**
 * The list's memo of runs at rest (`resting.ts`): `GET /api/runs` answers a finished run from memory while nothing it was judged on has
 * moved, so a poll reads the journals of the runs still moving and of none other — and answers afresh the moment anything it watches does:
 * the run's record, a file a person writes beside it, a line of its tasks on the engine's feed, a tip of a branch git was asked about, or the
 * record gone. Every api test runs with `WF_VERIFY_REST=1` (test/harness.ts), which judges each kept answer afresh too and fails the request
 * on a difference; the tests here turn it off where they measure what the memo saves, or ask whether it saw a change on its own.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store as its modules load: set first.
const root = scratch('hkb-api-resting-');
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { resting } = await import('../src/runs.ts');
const { e, findRun } = await import('../src/store.ts');
const { restingRead } = await import('../src/resting.ts');

const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git(repo, 'init', '-q', '-b', 'main');
write(path.join(repo, 'README.md'), '# app\n');
git(repo, 'add', '-A');
git(repo, 'commit', '-q', '-m', 'base');
const base = git(repo, 'rev-parse', 'HEAD').trim();

/** A branch off main with one commit of work on it; the checkout is left on main. */
function branchOff(branch: string) {
  git(repo, 'checkout', '-q', '-b', branch);
  write(path.join(repo, `${branch.replaceAll('/', '-')}.txt`), branch);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', `the work of ${branch}`);
  git(repo, 'checkout', '-q', 'main');
}

const at = '2026-09-25T09:00:00.000Z';
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const journal = (taskId: string) => path.join(root, 'engine', 'tasks', `${taskId}.jsonl`);
/** A line on the engine's feed, as every append to a journal writes one: what takes a run out of the memo. */
const fed = (taskId: string, kind: string) =>
  fs.appendFileSync(path.join(root, 'engine', 'feed.jsonl'), `${JSON.stringify({ taskId, event: { kind, at } })}\n`);

const started = () => [
  { kind: 'filed', at, brief: 'Do it.', cwd: repo, maxAttempts: 1, harness: 'codex' },
  { kind: 'starting', at, attempt: 1 },
  { kind: 'spawned', at, attempt: 1 },
];
const signedOff = (taskId: string) =>
  write(
    journal(taskId),
    jsonl([
      ...started(),
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] },
      },
      { kind: 'settled', at, outcome: 'succeeded' },
    ]),
  );
const running = (taskId: string) => write(journal(taskId), jsonl(started()));
const blocked = (taskId: string) =>
  write(
    journal(taskId),
    jsonl([
      ...started(),
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: `ae/${taskId}/1`,
        observed: 'done',
        reason: 'harness',
        closeout: { outcome: 'blocked', summary: 'Could not.', needs: 'a key', artifacts: [] },
      },
      { kind: 'settled', at, outcome: 'failed' },
    ]),
  );

const PLAIN = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];

/** A run of one step that signed off on a branch of its own, left unmerged: a person's to merge. */
function aFinishedRun(id: string, brief = 'Decide it') {
  branchOff(`wf/${id}/implement`);
  signedOff(`${id}-implement`);
  writeRun(id, brief);
}
function writeRun(id: string, brief: string) {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify(
      {
        id,
        repo,
        baseRef: base,
        workspace: repo,
        branch: 'main',
        isolate: true,
        brief,
        createdAt: at,
        workflowDir: path.join(root, 'no-such-workflow'),
        workflow: PLAIN,
        steps: { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` } },
      },
      null,
      2,
    ),
  );
}

type Listed = { id: string; status: string; brief: string; moving: boolean; toDecide: { kind: string } | null; waitingOnYou: string[] };
const list = async () => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as Listed[];
};
const listed = async (id: string) => (await list()).find((r) => r.id === id);

/** With the memo's check off: what the memo alone answers. */
async function unverified<T>(f: () => Promise<T>): Promise<T> {
  process.env.WF_VERIFY_REST = '0';
  try {
    return await f();
  } finally {
    process.env.WF_VERIFY_REST = '1';
  }
}

aFinishedRun('r-rest');
running('r-moving-implement');
branchOff('wf/r-moving/implement');
writeRun('r-moving', 'Still going');

test("a finished run is kept and a moving one is not, and a poll then reads the moving run's journal alone", async () => {
  await list();
  const first = await list();
  assert.equal(first.find((r) => r.id === 'r-rest')?.status, 'succeeded');
  assert.equal(first.find((r) => r.id === 'r-rest')?.toDecide?.kind, 'git', 'a branch nobody merged: git was asked about it');
  assert.ok(resting.runs.has('r-rest'), 'kept');
  assert.ok(!resting.runs.has('r-moving'), 'not kept: its task is in flight');

  const reads = e.io().reads;
  const hits = resting.hits;
  const again = await unverified(list);
  assert.deepEqual(again, first, 'the same answer from memory');
  assert.equal(e.io().reads - reads, 1, "the moving run's one journal, and not the finished run's");
  assert.equal(resting.hits - hits, 1);
});

test('a record rewritten is judged afresh', async () => {
  await list();
  assert.ok(resting.runs.has('r-rest'));
  writeRun('r-rest', 'Decide it again');
  assert.equal((await unverified(() => listed('r-rest')))?.brief, 'Decide it again');
});

test('a file a person writes beside the run is judged afresh: a retry asked of a failed run', async () => {
  aFinishedRun('r-ask');
  blocked('r-ask-implement');
  await list();
  assert.ok(resting.runs.has('r-ask'));
  const before = await listed('r-ask');
  assert.equal(before?.status, 'failed');
  write(path.join(root, 'runs', 'r-ask.asks', 'retry-implement-2'), JSON.stringify({ mode: 'fresh', at }));
  const after = await unverified(() => listed('r-ask'));
  assert.notDeepEqual(after, before, 'the ask moved the answer');
  assert.deepEqual(after, await listed('r-ask'), 'and the answer is the fresh one');
});

test("a line on the engine's feed for a task of the run is judged afresh: its journal changed", async () => {
  aFinishedRun('r-fed');
  await list();
  assert.ok(resting.runs.has('r-fed'));
  blocked('r-fed-implement');
  fed('r-fed-implement', 'settled');
  assert.equal((await unverified(() => listed('r-fed')))?.status, 'failed');
});

test("a journal changed with no line on the feed is not seen: the feed is what the memo watches, as the tick's does", async () => {
  aFinishedRun('r-unfed');
  await list();
  const was = resting.runs.get('r-unfed');
  assert.ok(was);
  write(journal('r-unfed-implement'), jsonl([...started('r-unfed-implement'), { kind: 'settled', at, outcome: 'failed' }]));
  assert.equal((await unverified(() => listed('r-unfed')))?.status, 'succeeded', 'from memory');
  const res = await app.request('/api/runs');
  assert.equal(res.status, 500, 'and the check says the memo answered wrong');
  fed('r-unfed-implement', 'settled');
  assert.equal((await listed('r-unfed'))?.status, 'failed');
});

test("a branch tip that moves is judged afresh: the base branch taking the run's work", async () => {
  aFinishedRun('r-merged');
  await list();
  assert.ok(resting.runs.has('r-merged'));
  assert.equal((await listed('r-merged'))?.toDecide?.kind, 'git');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'wf/r-merged/implement');
  assert.equal((await unverified(() => listed('r-merged')))?.toDecide, null, 'on the base now: nothing to decide');
});

test('a run removed from the store leaves the memo', async () => {
  aFinishedRun('r-gone');
  await list();
  assert.ok(resting.runs.has('r-gone'));
  fs.rmSync(path.join(root, 'runs', 'r-gone.json'));
  assert.equal(await unverified(() => listed('r-gone')), undefined);
  assert.ok(!resting.runs.has('r-gone'));
});

test("runs waiting on the same run read its journals once between them, off the request's one list", async () => {
  aFinishedRun('r-parent');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'wf/r-parent/implement');
  const child = (id: string) =>
    write(
      path.join(root, 'runs', `${id}.json`),
      JSON.stringify(
        {
          id,
          repo,
          baseRef: base,
          workspace: repo,
          branch: 'main',
          isolate: true,
          brief: 'After the parent',
          createdAt: at,
          workflowDir: path.join(root, 'no-such-workflow'),
          workflow: PLAIN,
          after: ['r-parent'],
          steps: { implement: { taskId: null } },
        },
        null,
        2,
      ),
    );
  child('r-child-1');
  await list();
  const cost = async () => {
    const reads = e.io().reads;
    await unverified(list);
    return e.io().reads - reads;
  };
  const one = await cost();
  child('r-child-2');
  await list();
  assert.equal(
    await cost(),
    one,
    "a second run waiting on the parent reads no journal more: the parent's tasks are among the request's views",
  );
});

test('two requests at once: one that read the feed before the other read on past a line of its run keeps nothing', async () => {
  aFinishedRun('r-raced');
  const answer = await listed('r-raced');
  assert.ok(answer && resting.runs.has('r-raced'));
  resting.runs.delete('r-raced'); // not yet kept, as on the request that first judges it
  const { startedAt: _, ...judged } = answer as Listed & { startedAt?: unknown };

  const first = await restingRead(resting, false); // the first request reads the feed, then the run's journal, judged succeeded
  blocked('r-raced-implement');
  fed('r-raced-implement', 'settled'); // a line of its task, before the first request keeps what it judged
  await restingRead(resting, false); // the second reads the feed on past the line: the run is not kept, so nothing is taken out
  first.keep(findRun('r-raced')!, judged as never, [], () => new Map());
  assert.ok(!resting.runs.has('r-raced'), 'kept nothing: the line is past where the first request read, and no request will read it again');
  assert.equal((await unverified(() => listed('r-raced')))?.status, 'failed');

  const alone = await restingRead(resting, false);
  alone.keep(findRun('r-raced')!, judged as never, [], () => new Map());
  assert.ok(resting.runs.has('r-raced'), 'a request no other overtook keeps what it judged');
  resting.runs.delete('r-raced');
});

test('REFUSED: an answer kept wrong fails the request under WF_VERIFY_REST, and is served without it', async () => {
  aFinishedRun('r-poisoned');
  await list();
  const kept = resting.runs.get('r-poisoned');
  assert.ok(kept);
  resting.runs.set('r-poisoned', { ...kept, answer: { ...kept.answer, brief: 'not what the record says' } });
  assert.equal((await unverified(() => listed('r-poisoned')))?.brief, 'not what the record says', 'the memo answers, unchecked');
  const res = await app.request('/api/runs');
  assert.equal(res.status, 500);
  resting.runs.delete('r-poisoned');
  assert.equal((await listed('r-poisoned'))?.brief, 'Decide it');
});
