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
import { claudeOps, lastStructuredOutput, QUIESCENT_AFTER_MS } from '../src/runner.ts';

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

// ─── the closing statement ──────────────────────────────────────────────────

const entry = (o: object) => JSON.stringify(o);
const structured = (timestamp: string, input: object) => entry({
  type: 'assistant', timestamp,
  message: { content: [{ type: 'tool_use', name: 'StructuredOutput', input }] },
});

test('the LAST StructuredOutput call is the statement, stamped with when it was made', () => {
  // A resumed transcript holds the parent's calls too, so the time matters as much as the payload.
  const jsonl = [
    entry({ type: 'system', tools: [{ name: 'StructuredOutput' }] }), // the definition names it too
    structured('2026-09-12T08:00:00.000Z', { outcome: 'done', by: 'parent' }),
    entry({ type: 'user', timestamp: '2026-09-12T09:00:00.000Z', message: { content: 'carry on' } }),
    structured('2026-09-12T09:30:00.000Z', { outcome: 'blocked' }),
    '{half a line mentioning StructuredOutput',
  ].join('\n');
  assert.deepEqual(lastStructuredOutput(jsonl), { payload: { outcome: 'blocked' }, at: Date.parse('2026-09-12T09:30:00.000Z') });
  assert.equal(lastStructuredOutput(entry({ type: 'user', message: { content: 'say StructuredOutput' } })), undefined);
});

test('an idle session reports what it said; a busy one is not even asked', async () => {
  const said = { payload: { outcome: 'done' }, at: 5 };
  let asked = 0;
  const closeoutFrom = async () => { asked++; return said; };

  let restore = withFakeClaude(row('working', 'busy'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom }).observe);
    assert.equal(seen.get('ae/t-1/1')?.closeout, undefined);
    assert.equal(asked, 0, 'mid-turn, nothing it has said is final');
  } finally { restore(); }

  restore = withFakeClaude(row('working', 'idle'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom }).observe);
    assert.deepEqual(seen.get('ae/t-1/1')?.closeout, said);
    assert.equal(seen.get('ae/t-1/1')?.state, 'working', 'reported, not acted on — whose it is, the engine decides');
  } finally { restore(); }
});

test('a blocked, idle session reports what it said too — and stays blocked, for the engine to judge', async () => {
  // A session that gave its closeout and ended its turn has been seen `blocked`/idle. The engine
  // ends that attempt only if the runner still hands it the statement.
  const said = { payload: { outcome: 'done' }, at: 5 };
  const restore = withFakeClaude(row('blocked', 'idle'));
  try {
    const seen = await Effect.runPromise(claudeOps({ now: () => 0, transcriptTime: async () => 0, closeoutFrom: async () => said }).observe);
    assert.deepEqual(seen.get('ae/t-1/1')?.closeout, said);
    assert.equal(seen.get('ae/t-1/1')?.state, 'blocked');
  } finally { restore(); }
});

test('a finished session is read once while its transcript is unchanged — again once it is written, and again for another attempt', async () => {
  let asked = 0;
  let written = 0;
  const ops = claudeOps({ transcriptTime: async () => written, closeoutFrom: async () => { asked++; return { payload: 1, at: 1 }; } });
  let restore = withFakeClaude(row('done', 'idle'));
  try {
    await Effect.runPromise(ops.observe);
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 1, 'its transcript is older than the read');
    written = Date.now();
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 2, 'written since the read: read again');
  } finally { restore(); }

  // `--resume` keeps the id: the same session under a new attempt's name is not the attempt that was read,
  // however old its transcript.
  written = 0;
  restore = withFakeClaude(JSON.stringify([{ name: 'ae/t-2/1', sessionId: 's-1', state: 'done', status: 'idle', kind: 'background' }]));
  try {
    await Effect.runPromise(ops.observe);
    assert.equal(asked, 3);
  } finally { restore(); }
});

test('Claude Code is handed the schema as --json-schema, and the prompt still comes last', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const schema = { type: 'object', properties: { outcome: { type: 'string' } } };
    await Effect.runPromise(claudeOps().spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir, closeoutSchema: schema }));
    const args = fs.readFileSync(argsFile, 'utf8').trim().split('\n');
    const i = args.indexOf('--json-schema');
    assert.notEqual(i, -1);
    assert.deepEqual(JSON.parse(args[i + 1]!), schema);
    assert.equal(args.at(-1), 'the prompt');
  } finally { process.env.PATH = prev; }
});

// ─── the fence and the effort ───────────────────────────────────────────────

import type { SpawnRequest } from '../src/runner.ts';

/** The argv `claudeOps().spawn` hands to `claude`, recorded by a fake one on PATH. */
const argvOf = async (r: Partial<SpawnRequest>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
  const argsFile = path.join(dir, 'args');
  fs.writeFileSync(path.join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    await Effect.runPromise(claudeOps().spawn({ name: 'ae/t/1', brief: 'the prompt', cwd: dir, ...r }));
    return fs.readFileSync(argsFile, 'utf8').replace(/\n$/, '').split('\n');
  } finally { process.env.PATH = prev; }
};

test('at shipped defaults Claude Code is given neither --tools nor --effort', async () => {
  const args = await argvOf({});
  assert.equal(args.includes('--tools'), false, 'no list: every tool the harness has');
  assert.equal(args.includes('--effort'), false, "no effort: the harness's own");
});

test('tools reach Claude Code as --tools, and a flag ends the list before the prompt', async () => {
  // `--tools <tools...>` is variadic. Directly before the prompt it would take the prompt as a tool
  // name — the `--worktree` trap again — so it goes before `--permission-mode`, which always follows.
  const args = await argvOf({ tools: ['Read', 'Grep', 'Glob'] });
  const i = args.indexOf('--tools');
  assert.notEqual(i, -1);
  assert.equal(args[i + 1], 'Read,Grep,Glob');
  assert.equal(args[i + 2], '--permission-mode');
  assert.equal(args.at(-1), 'the prompt');
});

test('an empty tool list reaches Claude Code as no tools at all, not as every tool', async () => {
  const args = await argvOf({ tools: [] });
  assert.equal(args[args.indexOf('--tools') + 1], '');
});

test('effort reaches Claude Code as --effort', async () => {
  const args = await argvOf({ effort: 'high' });
  assert.equal(args[args.indexOf('--effort') + 1], 'high');
  assert.equal(args.at(-1), 'the prompt');
});

// ─── what a session consumed ────────────────────────────────────────────────

const rowStarted = (state: string, status: string, startedAt?: number) => JSON.stringify([{
  name: 'ae/t-1/1', sessionId: 's-1', state, status, kind: 'background', ...(startedAt !== undefined ? { startedAt } : {}),
}]);

test("usage is measured from the session's own start, as the registry records it", async () => {
  const restore = withFakeClaude(rowStarted('done', 'idle', 1_789_000_000_000));
  try {
    let since: number | undefined;
    const ops = claudeOps({
      transcriptTime: async () => 0, closeoutFrom: async () => undefined,
      usageFrom: async (_id, from) => { since = from; return { turns: 2, toolCalls: 1 }; },
    });
    const seen = (await Effect.runPromise(ops.observe)).get('ae/t-1/1');
    assert.equal(since, 1_789_000_000_000);
    assert.deepEqual(seen?.usage, { turns: 2, toolCalls: 1 });
  } finally { restore(); }
});

test('no start in the registry, no usage — an inherited conversation could not be told apart', async () => {
  const restore = withFakeClaude(rowStarted('done', 'idle'));
  try {
    let asked = 0;
    const ops = claudeOps({
      transcriptTime: async () => 0, closeoutFrom: async () => undefined,
      usageFrom: async () => { asked++; return { turns: 9, toolCalls: 9 }; },
    });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.usage, undefined);
    assert.equal(asked, 0, 'not even asked');
  } finally { restore(); }
});

test('a busy session is not read for usage — nothing it has consumed is final', async () => {
  const restore = withFakeClaude(rowStarted('working', 'busy', 1));
  try {
    let asked = 0;
    const ops = claudeOps({ transcriptTime: async () => 0, usageFrom: async () => { asked++; return { turns: 1, toolCalls: 0 }; } });
    assert.equal((await Effect.runPromise(ops.observe)).get('ae/t-1/1')?.usage, undefined);
    assert.equal(asked, 0);
  } finally { restore(); }
});

// ─── a spawn that fails: did anything start? ────────────────────────────────

test('claude that could not even be launched says nothing started; one that ran and failed does not', async () => {
  const caught = (cwd: string) => Effect.runPromise(claudeOps().spawn({ name: 'ae/t/1', brief: 'b', cwd }).pipe(
    Effect.as(undefined),
    Effect.catchTag('RunnerError', (e) => Effect.succeed(e)),
  ));
  const missing = await caught(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ae-nocwd-')), 'gone'));
  assert.equal(missing?.refused, true, 'the OS refused the process: no session can exist');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'));
  fs.writeFileSync(path.join(dir, 'claude'), '#!/bin/sh\necho "something went wrong" >&2\nexit 1\n', { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${dir}:${prev}`;
  try {
    const ran = await caught(dir);
    assert.ok(ran, 'it failed');
    assert.notEqual(ran?.refused, true, 'claude ran and exited 1: whether it registered a session is not known');
  } finally { process.env.PATH = prev; }
});
