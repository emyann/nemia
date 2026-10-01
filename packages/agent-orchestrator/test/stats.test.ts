/**
 * `wf stats` over a store of seeded records and the runtime itself, `promiseEngine` over an in-memory journal: the numbers `--json`
 * answers, the one line `--line` prints, a check that refused told from one that did not finish (`refusedCheck`), the calls a session was
 * refused on a harness that records them, and the refusals of a key and a day it does not take. A run whose check did not finish has not finished; a run whose journal does not read is left out
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
const at = (hour: number, day = DAY): string => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
const SIGNED = { outcome: 'done', summary: 'Did it.', needs: null, artifacts: [] };

const tasks = new Map<string, unknown[]>();

/**
 * A task filed at `from` that ran from `from` to `to`, on `day` or `DAY`: a session signing `closeout` and measured at `costUsd`, or a
 * check exiting `exitCode`, or with `exitCode` null ended without one.
 */
function ran(
  taskId: string,
  from: number,
  to: number,
  how: { costUsd?: number; closeout?: object; exitCode?: number | null; day?: string } = {},
) {
  const check = how.exitCode !== undefined;
  const passed = !check || how.exitCode === 0;
  tasks.set(taskId, [
    { kind: 'filed', at: at(from, how.day), brief: 'Do it.', cwd: ROOT, maxAttempts: 1, harness: check ? 'check' : 'claude' },
    { kind: 'starting', at: at(from, how.day), attempt: 1 },
    { kind: 'spawned', at: at(from, how.day), attempt: 1 },
    {
      kind: 'ended',
      at: at(to, how.day),
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: passed ? 'done' : 'failed',
      reason: 'harness',
      ...(check ? (how.exitCode === null ? {} : { exitCode: how.exitCode }) : { closeout: how.closeout ?? SIGNED }),
    },
    ...(how.costUsd === undefined ? [] : [{ kind: 'measured', at: at(to, how.day), attempt: 1, usage: { costUsd: how.costUsd } }]),
    { kind: 'settled', at: at(to, how.day), outcome: passed ? 'succeeded' : 'failed' },
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

const REVIEWED = '/repos/one/workflows/review';
const SKILL = 'review-a-change';
const reviewStep = {
  name: 'review',
  after: [],
  body: 'You are Agora.\n\nReview it.',
  agent: { ...agent('agora'), body: 'Review it.', instructions: 'You are Agora.', skills: [SKILL] },
};

/** A run of the review workflow created at `createdAt`, its skill rendered as `text` where given, its review's task `taskId` if given. */
function reviewRun(id: string, createdAt: string, text?: string, taskId?: string) {
  writeRun(id, [reviewStep], taskId ? { review: { taskId } } : {}, { createdAt, workflowDir: REVIEWED });
  if (text === undefined) return;
  const dir = path.join(ROOT, 'runs', id, 'agents', 'review', 'nemia-agora', 'skills', SKILL);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${SKILL}\ndescription: Review a change.\n---\n${text}\n`);
}

tasks.set('marks-2-review', [{ kind: 'measured', at: at(1), attempt: 1, usage: { turns: 'three' } }]);
reviewRun('marks-1', '2026-09-25T08:00:00.000Z', 'Read the diff.');
reviewRun('marks-2', '2026-09-25T23:59:00.000Z', 'Read the diff, then run the suite.', 'marks-2-review');
reviewRun('marks-3', '2026-09-26T08:00:00.000Z', 'Read the diff, then run the suite.');
reviewRun('marks-4', '2026-09-27T08:00:00.000Z');

type Denial = { tool: string; what?: string };

/** A session task that ended on `day` at `hour`, an attempt per list of the calls it was denied, the last one succeeding. */
function deniedSession(taskId: string, day: string, hour: number, attempts: Denial[][]) {
  const when = at(hour, day);
  tasks.set(taskId, [
    { kind: 'filed', at: when, brief: 'Do it.', cwd: ROOT, maxAttempts: attempts.length, harness: 'claude' },
    ...attempts.flatMap((denials, i) => [
      { kind: 'starting', at: when, attempt: i + 1 },
      { kind: 'spawned', at: when, attempt: i + 1 },
      {
        kind: 'ended',
        at: when,
        attempt: i + 1,
        sessionId: `ae/${taskId}/${i + 1}`,
        observed: i === attempts.length - 1 ? 'done' : 'failed',
        reason: 'harness',
        closeout: SIGNED,
        ...(denials.length ? { denials } : {}),
      },
    ]),
    { kind: 'settled', at: when, outcome: 'succeeded' },
  ]);
}

const DENIED_DAY = '2026-09-22';
const UNMEASURED_DAY = '2026-09-21';
const QUIET_DAY = '2026-09-20';
const writeX = { tool: 'Write', what: '/x' };
const rm = { tool: 'Bash', what: 'rm' };
deniedSession('denied-write', DENIED_DAY, 1, [[writeX], [writeX, { tool: 'Bash', what: 'git push' }]]);
deniedSession('denied-write-2', DENIED_DAY, 2, [[rm]]);
ran('denied-write-2-check', 2, 3, { exitCode: null, day: DENIED_DAY });
ran('denied-write-2-check-2', 3, 4, { exitCode: 0, day: DENIED_DAY });
deniedSession('denied-codex', UNMEASURED_DAY, 1, [[rm]]);
deniedSession('denied-bg', UNMEASURED_DAY, 2, [[rm]]);
deniedSession('denied-quiet', QUIET_DAY, 1, [[]]);
writeRun(
  'denied',
  [
    { name: 'write', after: [], body: 'Write it.', agent: agent('ada') },
    { name: 'codex', after: [], body: 'Do it.', harness: 'codex' },
    { name: 'bg', after: [], body: 'Do it.', background: true },
    { name: 'quiet', after: [], body: 'Do it.' },
  ],
  {
    write: {
      taskId: 'denied-write-2',
      check: { taskId: 'denied-write-2-check-2' },
      tries: [
        { taskId: 'denied-write', then: 'retries' },
        { taskId: 'denied-write-2', then: 'retries', check: { taskId: 'denied-write-2-check' } },
      ],
    },
    codex: { taskId: 'denied-codex' },
    bg: { taskId: 'denied-bg' },
    quiet: { taskId: 'denied-quiet' },
  },
  { factory: 'denials', createdAt: `${QUIET_DAY}T00:00:00.000Z` },
);

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
  assert.deepEqual(s.unreadable, ['marks-2', 'spoilt'], 'a run whose journal does not read is left out whole, and named');
});

test('wf stats --by factory answers a group per factory, and --factory keeps one', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--by', 'factory'])) as Stats;
  assert.deepEqual(
    s.groups.map((g) => [g.key, g.total.tries]),
    [
      ['default', 3],
      ['denials', 6],
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
  assert.match(words, /left out, a journal of each not reading \(wf ls says why\): marks-2, spoilt/);
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

test('wf stats marks the day a run froze a rendered skill that differs from the run before, its journal read or not', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--workflow', 'review'])) as Stats;
  assert.deepEqual(
    s.all.marks,
    [
      {
        run: 'marks-2',
        factory: 'default',
        workflow: 'review',
        repo: '/repos/one',
        day: '2026-09-25',
        kind: 'skill',
        name: SKILL,
        steps: ['review'],
        agents: ['agora'],
        since: 'marks-1',
      },
    ],
    'marks-2 changed the skill on the day it was created, though its journal does not read; marks-3 kept it; marks-4 rendered none',
  );
  const words = await printedBy(t, ['stats', '--workflow', 'review']);
  assert.match(words, new RegExp(`^2026-09-25\\s+skill ${SKILL}\\s+marks-2\\s+marks-1$`, 'm'));
});

test('wf stats counts each call a session was refused, per measured try; a codex, a background or a recheck try is not measured', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--factory', 'denials', '--from', QUIET_DAY, '--to', DENIED_DAY])) as Stats;
  const perDay = Object.fromEntries(s.all.days.map((d) => [d.day, d.deniedPerTry]));
  assert.deepEqual(
    perDay,
    { [QUIET_DAY]: 0, [UNMEASURED_DAY]: null, [DENIED_DAY]: 2 },
    'four calls over the two sessions of write, its recheck not counted again; codex and background are not measured, not 0',
  );
  const write = s.all.steps.find((row) => row.step === 'write');
  assert.deepEqual([write?.tries, write?.deniedCalls, write?.deniedTries], [3, 4, 2]);
  assert.deepEqual(write?.denials, [
    { call: 'Write(/x)', count: 2 },
    { call: 'Bash(git push)', count: 1 },
    { call: 'Bash(rm)', count: 1 },
  ]);
  for (const name of ['codex', 'bg']) {
    const row = s.all.steps.find((r) => r.step === name);
    assert.deepEqual([row?.deniedCalls, row?.deniedTries, row?.denials], [null, 0, []], `${name} records no denial`);
  }
  const words = await printedBy(t, ['stats', '--factory', 'denials', '--from', QUIET_DAY, '--to', DENIED_DAY]);
  assert.match(words, new RegExp(`^${DENIED_DAY}\\s.*\\s2/try$`, 'm'));
  assert.match(words, new RegExp(`^${UNMEASURED_DAY}\\s.*\\s—$`, 'm'));
  assert.match(words, new RegExp(`^${QUIET_DAY}\\s.*\\s0/try$`, 'm'));
  assert.match(words, /^write\s+ada\s+3\s.*\s4 \(2 of 3\)$/m, 'the step row says how many of its tries were measured');
  assert.match(words, /^write\s+ada\s+Write\(\/x\)\s+2$/m);
  const line = await printedBy(t, ['stats', '--line', '--factory', 'denials']);
  assert.match(line, /, \S+ \(\S+\) calls denied$/);
});
