/**
 * `wf stats` over a store of seeded records and the runtime itself, `promiseEngine` over an in-memory journal: the numbers `--json`
 * answers, the one line `--line` prints, a check that refused told from one that did not finish (`refusedCheck`), and the refusals of
 * a key and a day it does not take. A run whose check did not finish has not finished; a run whose journal does not read is left out
 * whole, and named.
 *
 * `WF_ROOT` is set before the command line is imported, which reads it as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { PromiseJournal, PromiseRunner } from 'agent-runtime';
import { Engine, promiseEngine } from 'agent-runtime/effect';
import type { Stats } from '../src/runner.ts';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-stats-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
const { main } = await import('../src/cli/main.ts');

const DAY = '2026-09-28';
const at = (hour: number): string => `${DAY}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const SIGNED = { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] };

const tasks = new Map<string, unknown[]>();

/**
 * A task filed at `from` that ran from `from` to `to`: a session signing `closeout` and measured at `costUsd`, or a check exiting
 * `exitCode`, or with `exitCode` null ended without one.
 */
function ran(taskId: string, from: number, to: number, how: { costUsd?: number; closeout?: object; exitCode?: number | null } = {}) {
  const check = how.exitCode !== undefined;
  const passed = !check || how.exitCode === 0;
  tasks.set(taskId, [
    { kind: 'filed', at: at(from), brief: 'Do it.', cwd: ROOT, maxAttempts: 1, harness: check ? 'check' : 'claude' },
    { kind: 'starting', at: at(from), attempt: 1 },
    { kind: 'spawned', at: at(from), attempt: 1 },
    {
      kind: 'ended',
      at: at(to),
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: passed ? 'done' : 'failed',
      reason: 'harness',
      ...(check ? (how.exitCode === null ? {} : { exitCode: how.exitCode }) : { closeout: how.closeout ?? SIGNED }),
    },
    ...(how.costUsd === undefined ? [] : [{ kind: 'measured', at: at(to), attempt: 1, usage: { costUsd: how.costUsd } }]),
    { kind: 'settled', at: at(to), outcome: passed ? 'succeeded' : 'failed' },
  ]);
}

const journal: PromiseJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<PromiseJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};
const runner: PromiseRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = promiseEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal,
    harnesses: { claude: runner, check: runner },
    defaultHarness: 'claude',
  }),
);

const agent = (name: string) => ({ name, keys: [], body: '', given: {} });

function writeRun(id: string, workflow: object[], steps: Record<string, object>, more: object = {}) {
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/repos/one',
      baseRef: 'abc',
      workspace: '/repos/one',
      branch: 'main',
      isolate: true,
      brief: `The brief of ${id}`,
      createdAt: at(0),
      workflowDir: '/repos/one/workflows/build',
      workflow,
      steps,
      ...more,
    }),
  );
}

ran('landed-implement', 1, 2, { costUsd: 2 });
ran('landed-implement-check', 2, 3, { exitCode: 0 });
ran('landed-review', 3, 4, { costUsd: 1, closeout: { ...SIGNED, again: false } });
ran('landed-land', 4, 5, { costUsd: 0.5 });
writeRun(
  'landed',
  [
    { name: 'implement', after: [], body: 'Do it.', check: 'true', agent: agent('ada') },
    { name: 'review', after: ['implement'], body: 'Review it.', loop: 'implement', rounds: 3, agent: agent('agora') },
    { name: 'land', after: ['review'], body: 'Land it.', workspace: 'main' },
  ],
  {
    implement: { taskId: 'landed-implement', check: { taskId: 'landed-implement-check' } },
    review: { taskId: 'landed-review' },
    land: { taskId: 'landed-land', landed: { commit: 'def' } },
  },
);

ran('checked-build', 1, 2);
ran('checked-build-check', 2, 3, { exitCode: 1 });
ran('checked-build-2', 3, 4);
ran('checked-build-2-check', 4, 5, { exitCode: null });
writeRun(
  'checked',
  [{ name: 'build', after: [], body: 'Build it.', check: 'false' }],
  {
    build: {
      taskId: 'checked-build-2',
      check: { taskId: 'checked-build-2-check' },
      tries: [{ taskId: 'checked-build', then: 'retries', check: { taskId: 'checked-build-check' } }],
    },
  },
  { factory: 'other', repo: '/repos/two', workspace: '/repos/two' },
);

tasks.set('spoilt-build', [{ kind: 'measured', at: at(1), attempt: 1, usage: { turns: 'three' } }]);
writeRun('spoilt', [{ name: 'build', after: [], body: 'Build it.' }], { build: { taskId: 'spoilt-build' } });

const printedBy = async (t: TestContext, argv: string[]) => {
  const out: string[] = [];
  const log = t.mock.method(console, 'log', (...a: unknown[]) => void out.push(a.map(String).join(' ')));
  try {
    await main(argv, e);
  } finally {
    log.mock.restore();
  }
  return out.join('\n');
};

test('wf stats --json answers the numbers of the store: a landing on its first try, its cost and rounds, and each check by its verdict', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--from', DAY, '--to', DAY])) as Stats;
  assert.equal(s.all.total.runs, 1, 'a run whose check did not finish waits for wf retry --recheck: it has not finished');
  assert.deepEqual(
    [s.all.total.runs, s.all.total.landed, s.all.total.firstTry, s.all.total.rounds, s.all.total.costPerLanded, s.all.total.timePerLanded],
    [1, 1, 1, 1, 3.5, 4 * 3_600_000],
  );
  assert.equal(s.all.total.tries, 5);
  const build = s.all.steps.find((row) => row.step === 'build');
  assert.deepEqual(
    build?.checks,
    { passed: 0, refused: 1, unfinished: 1 },
    'a check ended with no exit code did not finish; exit 1 refused',
  );
  assert.equal(build?.costUsd, null, 'no session of build was measured');
  assert.equal(s.all.steps.find((row) => row.step === 'implement')?.agent, 'ada');
  assert.deepEqual(s.unreadable, ['spoilt'], 'a run whose journal does not read is left out whole, and named');
});

test('wf stats --by factory answers a group per factory, and --factory keeps one', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--by', 'factory'])) as Stats;
  assert.deepEqual(
    s.groups.map((g) => [g.key, g.total.tries]),
    [
      ['default', 3],
      ['other', 2],
    ],
  );
  const only = JSON.parse(await printedBy(t, ['stats', '--json', '--factory', 'other'])) as Stats;
  assert.equal(only.all.total.tries, 2);
});

test('wf stats --line prints one line, and wf stats prints the tiles and the day', async (t) => {
  const line = await printedBy(t, ['stats', '--line']);
  assert.equal(line.split('\n').length, 1, line);
  assert.match(line, /^stats, last 14 days/);
  const words = await printedBy(t, ['stats', '--from', DAY, '--to', DAY]);
  assert.match(words, /^last 14 days \(/);
  assert.match(words, new RegExp(`^${DAY}\\s+1\\s+1\\s+1\\s+100%\\s+\\$3\\.50\\s+4h00m`, 'm'));
  assert.match(words, /left out, a journal of each not reading \(wf ls says why\): spoilt/);
});

test('wf stats --help prints each flag and what it takes, and is refused nothing', async (t) => {
  const help = await printedBy(t, ['stats', '--help']);
  assert.match(help, /^wf stats \[--from <day>\]/);
  for (const flag of ['from', 'to', 'by', 'agent', 'step', 'factory', 'workflow', 'repo', 'line', 'json']) {
    assert.match(help, new RegExp(`^\\s+--${flag}\\s+\\S`, 'm'), `--${flag} is said with what it takes`);
  }
  assert.match(help, /what the rows go by: agent, step, factory, workflow, repo/);
  assert.match(help, /never 0/);
});

test('wf stats refuses a key to go by it does not know, and a day that is not one, with exit 2 and what it takes', async (t) => {
  for (const [argv, want] of [
    [['--by', 'colour'], /^--by takes one of agent, step, factory, workflow, repo, not "colour"\.$/],
    [['--from', '2026-13-40'], /^--from takes a day as YYYY-MM-DD, in UTC/],
  ] as const) {
    const err = await printedBy(t, ['stats', ...argv]).then(
      () => undefined,
      (thrown: unknown) => thrown as Error & { exitCode?: number },
    );
    assert.ok(err, `wf stats ${argv.join(' ')} is refused`);
    assert.match(err.message, want);
    assert.equal(err.exitCode, 2);
  }
});
