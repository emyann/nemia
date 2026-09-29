/**
 * The admission the tick makes off the runtime's views (`src/cap/cap.ts`): which queued tasks start, per pool, under the ceiling.
 *
 * Each rule has a fixture in the order that rule has to undo, so that its test fails without it: the id tiebreak (views
 * given in reversed id order), the filing-time compare (a later id filed first), momentum (a first step filed before an after-step),
 * `POOLS`' `claude-detached` line (harnesses given detached-first), the `needs-human` and `input-required` exclusions, `starting` and
 * admitted-but-pending holding a slot, the per-pool count, and each kind `momentumOf` names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdsSlot, momentumOf, poolOf, POOLS, toAdmit, type AdmissionView } from './cap.ts';
import { MOMENTUM } from '../status/status.ts';

const T0 = Date.parse('2026-09-25T10:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();

const queued = (id: string, filed: number, harness = 'claude'): AdmissionView => ({
  id,
  phase: 'pending',
  admission: 'queued',
  state: { harness, filedAt: at(filed) },
});
const live = (id: string, phase: string, harness = 'claude'): AdmissionView => ({ id, phase, state: { harness, filedAt: at(0) } });
const none = () => 0;

test("POOLS: Claude Code's job and background session share one pool; codex and check are their own; an unlisted harness is its own", () => {
  assert.deepEqual(POOLS, { claude: 'claude', 'claude-detached': 'claude', codex: 'codex', check: 'check' });
  assert.equal(poolOf('claude-detached'), 'claude');
  assert.equal(poolOf('codex'), 'codex');
  assert.equal(poolOf('check'), 'check');
  assert.equal(poolOf('fake'), 'fake');
  assert.equal(poolOf(undefined), 'default');
  assert.equal(poolOf('toString'), 'toString', "a name on Object's prototype is no pool line");
});

test("a claude-detached session counts against claude's ceiling, and a detached task waits on claude's", () => {
  const views = [
    live('d-1', 'running (working)', 'claude-detached'),
    live('c-1', 'running (working)'),
    queued('c-2', 1),
    queued('d-2', 2, 'claude-detached'),
  ];
  assert.deepEqual(
    toAdmit({ views, momentum: none, ceiling: 2 }),
    [],
    'detached first, so a pool keyed by the harness name alone would read two pools of one',
  );
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 3 }), ['c-2']);
});

test("the ceiling is counted per pool: codex does not fill claude's slots, nor check codex's", () => {
  const views = [
    live('x-1', 'running (working)', 'codex'),
    live('x-2', 'running (working)', 'codex'),
    live('k-1', 'running (working)', 'check'),
    queued('c-1', 1),
    queued('x-3', 2, 'codex'),
    queued('k-2', 3, 'check'),
    queued('k-3', 4, 'check'),
    queued('f-1', 5, 'fake'),
  ];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 2 }), ['c-1', 'k-2', 'f-1']);
});

test('each task admitted is counted at once: a full pool admits nothing more, and it drains one for one', () => {
  const waiting = [queued('c-1', 1), queued('c-2', 2), queued('c-3', 3)];
  assert.deepEqual(toAdmit({ views: waiting, momentum: none, ceiling: 2 }), ['c-1', 'c-2']);
  const next = [{ ...waiting[0], admission: 'admitted' as const }, { ...waiting[1], admission: 'admitted' as const }, waiting[2]];
  assert.deepEqual(
    toAdmit({ views: next, momentum: none, ceiling: 2 }),
    [],
    'the pass after: those two admitted hold their slots, and the third is refused one',
  );
  assert.deepEqual(toAdmit({ views: [next[0], next[2]], momentum: none, ceiling: 2 }), ['c-3'], 'one ended: exactly one more');
  assert.deepEqual(toAdmit({ views: waiting, momentum: none, ceiling: 0 }), []);
});

test('holdsSlot: a session at work, one starting, and one admitted and not yet started hold a slot', () => {
  for (const phase of ['running (working)', 'working (quiescent)', 'starting']) assert.equal(holdsSlot({ phase }), true, phase);
  assert.equal(holdsSlot({ phase: 'pending', admission: 'admitted' }), true);
  assert.equal(holdsSlot({ phase: 'pending', admission: 'queued' }), false);
  assert.equal(holdsSlot({ phase: 'pending' }), false);
});

test('holdsSlot: a blocked session, one held for an answer, one between attempts and a settled task hold none', () => {
  for (const phase of ['needs-human', 'input-required', 'between attempts', 'succeeded', 'failed', 'stopped'])
    assert.equal(holdsSlot({ phase }), false, phase);
});

test('a starting session and an admitted task fill the pool as a working one does', () => {
  const views = [live('c-1', 'starting'), { ...queued('c-2', 1), phase: 'pending', admission: 'admitted' as const }, queued('c-3', 2)];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 2 }), []);
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 3 }), ['c-3']);
});

test('a session blocked on a person holds no slot, and counts again once it works again', () => {
  const blocked = [live('c-1', 'needs-human'), live('c-2', 'input-required'), queued('c-3', 1)];
  assert.deepEqual(toAdmit({ views: blocked, momentum: none, ceiling: 1 }), ['c-3']);
  const working = [live('c-1', 'running (working)'), live('c-2', 'input-required'), queued('c-3', 1)];
  assert.deepEqual(toAdmit({ views: working, momentum: none, ceiling: 1 }), []);
});

test('the earlier filing goes first, whatever the ids say', () => {
  const views = [queued('c-a', 20), queued('c-b', 10)];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 1 }), ['c-b'], 'the later id filed first; a sort by id alone takes c-a');
});

test('filed in the same millisecond, the lower id goes first, given in reversed order', () => {
  const views = [queued('c-b', 5), queued('c-a', 5)];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 1 }), ['c-a']);
  assert.deepEqual(toAdmit({ views: [...views].reverse(), momentum: none, ceiling: 1 }), ['c-a']);
});

test('a filing time that does not parse goes last', () => {
  const views = [{ ...queued('c-a', 0), state: { harness: 'claude', filedAt: 'garbage' } }, queued('c-b', 50)];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 1 }), ['c-b']);
});

test("momentum goes before the filing: a run in flight keeps its slot over a newer run's first step", () => {
  const views = [queued('first', 1), queued('after', 9)];
  const momentum = (id: string) => (id === 'after' ? MOMENTUM : 0);
  assert.deepEqual(toAdmit({ views, momentum, ceiling: 1 }), ['after']);
  assert.deepEqual(
    toAdmit({ views, momentum: none, ceiling: 1 }),
    ['first'],
    'the first step filed first, the after-step later: filing order alone takes the first step',
  );
});

test('a task already admitted or not queued is never admitted again', () => {
  const views = [
    { ...queued('c-1', 1), admission: 'admitted' as const },
    { ...queued('c-2', 2), admission: undefined },
  ];
  assert.deepEqual(toAdmit({ views, momentum: none, ceiling: 5 }), []);
});

test('momentumOf: each task a run names reads as tick.ts filed it, and an id no run names is 0', () => {
  const steps = [
    { name: 'plan', after: [] },
    { name: 'implement', after: ['plan'] },
    { name: 'review', after: ['implement'] },
  ];
  const run = {
    steps: {
      plan: {
        taskId: 'plan-2',
        check: { taskId: 'plan-2-check' },
        tries: [{ taskId: 'plan-1', check: { taskId: 'plan-1-check' }, then: 'retries' as const }],
      },
      implement: { taskId: 'impl-1' },
      review: { taskId: 'review-2', tries: [{ taskId: 'review-1', then: 'round' as const }] },
    },
  };
  const m = momentumOf([{ run, steps }]);
  assert.equal(m('plan-1'), 0, "a first step on its second try: its first try is the step's first filing");
  assert.equal(m('plan-2'), MOMENTUM, 'a later try');
  assert.equal(m('plan-1-check'), MOMENTUM, "an earlier try's check");
  assert.equal(m('plan-2-check'), MOMENTUM, 'a check');
  assert.equal(m('impl-1'), MOMENTUM, 'a step after another, its first filing');
  assert.equal(m('review-1'), MOMENTUM, "an after-step's first task");
  assert.equal(m('review-2'), MOMENTUM, "a round of the review: its round's task is a later filing of the step");
  assert.equal(m('nobody'), 0, 'an id no run names');
});

test('momentumOf: a first step with no try is 0, a step not yet filed names nothing, and a step no longer in the workflow is skipped', () => {
  const steps = [
    { name: 'a', after: [] },
    { name: 'b', after: ['a'] },
  ];
  const run = { steps: { a: { taskId: 'a-1' }, b: { taskId: null }, gone: { taskId: 'gone-1' } } };
  const m = momentumOf([{ run, steps }]);
  assert.equal(m('a-1'), 0);
  assert.equal(m('gone-1'), 0);
});
