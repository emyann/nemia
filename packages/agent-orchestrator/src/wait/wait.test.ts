/**
 * What a run waits on before its steps are filed, as tables of the pure functions that judge it: readiness under `after` (`runReady`,
 * `waitingOn`, `hasStarted`, `gated`), why a parent may never succeed and its words (`waitsOf`, `waitWord`, `waitAdvice`), the waits a
 * listing says, what `nemia start --after` refuses
 * (`afterRefusal`), where a wait stands (`waitStanding`), and a person's hold in words (`holdsOf`, `holdWord`, `holdAdvice`,
 * `heldLater`). Pure: no disk, no engine.
 *
 * The same waits told over a store, the test place and the engine's stand-in — a diamond plan, a parent that will not land, context
 * without a wait — are in `test/waiting.test.ts`; a hold over a store in `test/hold.test.ts`.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  afterRefusal,
  gated,
  hasStarted,
  holdAdvice,
  holdsOf,
  holdWord,
  runReady,
  waitAdvice,
  waitingOn,
  waitsOf,
  waitStanding,
  waitWord,
} from './wait.ts';
import type { ParentRun, Wait } from './wait.ts';
import { tipBranches, tipsSeen } from '../branches/branches.ts';
import { listing } from '../list/list.ts';
import { assess } from '../tick/assess.ts';
import { heldLater } from '../round/round.ts';
import type { RepositoryRun, Run, TaskPhase } from '../record/record.ts';
import { aRead, listingInput, namesFor, phases, run, step, STEPS } from '../../test/assessed.ts';

/** A `released` that answers yes for these runs, and keeps every run it was asked about. */
const releasedOnly = (...ids: string[]) => {
  const asked: string[] = [];
  return {
    asked,
    landed: (id: string) => {
      asked.push(id);
      return ids.includes(id);
    },
  };
};

/** Another run's record, as a parent's. */
const record = (id: string, rest: Partial<RepositoryRun> = {}) => run({ implement: 'x' }, { id, ...rest });

describe('readiness under `after`: a run is ready once every parent released its waiters, and a run that started, or was called off, reads none', () => {
  test('a record from before there was an `after` reads as ready, and so does one started without one — no parent read', () => {
    const legacy = run({ implement: null, review: null });
    assert.equal(Object.hasOwn(legacy, 'after'), false);
    const { asked, landed } = releasedOnly();
    assert.equal(runReady(legacy, landed), true);
    assert.equal(runReady(run({ implement: null, review: null }, { after: [] }), landed), true);
    assert.deepEqual(asked, []);
    assert.deepEqual(
      assess(aRead(STEPS, legacy, { phaseOf: phases({}) })).ready,
      ['implement'],
      'and its first step is ready exactly as before',
    );
  });
  test('REFUSED: a parent that has not released its waiters is not ready, pass after pass — each is named in order', () => {
    const child = run({ implement: null, review: null }, { after: ['a-1', 'b-2'] });
    for (let pass = 0; pass < 3; pass++) assert.equal(runReady(child, releasedOnly().landed), false);
    assert.deepEqual(waitingOn(child, releasedOnly().landed), ['a-1', 'b-2']);
    assert.equal(runReady(child, releasedOnly('a-1').landed), false, 'one of two is not enough');
    assert.deepEqual(waitingOn(child, releasedOnly('a-1').landed), ['b-2']);
    assert.equal(runReady(child, releasedOnly('a-1', 'b-2').landed), true);
  });
  test('a run that has started is never gated again: its parents are not read — nor in a round that left no step filed', () => {
    const { asked, landed } = releasedOnly();
    assert.equal(runReady(run({ implement: 't1', review: null }, { after: ['a-1'] }), landed), true);
    const between = run({ implement: null, review: null }, { after: ['a-1'] });
    between.steps.implement = { taskId: null, tries: [{ taskId: 't1', cause: 'round' }] };
    assert.equal(hasStarted(between), true, 'between a round and the pass that files it again, no step has a task, and it has started');
    assert.equal(runReady(between, landed), true);
    assert.deepEqual(asked, []);
    assert.equal(hasStarted(run({ implement: null, review: null }, { after: ['a-1'] })), false);
    assert.deepEqual(
      [gated(between), gated(run({ implement: null, review: null }, { after: ['a-1'] })), gated(run({ implement: null }))],
      [false, true, false],
    );
  });
  test('a cancelled run waits on nothing, and reads no parent: it files nothing anyway', () => {
    const { asked, landed } = releasedOnly();
    assert.deepEqual(waitingOn(run({ implement: null }, { after: ['a-1'], cancelledAt: '2026-09-14T09:00:00Z' }), landed), []);
    assert.deepEqual(asked, []);
  });
});

describe('`waitsOf` says why a parent may never succeed — no such run, cancelled, failed — and `waitWord` and `waitAdvice` say it', () => {
  const child = run({ implement: null, review: null }, { id: 'c-1', after: ['a-1', 'b-2', 'x-9', 'f-3', 'ok-4'] });
  let waits!: Wait[];
  beforeAll(() => {
    waits = waitsOf(child, (id) => parents[id] ?? { standing: { kind: 'yours', why: 'missing' } });
  });
  const at = '2026-09-14T10:00:00Z';
  const parents: Record<string, ParentRun> = {
    'a-1': { record: record('a-1'), standing: { kind: 'waiting', on: 'running' } },
    'b-2': { record: record('b-2', { cancelledAt: at }), standing: { kind: 'yours', why: 'cancelled' } },
    'f-3': { record: record('f-3'), standing: { kind: 'yours', why: 'failed' } },
    'ok-4': { record: record('ok-4'), standing: { kind: 'released', by: 'succeeded' } },
  };
  test('each wait that has not released it, in the order `after` names them', () => {
    assert.deepEqual(waits, [{ run: 'a-1' }, { run: 'b-2', cancelledAt: at }, { run: 'x-9', missing: true }, { run: 'f-3', failed: true }]);
  });
  test('`waitWord` names each, and why it may never succeed', () => {
    assert.equal(waitWord(waits), 'waiting on a-1, b-2 (cancelled), x-9 (no such run), f-3 (failed)');
  });
  test('`waitAdvice` says why each never succeeds, and the ways out: retry or release it, cancel this run, or start without it', () => {
    assert.equal(
      waitAdvice(child, waits),
      `b-2 was cancelled at ${at}, and a cancelled run never succeeds; the store has no run x-9; f-3 failed, and a failed run does not succeed on its own` +
        ' — yours to resolve: nemia release b-2, or nemia retry f-3, or nemia release f-3, or nemia cancel c-1, or start the work again without --after b-2 --after x-9 --after f-3',
    );
  });
  test('`waitAdvice` of parents that may still succeed: nothing to decide yet, one or two named', () => {
    assert.equal(waitAdvice(child, [{ run: 'a-1' }]), 'nothing of c-1 is filed until a-1 has succeeded; nothing to decide yet');
    assert.equal(
      waitAdvice(child, [{ run: 'a-1' }, { run: 'b-2' }]),
      'nothing of c-1 is filed until a-1 and b-2 have succeeded; nothing to decide yet',
    );
  });
});

describe('`waitStanding`: a wait on a run is released by its success or by a person, and read from no branch', () => {
  const rows: Array<[string, Parameters<typeof waitStanding>[0], ReturnType<typeof waitStanding>]> = [
    ['a run the store lacks is yours, as missing', { known: false, status: null, released: false }, { kind: 'yours', why: 'missing' }],
    ['a succeeded run releases its waiters', { known: true, status: 'succeeded', released: false }, { kind: 'released', by: 'succeeded' }],
    ['a failed run released by hand releases them', { known: true, status: 'failed', released: true }, { kind: 'released', by: 'hand' }],
    ['a failed run is yours', { known: true, status: 'failed', released: false }, { kind: 'yours', why: 'failed' }],
    ['a cancelled run is yours', { known: true, status: 'cancelled', released: false }, { kind: 'yours', why: 'cancelled' }],
    ['a run at work waits on it', { known: true, status: 'running', released: false }, { kind: 'waiting', on: 'running' }],
    ['a run whose workflow did not load is unread', { known: true, status: null, released: false }, { kind: 'waiting', on: 'unread' }],
  ];
  for (const [what, given, said] of rows) test(what, () => assert.deepEqual(waitStanding(given), said));
});

describe('`listing` puts `waiting on <run>` on each root of a waiting run, where `waiting` would be — and on none of a run called off or started', () => {
  const fan = [step('a'), step('b'), step('c', ['a', 'b'])];
  const child = run({ a: null, b: null, c: null }, { after: ['p-1'] });
  const waits: Wait[] = [{ run: 'p-1', cancelledAt: '2026-09-14T10:00:00Z' }];
  const listed = (r: Run, phase: TaskPhase, given: Wait[] | undefined) =>
    listing(
      listingInput({
        steps: fan,
        run: r,
        phaseOf: () => phase,
        closeoutOf: () => undefined,
        ...(given ? { asks: [], roundAsks: [], answers: [], waits: given } : {}),
      }),
    );
  const rows: Array<[string, Run, TaskPhase, Wait[] | undefined, string[], Wait[] | undefined]> = [
    [
      'a root says the wait, what waits on a root still says `waiting`',
      child,
      'unknown',
      waits,
      ['waiting on p-1 (cancelled)', 'waiting on p-1 (cancelled)', 'pending'],
      waits,
    ],
    [
      'without waits, the words are what they are without --after',
      child,
      'unknown',
      undefined,
      ['pending', 'pending', 'pending'],
      undefined,
    ],
    [
      'a run called off says nothing of runs it waited on, whatever it is handed',
      { ...child, cancelledAt: '2026-09-14T11:00:00Z' },
      'unknown',
      waits,
      ['pending', 'pending', 'pending'],
      [],
    ],
    [
      'nor does one that has started',
      run({ a: 't1', b: null, c: null }, { after: ['p-1'] }),
      'running',
      waits,
      ['running', 'pending', 'pending'],
      [],
    ],
  ];
  for (const [what, r, phase, given, statuses, waiting] of rows) {
    test(what, () => {
      const said = listed(r, phase, given);
      assert.deepEqual(
        said.steps.map((s) => s.message),
        statuses,
      );
      if (waiting) assert.deepEqual(said.waiting, waiting);
    });
  }
});

describe("a pass records the tips of a finished run's result branches — `tipBranches` and `tipsSeen`", () => {
  const fan = [step('a'), step('b'), step('c', ['a', 'b'])];
  const branched = (rest: Partial<RepositoryRun> = {}) => {
    const r = run({ a: 't1', b: 't2', c: 't3' }, rest);
    return { ...r, steps: Object.fromEntries(Object.entries(r.steps).map(([name, s]) => [name, { ...s, branch: `wf/r-1/${name}` }])) };
  };
  test('the result branch of a run succeeded or failed, or stopped on a person, and no other', () => {
    for (const status of ['succeeded', 'failed', 'awaiting approval', 'waiting'] as const)
      assert.deepEqual(tipBranches(branched(), fan, status), ['wf/r-1/c'], status);
  });
  test('none of a run running or cancelled, --no-worktree, or that worked on its base branch', () => {
    assert.deepEqual([tipBranches(branched(), fan, 'running'), tipBranches(branched(), fan, 'cancelled')], [[], []]);
    assert.deepEqual(tipBranches(branched({ isolate: false }), fan, 'succeeded'), []);
    const branches = branched();
    const onBase = { ...branches, steps: { ...branches.steps, c: { taskId: 't3', branch: 'main' } } };
    assert.deepEqual(tipBranches(onBase, fan, 'succeeded'), []);
  });
  test('a chain on one line: its one branch', () => {
    const chain = run(
      { implement: 't1', review: 't2' },
      { steps: { implement: { taskId: 't1', branch: 'wf/r-1/implement' }, review: { taskId: 't2', branch: 'wf/r-1/implement' } } },
    );
    assert.deepEqual(tipBranches(chain, STEPS, 'succeeded'), ['wf/r-1/implement']);
  });
  test('`tipsSeen` writes what moved, nothing when none did, and keeps a tip once its branch is gone', () => {
    const seenOnce = tipsSeen(branched(), ['wf/r-1/c'], { 'wf/r-1/c': 'aaa', 'wf/r-1/a': 'zzz' });
    assert.deepEqual(seenOnce, { 'wf/r-1/c': 'aaa' });
    assert.equal(tipsSeen(branched(), ['wf/r-1/c'], {}), undefined, 'nothing seen, nothing to write');
    const recorded = branched({ tips: seenOnce });
    assert.equal(tipsSeen(recorded, ['wf/r-1/c'], { 'wf/r-1/c': 'aaa' }), undefined, 'unchanged, so the run is not written');
    assert.equal(tipsSeen(recorded, ['wf/r-1/c'], {}), undefined, 'a branch git no longer has keeps its tip');
    assert.deepEqual(tipsSeen(recorded, ['wf/r-1/c'], { 'wf/r-1/c': 'bbb' }), { 'wf/r-1/c': 'bbb' }, 'a commit after it finished moves it');
  });
});

describe('REFUSED by name at `nemia start --after` (`afterRefusal`), read from the record alone', () => {
  const at = '2026-09-14T10:00:00Z';
  const folderRun: Run = {
    ...record('n-1'),
    place: { kind: 'folder' },
    repo: undefined,
    baseRef: undefined,
    branch: undefined,
    isolate: undefined,
    placeSkill: undefined,
  };
  const parents: Record<string, Pick<ParentRun, 'record'>> = {
    'a-1': { record: record('a-1') },
    'r-2': { record: record('r-2', { repo: '/elsewhere' }) },
    'd-3': { record: record('d-3', { isolate: false }) },
    'f-4': { record: record('f-4', { branch: 'feature' }) },
    'c-5': { record: record('c-5', { cancelledAt: at }) },
    'n-1': { record: folderRun },
  };
  const parentOf = (id: string) => parents[id] ?? {};
  const rows: Array<[string, readonly string[], string[]]> = [
    ['a run given twice', ['a-1', 'a-1'], ['--after a-1 is given twice', 'one --after']],
    ['one the store does not have', ['a-1', 'x-9'], ['--after x-9:', 'no run x-9', 'nemia ls']],
    ['a cancelled one: a cancelled run never succeeds', ['c-5'], ['--after c-5:', `c-5 was cancelled at ${at}`, 'without --after c-5']],
  ];
  for (const [what, after, facts] of rows) {
    test(what, () => namesFor(what, afterRefusal(after, parentOf), ...facts));
  }
  test('allowed: no parent, and a parent of any repository, base branch or place — a wait reads no branch', () => {
    assert.equal(afterRefusal([], parentOf), null);
    for (const id of ['a-1', 'r-2', 'd-3', 'f-4', 'n-1']) assert.equal(afterRefusal([id], parentOf), null, id);
  });
});

describe('a hold in words: `holdsOf` says what holds a run, `holdWord` and `holdAdvice` say it and what is left to a person', () => {
  const r = { id: 'r-1', branch: 'main' } as Parameters<typeof holdAdvice>[0];
  const said = { why: 'merge conflicts', by: 'operator' };
  const words: Array<[string, Wait[], Parameters<typeof holdWord>[1] | undefined, string]> = [
    ['one run', [{ run: 'a-1' }], undefined, 'held until a-1 succeeds'],
    ['two, one cancelled', [{ run: 'a-1' }, { run: 'b-2', cancelledAt: 'then' }], undefined, 'held until a-1 and b-2 (cancelled) succeed'],
    [
      'one released',
      [{ run: 'a-1', released: true }],
      undefined,
      'held until a-1 succeeds — it has succeeded or been released, and the next tick lifts the hold',
    ],
    ['none', [], undefined, 'held until a person lifts it'],
    ['the why and who, after `succeeds`', [{ run: 'a-1' }], said, 'held until a-1 succeeds (why: merge conflicts; by operator)'],
    ['a why alone', [{ run: 'a-1' }], { why: 'x' }, 'held until a-1 succeeds (why: x)'],
    ['who alone', [{ run: 'a-1' }], { by: 'operator' }, 'held until a-1 succeeds (by operator)'],
    ['a file older code wrote, with neither: the plain line', [{ run: 'a-1' }], {}, 'held until a-1 succeeds'],
    [
      'the words before the suffix of one released',
      [{ run: 'a-1', released: true }],
      said,
      'held until a-1 succeeds (why: merge conflicts; by operator) — it has succeeded or been released, and the next tick lifts the hold',
    ],
    ['the words after two', [{ run: 'a-1' }, { run: 'b-2' }], said, 'held until a-1 and b-2 succeed (why: merge conflicts; by operator)'],
    ['the words on a hold that names no run', [], said, 'held until a person lifts it (why: merge conflicts; by operator)'],
  ];
  for (const [what, waits, given, line] of words) {
    test(`holdWord: ${what}`, () => assert.equal(holdWord(waits, given), line));
  }
  const advice: Array<[string, Wait[], string]> = [
    [
      'a run that may still succeed',
      [{ run: 'a-1' }],
      'nothing of r-1 is filed, and nothing is asked of you, until a-1 has succeeded; to go on before then: nemia hold r-1 --off',
    ],
    [
      'no such run',
      [{ run: 'a-1', missing: true }],
      'the store has no run a-1 — yours to resolve: nemia hold r-1 --off, or nemia cancel r-1',
    ],
    [
      'a hold that names no run',
      [],
      'nothing of r-1 is filed, and nothing is asked of you, until a person lifts the hold; to go on: nemia hold r-1 --off',
    ],
  ];
  for (const [what, waits, line] of advice) {
    test(`holdAdvice: ${what}`, () => assert.equal(holdAdvice(r, waits), line));
  }
  test('never that the run waits on you', () => {
    for (const w of [[{ run: 'a-1' }], [{ run: 'a-1', missing: true as const }], [{ run: 'a-1', released: true as const }], []])
      assert.doesNotMatch(`${holdWord(w)} ${holdAdvice(r, w)}`, /waiting on you/);
  });
  test('`holdsOf`: one run not released is the whole of what holds it; all released, each named as released', () => {
    const held = { ...r, hold: { at: 't', until: ['a-1', 'b-2'] } } as Parameters<typeof holdsOf>[0];
    assert.deepEqual(
      holdsOf(held, (id) => ({
        record: { id } as never,
        standing: id === 'a-1' ? ({ kind: 'released', by: 'succeeded' } as const) : ({ kind: 'waiting', on: 'running' } as const),
      })),
      [{ run: 'b-2' }],
    );
    assert.deepEqual(
      holdsOf(held, (id) => ({ record: { id } as never, standing: { kind: 'released', by: 'hand' } })),
      [
        { run: 'a-1', released: true },
        { run: 'b-2', released: true },
      ],
    );
  });
  test('`heldLater` says the hold at the gate it holds back, with the why and who as `holdWord` says them', () => {
    const later = heldLater({ at: 't', until: ['a-1'], why: 'w', by: 'b' }, 'its approval');
    assert.ok(later.startsWith('held until a-1 succeeds (why: w; by b); '), later);
    assert.equal(later.replace(' (why: w; by b)', ''), heldLater({ at: 't', until: ['a-1'] }, 'its approval'));
    assert.equal(
      heldLater({ at: 't', until: ['a-1'] }, 'its approval'),
      'held until a-1 succeeds; its approval is asked once the hold lifts',
    );
  });
});
