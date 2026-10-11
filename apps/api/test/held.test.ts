/**
 * A step whose task is held open, as the board reads it: signed, and waiting for a person's word with nothing running — the engine's
 * `input-required`. Blocked, it reads `input-required · BLOCKED` with its question, waiting on you; gated, it reads `awaiting approval`.
 * Each held to what `nemia ls` says of the same run, and neither read as a session still going.
 *
 * The runs it seeds: `h-blocked`, signed off blocked; `h-gate`, gated at plan; `h-closed`, approved — closed on the pass that filed
 * implement, and not yet settled: the engine settles it on its next pass; `h-answered`, blocked, then answered (`nemia retry --message`) —
 * the answer is the task's next turn, under the same id, and its attempt has not ended; and `h-rechecked`, whose task is filed without
 * `holdOpen` — its check rechecked (`nemia retry --recheck`, the same task and turn), then nudged, a task of its own.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, and the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import { approveRun, engine, list, runStore, runShipped as runWith, type RunSummary } from 'agent-orchestrator';

const T0 = Date.parse('2026-09-24T01:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const journal = (taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((event) => `${JSON.stringify(event)}\n`).join(''));

/** A step's task filed held open that signed off with `closeout` and was neither answered nor closed: no `settled` on its journal. */
const waiting = (taskId: string, closeout: object) =>
  journal(taskId, [
    { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex', holdOpen: true },
    { kind: 'starting', at: at(1), attempt: 1 },
    { kind: 'spawned', at: at(1), attempt: 1 },
    { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
  ]);

const DONE = { outcome: 'done', summary: 'The plan.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Two ways to go.', needs: 'Warm colours, or cool ones?', artifacts: [] };

/** `plan → implement`, plan's task waiting; gated at plan when `gates` says so. */
function writeRun(id: string, gates?: string[]): void {
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      createdAt: at(0),
      workflowDir: path.join(root, 'no-such-workflow'),
      ...(gates ? { gates } : {}),
      workflow: [
        { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
        { name: 'implement', after: ['plan'], body: 'Implement it.', harness: 'codex' },
      ],
      steps: { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, implement: { taskId: null } },
    }),
  );
}
writeRun('h-blocked');
waiting('h-blocked-plan', BLOCKED);
writeRun('h-gate', ['plan']);
waiting('h-gate-plan', DONE);
writeRun('h-closed', ['plan']);
waiting('h-closed-plan', DONE);
fs.appendFileSync(path.join(root, 'engine', 'tasks', 'h-closed-plan.jsonl'), `${JSON.stringify({ kind: 'closed', at: at(30) })}\n`);

writeRun('h-answered');
waiting('h-answered-plan', BLOCKED);
fs.appendFileSync(
  path.join(root, 'engine', 'tasks', 'h-answered-plan.jsonl'),
  [
    { kind: 'input', at: at(20), text: 'Warm ones.' },
    { kind: 'starting', at: at(21), attempt: 2 },
    { kind: 'spawned', at: at(21), attempt: 2 },
  ]
    .map((event) => `${JSON.stringify(event)}\n`)
    .join(''),
);
{
  const file = path.join(root, 'runs', 'h-answered.json');
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  run.steps.plan.tries = [{ taskId: 'h-answered-plan', then: 'nudge' }];
  fs.writeFileSync(file, JSON.stringify(run));
}

writeRun('h-rechecked');
journal('h-rechecked-plan', [
  { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
  { kind: 'ended', at: at(9), attempt: 1, sessionId: 'ae/h-rechecked-plan/1', observed: 'done', reason: 'harness', closeout: DONE },
  { kind: 'settled', at: at(9), outcome: 'succeeded' },
]);
journal('h-rechecked-plan-try3', [
  { kind: 'filed', at: at(40), brief: 'Do it again.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
]);
{
  const file = path.join(root, 'runs', 'h-rechecked.json');
  const run = JSON.parse(fs.readFileSync(file, 'utf8'));
  run.steps.plan = {
    ...run.steps.plan,
    taskId: 'h-rechecked-plan-try3',
    tries: [
      { taskId: 'h-rechecked-plan', then: 'recheck' },
      { taskId: 'h-rechecked-plan', then: 'nudge' },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(run));
}

const detail = async (id: string) => (await (await app.request(`/api/runs/${id}`)).json()) as RunDetail;
const summary = async (id: string) => {
  const run = ((await (await app.request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
  assert.ok(run, `${id} is on the list`);
  return run;
};

test('a held step that signed off blocked reads `input-required · BLOCKED` with its question, and waits on you — on both endpoints, as `nemia ls` says', async () => {
  assert.equal(
    (await Effect.runPromise(engine().view('h-blocked-plan'))).phase,
    'input-required',
    "the seed is the engine's held task, waiting",
  );
  const listed = await runWith(engine(), list(engine(), runStore.runs.read('h-blocked')));
  for (const run of [await detail('h-blocked'), await summary('h-blocked')]) {
    assert.deepEqual(
      run.steps.map(({ name, status, needs }) => ({ name, status, needs })),
      [
        { name: 'plan', status: 'input-required · BLOCKED', needs: BLOCKED.needs },
        { name: 'implement', status: 'waiting', needs: null },
      ],
    );
    assert.deepEqual(
      run.steps.map((s) => s.status),
      listed.steps.map((s) => s.status),
    );
    assert.deepEqual(run.waitingOnYou, ['plan']);
  }
});

test("a held step at its gate reads `awaiting approval`, never the engine's word for a session still going, and waits on you", async () => {
  for (const run of [await detail('h-gate'), await summary('h-gate')]) {
    assert.deepEqual(
      run.steps.map((s) => s.status),
      ['awaiting approval', 'waiting'],
    );
    assert.deepEqual(run.waitingOnYou, ['plan']);
  }
});

test("a held step closed and not yet settled reads as it signed, never the engine's `between attempts` for a session still going — as `nemia ls` says", async () => {
  assert.equal(
    (await Effect.runPromise(engine().view('h-closed-plan'))).phase,
    'between attempts',
    'the seed: closed, and the engine has not settled it',
  );
  await runWith(engine(), approveRun('h-closed', 'plan'));
  const listed = await runWith(engine(), list(engine(), runStore.runs.read('h-closed')));
  for (const run of [await detail('h-closed'), await summary('h-closed')]) {
    assert.deepEqual(
      run.steps.map((s) => s.status),
      listed.steps.map((s) => s.status),
    );
    assert.doesNotMatch(run.steps[0].status, /between attempts|running/);
  }
});

test('each try of a held task a person answered is its own turn: the try answered keeps its sign-off and its end, and the turn it started reads none of them', async () => {
  const plan = (await detail('h-answered')).steps[0];
  assert.deepEqual(
    plan.tries.map((t) => [t.try, t.current, t.taskId]),
    [
      [1, false, 'h-answered-plan'],
      [2, true, 'h-answered-plan'],
    ],
    'one task, two tries',
  );
  const [answered, going] = plan.tries;
  assert.deepEqual(
    [answered.status, answered.attempts.count, answered.attempts.latest?.ended, answered.closeout?.needs],
    ['succeeded', 1, 'done', BLOCKED.needs],
    'the turn answered, as it signed',
  );
  assert.deepEqual(
    [going.attempts.count, going.attempts.latest?.ended, going.closeout],
    [1, null, null],
    'the turn going on: its own attempt, still running, and no sign-off yet',
  );
});

test("a recheck is no turn: a try after one, on the same task filed before tasks were held open, reads that task's attempts and sign-off as it did", async () => {
  const plan = (await detail('h-rechecked')).steps[0];
  assert.deepEqual(
    plan.tries.map((t) => [t.try, t.taskId]),
    [
      [1, 'h-rechecked-plan'],
      [2, 'h-rechecked-plan'],
      [3, 'h-rechecked-plan-try3'],
    ],
  );
  for (const t of plan.tries.slice(0, 2)) {
    assert.deepEqual([t.attempts.count, t.attempts.latest?.ended, t.closeout?.summary], [1, 'done', DONE.summary], `try ${t.try}`);
  }
});
