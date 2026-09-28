/**
 * A run that waits on a run (`wf start --after`), as the board reads it: `after` as the record froze it, and `waiting` — the runs its
 * roots wait on, in the package's words — on the list, the detail and the decision, each held to what `wf ls` and `wf decide` say. Off a
 * real repository, where a parent ships by its branch being merged, and in a scratch store.
 */
import { observations } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store when the module loads, so point it at a scratch directory first. The harness counts the observations.
const root = scratch('hkb-api-after-');
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { decide, engine, list, readRun, waitAdvice, waitWord } = await import('agent-orchestrator');
type Wait = import('agent-orchestrator').Wait;

const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const base = git('rev-parse', 'HEAD').trim();

/** A result branch off main with a file of its own committed; merged back into main with `--no-ff` when `merge` says so. */
function branch(name: string, merge: boolean): void {
  git('checkout', '-q', '-b', name);
  fs.writeFileSync(path.join(repo, `${name.replaceAll('/', '-')}.txt`), `${name}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', `the work of ${name}`);
  git('checkout', '-q', 'main');
  if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${name}`, name);
}

const at = '2026-09-14T00:10:00.000Z';

/** A task's journal, as the engine writes it. */
const journal = (taskId: string, events: object[]) => {
  fs.mkdirSync(path.join(root, 'engine', 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((e) => `${JSON.stringify(e)}\n`).join(''));
};
const filed = () => ({ kind: 'filed', at, brief: 'Implement it.', cwd: repo, maxAttempts: 1, harness: 'codex' });
const signedOff = (taskId: string) =>
  journal(taskId, [
    filed(),
    { kind: 'starting', at, attempt: 1 },
    { kind: 'spawned', at, attempt: 1 },
    {
      kind: 'ended',
      at,
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout: { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] },
    },
    { kind: 'settled', at, outcome: 'succeeded' },
  ]);
const working = (taskId: string) => journal(taskId, [filed(), { kind: 'starting', at, attempt: 1 }, { kind: 'spawned', at, attempt: 1 }]);

/** One step, frozen on the record as `wf start` freezes it: its branch is the run's result. */
const workflow = [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }];

function writeRun(id: string, fields: { after?: string[]; steps?: object; cancelledAt?: string } = {}): void {
  const { cancelledAt, ...rest } = fields;
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: base,
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      createdAt: at,
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow,
      steps: { implement: { taskId: null } },
      ...rest,
    }),
  );
  // Cancelled as `wf cancel` marks a run: a file of its own, beside the record.
  if (cancelledAt) fs.writeFileSync(path.join(root, 'runs', `${id}.cancelled`), cancelledAt);
}

const cancelledAt = '2026-09-14T00:20:00.000Z';

// The diamond's top, shipped: its step signed off, and its result branch merged into main.
branch('wf/a-shipped/implement', true);
signedOff('t-a');
writeRun('a-shipped', { steps: { implement: { taskId: 't-a', workspace: repo, branch: 'wf/a-shipped/implement' } } });
// Started after it, and still working, its branch not merged.
branch('wf/b-running/implement', false);
working('t-b');
writeRun('b-running', { after: ['a-shipped'], steps: { implement: { taskId: 't-b', workspace: repo, branch: 'wf/b-running/implement' } } });
// Called off before anything of it was filed.
writeRun('c-cancelled', { cancelledAt });
// Signed off on a branch somebody deleted unmerged, before any tick recorded its tip.
signedOff('t-x');
writeRun('x-gone', { steps: { implement: { taskId: 't-x', workspace: repo, branch: 'wf/x-gone/implement' } } });

// The children, none filed yet.
writeRun('d-waits', { after: ['a-shipped', 'b-running'] });
writeRun('e-cancelled-parent', { after: ['c-cancelled'] });
writeRun('f-no-such-parent', { after: ['no-such-run'] });
writeRun('g-parents-shipped', { after: ['a-shipped'] });
writeRun('h-gone-parent', { after: ['x-gone'] });
// A child that started: its parents are never read again.
working('t-i');
writeRun('i-started', { after: ['b-running'], steps: { implement: { taskId: 't-i', workspace: repo, branch: 'wf/i-started/implement' } } });

// The feed, as the engine appends to it: b-running and i-started were filed an hour and more after they were created, as a run started
// `--after` runs is, once they ship. a-shipped's and x-gone's filings are not on it, as in a store from before the feed.
const filedB = '2026-09-14T01:10:00.000Z';
const filedI = '2026-09-14T01:40:30.000Z';
fs.writeFileSync(
  path.join(root, 'engine', 'feed.jsonl'),
  [
    ['t-b', filedB],
    ['t-i', filedI],
  ]
    .map(([taskId, at]) => `${JSON.stringify({ taskId, event: { kind: 'filed', at } })}\n`)
    .join(''),
);

type Listed = {
  id: string;
  after: string[];
  status: string;
  moving: boolean;
  waitingOnYou: string[];
  createdAt: string;
  startedAt: string | null;
  waiting: {
    runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[] }>;
    word: string;
    advice: string;
    onYou: boolean;
  } | null;
  steps: Array<{ name: string; status: string }>;
};

const listedRuns = async (): Promise<Map<string, Listed>> => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  return new Map(((await res.json()) as Listed[]).map((r) => [r.id, r]));
};

/** The waits as the api gives them, back in the package's shape. */
const asWaits = (waiting: Listed['waiting']): Wait[] =>
  (waiting?.runs ?? []).map((w) => ({
    run: w.run,
    ...(w.missing ? { missing: true as const } : {}),
    ...(w.cancelledAt ? { cancelledAt: w.cancelledAt } : {}),
    ...(w.gone.length ? { gone: w.gone } : {}),
  }));

test("the list carries each run's `after` as the record froze it, and `waiting` in `wf ls`'s words: a root says `waiting on <run>`, and a parent that never ships says why", async () => {
  const runs = await listedRuns();
  const d = runs.get('d-waits')!;
  assert.deepEqual(d.after, ['a-shipped', 'b-running']);
  // a-shipped has shipped, so it is not waited on; b-running has not.
  assert.deepEqual(d.waiting, {
    runs: [{ run: 'b-running', missing: false, cancelledAt: null, gone: [] }],
    word: 'waiting on b-running',
    advice: 'nothing of d-waits is filed until wf decide says b-running has shipped onto main; nothing to decide yet',
    onYou: false,
  });
  assert.deepEqual(
    d.steps.map((s) => [s.name, s.status]),
    [['implement', 'waiting on b-running']],
  );

  const e = runs.get('e-cancelled-parent')!;
  assert.deepEqual(e.waiting, {
    runs: [{ run: 'c-cancelled', missing: false, cancelledAt, gone: [] }],
    word: 'waiting on c-cancelled (cancelled)',
    advice: `c-cancelled was cancelled at ${cancelledAt}, and a cancelled run never ships — yours to resolve: wf cancel e-cancelled-parent, or start the work again without --after c-cancelled`,
    onYou: true,
  });
  assert.deepEqual(runs.get('f-no-such-parent')!.waiting?.runs, [{ run: 'no-such-run', missing: true, cancelledAt: null, gone: [] }]);
  assert.equal(runs.get('f-no-such-parent')!.waiting?.word, 'waiting on no-such-run (no such run)');
  assert.deepEqual(runs.get('h-gone-parent')!.waiting?.runs, [
    { run: 'x-gone', missing: false, cancelledAt: null, gone: ['wf/x-gone/implement'] },
  ]);
  assert.equal(runs.get('h-gone-parent')!.waiting?.word, 'waiting on x-gone (wf/x-gone/implement gone)');

  // Every parent shipped: nothing to wait on, and the next tick files the roots. Started: its parents are not read, whatever they say.
  assert.deepEqual([runs.get('g-parents-shipped')!.after, runs.get('g-parents-shipped')!.waiting], [['a-shipped'], null]);
  assert.deepEqual([runs.get('i-started')!.after, runs.get('i-started')!.waiting], [['b-running'], null]);
  // Started without `--after`.
  assert.deepEqual([runs.get('a-shipped')!.after, runs.get('a-shipped')!.waiting], [[], null]);
});

test("the list's words and waits are `list`'s, run by run — and `advice` is `waitAdvice` over them, `word` `waitWord`", async () => {
  const runs = await listedRuns();
  const e = engine();
  for (const id of [
    'd-waits',
    'e-cancelled-parent',
    'f-no-such-parent',
    'g-parents-shipped',
    'h-gone-parent',
    'i-started',
    'a-shipped',
    'b-running',
    'c-cancelled',
  ]) {
    const api = runs.get(id)!;
    const cli = await list(e, readRun(id));
    assert.deepEqual(asWaits(api.waiting), cli.waiting, id);
    assert.deepEqual(
      api.steps.map((s) => s.status),
      cli.steps.map((s) => s.status),
      id,
    );
    if (cli.waiting.length) {
      assert.equal(api.waiting?.word, waitWord(cli.waiting), id);
      assert.equal(api.waiting?.advice, waitAdvice(readRun(id), cli.waiting), id);
      // Whether a person has to act, held to the package's own words rather than a copy of its rule: `waitAdvice` says "nothing of <run> is
      // filed until …" exactly while every run waited on may still ship, and what is yours to resolve otherwise.
      assert.equal(api.waiting?.onYou, !waitAdvice(readRun(id), cli.waiting).startsWith(`nothing of ${id} is filed until `), id);
    }
  }
});

test('a run waiting on runs moves — the tick files its roots once they ship — unless one never ships without a person, when it moves no more', async () => {
  const runs = await listedRuns();
  const moving = Object.fromEntries(
    ['d-waits', 'g-parents-shipped', 'e-cancelled-parent', 'f-no-such-parent', 'h-gone-parent'].map((id) => [id, runs.get(id)!.moving]),
  );
  assert.deepEqual(moving, {
    'd-waits': true,
    'g-parents-shipped': true,
    'e-cancelled-parent': false,
    'f-no-such-parent': false,
    'h-gone-parent': false,
  });
  // Where `assess` puts them, which knows no gate: nothing is final, so running. Nobody is waited on in the steps' words: no step is filed.
  for (const id of Object.keys(moving)) assert.deepEqual([runs.get(id)!.status, runs.get(id)!.waitingOnYou], ['running', []], id);
});

test("a run's detail carries the same `after`, `waiting` and `moving`", async () => {
  const runs = await listedRuns();
  for (const id of ['d-waits', 'e-cancelled-parent', 'i-started']) {
    const res = await app.request(`/api/runs/${id}`);
    assert.equal(res.status, 200);
    const detail = await res.json();
    const listed = runs.get(id)!;
    assert.deepEqual(
      { after: detail.after, waiting: detail.waiting, moving: detail.moving },
      { after: listed.after, waiting: listed.waiting, moving: listed.moving },
      id,
    );
    assert.deepEqual(
      detail.steps.map((s: { status: string }) => s.status),
      listed.steps.map((s) => s.status),
      id,
    );
  }
});

test("a run started when its first task was filed, off the engine's feed, not when it was created — on the list and the detail alike; nothing filed, not started", async () => {
  const runs = await listedRuns();
  const started = (id: string) => [runs.get(id)!.createdAt, runs.get(id)!.startedAt];
  assert.deepEqual(started('b-running'), [at, filedB], 'waited on a-shipped for an hour: that hour is not time at work');
  assert.deepEqual(started('i-started'), [at, filedI]);
  // Started, and its filing not on the feed: when it was created, the only time there is.
  assert.deepEqual(started('a-shipped'), [at, at]);
  // Waiting on runs, whether they may still ship or never will, or with its parents shipped and the tick yet to file it: not started.
  for (const id of ['d-waits', 'e-cancelled-parent', 'g-parents-shipped', 'c-cancelled']) assert.equal(runs.get(id)!.startedAt, null, id);
  for (const id of ['b-running', 'i-started', 'a-shipped', 'd-waits']) {
    const detail = await (await app.request(`/api/runs/${id}`)).json();
    assert.equal(detail.startedAt, runs.get(id)!.startedAt, id);
  }
});

test('reading the runs a run waits on observes no harness again: the list and the detail observe once, a shipped parent among them', async () => {
  // a-shipped's branch is on main, so `parentOf` reads its tasks to ask its `wf decide` — off the views the request already read.
  // The tasks in flight here are Codex's: the list and the detail look at the harnesses of the runs' own tasks (`viewsFor`), and ask Claude
  // Code's registry nothing. Before, each read every harness once, `claude agents` included.
  const before = observations();
  await listedRuns();
  assert.equal(observations() - before, 0, 'the list');
  const again = observations();
  assert.equal((await app.request('/api/runs/d-waits')).status, 200);
  assert.equal(observations() - again, 0, 'the detail');
});

test('the decision of a run waiting on runs is `waiting`, and nothing else: what `wf decide` prints for it', async () => {
  const runs = await listedRuns();
  const e = engine();
  for (const id of ['d-waits', 'e-cancelled-parent', 'h-gone-parent']) {
    const res = await app.request(`/api/runs/${id}/decision`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { waiting: runs.get(id)!.waiting }, id);
    const { run, waiting } = await decide(e, id);
    assert.deepEqual(asWaits(body.waiting), waiting, id);
    assert.equal(body.waiting.word, waitWord(waiting), id);
    assert.equal(body.waiting.advice, waitAdvice(run, waiting), id);
  }
  // Every parent shipped, and not yet filed: it runs, and there is nothing to decide yet.
  assert.deepEqual(await (await app.request('/api/runs/g-parents-shipped/decision')).json(), { running: true });
});
