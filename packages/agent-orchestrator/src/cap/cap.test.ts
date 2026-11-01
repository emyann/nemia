/**
 * The cap on runs in flight (`WF_MAX_RUNS`), pure: what a run asks of it on a pass (`slotNeed`), whether its roots are filed
 * (`runAdmitted`), the order a pass admits runs in (`admissionOrder`) and the runs it holds between passes (`heldRuns`), and the words it
 * is said in (`slotWord`, `ceilingLines`, and `listing` handed a slot). One table per function. The cap over a whole store, as the tick
 * and `nemia ls` judge it, is the story of `test/queue-store.test.ts`; `slotsOf` reading the engine once is `test/slots.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run, TaskPhase } from '../record/record.ts';
import type { RepositoryRun } from '../run.ts';
import type { Workflow } from '../step/step.ts';
import { assess } from '../tick/assess.ts';
import { listing, type ListedPhase } from '../list/list.ts';
import { admissionOrder, ceilingLines, heldRuns, runAdmitted, slotNeed, slotWord } from './cap.ts';
import { phases, run, step, STEPS } from '../../test/assessed.ts';

const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const CHECKED: Workflow[] = [{ ...step('implement'), check: 'npm test' }, step('review', ['implement'])];
/** `implement` filed, its check filed under `checkId`. */
const withCheck = (checkId: string, extra: Partial<RepositoryRun> = {}) =>
  run({}, { steps: { implement: { taskId: 't1', check: { taskId: checkId } }, review: { taskId: null } }, ...extra });
/** A watcher's workflow: one step that takes no slot. */
const WATCHING = [{ name: 'supervise', after: [], body: 'x', slot: 'none' } as Workflow];

/** What `r` asks of the cap with its tasks in `p`, as `steps` say (none: every run counted), the runs it waits on landed or not. */
const need = (r: Run, p: Record<string, TaskPhase>, o: { landed?: boolean; steps?: readonly Workflow[]; wf?: Workflow[] } = {}) =>
  slotNeed(r, phases(p), assess(o.wf ?? STEPS, r, phases(p), signedDone, asked), () => o.landed ?? true, o.steps);

test('`slotNeed`: in flight while a task is filed and not settled, or a started run files something; wants a slot with nothing filed and a root ready', async (t) => {
  const fresh = run({ implement: null, review: null });
  const running = run({ implement: 't1', review: null });
  const waits = run({ implement: null, review: null }, { after: ['a-1x2y'] });
  const rows: Array<[string, () => { inFlight: boolean; wants: boolean }, { inFlight: boolean; wants: boolean }]> = [
    ['filed, waiting for a session', () => need(running, { t1: 'pending' }), { inFlight: true, wants: false }],
    ['running', () => need(running, { t1: 'running' }), { inFlight: true, wants: false }],
    ['between two steps: review is filed on this pass', () => need(running, { t1: 'succeeded' }), { inFlight: true, wants: false }],
    [
      'finished',
      () => need(run({ implement: 't1', review: 't2' }), { t1: 'succeeded', t2: 'succeeded' }),
      { inFlight: false, wants: false },
    ],
    ['waiting on a person', () => need(running, { t1: 'failed' }), { inFlight: false, wants: false }],
    ['a check running', () => need(withCheck('c1'), { t1: 'succeeded', c1: 'running' }, { wf: CHECKED }), { inFlight: true, wants: false }],
    [
      'cancelled, and still being stopped',
      () => need(run({ implement: 't1', review: null }, CANCELLED), { t1: 'running' }),
      { inFlight: true, wants: false },
    ],
    [
      'cancelled, and stopped',
      () => need(run({ implement: 't1', review: null }, CANCELLED), { t1: 'stopped' }),
      { inFlight: false, wants: false },
    ],
    ['nothing filed, a root ready', () => need(fresh, {}), { inFlight: false, wants: true }],
    [
      'called off before its first pass',
      () => need(run({ implement: null, review: null }, CANCELLED), {}),
      { inFlight: false, wants: false },
    ],
    ['waiting on a run: it counts once it is filed', () => need(waits, {}, { landed: false }), { inFlight: false, wants: false }],
    ['once that run has landed', () => need(waits, {}, { landed: true }), { inFlight: false, wants: true }],
    [
      '`slot: none`: a running watcher is never in flight',
      () => need(running, { t1: 'running' }, { steps: WATCHING }),
      { inFlight: false, wants: false },
    ],
    ['`slot: none`: a fresh watcher waits for nothing', () => need(fresh, {}, { steps: WATCHING }), { inFlight: false, wants: false }],
    [
      'steps that say nothing count as they did',
      () => need(running, { t1: 'running' }, { steps: [{ name: 'implement', after: [], body: 'x' }] }),
      { inFlight: true, wants: false },
    ],
  ];
  for (const [name, got, want] of rows) await t.test(name, () => assert.deepEqual(got(), want));
});

test('`runAdmitted`: the roots of a run with nothing filed only while fewer runs are in flight than the cap — never a run that has started', async (t) => {
  const fresh = run({ implement: null, review: null });
  const rows: Array<[string, () => boolean, boolean]> = [
    ['REFUSED: 2 of 2 in flight, held', () => runAdmitted(fresh, { inFlight: 2, cap: 2 }), false],
    ['REFUSED: 3 of 2 in flight, held', () => runAdmitted(fresh, { inFlight: 3, cap: 2 }), false],
    ['1 of 2 in flight', () => runAdmitted(fresh, { inFlight: 1, cap: 2 }), true],
    ['cap 0: no cap', () => runAdmitted(fresh, { inFlight: 5, cap: 0 }), true],
    ['advance called outside a tick', () => runAdmitted(fresh, undefined), true],
    ['a run that has started is never held', () => runAdmitted(run({ implement: 't1', review: null }), { inFlight: 9, cap: 2 }), true],
    [
      'nor one a round moved behind',
      () =>
        runAdmitted(
          run(
            { implement: null, review: null },
            { steps: { implement: { taskId: null, tries: [{ taskId: 't1', cause: 'round' }] }, review: { taskId: null } } },
          ),
          { inFlight: 2, cap: 2 },
        ),
      true,
    ],
    ['`slot: none`: its roots are filed at a full cap', () => runAdmitted(fresh, { inFlight: 2, cap: 2 }, WATCHING), true],
  ];
  for (const [name, got, want] of rows) await t.test(name, () => assert.equal(got(), want));
});

test('`admissionOrder`: by createdAt, then id', () => {
  const at = (h: number) => `2026-09-16T0${h}:00:00.000Z`;
  const runs = [
    { id: 'c-young', createdAt: at(5) },
    { id: 'a-busy', createdAt: at(1) },
    { id: 'b-old', createdAt: at(3) },
    { id: 'b-old-twin', createdAt: at(3) },
    { id: 'z-after', createdAt: at(0) },
    { id: 'y-done', createdAt: at(0) },
  ];
  assert.deepEqual(
    admissionOrder(runs).map((r) => r.id),
    ['y-done', 'z-after', 'a-busy', 'b-old', 'b-old-twin', 'c-young'],
  );
});

test('`heldRuns`: every run in flight counted, then each that wants a slot admitted oldest first and counted for the next, the rest held at the count', async (t) => {
  const at = (h: number) => `2026-09-16T0${h}:00:00.000Z`;
  const runs = [
    { id: 'c-young', createdAt: at(5), inFlight: false, wants: true },
    { id: 'a-busy', createdAt: at(1), inFlight: true, wants: false },
    { id: 'b-old', createdAt: at(3), inFlight: false, wants: true },
    { id: 'b-old-twin', createdAt: at(3), inFlight: false, wants: true },
    { id: 'z-after', createdAt: at(0), inFlight: false, wants: false },
    { id: 'y-done', createdAt: at(0), inFlight: false, wants: false },
  ];
  const watcher = { id: 'watcher', createdAt: '2026-09-17T01:00:00.000Z', inFlight: false, wants: false };
  const work = { id: 'work', createdAt: '2026-09-17T02:00:00.000Z', inFlight: false, wants: true };
  const rows: Array<[string, () => Map<string, unknown>, Array<[string, unknown]>]> = [
    [
      'b-old admitted into the one free slot, and counted',
      () => heldRuns(runs, 2),
      [
        ['b-old-twin', { inFlight: 2, cap: 2 }],
        ['c-young', { inFlight: 2, cap: 2 }],
      ],
    ],
    [
      'a cap of 1, already full',
      () => heldRuns(runs, 1),
      [
        ['b-old', { inFlight: 1, cap: 1 }],
        ['b-old-twin', { inFlight: 1, cap: 1 }],
        ['c-young', { inFlight: 1, cap: 1 }],
      ],
    ],
    ['room for all', () => heldRuns(runs, 4), []],
    ['no cap', () => heldRuns(runs, 0), []],
    ['a watcher holds no slot, so the cap holds nobody on its account', () => heldRuns([watcher, work], 1), []],
    [
      'counted, it would have held the work',
      () => heldRuns([{ ...watcher, inFlight: true }, work], 1),
      [['work', { inFlight: 1, cap: 1 }]],
    ],
  ];
  for (const [name, got, want] of rows) await t.test(name, () => assert.deepEqual([...got()], want));
});

test('`slotWord`: a run the cap holds, with the count in flight', () => {
  assert.equal(slotWord({ inFlight: 2, cap: 2 }), 'waiting for a run slot (2 of 2 in flight)');
});

test('`ceilingLines`: sessions at work per pool, and runs in flight — `no cap` when none', async (t) => {
  await t.test('no cap on runs', () =>
    assert.deepEqual(ceilingLines({ sessions: 4, runs: 0 }), [
      'sessions at work per pool: at most 4 at once — claude, codex, checks each a pool (WF_MAX_CONCURRENT)',
      'runs in flight: no cap (WF_MAX_RUNS)',
    ]),
  );
  await t.test('a cap of 2', () =>
    assert.equal(
      ceilingLines({ sessions: 2, runs: 2 })[1],
      'runs in flight: at most 2 at once — a run with nothing filed waits for a slot, oldest first (WF_MAX_RUNS)',
    ),
  );
});

test('`listing` handed a run slot: the roots of a held run say `waiting for a run slot` where `waiting` would be — never a run that started, was called off or waits on a run', async (t) => {
  const slot = { inFlight: 2, cap: 2 };
  const shown =
    (m: Record<string, ListedPhase>) =>
    (id: string): ListedPhase =>
      m[id] ?? 'unknown';
  const listed = (r: Run, p: Record<string, ListedPhase>, waits: Array<{ run: string }> = [], given = true) =>
    listing({
      steps: STEPS,
      run: r,
      phaseOf: shown(p),
      closeoutOf: () => undefined,
      askedCloseout: asked,
      ...(given
        ? {
            verdictOf: () => undefined,
            asks: [],
            roundAsks: [],
            answers: [],
            waits,
            saidTo: () => 0,
            spendOf: () => undefined,
            slot,
          }
        : {}),
    });
  const fresh = run({ implement: null, review: null });
  await t.test('held: its root waits for a slot, what waits on the root still says waiting', () => {
    const held = listed(fresh, {});
    assert.deepEqual(
      [held.steps.map((s) => s.message), held.slot, held.waitingOnYou],
      [['waiting for a run slot (2 of 2 in flight)', 'pending'], slot, []],
    );
  });
  await t.test('no slot handed, no key', () => {
    const plain = listed(fresh, {}, [], false);
    assert.equal(Object.hasOwn(plain.steps[0], 'slot'), false);
    assert.equal(Object.hasOwn(plain, 'slot'), false);
  });
  await t.test('a run that started', () => {
    const started = listed(run({ implement: 't1', review: null }), { t1: 'running' });
    assert.deepEqual([started.steps[0].message, started.slot], ['running', undefined]);
  });
  await t.test('a run called off', () => {
    const cancelled = listed(run({ implement: null, review: null }, CANCELLED), {});
    assert.deepEqual([cancelled.steps[0].message, cancelled.slot], ['pending', undefined]);
  });
  await t.test('a run waiting on a run', () => {
    const waits = listed(run({ implement: null, review: null }, { after: ['a-1x2y'] }), {}, [{ run: 'a-1x2y' }]);
    assert.deepEqual([waits.steps[0].message, waits.slot], ['waiting on a-1x2y', undefined]);
  });
});
