/**
 * A step whose task is held open (thin runtime stage 2 part 4b), as the board reads it: signed, and waiting for a person's word with nothing
 * running — the engine's `input-required`. Blocked, it reads `input-required · BLOCKED` with its question, waiting on you; gated, it reads
 * `awaiting approval`. Each held to what `wf ls` says of the same run, and neither read as a session still going.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, and the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store as its modules load: set first.
const root = scratch('hkb-api-held-');
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { approve, engine, list, readRun } = await import('agent-orchestrator');

const T0 = Date.parse('2026-09-24T01:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const journal = (taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((event) => `${JSON.stringify(event)}\n`).join(''));

/** A step's task filed held open that signed off with `closeout` and was neither answered nor closed: no `settled` on its journal. */
const waiting = (taskId: string, closeout: object) => journal(taskId, [
  { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex', holdOpen: true },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
  { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
]);

const DONE = { outcome: 'done', summary: 'The plan.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Two ways to go.', needs: 'Warm colours, or cool ones?', artifacts: [] };

/** `plan → implement`, plan's task waiting; gated at plan when `gates` says so. */
function writeRun(id: string, gates?: string[]): void {
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo: '/code/app', workspace: '/code/app', baseRef: 'abc123', branch: 'main', isolate: true, brief: `Run ${id}`, createdAt: at(0),
    workflowDir: path.join(root, 'no-such-workflow'), ...(gates ? { gates } : {}),
    workflow: [{ name: 'plan', after: [], body: 'Plan it.', harness: 'codex' }, { name: 'implement', after: ['plan'], body: 'Implement it.', harness: 'codex' }],
    steps: { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, implement: { taskId: null } },
  }));
}
writeRun('h-blocked');
waiting('h-blocked-plan', BLOCKED);
writeRun('h-gate', ['plan']);
waiting('h-gate-plan', DONE);
// Approved: closed on the pass that filed implement, and not yet settled — the engine settles it on its next pass.
writeRun('h-closed', ['plan']);
waiting('h-closed-plan', DONE);
fs.appendFileSync(path.join(root, 'engine', 'tasks', 'h-closed-plan.jsonl'), `${JSON.stringify({ kind: 'closed', at: at(30) })}\n`);

type Step = { name: string; status: string; needs: string | null };
const detail = async (id: string) => (await app.request(`/api/runs/${id}`)).json();
const summary = async (id: string) => (await (await app.request('/api/runs')).json()).find((r: { id: string }) => r.id === id);

test("a held step that signed off blocked reads `input-required · BLOCKED` with its question, and waits on you — on both endpoints, as `wf ls` says", async () => {
  assert.equal((await engine().view('h-blocked-plan')).phase, 'input-required', "the seed is the engine's held task, waiting");
  const listed = await list(engine(), readRun('h-blocked'));
  for (const run of [await detail('h-blocked'), await summary('h-blocked')]) {
    assert.deepEqual(run.steps.map(({ name, status, needs }: Step) => ({ name, status, needs })), [
      { name: 'plan', status: 'input-required · BLOCKED', needs: BLOCKED.needs },
      { name: 'implement', status: 'waiting', needs: null },
    ]);
    assert.deepEqual(run.steps.map((s: Step) => s.status), listed.steps.map((s) => s.status));
    assert.deepEqual(run.waitingOnYou, ['plan']);
  }
});

test('a held step at its gate reads `awaiting approval`, never the engine\'s word for a session still going, and waits on you', async () => {
  for (const run of [await detail('h-gate'), await summary('h-gate')]) {
    assert.deepEqual(run.steps.map((s: Step) => s.status), ['awaiting approval', 'waiting']);
    assert.deepEqual(run.waitingOnYou, ['plan']);
  }
});

test("a held step closed and not yet settled reads as it signed, never the engine's `between attempts` for a session still going — as `wf ls` says", async () => {
  assert.equal((await engine().view('h-closed-plan')).phase, 'between attempts', 'the seed: closed, and the engine has not settled it');
  await approve(engine(), 'h-closed', 'plan');
  const listed = await list(engine(), readRun('h-closed'));
  for (const run of [await detail('h-closed'), await summary('h-closed')]) {
    assert.deepEqual(run.steps.map((s: Step) => s.status), listed.steps.map((s) => s.status));
    assert.doesNotMatch(run.steps[0].status, /between attempts|running/);
  }
});
