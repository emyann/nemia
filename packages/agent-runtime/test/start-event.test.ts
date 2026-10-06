/**
 * A detached session's own id, read by the worker from its harness's start event (`HarnessSpec.start`), against the REAL worker
 * with `sh` as the harness.
 *
 * What the tests below rest on:
 * - The worker reads whole lines of the harness's stdout, so a line printed in two writes, a `sleep` between them, reaches it whole;
 *   one printed at once passes these tests just as well, so the sleep can only make a test pass wrongly under load, never fail it.
 * - A start refused leaves its session unread and every other session of the harness read: `observeFor` names it `unread`, and
 *   `observe` leaves it out, saying why as a warning on every look it lasts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Logger } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { detachedOps, type HarnessSpec, type StartEvent } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { CODEX_START } from '../src/harness/codex/stream.ts';
import { CLAUDE_INIT_START, CLAUDE_RESULT_START, claudeDetached, claudeJob } from '../src/harness/claude/code.ts';
import { scratch } from './scratch.ts';
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

/** Spawns `spec`'s run under `name` and waits for its worker to write an end, then gives back its run file. */
const ran = async (spec: HarnessSpec, name = 'ae/t/1', root = scratch('ae-start-')) => {
  const ops = detachedOps(spec, root);
  await Effect.runPromise(ops.spawn({ name, brief: 'x', cwd: root }));
  const until = performance.now() + 15_000;
  while (performance.now() < until) {
    try {
      const run = runFile(root, name);
      if (run.state !== 'working') return { ops, root, run };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`${name} never ended: ${JSON.stringify(runFile(root, name))}`);
};

/** Runs `look`, keeping every line logged as a warning. */
const warned = async <A>(look: Effect.Effect<A, unknown>): Promise<{ value: A; warnings: string[] }> => {
  const warnings: string[] = [];
  const keeper = Logger.make(({ message, logLevel }) => {
    if (logLevel === 'Warn') warnings.push((Array.isArray(message) ? message : [message]).join(' '));
  });
  const value = await Effect.runPromise(look.pipe(Effect.provide(Logger.layer([keeper]))));
  return { value, warnings };
};

const threadStarted = (thread_id: unknown) => JSON.stringify({ type: 'thread.started', thread_id });

test('the id of an item that comes before the start is not the thread’s: the thread’s is taken', async () => {
  const { run } = await ran(
    sh(
      printed(JSON.stringify({ type: 'item.started', item: { id: 'aaaaaaaaaaaaaaaaaaaa', type: 'x' } }), threadStarted(THREAD)),
      CODEX_START,
    ),
  );
  assert.equal(run.nativeId, THREAD);
});

test('a second start event, with another id, is not read: the first one’s id is kept', async () => {
  const { run } = await ran(sh(printed(threadStarted(THREAD), threadStarted(OTHER)), CODEX_START));
  assert.equal(run.nativeId, THREAD);
});

test('a session_id on a hook line before init is not the session’s: init’s is taken', async () => {
  const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: OTHER });
  const { run } = await ran(sh(printed(hook, stream.init), CLAUDE_INIT_START));
  assert.equal(run.nativeId, SESSION);
});

test('an id split across two writes is read whole', async () => {
  const [head, tail] = [threadStarted(THREAD).slice(0, 40), threadStarted(THREAD).slice(40)];
  const { run } = await ran(sh(`printf '%s' '${head}'; sleep 0.3; printf '%s\\n' '${tail}'`, CODEX_START));
  assert.equal(run.nativeId, THREAD);
});

test('a start line with no newline after it is read at the end of the stream', async () => {
  const { run } = await ran(sh(`printf '%s' '${resultLine({})}'`, CLAUDE_RESULT_START));
  assert.equal(run.state, 'done');
  assert.equal(run.nativeId, SESSION);
});

test('REFUSED: a start whose id is a number leaves that session unread, and the next one of the harness read', async () => {
  const root = scratch('ae-start-');
  const refused = await ran(sh(printed(threadStarted(12345)), CODEX_START), 'ae/bad/1', root);
  const good = await ran(sh(printed(threadStarted(THREAD)), CODEX_START), 'ae/good/1', root);
  assert.deepEqual(refused.run.startRefused, { line: 1, field: 'thread_id', found: '12345' });
  assert.equal(refused.run.nativeId, undefined);
  const words = [
    /`ae\/bad\/1`/,
    /line\s+1\s+of\s+its\s+stdout/,
    /`thread\.started`/,
    /`thread_id`/,
    /12345/,
    /hex\s+and\s+dashes/,
    /deadline/,
  ];

  const listed = await warned(good.ops.observe);
  assert.deepEqual([...listed.value.keys()], ['ae/good/1'], 'the refused session is left out, the other read');
  assert.equal(listed.value.get('ae/good/1')?.nativeId, THREAD);
  assert.equal(listed.warnings.length, 1);
  for (const w of words) assert.match(listed.warnings[0], w);

  const asked = await warned(good.ops.observeFor!([{ name: 'ae/bad/1' }, { name: 'ae/good/1' }]));
  assert.deepEqual([...asked.value.unread], ['ae/bad/1'], 'unread, never read as having no id');
  assert.deepEqual([...asked.value.seen.keys()], ['ae/good/1']);
  assert.equal(asked.warnings.length, 1);
  for (const w of words) assert.match(asked.warnings[0], w);
});

test('REFUSED: a start whose id is a string of no id’s shape', async () => {
  const { run } = await ran(sh(printed(threadStarted('../../etc/passwd')), CODEX_START));
  assert.deepEqual(run.startRefused, { line: 1, field: 'thread_id', found: '"../../etc/passwd"' });
  assert.equal(run.nativeId, undefined);
});

test('REFUSED: a start event with no id, on the line it is printed at', async () => {
  const { ops, run } = await ran(sh(printed('not json', JSON.stringify({ type: 'thread.started' })), CODEX_START));
  assert.deepEqual(run.startRefused, { line: 2, field: 'thread_id', found: 'nothing' });
  const { warnings } = await warned(ops.observe);
  assert.match(warnings[0] ?? '', /line\s+2\s+of\s+its\s+stdout[\s\S]*nothing/);
});

test('a stream that never prints its start keeps no id, and is not refused', async () => {
  const { ops, run } = await ran(sh(`echo 'auth failed' >&2; exit 1`, CODEX_START));
  assert.equal(run.state, 'failed');
  assert.equal(run.nativeId, undefined);
  assert.equal(run.startRefused, undefined);
  assert.equal((await Effect.runPromise(ops.observe)).get('ae/t/1')?.state, 'failed', 'read, as a harness that never started');
});

test('only stdout is read for the start: one printed on stderr gives no id', async () => {
  const { run } = await ran(sh(`printf '%s\\n' '${threadStarted(THREAD)}' >&2`, CODEX_START));
  assert.equal(run.nativeId, undefined);
});

test('a result split across two writes, a character cut in two at the split, still closes the input', async () => {
  const result = resultLine({ result: 'été' });
  const at = Buffer.from(result).indexOf(Buffer.from('é')) + 1;
  const octal = (b: Buffer) => [...b].map((byte) => `\\${byte.toString(8).padStart(3, '0')}`).join('');
  const script = `read first; printf '%s\\n' '${stream.init}'; printf '${octal(Buffer.from(result).subarray(0, at))}'; sleep 0.3; printf '${octal(Buffer.from(result).subarray(at))}\\n'; cat > /dev/null`;
  const spec = sh(script, CLAUDE_INIT_START, { input: claudeJob.input });
  const { run } = await ran(spec);
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
