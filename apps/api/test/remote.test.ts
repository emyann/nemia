/**
 * A step on a remote A2A agent (`harness: a2a:<name>`), as the api tells a person of it: on a run's detail, the agent a try was sent to and
 * where, as the store's `a2a-agents.json` gives it — never a query string, which can carry a key — and, for a step whose Task waits on its
 * caller, where it is answered: `nemia say`, not a Claude Code session the agent is not in. In a scratch store, on the stand-ins: the
 * runtime's test engine, each task filed and settled by hand, and the test place.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { needsOf } from 'agent-orchestrator';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, engineFor } from './placed.ts';

const stand = testPlace();
const standIn = testEngine();
const engine = () => engineFor(standIn);
const app = appOver(standIn, stand);

type TaskView = import('agent-orchestrator').TaskView;
type Run = import('agent-orchestrator/run').Run;
type RunDetail = import('../src/detail/detail.ts').RunDetail;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const at = (s: number) => new Date(Date.parse('2026-09-25T06:00:00.000Z') + s * 1000).toISOString();

/** A task on `harness` that ran once and completed: what a remote agent's Task that answered with no data part leaves. */
const completed = (taskId: string, harness: string) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Ask it.', cwd: path.join(root, 'runs', 'x', 'work', 'ask'), harness }));
  standIn.settle(taskId, 'succeeded', { nativeId: 'ctx-1' });
};

/** A run of one step, `ask`, on `harness`, whose task is `taskId`. */
const oneStep = (id: string, harness: string, taskId: string): Run => {
  const run = {
    id,
    place: { kind: 'folder' },
    workspace: root,
    brief: 'a note on tides',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [{ name: 'ask', after: [], body: 'Ask it.', harness, workspace: 'folder' }],
    steps: { ask: { taskId } },
  };
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify(run));
  return run as unknown as Run;
};

test("a run's detail names the remote agent a try was sent to, and where, with no query string — and no address for a name the file no longer declares", async () => {
  write(path.join(root, 'a2a-agents.json'), JSON.stringify({ reviewer: { url: 'https://agents.example.com/reviewer?key=s3cret' } }));
  completed('t-remote', 'a2a:reviewer');
  oneStep('r-remote', 'a2a:reviewer', 't-remote');
  const res = await app.request('/api/runs/r-remote');
  assert.equal(res.status, 200);
  const text = await res.text();
  const [ask] = (JSON.parse(text) as RunDetail).steps;
  assert.deepEqual(ask.filed?.remote, { name: 'reviewer', address: 'https://agents.example.com/reviewer' });
  assert.equal(ask.filed?.runsIn, null, "no mode: the agent runs under its own party's fence");
  assert.equal(text.includes('s3cret'), false, 'the query string, which can carry a key, is on no answer');

  write(
    path.join(root, 'a2a-agents.json'),
    JSON.stringify({ reviewer: { card: { supportedInterfaces: [{ url: 'https://a2a.example.org/rpc', protocolBinding: 'JSONRPC' }] } } }),
  );
  assert.deepEqual(
    ((await (await app.request('/api/runs/r-remote')).json()) as RunDetail).steps[0].filed?.remote,
    { name: 'reviewer', address: 'https://a2a.example.org/rpc' },
    "an agent given by its card is addressed by the card's first interface",
  );

  completed('t-gone', 'a2a:critic');
  oneStep('r-gone', 'a2a:critic', 't-gone');
  assert.deepEqual(
    ((await (await app.request('/api/runs/r-gone')).json()) as RunDetail).steps[0].filed?.remote,
    { name: 'critic', address: null },
    'a name taken out of the file: the name, which is on the task, and no address',
  );
  write(path.join(root, 'a2a-agents.json'), '{ "reviewer": ');
  const refused = await app.request('/api/runs/r-remote');
  assert.equal(refused.status, 200, 'the page is still drawn');
  assert.deepEqual(
    ((await refused.json()) as RunDetail).steps[0].filed?.remote,
    { name: 'reviewer', address: null },
    'the file refused as it stands: the name, which is on the task, and no address',
  );
  fs.rmSync(path.join(root, 'a2a-agents.json'));
});

test('a remote step whose Task waits on its caller is answered with nemia say, and its question read with nemia logs — not in Claude Code', () => {
  const view = (harness: string): TaskView => ({
    id: 't-asks',
    phase: 'needs-human',
    waitingFor: 'input',
    sessionId: 'ctx-1',
    state: {
      taskId: 't-asks',
      brief: 'Ask it.',
      cwd: root,
      harness,
      attempts: [
        {
          n: 1,
          startedAt: at(1),
          spawnedAt: at(1),
          ended: null,
          endedAt: null,
          reason: null,
          nativeId: 'ctx-1',
          usage: null,
          exitCode: null,
        },
      ],
      said: [],
      inputs: [],
      closed: false,
      stopRequested: false,
      settled: null,
      filedAt: at(0),
    },
  });
  const run = oneStep('r-asks', 'a2a:reviewer', 't-asks');
  const judged = {
    words: new Map([['ask', 'needs-human']]),
    waitingOnYou: [] as string[],
    beside: new Map([['ask', { waits: 'waiting for an input' }]]),
  };
  assert.deepEqual(needsOf(run, 'ask', new Map([['t-asks', view('a2a:reviewer')]]), judged).waitingFor, {
    words: 'waiting for an input',
    advice: 'read its question with nemia logs r-asks ask, and answer it with nemia say r-asks ask "<your answer>"',
  });
  assert.deepEqual(
    needsOf(run, 'ask', new Map([['t-asks', view('claude')]]), judged).waitingFor?.advice,
    'answer it in Claude Code: claude agents, session ae/t-asks/1',
    'the same wait on a harness of ours is answered where it runs',
  );
});
