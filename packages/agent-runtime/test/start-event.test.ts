/**
 * A detached session's own id, read by the worker from its harness's start event (`HarnessSpec.start`), against the REAL worker
 * with `sh` as the harness.
 *
 * What the tests below rest on:
 * - The worker reads whole lines of the harness's stdout, so a line printed in two writes, a `sleep` between them, reaches it whole;
 *   one printed at once passes these tests just as well, so the sleep can only make a test pass wrongly under load, never fail it.
 * - A start refused is recorded on the run file (`startRefused`), by its line and field; what a look makes of it — the session
 *   unread while its process runs, failed once it has ended — is the decode-unread story's (`test/unread-session.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { codex } from '../src/harness/codex/codex.ts';
import { CODEX_START } from '../src/harness/codex/stream.ts';
import { CLAUDE_INIT_START, CLAUDE_RESULT_START, claudeDetached, claudeJob } from '../src/harness/claude/code.ts';
import { warned } from './warned.ts';
import { WAITED, type Waiter } from '../src/waits/index.ts';
import { resultLine, SESSION, stream } from './reader-streams.ts';
import { printed, ran, sh, THREAD, threadStarted } from './start-runs.ts';

const OTHER = '0eeeeeee-0000-4000-8000-00000000000e';

/** A row of the parsing table: what the worker makes of a stream, in the row's own scratch root. */
type Row = { name: string; holds: (t: Waiter) => Promise<void> | void };

const ROWS: Row[] = [
  {
    name: 'the id of an item that comes before the start is not the thread’s: the thread’s is taken',
    holds: async (t) => {
      const { run } = await ran(
        t,
        sh(
          printed(JSON.stringify({ type: 'item.started', item: { id: 'aaaaaaaaaaaaaaaaaaaa', type: 'x' } }), threadStarted(THREAD)),
          CODEX_START,
        ),
      );
      assert.equal(run.nativeId, THREAD);
    },
  },
  {
    name: 'a second start event, with another id, is not read: the first one’s id is kept',
    holds: async (t) => {
      const { run } = await ran(t, sh(printed(threadStarted(THREAD), threadStarted(OTHER)), CODEX_START));
      assert.equal(run.nativeId, THREAD);
    },
  },
  {
    name: 'a session_id on a hook line before init is not the session’s: init’s is taken',
    holds: async (t) => {
      const hook = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: OTHER });
      const { run } = await ran(t, sh(printed(hook, stream.init), CLAUDE_INIT_START));
      assert.equal(run.nativeId, SESSION);
    },
  },
  {
    name: 'an id split across two writes is read whole',
    holds: async (t) => {
      const [head, tail] = [threadStarted(THREAD).slice(0, 40), threadStarted(THREAD).slice(40)];
      const { run } = await ran(t, sh(`printf '%s' '${head}'; sleep 0.3; printf '%s\\n' '${tail}'`, CODEX_START));
      assert.equal(run.nativeId, THREAD);
    },
  },
  {
    name: 'a start line with no newline after it is read at the end of the stream',
    holds: async (t) => {
      const { run } = await ran(t, sh(`printf '%s' '${resultLine({})}'`, CLAUDE_RESULT_START));
      assert.equal(run.state, 'done');
      assert.equal(run.nativeId, SESSION);
    },
  },
  {
    name: 'REFUSED: a start whose id is a string of no id’s shape, by its line, its field and what it found',
    holds: async (t) => {
      const { run } = await ran(t, sh(printed(threadStarted('../../etc/passwd')), CODEX_START));
      assert.deepEqual(run.startRefused, { line: 1, field: 'thread_id', found: '"../../etc/passwd"' });
      assert.equal(run.nativeId, undefined);
    },
  },
  {
    name: 'REFUSED: a start event with no id, on the line it is printed at, said so on a look',
    holds: async (t) => {
      const { ops, run } = await ran(t, sh(printed('not json', JSON.stringify({ type: 'thread.started' })), CODEX_START));
      assert.deepEqual(run.startRefused, { line: 2, field: 'thread_id', found: 'nothing' });
      const { warnings } = await warned(ops.observe);
      assert.match(warnings[0] ?? '', /line\s+2\s+of\s+its\s+stdout[\s\S]*nothing/);
    },
  },
  {
    name: 'a stream that never prints its start keeps no id, and is not refused',
    holds: async (t) => {
      const { ops, run } = await ran(t, sh(`echo 'auth failed' >&2; exit 1`, CODEX_START));
      assert.equal(run.state, 'failed');
      assert.equal(run.nativeId, undefined);
      assert.equal(run.startRefused, undefined);
      assert.equal((await Effect.runPromise(ops.observe)).get('ae/t/1')?.state, 'failed', 'read, as a harness that never started');
    },
  },
  {
    name: 'only stdout is read for the start: one printed on stderr gives no id',
    holds: async (t) => {
      const { run } = await ran(t, sh(`printf '%s\\n' '${threadStarted(THREAD)}' >&2`, CODEX_START));
      assert.equal(run.nativeId, undefined);
    },
  },
  {
    name: 'a result split across two writes, a character cut in two at the split, still closes the input',
    holds: async (t) => {
      const result = resultLine({ result: 'été' });
      const at = Buffer.from(result).indexOf(Buffer.from('é')) + 1;
      const octal = (b: Buffer) => [...b].map((byte) => `\\${byte.toString(8).padStart(3, '0')}`).join('');
      const script = `read first; printf '%s\\n' '${stream.init}'; printf '${octal(Buffer.from(result).subarray(0, at))}'; sleep 0.3; printf '${octal(Buffer.from(result).subarray(at))}\\n'; cat > /dev/null`;
      const spec = sh(script, CLAUDE_INIT_START, { input: claudeJob.input });
      const { run } = await ran(t, spec);
      assert.equal(run.inputClosed, true, 'stdin was ended at the result, so the job exited');
      assert.equal(run.state, 'done');
      assert.equal(run.nativeId, SESSION);
    },
  },
  {
    name: 'each shipped detached harness says how its start event decodes, and none scrapes its output for an id',
    holds: () => {
      assert.deepEqual(codex.start, { event: { type: 'thread.started' }, id: 'thread_id' });
      assert.deepEqual(claudeJob.start, { event: { type: 'system', subtype: 'init' }, id: 'session_id' });
      assert.deepEqual(claudeDetached.start, { event: { type: 'result' }, id: 'session_id' });
      const read = (file: string) => fs.readFileSync(path.join(import.meta.dirname, '..', file), 'utf8');
      for (const file of ['src/harness/detached/detached.ts', 'bin/ae-worker.ts']) {
        const text = read(file);
        assert.match(text, /\bstart\?:\s*/, `${file} carries the start event`);
        assert.doesNotMatch(text, /nativeIdPattern|new RegExp/, `${file} scrapes no id`);
      }
    },
  },
];

test(
  'the start event: the session id the worker reads off whole stdout lines, the first start alone, and a start refused by its line and field',
  WAITED,
  async (t) => {
    for (const row of ROWS) await t.test(row.name, (c) => row.holds(c));
  },
);
