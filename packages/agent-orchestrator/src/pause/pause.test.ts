/**
 * The store's pause as `assess` reads it — nothing due, what would be named in `paused`, the rest of the judgement as without it —
 * what finishes under it and what a pause at once interrupts, and its words: a table per function. Pure: no disk, no engine. The pause
 * told over a store, put, put at once and resumed, is `test/pause.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../tick/assess.ts';
import type { RepositoryRun, TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import {
  callsOf,
  finishingAmong,
  finishingOf,
  interruptsAmong,
  interruptsOf,
  NOW_COST,
  nowLines,
  pausedLines,
  pausedWords,
  pauseWords,
  type Finishing,
  type FinishingView,
  type Pause,
} from './pause.ts';

const PAUSE: Pause = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
const step = (name: string, after: string[] = [], more: Partial<Workflow> = {}): Workflow => ({ name, after, body: `do ${name}`, ...more });
const run = (steps: RepositoryRun['steps'], rest: Partial<RepositoryRun> = {}): RepositoryRun => ({
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
  ...rest,
});
const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';
const signed = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const asked = () => true;

test('`assess` under the pause: nothing is due that would start new work, each named in `waitingOnPause`, the rest judged as without it', async (t) => {
  await t.test(
    'under the pause a step ready and a check due are not due, and are named in `waitingOnPause`; the rest is judged as without it',
    () => {
      const steps = [step('implement', [], { check: 'npm test' }), step('review', ['implement']), step('docs')];
      const r = run({ implement: { taskId: 't1' }, review: { taskId: null }, docs: { taskId: null } });
      const free = assess(steps, r, phases({ t1: 'succeeded' }), signed, asked);
      assert.deepEqual([free.check, free.ready], [['implement'], ['docs']], 'without it, the check and docs are due');
      const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'succeeded' }), signed, asked);
      assert.deepEqual(held, {
        ...free,
        ready: [],
        check: [],
        waitingOnPause: { steps: ['docs', 'implement'], checks: ['implement'] },
      });
    },
  );
  await t.test('under the pause a try a person asked for is not due, and the step it asks of is still running', () => {
    const steps = [step('implement'), step('review', ['implement'])];
    const r = run({ implement: { taskId: 't1' }, review: { taskId: null } });
    const ask = { step: 'implement', try: 2, mode: 'fresh' as const, at: '2026-10-04T12:00:00.000Z' };
    const free = assess(steps, r, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
    assert.equal(free.retry.length, 1, 'without it, the try is due');
    const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
    assert.deepEqual(held, { ...free, retry: [], waitingOnPause: { steps: ['implement'], checks: [] } });
    assert.equal(held.status, 'running', 'a run asked to go on is not failed while it waits for the lift');
  });
  await t.test('under the pause a round its loop asks for is not due, and the looping step is still running', () => {
    const steps = [step('implement'), step('review', ['implement'], { loop: 'implement', rounds: 3 })];
    const r = run({ implement: { taskId: 't1' }, review: { taskId: 't2' } });
    const again = (name: string) => (name === 'review' ? { ...signed(), output: { again: true } } : signed());
    const free = assess(steps, r, phases({ t1: 'succeeded', t2: 'succeeded' }), again, asked);
    assert.deepEqual(
      free.round.map((d) => [d.step, d.target]),
      [['review', 'implement']],
      'without it, the round is due',
    );
    const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'succeeded', t2: 'succeeded' }), again, asked);
    assert.deepEqual(held, { ...free, round: [], waitingOnPause: { steps: ['review'], checks: [] } });
    assert.equal(held.status, 'running', 'a run whose loop goes round again is not over while it waits for the lift');
  });
  await t.test('a run the pause holds nothing of is judged as without it', () => {
    const steps = [step('implement')];
    const r = run({ implement: { taskId: 't1' } });
    assert.deepEqual(
      assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'running' }), signed, asked),
      assess(steps, r, phases({ t1: 'running' }), signed, asked),
    );
  });
});

test('the pause in words: as put, Pausing while some finish, Paused once none does, and what `nemia pause --now` would stop', async (t) => {
  await t.test('the pause as put says since when, by whom, why, and how it is resumed', () => {
    assert.equal(
      pauseWords(PAUSE),
      'the store is paused since 2026-10-04T12:00:00.000Z by ann: merging by hand — nothing new starts, and what runs finishes; nemia resume resumes it',
    );
  });
  await t.test('the pause says Pausing with how many still finish, names each and each check it holds; Paused once none finishes', () => {
    const finishing: Finishing[] = [
      { run: 'r-1', step: 'implement', kind: 'session' },
      { run: 'r-2', step: 'review', kind: 'check' },
    ];
    const staged = [{ run: 'r-3', step: 'ship', repo: '/repo' }];
    assert.deepEqual(pausedLines({ pause: PAUSE, finishing, staged, held: [{ run: 'r-4', step: 'land' }] }), [
      'Pausing: 2 finishing, 2 checks held — the store is paused since 2026-10-04T12:00:00.000Z by ann: merging by hand; nothing new starts, and what runs finishes; nemia resume resumes it',
      "   r-1's implement is finishing: its session is at work",
      "   r-2's review is finishing: its check runs",
      "   r-3's ship has its merge staged in /repo (MERGE_HEAD), and its check waits on nemia resume",
      "   r-4's land has signed off, and its check waits on nemia resume",
    ]);
    assert.match(
      pausedWords({ pause: PAUSE, finishing: finishing.slice(1), staged: [], held: [] }) ?? '',
      /^Pausing: 1 finishing — /,
      'one finishing is not Paused, and no check held is not said',
    );
    assert.equal(
      pausedWords({ pause: { at: '', by: '' }, finishing: [], staged: [], held: [] }),
      'Paused since a time its file no longer says by someone its file no longer names — nothing runs and nothing new starts; nemia resume resumes it',
    );
    assert.deepEqual(pausedLines({ pause: null, finishing: [], staged: [], held: [] }), []);
  });
  await t.test('the pause once nothing finishes counts each check it holds back, staged or not, and names each', () => {
    assert.deepEqual(pausedLines({ pause: PAUSE, finishing: [], staged: [], held: [{ run: 'r-1', step: 'land' }] }), [
      'Paused since 2026-10-04T12:00:00.000Z by ann: merging by hand — nothing runs and nothing new starts, 1 check held; nemia resume resumes it',
      "   r-1's land has signed off, and its check waits on nemia resume",
    ]);
    assert.match(
      pausedWords({
        pause: PAUSE,
        finishing: [],
        staged: [{ run: 'r-2', step: 'ship', repo: '/repo' }],
        held: [{ run: 'r-1', step: 'land' }],
      }) ?? '',
      / nothing new starts, 2 checks held; /,
    );
  });
  await t.test('nemia pause --now says each task it would stop, what that costs, and the line that acts', () => {
    assert.deepEqual(nowLines([{ run: 'r-1', step: 'implement', kind: 'session', taskId: 't1' }]), [
      'nemia pause --now would pause the store and stop 1 at work, each tried again on nemia resume:',
      "   r-1's implement: its session",
      `${NOW_COST} A landing that checks or merges is left to finish.`,
      'nemia pause --now --yes does it.',
    ]);
    assert.equal(NOW_COST, 'An interrupted step redoes its unfinished work and reads its context again.');
    assert.match(nowLines([])[0], /stops nothing/);
    assert.equal(
      nowLines([], true)[0],
      "nemia pause --now would keep the store's pause as it stands; nothing outside a landing is at work, so it stops nothing.",
    );
  });
});

/** An attempt under way. */
const ATTEMPT = { startedAt: '2026-10-04T12:00:00.000Z', spawnedAt: null, endedAt: null, reason: null, usage: null, ended: null };

/** A task's view as `finishingOf` reads it: settled or not, with attempts or not, the runtime's phase, and its admission. */
const view = (
  phase: FinishingView['phase'],
  more: { settled?: 'succeeded'; attempts?: number; admission?: string; stopRequested?: true } = {},
): FinishingView => ({
  phase,
  ...(more.admission ? { admission: more.admission } : {}),
  state: {
    brief: 'b',
    settled: more.settled ?? null,
    attempts: Array.from({ length: more.attempts ?? 1 }, () => ATTEMPT),
    ...(more.stopRequested ? { stopRequested: true } : {}),
  },
});

test('`finishingOf` and `finishingAmong`: what finishes under the pause, and how each is said', async (t) => {
  await t.test('what finishes under the pause: a session at work, a check that runs, and an ending’s check as a landing', () => {
    const steps = [
      step('implement', [], { check: 'npm test' }),
      step('ship', ['implement'], { gate: true, workspace: 'base', check: 'npm test' }),
    ];
    const r = run({ implement: { taskId: 't1', check: { taskId: 'c1' } }, ship: { taskId: 't2', check: { taskId: 'c2' } } });
    const views: Record<string, FinishingView> = {
      t1: view('working'),
      c1: view('working'),
      t2: view('succeeded', { settled: 'succeeded' }),
      c2: view('working'),
    };
    assert.deepEqual(
      finishingOf(r, steps, (id) => views[id]),
      [
        { run: 'r-1', step: 'implement', kind: 'session' },
        { run: 'r-1', step: 'implement', kind: 'check' },
        { run: 'r-1', step: 'ship', kind: 'landing' },
      ],
    );
  });
  await t.test('nothing finishes of a task queued for a slot, a session waiting on a person, or one settled', () => {
    const steps = [step('implement')];
    const r = run({ implement: { taskId: 't1' } });
    const finishing = (v: FinishingView) => finishingOf(r, steps, () => v);
    assert.equal(finishing(view('pending', { attempts: 0 })).length, 1, 'a pending task admitted finishes');
    assert.deepEqual(finishing(view('pending', { attempts: 0, admission: 'queued' })), [], 'a queued task is not admitted under the pause');
    assert.deepEqual(finishing(view('needs-human')), [], 'a session waiting on a person holds no slot and does no work');
    assert.deepEqual(finishing(view('succeeded', { settled: 'succeeded' })), [], 'a settled task is done');
  });
  await t.test('finishingAmong reads the steps of a run only where one of its tasks is at work', () => {
    const idle = run({ implement: { taskId: 't1' } }, { id: 'r-idle' });
    const live = run({ implement: { taskId: 't2' } }, { id: 'r-live' });
    const read: string[] = [];
    const views: Record<string, FinishingView> = { t1: view('succeeded', { settled: 'succeeded' }), t2: view('working') };
    const finishing = finishingAmong(
      [idle, live],
      (id) => views[id],
      (r) => (read.push(r.id), [step('implement')]),
    );
    assert.deepEqual(finishing, [{ run: 'r-live', step: 'implement', kind: 'session' }]);
    assert.deepEqual(read, ['r-live']);
  });
  await t.test('a task asked to stop that no pause ask names finishes as stopping, and is promised no try on the resume', () => {
    const r = run({ implement: { taskId: 't1' } });
    const other = { step: 'implement', try: 2, mode: 'continue' as const, interrupted: 't0', at: '2026-10-04T12:00:00Z' };
    const finishing = finishingOf(r, [step('implement')], () => view('working', { stopRequested: true }), [other]);
    assert.deepEqual(finishing, [{ run: 'r-1', step: 'implement', kind: 'session', stopping: true }]);
    assert.deepEqual(pausedLines({ pause: PAUSE, finishing, staged: [], held: [] }).slice(1), [
      "   r-1's implement is stopping: its session was asked to stop",
    ]);
  });
  await t.test('a task a pause ask names finishes as stopping and resumed, tried again on nemia resume', () => {
    const r = run({ implement: { taskId: 't1' } });
    const ask = { step: 'implement', try: 2, mode: 'continue' as const, interrupted: 't1', at: '2026-10-04T12:00:00Z' };
    const finishing = finishingOf(r, [step('implement')], () => view('working', { stopRequested: true }), [ask]);
    assert.deepEqual(finishing, [{ run: 'r-1', step: 'implement', kind: 'session', stopping: true, resumed: true }]);
    assert.deepEqual(pausedLines({ pause: PAUSE, finishing, staged: [], held: [] }).slice(1), [
      "   r-1's implement is stopping: its session was asked to stop, and is tried again on nemia resume",
    ]);
  });
  await t.test(
    "a session in a tool call finishes naming its call, a check never does, and the daemon's stop waits for the session's alone",
    () => {
      const steps = [step('implement', [], { check: 'npm test' })];
      const r = run({ implement: { taskId: 't1', check: { taskId: 'c1' } } });
      const calling = { tool: 'Bash' };
      const views: Record<string, FinishingView> = {
        t1: { ...view('working'), calling },
        c1: { ...view('working'), calling },
      };
      const finishing = finishingOf(r, steps, (id) => views[id]);
      assert.deepEqual(finishing, [
        { run: 'r-1', step: 'implement', kind: 'session', calling: 'Bash' },
        { run: 'r-1', step: 'implement', kind: 'check' },
      ]);
      assert.deepEqual(callsOf({ finishing }), [finishing[0]]);
      assert.deepEqual(pausedLines({ pause: PAUSE, finishing, staged: [], held: [] }).slice(1), [
        "   r-1's implement is finishing: its call to Bash runs",
        "   r-1's implement is finishing: its check runs",
      ]);
    },
  );
});

test('`interruptsOf` and `interruptsAmong`: what a pause at once interrupts, and what it leaves to finish', async (t) => {
  await t.test('a pause at once interrupts a session at work and a check that runs, by their task ids', () => {
    const steps = [step('implement', [], { check: 'npm test' }), step('review', ['implement'], { check: 'npm test' })];
    const r = run({ implement: { taskId: 't1' }, review: { taskId: 't2', check: { taskId: 'c2' } } });
    const views: Record<string, FinishingView> = {
      t1: view('working'),
      t2: view('succeeded', { settled: 'succeeded' }),
      c2: view('working'),
    };
    assert.deepEqual(
      interruptsOf(r, steps, (id) => views[id]),
      [
        { run: 'r-1', step: 'implement', kind: 'session', taskId: 't1' },
        { run: 'r-1', step: 'review', kind: 'check', taskId: 'c2' },
      ],
    );
  });
  await t.test('a pause at once leaves a landing to finish: the session and the check of a step in the own checkout', () => {
    const ship = step('ship', [], { gate: true, workspace: 'base', check: 'npm test' });
    const r = run({ ship: { taskId: 't1', check: { taskId: 'c1' } } });
    const working = (id: string) => (id === 't1' || id === 'c1' ? view('working') : undefined);
    assert.equal(
      interruptsOf(r, [{ ...ship, workspace: undefined }], working).length,
      2,
      'the fixture: in a worktree, both are interrupted',
    );
    assert.deepEqual(interruptsOf(r, [ship], working), []);
  });
  await t.test('a pause at once leaves a task already asked to stop, one queued for a slot, and one waiting on a person', () => {
    const steps = [step('implement')];
    const r = run({ implement: { taskId: 't1' } });
    const interrupted = (v: FinishingView) => interruptsOf(r, steps, () => v);
    assert.equal(interrupted(view('working')).length, 1, 'the fixture: a session at work is interrupted');
    assert.deepEqual(interrupted(view('working', { stopRequested: true })), [], 'already asked to stop');
    assert.deepEqual(interrupted(view('pending', { attempts: 0, admission: 'queued' })), [], 'queued for a slot');
    assert.deepEqual(interrupted(view('needs-human')), [], 'waiting on a person');
  });
  await t.test('interruptsAmong reads the steps of a run only where one of its tasks is at work', () => {
    const idle = run({ implement: { taskId: 't1' } }, { id: 'r-idle' });
    const live = run({ implement: { taskId: 't2' } }, { id: 'r-live' });
    const read: string[] = [];
    const views: Record<string, FinishingView> = { t1: view('succeeded', { settled: 'succeeded' }), t2: view('working') };
    const interrupts = interruptsAmong(
      [idle, live],
      (id) => views[id],
      (r) => (read.push(r.id), [step('implement')]),
    );
    assert.deepEqual(interrupts, [{ run: 'r-live', step: 'implement', kind: 'session', taskId: 't2' }]);
    assert.deepEqual(read, ['r-live']);
  });
});
