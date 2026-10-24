/**
 * `nemia stats` over a store of seeded records and the runtime itself, `plainEngine` over an in-memory journal: the numbers `--json`
 * answers, the one line `--line` prints, a check that refused told from one that did not finish (`refusedCheck`), the calls a session was
 * refused on a harness that records them, the skills a session loaded where each of its ends says, and the refusals of a key and a day
 * it does not take. A run whose check did not finish has not finished; a run whose journal does not read is left out whole, and named.
 *
 * `WF_ROOT` is set before the command line is imported, which reads it as the module loads.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { asyncStore, type AsyncJournal, asyncOps, type AsyncRunner } from './promised.ts';
import { Engine } from 'agent-runtime';
import type { Stats } from '../src/runner.ts';
import { scratch } from './scratch.ts';
import { plainEngine } from './promised.ts';

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

const journal: AsyncJournal = {
  async append(taskId, event) {
    tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
  },
  async read(taskId) {
    return [...(tasks.get(taskId) ?? [])] as Awaited<ReturnType<AsyncJournal['read']>>;
  },
  async list() {
    return [...tasks.keys()].sort();
  },
  async feed() {
    return { entries: [], cursor: 0 };
  },
};
const runner: AsyncRunner = {
  async spawn() {},
  async observe() {
    return new Map();
  },
  async stop() {},
  async logs() {
    return '';
  },
};
const e = plainEngine(
  Engine.layer({
    root: fs.mkdtempSync(path.join(ROOT, 'engine-')),
    journal: asyncStore(journal),
    harnesses: { claude: asyncOps(runner), check: asyncOps(runner) },
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

tasks.set('spoilt-build', [{ kind: 'measured', at: at(1), attempt: 1, usage: { responses: 'three' } }]);
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

tasks.set('marks-2-review', [{ kind: 'measured', at: at(1), attempt: 1, usage: { responses: 'three' } }]);
reviewRun('marks-1', '2026-09-25T08:00:00.000Z', 'Read the diff.');
reviewRun('marks-2', '2026-09-25T23:59:00.000Z', 'Read the diff, then run the suite.', 'marks-2-review');
reviewRun('marks-3', '2026-09-26T08:00:00.000Z', 'Read the diff, then run the suite.');
reviewRun('marks-4', '2026-09-27T08:00:00.000Z');

type Denial = { tool: string; what?: string };

/** A session task that ended on `day` at `hour`, an attempt per object its end says beside its closeout, the last one succeeding. */
function endedSession(taskId: string, day: string, hour: number, attempts: object[]) {
  const when = at(hour, day);
  tasks.set(taskId, [
    { kind: 'filed', at: when, brief: 'Do it.', cwd: ROOT, maxAttempts: attempts.length, harness: 'claude' },
    ...attempts.flatMap((said, i) => [
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
        ...said,
      },
    ]),
    { kind: 'settled', at: when, outcome: 'succeeded' },
  ]);
}

/** A session task that ended on `day` at `hour`, an attempt per list of the calls it was denied, the last one succeeding. */
const deniedSession = (taskId: string, day: string, hour: number, attempts: Denial[][]) =>
  endedSession(
    taskId,
    day,
    hour,
    attempts.map((denials) => (denials.length ? { denials } : {})),
  );

const DENIED_DAY = '2026-09-26';
const UNMEASURED_DAY = '2026-09-25';
const QUIET_DAY = '2026-09-24';
const BG_DAY = '2026-09-23';
const writeX = { tool: 'Write', what: '/x' };
const rm = { tool: 'Bash', what: 'rm' };
deniedSession('denied-write', DENIED_DAY, 1, [[writeX], [writeX, { tool: 'Bash', what: 'git push' }]]);
deniedSession('denied-write-2', DENIED_DAY, 2, [[rm]]);
ran('denied-write-2-check', 2, 3, { exitCode: null, day: DENIED_DAY });
ran('denied-write-2-check-2', 3, 4, { exitCode: 0, day: DENIED_DAY });
deniedSession('denied-codex', UNMEASURED_DAY, 1, [[rm]]);
deniedSession('denied-bg', UNMEASURED_DAY, 2, [[rm]]);
deniedSession('denied-quiet', QUIET_DAY, 1, [[]]);
deniedSession('denied-before-jobs', BG_DAY, 18, [[]]);
const RULED = 'write-a-spec';
const RULES = [
  { id: 'no-write', says: 'Write nothing at the root', breaks: ['Edit(//x)'] },
  { id: 'no-curl', says: 'Never fetch', breaks: ['Bash(curl:*)'] },
  { id: 'no-rm', says: 'Never remove', breaks: ['Bash(rm:*)'] },
];
/** The skill `name` as `nemia start` rendered it for the denied run's write step, its `rules.json` written as `rules` where given. */
function renderedForWrite(name: string, rules?: string) {
  const dir = path.join(ROOT, 'runs', 'denied', 'agents', 'write', 'nemia-ada', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill.\n---\nDo it.\n`);
  if (rules !== undefined) fs.writeFileSync(path.join(dir, 'rules.json'), rules);
}
renderedForWrite(RULED, JSON.stringify({ rules: RULES }));
renderedForWrite('look');
renderedForWrite('unread', '{ "rules": [{ "id": "x" }] }');
renderedForWrite('y', JSON.stringify({ rules: [{ id: 'no-wget', says: 'Never download', breaks: ['Bash(wget:*)'] }] }));
writeRun(
  'denied',
  [
    { name: 'write', after: [], body: 'Write it.', agent: { ...agent('ada'), skills: [RULED, 'look', 'unread', 'app:y'] } },
    { name: 'codex', after: [], body: 'Do it.', harness: 'codex' },
    { name: 'bg', after: [], body: 'Do it.', background: true },
    { name: 'quiet', after: [], body: 'Do it.' },
    { name: 'before-jobs', after: [], body: 'Do it.' },
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
    'before-jobs': { taskId: 'denied-before-jobs' },
  },
  { factory: 'denials', createdAt: `${BG_DAY}T00:00:00.000Z` },
);

const SKILLS_DAY = '2026-09-20';
const NO_SKILL_DAY = '2026-09-21';
const UNSAID_DAY = '2026-09-22';
endedSession('skills-spec', SKILLS_DAY, 1, [{ skills: ['write-a-spec'] }, { skills: ['write-a-spec', 'look'] }]);
endedSession('skills-spec-2', SKILLS_DAY, 2, [{ skills: ['look'] }, {}]);
ran('skills-spec-2-check', 2, 3, { exitCode: null, day: SKILLS_DAY });
ran('skills-spec-2-check-2', 3, 4, { exitCode: 0, day: SKILLS_DAY });
endedSession('skills-quiet', NO_SKILL_DAY, 1, [{ skills: [] }]);
endedSession('skills-old', UNSAID_DAY, 1, [{}]);
writeRun(
  'skills',
  [
    { name: 'spec', after: [], body: 'Write it.', check: 'true', agent: agent('seldon') },
    { name: 'quiet', after: [], body: 'Do it.' },
    { name: 'old', after: [], body: 'Do it.' },
  ],
  {
    spec: {
      taskId: 'skills-spec-2',
      check: { taskId: 'skills-spec-2-check-2' },
      tries: [
        { taskId: 'skills-spec', then: 'retries' },
        { taskId: 'skills-spec-2', then: 'retries', check: { taskId: 'skills-spec-2-check' } },
      ],
    },
    quiet: { taskId: 'skills-quiet' },
    old: { taskId: 'skills-old' },
  },
  { factory: 'skills', createdAt: `${SKILLS_DAY}T00:00:00.000Z` },
);

const TOUCHED_DAY = '2026-09-16';
endedSession('touched-design', TOUCHED_DAY, 1, [{ skills: [], files: ['apps/web/src/a.tsx'] }]);
endedSession('touched-design-2', TOUCHED_DAY, 2, [{ skills: ['change-the-board', 'shadcn', 'y'], files: ['apps/web/src/b.tsx'] }]);
for (const [name, applies] of [
  ['change-the-board', 'applies: ["apps/web/**"]\n'],
  ['shadcn', ''],
  ['y', 'applies: ["apps/web/**"]\n'],
]) {
  const dir = path.join(ROOT, 'runs', 'touched', 'agents', 'design', 'nemia-seldon', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill.\n${applies}---\nDo it.\n`);
}
writeRun(
  'touched',
  [{ name: 'design', after: [], body: 'Design it.', agent: { ...agent('seldon'), skills: ['change-the-board', 'shadcn', 'app:y'] } }],
  { design: { taskId: 'touched-design-2', tries: [{ taskId: 'touched-design', then: 'retries' }] } },
  { factory: 'touched', createdAt: `${TOUCHED_DAY}T00:00:00.000Z` },
);

const TALLY_DAY = '2026-09-18';
const UNTALLIED_DAY = '2026-09-19';
ran('tallied-triage', 1, 2, { day: TALLY_DAY, closeout: { ...SIGNED, issues: [{ open: true }, { open: false }] } });
ran('untallied-triage', 1, 2, { day: UNTALLIED_DAY });
for (const [id, day] of [
  ['tallied', TALLY_DAY],
  ['untallied', UNTALLIED_DAY],
])
  writeRun(
    id,
    [{ name: 'triage', after: [], body: 'Sort them.', tally: ['issues', 'issues.open'], agent: agent('sorter') }],
    { triage: { taskId: `${id}-triage` } },
    { factory: 'tallies', createdAt: `${day}T00:00:00.000Z` },
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

test('nemia stats --json answers the numbers of the store: a landing on its first try, its cost and rounds, and each check by its verdict', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--from', DAY, '--to', DAY])) as Stats;
  assert.equal(s.all.total.runs, 1, 'a run whose check did not finish waits for nemia retry --recheck: it has not finished');
  assert.deepEqual(
    [s.all.total.runs, s.all.total.landed, s.all.total.firstTry, s.all.total.rounds, s.all.total.costPerLanded, s.all.total.timePerLanded],
    [1, 1, 1, 1, 3.5, 4 * 3_600_000],
  );
  assert.equal(s.all.total.tries, 5);
  const build = s.all.steps.find((row) => row.step === 'build');
  assert.deepEqual(build?.checks, { passed: 0, refused: 1, unfinished: 1 }, 'no exit code is unfinished; exit 1 refused');
  assert.equal(build?.costUsd, null, 'no session of build was measured');
  assert.equal(s.all.steps.find((row) => row.step === 'implement')?.agent, 'ada');
  assert.deepEqual(s.unreadable, ['marks-2', 'spoilt'], 'a run whose journal does not read is left out whole, and named');
});

test('nemia stats --by factory answers a group per factory, and --factory keeps one', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--by', 'factory'])) as Stats;
  assert.deepEqual(
    s.groups.map((g) => [g.key, g.total.tries]),
    [
      ['default', 3],
      ['denials', 7],
      ['other', 2],
      ['skills', 5],
      ['tallies', 2],
      ['touched', 2],
    ],
  );
  const only = JSON.parse(await printedBy(t, ['stats', '--json', '--factory', 'other'])) as Stats;
  assert.equal(only.all.total.tries, 2);
});

test('nemia stats --line prints one line, and nemia stats prints the tiles and the day', async (t) => {
  const line = await printedBy(t, ['stats', '--line']);
  assert.equal(line.split('\n').length, 1, line);
  assert.match(line, /^stats, last 14 days/);
  const words = await printedBy(t, ['stats', '--from', DAY, '--to', DAY]);
  assert.match(words, /^last 14 days \(/);
  assert.match(words, new RegExp(`^${DAY}\\s+1\\s+1\\s+1\\s+100%\\s+\\$3\\.50\\s+4h00m`, 'm'));
  assert.ok(words.includes('left out, a journal of each not reading'), words);
  assert.ok(words.includes('(nemia ls says why): marks-2, spoilt'), words);
});

test('nemia stats --help prints each flag and what it takes, and is refused nothing', async (t) => {
  const help = await printedBy(t, ['stats', '--help']);
  assert.match(help, /^nemia stats \[--from <day>\]/);
  for (const flag of ['from', 'to', 'by', 'agent', 'step', 'factory', 'workflow', 'repo', 'line', 'json']) {
    assert.match(help, new RegExp(`^\\s+--${flag}\\s+\\S`, 'm'), `--${flag} is said with what it takes`);
  }
  assert.match(help, /what the rows go by: agent, step, factory, workflow, repo/);
  assert.match(help, /never 0/);
});

test('nemia stats refuses a key to go by it does not know, and a day that is not one, with exit 2 and what it takes', async (t) => {
  for (const [argv, want] of [
    [['--by', 'colour'], /^--by takes one of agent, step, factory, workflow, repo, not "colour"\.$/],
    [['--from', '2026-13-40'], /^--from takes a day as YYYY-MM-DD, in UTC/],
  ] as const) {
    const err = await printedBy(t, ['stats', ...argv]).then(
      () => undefined,
      (thrown: unknown) => thrown as Error & { exitCode?: number },
    );
    assert.ok(err, `nemia stats ${argv.join(' ')} is refused`);
    assert.match(err.message, want);
    assert.equal(err.exitCode, 2);
  }
});

test('nemia stats marks the day a run froze a rendered skill that differs from the run before, its journal read or not', async (t) => {
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

test('nemia stats counts each call a session was refused, per measured try; a codex, background or recheck try is unmeasured', async (t) => {
  const s = JSON.parse(await printedBy(t, ['stats', '--json', '--factory', 'denials', '--from', BG_DAY, '--to', DENIED_DAY])) as Stats;
  const perDay = Object.fromEntries(s.all.days.map((d) => [d.day, d.deniedPerTry]));
  assert.deepEqual(
    perDay,
    { [BG_DAY]: null, [QUIET_DAY]: 0, [UNMEASURED_DAY]: null, [DENIED_DAY]: 2 },
    'four calls over the two sessions of write, its recheck not counted again; codex, background and a pre-job session are unmeasured',
  );
  const write = s.all.steps.find((row) => row.step === 'write');
  assert.deepEqual([write?.tries, write?.deniedCalls, write?.deniedTries], [3, 4, 2]);
  assert.deepEqual(write?.denials, [
    { call: 'Write(/x)', count: 2 },
    { call: 'Bash(git push)', count: 1 },
    { call: 'Bash(rm)', count: 1 },
  ]);
  for (const name of ['codex', 'bg', 'before-jobs']) {
    const row = s.all.steps.find((r) => r.step === name);
    assert.deepEqual([row?.deniedCalls, row?.deniedTries, row?.denials], [null, 0, []], `${name} records no denial`);
  }
  const words = await printedBy(t, ['stats', '--factory', 'denials', '--from', BG_DAY, '--to', DENIED_DAY]);
  assert.match(words, new RegExp(`^${BG_DAY}\\s.*\\s—\\s+—$`, 'm'), 'the last column is the skills loaded, unmeasured here');
  assert.match(words, new RegExp(`^${DENIED_DAY}\\s.*\\s2/try\\s+—$`, 'm'));
  assert.match(words, new RegExp(`^${UNMEASURED_DAY}\\s.*\\s—\\s+—$`, 'm'));
  assert.match(words, new RegExp(`^${QUIET_DAY}\\s.*\\s0/try\\s+—$`, 'm'));
  assert.match(words, /^write\s+ada\s+3\s.*\s4 \(2 of 3\)\s+—$/m, 'the step row says how many of its tries were measured');
  assert.match(words, /^write\s+ada\s+Write\(\/x\)\s+2$/m);
  const line = await printedBy(t, ['stats', '--line', '--factory', 'denials']);
  assert.match(line, /, \S+ \(\S+\) calls denied, /);
});

test("nemia stats counts each rule a step's frozen skills declare, kept or broken per measured try; rules that do not read count none", async (t) => {
  const range = ['--factory', 'denials', '--from', BG_DAY, '--to', DENIED_DAY];
  const s = JSON.parse(await printedBy(t, ['stats', '--json', ...range])) as Stats;
  const write = s.all.steps.find((row) => row.step === 'write');
  assert.deepEqual(
    write?.rules,
    [
      { skill: RULED, rule: 'no-rm', says: 'Never remove', kept: 1, broken: 1 },
      { skill: RULED, rule: 'no-write', says: 'Write nothing at the root', kept: 1, broken: 1 },
      { skill: 'app:y', rule: 'no-wget', says: 'Never download', kept: 2, broken: 0 },
      { skill: RULED, rule: 'no-curl', says: 'Never fetch', kept: 2, broken: 0 },
    ],
    "write's two sessions, its recheck not counted again; look declares none, and unread's rules.json does not read; a skill named with its folder, frozen as `y`, has its rules said as its line writes it",
  );
  assert.deepEqual(s.all.steps.find((row) => row.step === 'quiet')?.rules, [], 'a step given no skill');
  const words = await printedBy(t, ['stats', ...range]);
  assert.match(words, /^step\s+agent\s+skill\s+rule\s+kept\s+broken$/m);
  assert.match(words, new RegExp(`^write\\s+ada\\s+${RULED}\\s+no-write\\s+1\\s+1$`, 'm'));
  assert.match(words, new RegExp(`^write\\s+ada\\s+${RULED}\\s+no-curl\\s+2\\s+0$`, 'm'));
});

test('nemia stats counts each skill a session loaded, per try whose ends all say; a recheck, or one end unsaid, is unmeasured', async (t) => {
  const range = ['--factory', 'skills', '--from', SKILLS_DAY, '--to', UNSAID_DAY];
  const s = JSON.parse(await printedBy(t, ['stats', '--json', ...range])) as Stats;
  assert.deepEqual(
    Object.fromEntries(s.all.days.map((d) => [d.day, d.skillsPerTry])),
    { [SKILLS_DAY]: 3, [NO_SKILL_DAY]: 0, [UNSAID_DAY]: null },
    "three loads over spec's first try: its second has an end that does not say, and its recheck has no session of its own",
  );
  const row = (name: string) => s.all.steps.find((r) => r.step === name);
  const spec = row('spec');
  assert.deepEqual([spec?.tries, spec?.skillLoads, spec?.skillTries], [3, 3, 1]);
  assert.deepEqual(spec?.skills, [
    { skill: 'write-a-spec', count: 2, tries: 1, touched: null, loadedWhenTouched: null },
    { skill: 'look', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
  ]);
  assert.deepEqual([row('quiet')?.skillLoads, row('quiet')?.skillTries, row('quiet')?.skills], [0, 1, []], 'a measured empty list');
  assert.deepEqual([row('old')?.skillLoads, row('old')?.skillTries, row('old')?.skills], [null, 0, []], 'an end that does not say');
  const words = await printedBy(t, ['stats', ...range]);
  assert.match(words, /^ {2}skills\s+\S+\s+\(\S+\)$/m, 'a tile');
  assert.match(words, new RegExp(`^${SKILLS_DAY}\\s.*\\s3/try$`, 'm'));
  assert.match(words, new RegExp(`^${NO_SKILL_DAY}\\s.*\\s0/try$`, 'm'));
  assert.match(words, new RegExp(`^${UNSAID_DAY}\\s.*\\s—$`, 'm'));
  assert.match(words, /^spec\s+seldon\s+3\s.*\s3 \(1 of 3\)$/m, 'the step row says how many of its tries were measured');
  assert.match(words, /^old\s+—\s+1\s.*\s—$/m);
  assert.match(words, /^step\s+agent\s+skill\s+loads\s+tries\s+when touched$/m);
  assert.match(words, /^spec\s+seldon\s+write-a-spec\s+2\s+1\s+—$/m);
  assert.match(words, /^spec\s+seldon\s+look\s+1\s+1\s+—$/m);
  const line = await printedBy(t, ['stats', '--line', '--factory', 'skills']);
  assert.match(line, /, \S+ \(\S+\) calls denied, \S+ \(\S+\) skills loaded$/);
});

test("nemia stats counts the tries that touched a frozen skill's paths and how many of them loaded it, read off the sessions' ends", async (t) => {
  const range = ['--factory', 'touched', '--from', TOUCHED_DAY, '--to', TOUCHED_DAY];
  const s = JSON.parse(await printedBy(t, ['stats', '--json', ...range])) as Stats;
  assert.deepEqual(
    s.all.steps.find((r) => r.step === 'design')?.skills,
    [
      { skill: 'app:y', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
      { skill: 'change-the-board', count: 1, tries: 1, touched: 2, loadedWhenTouched: 1 },
      { skill: 'shadcn', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
    ],
    'both tries touched apps/web and one loaded change-the-board; shadcn declares no path; a skill named with its folder, frozen and loaded as `y`, is counted as its line writes it',
  );
  const words = await printedBy(t, ['stats', ...range]);
  assert.match(words, /^design\s+seldon\s+change-the-board\s+1\s+1\s+1 of 2$/m);
  assert.match(words, /^design\s+seldon\s+shadcn\s+1\s+1\s+—$/m);
});

test("nemia stats totals each tally a step froze over its closeouts, per day and over the range; a day with no closeout's value is —, never 0", async (t) => {
  const range = ['--factory', 'tallies', '--from', TALLY_DAY, '--to', UNTALLIED_DAY];
  const s = JSON.parse(await printedBy(t, ['stats', '--json', ...range])) as Stats;
  assert.deepEqual(
    s.all.tallies.map((row) => [row.step, row.tally, row.total, row.days]),
    [
      [
        'triage',
        'issues',
        { sum: 2, tries: 1 },
        [
          { day: TALLY_DAY, sum: 2, tries: 1 },
          { day: UNTALLIED_DAY, sum: null, tries: 0 },
        ],
      ],
      [
        'triage',
        'issues.open',
        { sum: 1, tries: 1 },
        [
          { day: TALLY_DAY, sum: 1, tries: 1 },
          { day: UNTALLIED_DAY, sum: null, tries: 0 },
        ],
      ],
    ],
    'the session that signed no issues measured none',
  );
  const words = await printedBy(t, ['stats', ...range]);
  assert.match(words, /^day\s+step\s+tally\s+sum\s+tries$/m);
  assert.match(words, new RegExp(`^${TALLY_DAY}\\s+triage\\s+issues\\.open\\s+1\\s+1$`, 'm'));
  assert.match(words, new RegExp(`^${UNTALLIED_DAY}\\s+triage\\s+issues\\s+—\\s+0$`, 'm'));
  assert.match(words, /^all\s+triage\s+issues\s+2\s+1$/m);
});
