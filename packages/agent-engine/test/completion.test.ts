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
    // The window is measured from the transcript's last write, so that is where the clock starts.
    const ops = claudeOps({ now: () => t, transcriptTime: async () => 0 });

    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'it just spoke');
    t = QUIESCENT_AFTER_MS - 1;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'one millisecond short');
    t = QUIESCENT_AFTER_MS;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'done', 'and now it is finished');
  } finally { restore(); }
});

test('a transcript that moves PUSHES THE DEADLINE OUT — it was between steps, not finished', async () => {
  // This is the case the window exists for: `working` also means "between steps of work it drives
  // on its own". Calling that done would settle a task whose session is still going.
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    let t = 0;
    let written = 0;
    const ops = claudeOps({ now: () => t, transcriptTime: async () => written });

    t = QUIESCENT_AFTER_MS - 1_000;
    written = t;                         // the session wrote something: it is alive
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working');

    t += QUIESCENT_AFTER_MS - 1_000;     // past the ORIGINAL deadline, not the new one
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'deadline moved with it');

    t += 1_000;
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'done', 'quiet again, and now past it');
  } finally { restore(); }
});

test('a cold transcript is NOT silence while the session is busy', async () => {
  // The risk the `busy` gate carries alone, now that the clock is the transcript's: a tool call
  // that runs for minutes writes nothing at all. Measured on a live session — the transcript went
  // 35 seconds untouched mid-step — so this is the guard, not a hypothetical.
  const restore = withFakeClaude(row('working', 'busy'));
  try {
    const ops = claudeOps({ now: () => 100 * QUIESCENT_AFTER_MS, transcriptTime: async () => 0 });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working');
  } finally { restore(); }
});

test('the verdict does not depend on WHO is asking, or for how long', async () => {
  // Two independent runners are what two `wf tick` processes are. An earlier version kept the
  // clock in a closure, so a driver that ticked once per process could never reach a verdict:
  // one long-lived process said `done` where three consecutive one-shot ones said `working`.
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    const at = (t: number) => claudeOps({ now: () => t, transcriptTime: async () => 0 });
    const first = await Effect.runPromise(at(QUIESCENT_AFTER_MS).observe);
    const second = await Effect.runPromise(at(QUIESCENT_AFTER_MS).observe);   // a fresh runner, no history
    assert.equal(first.get('ae/t-1/1')?.state, 'done');
    assert.equal(second.get('ae/t-1/1')?.state, 'done', 'a runner that has never seen this session agrees');
  } finally { restore(); }
});

test('no transcript, no verdict — we do not settle on one idle sample', async () => {
  const restore = withFakeClaude(row('working', 'idle'));
  try {
    const ops = claudeOps({ now: () => 100 * QUIESCENT_AFTER_MS, transcriptTime: async () => undefined });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.state, 'working', 'the deadline handles this one');
  } finally { restore(); }
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
