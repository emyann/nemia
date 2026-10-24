/**
 * Codex as an A2A agent: the `codex` harness's detached driver behind its handler, asked through the SDK's `Client`, with
 * the REAL worker running a fake `codex` first on PATH — a node script that answers as `codex exec --json` does, and does
 * what the session's `fake.json` in its working directory tells it. Every session runs under an empty `CODEX_HOME`, so no
 * operator's config trusts or serves anything to it.
 *
 * What maps, each proved here: the Task's context is the Codex thread (`thread.started`), empty until Codex prints it; the
 * closing statement written to `-o` is the Task's one Artifact, data or prose; `cancelTask` ends the harness and what it
 * started, whether sent once the context shows the harness running or the moment the Task exists (the window before the
 * worker's pid is on disk is made to happen on demand in `detached.test.ts`); and a task held open is `INPUT_REQUIRED`
 * between turns, its answer resuming the same thread in the same context.
 *
 * A held attempt ends on its statement (`endedOnStatement`): once Codex has written `-o`, the task waits, though Codex has not yet
 * exited and its Task stays working, the harness's word, until the worker writes `done`. Under load the worker reads the
 * thread line off Codex's stdout after Codex has written `-o`, so the run file carries a statement and no thread: an attempt
 * ended then would be recorded with no session, and `answer` would refuse the task that waits on it. The fake makes that
 * happen on demand: it writes `-o` first and holds its thread line on a file.
 *
 * What `codex exec` cannot do, each pinned here rather than faked: it takes no words while it runs (its card says `say:
 * false`, and a follow-up is refused with nothing written to it), and it is never `INPUT_REQUIRED` while it runs — the worker
 * writes no `blocked` — only as a held task between turns, with no process. What it does stream: its card says so, and a
 * subscription to a working session is answered, and read to its end once the session completes, from its stdout and its rollout
 * (`test/codex-follow.test.ts`). What a live
 * Codex does with a resume is M13 (`live.test.ts`); here the fake prints the thread it was given by construction, so this
 * proves the plumbing, not Codex.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { TaskState, type Task } from '@a2a-js/sdk';
import type { Client } from '@a2a-js/sdk/client';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { clientOf } from '../src/a2a/client.ts';
import { cardOf } from '../src/a2a/handler.ts';
import { closeoutOf, followUpOf, messageOf, RUNTIME_EXTENSION } from '../src/a2a/map.ts';
import { nameFor } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

/** A task's events, read as the engine reads them: decoded and upgraded (`Journal.layer`). */
const readJournal = (taskId: string) =>
  Effect.gen(function* () {
    return yield* (yield* Journal).read(taskId);
  });

const THREAD = '01a09996-d343-7932-8971-b2f209ba315b';
const SCHEMA = {
  type: 'object',
  properties: { outcome: { type: 'string' }, summary: { type: 'string' } },
  required: ['outcome', 'summary'],
  additionalProperties: false,
};

/**
 * What the fake `codex` is told, per session, in `fake.json` in its working directory: wait for `gate` (a file in the same
 * directory) before it prints its thread; write prose rather than JSON to `-o`; start a `sleep` of its own and write its pid;
 * stay up `sleepMs` after its last line, or until the file `exitOn` exists; or write `-o` first and print its thread only once the
 * file `threadOn` exists, which is what the worker reads when it has not yet read the thread line off the pipe. It writes each argv
 * it is run with to `argv.jsonl`, its own pid to `pid`, and `wrote-out` once `-o` is written.
 */
type Fake = { gate?: string; prose?: boolean; grandchild?: boolean; sleepMs?: number; exitOn?: string; threadOn?: string };

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
const statement = () => {
  if (out !== -1) fs.writeFileSync(args[out + 1], o.prose ? 'turn ' + calls + ', in prose' : JSON.stringify({ outcome: 'done', summary: 'turn ' + calls }));
  fs.writeFileSync('wrote-out', '');
};
const go = () => {
  if (o.threadOn && !fs.existsSync(o.threadOn)) { statement(); const late = () => (fs.existsSync(o.threadOn) ? rest() : setTimeout(late, 20)); return late(); }
  said({ type: 'thread.started', thread_id: thread });
  said({ type: 'turn.started' });
  statement();
  finish();
};
const rest = () => { said({ type: 'thread.started', thread_id: thread }); said({ type: 'turn.started' }); finish(); };
const finish = () => {
  said({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 } });
  const exit = () => (o.exitOn && !fs.existsSync(o.exitOn) ? setTimeout(exit, 20) : process.exit(0));
  setTimeout(exit, o.sleepMs ?? 0);
};
const wait = () => (o.gate && !fs.existsSync(o.gate) ? setTimeout(wait, 20) : go());
wait();
`;

let bin: string;
const prev = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME };
before(() => {
  bin = scratch('ae-codex-agent-bin-');
  fs.writeFileSync(path.join(bin, 'fake-codex.cjs'), FAKE);
  fs.writeFileSync(path.join(bin, 'codex'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, 'fake-codex.cjs')}" "$@"\n`, {
    mode: 0o755,
  });
  process.env.PATH = `${bin}:${prev.PATH}`;
  process.env.CODEX_HOME = scratch('ae-codex-agent-home-');
});
after(() => {
  process.env.PATH = prev.PATH;
  if (prev.CODEX_HOME === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = prev.CODEX_HOME;
});

const tmp = (label: string) => scratch(`ae-codex-agent-${label}-`);
/** A session's working directory, with what the fake is told there. */
const workdir = (fake: Fake = {}) => {
  const cwd = tmp('work');
  fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify(fake));
  return cwd;
};
const argvOf = (cwd: string): string[][] => {
  try {
    return fs
      .readFileSync(path.join(cwd, 'argv.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};
const pidIn = (cwd: string, file: string) => {
  try {
    return Number(fs.readFileSync(path.join(cwd, file), 'utf8'));
  } catch {
    return 0;
  }
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/** Until `ok` holds, in test `t`, looked at every 50ms. */
const holds = (t: Waiter, ok: () => boolean | Promise<boolean>, what: string) => until(t, ok, what, { everyMs: 50 });

/** The codex agent over a store at `root`, as the engine's seam builds it, with no journal behind it unless given one. */
const agent = (root: string, events: (taskId: string) => Promise<readonly import('../src/core/domain.ts').Event[]> = async () => []) =>
  clientOf('codex', detachedOps(codex, root), events);
const send = (client: Client, r: SpawnRequest) =>
  client.sendMessage({
    tenant: '',
    message: messageOf(r, `m-${r.name}`),
    metadata: undefined,
    configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
  });
const get = (client: Client, id: string) => client.getTask({ tenant: '', id, historyLength: undefined });
const list = (client: Client, o: { contextId?: string; includeArtifacts?: boolean } = {}) =>
  client.listTasks({
    tenant: '',
    contextId: o.contextId ?? '',
    status: TaskState.TASK_STATE_UNSPECIFIED,
    pageSize: 50,
    pageToken: '',
    historyLength: undefined,
    statusTimestampAfter: undefined,
    includeArtifacts: o.includeArtifacts ?? false,
  });
const stateIs = async (client: Client, id: string, state: TaskState) => (await get(client, id)).status!.state === state;
/** A spawn, then its session run to its end, waited for in test `t`: the Task as it ended. */
const ran = async (t: Waiter, client: Client, r: SpawnRequest): Promise<Task> => {
  const started = (await send(client, r)) as Task;
  assert.equal(started.status!.state, TaskState.TASK_STATE_WORKING, 'the spawn is answered once the session starts');
  await holds(t, () => stateIs(client, r.name, TaskState.TASK_STATE_COMPLETED), `${r.name} completed`);
  return get(client, r.name);
};

test(
  'a Codex session through the seam: its thread is its context, its statement its one Artifact, a cancel ends what it started, and it takes no words while it runs but streams',
  WAITED,
  async (t) => {
    const s = story(t);
    await s.test("a Codex Task's context is its thread: empty until Codex prints it, the thread after — and listed by it", async (t) => {
      const root = tmp('store');
      const cwd = workdir({ gate: 'go' });
      const client = agent(root);
      await send(client, { name: 'ae/c-ctx/1', brief: 'the brief', cwd, harness: 'codex' });
      await holds(t, () => pidIn(cwd, 'pid') > 0, 'the fake codex started');
      const before = await get(client, 'ae/c-ctx/1');
      assert.equal(before.status!.state, TaskState.TASK_STATE_WORKING);
      assert.equal(before.contextId, '', 'no context is known before `thread.started`: nothing is invented');
      assert.deepEqual((await list(client, { contextId: THREAD })).tasks, [], 'nor listed under a thread not yet printed');

      fs.writeFileSync(path.join(cwd, 'go'), '');
      await holds(t, async () => (await get(client, 'ae/c-ctx/1')).contextId === THREAD, 'the thread read as the context');
      await holds(t, () => stateIs(client, 'ae/c-ctx/1', TaskState.TASK_STATE_COMPLETED), 'completed');
      assert.equal((await get(client, 'ae/c-ctx/1')).contextId, THREAD, 'and kept once it ended');
      assert.deepEqual(
        (await list(client, { contextId: THREAD })).tasks.map((t) => t.id),
        ['ae/c-ctx/1'],
      );
      assert.deepEqual((await list(client, { contextId: 'another-thread' })).tasks, []);
    });

    await s.test(
      "a Codex session's closing statement is its Task's one Artifact: JSON off `-o` as data, prose as text/plain — and a listing carries it only when asked",
      async (t) => {
        const root = tmp('store');
        const client = agent(root);

        const done = await ran(t, client, { name: 'ae/c-art/1', brief: 'b', cwd: workdir(), harness: 'codex', closeoutSchema: SCHEMA });
        assert.equal(done.artifacts.length, 1);
        const [artifact] = done.artifacts;
        assert.equal(artifact.artifactId, 'closeout');
        assert.equal(artifact.parts[0].content!.$case, 'data');
        assert.deepEqual(closeoutOf(done), { outcome: 'done', summary: 'turn 1' });
        assert.equal(
          artifact.metadata?.at,
          undefined,
          "no time: the spawn cleared Codex's `-o` file before the run, so it is the run's own",
        );

        assert.deepEqual(
          (await list(client)).tasks.map((t) => [t.id, t.artifacts]),
          [['ae/c-art/1', []]],
          "A2A's default leaves it out of a listing",
        );
        assert.deepEqual(
          (await list(client, { includeArtifacts: true })).tasks.map((t) => t.artifacts),
          [done.artifacts],
          'and includeArtifacts puts it in',
        );

        const prose = await ran(t, client, {
          name: 'ae/c-art/2',
          brief: 'b',
          cwd: workdir({ prose: true }),
          harness: 'codex',
          closeoutSchema: SCHEMA,
        });
        assert.equal(prose.artifacts.length, 1);
        assert.equal(prose.artifacts[0].parts[0].content!.$case, 'text');
        assert.equal(prose.artifacts[0].parts[0].mediaType, 'text/plain');
        assert.equal(closeoutOf(prose), 'turn 1, in prose');

        const plain = workdir();
        const unasked = await ran(t, client, { name: 'ae/c-art/3', brief: 'b', cwd: plain, harness: 'codex' });
        assert.equal(argvOf(plain)[0].includes('-o'), false, 'no statement asked for, no `-o`');
        assert.deepEqual(unasked.artifacts, [], 'and no Artifact');
      },
    );

    await s.test(
      'cancelTask ends a working Codex session and what it started, answers CANCELED again once stopped, and refuses a session that finished on its own',
      async (t) => {
        const root = tmp('store');
        const cwd = workdir({ grandchild: true, sleepMs: 30_000 });
        const client = agent(root);
        await send(client, { name: 'ae/c-stop/1', brief: 'b', cwd, harness: 'codex' });
        await holds(t, async () => (await get(client, 'ae/c-stop/1')).contextId === THREAD, 'the thread printed');
        const harness = pidIn(cwd, 'pid');
        const grandchild = pidIn(cwd, 'grandchild');
        assert.ok(harness > 0 && grandchild > 0 && alive(harness) && alive(grandchild), 'the fake and its own child run');

        const canceled = await client.cancelTask({ tenant: '', id: 'ae/c-stop/1', metadata: undefined });
        assert.equal(canceled.status!.state, TaskState.TASK_STATE_CANCELED);
        assert.equal(canceled.contextId, THREAD);
        await holds(t, () => stateIs(client, 'ae/c-stop/1', TaskState.TASK_STATE_CANCELED), 'read CANCELED');
        await holds(t, () => !alive(harness), 'the harness ended');
        await holds(t, () => !alive(grandchild), 'what the harness started ended with it: its process group was killed');
        const again = await client.cancelTask({ tenant: '', id: 'ae/c-stop/1', metadata: undefined });
        assert.equal(again.status!.state, TaskState.TASK_STATE_CANCELED, 'a repeat cancel is answered as the first, as A2A answers one');

        await ran(t, client, { name: 'ae/c-stop/2', brief: 'b', cwd: workdir(), harness: 'codex' });
        await assert.rejects(
          client.cancelTask({ tenant: '', id: 'ae/c-stop/2', metadata: undefined }),
          (e: Error) =>
            e.constructor.name === 'TaskNotCancelableError' &&
            e.message === 'session `ae/c-stop/2` has ended (completed): there is nothing to stop.',
        );
        assert.equal((await get(client, 'ae/c-stop/2')).status!.state, TaskState.TASK_STATE_COMPLETED, 'and it is left as it ended');

        const early = workdir({ sleepMs: 30_000 });
        await send(client, { name: 'ae/c-stop/3', brief: 'b', cwd: early, harness: 'codex' });
        assert.equal(
          (await client.cancelTask({ tenant: '', id: 'ae/c-stop/3', metadata: undefined })).status!.state,
          TaskState.TASK_STATE_CANCELED,
        );
        await holds(t, () => stateIs(client, 'ae/c-stop/3', TaskState.TASK_STATE_CANCELED), 'a cancel sent at once read CANCELED');
        const started = pidIn(early, 'pid');
        assert.ok(!(started > 0 && alive(started)), 'and no harness is left running');
      },
    );

    await s.test(
      'what `codex exec` cannot take while it runs: its card says no words, and a follow-up is refused, naming the spawn in its context once it has ended — nothing written to it; and that spawn resumes it',
      async (t) => {
        const root = tmp('store');
        const ops = detachedOps(codex, root);
        const card = cardOf('codex', ops);
        assert.ok(card.capabilities, 'its card says what it can do');
        assert.equal(card.capabilities.streaming, true, 'its card says it streams: a session is followed from its stdout and its rollout');
        const extension = card.capabilities.extensions.find((e) => e.uri === RUNTIME_EXTENSION)!;
        assert.deepEqual(extension.params, {
          methods: ['sessionLogs', 'sessionOutput', 'sessionTranscript', 'observeSessions', 'forgetSession', 'sessionKept'],
          say: false,
        });

        const cwd = workdir({ gate: 'go' });
        const client = agent(root);
        await send(client, { name: 'ae/c-say/1', brief: 'b', cwd, harness: 'codex' });
        await holds(
          t,
          async () => (await get(client, 'ae/c-say/1')).status!.state === TaskState.TASK_STATE_WORKING && pidIn(cwd, 'pid') > 0,
          'working',
        );
        const subscribed = client.resubscribeTask({ tenant: '', id: 'ae/c-say/1' });
        const first = await subscribed.next();
        const opened = first.value?.payload?.$case === 'task' ? first.value.payload.value : undefined;
        assert.equal(
          opened?.status?.state,
          TaskState.TASK_STATE_WORKING,
          'a subscription to the working session is answered: its Task, working',
        );
        await assert.rejects(
          client.sendMessage({
            tenant: '',
            message: followUpOf('ae/c-say/1', 'hello', 'm-said'),
            metadata: undefined,
            configuration: { acceptedOutputModes: [], taskPushNotificationConfig: undefined, returnImmediately: true },
          }),
          (e: Error) =>
            e instanceof UnsupportedOperationError &&
            e.message ===
              "the `codex` harness has no channel into a running session: it takes no words once a session has started. Once this session has ended, go on with its conversation by spawning a session of its own — a message marked `urn:agent-runtime:session:v1` — in this session's contextId.",
        );
        const runs = fs.readdirSync(path.join(root, 'runs', 'codex'));
        assert.equal(
          runs.some((f) => f.endsWith('.inbox.jsonl')),
          false,
          'no inbox written',
        );
        const run = JSON.parse(fs.readFileSync(path.join(root, 'runs', 'codex', 'ae_c_say_1.json'), 'utf8')) as Record<string, unknown>;
        assert.equal('input' in run, false, 'and the worker holds no way in: its stdin is not open');
        fs.writeFileSync(path.join(cwd, 'go'), '');
        const states: TaskState[] = [];
        for await (const r of subscribed) {
          if (r.payload?.$case === 'task' || r.payload?.$case === 'statusUpdate') states.push(r.payload.value.status!.state);
        }
        assert.equal(states.at(-1), TaskState.TASK_STATE_COMPLETED, 'the subscription read to its end: the session completed');
        await holds(t, () => stateIs(client, 'ae/c-say/1', TaskState.TASK_STATE_COMPLETED), 'completed');

        const context = (await get(client, 'ae/c-say/1')).contextId;
        assert.equal(context, THREAD);
        const next = await ran(t, client, { name: 'ae/c-say/2', brief: 'hello', cwd, harness: 'codex', resumeFrom: context });
        assert.deepEqual(argvOf(cwd)[1].slice(-3), ['resume', THREAD, 'hello'], 'the words reach the same thread, as a turn of its own');
        assert.equal(next.contextId, THREAD, 'in the same context');
        assert.deepEqual((await list(client, { contextId: THREAD })).tasks.map((t) => t.id).sort(), ['ae/c-say/1', 'ae/c-say/2']);
      },
    );
  },
);

test(
  'a held Codex task is INPUT_REQUIRED between turns, with no process; its answer resumes the same thread, in the same context — and no running attempt is ever INPUT_REQUIRED',
  WAITED,
  async (t) => {
    const root = tmp('store');
    const cwd = workdir();
    const engine = builtEngine(Engine.layer({ root, harnesses: { codex } }));
    const client = agent(root, (taskId) => Effect.runPromise(readJournal(taskId).pipe(Effect.provide(Journal.files(root)))));
    const id = await Effect.runPromise(engine.file({ brief: 'the brief', cwd, harness: 'codex', holdOpen: true, closeoutSchema: SCHEMA }));
    const phase = async (want: string) => {
      await Effect.runPromise(engine.tick());
      return (await Effect.runPromise(engine.view(id))).phase === want;
    };

    fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify({ exitOn: 'exit1' } satisfies Fake));
    await holds(t, () => phase('input-required'), 'turn 0 signed and waiting');
    assert.equal(
      (await get(client, nameFor(id, 1))).status!.state,
      TaskState.TASK_STATE_WORKING,
      "while Codex is still exiting, its Task is the harness's word: working (open issue 31)",
    );
    fs.writeFileSync(path.join(cwd, 'exit1'), '');
    await holds(
      t,
      () => stateIs(client, nameFor(id, 1), TaskState.TASK_STATE_INPUT_REQUIRED),
      'the signed attempt of a held task waits on a person, once Codex has exited',
    );
    const first = await get(client, nameFor(id, 1));
    assert.equal(first.contextId, THREAD);
    assert.deepEqual(closeoutOf(first), { outcome: 'done', summary: 'turn 1' }, 'its closing statement still its Artifact');
    assert.deepEqual(
      (await list(client)).tasks.map((t) => [t.id, t.status!.state]),
      [[nameFor(id, 1), TaskState.TASK_STATE_COMPLETED]],
      "a listing keeps the harness's word, which is what the runtime observes",
    );
    assert.equal(alive(pidIn(cwd, 'pid')), false, 'nothing runs while it waits');

    fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify({ gate: 'go2' } satisfies Fake));
    await Effect.runPromise(engine.answer(id, 'the words'));
    await holds(t, () => phase('working'), 'the answer started turn 1');
    await holds(t, () => argvOf(cwd).length === 2, 'the fake codex run again');
    const running = await get(client, nameFor(id, 2));
    assert.equal(
      running.status!.state,
      TaskState.TASK_STATE_WORKING,
      'a Codex session running is working, never INPUT_REQUIRED: the worker writes no `blocked`',
    );
    assert.equal(
      (await get(client, nameFor(id, 1))).status!.state,
      TaskState.TASK_STATE_COMPLETED,
      'and the turn it answered is no longer the one waiting',
    );

    fs.writeFileSync(path.join(cwd, 'go2'), '');
    await holds(t, () => phase('input-required'), 'turn 1 signed and waiting');
    assert.deepEqual(argvOf(cwd)[1].slice(-3), ['resume', THREAD, 'the words'], 'told the words, resuming the thread that signed');
    await holds(
      t,
      () => stateIs(client, nameFor(id, 2), TaskState.TASK_STATE_INPUT_REQUIRED),
      'turn 1 waits on a person once Codex has exited',
    );
    const second = await get(client, nameFor(id, 2));
    assert.equal(second.contextId, first.contextId, 'one context across both turns');
    assert.deepEqual(closeoutOf(second), { outcome: 'done', summary: 'turn 2' });
    assert.deepEqual(
      (await list(client, { contextId: THREAD })).tasks.map((t) => t.id),
      [nameFor(id, 1), nameFor(id, 2)],
    );

    await Effect.runPromise(engine.close(id));
    await holds(t, () => phase('succeeded'), 'closed and settled');
    assert.equal((await get(client, nameFor(id, 2))).status!.state, TaskState.TASK_STATE_COMPLETED, 'closed, nothing waits');
  },
);

test(
  'a held Codex attempt whose statement is on disk before its thread is read is not ended on the statement: it ends once its session is known, and the answer resumes that thread',
  WAITED,
  async (t) => {
    const root = tmp('store');
    const cwd = workdir({ threadOn: 'thread-go', exitOn: 'exit1' });
    const engine = builtEngine(Engine.layer({ root, harnesses: { codex } }));
    const id = await Effect.runPromise(engine.file({ brief: 'the brief', cwd, harness: 'codex', holdOpen: true, closeoutSchema: SCHEMA }));
    const phase = async (want: string) => {
      await Effect.runPromise(engine.tick());
      return (await Effect.runPromise(engine.view(id))).phase === want;
    };

    await holds(
      t,
      async () => {
        await Effect.runPromise(engine.tick());
        return fs.existsSync(path.join(cwd, 'wrote-out'));
      },
      'the statement written',
    );
    for (let i = 0; i < 5; i++) await Effect.runPromise(engine.tick());
    assert.notEqual(
      (await Effect.runPromise(engine.view(id))).phase,
      'input-required',
      'a statement with no session known does not end the attempt',
    );

    fs.writeFileSync(path.join(cwd, 'thread-go'), '');
    await holds(t, () => phase('input-required'), 'the attempt ended once its thread was read');
    fs.writeFileSync(path.join(cwd, 'exit1'), '');
    fs.writeFileSync(path.join(cwd, 'fake.json'), JSON.stringify({} satisfies Fake));
    await Effect.runPromise(engine.answer(id, 'the words'));
    await holds(
      t,
      async () => {
        await Effect.runPromise(engine.tick());
        return argvOf(cwd).length === 2;
      },
      'the fake codex run again',
    );
    assert.deepEqual(argvOf(cwd)[1].slice(-3), ['resume', THREAD, 'the words'], 'told the words, resuming the thread that signed');
    await holds(t, () => phase('input-required'), 'turn 1 signed and waiting');
    await Effect.runPromise(engine.close(id));
    await holds(t, () => phase('succeeded'), 'closed and settled');
  },
);
