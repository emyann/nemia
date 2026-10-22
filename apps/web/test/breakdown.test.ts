/**
 * A waiting run's breakdowns (src/lib/breakdown.ts): each adds up to its tile over the light answer's own numbers, its last line for
 * the rest included and absent when the rest is nothing, and what the rows say adds up as the tile says it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { openRunsQuery, type WaitingRun } from '../src/lib/api/runs.ts';
import {
  CLOCK_REST,
  clockBreakdown,
  COST_REST,
  costBreakdown,
  shared,
  TOKENS_REST,
  tokensBreakdown,
  tokensSaid,
  type Breakdown,
} from '../src/lib/breakdown.ts';
import { presentWait, sinceWords } from '../src/lib/runWords.ts';
import { summary, waitingRun } from './run-fixtures.ts';

const [S, M] = [1_000, 60_000];

const spent = (usd: number) => ({ usd, measured: 1, unmeasured: 0, said: `$${usd.toFixed(2)}` });

/** A run at its last gate, as the api answers it: a clock whose five parts add up, a cost beyond its steps', tokens beyond their kinds. */
const answered = (): WaitingRun =>
  waitingRun(
    summary(
      [
        ['design', 'verified ✓'],
        ['implement', 'verified ✓'],
        ['land', 'awaiting approval'],
      ],
      {
        waitingOnYou: ['land'],
        cost: spent(5.63),
        tokens: {
          total: 4_103_000,
          input: 4_029_086,
          output: 73_900,
          cacheRead: 3_600_000,
          cacheWrite: 429_000,
          uncached: 86,
          measured: 5,
          unmeasured: 0,
          said: '4.10M tokens',
          split: '',
        },
      },
    ),
    {
      wallMs: 27 * M + 30 * S,
      clock: {
        wallMs: 27 * M + 30 * S,
        sessionsMs: 16 * M + 40 * S,
        checksMs: 6 * M + 40 * S,
        personMs: 2 * M + 40 * S,
        slotMs: 50 * S,
        restMs: 40 * S,
      },
      stepCosts: [
        { step: 'design', cost: spent(1.884) },
        { step: 'implement', cost: spent(3.614) },
        { step: 'land', cost: null },
      ],
    },
  );

const AS_OF = '2026-10-12T12:00:00.000Z';

/** `run` as the board reads it, decoded through the light answer's schema; the run at its last gate where none is given. */
async function decoded(run: WaitingRun = answered()): Promise<WaitingRun> {
  const before = globalThis.fetch;
  const open = { asOf: AS_OF, counts: { waiting: 1, inFlight: 0, finished: 0 }, waiting: [run], inFlight: [] };
  globalThis.fetch = async () => new Response(JSON.stringify(open), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = new QueryClient();
  try {
    return (await client.fetchQuery(openRunsQuery())).waiting[0];
  } finally {
    client.clear();
    globalThis.fetch = before;
  }
}

const sum = (breakdown: Breakdown): number => breakdown.rows.reduce((total, row) => total + row.amount, 0);
const whats = (breakdown: Breakdown): string[] => breakdown.rows.map((row) => row.what);

test('REFUSED: a breakdown that does not add up to its tile: the clock, the cost and the tokens, each with its last line for the rest', async () => {
  const run = await decoded();
  const clock = clockBreakdown(run.clock!, '17m', '13:11');
  assert.equal(sum(clock), run.clock!.wallMs, "the clock's rows add up to the wall time");
  assert.deepEqual(whats(clock), ['Sessions at work', 'Checks running', 'Waiting on you', 'Queued for a slot', CLOCK_REST]);
  assert.equal(clock.rows.at(-1)!.amount, 40 * S, 'the last line is the rest');

  const cost = costBreakdown(run.cost!, run.stepCosts!);
  assert.ok(Math.abs(sum(cost) - run.cost!.usd) < 1e-9, `the cost's rows add up to the run's cost: ${sum(cost)}`);
  assert.deepEqual(whats(cost), ['design', 'implement', 'land', COST_REST]);

  const tokens = tokensBreakdown(run.tokens!);
  assert.equal(sum(tokens), run.tokens!.total, "the tokens' rows add up to the total");
  assert.deepEqual(whats(tokens), ['Written to the cache', 'Uncached, in', 'Out', 'Read back from the cache', TOKENS_REST]);
  assert.equal(tokens.rows.at(-1)!.amount, 14, 'the last line is what no kind counts');
});

test('a run at its second gate: the card says the present wait, and the clock’s row every wait on a person summed', async () => {
  const model = answered();
  const waitingSince = new Date(Date.parse(AS_OF) - 3 * M - 20 * S).toISOString();
  const clock = { ...model.clock!, wallMs: 50 * M, personMs: 25 * M + 10 * S };
  const run = await decoded({ ...model, wallMs: 50 * M, clock, waitingSince });
  assert.equal(run.waitingSince, waitingSince, 'the schema keeps the instant');
  assert.equal(presentWait(run, new Date(AS_OF)), '3m');
  const row = clockBreakdown(run.clock!, '25m', '11:10').rows.find((r) => r.what === 'Waiting on you')!;
  assert.equal(row.amount, 25 * M + 10 * S);
  assert.equal(row.said, '25m');
});

test('the last line is absent when the rest is nothing', async () => {
  const run = await decoded();
  const clock = clockBreakdown({ ...run.clock!, wallMs: run.clock!.wallMs - 40 * S, restMs: 0 }, '17m', '13:11');
  assert.deepEqual(whats(clock), ['Sessions at work', 'Checks running', 'Waiting on you', 'Queued for a slot']);
  assert.equal(sum(clock), run.clock!.wallMs - 40 * S);
  const cost = costBreakdown(spent(1.884 + 3.614), run.stepCosts!);
  assert.deepEqual(whats(cost), ['design', 'implement', 'land']);
  const tokens = tokensBreakdown({ ...run.tokens!, total: run.tokens!.total - 14 });
  assert.equal(whats(tokens).includes(TOKENS_REST), false);
  assert.equal(sum(tokens), run.tokens!.total - 14);
});

/** The whole minutes a clock's row says, none for `none` and `under 1m`. */
const minutesOf = (said: string): number => (/^\d+m$/.test(said) ? Number(said.slice(0, -1)) : 0);

/** The cents a cost's row says, none for a step with none. */
const centsOf = (said: string): number => (said.startsWith('$') ? Math.round(Number(said.slice(1)) * 100) : 0);

test('REFUSED: rows that say a minute or a cent less than their tile: what plain rounding down would lose is shared out', async () => {
  const run = await decoded();
  const clock = clockBreakdown(run.clock!, '17m', '13:11');
  assert.equal(sinceWords(run.clock!.wallMs), '27m', 'the tile');
  assert.deepEqual(
    clock.rows.map((row) => row.said),
    ['17m', '7m', '2m', '1m', 'under 1m'],
    'floored they would say 16, 6, 2, 0 and 0, three minutes short of the tile',
  );
  assert.equal(
    clock.rows.reduce((total, row) => total + minutesOf(row.said), 0),
    27,
  );
  const cost = costBreakdown(run.cost!, run.stepCosts!);
  assert.deepEqual(
    cost.rows.map((row) => row.said),
    ['$1.89', '$3.61', 'none measured', '$0.13'],
  );
  assert.equal(
    cost.rows.reduce((total, row) => total + centsOf(row.said), 0),
    563,
    'floored they would say 188, 361 and 13, a cent short: the first of the two that lost most takes it',
  );
  assert.deepEqual(shared([1.5, 1.5, 1], 1, 4), [2, 1, 1], 'among equals the earliest takes the unit owed');
});

test('a part of nothing says so, a step nothing was measured of says so, and the headline and the note are plain', async () => {
  const run = await decoded();
  const clock = clockBreakdown(
    { wallMs: 6 * M, sessionsMs: 6 * M - 20 * S, checksMs: 0, personMs: 20 * S, slotMs: 0, restMs: 0 },
    '5m',
    'Tue 13:32',
  );
  assert.deepEqual(
    clock.rows.map((row) => [row.said, row.none]),
    [
      ['6m', false],
      ['none', true],
      ['under 1m', false],
      ['none', true],
    ],
  );
  assert.equal(clock.head, '5m', 'the head is verbatim the words the tile or the cell shows, never a figure of its own');
  assert.equal(clock.foot, 'Wall time 6m, from Tue 13:32.', 'the rows add up to the foot, which the head is a part of');
  const cost = costBreakdown(run.cost!, run.stepCosts!);
  assert.equal(cost.head, '$5.63 so far, by step');
  assert.deepEqual(cost.rows[2], { what: 'land', amount: 0, said: 'none measured', none: true });
  assert.equal(cost.foot, '');
  assert.match(costBreakdown({ ...run.cost!, unmeasured: 1 }, run.stepCosts!).foot, /no cost on it/);
  const tokens = tokensBreakdown(run.tokens!);
  assert.equal(tokens.head, '4.10M counted, 503k of them new');
  assert.deepEqual(
    tokens.rows.map((row) => row.said),
    ['429k', '86', '73.9k', '3.60M', '14'],
  );
  assert.deepEqual([0, 999, 1_000, 73_900, 999_499, 999_500, 4_103_000].map(tokensSaid), [
    '0',
    '999',
    '1.00k',
    '73.9k',
    '999k',
    '1.00M',
    '4.10M',
  ]);
});

test('tokens a session gave no parts of are counted in and out, and still add up', async () => {
  const run = await decoded();
  const whole = { ...run.tokens!, cacheRead: null, cacheWrite: null, uncached: null };
  const tokens = tokensBreakdown(whole);
  assert.deepEqual(whats(tokens), ['In', 'Out', TOKENS_REST]);
  assert.equal(sum(tokens), whole.total);
  assert.equal(tokens.head, '4.10M counted');
});

test("a cost's preview heads with the dollars its tokens are, and the rows still add up to the total", async () => {
  const run = await decoded();
  const tokens = tokensBreakdown(run.tokens!, '$5.63');
  assert.equal(tokens.head, '$5.63 for 4.10M tokens, 503k of them new');
  assert.equal(sum(tokens), run.tokens!.total, "the tokens' rows add up to the total, a cost given or not");
  assert.equal(tokensBreakdown({ ...run.tokens!, cacheRead: null }, '$5.63').head, '$5.63 for 4.10M tokens');
});

test('REFUSED: a total read as whole when a session measured no tokens: the head says ≥ and the foot says why', async () => {
  const run = await decoded();
  const short = tokensBreakdown({ ...run.tokens!, unmeasured: 1 }, '$5.63');
  assert.equal(short.head, '$5.63 for ≥4.10M tokens, ≥503k of them new');
  assert.match(short.foot, /measured no tokens/);
  assert.match(tokensBreakdown({ ...run.tokens!, unmeasured: 1 }).head, /^≥4\.10M counted/);
  const whole = tokensBreakdown(run.tokens!, '$5.63');
  assert.doesNotMatch(whole.head, /≥/);
  assert.doesNotMatch(whole.foot, /measured no tokens/);
});
