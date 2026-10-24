/**
 * What a run waits on before its steps are filed, as tables of the pure functions that judge it: readiness under `after` (`runReady`,
 * `waitingOn`, `hasStarted`, `gated`), why a parent may never land and its words (`waitsOf`, `waitWord`, `waitAdvice`), the waits a
 * listing says, the tips a finished run's pass records (`tipBranches`, `tipsSeen`), what `nemia start --after` refuses
 * (`afterRefusal`), and a person's hold in words (`holdsOf`, `holdWord`, `holdAdvice`, `heldLater`). Pure: no disk, no engine.
 *
 * The same waits told over a store, the test place and the engine's stand-in — a diamond plan, a parent that will not land, context
 * without a wait — are in `test/waiting.test.ts`; a hold over a store in `test/hold.test.ts`.
 */
import { test } from 'node:test';
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
  waitWord,
} from './wait.ts';
import type { ParentRun, Wait } from './wait.ts';
import { tipBranches, tipsSeen } from '../branches/branches.ts';
import { listing } from '../list/list.ts';
import { assess } from '../tick/assess.ts';
import { heldLater } from '../round/round.ts';
import type { RepositoryRun, Run, TaskPhase } from '../record/record.ts';
import { namesFor, phases, run, step, STEPS } from '../../test/assessed.ts';

/** A `landed` that answers yes for these runs, and keeps every run it was asked about. */
const landedOnly = (...ids: string[]) => {
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
const record = (id: string, rest: Partial<RepositoryRun> = {}): Run => run({ implement: 'x' }, { id, ...rest });

test('readiness under `after`: a run is ready once every parent landed, and a run that started, or was called off, reads none', async (t) => {
  await t.test('a record from before there was an `after` reads as ready, and so does one started without one — no parent read', () => {
    const legacy = run({ implement: null, review: null });
    assert.equal(Object.hasOwn(legacy, 'after'), false);
    const { asked, landed } = landedOnly();
    assert.equal(runReady(legacy, landed), true);
    assert.equal(runReady(run({ implement: null, review: null }, { after: [] }), landed), true);
    assert.deepEqual(asked, []);
    assert.deepEqual(assess(STEPS, legacy, phases({})).ready, ['implement'], 'and its first step is ready exactly as before');
  });
  await t.test(
    'REFUSED: a parent not landed is not ready, pass after pass — every parent must land, each not landed named in order',
    () => {
      const child = run({ implement: null, review: null }, { after: ['a-1', 'b-2'] });
      for (let pass = 0; pass < 3; pass++) assert.equal(runReady(child, landedOnly().landed), false);
      assert.deepEqual(waitingOn(child, landedOnly().landed), ['a-1', 'b-2']);
      assert.equal(runReady(child, landedOnly('a-1').landed), false, 'one of two is not enough');
      assert.deepEqual(waitingOn(child, landedOnly('a-1').landed), ['b-2']);
      assert.equal(runReady(child, landedOnly('a-1', 'b-2').landed), true);
    },
  );
  await t.test('a run that has started is never gated again: its parents are not read — nor in a round that left no step filed', () => {
    const { asked, landed } = landedOnly();
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
  await t.test('a cancelled run waits on nothing, and reads no parent: it files nothing anyway', () => {
    const { asked, landed } = landedOnly();
    assert.deepEqual(waitingOn(run({ implement: null }, { after: ['a-1'], cancelledAt: '2026-09-14T09:00:00Z' }), landed), []);
    assert.deepEqual(asked, []);
  });
});

test('`waitsOf` says why a parent may never land — no such run, cancelled, a result branch gone — and `waitWord` and `waitAdvice` say it', async (t) => {
  const child = run({ implement: null, review: null }, { id: 'c-1', after: ['a-1', 'b-2', 'x-9', 'g-3'] });
  const at = '2026-09-14T10:00:00Z';
  const parents: Record<string, ParentRun> = {
    'a-1': { record: record('a-1'), landed: false },
    'b-2': { record: record('b-2', { cancelledAt: at }), landed: false },
    'g-3': { record: record('g-3'), landed: false, gone: ['wf/g-3/implement'] },
  };
  const waits = waitsOf(child, (id) => parents[id] ?? { landed: false });
  await t.test('each wait, in the order `after` names them', () => {
    assert.deepEqual(waits, [
      { run: 'a-1' },
      { run: 'b-2', cancelledAt: at },
      { run: 'x-9', missing: true },
      { run: 'g-3', gone: ['wf/g-3/implement'] },
    ]);
  });
  await t.test('`waitWord` names each, and why it may never land', () => {
    assert.equal(waitWord(waits), 'waiting on a-1, b-2 (cancelled), x-9 (no such run), g-3 (wf/g-3/implement gone)');
  });
  await t.test('`waitAdvice` says why each never lands, and the ways out', () => {
    assert.equal(
      waitAdvice(child, waits),
      `b-2 was cancelled at ${at}, and a cancelled run never lands; the store has no run x-9; wf/g-3/implement is gone, and git cannot find it on main` +
        ' — yours to resolve: nemia cancel c-1, or start the work again without --after b-2 --after x-9 --after g-3',
    );
  });
  await t.test('`waitAdvice` of parents that may still land: nothing to decide yet, one or two named', () => {
    assert.equal(
      waitAdvice(child, [{ run: 'a-1' }]),
      'nothing of c-1 is filed until nemia decide says a-1 has landed on main; nothing to decide yet',
    );
    assert.equal(
      waitAdvice(child, [{ run: 'a-1' }, { run: 'b-2' }]),
      'nothing of c-1 is filed until nemia decide says a-1 and b-2 have landed on main; nothing to decide yet',
    );
  });
});

test('`listing` puts `waiting on <run>` on each root of a waiting run, where `waiting` would be — and on none of a run called off or started', async (t) => {
  const fan = [step('a'), step('b'), step('c', ['a', 'b'])];
  const child = run({ a: null, b: null, c: null }, { after: ['p-1'] });
  const waits: Wait[] = [{ run: 'p-1', cancelledAt: '2026-09-14T10:00:00Z' }];
  const listed = (r: Run, phase: TaskPhase, given: Wait[] | undefined) =>
    listing({
      steps: fan,
      run: r,
      phaseOf: () => phase,
      closeoutOf: () => undefined,
      ...(given ? { asks: [], roundAsks: [], answers: [], waits: given } : {}),
    });
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
    await t.test(what, () => {
      const said = listed(r, phase, given);
      assert.deepEqual(
        said.steps.map((s) => s.status),
        statuses,
      );
      if (waiting) assert.deepEqual(said.waiting, waiting);
    });
  }
});

test("a pass records the tips of a finished run's result branches — `tipBranches` and `tipsSeen`", async (t) => {
  const fan = [step('a'), step('b'), step('c', ['a', 'b'])];
  const branched = (rest: Partial<RepositoryRun> = {}): Run => {
    const r = run({ a: 't1', b: 't2', c: 't3' }, rest);
    for (const name of ['a', 'b', 'c']) r.steps[name].branch = `wf/r-1/${name}`;
    return r;
  };
  await t.test('the result branch of a run succeeded or failed, or stopped on a person, and no other', () => {
    for (const status of ['succeeded', 'failed', 'awaiting approval', 'blocked'] as const)
      assert.deepEqual(tipBranches(branched(), fan, status), ['wf/r-1/c'], status);
  });
  await t.test('none of a run running or cancelled, --no-worktree, or that worked on its base branch', () => {
    assert.deepEqual([tipBranches(branched(), fan, 'running'), tipBranches(branched(), fan, 'cancelled')], [[], []]);
    assert.deepEqual(tipBranches(branched({ isolate: false }), fan, 'succeeded'), []);
    const onBase = branched();
    onBase.steps.c.branch = 'main';
    assert.deepEqual(tipBranches(onBase, fan, 'succeeded'), []);
  });
  await t.test('a chain on one line: its one branch', () => {
    const chain = run({ implement: 't1', review: 't2' });
    chain.steps.implement.branch = chain.steps.review.branch = 'wf/r-1/implement';
    assert.deepEqual(tipBranches(chain, STEPS, 'succeeded'), ['wf/r-1/implement']);
  });
  await t.test('`tipsSeen` writes what moved, nothing when none did, and keeps a tip once its branch is gone', () => {
    const seenOnce = tipsSeen(branched(), ['wf/r-1/c'], { 'wf/r-1/c': 'aaa', 'wf/r-1/a': 'zzz' });
    assert.deepEqual(seenOnce, { 'wf/r-1/c': 'aaa' });
    assert.equal(tipsSeen(branched(), ['wf/r-1/c'], {}), undefined, 'nothing seen, nothing to write');
    const recorded = branched({ tips: seenOnce });
    assert.equal(tipsSeen(recorded, ['wf/r-1/c'], { 'wf/r-1/c': 'aaa' }), undefined, 'unchanged, so the run is not written');
    assert.equal(tipsSeen(recorded, ['wf/r-1/c'], {}), undefined, 'a branch git no longer has keeps its tip');
    assert.deepEqual(tipsSeen(recorded, ['wf/r-1/c'], { 'wf/r-1/c': 'bbb' }), { 'wf/r-1/c': 'bbb' }, 'a commit after it finished moves it');
  });
});

test('REFUSED by name at `nemia start --after` (`afterRefusal`), read from the record and git alone', async (t) => {
  const at = '2026-09-14T10:00:00Z';
  const folderRun: Run = {
    ...record('n-1'),
    place: { kind: 'folder' },
    repo: undefined,
    baseRef: undefined,
    branch: undefined,
    isolate: undefined,
    placeSkill: undefined,
    stagedFile: undefined,
  };
  const parents: Record<string, Pick<ParentRun, 'record' | 'gone'>> = {
    'a-1': { record: record('a-1') },
    'r-2': { record: record('r-2', { repo: '/elsewhere' }) },
    'd-3': { record: record('d-3', { isolate: false }) },
    'f-4': { record: record('f-4', { branch: 'feature' }) },
    'c-5': { record: record('c-5', { cancelledAt: at }) },
    'g-6': { record: record('g-6'), gone: ['wf/g-6/implement'] },
    'n-1': { record: folderRun },
  };
  const parentOf = (id: string): Pick<ParentRun, 'record' | 'gone'> => parents[id] ?? {};
  const onRepo = { repo: '/repo', branch: 'main' };
  const folderChild = { place: { kind: 'folder' as const } };
  const rows: Array<[string, readonly string[], Parameters<typeof afterRefusal>[1], string[]]> = [
    ['a run given twice', ['a-1', 'a-1'], onRepo, ['--after a-1 is given twice', 'one --after']],
    ['one the store does not have', ['a-1', 'x-9'], onRepo, ['--after x-9:', 'no run x-9', 'nemia ls']],
    ['one on another repository', ['r-2'], onRepo, ['--after r-2:', '/elsewhere', '/repo', '--repo /elsewhere', 'without --after r-2']],
    ['one run --no-worktree', ['d-3'], onRepo, ['--after d-3:', '(--no-worktree)', 'wait for ever', 'without --after d-3']],
    [
      'one on another base branch',
      ['f-4'],
      onRepo,
      ['--after f-4:', 'lands on feature', 'from main', 'Check out feature in /repo', 'without --after f-4'],
    ],
    [
      'a cancelled one, whatever git says: a cancelled run never lands',
      ['c-5'],
      onRepo,
      ['--after c-5:', `c-5 was cancelled at ${at}`, 'without --after c-5'],
    ],
    ['one whose result branch is gone', ['g-6'], onRepo, ['--after g-6:', 'wf/g-6/implement is gone', 'on main', 'without --after g-6']],
    [
      'a folder run, which never lands on a branch',
      ['n-1'],
      onRepo,
      ['--after n-1:', 'n-1 is a folder run (place: folder)', 'wait for ever', 'without --after n-1'],
    ],
    ...(['a-1', 'n-1', 'x-9'].map((id) => [
      `a folder run's own --after, whatever it names: ${id}`,
      [id],
      folderChild,
      [`--after ${id}:`, 'works in folders (place: folder)', 'without --after', `once ${id} is done`],
    ]) as Array<[string, readonly string[], Parameters<typeof afterRefusal>[1], string[]]>),
  ];
  for (const [what, after, child, facts] of rows) {
    await t.test(what, () => namesFor(what, afterRefusal(after, child, parentOf), ...facts));
  }
  await t.test(
    'allowed: no parent, a parent still to land, one on the same repository however it is spelled — and a folder run with none',
    () => {
      assert.equal(afterRefusal([], onRepo, parentOf), null);
      assert.equal(afterRefusal(['a-1'], onRepo, parentOf), null);
      assert.equal(afterRefusal(['a-1'], { repo: '/repo/', branch: 'main' }, parentOf), null);
      assert.equal(afterRefusal([], folderChild, parentOf), null);
    },
  );
});

test('a hold in words: `holdsOf` says what holds a run, `holdWord` and `holdAdvice` say it and what is left to a person', async (t) => {
  const r = { id: 'r-1', branch: 'main' } as Parameters<typeof holdAdvice>[0];
  const said = { why: 'merge conflicts', by: 'operator' };
  const words: Array<[string, Wait[], Parameters<typeof holdWord>[1] | undefined, string]> = [
    ['one run', [{ run: 'a-1' }], undefined, 'held until a-1 lands'],
    ['two, one cancelled', [{ run: 'a-1' }, { run: 'b-2', cancelledAt: 'then' }], undefined, 'held until a-1 and b-2 (cancelled) land'],
    ['one landed', [{ run: 'a-1', landed: true }], undefined, 'held until a-1 lands — it has landed, and the next tick lifts the hold'],
    ['none', [], undefined, 'held, on a hold that names no run'],
    ['the why and who, after `lands`', [{ run: 'a-1' }], said, 'held until a-1 lands (why: merge conflicts; by operator)'],
    ['a why alone', [{ run: 'a-1' }], { why: 'x' }, 'held until a-1 lands (why: x)'],
    ['who alone', [{ run: 'a-1' }], { by: 'operator' }, 'held until a-1 lands (by operator)'],
    ['a file older code wrote, with neither: the plain line', [{ run: 'a-1' }], {}, 'held until a-1 lands'],
    [
      'the words before the suffix of one landed',
      [{ run: 'a-1', landed: true }],
      said,
      'held until a-1 lands (why: merge conflicts; by operator) — it has landed, and the next tick lifts the hold',
    ],
    ['the words after two', [{ run: 'a-1' }, { run: 'b-2' }], said, 'held until a-1 and b-2 land (why: merge conflicts; by operator)'],
    ['the words on a hold that names no run', [], said, 'held, on a hold that names no run (why: merge conflicts; by operator)'],
  ];
  for (const [what, waits, given, line] of words) {
    await t.test(`holdWord: ${what}`, () => assert.equal(holdWord(waits, given), line));
  }
  const advice: Array<[string, Wait[], string]> = [
    [
      'a run that may still land',
      [{ run: 'a-1' }],
      'nothing of r-1 is filed, and nothing is asked of you, until nemia decide says a-1 has landed; to go on before then: nemia hold r-1 --off',
    ],
    [
      'no such run',
      [{ run: 'a-1', missing: true }],
      'the store has no run a-1 — yours to resolve: nemia hold r-1 --off, or nemia cancel r-1',
    ],
    ['a hold that names no run', [], "the hold on r-1 names no run, so no run's landing lifts it — yours to lift: nemia hold r-1 --off"],
  ];
  for (const [what, waits, line] of advice) {
    await t.test(`holdAdvice: ${what}`, () => assert.equal(holdAdvice(r, waits), line));
  }
  await t.test('never that the run waits on you', () => {
    for (const w of [[{ run: 'a-1' }], [{ run: 'a-1', missing: true as const }], [{ run: 'a-1', landed: true as const }], []])
      assert.doesNotMatch(`${holdWord(w)} ${holdAdvice(r, w)}`, /waiting on you/);
  });
  await t.test('`holdsOf`: one run not landed is the whole of what holds it; all landed, each named as landed', () => {
    const held = { ...r, hold: { at: 't', until: ['a-1', 'b-2'] } } as Parameters<typeof holdsOf>[0];
    assert.deepEqual(
      holdsOf(held, (id) => ({ record: { id } as never, landed: id === 'a-1' })),
      [{ run: 'b-2' }],
    );
    assert.deepEqual(
      holdsOf(held, (id) => ({ record: { id } as never, landed: true })),
      [
        { run: 'a-1', landed: true },
        { run: 'b-2', landed: true },
      ],
    );
  });
  await t.test('`heldLater` says the hold at the gate it holds back, with the why and who as `holdWord` says them', () => {
    const later = heldLater({ at: 't', until: ['a-1'], why: 'w', by: 'b' }, 'its approval');
    assert.ok(later.startsWith('held until a-1 lands (why: w; by b); '), later);
    assert.equal(later.replace(' (why: w; by b)', ''), heldLater({ at: 't', until: ['a-1'] }, 'its approval'));
    assert.equal(heldLater({ at: 't', until: ['a-1'] }, 'its approval'), 'held until a-1 lands; its approval is asked once the hold lifts');
  });
});
