/**
 * What a run took, off the engine's views of its tasks: its time at work, the union of the intervals its tasks ran in, and the tokens its
 * sessions used, with their words. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RepositoryRun } from '../record/record.ts';
import type { Consumed } from '../status/status.ts';
import type { Workflow } from '../step/step.ts';
import { timeline, type AttemptClock, type TaskClock } from './timeline.ts';
import { atWork, gateWaitOf, runTokens, tryEndOf } from './took.ts';

const run = (steps: RepositoryRun['steps']): RepositoryRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps,
});

/** An instant `h` hours and `m` minutes into the fixtures' day. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 4, h, m)).toISOString();

/** An attempt spawned at `from` and ended at `to` (null: still running), in `turn`, with `usage` on it. */
const attempt = (from: string, to: string | null, more: Partial<AttemptClock> = {}): AttemptClock => ({
  startedAt: from,
  spawnedAt: from,
  endedAt: to,
  reason: to ? 'harness' : null,
  usage: null,
  ...more,
});

/** A task's view: its attempts, settled as `settled` says, and what the attempt in flight has used so far. */
const task = (
  attempts: AttemptClock[],
  settled: 'succeeded' | 'failed' | 'stopped' | null = 'succeeded',
  more: Partial<TaskClock> = {},
): TaskClock => ({
  state: { brief: 'filed', settled, attempts },
  ...more,
});

const MIN = 60_000;

test('two steps side by side count once: the union of their intervals, not their sum', () => {
  const r = run({ a: { taskId: 'a' }, b: { taskId: 'b' } });
  const views = new Map([
    ['a', task([attempt(at(10), at(10, 30))])],
    ['b', task([attempt(at(10, 10), at(10, 40))])],
  ]);
  assert.deepEqual(atWork(r, views), { ms: 40 * MIN, since: null, endedAt: at(10, 40) });
});

test('a wait at a gate counts for nothing: the session, its check, and the next step after the gate', () => {
  const r = run({ plan: { taskId: 'p', check: { taskId: 'pc' } }, build: { taskId: 'b' } });
  const views = new Map([
    ['p', task([attempt(at(10), at(10, 20))])],
    ['pc', task([attempt(at(10, 20), at(10, 22))])],
    ['b', task([attempt(at(13), at(13, 10))])],
  ]);
  assert.deepEqual(atWork(r, views), { ms: 32 * MIN, since: null, endedAt: at(13, 10) });
});

test('a task held open counts turn by turn: between the turn that signed and the next, a person was deciding', () => {
  const r = run({ chat: { taskId: 'c' } });
  const turns = [attempt(at(10), at(10, 20), { turn: 0, ended: 'succeeded' }), attempt(at(12), at(12, 5), { turn: 1, ended: 'succeeded' })];
  assert.equal(atWork(r, new Map([['c', task(turns)]])).ms, 25 * MIN);
});

test('while a task runs, `since` is when it started and `ms` what ran before it; an interval that ran past `since` is cut there', () => {
  const r = run({ a: { taskId: 'a' }, b: { taskId: 'b' } });
  const ended = task([attempt(at(10), at(10, 20))]);
  const running = task([attempt(at(10, 30), null)], null);
  assert.deepEqual(
    atWork(
      r,
      new Map([
        ['a', ended],
        ['b', running],
      ]),
    ),
    { ms: 20 * MIN, since: at(10, 30), endedAt: null },
  );
  const across = task([attempt(at(10), at(10, 40))]);
  assert.deepEqual(
    atWork(
      r,
      new Map([
        ['a', across],
        ['b', running],
      ]),
    ),
    { ms: 30 * MIN, since: at(10, 30), endedAt: null },
  );
});

test('an attempt that never started, a task the engine has no record of, and another run’s task add nothing; a task held open and signed has ended', () => {
  const r = run({ a: { taskId: 'a' }, b: { taskId: 'b' }, gone: { taskId: 'x' } });
  const views = new Map([
    ['a', task([attempt(at(9), at(9, 1), { reason: 'unstartable' }), attempt(at(10), at(10, 10))])],
    [
      'b',
      task([attempt(at(10, 10), at(10, 15), { ended: 'succeeded' })], null, {
        phase: 'input-required',
      }),
    ],
    ['other', task([attempt(at(8), at(18))])],
  ]);
  assert.deepEqual(atWork(r, views), { ms: 15 * MIN, since: null, endedAt: at(10, 15) });
});

test('nothing ran: no time at work, and no end', () => {
  assert.deepEqual(atWork(run({ a: { taskId: null } }), new Map()), { ms: 0, since: null, endedAt: null });
});

const used = (input: number, output: number, read?: number, write?: number): Consumed => ({
  inputTokens: input,
  outputTokens: output,
  ...(read !== undefined ? { cacheReadTokens: read, cacheWriteTokens: write!, uncachedTokens: input - read - write! } : {}),
});

test('a run’s tokens are every session’s of every try, once — a recheck’s try shares its session, and a check measures nothing', () => {
  const r = run({
    plan: { taskId: 'p2', check: { taskId: 'pc2' }, tries: [{ taskId: 'p1', check: { taskId: 'pc1' }, cause: 'retries' }] },
    build: { taskId: 'b1', tries: [{ taskId: 'b1', check: { taskId: 'bc1' }, cause: 'recheck' }] },
  });
  const views = new Map([
    ['p1', task([attempt(at(10), at(10, 5), { usage: used(1_000_000, 10_000, 900_000, 80_000) })])],
    ['pc1', task([attempt(at(10, 5), at(10, 6), { usage: used(5, 5, 0, 0) })])],
    ['p2', task([attempt(at(10, 6), at(10, 9), { usage: used(2_000_000, 20_000, 1_900_000, 50_000) })])],
    ['b1', task([attempt(at(11), at(11, 9), { usage: used(3_000_000, 30_000, 2_800_000, 150_000) })])],
  ]);
  const tokens = runTokens(r, views)!;
  assert.deepEqual(
    [tokens.total, tokens.input, tokens.output, tokens.cacheRead, tokens.cacheWrite, tokens.uncached],
    [6_060_000, 6_000_000, 60_000, 5_600_000, 280_000, 120_000],
  );
  assert.equal(tokens.cacheRead! + tokens.cacheWrite! + tokens.uncached!, tokens.input, 'the split adds up to the input');
  assert.deepEqual([tokens.measured, tokens.unmeasured, tokens.said], [3, 0, '6.06M tokens']);
  assert.equal(tokens.split, '5.6M read from the cache · 280k written to it · 120k uncached · 60k out');
});

test('REFUSED: a session that measured nothing marks the total as the least it was, a part one session lacks is left out, and none measured is no figure', () => {
  const r = run({ a: { taskId: 'a' }, b: { taskId: 'b' }, c: { taskId: 'c' }, d: { taskId: 'd' } });
  const views = new Map([
    ['a', task([attempt(at(10), at(10, 5), { usage: used(1_000_000, 10_000, 900_000, 80_000) })])],
    ['b', task([attempt(at(10), at(10, 5), { usage: used(500_000, 6_000) })])],
    ['c', task([attempt(at(10), at(10, 5))])],
    ['d', task([], null)],
  ]);
  const tokens = runTokens(r, views)!;
  assert.deepEqual([tokens.total, tokens.cacheRead, tokens.measured, tokens.unmeasured], [1_516_000, null, 2, 1]);
  assert.equal(tokens.said, '≥1.52M tokens');
  assert.equal(tokens.split, '1.5M in · 16k out; 1 session measured nothing');
  assert.equal(runTokens(run({ c: { taskId: 'c' }, d: { taskId: 'd' } }), views), null);
});

test('the attempt in flight counts what it has used so far, off the view', () => {
  const r = run({ a: { taskId: 'a' } });
  const live = task([attempt(at(10), null)], null, { usage: used(2_000_000, 1_000) });
  assert.equal(runTokens(r, new Map([['a', live]]))!.total, 2_001_000);
});

const ASK = { name: 'ask', gate: true, after: [] } as unknown as Workflow;

/** A run of one gated step held open on task `T`: it signed off blocked, a person answered, and its second try is that answer's turn. */
const answered = (approved: { try: number; at: string }): RepositoryRun => ({
  ...run({ ask: { taskId: 'T', tries: [{ taskId: 'T', cause: 'nudge' }] } }),
  approvals: [{ step: 'ask', ...approved }],
});

/** The held session: a first turn that ended at 10:05, and the answer's turn from 10:11 to `end`, signed and waiting on a person. */
const held = (end: string | null = at(10, 20)): TaskClock =>
  task(
    [attempt(at(10), at(10, 5), { turn: 0, ended: 'succeeded' }), attempt(at(10, 11), end, { turn: 1, ended: end ? 'succeeded' : null })],
    null,
    end ? { phase: 'input-required' } : {},
  );

test("a gate approved on a try that answered an earlier try's session waited from the end of that answer's turn", () => {
  const r = answered({ try: 2, at: at(10, 29) });
  const tl = timeline(r, new Map([['T', held()]]));
  const [one, two] = tl.steps.ask;
  assert.equal(two.session, null, 'the answered try has no session of its own');
  assert.equal(tryEndOf(two), at(10, 20));
  assert.equal(gateWaitOf(r, tl, ASK, two), 9 * MIN);
  assert.equal(gateWaitOf(r, tl, ASK, one), null, 'the approval names try 2');
});

test("the opposite order: an approval that names the try owning the session waits from the session's end, as it did", () => {
  const r = answered({ try: 1, at: at(10, 29) });
  const tl = timeline(r, new Map([['T', held()]]));
  const [one, two] = tl.steps.ask;
  assert.equal(tryEndOf(one), one.session!.endedAt);
  assert.equal(gateWaitOf(r, tl, ASK, one), 9 * MIN);
  assert.equal(gateWaitOf(r, tl, ASK, two), null);
});

test("REFUSED: a recheck's try waits from its check's end, and an answered try whose turn has not ended has no wait", () => {
  const rechecked = {
    ...run({ ask: { taskId: 'T', check: { taskId: 'c2' }, tries: [{ taskId: 'T', check: { taskId: 'c1' }, cause: 'recheck' }] } }),
    approvals: [{ step: 'ask', try: 2, at: at(11) }],
  } as RepositoryRun;
  const views = new Map([
    ['T', task([attempt(at(10), at(10, 5))])],
    ['c1', task([attempt(at(10, 5), at(10, 10))], 'failed')],
    ['c2', task([attempt(at(10, 40), at(10, 45))])],
  ]);
  const tl = timeline(rechecked, views);
  assert.equal(tl.steps.ask[1].turn, undefined, 'a recheck ran no turn');
  assert.equal(gateWaitOf(rechecked, tl, ASK, tl.steps.ask[1]), 15 * MIN);
  const running = answered({ try: 2, at: at(10, 29) });
  const during = timeline(running, new Map([['T', held(null)]]));
  assert.equal(tryEndOf(during.steps.ask[1]), null);
  assert.equal(gateWaitOf(running, during, ASK, during.steps.ask[1]), null, 'not a wait from the first turn, which ended earlier');
});
