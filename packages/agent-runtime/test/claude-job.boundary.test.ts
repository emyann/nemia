/**
 * A Claude Code job on the Agent SDK, with nothing holding it: an engine that never holds (`hold` is not called, so
 * `attached.holding()` is false and every spawn takes the job's road) files a task on `claude` and runs it to its end — the real
 * worker, the real `bin/ae-claude-job.ts`, the real `query()`, and the stand-in Claude Code the SDK runs
 * (`fixtures/stand-in-claude.ts`) as the engine's `claudeExecutable`.
 *
 * What it holds: the job completes; its closeout, its usage and its denials are read off the capture its own process printed;
 * `say` reaches the session mid-turn; `follow` gives the text in pieces as it is written; `transcript` reads the conversation;
 * and **no `claude` on PATH is called** — one that records every call is never called: the job is no Claude Code command line. A
 * job that asked for the claude.ai bridge opens it at init, its own process writing the bridge's facts beside its run.
 *
 * A boundary test: a real store, a real detached worker, a second real process running the SDK, and a real child CLI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Stream } from 'effect';
import { scratch } from './scratch.ts';
import { story } from './checkpoints.ts';
import { until, WAITED } from '../src/waits/index.ts';

/** Where Claude Code keeps its transcripts, for the stand-in and the runtime's reader alike: set before `src` is imported. */
const CONFIG = scratch('ae-job-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;

const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
const { STAND_IN } = await import('./attached-held.ts');

/** The session id the stand-in answers under: hex and dashes, as a start event's id must be. */
const JOB_ID = '5e551011-0000-4000-8000-00000000000c';

/**
 * A `claude` on PATH that records every call: nothing of this engine's may run it, since a job is no Claude Code command line.
 */
const watchedPath = (dir: string) => {
  fs.writeFileSync(path.join(dir, 'claude'), ['#!/bin/sh', `echo "$@" >> '${dir}/claude-calls'`, ''].join('\n'), { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  return () => {
    process.env.PATH = prev;
  };
};

/** The lines of the stand-in's `file`, each parsed; `[]` where it wrote none. */
const wrote = (dir: string, file: string): unknown[] => {
  try {
    return fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  } catch {
    return [];
  }
};

test('an engine with no holder runs a Claude Code job to its end on the Agent SDK, and calls no `claude` on PATH', WAITED, async (t) => {
  const s = story(t);
  const root = scratch('ae-job-');
  const dir = path.join(root, 'work');
  fs.mkdirSync(dir, { recursive: true });
  const restore = watchedPath(dir);
  t.after(restore);

  const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude' }, claudeExecutable: STAND_IN }));
  const plan = { id: JOB_ID, stream: true, transcript: true, deny: 'Bash', hold: true, cost: 0.02, output: { outcome: 'done' } };
  const taskId = await Effect.runPromise(
    engine.file({
      brief: 'say it',
      cwd: dir,
      harness: 'claude',
      closeoutSchema: { type: 'object' },
      config: { env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan) } },
    }),
  );
  t.after(() => {
    fs.writeFileSync(path.join(dir, 'more'), '');
    fs.writeFileSync(path.join(dir, 'end'), '');
    return Effect.runPromise(Effect.ignore(engine.stop(taskId)));
  });
  const seen: string[] = [];
  let reading: Promise<void> = Promise.resolve();

  await s.test('the brief reaches the session, as the worker wrote it on the bin’s stdin', async (st) => {
    await Effect.runPromise(engine.tick());
    await until(st, () => wrote(dir, 'said.jsonl').length === 1, 'the brief reached the session', { everyMs: 50 });
    assert.deepEqual(wrote(dir, 'said.jsonl'), ['say it'], 'the brief, as the worker wrote it on the bin’s stdin');
  });

  await s.test('it is followed live, its text given in pieces as it is written', async (st) => {
    const followed = await Effect.runPromise(engine.follow(taskId));
    assert.ok(followed, 'a job is followed live');
    reading = Effect.runPromise(
      Stream.runForEach(followed, (m) => Effect.sync(() => void (m.kind === 'partial' && seen.push(m.text)))).pipe(
        Effect.catchCause(() => Effect.void),
      ),
    );
    await until(
      st,
      () => seen.includes('Half '),
      () => `the text so far: ${seen.join('|')}`,
      { everyMs: 50 },
    );
    fs.writeFileSync(path.join(dir, 'more'), '');
    await until(
      st,
      () => seen.includes('a thought'),
      () => `and the rest of it: ${seen.join('|')}`,
      { everyMs: 50 },
    );
  });

  await s.test('words said reach the session mid-turn', async (st) => {
    await Effect.runPromise(engine.say(taskId, 'and again'));
    await until(st, () => wrote(dir, 'said.jsonl').length === 2, 'the words reached the session mid-turn', { everyMs: 50 });
    assert.deepEqual(wrote(dir, 'said.jsonl'), ['say it', 'and again']);
  });

  await s.test('it runs to its end: its closeout, its cost and its denials read off the capture its own process printed', async (st) => {
    fs.writeFileSync(path.join(dir, 'end'), '');
    const view = await until(
      st,
      async () => {
        await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(taskId));
        return v.state.settled ? v : undefined;
      },
      'the task settled',
      { everyMs: 100 },
    );
    await reading;

    assert.equal(view.state.settled, 'succeeded', `the job ran to its end: ${JSON.stringify(view.state.attempts.at(-1))}`);
    const attempt = view.state.attempts.at(-1)!;
    assert.equal(attempt.ended, 'succeeded', 'its own process exited 0 on a result that was no error');
    assert.deepEqual(attempt.closeout, { outcome: 'done' }, 'its closeout, read off the capture its own process printed');
    assert.equal(attempt.usage?.costUsd, 0.02, 'and what it cost');
    assert.deepEqual(
      attempt.denials?.map((d) => d.tool),
      ['Bash'],
      'and the call it was denied, read off the stream as it happened',
    );
  });

  await s.test('its conversation is read from Claude Code’s own record', async () => {
    const read = await Effect.runPromise(engine.transcript(taskId));
    assert.ok(
      read?.events.some((e) => e.text === 'Half a thought'),
      `the conversation is read from Claude Code's own record: ${JSON.stringify(read?.events)}`,
    );
  });

  await s.test('no `claude` command line was spawned for the job', () => {
    const called = fs.existsSync(path.join(dir, 'claude-calls'))
      ? fs.readFileSync(path.join(dir, 'claude-calls'), 'utf8').split('\n').filter(Boolean)
      : [];
    assert.deepEqual(called, [], 'no `claude` command line was called, `claude agents` included: there is no `--bg` session to list');
  });
});

test(
  'a job with no holder that asked for the bridge opens it at init: its own process writes the facts beside its run, and a look reads the link',
  WAITED,
  async (t) => {
    const root = scratch('ae-job-bridge-');
    const dir = path.join(root, 'work');
    fs.mkdirSync(dir, { recursive: true });
    const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude' }, claudeExecutable: STAND_IN }));
    const plan = { id: JOB_ID, hold: true, output: { outcome: 'done' } };
    const taskId = await Effect.runPromise(
      engine.file({
        brief: 'say it',
        cwd: dir,
        harness: 'claude',
        config: { claude: { remoteControl: true }, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan) } },
      }),
    );
    t.after(() => {
      fs.writeFileSync(path.join(dir, 'end'), '');
      return Effect.runPromise(Effect.ignore(engine.stop(taskId)));
    });
    await Effect.runPromise(engine.tick());
    const view = await until(
      t,
      async () => {
        const v = await Effect.runPromise(engine.view(taskId));
        return v.bridge?.url ? v : undefined;
      },
      'the link read off the bridge file',
      { everyMs: 100 },
    );
    assert.equal(view.bridge?.url, `https://claude.ai/s/cse_${JOB_ID}`);
    assert.equal(view.state.settled, null, 'opened at init, while its one turn is still held: before its result');
    const asks = wrote(dir, 'taken.jsonl').filter((r) => (r as { subtype?: string }).subtype === 'remote_control');
    assert.equal(asks.length, 1, 'one bridge control request');
    assert.equal((asks[0] as { keep_session_on_exit?: boolean }).keep_session_on_exit, false, "a job's claude.ai session closes with it");
    const files = fs.readdirSync(path.join(root, 'runs', 'claude'));
    assert.ok(
      files.some((f) => f.endsWith('.bridge')),
      `the facts on a file beside the run, not only in a process's memory: ${files}`,
    );
  },
);
