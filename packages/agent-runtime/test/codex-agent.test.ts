/**
 * Codex as an A2A agent (thin runtime, stage 3): the `codex` harness's detached driver behind its handler, asked through the
 * SDK's `Client`, with the REAL worker running a fake `codex` first on PATH — a node script that answers as `codex exec
 * --json` does, and does what the session's `fake.json` in its working directory tells it.
 *
 * What maps, each proved here: the Task's context is the Codex thread (`thread.started`), empty until Codex prints it; the
 * closing statement written to `-o` is the Task's one Artifact, data or prose; `cancelTask` ends the harness and what it
 * started; and a task held open is `INPUT_REQUIRED` between turns, its answer resuming the same thread in the same context.
 *
 * What `codex exec` cannot do, each pinned here rather than faked: it takes no words while it runs (its card says `say:
 * false`, and a follow-up is refused with nothing written to it), and it is never `INPUT_REQUIRED` while it runs — the worker
 * writes no `blocked` — only as a held task between turns, with no process. What a live Codex does with a resume is M13
 * (`live.test.ts`); here the fake prints the thread it was given by construction, so this proves the plumbing, not Codex.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TaskState, type Task } from '@a2a-js/sdk';
import type { Client } from '@a2a-js/sdk/client';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { clientOf } from '../src/a2a-client.ts';
import { cardOf, type RuntimeExtensionParams } from '../src/a2a-handler.ts';
import { closeoutOf, followUpOf, messageOf, RUNTIME_EXTENSION } from '../src/a2a-map.ts';
import { createEngine, nameFor } from '../src/facade.ts';
import { Journal } from '../src/journal.ts';
import { codex } from '../src/runner-codex.ts';
import { detachedOps } from '../src/runner-detached.ts';
import type { SpawnRequest } from '../src/runner.ts';

const THREAD = '01a09996-d343-7932-8971-b2f209ba315b';
const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' }, summary: { type: 'string' } }, required: ['outcome', 'summary'], additionalProperties: false };

/**
 * What the fake `codex` is told, per session, in `fake.json` in its working directory: wait for `gate` (a file in the same
 * directory) before it prints its thread; write prose rather than JSON to `-o`; start a `sleep` of its own and write its pid;
 * stay up `sleepMs` after its last line. It writes each argv it is run with to `argv.jsonl` and its own pid to `pid`.
 */
type Fake = { gate?: string; prose?: boolean; grandchild?: boolean; sleepMs?: number };

const FAKE = `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
const said = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
fs.appendFileSync('argv.jsonl', JSON.stringify(args) + '\\n');
fs.writeFileSync('pid', String(process.pid));
const calls = fs.readFileSync('argv.jsonl', 'utf8').split('\\n').filter(Boolean).length;
let o = {};
try { o = JSON.parse(fs.readFileSync('fake.json', 'utf8')); } catch {}
const r = args.indexOf('resume');
const thread = r === -1 ? '${THREAD}' : args[r + 1];
const out = args.indexOf('-o');
if (o.grandchild) fs.writeFileSync('grandchild', String(spawn('sleep', ['60'], { stdio: 'ignore' }).pid));
const go = () => {
  said({ type: 'thread.started', thread_id: thread });
  said({ type: 'turn.started' });
  if (out !== -1) fs.writeFileSync(args[out + 1], o.prose ? 'turn ' + calls + ', in prose' : JSON.stringify({ outcome: 'done', summary: 'turn ' + calls }));
  said({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 } });
  setTimeout(() => process.exit(0), o.sleepMs ?? 0);
};
const wait = () => (o.gate && !fs.existsSync(o.gate) ? setTimeout(wait, 20) : go());
wait();
`;

let bin: string;
const prev = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
before(() => {
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-codex-agent-bin-'));
  fs.writeFileSync(path.join(bin, 'fake-codex.cjs'), FAKE);
  fs.writeFileSync(path.join(bin, 'codex'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, 'fake-codex.cjs')}" "$@"\n`, { mode: 0o755 });
  process.env.PATH = `${bin}:${prev.PATH}`;
  // An empty Codex home: no operator's config trusts or serves anything to these sessions.
  process.env.CODEX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-codex-agent-home-'));
});
after(() => {
  process.env.PATH = prev.PATH;
  if (prev.CODEX_HOME === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prev.CODEX_HOME;
});

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-codex-agent-${label}-`));
/** A session's working directory, with what the fake is told there. */
const workdir = (fake: Fake = {}) => {
  const cwd = tmp('work');
  fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify(fake));
  return cwd;
};
const argvOf = (cwd: string): string[][] => {
  try { return fs.readFileSync(path.join(cwd, 'argv.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};
const pidIn = (cwd: string, file: string) => { try { return Number(fs.readFileSync(path.join(cwd, file), 'utf8')); } catch { return 0; } };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } };

/** Until `ok` holds, under a bound of seconds: for what it waits on, never a length of time. */
const until = async (ok: () => boolean | Promise<boolean>, what: string, ms = 15_000) => {
  for (const bound = performance.now() + ms; !(await ok());) {
    if (performance.now() > bound) assert.fail(`never ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** The codex agent over a store at `root`, as the engine's seam builds it, with no journal behind it unless given one. */
const agent = (root: string, events: (taskId: string) => Promise<readonly import('../src/domain.ts').Event[]> = async () => []) =>
  clientOf('codex', detachedOps(codex, root), events);
const send = (client: Client, r: SpawnRequest) => client.sendMessage({
  tenant: '', message: messageOf(r, `m-${r.name}`), metadata: undefined,
  configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
});
const get = (client: Client, id: string) => client.getTask({ tenant: '', id, historyLength: undefined });
const list = (client: Client, o: { contextId?: string; includeArtifacts?: boolean } = {}) => client.listTasks({
  tenant: '', contextId: o.contextId ?? '', status: TaskState.TASK_STATE_UNSPECIFIED, pageSize: 50, pageToken: '',
  historyLength: undefined, statusTimestampAfter: undefined, includeArtifacts: o.includeArtifacts ?? false,
});
const stateIs = async (client: Client, id: string, state: TaskState) => (await get(client, id)).status!.state === state;
/** A spawn, then its session run to its end: the Task as it ended. */
const ran = async (client: Client, r: SpawnRequest): Promise<Task> => {
  const started = await send(client, r) as Task;
  assert.equal(started.status!.state, TaskState.TASK_STATE_WORKING, 'the spawn is answered once the session starts');
  await until(() => stateIs(client, r.name, TaskState.TASK_STATE_COMPLETED), `${r.name} completed`);
  return get(client, r.name);
};

test("a Codex Task's context is its thread: empty until Codex prints it, the thread after — and listed by it", async () => {
  const root = tmp('store');
  const cwd = workdir({ gate: 'go' });
  const client = agent(root);
  await send(client, { name: 'ae/c-ctx/1', brief: 'the brief', cwd, harness: 'codex' });
  await until(() => pidIn(cwd, 'pid') > 0, 'the fake codex started');
  const before = await get(client, 'ae/c-ctx/1');
  assert.equal(before.status!.state, TaskState.TASK_STATE_WORKING);
  assert.equal(before.contextId, '', 'no context is known before `thread.started`: nothing is invented');
  assert.deepEqual((await list(client, { contextId: THREAD })).tasks, [], 'nor listed under a thread not yet printed');

  fs.writeFileSync(path.join(cwd, 'go'), '');
  await until(async () => (await get(client, 'ae/c-ctx/1')).contextId === THREAD, 'the thread read as the context');
  await until(() => stateIs(client, 'ae/c-ctx/1', TaskState.TASK_STATE_COMPLETED), 'completed');
  assert.equal((await get(client, 'ae/c-ctx/1')).contextId, THREAD, 'and kept once it ended');
  assert.deepEqual((await list(client, { contextId: THREAD })).tasks.map((t) => t.id), ['ae/c-ctx/1']);
  assert.deepEqual((await list(client, { contextId: 'another-thread' })).tasks, []);
});

test("a Codex session's closing statement is its Task's one Artifact: JSON off `-o` as data, prose as text/plain — and a listing carries it only when asked", async () => {
  const root = tmp('store');
  const client = agent(root);

  const done = await ran(client, { name: 'ae/c-art/1', brief: 'b', cwd: workdir(), harness: 'codex', closeoutSchema: SCHEMA });
  assert.equal(done.artifacts.length, 1);
  const [artifact] = done.artifacts;
  assert.equal(artifact!.artifactId, 'closeout');
  assert.equal(artifact!.parts[0]!.content!.$case, 'data');
  assert.deepEqual(closeoutOf(done), { outcome: 'done', summary: 'turn 1' });
  assert.equal(typeof artifact!.metadata?.at, 'number', "stamped with when Codex wrote it, the file's time");

  assert.deepEqual((await list(client)).tasks.map((t) => [t.id, t.artifacts]), [['ae/c-art/1', []]], "A2A's default leaves it out of a listing");
  assert.deepEqual((await list(client, { includeArtifacts: true })).tasks.map((t) => t.artifacts), [done.artifacts], 'and includeArtifacts puts it in');

  const prose = await ran(client, { name: 'ae/c-art/2', brief: 'b', cwd: workdir({ prose: true }), harness: 'codex', closeoutSchema: SCHEMA });
  assert.equal(prose.artifacts.length, 1);
  assert.equal(prose.artifacts[0]!.parts[0]!.content!.$case, 'text');
  assert.equal(prose.artifacts[0]!.parts[0]!.mediaType, 'text/plain');
  assert.equal(closeoutOf(prose), 'turn 1, in prose');

  const plain = workdir();
  const unasked = await ran(client, { name: 'ae/c-art/3', brief: 'b', cwd: plain, harness: 'codex' });
  assert.equal(argvOf(plain)[0]!.includes('-o'), false, 'no statement asked for, no `-o`');
  assert.deepEqual(unasked.artifacts, [], 'and no Artifact');
});

test('cancelTask ends a working Codex session and what it started, answers CANCELED again once stopped, and refuses a session that finished on its own', async () => {
  const root = tmp('store');
  const cwd = workdir({ grandchild: true, sleepMs: 30_000 });
  const client = agent(root);
  await send(client, { name: 'ae/c-stop/1', brief: 'b', cwd, harness: 'codex' });
  // A context means the worker has published its pid: a cancel before that is answered and sends nothing (open issue 30).
  await until(async () => (await get(client, 'ae/c-stop/1')).contextId === THREAD, 'the thread printed');
  const harness = pidIn(cwd, 'pid');
  const grandchild = pidIn(cwd, 'grandchild');
  assert.ok(harness > 0 && grandchild > 0 && alive(harness) && alive(grandchild), 'the fake and its own child run');

  const canceled = await client.cancelTask({ tenant: '', id: 'ae/c-stop/1', metadata: undefined });
  assert.equal(canceled.status!.state, TaskState.TASK_STATE_CANCELED);
  assert.equal(canceled.contextId, THREAD);
  await until(() => stateIs(client, 'ae/c-stop/1', TaskState.TASK_STATE_CANCELED), 'read CANCELED');
  await until(() => !alive(harness), 'the harness ended');
  await until(() => !alive(grandchild), 'what the harness started ended with it: its process group was killed');
  const again = await client.cancelTask({ tenant: '', id: 'ae/c-stop/1', metadata: undefined });
  assert.equal(again.status!.state, TaskState.TASK_STATE_CANCELED, 'a repeat cancel is answered as the first, as A2A answers one');

  await ran(client, { name: 'ae/c-stop/2', brief: 'b', cwd: workdir(), harness: 'codex' });
  await assert.rejects(client.cancelTask({ tenant: '', id: 'ae/c-stop/2', metadata: undefined }),
    (e: Error) => e.constructor.name === 'TaskNotCancelableError' && e.message === 'session `ae/c-stop/2` has ended (done): there is nothing to stop.');
  assert.equal((await get(client, 'ae/c-stop/2')).status!.state, TaskState.TASK_STATE_COMPLETED, 'and it is left as it ended');
});

test('a held Codex task is INPUT_REQUIRED between turns, with no process; its answer resumes the same thread, in the same context — and no running attempt is ever INPUT_REQUIRED', async () => {
  const root = tmp('store');
  const cwd = workdir();
  const engine = createEngine({ root, harnesses: { codex } });
  const journal = Journal.filesOps(root);
  const client = agent(root, (taskId) => Effect.runPromise(journal.read(taskId)));
  const id = await engine.file({ brief: 'the brief', cwd, harness: 'codex', holdOpen: true, closeoutSchema: SCHEMA });
  const phase = async (want: string) => { await engine.tick(); return (await engine.view(id)).phase === want; };

  await until(() => phase('input-required'), 'turn 0 signed and waiting');
  const first = await get(client, nameFor(id, 1));
  assert.equal(first.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED, 'the signed attempt of a held task waits on a person');
  assert.equal(first.contextId, THREAD);
  assert.deepEqual(closeoutOf(first), { outcome: 'done', summary: 'turn 1' }, 'its closing statement still its Artifact');
  assert.deepEqual((await list(client)).tasks.map((t) => [t.id, t.status!.state]), [[nameFor(id, 1), TaskState.TASK_STATE_COMPLETED]],
    "a listing keeps the harness's word, which is what the runtime observes");
  assert.equal(alive(pidIn(cwd, 'pid')), false, 'nothing runs while it waits');

  // The next turn waits on a gate, so it is caught running.
  fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify({ gate: 'go2' } satisfies Fake));
  await engine.answer(id, 'the words');
  await until(() => phase('running (working)'), 'the answer started turn 1');
  await until(() => argvOf(cwd).length === 2, 'the fake codex run again');
  const running = await get(client, nameFor(id, 2));
  assert.equal(running.status!.state, TaskState.TASK_STATE_WORKING, 'a Codex session running is working, never INPUT_REQUIRED: the worker writes no `blocked`');
  assert.equal((await get(client, nameFor(id, 1))).status!.state, TaskState.TASK_STATE_COMPLETED, 'and the turn it answered is no longer the one waiting');

  fs.writeFileSync(path.join(cwd, 'go2'), '');
  await until(() => phase('input-required'), 'turn 1 signed and waiting');
  assert.deepEqual(argvOf(cwd)[1]!.slice(-3), ['resume', THREAD, 'the words'], 'told the words, resuming the thread that signed');
  const second = await get(client, nameFor(id, 2));
  assert.equal(second.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED);
  assert.equal(second.contextId, first.contextId, 'one context across both turns');
  assert.deepEqual(closeoutOf(second), { outcome: 'done', summary: 'turn 2' });
  assert.deepEqual((await list(client, { contextId: THREAD })).tasks.map((t) => t.id), [nameFor(id, 1), nameFor(id, 2)]);

  await engine.close(id);
  await until(() => phase('succeeded'), 'closed and settled');
  assert.equal((await get(client, nameFor(id, 2))).status!.state, TaskState.TASK_STATE_COMPLETED, 'closed, nothing waits');
});

test("what `codex exec` cannot take while it runs: its card says no words, and a follow-up is refused, naming the spawn in its context — nothing written to it", async () => {
  const root = tmp('store');
  const ops = detachedOps(codex, root);
  const extension = cardOf('codex', ops).capabilities!.extensions.find((e) => e.uri === RUNTIME_EXTENSION)!;
  assert.deepEqual(extension.params as RuntimeExtensionParams, { methods: ['sessionLogs', 'sessionTranscript'], say: false });

  const cwd = workdir({ gate: 'go' });
  const client = agent(root);
  await send(client, { name: 'ae/c-say/1', brief: 'b', cwd, harness: 'codex' });
  await until(async () => (await get(client, 'ae/c-say/1')).status!.state === TaskState.TASK_STATE_WORKING && pidIn(cwd, 'pid') > 0, 'working');
  await assert.rejects(
    client.sendMessage({
      tenant: '', message: followUpOf('ae/c-say/1', 'hello', 'm-said'), metadata: undefined,
      configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
    }),
    (e: Error) => e instanceof UnsupportedOperationError
      && e.message === 'the `codex` harness has no channel into a running session: it takes no words once a session has started. To go on with its conversation, spawn a session of its own — a message marked `urn:agent-runtime:session:v1` — in this session\'s contextId.',
  );
  const runs = fs.readdirSync(path.join(root, 'runs', 'codex'));
  assert.equal(runs.some((f) => f.endsWith('.inbox.jsonl')), false, 'no inbox written');
  const run = JSON.parse(fs.readFileSync(path.join(root, 'runs', 'codex', 'ae_c_say_1.json'), 'utf8')) as Record<string, unknown>;
  assert.equal('input' in run, false, 'and the worker holds no way in: its stdin is not open');
  fs.writeFileSync(path.join(cwd, 'go'), '');
  await until(() => stateIs(client, 'ae/c-say/1', TaskState.TASK_STATE_COMPLETED), 'completed');
});
