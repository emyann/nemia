/**
 * A detached session's own id, read by the worker from its harness's start event (`HarnessSpec.start`), against the REAL worker
 * with `sh` as the harness.
 *
 * What the tests below rest on:
 * - The worker reads whole lines of the harness's stdout, so a line printed in two writes, a `sleep` between them, reaches it whole;
 *   one printed at once passes these tests just as well, so the sleep can only make a test pass wrongly under load, never fail it.
 * - A start refused leaves its session unread while its process runs, and every other session of the harness read: `observeFor`
 *   names it `unread`, and `observe` leaves it out; once its process has ended it is read as failed, with no id, so its task
 *   settles and can be forgotten. Why is said as a warning on every look the run file lasts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, type HarnessSpec, type StartEvent } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { CODEX_START, codexOutput } from '../src/harness/codex/stream.ts';
import { CLAUDE_INIT_START, CLAUDE_RESULT_START, claudeDetached, claudeJob } from '../src/harness/claude/code.ts';
import { Engine } from '../src/index.ts';
import { scratch } from './scratch.ts';
import { warned } from './warned.ts';
import { builtEngine } from './engine.ts';
import { until, WAITED, type Waiter } from '../src/waits/index.ts';
import { resultLine, SESSION, stream } from './reader-streams.ts';

const THREAD = '01a09996-d343-7932-8971-b2f209ba315b';
const OTHER = '0eeeeeee-0000-4000-8000-00000000000e';

/** A harness that runs `script` under `sh`, whose start event is `start`. */
const sh = (script: string, start: StartEvent, more: Partial<HarnessSpec> = {}): HarnessSpec => ({
  name: 'sh',
  command: () => ({ cmd: 'sh', args: ['-c', script] }),
  start,
  ...more,
});

/** A script that prints each of `lines` on stdout, a line each. */
const printed = (...lines: string[]) => lines.map((l) => `printf '%s\\n' '${l}'`).join('; ');

/** The run file of the run under `name`, as the worker last wrote it. */
const runFile = (root: string, name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(root, 'runs', 'sh', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`), 'utf8'));

/** The run file of the run under `name`, or nothing yet. */
const runFileOr = (root: string, name: string): Record<string, unknown> => {
  try {
    return runFile(root, name);
  } catch {
    return {};
  }
};

/**
 * Spawns `spec`'s run under `name` and waits for its worker to write an end, then gives back its run file; `t`'s test fails if none
 * comes.
 */
const ran = async (t: Waiter, spec: HarnessSpec, name = 'ae/t/1', root = scratch('ae-start-')) => {
  const ops = detachedOps(spec, root);
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd: root }));
  await until(
    t,
    () => ![undefined, 'working'].includes(runFileOr(root, name).state as string | undefined),
    () => `${name} ended: its run file is ${JSON.stringify(runFileOr(root, name))}`,
    { everyMs: 100 },
  );
  return { ops, root, run: runFile(root, name) };
};

const threadStarted = (thread_id: unknown) => JSON.stringify({ type: 'thread.started', thread_id });

test('the id of an item that comes before the start is not the thread’s: the thread’s is taken', WAITED, async (t) => {
  const { run } = await ran(
    t,
    sh(
      printed(JSON.stringify({ type: 'item.started', item: { id: 'aaaaaaaaaaaaaaaaaaaa', type: 'x' } }), threadStarted(THREAD)),
      CODEX_START,
    ),
  );
  assert.equal(run.nativeId, THREAD);
});

test('a second start event, with another id, is not read: the first one’s id is kept', WAITED, async (t) => {
  const { run } = await ran(t, sh(printed(threadStarted(THREAD), threadStarted(OTHER)), CODEX_START));
  assert.equal(run.nativeId, THREAD);
});

test('a session_id on a hook line before init is not the session’s: init’s is taken', WAITED, async (t) => {
  const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: OTHER });
  const { run } = await ran(t, sh(printed(hook, stream.init), CLAUDE_INIT_START));
  assert.equal(run.nativeId, SESSION);
});

test('an id split across two writes is read whole', WAITED, async (t) => {
  const [head, tail] = [threadStarted(THREAD).slice(0, 40), threadStarted(THREAD).slice(40)];
  const { run } = await ran(t, sh(`printf '%s' '${head}'; sleep 0.3; printf '%s\\n' '${tail}'`, CODEX_START));
  assert.equal(run.nativeId, THREAD);
});

test('a start line with no newline after it is read at the end of the stream', WAITED, async (t) => {
  const { run } = await ran(t, sh(`printf '%s' '${resultLine({})}'`, CLAUDE_RESULT_START));
  assert.equal(run.state, 'done');
  assert.equal(run.nativeId, SESSION);
});

const REFUSAL_WORDS = [
  /`ae\/bad\/1`/,
  /line\s+1\s+of\s+its\s+stdout/,
  /`thread\.started`/,
  /`thread_id`/,
  /12345/,
  /hex\s+and\s+dashes/,
  /unread\s+while\s+its\s+process\s+runs/,
  /read\s+as\s+failed/,
  /`ae forget`/,
];

test(
  'REFUSED: a start whose id is a number leaves that session unread while its process runs, and the next one of the harness read',
  WAITED,
  async (t) => {
    const root = scratch('ae-start-');
    const bad = detachedOps(sh(`${printed(threadStarted(12345))}; sleep 30`, CODEX_START), root);
    await Effect.runPromise(bad.spawn({ name: 'ae/bad/1', brief: 'x', cwd: root }));
    await until(
      t,
      () => runFileOr(root, 'ae/bad/1').startRefused !== undefined,
      () => `ae/bad/1 refused its start: its run file is ${JSON.stringify(runFileOr(root, 'ae/bad/1'))}`,
      { everyMs: 100 },
    );
    try {
      const good = await ran(t, sh(printed(threadStarted(THREAD)), CODEX_START), 'ae/good/1', root);
      assert.equal(runFile(root, 'ae/bad/1').state, 'working');

      const listed = await warned(good.ops.observe);
      assert.deepEqual([...listed.value.keys()], ['ae/good/1'], 'the refused session is left out while it runs, the other read');
      assert.equal(listed.value.get('ae/good/1')?.nativeId, THREAD);
      assert.equal(listed.warnings.length, 1);
      for (const w of REFUSAL_WORDS) assert.match(listed.warnings[0], w);

      const asked = await warned(good.ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
      assert.deepEqual([...asked.value.unread], ['ae/bad/1'], 'unread while it runs, never read as a live session with no id');
      assert.deepEqual([...asked.value.seen.keys()], ['ae/good/1']);
      assert.equal(asked.warnings.length, 1);
      for (const w of REFUSAL_WORDS) assert.match(asked.warnings[0], w);
    } finally {
      await Effect.runPromise(bad.stop('ae/bad/1'));
    }
  },
);

test(
  'REFUSED: a start whose id is a number is why its session is unread, by its name, while its process runs, and on no look once it has ended',
  WAITED,
  async (t) => {
    const root = scratch('ae-start-');
    const marker = path.join(root, 'go');
    const script = `${printed(threadStarted(12345))}; timeout 30 sh -c 'while [ ! -e ${marker} ]; do sleep 0.1; done'`;
    const ops = detachedOps(sh(script, CODEX_START), root);
    await Effect.runPromise(ops.spawn({ name: 'ae/bad/1', brief: 'x', cwd: root }));
    try {
      await until(
        t,
        () => runFileOr(root, 'ae/bad/1').startRefused !== undefined,
        () => `ae/bad/1 refused its start: its run file is ${JSON.stringify(runFileOr(root, 'ae/bad/1'))}`,
        { everyMs: 100 },
      );
      const working = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
      assert.deepEqual([...working.value.unread], ['ae/bad/1']);
      assert.deepEqual([...(working.value.unreadWhy ?? [])], [['ae/bad/1', working.warnings[0]]], 'why, by its name, as it is warned');
      for (const w of REFUSAL_WORDS) assert.match(working.value.unreadWhy?.get('ae/bad/1') ?? '', w);
    } finally {
      fs.writeFileSync(marker, '');
    }
    await until(
      t,
      () => runFileOr(root, 'ae/bad/1').state !== 'working',
      () => `ae/bad/1 ended: its run file is ${JSON.stringify(runFileOr(root, 'ae/bad/1'))}`,
      { everyMs: 100 },
    );
    const ended = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
    assert.equal(ended.value.seen.get('ae/bad/1')?.state, 'failed');
    assert.deepEqual([...ended.value.unread], []);
    assert.equal(ended.warnings.length, 1, 'the refusal is still warned');
    assert.equal(ended.value.unreadWhy, undefined, 'read as failed, so not unread, and no words of why it is');
  },
);

test(
  'REFUSED: a start whose id is a number, once its process has ended, reads as failed with no id, and its task settles and is forgotten',
  WAITED,
  async (t) => {
    const spec = sh(printed(threadStarted(12345)), CODEX_START);
    const { ops, run } = await ran(t, spec, 'ae/bad/1');
    assert.equal(run.state, 'done', 'the harness itself exited 0');
    const asked = await warned(ops.observeFor!([{ name: 'ae/bad/1' }]));
    assert.deepEqual([...asked.value.unread], []);
    assert.equal(asked.value.seen.get('ae/bad/1')?.state, 'failed');
    assert.equal(asked.value.seen.get('ae/bad/1')?.nativeId, undefined);
    for (const w of REFUSAL_WORDS) assert.match(asked.warnings[0] ?? '', w);
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/bad/1')?.state, 'failed', 'listed, as failed');

    const root = scratch('ae-start-root-');
    const engine = builtEngine(Engine.layer({ root, harnesses: { sh: spec }, defaultHarness: 'sh' }));
    const id = await Effect.runPromise(engine.file({ brief: 'b', cwd: scratch('ae-start-cwd-') }));
    await until(
      t,
      async () => {
        if ((await Effect.runPromise(engine.view(id))).state.settled) return true;
        await Effect.runPromise(engine.tick());
        return false;
      },
      `${id} settled`,
      { everyMs: 50 },
    );
    const { state } = await Effect.runPromise(engine.view(id));
    assert.equal(state.settled, 'failed');
    assert.equal(state.attempts[0]?.nativeId ?? null, null, 'recorded with no session id');
    const forgot = await Effect.runPromise(engine.forget([id], { yes: true }));
    assert.equal(forgot.forgotten, true);
    assert.deepEqual(fs.readdirSync(path.join(root, 'runs', 'sh')), [], 'its run files went with it');
  },
);

test(
  'REFUSED: a Codex start whose thread_id is a number, once ended, reads as failed beside a Codex session read: its output’s refusal is its own',
  WAITED,
  async (t) => {
    const root = scratch('ae-start-');
    const codexLike = (line: string) => sh(printed(line), CODEX_START, { readOutput: codexOutput });
    await ran(t, codexLike(threadStarted(12345)), 'ae/bad/1', root);
    const { ops } = await ran(t, codexLike(threadStarted(THREAD)), 'ae/good/1', root);
    const listed = await warned(ops.observe);
    assert.equal(listed.value.get('ae/bad/1')?.state, 'failed');
    assert.equal(listed.value.get('ae/bad/1')?.nativeId, undefined);
    assert.equal(listed.value.get('ae/good/1')?.nativeId, THREAD);
    for (const w of REFUSAL_WORDS) assert.match(listed.warnings[0] ?? '', w);
    const asked = await Effect.runPromise(ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
    assert.deepEqual([...asked.unread], []);
    assert.equal(asked.seen.get('ae/bad/1')?.state, 'failed');
    assert.equal(asked.seen.get('ae/good/1')?.nativeId, THREAD);
  },
);

test('REFUSED: a start whose id is a string of no id’s shape', WAITED, async (t) => {
  const { run } = await ran(t, sh(printed(threadStarted('../../etc/passwd')), CODEX_START));
  assert.deepEqual(run.startRefused, { line: 1, field: 'thread_id', found: '"../../etc/passwd"' });
  assert.equal(run.nativeId, undefined);
});

test('REFUSED: a start event with no id, on the line it is printed at', WAITED, async (t) => {
  const { ops, run } = await ran(t, sh(printed('not json', JSON.stringify({ type: 'thread.started' })), CODEX_START));
  assert.deepEqual(run.startRefused, { line: 2, field: 'thread_id', found: 'nothing' });
  const { warnings } = await warned(ops.observe);
  assert.match(warnings[0] ?? '', /line\s+2\s+of\s+its\s+stdout[\s\S]*nothing/);
});

test('a stream that never prints its start keeps no id, and is not refused', WAITED, async (t) => {
  const { ops, run } = await ran(t, sh(`echo 'auth failed' >&2; exit 1`, CODEX_START));
  assert.equal(run.state, 'failed');
  assert.equal(run.nativeId, undefined);
  assert.equal(run.startRefused, undefined);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t/1')?.state, 'failed', 'read, as a harness that never started');
});

test('only stdout is read for the start: one printed on stderr gives no id', WAITED, async (t) => {
  const { run } = await ran(t, sh(`printf '%s\\n' '${threadStarted(THREAD)}' >&2`, CODEX_START));
  assert.equal(run.nativeId, undefined);
});

test('a result split across two writes, a character cut in two at the split, still closes the input', WAITED, async (t) => {
  const result = resultLine({ result: 'été' });
  const at = Buffer.from(result).indexOf(Buffer.from('é')) + 1;
  const octal = (b: Buffer) => [...b].map((byte) => `\\${byte.toString(8).padStart(3, '0')}`).join('');
  const script = `read first; printf '%s\\n' '${stream.init}'; printf '${octal(Buffer.from(result).subarray(0, at))}'; sleep 0.3; printf '${octal(Buffer.from(result).subarray(at))}\\n'; cat > /dev/null`;
  const spec = sh(script, CLAUDE_INIT_START, { input: claudeJob.input });
  const { run } = await ran(t, spec);
  assert.equal(run.inputClosed, true, 'stdin was ended at the result, so the job exited');
  assert.equal(run.state, 'done');
  assert.equal(run.nativeId, SESSION);
});

test('each shipped detached harness says how its start event decodes, and none scrapes its output for an id', () => {
  assert.deepEqual(codex.start, { event: { type: 'thread.started' }, id: 'thread_id' });
  assert.deepEqual(claudeJob.start, { event: { type: 'system', subtype: 'init' }, id: 'session_id' });
  assert.deepEqual(claudeDetached.start, { event: { type: 'result' }, id: 'session_id' });
  const read = (file: string) => fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
  for (const file of ['src/harness/detached/detached.ts', 'bin/ae-worker.ts']) {
    const text = read(file);
    assert.match(text, /\bstart\?:\s*/, `${file} carries the start event`);
    assert.doesNotMatch(text, /nativeIdPattern|new RegExp/, `${file} scrapes no id`);
  }
});
