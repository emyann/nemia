/**
 * A page of the runs as a table (`runTable`, table.ts): its columns, a row per run in their order with the run's metadata beside it, the
 * brief's first line cut, a run called off noted, its labels by key, what waits on you — a step blocked, a gate, a loop out of rounds, a
 * hold, a run waited on that never lands — with the command that answers it, and a run that could not be judged a row whose note says
 * so. Cells are asserted as the values a run gives them, never as sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run, RunList } from 'objects';
import { RUN_COLUMNS, runCells, runTable } from './table.ts';

/** A step as a row reads it: its name, its word, and its branch, cost, note and what its session waits for where given. */
const stepOf = (name: string, message: string, more: Record<string, unknown> = {}) => ({
  name,
  message,
  branch: null,
  note: null,
  spent: null,
  denied: null,
  waitingFor: null,
  attempts: { count: 0, latest: null },
  ...more,
});

/**
 * A run object with what a row reads of it: its name and labels, its brief, its cost, whether it was called off, its word, its steps, and
 * what waits on a person (`status`, merged over a run that waits on nobody).
 */
const runOf = (
  name: string,
  {
    brief = 'Do it.',
    labels = {},
    said,
    cancelledAt,
    pruned,
    status = {},
  }: Partial<Record<'brief' | 'said' | 'cancelledAt', string>> & {
    labels?: Record<string, string>;
    pruned?: boolean;
    status?: Record<string, unknown>;
  } = {},
): Run =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { name, labels },
    spec: { brief },
    status: {
      status: 'running',
      steps: [],
      waitingOnYou: [],
      waitingOnYouWords: [],
      toDecide: null,
      waiting: null,
      holding: null,
      ...(said === undefined ? {} : { cost: { said } }),
      ...(cancelledAt ? { cancelledAt } : {}),
      ...(pruned ? { pruned } : {}),
      ...status,
    },
  }) as unknown as Run;

/** The cell of `run` under the column named `column`. */
const cellOf = (run: Run, column: string): unknown => runCells(run)[RUN_COLUMNS.findIndex((c) => c.name === column)];

test("a run's row is its cells in the columns' order: its name, its word, its brief's first line cut at 56, its cost, its note, what waits on you, its labels by key, its steps", () => {
  assert.deepEqual(
    RUN_COLUMNS.map((c) => c.name),
    ['Name', 'Status', 'Brief', 'Cost', 'Note', 'Waits', 'Labels', 'Steps'],
  );
  assert.deepEqual(
    RUN_COLUMNS.filter((c) => c.priority === 0).map((c) => c.name),
    ['Name', 'Status', 'Brief', 'Cost', 'Note', 'Waits'],
    'the labels and the steps are shown when asked wide',
  );
  const brief = `${'x'.repeat(70)}\nthe rest`;
  const cells = runCells(
    runOf('r-1', {
      brief,
      labels: { team: 'core', area: 'api' },
      said: '$1.20',
      cancelledAt: 'then',
      pruned: true,
      status: { status: 'cancelled' },
    }),
  );
  assert.equal(cells.length, RUN_COLUMNS.length, 'a cell per column');
  assert.deepEqual(cells, ['r-1', 'cancelled', 'x'.repeat(56), '$1.20', 'cancelled, pruned', '', 'area=api,team=core', '']);
  assert.deepEqual(runCells(runOf('r-2')), ['r-2', 'running', 'Do it.', '', '', '', '', ''], 'a run with nothing on it');
});

test('a run whose step signed off blocked says BLOCKED in its status, and waits on you with `nemia decide <run>`', () => {
  const run = runOf('r-blocked', {
    status: {
      status: 'waiting',
      steps: [
        stepOf('build', 'verified ✓', { branch: 'wf/r-blocked/build', spent: { said: '$0.40' } }),
        stepOf('review', 'succeeded · BLOCKED', { note: 'Which database?' }),
      ],
      waitingOnYou: ['review'],
      waitingOnYouWords: ['review'],
    },
  });
  assert.equal(cellOf(run, 'Status'), 'waiting — review succeeded · BLOCKED');
  assert.equal(cellOf(run, 'Waits'), 'waiting on you: review — nemia decide r-blocked');
  assert.equal(cellOf(run, 'Steps'), 'build verified ✓ $0.40 wf/r-blocked/build; review succeeded · BLOCKED · Which database?');
});

test('a run at a gate says what to decide with `nemia approve <run> <step>`, the approval named once', () => {
  const run = runOf('r-gate', {
    status: {
      status: 'awaiting approval',
      steps: [stepOf('plan', 'awaiting approval')],
      waitingOnYou: ['plan'],
      waitingOnYouWords: ['approve plan'],
      toDecide: { kind: 'approve', step: 'plan', said: 'plan has signed off at its gate — nemia approve r-gate plan' },
    },
  });
  assert.equal(cellOf(run, 'Status'), 'awaiting approval — plan awaiting approval');
  assert.equal(cellOf(run, 'Waits'), 'to decide: plan has signed off at its gate — nemia approve r-gate plan');
});

test('a loop out of rounds says `rounds exhausted` in its status, and waits on you', () => {
  const run = runOf('r-rounds', {
    status: {
      status: 'waiting',
      steps: [stepOf('implement', 'verified ✓'), stepOf('review', 'rounds exhausted')],
      waitingOnYou: ['review'],
      waitingOnYouWords: ['review'],
    },
  });
  assert.equal(cellOf(run, 'Status'), 'waiting — review rounds exhausted');
  assert.equal(cellOf(run, 'Waits'), 'waiting on you: review — nemia decide r-rounds');
});

test('a held run says held, with what lifts it: `nemia hold <run> --off`, its advice where a run it names never lands, nothing while it lifts', () => {
  const holding = (runs: object[], waitingOnYou: boolean) => ({
    word: 'held until r-other lands',
    advice: 'resolve it',
    runs,
    waitingOnYou,
  });
  const held = runOf('r-held', { status: { status: 'waiting', holding: holding([{ run: 'r-other', landed: false }], false) } });
  assert.equal(cellOf(held, 'Status'), 'waiting, held');
  assert.equal(cellOf(held, 'Waits'), 'held until r-other lands — nemia hold r-held --off lifts it');
  const never = runOf('r-never', { status: { status: 'waiting', holding: holding([{ run: 'r-other', landed: false }], true) } });
  assert.equal(cellOf(never, 'Waits'), 'held until r-other lands: resolve it');
  const lifting = runOf('r-lifting', { status: { status: 'waiting', holding: holding([{ run: 'r-other', landed: true }], false) } });
  assert.equal(cellOf(lifting, 'Waits'), 'held until r-other lands');
});

test('a run waiting on a run that never lands waits on you with its advice; a session waiting on its harness says for what', () => {
  const run = runOf('r-after', {
    status: {
      status: 'waiting',
      steps: [stepOf('build', 'needs-human', { waitingFor: { words: 'a permission', advice: 'answer it' } })],
      waiting: { runs: [], word: 'waiting on r-gone', advice: 'the store has no run r-gone — nemia cancel r-after', waitingOnYou: true },
    },
  });
  assert.equal(cellOf(run, 'Waits'), 'waiting on you: the store has no run r-gone — nemia cancel r-after');
  assert.equal(cellOf(run, 'Steps'), 'build needs-human: a permission');
});

test('a step notes the questions its closeout asks and what its session at work runs on; an ended attempt says nothing it ran on', () => {
  const latest = (ended: string | null) => ({
    count: 1,
    latest: { ended, release: { kind: 'install', tag: 'v1.2.0' }, harness: { name: 'claude', version: '2.1.0' } },
  });
  const run = runOf('r-asks', {
    status: {
      status: 'waiting',
      steps: [
        stepOf('plan', 'succeeded · BLOCKED', { asks: 2 }),
        stepOf('build', 'working', { attempts: latest(null) }),
        stepOf('done', 'verified ✓', { attempts: latest('succeeded') }),
      ],
    },
  });
  assert.equal(
    cellOf(run, 'Steps'),
    'plan succeeded · BLOCKED · asks 2 questions; build working · on v1.2.0, claude 2.1.0; done verified ✓',
  );
});

test('a run whose result steps have branches names them with `nemia decide <run>`, but not twice where what to decide names every one', () => {
  const landed = runOf('r-landed', { status: { status: 'landed', result: ['wf/r-landed/implement'] } });
  assert.equal(cellOf(landed, 'Waits'), 'result: wf/r-landed/implement — nemia decide r-landed');
  const deciding = runOf('r-decide', {
    status: {
      status: 'succeeded',
      result: ['wf/r-decide/implement'],
      toDecide: { kind: 'result', branches: ['wf/r-decide/implement'], said: 'wf/r-decide/implement is ahead of main' },
    },
  });
  assert.equal(cellOf(deciding, 'Waits'), 'to decide: wf/r-decide/implement is ahead of main');
  const partly = runOf('r-partly', {
    status: {
      status: 'succeeded',
      result: ['wf/r-partly/a', 'wf/r-partly/b'],
      toDecide: { kind: 'result', branches: ['wf/r-partly/a'], said: 'wf/r-partly/a is ahead of main' },
    },
  });
  assert.equal(
    cellOf(partly, 'Waits'),
    'to decide: wf/r-partly/a is ahead of main; result: wf/r-partly/a, wf/r-partly/b — nemia decide r-partly',
    'a result branch what to decide does not name, not being ahead, is still named',
  );
});

test('a page is a Table: its place kept, a row per judged run with its metadata, then a row per run that could not be judged', () => {
  const list = {
    apiVersion: 'nemia/v1',
    kind: 'RunList',
    metadata: { continue: 'r-2' },
    items: [runOf('r-1'), runOf('r-2')],
    unjudged: [
      {
        name: 'r-3',
        error: 'its journal does not read',
        steps: [
          { name: 'build', message: 'unreadable', branch: 'wf/r-3/build' },
          { name: 'review', message: 'pending', branch: null },
        ],
      },
    ],
  } as unknown as RunList;
  const table = runTable(list);
  assert.equal(table.kind, 'Table');
  assert.equal(table.metadata.continue, 'r-2', "the page's place");
  assert.deepEqual(table.columnDefinitions, RUN_COLUMNS);
  assert.deepEqual(
    table.rows.map((row) => row.cells[0]),
    ['r-1', 'r-2', 'r-3'],
  );
  assert.deepEqual(table.rows[0]?.object, {
    kind: 'PartialObjectMetadata',
    apiVersion: 'meta.k8s.io/v1',
    metadata: list.items[0]?.metadata,
  });
  assert.equal(table.rows[2]?.object, undefined, 'a run not judged has no object');
  assert.ok(String(table.rows[2]?.cells[4]).includes('its journal does not read'), 'its note says why');
  assert.equal(table.rows[2]?.cells.length, RUN_COLUMNS.length, 'a cell per column');
  assert.equal(table.rows[2]?.cells[7], 'build unreadable wf/r-3/build; review pending', 'its steps as its record says them');
  assert.equal(Object.hasOwn(runTable({ ...list, metadata: {} }).metadata, 'continue'), false, 'a last page has no place');
});
