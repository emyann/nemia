/**
 * Usage: measured, or absent — never a zero standing in for "nobody counted".
 *
 * The transcript arithmetic is pure, so it is tested here without a harness: the traps are two things
 * Claude Code writes — a response written as several lines, and a resumed session carrying its parent's
 * whole conversation, under the parent's times, in its own transcript.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptUsage } from '../src/harness/claude/transcript.ts';
import { codexOutput } from '../src/harness/codex/stream.ts';
import { attemptLine, entryLine, limitLines, taskLine, usageLine, usd } from '../src/cli/lines.ts';
import { fold, type Event } from '../src/core/domain.ts';
import { codexStream, completed, item, THREAD, TURN, USED } from './reader-streams.ts';
import { story } from './checkpoints.ts';

const line = (o: object) => JSON.stringify(o);
const TOKENS = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 };
/** `null` for a response written without usage — `undefined` would take the default. */
const response = (at: string, id: string, content: object[], usage: object | null = TOKENS) =>
  line({ type: 'assistant', timestamp: at, message: { id, content, ...(usage ? { usage } : {}) } });

/**
 * A `cost-state` line as Claude Code writes it, its `modelUsage` left out: no time of its own, the session's totals,
 * and when its count began. Claude Code writes it twice as the session's process exits, and never per turn. A session
 * continued by another process carries its count on: each process writes its pair at its exit, then the next process's
 * name, all under the first process's `startTime`.
 */
const costState = (
  totalCostUSD: number,
  totalAPIDuration: number,
  totalToolDuration: number,
  startTime: number,
  hasUnknownModelCost = false,
) =>
  line({
    type: 'cost-state',
    sessionId: 's-1',
    totalCostUSD,
    totalAPIDuration,
    totalToolDuration,
    totalDuration: 1,
    startTime,
    hasUnknownModelCost,
  });
const agentName = (name: string) => line({ type: 'agent-name', agentName: name, sessionId: 's-1' });
const prompt = (at: string) => line({ type: 'user', timestamp: at, message: { content: 'the prompt' } });

/** A `cost-state` with its `modelUsage`, as Claude Code writes one: per model, uncached input, cache reads and writes, output. */
const costStateWith = (totalCostUSD: number, startTime: number, models: Record<string, [number, number, number, number]>) =>
  line({
    type: 'cost-state',
    sessionId: 's-1',
    totalCostUSD,
    totalAPIDuration: 1000,
    totalToolDuration: 10,
    totalDuration: 1,
    startTime,
    hasUnknownModelCost: false,
    modelUsage: Object.fromEntries(
      Object.entries(models).map(([model, [inputTokens, cacheReadInputTokens, cacheCreationInputTokens, outputTokens]]) => [
        model,
        { inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, costUSD: 0 },
      ]),
    ),
  });
/** The boundary Claude Code writes where it compacted a conversation, trimmed. The summary's call writes no response. */
const boundary = (at: string) =>
  line({
    type: 'system',
    subtype: 'compact_boundary',
    timestamp: at,
    content: 'Conversation compacted',
    compactMetadata: { trigger: 'auto', preTokens: 83770, postTokens: 17465 },
  });

/** Attempt 1 as fold reads it: started at `startedAt`, and ended `done` at `endedAt` when there is one. */
const ranAt = (startedAt: string, endedAt?: string) => {
  const ended: Event[] = endedAt ? [{ kind: 'ended', at: endedAt, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' }] : [];
  return fold('t', [
    { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r' },
    { kind: 'starting', at: startedAt, attempt: 1 },
    ...ended,
  ]).attempts[0];
};

test('an attempt begins at its start to the millisecond: a response one millisecond before is not its own, one at it is', () => {
  const since = Date.parse('2026-10-01T04:49:00.500Z');
  const jsonl = [
    response(new Date(since - 1).toISOString(), 'msg_before', [{ type: 'tool_use', id: 'tu_before', name: 'Read' }]),
    response(new Date(since).toISOString(), 'msg_at', [{ type: 'tool_use', id: 'tu_at', name: 'Bash' }]),
  ].join('\n');
  assert.deepEqual(transcriptUsage(jsonl, since), {
    turns: 1,
    toolCalls: 1,
    inputTokens: 1110,
    uncachedTokens: 10,
    cacheWriteTokens: 100,
    cacheReadTokens: 1000,
    outputTokens: 5,
    peakContextTokens: 1110,
    firstContextTokens: 1110,
    firstCacheWriteTokens: 100,
  });
});

test("a cost-state begun a moment after the attempt's first line is the attempt's count, and one begun before it is carried on from", () => {
  const since = Date.parse('2026-10-02T22:03:00Z');
  const first = Date.parse('2026-10-02T22:03:01Z');
  const jsonl = (startTime: number) =>
    [prompt('2026-10-02T22:03:01Z'), response('2026-10-02T22:03:02Z', 'msg_1', []), costState(0.25, 900, 10, startTime)].join('\n');
  assert.equal(transcriptUsage(jsonl(first + 4_000), since).costUsd, 0.25, 'counted from just after its first line');
  assert.equal(transcriptUsage(jsonl(since - 4_000), since).costUsd, 0.25, 'counted from just before it registered');
  assert.equal('costUsd' in transcriptUsage(jsonl(first + 6_000), since), false, 'counted from a later process');
});

test('an attempt whose process began writing long after it registered is counted from its first line, and a later count still is not', () => {
  const since = Date.parse('2026-10-02T22:03:00Z');
  const first = Date.parse('2026-10-02T22:13:00Z');
  const jsonl = (startTime: number) =>
    [prompt('2026-10-02T22:13:00Z'), response('2026-10-02T22:13:02Z', 'msg_1', []), costState(0.25, 900, 10, startTime)].join('\n');
  assert.equal(
    transcriptUsage(jsonl(first - 800), since).costUsd,
    0.25,
    'its process started ten minutes late, a moment before its first line',
  );
  assert.equal(
    'costUsd' in transcriptUsage(jsonl(first + 25_000), since),
    false,
    'a respawn of it, later still, counts its own turns alone',
  );
});

test('a count carried on from a total the transcript does not show is no cost', () => {
  const since = Date.parse('2026-09-15T01:12:01Z');
  const jsonl = [prompt('2026-09-15T01:12:05Z'), costState(43.0383, 3335346, 341815, Date.parse('2026-09-15T00:04:43Z'))].join('\n');
  assert.deepEqual(
    transcriptUsage(jsonl, since),
    { turns: 0, toolCalls: 0, inputTokens: 0, uncachedTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    'its count began an hour before it did, and nothing says at what',
  );

  const otherCount = [
    costState(5, 1000, 100, Date.parse('2026-09-14T22:00:00Z')),
    prompt('2026-09-15T01:12:05Z'),
    costState(43.0383, 3335346, 341815, Date.parse('2026-09-15T00:04:43Z')),
  ].join('\n');
  assert.equal(
    'costUsd' in transcriptUsage(otherCount, since),
    false,
    'a line before it from a count that began at another time is not what this one carried on from',
  );
});

test('REFUSED: a line usage reads that does not decode is refused by its line and field, never counted as nothing', () => {
  const at = '2026-09-12T09:00:01Z';
  const since = Date.parse('2026-09-12T09:00:00Z');
  const cases: [string, string][] = [
    [line({ type: 'cost-state', totalCostUSD: '1.20' }), 'a `cost-state` line whose `totalCostUSD` is "1.20"'],
    [
      line({ type: 'cost-state', modelUsage: { opus: { outputTokens: 1.5 } } }),
      'a `cost-state` line whose `modelUsage.opus.outputTokens` is 1.5',
    ],
    [line({ type: 'agent-name', agentName: 7 }), 'an `agent-name` line whose `agentName` is 7'],
    [
      line({ type: 'system', subtype: 'compact_boundary', timestamp: at, compactMetadata: { preTokens: '83770' } }),
      'a `system` line whose `compactMetadata.preTokens` is "83770"',
    ],
    [response(at, 'msg_1', [], { ...TOKENS, output_tokens: -1 }), 'an `assistant` line whose `message.usage.output_tokens` is -1'],
    [response(at, 'msg_1', [{ type: 'tool_use', id: 7 }]), 'an `assistant` line whose `message.content.0.id` is 7'],
  ];
  for (const [wrong, words] of cases) {
    assert.throws(
      () => transcriptUsage([prompt(at), wrong].join('\n'), since, '/t/s.jsonl'),
      (e: Error) => e.message.startsWith(`line 2 of the transcript \`/t/s.jsonl\` is ${words}, where Claude Code writes`),
      wrong,
    );
  }
  assert.throws(
    () => transcriptUsage(line({ type: 'user', timestamp: 'yesterday', message: { content: 'the prompt' } }), since),
    (e: Error) => e.message.startsWith('line 1 of the transcript is a `user` line whose `timestamp` is "yesterday"'),
    'a time read to tell whether the attempt has begun is decoded',
  );
});

test('usage decodes only the lines it reads: a response before the attempt began, and a line of a type it does not read, are not checked', () => {
  const since = Date.parse('2026-09-12T09:00:00Z');
  const jsonl = [
    response('2026-09-12T08:00:00Z', 'msg_0', [{ type: 'tool_use', id: 7 }], { output_tokens: -1 }),
    line({ type: 'file-history-snapshot', timestamp: 'never', snapshot: 7 }),
    prompt('2026-09-12T09:00:01Z'),
    response('2026-09-12T09:00:02Z', 'msg_1', [{ type: 'text', text: 'done' }]),
  ].join('\n');
  assert.equal(transcriptUsage(jsonl, since).turns, 1);
});

test("transcriptUsage and fold: an attempt's count and cost, measured off its transcript, or absent — never a 0 for nobody counted", async (t) => {
  await t.test('a response written as several lines is one turn, with its tokens counted once', () => {
    const jsonl = [
      response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'text', text: 'looking' }]),
      response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read' }]),
      line({ type: 'user', timestamp: '2026-09-12T09:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'tu_1' }] } }),
      response('2026-09-12T09:00:03Z', 'msg_2', [
        { type: 'tool_use', id: 'tu_2', name: 'Edit' },
        { type: 'tool_use', id: 'tu_3', name: 'Bash' },
      ]),
      '{half a line mentioning "assistant"',
    ].join('\n');
    assert.deepEqual(transcriptUsage(jsonl, Date.parse('2026-09-12T09:00:00Z')), {
      turns: 2,
      toolCalls: 3,
      inputTokens: 2220,
      uncachedTokens: 20,
      cacheWriteTokens: 200,
      cacheReadTokens: 2000,
      outputTokens: 10,
      peakContextTokens: 1110,
      firstContextTokens: 1110,
      firstCacheWriteTokens: 100,
    });
  });

  await t.test('tokens are absent, not 0, when a counted response did not carry them — and a transcript has no cost', () => {
    const jsonl = [response('2026-09-12T09:00:01Z', 'msg_1', [], null), response('2026-09-12T09:00:02Z', 'msg_2', [])].join('\n');
    const u = transcriptUsage(jsonl, 0);
    assert.equal(u.turns, 2);
    assert.equal('inputTokens' in u, false);
    assert.equal('outputTokens' in u, false);
    assert.equal('costUsd' in u, false);
  });

  await t.test(
    "a transcript's cost is the cost-state its session wrote as its process exited, with the harness's own API and tool time",
    () => {
      const since = Date.parse('2026-09-12T09:00:00Z');
      const jsonl = [
        agentName('ae/t/1'),
        prompt('2026-09-12T09:00:00.500Z'),
        response('2026-09-12T09:00:01Z', 'msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read' }]),
        costState(0.1925, 44777, 217, since - 300),
        costState(0.1925, 44777, 217, since - 300),
      ].join('\n');
      assert.deepEqual(transcriptUsage(jsonl, since), {
        turns: 1,
        toolCalls: 1,
        inputTokens: 1110,
        uncachedTokens: 10,
        cacheWriteTokens: 100,
        cacheReadTokens: 1000,
        outputTokens: 5,
        peakContextTokens: 1110,
        firstContextTokens: 1110,
        firstCacheWriteTokens: 100,
        costUsd: 0.1925,
        apiMs: 44777,
        toolMs: 217,
      });
    },
  );

  await t.test('no cost-state written since the attempt began is no cost — not 0, and not the cost of the session it continues', () => {
    const since = Date.parse('2026-09-13T04:06:15Z');
    const running = [
      response('2026-09-13T03:55:08Z', 'msg_parent', []),
      costState(28.3161, 2655415, 312510, Date.parse('2026-09-13T03:00:00Z')),
      prompt('2026-09-13T04:06:16Z'),
      response('2026-09-13T04:06:20Z', 'msg_child', []),
    ].join('\n');
    const u = transcriptUsage(running, since);
    assert.equal(u.turns, 1);
    for (const key of ['costUsd', 'apiMs', 'toolMs', 'unpricedModel'])
      assert.equal(key in u, false, `${key}: its process has not exited, and the parent's total is not its own`);
  });

  await t.test(
    "a compacted attempt's tokens are its cost-state's, which counts the summary's call its responses do not — and none until one is written",
    () => {
      const since = Date.parse('2026-09-19T03:55:58Z');
      const lines = [
        prompt('2026-09-19T03:55:59Z'),
        response('2026-09-19T03:56:01Z', 'msg_1', [{ type: 'tool_use', id: 'tu_1', name: 'Read' }]),
        boundary('2026-09-19T03:56:49Z'),
        line({
          type: 'user',
          timestamp: '2026-09-19T03:56:49Z',
          isCompactSummary: true,
          message: { content: 'This session is being continued…' },
        }),
        response('2026-09-19T03:56:51Z', 'msg_2', [{ type: 'tool_use', id: 'tu_2', name: 'Read' }]),
      ];
      const running = transcriptUsage(lines.join('\n'), since);
      assert.deepEqual(
        running,
        { turns: 2, toolCalls: 2, peakContextTokens: 83770, firstContextTokens: 1110, firstCacheWriteTokens: 100, compactions: 1 },
        'no tokens rather than a count missing the summary',
      );

      const exited = [...lines, costStateWith(1.248613, since - 300, { 'claude-sonnet-5': [77091, 298435, 225841, 13138] })].join('\n');
      assert.deepEqual(
        transcriptUsage(exited, since),
        {
          turns: 2,
          toolCalls: 2,
          peakContextTokens: 83770,
          firstContextTokens: 1110,
          firstCacheWriteTokens: 100,
          compactions: 1,
          inputTokens: 601367,
          uncachedTokens: 77091,
          cacheWriteTokens: 225841,
          cacheReadTokens: 298435,
          outputTokens: 13138,
          costUsd: 1.248613,
          apiMs: 1000,
          toolMs: 10,
        },
        "its classes are the cost-state's too, and its peak the summary call's context, larger than any response's",
      );

      const twoModels = [...lines, costStateWith(1, since, { 'claude-sonnet-5': [10, 20, 30, 4], 'claude-haiku-4-5': [1, 2, 3, 5] })].join(
        '\n',
      );
      assert.deepEqual(
        [transcriptUsage(twoModels, since).inputTokens, transcriptUsage(twoModels, since).outputTokens],
        [66, 9],
        'every model the session used',
      );
      const partial = [
        ...lines,
        line({
          type: 'cost-state',
          sessionId: 's-1',
          totalCostUSD: 1,
          startTime: since,
          modelUsage: { m: { inputTokens: 5, outputTokens: 1 } },
        }),
      ].join('\n');
      assert.equal(
        'inputTokens' in transcriptUsage(partial, since),
        false,
        'a model whose count is not all there: no tokens, not a part of them',
      );
    },
  );

  await t.test('a cache count the API gives as null is none, counted as 0, as the SDK types it', () => {
    const since = Date.parse('2026-09-12T09:00:00Z');
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null };
    const used = transcriptUsage(response('2026-09-12T09:00:01Z', 'msg_1', [], usage), since);
    assert.equal(used.inputTokens, 10);
    assert.equal(used.cacheWriteTokens, 0);
    assert.equal(used.cacheReadTokens, 0);
  });

  await t.test(
    "an attempt's input is counted in its three classes, which sum to inputTokens, and its peak is the largest any one response read",
    () => {
      const since = Date.parse('2026-09-18T09:00:00Z');
      const usage = (uncached: number, write: number, read: number) => ({
        input_tokens: uncached,
        cache_creation_input_tokens: write,
        cache_read_input_tokens: read,
        output_tokens: 7,
      });
      const jsonl = [
        prompt('2026-09-18T09:00:01Z'),
        response('2026-09-18T09:00:02Z', 'msg_1', [], usage(5, 20_000, 0)),
        response('2026-09-18T09:00:03Z', 'msg_2', [], usage(3, 1_000, 20_000)),
        response('2026-09-18T09:00:03Z', 'msg_2', [], usage(3, 1_000, 20_000)),
        response('2026-09-18T09:00:04Z', 'msg_3', [], usage(2, 500, 21_000)),
      ].join('\n');
      const u = transcriptUsage(jsonl, since);
      assert.deepEqual(
        [u.uncachedTokens, u.cacheWriteTokens, u.cacheReadTokens],
        [10, 21_500, 41_000],
        'a response written as two lines is counted once',
      );
      assert.equal(u.inputTokens, u.uncachedTokens! + u.cacheWriteTokens! + u.cacheReadTokens!);
      assert.equal(u.peakContextTokens, 21_502, "msg_3's: the three classes of one response together, not the attempt's sum");

      const unmeasured = transcriptUsage(
        [
          prompt('2026-09-18T09:00:01Z'),
          response('2026-09-18T09:00:02Z', 'msg_1', [], usage(5, 20_000, 0)),
          response('2026-09-18T09:00:03Z', 'msg_2', [], null),
        ].join('\n'),
        since,
      );
      assert.equal(
        'peakContextTokens' in unmeasured,
        false,
        'a response without its counts may have been the largest: no peak rather than a low one',
      );
      assert.deepEqual(
        [unmeasured.firstContextTokens, unmeasured.firstCacheWriteTokens],
        [20_005, 20_000],
        'the first response measured its own, whatever came after',
      );
      const firstUnmeasured = transcriptUsage(
        [
          prompt('2026-09-18T09:00:01Z'),
          response('2026-09-18T09:00:02Z', 'msg_1', [], null),
          response('2026-09-18T09:00:03Z', 'msg_2', [], usage(5, 20_000, 0)),
        ].join('\n'),
        since,
      );
      assert.equal(
        'firstContextTokens' in firstUnmeasured,
        false,
        'not the second response standing in for a first that carried no counts',
      );
      assert.equal('cacheReadTokens' in unmeasured, false);
    },
  );

  await t.test(
    'a journal written before the classes were measured folds as it did: inputTokens alone, and no class standing in as 0',
    () => {
      const journal = [
        '{"kind":"filed","at":"2026-09-18T09:00:00Z","brief":"b","cwd":"/r"}',
        '{"kind":"starting","at":"2026-09-18T09:00:01Z","attempt":1}',
        '{"kind":"ended","at":"2026-09-18T09:05:00Z","attempt":1,"sessionId":"s","observed":"done","reason":"harness","usage":{"turns":85,"toolCalls":40,"inputTokens":21861234,"outputTokens":40100}}',
        '{"kind":"measured","at":"2026-09-18T09:05:02Z","attempt":1,"usage":{"costUsd":14.72,"apiMs":679931,"toolMs":29305}}',
      ].map((l) => JSON.parse(l) as Event);
      const [a] = fold('t', journal).attempts;
      assert.deepEqual(
        a.usage,
        {
          turns: 85,
          toolCalls: 40,
          inputTokens: 21861234,
          outputTokens: 40100,
          costUsd: 14.72,
          apiMs: 679931,
          toolMs: 29305,
        },
        'an end and a measure in the shape a runtime that counted no classes wrote them',
      );
      for (const key of ['uncachedTokens', 'cacheWriteTokens', 'cacheReadTokens', 'peakContextTokens'])
        assert.equal(key in a.usage, false, key);
      assert.equal(
        usageLine(a.usage),
        '85 turns · 40 tool calls · 21.9M in · 40.1k out · $14.72 · cache not measured · peak not measured',
        'and ae show names what it did not count',
      );
    },
  );

  await t.test(
    'a session that used a model its harness could not price has no cost — a total too low reads as the whole — and says why',
    () => {
      const since = Date.parse('2026-09-12T09:00:00Z');
      const jsonl = [prompt('2026-09-12T09:00:01Z'), costState(0.05, 900, 10, since, true)].join('\n');
      const u = transcriptUsage(jsonl, since);
      assert.equal('costUsd' in u, false);
      assert.equal(u.unpricedModel, true);
      assert.equal(u.apiMs, 900, 'the time it waited is still a measurement');

      const priced = transcriptUsage([prompt('2026-09-12T09:00:01Z'), costState(0.05, 900, 10, since)].join('\n'), since);
      assert.equal(priced.costUsd, 0.05);
      assert.equal('unpricedModel' in priced, false);
    },
  );

  await t.test(
    'fold carries a cost onto the attempt — on its end, or measured after it — and a journal written before cost was measured folds as it did',
    () => {
      const at = '2026-09-12T09:05:00Z';
      const begun: Event[] = [
        { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r' },
        { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
      ];
      const counted = { turns: 3, toolCalls: 5, inputTokens: 10, outputTokens: 2 };
      const legacy = fold('t', [
        ...begun,
        { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: counted },
      ]);
      assert.deepEqual(legacy.attempts[0].usage, counted, 'as recorded: no cost, and nothing standing in for one');

      const printed = fold('t', [
        ...begun,
        { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: { costUsd: 0.018, apiMs: 718 } },
      ]);
      assert.deepEqual(printed.attempts[0].usage, { costUsd: 0.018, apiMs: 718 }, 'on its end, as claude -p printed it');

      const measured = fold('t', [
        ...begun,
        { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', usage: counted },
        { kind: 'measured', at, attempt: 1, usage: { ...counted, costUsd: 0.42, apiMs: 900, toolMs: 30 } },
        { kind: 'measured', at, attempt: 2, usage: { costUsd: 9 } },
      ]);
      assert.deepEqual(
        measured.attempts[0].usage,
        { ...counted, costUsd: 0.42, apiMs: 900, toolMs: 30 },
        'measured once its session exited',
      );
      assert.equal(measured.attempts.length, 1, 'and one for an attempt that never started changes nothing');

      const unmeasuredEnd = fold('t', [
        ...begun,
        { kind: 'ended', at, attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' },
        { kind: 'measured', at, attempt: 1, usage: { costUsd: 1 } },
      ]);
      assert.deepEqual(unmeasuredEnd.attempts[0].usage, { costUsd: 1 });
    },
  );
});

test("a resumed session is charged its own spend: its parent's conversation, cost, classes and compaction are not its own", async (t) => {
  const s = story(t);

  await s.test("a resumed session's inherited conversation is not counted as its own", () => {
    const jsonl = [
      response('2026-09-13T03:55:08Z', 'msg_parent', [{ type: 'tool_use', id: 'tu_p', name: 'Write' }]),
      response('2026-09-13T04:06:20Z', 'msg_child', [{ type: 'text', text: 'carrying on' }]),
    ].join('\n');
    assert.deepEqual(
      transcriptUsage(jsonl, Date.parse('2026-09-13T04:06:15Z')),
      {
        turns: 1,
        toolCalls: 0,
        inputTokens: 1110,
        uncachedTokens: 10,
        cacheWriteTokens: 100,
        cacheReadTokens: 1000,
        outputTokens: 5,
        peakContextTokens: 1110,
        firstContextTokens: 1110,
        firstCacheWriteTokens: 100,
      },
      "the parent's entries keep the parent's timestamps: the registry's start for the child tells them apart",
    );
  });

  await s.test("a resumed session's cost is its own: the total it exited with, less the total its session had when it began", () => {
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
    assert.deepEqual(
      own,
      {
        turns: 1,
        toolCalls: 0,
        inputTokens: 1110,
        uncachedTokens: 10,
        cacheWriteTokens: 100,
        cacheReadTokens: 1000,
        outputTokens: 5,
        peakContextTokens: 1110,
        firstContextTokens: 1110,
        firstCacheWriteTokens: 100,
        costUsd: 14.7222,
        apiMs: 679931,
        toolMs: 29305,
      },
      'the second process: its total less the first, and its tokens only — not the third, which continued it under another name',
    );
    assert.equal(
      transcriptUsage(jsonl, first).costUsd,
      28.3161,
      'the first, read again while its session is still listed: its own, not what the later ones spent',
    );
    assert.equal(transcriptUsage(jsonl, Date.parse('2026-09-15T02:47:53Z')).costUsd, 4.1704, 'the third');
  });

  await s.test("a resumed attempt's classes and peak are its own lines', and its peak starts where its parent's conversation ended", () => {
    const parentStart = Date.parse('2026-09-18T08:00:00Z');
    const since = Date.parse('2026-09-18T09:00:00Z');
    const usage = (uncached: number, write: number, read: number) => ({
      input_tokens: uncached,
      cache_creation_input_tokens: write,
      cache_read_input_tokens: read,
      output_tokens: 9,
    });
    const jsonl = [
      prompt('2026-09-18T08:00:01Z'),
      response('2026-09-18T08:00:02Z', 'msg_p1', [], usage(4, 30_000, 0)),
      response('2026-09-18T08:10:00Z', 'msg_p2', [], usage(2, 2_000, 180_000)),
      prompt('2026-09-18T09:00:01Z'),
      response('2026-09-18T09:00:05Z', 'msg_c1', [], usage(6, 183_000, 0)),
      response('2026-09-18T09:00:09Z', 'msg_c2', [], usage(1, 1_500, 183_000)),
    ].join('\n');
    const child = transcriptUsage(jsonl, since);
    assert.deepEqual(
      [child.turns, child.uncachedTokens, child.cacheWriteTokens, child.cacheReadTokens, child.inputTokens, child.peakContextTokens],
      [2, 7, 184_500, 183_000, 367_507, 184_501],
      "its own two responses: the parent's are not counted, and nothing of the parent's is taken off the peak",
    );
    assert.deepEqual(
      [child.firstContextTokens, child.firstCacheWriteTokens],
      [183_006, 183_000],
      "its first response: the parent's conversation, written again",
    );
    const warm = transcriptUsage(
      jsonl.replace(
        '"cache_creation_input_tokens":183000,"cache_read_input_tokens":0',
        '"cache_creation_input_tokens":1000,"cache_read_input_tokens":182000',
      ),
      since,
    );
    assert.deepEqual(
      [warm.firstContextTokens, warm.firstCacheWriteTokens],
      [183_006, 1_000],
      'read from the cache, it writes only what is new',
    );
    const parent = transcriptUsage(jsonl.split('\n').slice(0, 3).join('\n'), parentStart);
    assert.deepEqual(
      [parent.cacheWriteTokens, parent.cacheReadTokens, parent.peakContextTokens],
      [32_000, 180_000, 182_002],
      "the parent's, read on its own",
    );
  });

  await s.test(
    "a boundary its session wrote before the attempt began is not the attempt's — a resumed copy carries its parent's last",
    () => {
      const first = Date.parse('2026-09-19T03:55:58Z');
      const since = Date.parse('2026-09-19T04:00:46Z');
      const jsonl = [
        response('2026-09-19T03:57:19Z', 'msg_parent', []),
        boundary('2026-09-19T03:57:52Z'),
        costStateWith(1.248613, first, { 'claude-sonnet-5': [77091, 298435, 225841, 13138] }),
        prompt('2026-09-19T04:00:47Z'),
        response('2026-09-19T04:01:24Z', 'msg_child', []),
      ].join('\n');
      assert.deepEqual(
        transcriptUsage(jsonl, since),
        {
          turns: 1,
          toolCalls: 0,
          inputTokens: 1110,
          uncachedTokens: 10,
          cacheWriteTokens: 100,
          cacheReadTokens: 1000,
          outputTokens: 5,
          peakContextTokens: 1110,
          firstContextTokens: 1110,
          firstCacheWriteTokens: 100,
        },
        'its own responses, counted as ever',
      );

      const compactedToo = [
        ...jsonl.split('\n').slice(0, 4),
        boundary('2026-09-19T04:01:18Z'),
        jsonl.split('\n')[4],
        costStateWith(1.6757343, first, { 'claude-sonnet-5': [100000, 500000, 375784, 19745] }),
      ].join('\n');
      const u = transcriptUsage(compactedToo, since);
      assert.deepEqual(
        [u.inputTokens, u.outputTokens, u.costUsd],
        [975784 - 601367, 19745 - 13138, 0.427121],
        'compacted itself: its share of the carried count, tokens as cost',
      );
      assert.deepEqual(
        [u.uncachedTokens, u.cacheReadTokens, u.cacheWriteTokens],
        [100000 - 77091, 500000 - 298435, 375784 - 225841],
        'its classes too',
      );
      assert.equal(u.peakContextTokens, 83770, "its own boundary's context, not taken off for the parent's before it");
      assert.equal(u.compactions, 1, "its own boundary, not the parent's before it");

      const twice = [...compactedToo.split('\n').slice(0, 5), boundary('2026-09-19T04:01:20Z'), ...compactedToo.split('\n').slice(5)].join(
        '\n',
      );
      assert.equal(transcriptUsage(twice, since).compactions, 2, 'each of its own');
      assert.equal('compactions' in transcriptUsage(jsonl, since), false, "none of its own: absent, and the parent's does not count");
    },
  );
});

test('a long-lived attempt is counted across its processes, and its counts and denials are printed as they grow', async (t) => {
  const s = story(t);

  await s.test(
    "a long-lived attempt Claude Code respawned is counted across both processes, and the respawn's own cost is not the attempt's",
    () => {
      const since = 1790978606904;
      const respawned = 1790978632072;
      const at = (ms: number) => new Date(ms).toISOString();
      const jsonl = [
        prompt(at(since + 500)),
        response(at(since + 2_000), 'msg_1', []),
        response(at(since + 4_000), 'msg_2', []),
        response(at(since + 6_000), 'msg_3', []),
        response(at(respawned + 3_000), 'msg_4', []),
        costState(0.0046575, 2100, 0, respawned),
        costState(0.0046575, 2100, 0, respawned),
      ].join('\n');

      const attempt = transcriptUsage(jsonl, since);
      assert.equal(attempt.turns, 4, "the killed process wrote no cost-state, and its turns are the attempt's all the same");
      assert.equal(attempt.outputTokens, 20);
      for (const key of ['costUsd', 'apiMs', 'toolMs'])
        assert.equal(key in attempt, false, `${key}: the respawned process counted its own turns alone, too low for the attempt`);

      const respawn = transcriptUsage(jsonl, Date.parse(at(respawned + 813)));
      assert.equal(respawn.turns, 1, 'counted from the respawn, its own turn');
      assert.equal(respawn.costUsd, 0.0046575, 'and the cost-state is its count, begun as it registered');
    },
  );

  await s.test(
    "ae feed prints a long-lived attempt's counts as they grow, with no cost, which its end records — and ae ls its turns so far",
    () => {
      const counted: Event = {
        kind: 'counted',
        at: '2026-10-02T22:10:00Z',
        attempt: 1,
        usage: { turns: 4, toolCalls: 2, inputTokens: 20400, outputTokens: 1530 },
      };
      assert.equal(
        entryLine('t-1', counted),
        `22:10:00  ${'t-1'.padEnd(34)} ${'counted'.padEnd(10)}  attempt 1: 4 turns · 2 tool calls · 20.4k in · 1.5k out · cache not measured · peak not measured`,
      );
      const state = fold('t-1', [
        { kind: 'filed', at: '2026-10-02T22:00:00Z', brief: 'keep watch', cwd: '/r', restartPolicy: 'Always' },
        { kind: 'starting', at: '2026-10-02T22:00:01Z', attempt: 1 },
        counted,
      ]);
      assert.match(
        taskLine({ id: 't-1', state, phase: 'running (working)', sessionId: null }),
        /\(working\) {3}cost not measured · 4t  keep watch$/,
      );
    },
  );

  await s.test(
    'ae feed prints each call the harness denied a running attempt as it is written, and ae show the running attempt with what it was denied so far',
    () => {
      const denied: Event = { kind: 'denied', at: '2026-10-05T19:40:00Z', attempt: 1, tool: 'Bash', what: 'ls' };
      assert.equal(entryLine('t-1', denied), `19:40:00  ${'t-1'.padEnd(34)} ${'denied'.padEnd(10)}  attempt 1: Bash(ls)`);
      const state = fold('t-1', [
        { kind: 'filed', at: '2026-10-05T19:39:00Z', brief: 'b', cwd: '/r' },
        { kind: 'starting', at: '2026-10-05T19:39:01Z', attempt: 1 },
        denied,
        { kind: 'denied', at: '2026-10-05T19:40:01Z', attempt: 1, tool: 'Glob' },
      ]);
      assert.match(attemptLine(state.attempts[0]), /^attempt 1 {2}running since \S+ {2}denied: Bash\(ls\), Glob$/);
    },
  );
});

test('ae show, ae ls and ae feed print what an attempt measured, cost and was denied, and say what nobody measured', async (t) => {
  await t.test('an attempt its runner measured nothing about records null, and a person reads "not measured"', () => {
    const events: Event[] = [
      { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r' },
      { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
      { kind: 'spawned', at: '2026-09-12T09:00:02Z', attempt: 1 },
      { kind: 'ended', at: '2026-09-12T09:05:00Z', attempt: 1, sessionId: 's', observed: 'done', reason: 'harness' },
    ];
    const [a] = fold('t', events).attempts;
    assert.equal(a.usage, null);
    assert.equal(a.exitCode, null);
    assert.equal(attemptLine(a), 'attempt 1  done  09:00:01 → 09:05:00 (4m 59s)  usage not measured');
  });

  await t.test('a measured attempt prints what was measured, and names what was not', () => {
    assert.equal(
      usageLine({ turns: 12, toolCalls: 31, inputTokens: 1_234_567, outputTokens: 20_400 }),
      '12 turns · 31 tool calls · 1.2M in · 20.4k out · cost not measured · cache not measured · peak not measured',
    );
    assert.equal(
      usageLine({
        turns: 85,
        toolCalls: 40,
        inputTokens: 21_861_234,
        uncachedTokens: 1_234,
        cacheWriteTokens: 412_000,
        cacheReadTokens: 21_448_000,
        peakContextTokens: 167_012,
        outputTokens: 40_100,
        costUsd: 14.72,
      }),
      '85 turns · 40 tool calls · 21.9M in · 40.1k out · $14.72 · read 21.4M · wrote 412.0k · uncached 1.2k · peak 167.0k',
      'the classes and the peak beside the cost',
    );
    assert.equal(
      usageLine({
        inputTokens: 601_367,
        uncachedTokens: 77_091,
        cacheWriteTokens: 225_841,
        cacheReadTokens: 298_435,
        peakContextTokens: 173_584,
        compactions: 2,
        outputTokens: 13_138,
        costUsd: 1.25,
      }),
      'turns not measured · tool calls not measured · 601.4k in · 13.1k out · $1.25 · read 298.4k · wrote 225.8k · uncached 77.1k · peak 173.6k · compacted 2 times',
      'a session that compacted says so: its peak stops short of its window',
    );
    assert.equal(usageLine({ turns: 4, toolCalls: 2, costUsd: 0.1054 }), '4 turns · 2 tool calls · tokens not measured · $0.11');
    const [a] = fold('t', [
      { kind: 'filed', at: '2026-09-12T09:00:00Z', brief: 'b', cwd: '/r' },
      { kind: 'starting', at: '2026-09-12T09:00:01Z', attempt: 1 },
      {
        kind: 'ended',
        at: '2026-09-12T09:05:00Z',
        attempt: 1,
        sessionId: 's',
        observed: 'failed',
        reason: 'harness',
        exitCode: 3,
        usage: { turns: 1, toolCalls: 0 },
      },
    ]).attempts;
    assert.equal(
      attemptLine(a),
      'attempt 1  failed  09:00:01 → 09:05:00 (4m 59s)  exit 3  1 turns · 0 tool calls · tokens not measured · cost not measured',
    );
  });

  await t.test(
    'ae show and ae ls print what an attempt cost to the cent — never $0.00 for a cost under one — or that nobody measured it, and why',
    () => {
      assert.equal(usd(3.0054), '$3.01');
      assert.equal(usd(0.0042), '<$0.01', 'a resumed claude -p that spent less than a cent did not spend nothing');
      assert.equal(usd(0), '$0.00');
      assert.equal(
        usageLine({ turns: 1, toolCalls: 0, apiMs: 900, unpricedModel: true }),
        '1 turns · 0 tool calls · tokens not measured · cost not measured (a model without a price)',
      );

      const base: Event[] = [
        {
          kind: 'filed',
          at: '2026-09-15T09:00:00Z',
          brief: 'read the notes\nforty times',
          cwd: '/r',
          harness: 'claude-detached',
          config: { budgetUsd: 0.01 },
        },
        { kind: 'starting', at: '2026-09-15T09:00:01Z', attempt: 1 },
      ];
      const spent = fold('t-1', [
        ...base,
        {
          kind: 'ended',
          at: '2026-09-15T09:00:04Z',
          attempt: 1,
          sessionId: 's',
          observed: 'failed',
          reason: 'harness',
          limit: 'budget',
          exitCode: 1,
          usage: { costUsd: 0.01804, apiMs: 718 },
        },
      ]);
      assert.equal(
        attemptLine(spent.attempts[0]),
        'attempt 1  failed (budget)  09:00:01 → 09:00:04 (3s)  exit 1  turns not measured · tool calls not measured · tokens not measured · $0.02',
      );

      const shown = (state: ReturnType<typeof fold>, usage?: object) =>
        taskLine({ id: 't-1', state, phase: state.settled ?? 'running (working)', sessionId: null, ...(usage ? { usage } : {}) });
      assert.match(shown(spent), /\(working\) {3}\$0\.02  read the notes$/);
      const measured = fold('t-1', [
        ...base,
        {
          kind: 'ended',
          at: '2026-09-15T09:05:00Z',
          attempt: 1,
          sessionId: 's',
          observed: 'done',
          reason: 'harness',
          usage: { turns: 12 },
        },
        { kind: 'measured', at: '2026-09-15T09:05:01Z', attempt: 1, usage: { turns: 12, costUsd: 3.0054 } },
      ]);
      assert.match(shown(measured), /\(working\) {3}\$3\.01 · 12t  read the notes$/, 'measured once its session was let go');
      assert.match(
        shown(fold('t-1', base), { turns: 3 }),
        /\(working\) {3}cost not measured · 3t  read the notes$/,
        'running: no cost written yet',
      );
      assert.match(shown(fold('t-1', base.slice(0, 1))), /\(working\) {3}read the notes$/, 'no attempt, nothing to cost');
    },
  );

  await t.test(
    'ae show prints what the harness denied an attempt, as the rules that would allow it, and nothing when it denied nothing',
    () => {
      const base: Event[] = [
        { kind: 'filed', at: '2026-09-23T09:00:00Z', brief: 'b', cwd: '/r' },
        { kind: 'starting', at: '2026-09-23T09:00:01Z', attempt: 1 },
      ];
      const ended = (extra: object) =>
        fold('t-1', [
          ...base,
          { kind: 'ended', at: '2026-09-23T09:00:04Z', attempt: 1, sessionId: 's', observed: 'done', reason: 'harness', ...extra },
        ]).attempts[0];
      assert.equal(
        attemptLine(ended({ denials: [{ tool: 'Skill', what: 'look' }, { tool: 'Bash', what: 'pytest' }, { tool: 'WebFetch' }] })),
        'attempt 1  done  09:00:01 → 09:00:04 (3s)  usage not measured  denied: Skill(look), Bash(pytest), WebFetch',
      );
      assert.equal(attemptLine(ended({})), 'attempt 1  done  09:00:01 → 09:00:04 (3s)  usage not measured');
      assert.equal(
        attemptLine(ended({ denials: [] })),
        'attempt 1  done  09:00:01 → 09:00:04 (3s)  usage not measured',
        'none denied: nothing said',
      );
    },
  );

  await t.test(
    'ae show and ae feed say an end gave no statement where its task asked for one — `done (no statement)` — and nothing where it gave one or none was asked',
    () => {
      const base: Event[] = [
        { kind: 'filed', at: '2026-09-23T09:00:00Z', brief: 'b', cwd: '/r', closeoutSchema: { type: 'object' } },
        { kind: 'starting', at: '2026-09-23T09:00:01Z', attempt: 1 },
      ];
      const end = (extra: object): Event => ({
        kind: 'ended',
        at: '2026-09-23T09:00:04Z',
        attempt: 1,
        sessionId: 's',
        observed: 'done',
        reason: 'harness',
        ...extra,
      });
      const shown = (extra: object) => [attemptLine(fold('t-1', [...base, end(extra)]).attempts[0]), entryLine('t-1', end(extra))];
      assert.deepEqual(shown({ stated: false }), [
        'attempt 1  done (no statement)  09:00:01 → 09:00:04 (3s)  usage not measured',
        `09:00:04  ${'t-1'.padEnd(34)} ${'ended'.padEnd(10)}  done (no statement)`,
      ]);
      for (const extra of [{ stated: true, closeout: { outcome: 'done' } }, {}])
        assert.deepEqual(
          shown(extra),
          ['attempt 1  done  09:00:01 → 09:00:04 (3s)  usage not measured', `09:00:04  ${'t-1'.padEnd(34)} ${'ended'.padEnd(10)}  done`],
          JSON.stringify(extra),
        );
      assert.equal(
        entryLine('t-1', end({ observed: 'failed', reason: 'unsigned' })),
        `09:00:04  ${'t-1'.padEnd(34)} ${'ended'.padEnd(10)}  failed (unsigned)`,
        "an older journal's end the engine judged: its reason, as written",
      );
    },
  );

  await t.test('ae show prints the budget and the context window a task was filed with, and nothing for either it was not', () => {
    const filed = (extra: object): Event => ({ kind: 'filed', at: '2026-09-19T09:00:00Z', brief: 'b', cwd: '/r', ...extra });
    assert.deepEqual(limitLines(fold('t-1', [filed({ config: { contextTokens: 200000, budgetUsd: 0.25 } })])), [
      'budget: $0.25 an attempt',
      'context: 200000 tokens a session, compacted past about it',
    ]);
    assert.deepEqual(limitLines(fold('t-1', [filed({})])), []);
  });

  await t.test('ae ls prints no priority, which only orders admission under a ceiling `ae` runs without', () => {
    const filed = (extra: object): Event => ({ kind: 'filed', at: '2026-09-16T09:00:00Z', brief: 'review it', cwd: '/r', ...extra });
    const shown = (extra: object) => taskLine({ id: 't-1', state: fold('t-1', [filed(extra)]), phase: 'pending', sessionId: null });
    for (const extra of [{ priority: 3 }, { priority: -1 }, {}])
      assert.match(shown(extra), /pending {11}  review it$/, JSON.stringify(extra));
    assert.doesNotMatch(shown({ priority: 3 }), /priority/);
  });

  await t.test('a count its runner could not see is named as not measured — a Codex attempt has tokens and no turns', () => {
    assert.equal(
      usageLine({ toolCalls: 12, inputTokens: 373_710, outputTokens: 1_082 }),
      'turns not measured · 12 tool calls · 373.7k in · 1.1k out · cost not measured · cache not measured · peak not measured',
    );
    assert.equal(
      usageLine({ inputTokens: 10, outputTokens: 5 }),
      'turns not measured · tool calls not measured · 10 in · 5 out · cost not measured · cache not measured · peak not measured',
    );
  });

  await t.test('ae show says when each attempt ran: its start, its end, and how long that took', () => {
    const shown = (startedAt: string, endedAt: string) => attemptLine(ranAt(startedAt, endedAt));
    assert.equal(shown('2026-09-12T09:00:01Z', '2026-09-12T09:00:43Z'), 'attempt 1  done  09:00:01 → 09:00:43 (42s)  usage not measured');
    assert.equal(
      shown('2026-09-12T09:00:01.250Z', '2026-09-12T10:02:30.000Z'),
      'attempt 1  done  09:00:01 → 10:02:30 (1h 02m)  usage not measured',
    );
    assert.equal(
      shown('2026-09-12T23:59:30Z', '2026-09-13T00:00:15Z'),
      'attempt 1  done  23:59:30 → 00:00:15 (45s)  usage not measured',
      'the length is taken from the timestamps, not from the clock text: past midnight it is still 45 seconds',
    );
  });

  await t.test('an attempt still running has no end to print, so ae show says since when', () => {
    assert.equal(attemptLine(ranAt('2026-09-12T09:00:01Z')), 'attempt 1  running since 09:00:01');
  });
});

test("codexOutput: a Codex run's usage read from its stream, and nothing it cannot say", async (t) => {
  await t.test("a Codex run's usage is read from its stream: tokens from turn.completed, tool calls by item, and no turns", () => {
    const read = codexOutput(
      codexStream(
        THREAD,
        TURN,
        item('completed', 'item_0', 'agent_message', { text: 'reading the diff' }),
        item('started', 'item_1', 'command_execution', { command: "/bin/bash -lc 'git diff'", status: 'in_progress' }),
        item('completed', 'item_1', 'command_execution', { exit_code: 0, status: 'completed' }),
        item('completed', 'item_2', 'file_change', { status: 'completed' }),
        completed(),
      ),
    );
    assert.deepEqual(
      read.usage,
      {
        toolCalls: 2,
        inputTokens: 373710,
        uncachedTokens: 59854,
        cacheWriteTokens: 0,
        cacheReadTokens: 313856,
        outputTokens: 1082,
      },
      'cached tokens are part of input_tokens and reasoning part of output_tokens: neither is added',
    );
    assert.equal('turns' in read.usage, false, "Codex's turns are prompts, not model responses");
    assert.equal('costUsd' in read.usage, false);
  });

  await t.test(
    'a Codex stream that cannot say is not made to: a turn cut short gives no tokens, an unknown item no tool-call count',
    () => {
      assert.deepEqual(
        codexOutput(codexStream(THREAD, TURN, item('started', 'item_1', 'command_execution'))).usage,
        { toolCalls: 1 },
        'killed mid-turn: the calls seen, no tokens',
      );
      assert.deepEqual(codexOutput(codexStream(TURN, completed(), TURN)).usage, { toolCalls: 0 }, 'the first turn of two is not the whole');
      assert.throws(
        () => codexOutput(codexStream(TURN, completed({ output_tokens: 5 }))),
        (err: Error) =>
          err.message.startsWith(
            'line 3 of the `codex exec --json` stream is a `turn.completed` event whose `usage.input_tokens` is missing.',
          ),
        'a turn.completed without its counts is refused, never read as no count',
      );
      assert.deepEqual(
        codexOutput(codexStream(TURN, item('completed', 'item_1', 'mcp_tool_call'), completed())).usage,
        { inputTokens: 373710, uncachedTokens: 59854, cacheWriteTokens: 0, cacheReadTokens: 313856, outputTokens: 1082 },
        'a type never seen is not guessed at',
      );
      assert.deepEqual(
        codexOutput(codexStream(TURN, completed({ ...USED, cache_write_input_tokens: 5 }))).usage,
        { toolCalls: 0, outputTokens: 1082 },
        'whether input_tokens counts cache writes is unknown',
      );
      assert.deepEqual(
        codexOutput(codexStream(TURN, completed(), TURN, completed({ ...USED, input_tokens: 1, output_tokens: 2 }))).usage,
        { toolCalls: 0, inputTokens: 373711, outputTokens: 1084 },
        'turns that all completed are summed',
      );
    },
  );

  await t.test('a Codex stream with no turn in it measured nothing, and reports no usage at all', () => {
    assert.deepEqual(codexOutput(''), {});
    assert.deepEqual(codexOutput('Reading additional input from stdin...\nError: not logged in'), {});
    assert.deepEqual(codexOutput(codexStream(THREAD)), {});
  });
});
