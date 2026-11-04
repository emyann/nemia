/**
 * `capLeft`: the spend cap a continuation of a parked job is handed, its turn's cap less what the parked attempts it continues spent;
 * and the two the engine writes by it: a continuation's spawn config (`continuedCap`) and a parked end (`parkedEnd`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capLeft, continuedCap, parkedEnd } from './cap.ts';
import { fold, type Event, type Usage } from './domain.ts';
import type { HarnessArgs } from '../harness/args.ts';

const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();
const TASK = 't-1';

/** Attempt `n`, ended as said: `parked` or not, having cost `costUsd` where its runner priced it. */
const ran = (n: number, end: { parked?: boolean; costUsd?: number; usage?: false }): Event[] => {
  const usage: Usage | undefined = end.usage === false ? undefined : end.costUsd === undefined ? {} : { costUsd: end.costUsd };
  return [
    { kind: 'starting', at: at(n * 10), attempt: n },
    { kind: 'spawned', at: at(n * 10 + 1), attempt: n },
    {
      kind: 'ended',
      at: at(n * 10 + 2),
      attempt: n,
      sessionId: `s${n}`,
      observed: 'failed',
      reason: 'harness',
      nativeId: 'n1',
      ...(usage ? { usage } : {}),
      ...(end.parked ? { parked: {} } : {}),
    },
  ];
};
const filed = (config?: HarnessArgs): Event => ({
  kind: 'filed',
  at: at(0),
  brief: 'b',
  cwd: '/r',
  queued: false,
  ...(config ? { config } : {}),
});
const cap5 = filed({ budgetUsd: 5 });

test("capLeft: a continuation's cap is its turn's, less what the parked attempts it continues spent", async (t) => {
  const rows: [string, Event[], number, number | undefined][] = [
    ['no cap given', [filed(), ...ran(1, { parked: true, costUsd: 2 })], 2, undefined],
    ['a first attempt, nothing continued', [cap5], 1, 5],
    ['one parked attempt that spent $2 of $5', [cap5, ...ran(1, { parked: true, costUsd: 2 })], 2, 3],
    ['two parked in a row, summed', [cap5, ...ran(1, { parked: true, costUsd: 2 }), ...ran(2, { parked: true, costUsd: 1.5 })], 3, 1.5],
    ['a parked attempt whose cost is unknown counts 0', [cap5, ...ran(1, { parked: true })], 2, 5],
    ['a parked attempt that measured nothing counts 0', [cap5, ...ran(1, { parked: true, usage: false })], 2, 5],
    ['the run stops at an end that was not a park', [cap5, ...ran(1, { costUsd: 4 }), ...ran(2, { parked: true, costUsd: 1 })], 3, 4],
    ['an end that was not a park is continued by nothing', [cap5, ...ran(1, { costUsd: 4 })], 2, 5],
    ['a cap spent whole leaves 0, never below', [cap5, ...ran(1, { parked: true, costUsd: 7 })], 2, 0],
  ];
  for (const [name, events, attempt, left] of rows)
    await t.test(name, () => {
      assert.equal(capLeft(fold(TASK, events), attempt), left);
    });

  await t.test("a later turn takes its input's cap, and its run does not reach back into the turn before", () => {
    const events: Event[] = [
      { ...cap5, holdOpen: true } as Event,
      ...ran(1, { parked: true, costUsd: 1 }),
      { kind: 'input', at: at(100), text: 'more', config: { budgetUsd: 3 } },
      { kind: 'starting', at: at(110), attempt: 2 },
      { kind: 'spawned', at: at(111), attempt: 2 },
      {
        kind: 'ended',
        at: at(112),
        attempt: 2,
        sessionId: 's2',
        observed: 'failed',
        reason: 'harness',
        nativeId: 'n1',
        usage: { costUsd: 2 },
        parked: {},
      },
    ];
    const state = fold(TASK, events);
    assert.equal(capLeft(state, 3), 1, "turn 1's $3 less attempt 2's $2, attempt 1 being turn 0's");
    assert.equal(capLeft(state, 2), 3, 'attempt 2 starts turn 1, continuing nothing of it');
  });
});

test('continuedCap and parkedEnd: a continuation is handed its cap left, and a park that spent it is no park', async (t) => {
  const started = (n: number): Event[] => [{ kind: 'starting', at: at(n * 10), attempt: n }];
  const rows: [string, () => unknown, unknown][] = [
    [
      'a continuation of a parked attempt: its config with the cap left',
      () => continuedCap(fold(TASK, [cap5, ...ran(1, { parked: true, costUsd: 2 }), ...started(2)]), 2, { budgetUsd: 5, model: 'm' }),
      { config: { budgetUsd: 3, model: 'm' } },
    ],
    [
      'an attempt that continues no park keeps its own config',
      () => continuedCap(fold(TASK, [cap5, ...ran(1, { costUsd: 2 }), ...started(2)]), 2, { budgetUsd: 5 }),
      {},
    ],
    ['a first attempt keeps its own config', () => continuedCap(fold(TASK, [cap5, ...started(1)]), 1, { budgetUsd: 5 }), {}],
    [
      'a continuation with no cap keeps its own config',
      () => continuedCap(fold(TASK, [filed(), ...ran(1, { parked: true, costUsd: 2 }), ...started(2)]), 2, undefined),
      {},
    ],
    ['an end that was no park says nothing of one', () => parkedEnd(fold(TASK, [cap5, ...started(1)]), 1, { usage: { costUsd: 9 } }), {}],
    [
      'a park with cap left is a park',
      () => parkedEnd(fold(TASK, [cap5, ...started(1)]), 1, { parked: { calling: { tool: 'Bash', since: at(5) } }, usage: { costUsd: 2 } }),
      { parked: { calling: { tool: 'Bash', since: at(5) } } },
    ],
    [
      'a park with no cap is a park',
      () => parkedEnd(fold(TASK, [filed(), ...started(1)]), 1, { parked: {}, usage: { costUsd: 9 } }),
      { parked: {} },
    ],
    [
      'a park that spent the cap whole is `limit: budget`, and no park',
      () => parkedEnd(fold(TASK, [cap5, ...started(1)]), 1, { parked: {}, usage: { costUsd: 5 } }),
      { limit: 'budget' },
    ],
    [
      'a continuation that spent what its parked attempts left is `limit: budget`',
      () => parkedEnd(fold(TASK, [cap5, ...ran(1, { parked: true, costUsd: 3 }), ...started(2)]), 2, { parked: {}, usage: { costUsd: 2 } }),
      { limit: 'budget' },
    ],
  ];
  for (const [name, asked, says] of rows) await t.test(name, () => assert.deepEqual(asked(), says));
});
