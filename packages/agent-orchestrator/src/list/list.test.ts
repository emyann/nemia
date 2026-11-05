/**
 * A parked step in `nemia ls`: the word `paused`, with the call it stopped after or the call it cut, reason `Paused`, read through the
 * listing's `parkedOf`; the feed's word for it names the same reason (`test/assessed.ts`'s `listing`). And a step whose session or check
 * the kernel killed at its memory limit, said in its note off the listing's `memoryOf`, with nothing else of its row changed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listing, phases, run, step, STEPS } from '../../test/assessed.ts';
import type { AttemptMemory } from '../views/views-words.ts';

/** The implement row of a run whose implement is at work as `t1`, parked as `parked` says. */
const implementRow = (parked: { after?: string; cut?: string } | undefined) => {
  const listed = listing({
    steps: STEPS,
    run: run({ implement: 't1', review: null }),
    phaseOf: phases({ t1: 'running' }),
    closeoutOf: () => undefined,
    parkedOf: (id) => (id === 't1' ? parked : undefined),
  });
  const row = listed.steps.find((s) => s.name === 'implement');
  assert.ok(row, 'the implement row is listed');
  return row;
};

test('a parked step says paused, with the call it stopped after or the call it cut, reason Paused', async (t) => {
  await t.test('held after its call to Read: paused after its call to Read', () => {
    const row = implementRow({ after: 'Read' });
    assert.deepEqual([row.message, row.reason, row.phase], ['paused after its call to Read', 'Paused', 'running']);
  });
  await t.test('held between two calls with no call kept: paused', () => {
    const row = implementRow({});
    assert.deepEqual([row.message, row.reason], ['paused', 'Paused']);
  });
  await t.test('parked with its call to Bash cut: paused, its call to Bash cut', () => {
    const row = implementRow({ cut: 'Bash' });
    assert.deepEqual([row.message, row.reason], ['paused, its call to Bash cut', 'Paused']);
  });
  await t.test('a step not parked says the engine’s word, as before', () => {
    const row = implementRow(undefined);
    assert.deepEqual([row.message, row.reason], ['running', 'Running']);
  });
});

const GI = 1024 ** 3;
const KILLED: AttemptMemory = { limitBytes: 4 * GI, peakBytes: 4 * GI, oomKills: 1 };

test('a step killed at its memory limit says so in its note, and one with no kill reads unchanged', async (t) => {
  /** The listing of a run whose implement failed as `t1`, its check `c1`, its implement naming `own` as its `memory:`. */
  const listed = (memoryOf?: (id: string) => AttemptMemory | undefined, own?: string) =>
    listing({
      steps: [{ ...step('implement'), ...(own ? { memory: own } : {}) }, STEPS[1]],
      run: run({ implement: 't1', review: null }, { steps: { implement: { taskId: 't1', check: { taskId: 'c1' } }, review: { taskId: null } } }),
      phaseOf: phases({ t1: 'failed', c1: 'failed' }),
      closeoutOf: () => undefined,
      ...(memoryOf ? { memoryOf } : {}),
    });
  const implement = (l: ReturnType<typeof listed>) => {
    const row = l.steps.find((s) => s.name === 'implement');
    assert.ok(row, 'the implement row is listed');
    return row;
  };
  await t.test('its session killed: the note says out of memory and the limit, and nothing else of the row moves', () => {
    const before = implement(listed());
    const after = implement(listed((id) => (id === 't1' ? KILLED : undefined)));
    for (const fact of ['out of memory', '4Gi', 'WF_MEMORY_LIMIT']) assert.ok(after.note?.includes(fact), fact);
    assert.deepEqual([after.message, after.reason, after.phase], [before.message, before.reason, before.phase]);
  });
  await t.test('a step naming its own memory: is told to raise it, not WF_MEMORY_LIMIT', () => {
    const note = implement(listed((id) => (id === 't1' ? KILLED : undefined), '4Gi')).note ?? '';
    assert.ok(note.includes("step's memory:"));
    assert.ok(!note.includes('WF_MEMORY_LIMIT'));
  });
  await t.test('its check killed: the note says the check, naming WF_MEMORY_LIMIT', () => {
    const note = implement(listed((id) => (id === 'c1' ? KILLED : undefined))).note ?? '';
    assert.ok(note.includes('check out of memory'));
    assert.ok(note.includes('WF_MEMORY_LIMIT'));
  });
  await t.test('no record, or a record with no kill: the listing is the one built without memoryOf', () => {
    assert.deepEqual(listed(() => undefined), listed());
    assert.deepEqual(listed(() => ({ limitBytes: 4 * GI, peakBytes: GI, oomKills: 0 })), listed());
  });
});
