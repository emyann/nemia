/**
 * Usage: measured, or absent — never a zero standing in for "nobody counted".
 *
 * The transcript arithmetic is pure, so it is tested here without a harness: the traps are the
 * ones measured on real transcripts — a response written as several lines, and a resumed session
 * carrying its parent's whole conversation under its own id.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptUsage } from '../src/runner.ts';
import { attemptLine, usageLine } from '../src/cli.ts';
import { fold, type Event } from '../src/domain.ts';

const line = (o: object) => JSON.stringify(o);
const TOKENS = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 };
/** `null` for a response written without usage — `undefined` would take the default. */
const response = (at: string, id: string, content: object[], usage: object | null = TOKENS) =>
  line({ type: 'assistant', timestamp: at, message: { id, content, ...(usage ? { usage } : {}) } });

test('a response written as several lines is one turn, with its tokens counted once', () => {
  const jsonl = [
    response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'text', text: 'looking' }]),
    response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read' }]),
    line({ type: 'user', timestamp: '2026-09-12T09:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] } }),
    response('2026-09-12T09:00:03Z', 'msg_2', [{ type: 'tool_use', id: 'tu_2', name: 'Edit' }, { type: 'tool_use', id: 'tu_3', name: 'Bash' }]),
    '{half a line mentioning "assistant"',
  ].join('\n');
  assert.deepEqual(
    transcriptUsage(jsonl, Date.parse('2026-09-12T09:00:00Z')),
    { turns: 2, toolCalls: 3, inputTokens: 2220, outputTokens: 10 },
  );
});

test("a resumed session's inherited conversation is not counted as its own", () => {
  // The parent's entries keep the parent's timestamps (measured on two resumed sessions); the
  // registry's start for the child is what tells them apart.
  const jsonl = [
    response('2026-09-13T03:55:08Z', 'msg_parent', [{ type: 'tool_use', id: 'tu_p', name: 'Write' }]),
    response('2026-09-13T04:06:20Z', 'msg_child', [{ type: 'text', text: 'carrying on' }]),
  ].join('\n');
  assert.deepEqual(
    transcriptUsage(jsonl, Date.parse('2026-09-13T04:06:15Z')),
    { turns: 1, toolCalls: 0, inputTokens: 1110, outputTokens: 5 },
  );
});

test('tokens are absent, not 0, when a counted response did not carry them — and a transcript has no cost', () => {
  const jsonl = [
    response('2026-09-12T09:00:01Z', 'msg_1', [], null),
    response('2026-09-12T09:00:02Z', 'msg_2', []),
  ].join('\n');
  const u = transcriptUsage(jsonl, 0);
  assert.equal(u.turns, 2);
  assert.equal('inputTokens' in u, false);
  assert.equal('outputTokens' in u, false);
  assert.equal('costUsd' in u, false);
});

test('an attempt its runner measured nothing about records null, and a person reads "not measured"', () => {
  const events: Event[] = [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
    { kind: 'spawned', at: '2026-09-12T09:00:02Z', attempt: 1 },
    { kind: 'ended', at: '2026-09-12T09:05:00Z', attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' },
  ];
  const [a] = fold('t', events).attempts;
  assert.equal(a!.usage, null);
  assert.equal(a!.exitCode, null);
  assert.equal(attemptLine(a!), 'attempt 1  done  09:00:01 → 09:05:00 (4m 59s)  usage not measured');
});

test('a measured attempt prints what was measured, and names what was not', () => {
  assert.equal(
    usageLine({ turns: 12, toolCalls: 31, inputTokens: 1_234_567, outputTokens: 20_400 }),
    '12 turns · 31 tool calls · 1.2M in · 20.4k out · cost not measured',
  );
  assert.equal(usageLine({ turns: 4, toolCalls: 2, costUsd: 0.1054 }), '4 turns · 2 tool calls · tokens not measured · $0.105');
  const [a] = fold('t', [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
    { kind: 'ended', at: '2026-09-12T09:05:00Z', attempt: 1, sessionId: 's', observed: 'failed', reason: 'harness', exitCode: 3, usage: { turns: 1, toolCalls: 0 } },
  ]).attempts;
  assert.equal(attemptLine(a!), 'attempt 1  failed  09:00:01 → 09:05:00 (4m 59s)  exit 3  1 turns · 0 tool calls · tokens not measured · cost not measured');
});

// ─── when it ran, for a person ──────────────────────────────────────────────

/** Attempt 1 as fold reads it: started at `startedAt`, and ended `done` at `endedAt` when there is one. */
const ranAt = (startedAt: string, endedAt?: string) => {
  const ended: Event[] = endedAt ? [{ kind: 'ended', at: endedAt, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' }] : [];
  return fold('t', [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: startedAt, attempt: 1 },
    ...ended,
  ]).attempts[0]!;
};

test('ae show says when each attempt ran: its start, its end, and how long that took', () => {
  const shown = (startedAt: string, endedAt: string) => attemptLine(ranAt(startedAt, endedAt));
  assert.equal(shown('2026-09-12T09:00:01Z', '2026-09-12T09:00:43Z'), 'attempt 1  done  09:00:01 → 09:00:43 (42s)  usage not measured');
  assert.equal(shown('2026-09-12T09:00:01.250Z', '2026-09-12T10:02:30.000Z'), 'attempt 1  done  09:00:01 → 10:02:30 (1h 02m)  usage not measured');
  // The length is taken from the timestamps, not from the clock text: past midnight it is still 45 seconds.
  assert.equal(shown('2026-09-12T23:59:30Z', '2026-09-13T00:00:15Z'), 'attempt 1  done  23:59:30 → 00:00:15 (45s)  usage not measured');
});

test('an attempt still running has no end to print, so ae show says since when', () => {
  assert.equal(attemptLine(ranAt('2026-09-12T09:00:01Z')), 'attempt 1  running since 09:00:01');
});
