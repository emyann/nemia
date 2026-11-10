/**
 * A Claude Code job's hold at its hooks (`jobHoldOf`, `src/harness/claude/job-hooks.ts`) once it has parked: a call of the main thread
 * that comes after the park is cut — its `PreToolUse` hook answers nothing until the call's signal aborts, as the end interrupts the turn
 * with it unanswered — never let through to run while the session is being ended. A sub-agent's call is never held, parked or not.
 *
 * Over the hooks alone, with the store's sessions' drain and the job's hold file written in a scratch folder: no session and no process
 * runs. Whether a hook has answered is read after the turn of the event loop that would have answered a call let through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { HookInput } from '@anthropic-ai/claude-agent-sdk';
import { scratch } from 'test-kit/scratch';
import { jobHoldOf } from '../src/harness/claude/job-hooks.ts';
import { readJobHold } from '../src/harness/claude/job-hold.ts';
import { putSessionDrain, sessionDrainFile } from '../src/core/engine/drain.ts';

/** A `PreToolUse` input of `tool`, from a sub-agent where `agent` names one, else from the main thread. */
const preToolUse = (tool: string, id: string, agent?: string): HookInput => ({
  session_id: 's1',
  transcript_path: '/dev/null',
  cwd: '/',
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: {},
  tool_use_id: id,
  ...(agent ? { agent_id: agent } : {}),
});

/** Whether `answer` settles within the turn of the event loop a call let through settles in. */
const answeredNow = (answer: Promise<unknown>): Promise<boolean> =>
  Promise.race([answer.then(() => true), new Promise<boolean>((r) => setImmediate(() => r(false)))]);

test('a job parked under the drain cuts a main-thread call that comes after, and lets a sub-agent’s through', async () => {
  const root = scratch('ae-job-hooks-');
  const holdFile = path.join(root, 'hold.json');
  let ends = 0;
  const { hooks, look } = jobHoldOf({ holdFile, drainFile: sessionDrainFile(root), holdMs: 600_000, holdPollMs: 10 }, () => void ends++);
  const pre = hooks.PreToolUse?.[0]?.hooks[0];
  assert.ok(pre, 'the job hooks PreToolUse');

  assert.deepEqual(await pre(preToolUse('Bash', 'c1'), 'c1', { signal: new AbortController().signal }), {}, 'no drain: let through');
  putSessionDrain(root, { graceMs: 0 });
  look();
  assert.equal(ends, 1, 'past the grace with a call in flight, the job parks and ends its session');
  assert.equal(readJobHold(holdFile)?.parked?.calling?.tool, 'Bash');

  const late = new AbortController();
  const answer = pre(preToolUse('Bash', 'c2'), 'c2', { signal: late.signal });
  assert.equal(await answeredNow(answer), false, 'a main-thread call after the park is not let through');
  late.abort();
  assert.deepEqual(await answer, {}, 'answered nothing once its signal aborts');
  assert.equal(readJobHold(holdFile)?.parked?.calling?.tool, 'Bash', 'the hold file still says the call the park cut');

  const sub = pre(preToolUse('Read', 'c3', 'agent-1'), 'c3', { signal: new AbortController().signal });
  assert.equal(await answeredNow(sub), true, 'a sub-agent’s call is never held');
  assert.equal(ends, 1);
});
