/**
 * The calls a try was refused, the skills it loaded and was due to load, and the rules it kept and broke (`discipline.ts`), as tables:
 * every call of every ended attempt, one per call, measured only on a harness whose sessions record them and on a session that ran as a
 * job (`JOBS_SINCE`); every skill of every ended attempt, measured only where each ended attempt says; the skills whose paths a try
 * touched; and a rule broken by a call the try was denied that one of its `breaks` matches, as a `disallowedTools:` rule matches a call,
 * kept otherwise, and counted on no try whose denials were not measured.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOBS_SINCE,
  deniedCallsOf,
  deniesRecorded,
  filesTouchedOf,
  ranAsJob,
  ruleRowsOf,
  rulesOfTry,
  skillRowsOf,
  skillsDueOf,
  skillsLoadedOf,
} from './discipline.ts';
import type { SkillRule } from '../skills/skills.ts';

const write = { tool: 'Write', what: '/x' };
const push = { tool: 'Bash', what: 'git push' };

const DENIED: Array<{ name: string; view: Parameters<typeof deniedCallsOf>[0]; calls: unknown[] }> = [
  {
    name: 'every ended attempt gives each call it was denied, one per call, in order; an attempt not ended gives none',
    view: {
      state: {
        attempts: [
          { ended: 'succeeded', denials: [write] },
          { ended: 'failed', denials: [write, push] },
          { ended: null, denials: [push] },
        ],
      },
    },
    calls: [write, write, push],
  },
  { name: 'a session denied nothing', view: { state: { attempts: [{ ended: 'succeeded' }] } }, calls: [] },
  { name: 'no view', view: undefined, calls: [] },
];

const RECORDED: Array<{ name: string; step: Parameters<typeof deniesRecorded>[0]; recorded: boolean }> = [
  { name: 'a step on codex records no denial', step: { harness: 'codex' }, recorded: false },
  { name: 'a step on a remote agent records no denial', step: { harness: 'a2a:x' }, recorded: false },
  { name: 'an old record frozen with the retired `background: true` records none', step: { background: true }, recorded: false },
  { name: 'no harness: is the default, claude, which records them', step: {}, recorded: true },
  { name: 'a job on claude records them', step: { harness: 'claude' }, recorded: true },
];

test('`deniedCallsOf` and `deniesRecorded`: the calls a session was denied, and the steps whose sessions record them', async (t) => {
  for (const row of DENIED) await t.test(row.name, () => assert.deepEqual(deniedCallsOf(row.view), row.calls));
  for (const row of RECORDED) await t.test(row.name, () => assert.equal(deniesRecorded(row.step), row.recorded));
});

const before = new Date(Date.parse(JOBS_SINCE) - 1000).toISOString();
const after = new Date(Date.parse(JOBS_SINCE) + 1000).toISOString();

const JOBS: Array<{ name: string; session: Parameters<typeof ranAsJob>[0]; job: boolean }> = [
  {
    name: 'filed before JOBS_SINCE: a Claude Code background session, whenever it spawned',
    session: { filedAt: before, spawnedAt: after },
    job: false,
  },
  { name: 'filed at JOBS_SINCE exactly is a job', session: { filedAt: JOBS_SINCE, spawnedAt: JOBS_SINCE }, job: true },
  { name: 'filed after is a job', session: { filedAt: after, spawnedAt: after }, job: true },
  { name: 'with no filing known, a spawn before says no', session: { filedAt: null, spawnedAt: before }, job: false },
  { name: 'with no filing known, a spawn after says yes', session: { filedAt: null, spawnedAt: after }, job: true },
  { name: 'neither filing nor spawn known: no job', session: { filedAt: null, spawnedAt: null }, job: false },
];

test('`ranAsJob`: a session filed before steps ran as jobs records no denial, nor one whose filing and spawn are unknown', async (t) => {
  for (const row of JOBS) await t.test(row.name, () => assert.equal(ranAsJob(row.session), row.job));
});

const ended = (more: object = {}) => ({ ended: 'succeeded', ...more });
const viewOf = (...attempts: object[]) =>
  ({ state: { attempts } }) as Parameters<typeof filesTouchedOf>[0] & Parameters<typeof skillsLoadedOf>[0];

const LOADED: Array<{ name: string; view: Parameters<typeof skillsLoadedOf>[0]; given?: string[]; skills: string[] | null }> = [
  {
    name: 'every ended attempt gives each skill it loaded, one per load, in order; an attempt not ended gives none',
    view: viewOf({ ended: 'failed', skills: ['look'] }, ended({ skills: ['look', 'effect'] }), { ended: null, skills: ['x'] }),
    skills: ['look', 'look', 'effect'],
  },
  { name: 'a session that loaded none is a measured empty list', view: viewOf(ended({ skills: [] }), { ended: null }), skills: [] },
  {
    name: "a loaded skill is counted under the name the step's line writes it, one named with its folder too",
    view: viewOf(ended({ skills: ['y', 'look', 'other', 'y'] })),
    given: ['app:y', 'look'],
    skills: ['app:y', 'look', 'other', 'app:y'],
  },
  { name: 'one the step did not give, as loaded', view: viewOf(ended({ skills: ['y', 'look'] })), skills: ['y', 'look'] },
  {
    name: 'one end without the key: not measured, never its others alone',
    view: viewOf({ ended: 'failed', skills: ['look'] }, ended()),
    skills: null,
  },
  { name: 'no attempt ended: not measured', view: viewOf({ ended: null, skills: ['look'] }), given: ['look'], skills: null },
  { name: 'no attempt: not measured', view: viewOf(), skills: null },
  { name: 'no view: not measured', view: undefined, given: ['app:y'], skills: null },
];

const TOUCHED: Array<{ name: string; view: Parameters<typeof filesTouchedOf>[0]; files: string[] | null }> = [
  {
    name: "a task's files are each file its ended attempts touched, once, in the order first touched",
    view: viewOf(ended({ files: ['b.ts', 'a.ts'] }), ended({ files: ['a.ts', 'c.ts'] }), { ended: null, files: ['d.ts'] }),
    files: ['b.ts', 'a.ts', 'c.ts'],
  },
  { name: 'a session that touched no file', view: viewOf(ended({ files: [] })), files: [] },
  { name: 'an end that does not say its files: unmeasured', view: viewOf(ended({ files: ['a.ts'] }), ended()), files: null },
  { name: 'no attempt ended: unmeasured', view: viewOf({ ended: null, files: ['a.ts'] }), files: null },
  { name: 'no view: unmeasured', view: undefined, files: null },
];

test('`skillsLoadedOf` and `filesTouchedOf`: what a session loaded and touched, measured only where every ended attempt says', async (t) => {
  for (const row of LOADED)
    await t.test(`skills: ${row.name}`, () => assert.deepEqual(skillsLoadedOf(row.view, row.given ?? []), row.skills));
  for (const row of TOUCHED) await t.test(`files: ${row.name}`, () => assert.deepEqual(filesTouchedOf(row.view), row.files));
});

const APPLIES = new Map<string, string[]>([
  ['change-the-board', ['apps/web/**']],
  ['look', []],
  ['effect', ['apps/api/src/**', 'packages/agent-runtime/src/**']],
]);

const DUE: Array<{ name: string; files: string[] | null; due: ReturnType<typeof skillsDueOf> }> = [
  {
    name: 'a skill that declares paths is due on a try that touched one, in the order declared; one that declares none is never due',
    files: ['apps/web/src/a.tsx', 'README.md'],
    due: [
      { skill: 'change-the-board', touched: true },
      { skill: 'effect', touched: false },
    ],
  },
  {
    name: 'a try that touched no file touched none of them',
    files: [],
    due: [
      { skill: 'change-the-board', touched: false },
      { skill: 'effect', touched: false },
    ],
  },
  {
    name: "any of a skill's paths makes it touched",
    files: ['apps/api/src/main.ts'],
    due: [
      { skill: 'change-the-board', touched: false },
      { skill: 'effect', touched: true },
    ],
  },
  { name: 'none where the files were not measured', files: null, due: null },
];

/** A try as `skillRowsOf` reads it: what it loaded, and what it was due, each null where unmeasured. */
type Loaded = Parameters<typeof skillRowsOf>[0][number];

const SKILL_ROWS: Array<{ name: string; tries: Loaded[]; rows: ReturnType<typeof skillRowsOf> }> = [
  {
    name: 'each skill loaded, its loads and tries, most loads first and then by name; no path declared is touched null',
    tries: [
      { skills: ['look', 'write-a-spec', 'effect'], due: null },
      { skills: ['write-a-spec'], due: null },
      { skills: null, due: null },
    ],
    rows: [
      { skill: 'write-a-spec', count: 2, tries: 2, touched: null, loadedWhenTouched: null },
      { skill: 'effect', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
      { skill: 'look', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
    ],
  },
  {
    name: 'the tries that touched its paths, and how many of them loaded it, over the tries whose files were measured',
    tries: [
      { skills: [], due: [{ skill: 'b', touched: true }] },
      { skills: ['b', 'c'], due: [{ skill: 'b', touched: true }] },
      { skills: ['b'], due: null },
      { skills: [], due: [{ skill: 'b', touched: false }] },
    ],
    rows: [
      { skill: 'b', count: 2, tries: 2, touched: 2, loadedWhenTouched: 1 },
      { skill: 'c', count: 1, tries: 1, touched: null, loadedWhenTouched: null },
    ],
  },
  {
    name: 'a skill touched and never loaded has a row of its own',
    tries: [{ skills: [], due: [{ skill: 'look', touched: true }] }],
    rows: [{ skill: 'look', count: 0, tries: 0, touched: 1, loadedWhenTouched: 0 }],
  },
  {
    name: 'one declared and neither touched nor loaded has none',
    tries: [{ skills: [], due: [{ skill: 'look', touched: false }] }],
    rows: [],
  },
];

test('`skillsDueOf` and `skillRowsOf`: the skills a try was due to load by the paths it touched, and their rows over a set of tries', async (t) => {
  for (const row of DUE) await t.test(`due: ${row.name}`, () => assert.deepEqual(skillsDueOf(row.files, APPLIES), row.due));
  for (const row of SKILL_ROWS) await t.test(`rows: ${row.name}`, () => assert.deepEqual(skillRowsOf(row.tries), row.rows));
});

const readWithRead: SkillRule = { id: 'read-with-read', says: 'Read a file with Read', breaks: ['Bash(cat:*)', 'Bash(head:*)'] };
const noPush: SkillRule = { id: 'no-push', says: 'Never push', breaks: ['Bash(git:*)'] };
const declared = new Map([['write-a-spec', [readWithRead, noPush]]]);
const declaredTwo = new Map([
  ['b-skill', [{ id: 'z', says: 'z', breaks: ['Bash(cat:*)'] }]],
  ['a-skill', [{ id: 'y', says: 'y', breaks: ['Bash(rm:*)'] }]],
]);

/** Whether the one rule `breaks` is broken by a try denied `call`. */
const broken = (call: string, breaks: string[]): boolean | undefined =>
  rulesOfTry([call], new Map([['s', [{ id: 'r', says: 'x', breaks }]]]))?.[0].broken;

const RULES: Array<{ name: string; check: () => void }> = [
  {
    name: 'a denied call that a rule breaks on breaks that rule, each call that did named; every other rule is kept',
    check: () =>
      assert.deepEqual(rulesOfTry(['Bash(cat)', 'Bash(npm)', 'Bash(cat)'], declared), [
        { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', broken: true, by: ['Bash(cat)', 'Bash(cat)'] },
        { skill: 'write-a-spec', rule: 'no-push', says: 'Never push', broken: false, by: [] },
      ]),
  },
  {
    name: 'a command by its first word: another that starts with the same letters is no match',
    check: () => assert.equal(broken('Bash(cats)', ['Bash(cat:*)']), false),
  },
  { name: 'a path under a pattern matches', check: () => assert.equal(broken('Read(/etc/passwd)', ['Read(//etc/**)']), true) },
  { name: 'a path outside the pattern does not', check: () => assert.equal(broken('Read(/srv/x)', ['Read(//etc/**)']), false) },
  { name: 'a write is matched against an Edit rule', check: () => assert.equal(broken('Write(/x/y)', ['Edit(//x/**)']), true) },
  { name: 'a bare tool matches its name', check: () => assert.equal(broken('WebFetch', ['WebFetch']), true) },
  { name: 'a try whose denials were not measured keeps and breaks nothing', check: () => assert.equal(rulesOfTry(null, declared), null) },
  {
    name: 'one denied nothing keeps every rule',
    check: () =>
      assert.deepEqual(
        rulesOfTry([], declared)?.map((r) => [r.rule, r.broken]),
        [
          ['read-with-read', false],
          ['no-push', false],
        ],
      ),
  },
  { name: 'a step given no skill that declares a rule has none', check: () => assert.deepEqual(rulesOfTry(['Bash(cat)'], new Map()), []) },
  {
    name: 'the rows total each skill and rule over the measured tries, most broken first, then by skill and rule',
    check: () =>
      assert.deepEqual(
        ruleRowsOf([
          { rules: rulesOfTry(['Bash(rm)'], declaredTwo) },
          { rules: rulesOfTry(['Bash(rm)', 'Bash(cat)'], declaredTwo) },
          { rules: rulesOfTry([], declaredTwo) },
          { rules: null },
        ]),
        [
          { skill: 'a-skill', rule: 'y', says: 'y', kept: 1, broken: 2 },
          { skill: 'b-skill', rule: 'z', says: 'z', kept: 2, broken: 1 },
        ],
      ),
  },
  {
    name: 'the most broken first, before the name of its skill',
    check: () =>
      assert.deepEqual(
        ruleRowsOf([{ rules: rulesOfTry(['Bash(cat)'], declaredTwo) }]).map((r) => [r.skill, r.broken]),
        [
          ['b-skill', 1],
          ['a-skill', 0],
        ],
      ),
  },
  {
    name: 'as broken as each other, by skill: the declaration lists b-skill first',
    check: () =>
      assert.deepEqual(
        ruleRowsOf([{ rules: rulesOfTry([], declaredTwo) }]).map((r) => r.skill),
        ['a-skill', 'b-skill'],
      ),
  },
  {
    name: 'by rule within a skill, whatever order the file has',
    check: () => {
      for (const order of [
        [noPush, readWithRead],
        [readWithRead, noPush],
      ])
        assert.deepEqual(
          ruleRowsOf([{ rules: rulesOfTry([], new Map([['s', order]])) }]).map((r) => r.rule),
          ['no-push', 'read-with-read'],
        );
    },
  },
  {
    name: 'nothing measured or declared is no row, never a row of zeros',
    check: () => assert.deepEqual(ruleRowsOf([{ rules: null }, { rules: [] }]), []),
  },
];

test('`rulesOfTry` and `ruleRowsOf`: a rule broken by a denied call as a fence matches it, kept otherwise, totalled over measured tries', async (t) => {
  for (const row of RULES) await t.test(row.name, row.check);
});
