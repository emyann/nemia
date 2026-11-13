/**
 * A parked step in `nemia ls`: the word `paused`, with the call it stopped after or the call it cut, reason `Paused`, read through the
 * listing's `parkedOf`; the feed's word for it names the same reason (`test/assessed.ts`'s `listing`). And a step whose session or check
 * the kernel killed at its memory limit, said in its note off the listing's `memoryOf`, with nothing else of its row changed; and so a
 * queued step the runtime holds back, off the listing's `admissionWaitOf`: the memory it needs and the room, or its pool's slots.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listing, phases, run, step, STEPS } from '../../test/assessed.ts';
import type { AttemptMemory } from '../views/views-words.ts';
import type { HeldBack } from './list.ts';

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
  const listed = (memoryOf?: (id: string) => AttemptMemory | undefined, own?: string) =>
    listing({
      steps: [{ ...step('implement'), ...(own ? { memory: own } : {}) }, STEPS[1]],
      run: run(
        { implement: 't1', review: null },
        { steps: { implement: { taskId: 't1', check: { taskId: 'c1' } }, review: { taskId: null } } },
      ),
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
    assert.deepEqual(
      listed(() => undefined),
      listed(),
    );
    assert.deepEqual(
      listed(() => ({ limitBytes: 4 * GI, peakBytes: GI, oomKills: 0 })),
      listed(),
    );
  });
});

test('a queued step the runtime holds says why in its note: the memory it needs and the room, or the pool, its ceiling and WF_MAX_CONCURRENT', async (t) => {
  const listed = (admissionWaitOf?: (id: string) => HeldBack | undefined) =>
    listing({
      steps: STEPS,
      run: run(
        { implement: 't1', review: null },
        { steps: { implement: { taskId: 't1', check: { taskId: 'c1' } }, review: { taskId: null } } },
      ),
      phaseOf: phases({ t1: 'pending', c1: 'pending' }),
      closeoutOf: () => undefined,
      ...(admissionWaitOf ? { admissionWaitOf } : {}),
    });
  const implement = (l: ReturnType<typeof listed>) => {
    const row = l.steps.find((s) => s.name === 'implement');
    assert.ok(row, 'the implement row is listed');
    return row;
  };
  await t.test('a memory wait: the note names memory, the need and the room, and nothing else of the row moves', () => {
    const before = implement(listed());
    const after = implement(listed((id) => (id === 't1' ? { for: 'memory', needBytes: 2.5 * GI, roomBytes: GI } : undefined)));
    for (const fact of ['memory', '2.5Gi', '1Gi']) assert.ok(after.note?.includes(fact), fact);
    assert.deepEqual([after.message, after.reason, after.phase], [before.message, before.reason, before.phase]);
  });
  await t.test('a room under 1Gi is said in Mi', () => {
    const note = implement(
      listed((id) => (id === 't1' ? { for: 'memory', needBytes: 2 * GI, roomBytes: 512 * 1024 ** 2 } : undefined)),
    ).note;
    for (const fact of ['2Gi', '512Mi']) assert.ok(note?.includes(fact), fact);
  });
  await t.test('a slot wait: the note names the pool, its ceiling and WF_MAX_CONCURRENT', () => {
    const note = implement(listed((id) => (id === 't1' ? { for: 'slot', pool: 'claude', ceiling: 4 } : undefined))).note;
    for (const fact of ['claude', '4', 'WF_MAX_CONCURRENT']) assert.ok(note?.includes(fact), fact);
  });
  await t.test('its check held: the note says the check', () => {
    const note = implement(listed((id) => (id === 'c1' ? { for: 'memory', needBytes: 2 * GI, roomBytes: 0 } : undefined))).note;
    for (const fact of ['check', 'memory', '2Gi']) assert.ok(note?.includes(fact), fact);
  });
  await t.test('no wait: the listing is the one built without admissionWaitOf', () =>
    assert.deepEqual(
      listed(() => undefined),
      listed(),
    ),
  );
});

test('a held run waits on no one and lists no try due, though a step signed off blocked and a person asked to try it', async (t) => {
  const HOLD = { hold: { at: '2026-11-09T00:00:00.000Z', until: ['r-0'] } };
  const listed = (marks: object) =>
    listing({
      steps: STEPS,
      run: run({ implement: 't1', review: null }, marks),
      phaseOf: phases({ t1: 'failed' }),
      closeoutOf: () => undefined,
      asks: [{ step: 'implement', try: 2, mode: 'fresh', at: '2026-11-09T00:00:00.000Z' }],
    });
  const blocked = (marks: object) =>
    listing({
      steps: STEPS,
      run: run({ implement: 't1', review: null }, marks),
      phaseOf: phases({ t1: 'succeeded' }),
      closeoutOf: (name) =>
        name === 'implement'
          ? { outcome: 'blocked', summary: 's', artifacts: [], needs: 'which flag', questions: ['which flag?'] }
          : undefined,
    });
  const note = (l: ReturnType<typeof listing>) => l.steps.find((s) => s.name === 'implement')?.note ?? '';
  await t.test('unmarked: the try is due, and the blocked step waits on you', () => {
    assert.match(note(listed({})), /try 2/);
    assert.deepEqual(blocked({}).waitingOnYou, ['implement']);
  });
  await t.test('held: no try due, nobody waited on, no question counted on the row', () => {
    assert.doesNotMatch(note(listed(HOLD)), /try 2/);
    const held = blocked(HOLD);
    assert.deepEqual(held.waitingOnYou, []);
    assert.equal(held.steps.find((s) => s.name === 'implement')?.asks, undefined);
  });
});
