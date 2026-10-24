/**
 * Telling a running session something, at shipped defaults — a job on the stand-in Claude Code the Agent SDK runs, which writes
 * down every user message it read.
 *
 * `say` is a write path into a session a step is running, and the point of it is the trace: the words a person gave a running step
 * are on its record, so a reviewer can tell a change they authorised from a step overstepping. So what is checked is that the words
 * reach the session verbatim, as the next user message on its input, and land on the journal, and that every refusal refuses — with
 * exit 2, nothing sent and nothing journalled. Every Claude Code session runs on the SDK: a job is told on its stdin, a held session
 * on its input (`attached.boundary.test.ts`); there is no `--bg` inbox to find.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { EngineShape, TaskSpec } from '../src/index.ts';
import { Engine as EngineService } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { builtEngine } from './engine.ts';
import { STAND_IN } from './attached-held.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';

const tmp = (label: string) => scratch(`ae-say-${label}-`);
const work = tmp('work');

/**
 * The stand-in Claude Code a job runs on the Agent SDK, and the folder it writes what it saw into: a job is no `claude`
 * command line, so what reached its session is read here (`said.jsonl`) rather than off the fake `claude`'s stdin. Its plan
 * holds every turn at the file `end` and works each message as a turn of its own, so a job stays at work while it is told
 * things — and goes on running after its first result, which is the state a word said too late is refused in.
 */
const STAND_IN_PLAN = { id: '5e551011-0000-4000-8000-0000000000aa', turns: 'many', hold: true };

/** What the session whose stand-in writes into `dir` was told, in order: every user message it read. */
const toldIn = (dir: string): string[] | undefined => {
  try {
    return fs
      .readFileSync(path.join(dir, 'said.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string);
  } catch {
    return undefined;
  }
};

const entries = async (engine: EngineShape, id: string) => (await Effect.runPromise(engine.feed(0))).entries.filter((e) => e.taskId === id);

type Refusal = Error & { _tag?: string };

/** Refused: `SayRefused`, the words matched, and nothing journalled. */
const refused = async (engine: EngineShape, id: string, text: string, pattern: RegExp) => {
  const before = (await entries(engine, id)).length;
  await assert.rejects(Effect.runPromise(engine.say(id, text)), (e: Refusal) => {
    assert.equal(e._tag, 'SayRefused', e.message);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal((await entries(engine, id)).length, before, 'nothing journalled');
};

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

/** `ae`, run as a child, its output read as it comes. */
const aeRun = (args: string[], env: NodeJS.ProcessEnv) =>
  new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [ae, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
    });
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });

/** What `read` answers, in test `t`, once it answers anything: read again every 50ms. */
const heard = <T>(t: Waiter, read: () => T | undefined | Promise<T | undefined>, what: string) => until(t, read, what, { everyMs: 50 });

/** A job filed at shipped defaults and ticked until its harness has read its brief on its stdin, in test `t`. */
const job = async (t: Waiter, engine: EngineShape, brief: string, spec: Partial<TaskSpec> = {}) => {
  const dir = tmp(`stand-in-${brief}`);
  const id = await Effect.runPromise(
    engine.file({
      brief,
      cwd: work,
      ...spec,
      config: { ...spec.config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(STAND_IN_PLAN) } },
    }),
  );
  await Effect.runPromise(engine.tick());
  await heard(t, () => (toldIn(dir)?.includes(brief) ? true : undefined), `${brief} read its brief`);
  return { id, told: () => toldIn(dir)!, letGo: () => fs.writeFileSync(path.join(dir, 'end'), '') };
};

/** Whether the worker of `runFile` has closed its session's input and written the state it ended on: nothing writes it after. */
const workerDone = (runFile: string): true | undefined => {
  const run = JSON.parse(fs.readFileSync(runFile, 'utf8')) as { inputClosed?: boolean; state?: string };
  return run.inputClosed === true && run.state !== 'working' ? true : undefined;
};

/**
 * The run of `runFile` written as it stands when its worker has closed the session's input and its process has not exited yet: a
 * job on the SDK leaves its result and ends with it, so there is no window to wait for. The rule under test is the worker's —
 * that a word said after the harness's closing line is refused rather than appended for nobody — and it is read off this file.
 *
 * Written once `workerDone` says the worker has written its last state, or that write lands on top of this one and the say is
 * refused for a session that has ended, which is another rule.
 *
 * @returns the file as it was, to write back once the rule has been read
 */
const withInputClosed = (runFile: string): string => {
  const was = fs.readFileSync(runFile, 'utf8');
  const run = JSON.parse(was) as Record<string, unknown>;
  fs.writeFileSync(runFile, JSON.stringify({ ...run, state: 'working', inputClosed: true, exitCode: undefined }));
  return was;
};

test(
  'a person tells a job at shipped defaults on its stdin: verbatim, as the next user message after its brief, in order, in bypassPermissions too — and nothing more once it has given its result',
  WAITED,
  async (t) => {
    const s = story(t);
    const root = tmp('board');
    const engine = builtEngine(EngineService.layer({ root, claudeExecutable: STAND_IN }));

    await s.test('a job is told the words, verbatim, as the next user message after its brief — then journalled', async (sub) => {
      const { id, told } = await job(sub, engine, 'job-told');
      const text = 'Widen the scope to `apps/api` too.\nAnd answer: yes, "keep" the old route — ça va.';
      const said = await Effect.runPromise(engine.say(id, text));
      assert.equal(said.attempt, 1);
      assert.equal(said.text, text);
      assert.ok(Number.isFinite(Date.parse(said.at)), 'dated');
      assert.deepEqual((await Effect.runPromise(engine.view(id))).state.said, [said], 'journalled');
      assert.deepEqual((await entries(engine, id)).at(-1)?.event, { kind: 'said', ...said }, 'and the feed has it, last');
      const read = await heard(sub, () => (told().length > 1 ? told() : undefined), 'the words on its input');
      assert.deepEqual(read, ['job-told', text], 'one message each, a line break in the words kept inside theirs');

      await Effect.runPromise(engine.say(id, 'and the web app'));
      await heard(sub, () => (told().length === 3 ? true : undefined), 'the second words');
      assert.equal(told()[2], 'and the web app', 'in the order they were said');

      const env = { ...process.env, AE_ROOT: root };
      const ok = await aeRun(['say', id, 'widen', 'the scope to the api'], env);
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(
        ok.stdout,
        new RegExp(`${id}\\s+said\\s+to attempt 1: widen the scope to the api`),
        '`ae say` prints the line it journalled',
      );
      await heard(sub, () => (told().at(-1) === 'widen the scope to the api' ? true : undefined), 'the words `ae say` gave');
      const empty = await aeRun(['say', id, ''], env);
      assert.equal(empty.status, 2, empty.stderr);
      assert.ok(empty.stderr.includes('`text`'), empty.stderr);
      assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 3, 'the empty words journalled nothing');

      await Effect.runPromise(engine.stop(id));
      await refused(engine, id, 'hello', /has been asked to stop/);
      await Effect.runPromise(engine.tick());
    });

    await s.test('a job in bypassPermissions is told: its words go on its input, which no approval holds', async (sub) => {
      const { id, told } = await job(sub, engine, 'job-bypass', { config: { permissionMode: 'bypassPermissions' } });
      await Effect.runPromise(engine.say(id, 'carry on'));
      await heard(sub, () => (told().length === 2 ? true : undefined), 'the words on its input');
      assert.equal((await Effect.runPromise(engine.view(id))).state.said.length, 1);
      await Effect.runPromise(engine.stop(id));
      await Effect.runPromise(engine.tick());
    });

    let lingering = '';
    await s.test(
      'a job that has given its result reads nothing more: words said before it exits are rejected unsent, not journalled',
      async (sub) => {
        const { id, told, letGo } = await job(sub, engine, 'job-lingers');
        lingering = id;
        await Effect.runPromise(engine.say(id, 'finish and linger'));
        await heard(sub, () => (told().length === 2 ? true : undefined), 'the words on its input');
        letGo();
        const workerFile = (ext: string) => path.join(root, 'runs', 'claude', `ae/${id}/1`.replace(/[^a-zA-Z0-9]+/g, '_') + ext);
        const runFile = workerFile('.json');
        await heard(sub, () => workerDone(runFile), 'its input closed at its result, and its worker done writing');
        assert.deepEqual(
          (await Effect.runPromise(engine.view(id))).state.said.map((x) => x.text),
          ['finish and linger'],
          'the words said before its result are the only ones journalled',
        );
        assert.equal(told().length, 2, 'and the only ones its session read');

        const was = withInputClosed(runFile);
        const before = fs.readFileSync(workerFile('.inbox.jsonl'), 'utf8');
        await assert.rejects(
          Effect.runPromise(engine.say(id, 'one more thing')),
          (e: Refusal) => {
            assert.equal(e._tag, 'SayUnsent', e.message);
            assert.match(e.message, /has given its result and reads no more words/);
            return true;
          },
          "its harness lists it working, so this is the worker's word, not the engine's: unsent, no refusal",
        );
        assert.deepEqual(
          (await Effect.runPromise(engine.view(id))).state.said.map((x) => x.text),
          ['finish and linger'],
          'nothing more journalled',
        );
        assert.equal(fs.readFileSync(workerFile('.inbox.jsonl'), 'utf8'), before, 'nothing appended');
        assert.equal(before.split('\n').filter(Boolean).length, 1);
        fs.writeFileSync(runFile, was);
      },
    );

    await s.test('once it has settled, refused', async () => {
      await Effect.runPromise(engine.stop(lingering));
      for (let i = 0; i < 20 && !(await Effect.runPromise(engine.view(lingering))).state.settled; i++) {
        await Effect.runPromise(engine.tick());
        await new Promise((r) => setTimeout(r, 50));
      }
      await refused(engine, lingering, 'hello', /has settled.*`resumeFrom`/s);
    });
  },
);

/**
 * Each refusal of `say` at shipped defaults: SayRefused, the words matched, and nothing journalled. The rows share one engine, each on
 * a task of its own, none ticked: a pass would start it.
 */
const SAY_REFUSALS: Array<{ name: string; says: RegExp; text?: string; task: (engine: EngineShape) => Promise<string> }> = [
  { name: 'empty words', says: /`text` is empty/, text: '', task: (engine) => Effect.runPromise(engine.file({ brief: 'b', cwd: work })) },
  {
    name: 'words that are only whitespace',
    says: /`text` is empty/,
    text: ' \n\t ',
    task: (engine) => Effect.runPromise(engine.file({ brief: 'b', cwd: work })),
  },
  { name: 'a task the engine has no record of', says: /`no-such-task` is not a task in this store/, task: async () => 'no-such-task' },
  {
    name: 'a Codex task, in its own words — `codex exec` takes nothing while it runs',
    says: /`codex exec` reads its prompt once and takes nothing while it runs/,
    task: (engine) => Effect.runPromise(engine.file({ brief: 'review', cwd: work, harness: 'codex' })),
  },
  ...[undefined, { permissionMode: 'bypassPermissions' as const }].map((config) => ({
    name: `a job ${config ? 'in bypassPermissions ' : ''}before its attempt, refused only as any task is — never for its mode`,
    says: /has not started an attempt yet/,
    task: (engine: EngineShape) => Effect.runPromise(engine.file({ brief: 'b', cwd: work, config })),
  })),
];

test('say: what it refuses — SayRefused, nothing journalled', async (t) => {
  const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
  for (const row of SAY_REFUSALS)
    await t.test(`refused: ${row.name}`, async () => refused(engine, await row.task(engine), row.text ?? 'hello', row.says));
});
