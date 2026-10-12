/**
 * The list's memo of runs at rest (`restingRead`, the package's rest/resting.verb.ts): `GET /api/runs` answers a finished run from memory
 * while nothing it was judged on has moved, so a poll reads the journals of the runs still moving and of none other — and answers afresh
 * the moment anything it watches does: the run's record, a file a person writes beside it, a line of its tasks on the engine's feed, a tip
 * of a branch as the tick's last pass read it (`standing.json`, written here as a pass writes it: `aPass`), or the record gone. Every api
 * test runs with `WF_VERIFY_REST=1` (test/harness.ts), which judges each kept answer afresh too and fails the request on a difference; the
 * tests here turn it off where they measure what the memo saves, or ask whether it saw a change on its own. What a poll read is what the
 * api's `api.poll.reads` counts for it (`served`, layer.ts).
 *
 * At shipped defaults: the api's own engine over a store this file seeds, the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { execFileSync } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { app, runtime } from '../app.ts';
import { ReadMemo } from '../layer.ts';
import type { MetricRead } from '../factory/ceilings.ts';
import { Engine, findRun } from '../store.ts';
import {
  approveRun,
  engine,
  passStanding,
  restingRead,
  runStore,
  type RunSummary,
  standingReader,
  standingSnapshot,
  verifiesRest,
} from 'agent-orchestrator';
import { runTasks } from 'agent-orchestrator/run';
import { runWith } from '../../test/placed.ts';

/** The engine the app's requests read through: its reads are what a poll costs. */
const e = await runtime.runPromise(Engine.useSync((engine) => engine));
/** Where branches stand as the board reads them, off `standing.json` (`standingSnapshot`). */
const snapshotGit = async () => standingReader(await runWith(e, standingSnapshot()));
/**
 * A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what the list reads, and a tip it
 * read is one the memo watches.
 */
const aPass = () => runWith(e, passStanding(runStore.runs.list()));
/** The list's memo of runs at rest, the app's own (`ReadMemo`). */
const { resting } = await runtime.runPromise(ReadMemo.useSync((memo) => memo));

const git = (repo: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );

/** A file written whole, by a rename over it: as a hand edit of a journal must be, since the engine reads one only past what it kept. */
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.new`, text);
  fs.renameSync(`${file}.new`, file);
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
/** A line on the engine's feed, as every append to a journal writes one: what takes a run out of the memo. Its task settled again. */
const fed = (taskId: string) =>
  fs.appendFileSync(
    path.join(root, 'engine', 'feed.jsonl'),
    `${JSON.stringify({ taskId, event: { kind: 'settled', at, outcome: 'succeeded' } })}\n`,
  );

/** A line appended to a task's journal, then the same event on the engine's feed, as the runtime's every append writes the two. */
const appended = (taskId: string, event: object) => {
  fs.mkdirSync(path.dirname(journal(taskId)), { recursive: true });
  fs.appendFileSync(journal(taskId), `${JSON.stringify(event)}\n`);
  fs.appendFileSync(path.join(root, 'engine', 'feed.jsonl'), `${JSON.stringify({ taskId, event })}\n`);
};

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
function writeRun(id: string, brief: string, check?: string) {
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
        workflow: check ? [{ ...PLAIN[0], check }] : PLAIN,
        steps: {
          implement: {
            taskId: `${id}-implement`,
            branch: `wf/${id}/implement`,
            ...(check ? { check: { taskId: `${id}-implement-check` } } : {}),
          },
        },
      },
      null,
      2,
    ),
  );
}

/** A run of one step that signed off and whose check, `npm test`, exited 1: refused, at rest until a person retries it. */
function aRefusedRun(id: string) {
  aFinishedRun(id);
  write(
    journal(`${id}-implement-check`),
    jsonl([
      { ...started()[0], brief: 'npm test', harness: 'check' },
      ...started().slice(1),
      { kind: 'ended', at, attempt: 1, sessionId: `ae/${id}-implement-check/1`, observed: 'failed', reason: 'harness', exitCode: 1 },
      { kind: 'settled', at, outcome: 'failed' },
    ]),
  );
  writeRun(id, 'Refuse it', 'npm test');
}

/**
 * The journals `f` asks the engine for: a task it views, and each task a list answers, read or unreadable. What a poll costs whether or
 * not the engine's reader reads their bytes again: it reads a journal only for what was appended since it last read it.
 */
async function journalsAsked<T>(f: () => Promise<T>): Promise<{ value: T; asked: number }> {
  const { view, list } = e;
  let asked = 0;
  Object.assign(e, {
    view: (taskId: string) => {
      asked++;
      return view(taskId);
    },
    list: (...args: unknown[]) =>
      Effect.map(Reflect.apply(list, e, args) as ReturnType<typeof list>, (listed) => {
        asked += listed.views.length + listed.unreadable.length;
        return listed;
      }),
  });
  try {
    return { value: await f(), asked };
  } finally {
    Object.assign(e, { view, list });
  }
}

const list = async () => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()) as RunSummary[];
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
await aPass();

test("a finished run is kept and a moving one is not, and a poll then reads the moving run's journal alone", async () => {
  await list();
  const first = await list();
  assert.equal(first.find((r) => r.id === 'r-rest')?.status, 'succeeded');
  assert.equal(first.find((r) => r.id === 'r-rest')?.toDecide?.kind, 'result', 'a branch nobody merged: git was asked about it');
  assert.ok(resting.runs.has('r-rest'), 'kept');
  assert.ok(!resting.runs.has('r-moving'), 'not kept: its task is in flight');

  const hits = resting.hits;
  const { value: again, asked } = await journalsAsked(() => unverified(list));
  assert.deepEqual(again, first, 'the same answer from memory');
  assert.equal(asked, 1, "the moving run's one journal, and not the finished run's");
  assert.equal(resting.hits - hits, 1);
});

test("a poll's reads are counted into api.poll.reads under /api/runs as the engine counts them, every file it read", async () => {
  const readsOf = async (): Promise<{ count: number; sum: number }> => {
    const res = await app.request('/api/metrics');
    assert.equal(res.status, 200);
    const metric = ((await res.json()) as MetricRead[]).find((m) => m.name === 'api.poll.reads' && m.attributes.route === '/api/runs');
    return { count: metric?.count ?? 0, sum: metric?.sum ?? 0 };
  };
  await list();
  appended('r-moving-implement', { kind: 'said', at, attempt: 1, text: 'Keep going.' });
  const before = await readsOf();
  const reads = Effect.runSync(e.io()).reads;
  await unverified(list);
  const read = Effect.runSync(e.io()).reads - reads;
  const after = await readsOf();
  assert.ok(read > 0, "the line appended to the moving run's journal was read");
  assert.deepEqual(after, { count: before.count + 1, sum: before.sum + read }, "the poll's reads, the engine's own count");
});

test('a record rewritten is judged afresh', async () => {
  await list();
  assert.ok(resting.runs.has('r-rest'));
  writeRun('r-rest', 'Decide it again');
  assert.equal((await unverified(() => listed('r-rest')))?.brief, 'Decide it again');
});

test('a file a person writes beside the run is judged afresh: a retry asked of a blocked run', async () => {
  aFinishedRun('r-ask');
  await aPass();
  blocked('r-ask-implement');
  await list();
  assert.ok(resting.runs.has('r-ask'));
  const before = await listed('r-ask');
  assert.equal(before?.status, 'blocked');
  write(path.join(root, 'runs', 'r-ask.asks', 'retry-implement-2'), JSON.stringify({ mode: 'fresh', at }));
  const after = await unverified(() => listed('r-ask'));
  assert.notDeepEqual(after, before, 'the ask moved the answer');
  assert.deepEqual(after, await listed('r-ask'), 'and the answer is the fresh one');
});

test("a line on the engine's feed for a task of the run is judged afresh: its journal changed", async () => {
  aFinishedRun('r-fed');
  await aPass();
  await list();
  assert.ok(resting.runs.has('r-fed'));
  blocked('r-fed-implement');
  fed('r-fed-implement');
  assert.equal((await unverified(() => listed('r-fed')))?.status, 'blocked');
});

test("a journal changed with no line on the feed is not seen: the feed is what the memo watches, as the tick's does", async () => {
  aFinishedRun('r-unfed');
  await aPass();
  await list();
  const was = resting.runs.get('r-unfed');
  assert.ok(was);
  write(journal('r-unfed-implement'), jsonl([...started(), { kind: 'settled', at, outcome: 'failed' }]));
  assert.equal((await unverified(() => listed('r-unfed')))?.status, 'succeeded', 'from memory');
  const res = await app.request('/api/runs');
  assert.equal(res.status, 500, 'and the check says the memo answered wrong');
  fed('r-unfed-implement');
  assert.equal((await listed('r-unfed'))?.status, 'failed');
});

test("a branch tip that moves is judged afresh once a pass reads it: the base branch taking the run's work", async () => {
  aFinishedRun('r-merged');
  await aPass();
  await list();
  assert.ok(resting.runs.has('r-merged'));
  assert.equal((await listed('r-merged'))?.toDecide?.kind, 'result');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'wf/r-merged/implement');
  assert.equal(
    (await unverified(() => listed('r-merged')))?.toDecide?.kind,
    'result',
    'no pass has read the merge: the list cannot know it',
  );
  assert.ok(resting.runs.has('r-merged'), 'and it is kept, against the tips the last pass read');
  await aPass();
  assert.equal(
    (await unverified(() => listed('r-merged')))?.toDecide,
    null,
    'on the base now, as the next pass read it: nothing to decide',
  );
});

test('REFUSED: a finished run whose branches no pass has read is not kept, and is one to decide once a pass reads them', async () => {
  aFinishedRun('r-unread');
  await list();
  assert.ok(!resting.runs.has('r-unread'), 'where its branch stands is unread: nothing to keep it against');
  assert.equal((await unverified(() => listed('r-unread')))?.toDecide ?? null, null, 'unread decides nothing');
  await aPass();
  assert.equal((await unverified(() => listed('r-unread')))?.toDecide?.kind, 'result', 'read by the pass: ahead of the base');
  assert.ok(resting.runs.has('r-unread'), 'and kept, against the tips the pass read');
});

/**
 * How many child processes `f` started, by any of `node:child_process`'s ways, the named imports of every module included
 * (`syncBuiltinESMExports`): a count the package's own meter does not hold, so a reader that starts one it does not count is counted too.
 */
async function processesOf(f: () => Promise<unknown>): Promise<string[]> {
  const started: string[] = [];
  const kept = WAYS.map((way) => [way, childProcess[way]] as const);
  for (const [way, real] of kept)
    Object.assign(childProcess, {
      [way]: (...args: unknown[]) => {
        started.push(`${way} ${String(args[0])}`);
        return (real as (...a: unknown[]) => unknown)(...args);
      },
    });
  syncBuiltinESMExports();
  try {
    await f();
  } finally {
    for (const [way, real] of kept) Object.assign(childProcess, { [way]: real });
    syncBuiltinESMExports();
  }
  return started;
}
const childProcess = createRequire(import.meta.url)('node:child_process') as typeof import('node:child_process');
const WAYS = ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'] as const;

test('the list and a run page read where branches stand off standing.json, and start no process, with a snapshot or none', async () => {
  aFinishedRun('r-quiet');
  await aPass();
  const read = async () => {
    await list();
    const res = await app.request('/api/runs/r-quiet');
    assert.equal(res.status, 200, await res.clone().text());
  };
  assert.deepEqual(await processesOf(read), [], 'off the snapshot');
  fs.rmSync(path.join(root, 'standing.json'));
  assert.deepEqual(await processesOf(read), [], 'no snapshot: unread, and still no process');
  assert.notDeepEqual(await processesOf(aPass), [], 'and a pass, which the count sees, starts one');
});

test('a run removed from the store leaves the memo', async () => {
  aFinishedRun('r-gone');
  await aPass();
  await list();
  assert.ok(resting.runs.has('r-gone'));
  fs.rmSync(path.join(root, 'runs', 'r-gone.json'));
  assert.equal(await unverified(() => listed('r-gone')), undefined);
  assert.ok(!resting.runs.has('r-gone'));
});

test("runs waiting on the same run read its journals once between them, off the request's one list", async () => {
  aFinishedRun('r-parent');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'wf/r-parent/implement');
  await aPass();
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
  const cost = async () => (await journalsAsked(() => unverified(list))).asked;
  const one = await cost();
  child('r-child-2');
  await list();
  assert.equal(
    await cost(),
    one,
    "a second run waiting on the parent reads no journal more: the parent's tasks are among the request's views",
  );
});

test('two requests at once: the first reads the feed and judges the run succeeded, a line of its task lands, the second reads on past the line while the run is not yet kept, and the first then keeps nothing', async () => {
  aFinishedRun('r-raced');
  await aPass();
  const answer = await listed('r-raced');
  assert.ok(answer && resting.runs.has('r-raced'));
  resting.runs.delete('r-raced');
  const { startedAt: _, ...judged } = answer;

  const first = await runWith(e, restingRead(e, resting, false, await snapshotGit()));
  blocked('r-raced-implement');
  fed('r-raced-implement');
  await runWith(e, restingRead(e, resting, false, await snapshotGit()));
  first.keep(findRun('r-raced')!, judged, [], () => new Map());
  assert.ok(
    !resting.runs.has('r-raced'),
    'kept nothing: the first request read the feed before the line; the second read on past it while the run was not kept, so took nothing out; and no request will read the line again',
  );
  assert.equal((await unverified(() => listed('r-raced')))?.status, 'blocked');

  const alone = await runWith(e, restingRead(e, resting, false, await snapshotGit()));
  alone.keep(findRun('r-raced')!, judged, [], () => new Map());
  assert.ok(resting.runs.has('r-raced'), 'a request no other overtook keeps what it judged');
  resting.runs.delete('r-raced');
});

/** A run of `design → implement` whose design is gated, its record as the tick writes it: design's task given once filed. */
function writeGated(id: string, filed: boolean) {
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
        brief: 'Design it',
        createdAt: at,
        workflowDir: path.join(root, 'no-such-workflow'),
        workflow: [
          { name: 'design', after: [], body: 'Design it.', harness: 'codex', gate: true },
          { name: 'implement', after: ['design'], body: 'Implement it.', harness: 'codex' },
        ],
        steps: {
          design: filed ? { taskId: `${id}-design`, branch: `wf/${id}/design` } : { taskId: null },
          implement: { taskId: null },
        },
      },
      null,
      2,
    ),
  );
}

test('a gated run read by the list at every event from being filed to being approved: the memo keeps it only at its gate, answers it as a fresh read does, and lets the approval go', async () => {
  const id = 'r-gated';
  const task = `${id}-design`;
  const keptAt: string[] = [];
  const read = async (event: string) => {
    const answer = await listed(id);
    if (resting.runs.has(id)) keptAt.push(event);
    return answer!;
  };

  writeGated(id, false);
  assert.equal((await read('filed')).moving, true, 'its design is due: the tick files it');
  branchOff(`wf/${id}/design`);
  appended(task, { kind: 'filed', at, brief: 'Design it.', cwd: repo, maxAttempts: 1, harness: 'codex' });
  await read('task filed, record not yet');
  writeGated(id, true);
  await read('task on the record');
  appended(task, { kind: 'starting', at, attempt: 1 });
  await read('starting');
  appended(task, { kind: 'spawned', at, attempt: 1 });
  assert.equal((await read('spawned')).moving, true, 'its session runs');
  appended(task, {
    kind: 'ended',
    at,
    attempt: 1,
    sessionId: `ae/${task}/1`,
    observed: 'done',
    reason: 'harness',
    closeout: { outcome: 'done', summary: 'Designed it.', needs: null, artifacts: [] },
  });
  await read('ended');
  appended(task, { kind: 'settled', at, outcome: 'succeeded' });
  const gated = await read('settled');
  await read('settled, from memory');
  assert.deepEqual(keptAt, ['settled', 'settled, from memory'], 'kept once at rest at its gate, and at no event before');
  assert.equal(gated.status, 'awaiting approval', "`assess`'s word for a run stopped at its gate, as `nemia decide` says it");
  assert.equal(gated.moving, false);
  assert.deepEqual(gated.waitingOnYou, ['design']);
  assert.equal(gated.steps.find((s) => s.name === 'design')?.status, 'awaiting approval');

  await runWith(engine(), approveRun(id, 'design'));
  const approved = await read('approved');
  assert.ok(!resting.runs.has(id), 'the approval takes it out');
  assert.equal(approved.moving, true, 'implement is due: the tick files it');
  assert.deepEqual(approved.waitingOnYou, []);
  assert.equal(approved.status, 'running');
  assert.deepEqual(await unverified(() => listed(id)), approved, 'and the memo answers it as the fresh read did');
});

test("a poll's reads: a run at rest, a moving one and one whose check refused it cost the journals of the moving one alone, and judged afresh their own journals and no more", async () => {
  await list();
  const cost = async () => (await journalsAsked(() => unverified(list))).asked;
  const before = await cost();
  aFinishedRun('r-count-rest');
  running('r-count-moving-implement');
  branchOff('wf/r-count-moving/implement');
  writeRun('r-count-moving', 'Still counting');
  aRefusedRun('r-count-refused');
  await aPass();
  const fresh = await cost();
  assert.equal(fresh - before, 4, "judged afresh: each new run's journals once, the refused check's included, and no output of it");
  assert.equal((await cost()) - before, 1, "then from memory: the moving run's one journal");
  assert.ok(resting.runs.has('r-count-refused'), 'a refused run is at rest');
});

test("a refused check's verdict on a poll is its exit, off the journal: neither its output nor its logs are read", async (t) => {
  aRefusedRun('r-verdict');
  const output = t.mock.method(e, 'output');
  const logs = t.mock.method(e, 'logs');
  const run = await unverified(() => listed('r-verdict'));
  assert.equal(run?.steps.find((s) => s.name === 'implement')?.status, 'failed ✗ check (exit 1)');
  assert.deepEqual([output.mock.callCount(), logs.mock.callCount()], [0, 0]);
});

test('REFUSED at shipped defaults: a WF_VERIFY_REST that is neither 1 nor 0 is refused by name, exit 2, and fails the list, never read as off', async (t) => {
  t.after(() => {
    process.env.WF_VERIFY_REST = '1';
  });
  process.env.WF_VERIFY_REST = 'true';
  const said =
    'WF_VERIFY_REST=true is neither 1 nor 0. It judges in full each run a pass answers from its memo of runs at rest, which costs all the memo saves: WF_VERIFY_REST=1 — or 0, or unset, for off.';
  assert.throws(
    () => verifiesRest(process.env),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && err.message === said,
  );
  const res = await app.request('/api/runs');
  assert.equal(res.status, 422, 'an Invalid, as every route answers one');
  assert.equal(((await res.json()) as { error: string }).error, said, "read off the app's environment on this request");
});

test('REFUSED: an answer kept wrong fails the request under WF_VERIFY_REST, and is served without it', async () => {
  aFinishedRun('r-poisoned');
  await aPass();
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

test("a held run's decision reads what holds it and none of its own tasks: a session in flight is not viewed to say `holding`", async () => {
  running('r-held-implement');
  writeRun('r-held', 'Held while it runs');
  write(path.join(root, 'runs', 'r-held.hold'), JSON.stringify({ at, until: ['r-nowhere'] }));
  try {
    const reads = Effect.runSync(e.io()).reads;
    const res = await app.request('/api/runs/r-held/decision');
    assert.equal(res.status, 200, await res.clone().text());
    const decided = (await res.json()) as { holding?: unknown };
    assert.ok(decided.holding, JSON.stringify(decided));
    assert.equal(
      Effect.runSync(e.io()).reads - reads,
      1,
      "the route's check that the run's journal reads (`viewsFor`), and no view more: the hold is answered off the runs it is held until",
    );
  } finally {
    for (const file of ['r-held.json', 'r-held.hold']) fs.rmSync(path.join(root, 'runs', file));
  }
});

test('a finished page read warm asks the engine for no journal the whole list does not, none of a run at rest; the light answer adds the journals of the runs that wait on a person, alone', async () => {
  aFinishedRun('r-paged');
  branchOff('wf/r-asks/implement');
  blocked('r-asks-implement');
  writeRun('r-asks', 'Answer it');
  const asks = path.join(root, 'runs', 'r-asks.json');
  write(asks, JSON.stringify({ ...(JSON.parse(fs.readFileSync(asks, 'utf8')) as object), after: ['r-paged'] }));
  await aPass();
  try {
    await list();
    const whole = await journalsAsked(() => unverified(list));
    assert.ok(resting.runs.has('r-paged') && resting.runs.has('r-asks'), 'both at rest, and kept');
    const read = <T>(address: string) =>
      journalsAsked(() =>
        unverified(async () => {
          const res = await app.request(address);
          assert.equal(res.status, 200, await res.clone().text());
          return (await res.json()) as T;
        }),
      );
    const page = await read<{ runs: { id: string }[] }>('/api/runs-finished?size=100');
    assert.ok(
      page.value.runs.some((run) => run.id === 'r-paged'),
      'the finished run is on the page',
    );
    assert.equal(page.asked, whole.asked, 'what the whole list asks warm, and no journal of a run at rest');
    const open = await read<{ waiting: { id: string; clock: unknown }[] }>('/api/runs-open');
    const waiting = open.value.waiting.map((run) => run.id);
    assert.ok(waiting.includes('r-asks'), 'the run that waits on a person is among the waiting');
    assert.ok(
      open.value.waiting.every((run) => run.clock !== null),
      'each with its clock read',
    );
    const theirs = new Set(waiting.flatMap((id) => runTasks(runStore.runs.read(id))));
    assert.ok(theirs.has('r-asks-implement') && !theirs.has('r-paged-implement'));
    assert.deepEqual(runStore.runs.read('r-asks').after, ['r-paged'], 'it was started after the finished run, whose journal is not read');
    assert.equal(open.asked, whole.asked + theirs.size, "the whole list's, and the journals of the runs that wait on a person alone");
  } finally {
    for (const file of ['r-paged.json', 'r-asks.json']) fs.rmSync(path.join(root, 'runs', file));
  }
});
