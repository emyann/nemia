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
import { codexOutput } from '../src/runner-detached.ts';
import { attemptLine, taskLine, usageLine, usd } from '../src/cli.ts';
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

// ─── cost: Claude Code's cost-state lines ───────────────────────────────────

/**
 * A `cost-state` line as Claude Code writes it (2.1.272, `modelUsage` trimmed): no time of its own, the session's
 * totals, and when its count began. Written twice as the session's process exits, and never per turn.
 */
const costState = (totalCostUSD: number, totalAPIDuration: number, totalToolDuration: number, startTime: number, hasUnknownModelCost = false) =>
  line({ type: 'cost-state', sessionId: 's-1', totalCostUSD, totalAPIDuration, totalToolDuration, totalDuration: 1, startTime, hasUnknownModelCost });
const agentName = (name: string) => line({ type: 'agent-name', agentName: name, sessionId: 's-1' });
const prompt = (at: string) => line({ type: 'user', timestamp: at, message: { content: 'the prompt' } });

test("a transcript's cost is the cost-state its session wrote as its process exited, with the harness's own API and tool time", () => {
  const since = Date.parse('2026-09-12T09:00:00Z');
  const jsonl = [
    agentName('ae/t/1'),
    prompt('2026-09-12T09:00:00.500Z'),
    response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read' }]),
    costState(0.1925, 44777, 217, since - 300),
    costState(0.1925, 44777, 217, since - 300),
  ].join('\n');
  assert.deepEqual(transcriptUsage(jsonl, since), { turns: 1, toolCalls: 1, inputTokens: 1110, outputTokens: 5, costUsd: 0.1925, apiMs: 44777, toolMs: 217 });
});

test('no cost-state written since the attempt began is no cost — not 0, and not the cost of the session it continues', () => {
  const since = Date.parse('2026-09-13T04:06:15Z');
  const running = [
    response('2026-09-13T03:55:08Z', 'msg_parent', []),
    costState(28.3161, 2655415, 312510, Date.parse('2026-09-13T03:00:00Z')),
    prompt('2026-09-13T04:06:16Z'),
    response('2026-09-13T04:06:20Z', 'msg_child', []),
  ].join('\n');
  const u = transcriptUsage(running, since);
  assert.equal(u.turns, 1);
  for (const key of ['costUsd', 'apiMs', 'toolMs', 'unpricedModel']) assert.equal(key in u, false, `${key}: its process has not exited, and the parent's total is not its own`);
});

test("a resumed session's cost is its own: the total it exited with, less the total its session had when it began", () => {
  // As one real session continued twice was written (2.1.272): each process's pair at its exit, then the next process's
  // name, all under the first process's startTime — the count carried on.
  const first = Date.parse('2026-09-15T00:04:43.817Z');
  const second = Date.parse('2026-09-15T01:12:01Z');
  const jsonl = [
    agentName('ae/impl/1'),
    prompt('2026-09-15T00:04:44Z'),
    response('2026-09-15T00:10:00Z', 'msg_1', []),
    costState(28.3161, 2655415, 312510, first),
    costState(28.3161, 2655415, 312510, first),
    agentName('ae/impl-try2/1'),
    prompt('2026-09-15T01:12:05Z'),
    response('2026-09-15T01:20:00Z', 'msg_2', []),
    costState(43.0383, 3335346, 341815, first),
    costState(43.0383, 3335346, 341815, first),
    agentName('ae/impl-try3/1'),
    prompt('2026-09-15T02:47:57Z'),
    response('2026-09-15T02:50:00Z', 'msg_3', []),
    costState(47.2087, 3771263, 356266, first),
  ].join('\n');
  const own = transcriptUsage(jsonl, second);
  assert.deepEqual(own, { turns: 1, toolCalls: 0, inputTokens: 1110, outputTokens: 5, costUsd: 14.7222, apiMs: 679931, toolMs: 29305 },
    'the second process: its total less the first, and its tokens only — not the third, which continued it under another name');
  assert.equal(transcriptUsage(jsonl, first).costUsd, 28.3161, "the first, read again while its session is still listed: its own, not what the later ones spent");
  assert.equal(transcriptUsage(jsonl, Date.parse('2026-09-15T02:47:53Z')).costUsd, 4.1704, 'the third');
});

test('a count carried on from a total the transcript does not show is no cost', () => {
  const since = Date.parse('2026-09-15T01:12:01Z');
  const jsonl = [prompt('2026-09-15T01:12:05Z'), costState(43.0383, 3335346, 341815, Date.parse('2026-09-15T00:04:43Z'))].join('\n');
  assert.deepEqual(transcriptUsage(jsonl, since), { turns: 0, toolCalls: 0, inputTokens: 0, outputTokens: 0 }, 'its count began an hour before it did, and nothing says at what');

  const otherCount = [
    costState(5, 1000, 100, Date.parse('2026-09-14T22:00:00Z')),
    prompt('2026-09-15T01:12:05Z'),
    costState(43.0383, 3335346, 341815, Date.parse('2026-09-15T00:04:43Z')),
  ].join('\n');
  assert.equal('costUsd' in transcriptUsage(otherCount, since), false, 'a line before it from a count that began at another time is not what this one carried on from');
});

test('a session that used a model its harness could not price has no cost — a total too low reads as the whole — and says why', () => {
  const since = Date.parse('2026-09-12T09:00:00Z');
  const jsonl = [prompt('2026-09-12T09:00:01Z'), costState(0.05, 900, 10, since, true)].join('\n');
  const u = transcriptUsage(jsonl, since);
  assert.equal('costUsd' in u, false);
  assert.equal(u.unpricedModel, true);
  assert.equal(u.apiMs, 900, 'the time it waited is still a measurement');

  const priced = transcriptUsage([prompt('2026-09-12T09:00:01Z'), costState(0.05, 900, 10, since)].join('\n'), since);
  assert.equal(priced.costUsd, 0.05);
  assert.equal('unpricedModel' in priced, false);
});

test("fold carries a cost onto the attempt — on its end, or measured after it — and a journal written before cost was measured folds as it did", () => {
  const at = '2026-09-12T09:05:00Z';
  const begun: Event[] = [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
  ];
  const counted = { turns: 3, toolCalls: 5, inputTokens: 10, outputTokens: 2 };
  const legacy = fold('t', [...begun, { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: counted }]);
  assert.deepEqual(legacy.attempts[0]!.usage, counted, 'as recorded: no cost, and nothing standing in for one');

  const printed = fold('t', [...begun, { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: { costUsd: 0.018, apiMs: 718 } }]);
  assert.deepEqual(printed.attempts[0]!.usage, { costUsd: 0.018, apiMs: 718 }, 'on its end, as claude -p printed it');

  const measured = fold('t', [
    ...begun,
    { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: counted },
    { kind: 'measured', at, attempt: 1, usage: { ...counted, costUsd: 0.42, apiMs: 900, toolMs: 30 } },
    { kind: 'measured', at, attempt: 2, usage: { costUsd: 9 } },
  ]);
  assert.deepEqual(measured.attempts[0]!.usage, { ...counted, costUsd: 0.42, apiMs: 900, toolMs: 30 }, 'measured once its session exited');
  assert.equal(measured.attempts.length, 1, 'and one for an attempt that never started changes nothing');

  const unmeasuredEnd = fold('t', [...begun, { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' }, { kind: 'measured', at, attempt: 1, usage: { costUsd: 1 } }]);
  assert.deepEqual(unmeasuredEnd.attempts[0]!.usage, { costUsd: 1 });
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
  assert.equal(usageLine({ turns: 4, toolCalls: 2, costUsd: 0.1054 }), '4 turns · 2 tool calls · tokens not measured · $0.11');
  const [a] = fold('t', [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r', maxAttempts: 1 },
    { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
    { kind: 'ended', at: '2026-09-12T09:05:00Z', attempt: 1, sessionId: 's', observed: 'failed', reason: 'harness', exitCode: 3, usage: { turns: 1, toolCalls: 0 } },
  ]).attempts;
  assert.equal(attemptLine(a!), 'attempt 1  failed  09:00:01 → 09:05:00 (4m 59s)  exit 3  1 turns · 0 tool calls · tokens not measured · cost not measured');
});

test('ae show and ae ls print what an attempt cost to the cent — never $0.00 for a cost under one — or that nobody measured it, and why', () => {
  assert.equal(usd(3.0054), '$3.01');
  assert.equal(usd(0.0042), '<$0.01', 'a resumed claude -p that spent less than a cent did not spend nothing');
  assert.equal(usd(0), '$0.00');
  assert.equal(usageLine({ turns: 1, toolCalls: 0, apiMs: 900, unpricedModel: true }), '1 turns · 0 tool calls · tokens not measured · cost not measured (a model without a price)');

  const base: Event[] = [
    { kind: 'filed', at: '2026-09-15T09:00:00Z', brief: 'read the notes\nforty times', cwd: '/r', maxAttempts: 1, harness: 'claude-detached', budgetUsd: 0.01 },
    { kind: 'starting', at: '2026-09-15T09:00:01Z', attempt: 1 },
  ];
  const spent = fold('t-1', [...base, { kind: 'ended', at: '2026-09-15T09:00:04Z', attempt: 1, sessionId: 's', observed: 'failed', reason: 'budget', exitCode: 1, usage: { costUsd: 0.01804, apiMs: 718 } }]);
  assert.equal(attemptLine(spent.attempts[0]!), 'attempt 1  failed (budget)  09:00:01 → 09:00:04 (3s)  exit 1  turns not measured · tool calls not measured · tokens not measured · $0.02');

  const shown = (state: ReturnType<typeof fold>, usage?: object) => taskLine({ id: 't-1', state, phase: state.settled ?? 'running (working)', sessionId: null, ...(usage ? { usage } : {}) });
  assert.match(shown(spent), /  1\/1  \$0\.02  read the notes$/);
  const measured = fold('t-1', [...base, { kind: 'ended', at: '2026-09-15T09:05:00Z', attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: { turns: 12 } }, { kind: 'measured', at: '2026-09-15T09:05:01Z', attempt: 1, usage: { turns: 12, costUsd: 3.0054 } }]);
  assert.match(shown(measured), /  1\/1  \$3\.01 · 12t  read the notes$/, 'measured once its session was let go');
  assert.match(shown(fold('t-1', base), { turns: 3 }), /  1\/1  cost not measured · 3t  read the notes$/, 'running: no cost written yet');
  assert.match(shown(fold('t-1', base.slice(0, 1))), /  0\/1  read the notes$/, 'no attempt, nothing to cost');
});

test('ae ls shows a task\'s priority when it was filed with one, and nothing when it was not', () => {
  const filed = (priority?: number): Event => ({ kind: 'filed', at: '2026-09-16T09:00:00Z', brief: 'review it', cwd: '/r', maxAttempts: 1, ...(priority !== undefined ? { priority } : {}) });
  const shown = (priority?: number) => taskLine({ id: 't-1', state: fold('t-1', [filed(priority)]), phase: 'pending', sessionId: null });
  assert.match(shown(3), /  0\/1  priority 3  review it$/);
  assert.match(shown(-1), /  0\/1  priority -1  review it$/);
  assert.match(shown(0), /  0\/1  priority 0  review it$/, 'set, though 0 is what none means');
  assert.match(shown(), /  0\/1  review it$/, 'not set, not shown');
});

test('a count its runner could not see is named as not measured — a Codex attempt has tokens and no turns', () => {
  assert.equal(
    usageLine({ toolCalls: 12, inputTokens: 373_710, outputTokens: 1_082 }),
    'turns not measured · 12 tool calls · 373.7k in · 1.1k out · cost not measured',
  );
  assert.equal(usageLine({ inputTokens: 10, outputTokens: 5 }), 'turns not measured · tool calls not measured · 10 in · 5 out · cost not measured');
});

// ─── Codex: its exec --json stream ──────────────────────────────────────────

/** A stream as `codex exec --json` writes it (0.154.0, shapes from a real run's log, text shortened). */
const codexStream = (...events: object[]) => ['Reading additional input from stdin...', ...events.map((e) => JSON.stringify(e))].join('\n');
const THREAD = { type: 'thread.started', thread_id: '01a09996-d343-7932-8971-b2f209ba315b' };
const TURN = { type: 'turn.started' };
const item = (phase: 'started' | 'completed', id: string, type: string, rest: object = {}) => ({ type: `item.${phase}`, item: { id, type, ...rest } });
const USED = { input_tokens: 373710, cached_input_tokens: 313856, cache_write_input_tokens: 0, output_tokens: 1082, reasoning_output_tokens: 108 };
const completed = (usage: object = USED) => ({ type: 'turn.completed', usage });

test("a Codex run's usage is read from its stream: tokens from turn.completed, tool calls by item, and no turns", () => {
  const read = codexOutput(codexStream(
    THREAD, TURN,
    item('completed', 'item_0', 'agent_message', { text: 'reading the diff' }),
    item('started', 'item_1', 'command_execution', { command: "/bin/bash -lc 'git diff'", status: 'in_progress' }),
    item('completed', 'item_1', 'command_execution', { exit_code: 0, status: 'completed' }),
    item('completed', 'item_2', 'file_change', { status: 'completed' }),
    completed(),
  ));
  // Cached tokens are part of input_tokens and reasoning part of output_tokens: neither is added.
  assert.deepEqual(read.usage, { toolCalls: 2, inputTokens: 373710, outputTokens: 1082 });
  assert.equal('turns' in read.usage!, false, "Codex's turns are prompts, not model responses");
  assert.equal('costUsd' in read.usage!, false);
});

test('a Codex stream that cannot say is not made to: a turn cut short gives no tokens, an unknown item no tool-call count', () => {
  assert.deepEqual(codexOutput(codexStream(THREAD, TURN, item('started', 'item_1', 'command_execution'))).usage, { toolCalls: 1 }, 'killed mid-turn: the calls seen, no tokens');
  assert.deepEqual(codexOutput(codexStream(TURN, completed(), TURN)).usage, { toolCalls: 0 }, 'the first turn of two is not the whole');
  assert.deepEqual(codexOutput(codexStream(TURN, completed({ output_tokens: 5 }))).usage, { toolCalls: 0 }, 'a turn.completed without both counts');
  assert.deepEqual(codexOutput(codexStream(TURN, item('completed', 'item_1', 'mcp_tool_call'), completed())).usage, { inputTokens: 373710, outputTokens: 1082 }, 'a type never seen is not guessed at');
  assert.deepEqual(codexOutput(codexStream(TURN, completed({ ...USED, cache_write_input_tokens: 5 }))).usage, { toolCalls: 0, outputTokens: 1082 }, 'whether input_tokens counts cache writes is unknown');
  assert.deepEqual(codexOutput(codexStream(TURN, completed(), TURN, completed({ ...USED, input_tokens: 1, output_tokens: 2 }))).usage, { toolCalls: 0, inputTokens: 373711, outputTokens: 1084 }, 'turns that all completed are summed');
});

test('a Codex stream with no turn in it measured nothing, and reports no usage at all', () => {
  assert.deepEqual(codexOutput(''), {});
  assert.deepEqual(codexOutput('Reading additional input from stdin...\nError: not logged in'), {});
  assert.deepEqual(codexOutput(codexStream(THREAD)), {});
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
