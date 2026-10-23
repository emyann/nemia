/**
 * A step whose task is held open, as the board reads it: signed, and waiting for a person's word with nothing running — the engine's
 * `input-required`. Blocked, it reads `input-required · BLOCKED` with its question, waiting on you; gated, it reads `awaiting approval`.
 * Each held to what `nemia ls` says of the same run, and neither read as a session still going.
 *
 * The runs it seeds: `h-blocked`, signed off blocked; `h-gate`, gated at plan; and `h-rechecked`, whose task is filed without
 * `holdOpen` — its check rechecked (`nemia retry --recheck`, the same task and turn), then nudged, a task of its own.
 *
 * On the stand-ins: the runtime's test engine, each task filed and left where this file says by hand, and the test place, under the run
 * records this file seeds. A task closed and not yet settled, and an answer that is a held task's next turn, are
 * `held.boundary.test.ts`'s: the test engine keeps no journal to close or answer.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDetail } from '../src/detail/detail.ts';
import { list, runStore, type RunSummary } from 'agent-orchestrator';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from './placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const runWith = runOver(() => stand().layer);
const app = eachTest(() => appOver(standIn(), stand()));

const T0 = Date.parse('2026-09-24T01:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
/** A step's task filed held open that signed off with `closeout` and was neither answered nor closed: its attempt ended, unsettled. */
const waiting = (taskId: string, closeout: object) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness: 'codex', holdOpen: true }));
  standIn().settle(taskId, 'input-required', { ended: 'done', endedAt: at(9), exitCode: 0, closeout });
};

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
beforeEachTest(() => {
  waiting('h-blocked-plan', BLOCKED);
});
writeRun('h-gate', ['plan']);
beforeEachTest(() => {
  waiting('h-gate-plan', DONE);
});
writeRun('h-rechecked');
beforeEachTest(() => {
  Effect.runSync(engine().file({ id: 'h-rechecked-plan', brief: 'Do it.', cwd: '/code/app', harness: 'codex' }));
  standIn().settle('h-rechecked-plan', 'succeeded', { exitCode: 0, closeout: DONE });
  Effect.runSync(engine().file({ id: 'h-rechecked-plan-try3', brief: 'Do it again.', cwd: '/code/app', harness: 'codex' }));
});
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

const detail = async (id: string) => (await (await app().request(`/api/runs/${id}`)).json()) as RunDetail;
const summary = async (id: string) => {
  const run = ((await (await app().request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
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
