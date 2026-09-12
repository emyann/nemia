/**
 * What "done" means for Claude Code, tested without Claude Code.
 *
 * The whole point of putting this in the runner is that it becomes a translation with an injected
 * clock and an injected transcript, rather than a judgement buried in `decide` that needs a live
 * harness to exercise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { claudeOps, QUIESCENT_AFTER_MS } from '../src/runner.ts';

/**
 * `observe` shells out, so these tests drive the predicate through a stub of that call. A tiny
 * fake `claude` on PATH is the honest way to exercise the real code path.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const withFakeClaude = (json: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat <<'JSON'\n${json}\nJSON\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  return () => { process.env.PATH = prev; };
};

const row = (state: string, status: string) => JSON.stringify([{
  name: 'ae/t-1/1', sessionId: 's-1', state, status, kind: 'background',
}]);

test('state=done is taken at its word, immediately', async () => {
  const restore = withFakeClaude(row('done', 'idle'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 1 }).observe);
    assert.equal(seen.get('ae/t-1/1')?.state, 'done');
  } finally { restore(); }
});

test('working + busy is running, however long it lasts', async () => {
  const restore = withFakeClaude(row('working', 'busy'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 1 });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working');
    t += 10 * QUIESCENT_AFTER_MS;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'busy is never quiescent');
  } finally { restore(); }
});

test('working + idle becomes done only after the window, not before', async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 500 });

    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'first sighting starts the clock');
    t += QUIESCENT_AFTER_MS - 1;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'one millisecond short');
    t += 1;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'done', 'and now it is finished');
  } finally { restore(); }
});

test('a transcript that moves RESTARTS the clock — it was between steps, not finished', async () => {
  // This is the case the window exists for: `working` also means "between steps of work it drives
  // on its own". Calling that done would settle a task whose session is still going.
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    let t = 0;
    let written = 500;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => written });

    await Effect.runPromise(ops.observe);
    t += QUIESCENT_AFTER_MS - 1_000;
    written = 999;                       // the session wrote something: it is alive
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working');

    t += QUIESCENT_AFTER_MS - 1_000;     // would have been past the original deadline
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'clock restarted');

    t += 1_000;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'done', 'quiet again, and now past it');
  } finally { restore(); }
});

test('going busy again clears the clock entirely', async () => {
  let json = row('working', 'idle');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
  const write = () => fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\ncat <<'JSON'\n${json}\nJSON\n`, { mode: 0o755 });
  write();
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 500 });
    await Effect.runPromise(ops.observe);
    t += QUIESCENT_AFTER_MS - 1_000;

    json = row('working', 'busy'); write();          // it woke up
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working');

    json = row('working', 'idle'); write();          // and went quiet again
    t += 2_000;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'the clock starts over');
  } finally { process.env.PATH = prev; }
});

test('blocked is never quiescent — a session waiting on a person is not finished', async () => {
  const restore = withFakeClaude(row('blocked', 'idle'));
  try {
    let t = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 500 });
    await Effect.runPromise(ops.observe);
    t += 10 * QUIESCENT_AFTER_MS;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'blocked');
  } finally { restore(); }
});
