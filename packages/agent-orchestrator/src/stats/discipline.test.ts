/**
 * The calls a try was refused and the skills it loaded (`discipline.ts`): every call of every ended attempt, one per call, measured only
 * on a harness whose sessions record them; every skill of every ended attempt, measured only where each ended attempt says. And the
 * rules a try kept and broke: a rule is broken by a call the try was denied that one of its `breaks` matches, as a `disallowedTools:`
 * rule matches a call, kept otherwise, and counted on no try whose denials were not measured.
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
  skillsDueOf,
  skillsLoadedOf,
} from './discipline.ts';
import type { SkillRule } from '../skills/skills.ts';

const write = { tool: 'Write', what: '/x' };
const push = { tool: 'Bash', what: 'git push' };

test('every ended attempt gives each call it was denied, one per call, in order; an attempt not ended gives none', () => {
  const view = {
    state: {
      attempts: [
        { ended: 'done', denials: [write] },
        { ended: 'failed', denials: [write, push] },
        { ended: null, denials: [push] },
      ],
    },
  };
  assert.deepEqual(deniedCallsOf(view), [write, write, push]);
  assert.deepEqual(deniedCallsOf({ state: { attempts: [{ ended: 'done' }] } }), [], 'a session denied nothing');
  assert.deepEqual(deniedCallsOf(undefined), []);
});

test('a step on codex, on a remote agent or in the background records no denial; a job on claude or claude-detached does', () => {
  assert.equal(deniesRecorded({ harness: 'codex' }), false);
  assert.equal(deniesRecorded({ harness: 'a2a:x' }), false);
  assert.equal(deniesRecorded({ background: true }), false);
  assert.equal(deniesRecorded({ harness: 'claude', background: true }), false);
  assert.equal(deniesRecorded({}), true, 'no harness: is the default, claude');
  assert.equal(deniesRecorded({ harness: 'claude' }), true);
  assert.equal(deniesRecorded({ harness: 'claude-detached' }), true);
});

test('a session filed before steps ran as jobs records no denial, nor one whose filing and spawn are unknown', () => {
  const before = new Date(Date.parse(JOBS_SINCE) - 1000).toISOString();
  const after = new Date(Date.parse(JOBS_SINCE) + 1000).toISOString();
  assert.equal(ranAsJob({ filedAt: before, spawnedAt: after }), false, 'filed before: a background session, whenever it spawned');
  assert.equal(ranAsJob({ filedAt: JOBS_SINCE, spawnedAt: JOBS_SINCE }), true);
  assert.equal(ranAsJob({ filedAt: after, spawnedAt: after }), true);
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: before }), false, 'with no filing known, its spawn says');
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: after }), true);
  assert.equal(ranAsJob({ filedAt: null, spawnedAt: null }), false);
});

test('every ended attempt gives each skill it loaded, one per load, in order; an attempt not ended gives none', () => {
  const attempts = [
    { ended: 'failed', skills: ['look'] },
    { ended: 'done', skills: ['look', 'effect'] },
    { ended: null, skills: ['x'] },
  ];
  assert.deepEqual(skillsLoadedOf({ state: { attempts } }, []), ['look', 'look', 'effect']);
  const empty = [{ ended: 'done', skills: [] }, { ended: null }];
  assert.deepEqual(skillsLoadedOf({ state: { attempts: empty } }, []), [], 'a session that loaded none is a measured empty list');
});

test('a loaded skill is counted under the name the step’s line writes it, one named with its folder too; one the step did not give, as loaded', () => {
  const attempts = [{ ended: 'done', skills: ['y', 'look', 'other', 'y'] }];
  assert.deepEqual(skillsLoadedOf({ state: { attempts } }, ['app:y', 'look']), ['app:y', 'look', 'other', 'app:y']);
  assert.deepEqual(skillsLoadedOf({ state: { attempts } }, []), ['y', 'look', 'other', 'y']);
});

test('a session is unmeasured where one ended attempt does not say its skills, where none ended, and with no view', () => {
  const unsaid = [{ ended: 'failed', skills: ['look'] }, { ended: 'done' }];
  assert.equal(skillsLoadedOf({ state: { attempts: unsaid } }, []), null, 'one end without the key: not measured, never its others alone');
  assert.equal(skillsLoadedOf({ state: { attempts: [{ ended: null, skills: ['look'] }] } }, ['look']), null, 'no attempt ended');
  assert.equal(skillsLoadedOf({ state: { attempts: [] } }, []), null);
  assert.equal(skillsLoadedOf(undefined, ['app:y']), null);
});

test("a task's files are each file its ended attempts touched, once, in the order first touched; unmeasured where one end does not say", () => {
  const ended = (files?: string[]) => ({ ended: 'done', ...(files ? { files } : {}) });
  const view = (...attempts: object[]) => ({ state: { attempts } }) as Parameters<typeof filesTouchedOf>[0];
  assert.deepEqual(filesTouchedOf(view(ended(['b.ts', 'a.ts']), ended(['a.ts', 'c.ts']), { ended: null, files: ['d.ts'] })), [
    'b.ts',
    'a.ts',
    'c.ts',
  ]);
  assert.deepEqual(filesTouchedOf(view(ended([]))), [], 'a session that touched no file');
  assert.equal(filesTouchedOf(view(ended(['a.ts']), ended())), null, 'an end that does not say its files');
  assert.equal(filesTouchedOf(view({ ended: null, files: ['a.ts'] })), null, 'no attempt ended');
  assert.equal(filesTouchedOf(undefined), null);
});

test('a skill that declares paths is due on a try that touched one, in the order declared; none where the files were not measured', () => {
  const applies = new Map<string, string[]>([
    ['change-the-board', ['apps/web/**']],
    ['look', []],
    ['effect', ['apps/api/src/**', 'packages/agent-runtime/src/**']],
  ]);
  assert.deepEqual(skillsDueOf(['apps/web/src/a.tsx', 'README.md'], applies), [
    { skill: 'change-the-board', touched: true },
    { skill: 'effect', touched: false },
  ]);
  assert.deepEqual(skillsDueOf([], applies), [
    { skill: 'change-the-board', touched: false },
    { skill: 'effect', touched: false },
  ]);
  assert.deepEqual(
    skillsDueOf(['apps/api/src/main.ts'], applies)?.find((d) => d.skill === 'effect'),
    { skill: 'effect', touched: true },
  );
  assert.equal(skillsDueOf(null, applies), null);
});

const readWithRead: SkillRule = { id: 'read-with-read', says: 'Read a file with Read', breaks: ['Bash(cat:*)', 'Bash(head:*)'] };
const noPush: SkillRule = { id: 'no-push', says: 'Never push', breaks: ['Bash(git:*)'] };
const declared = new Map([['write-a-spec', [readWithRead, noPush]]]);

test('a denied call that a rule breaks on, as a disallowedTools: rule matches it, breaks that rule; every other rule is kept', () => {
  assert.deepEqual(rulesOfTry(['Bash(cat)', 'Bash(npm)', 'Bash(cat)'], declared), [
    { skill: 'write-a-spec', rule: 'read-with-read', says: 'Read a file with Read', broken: true, by: ['Bash(cat)', 'Bash(cat)'] },
    { skill: 'write-a-spec', rule: 'no-push', says: 'Never push', broken: false, by: [] },
  ]);
});

test('a rule matches a call as a fence does: a command by its first word, a path under a pattern, a write under Edit', () => {
  const broken = (call: string, breaks: string[]): boolean | undefined =>
    rulesOfTry([call], new Map([['s', [{ id: 'r', says: 'x', breaks }]]]))?.[0].broken;
  assert.equal(broken('Bash(cats)', ['Bash(cat:*)']), false, 'another command that starts with the same letters');
  assert.equal(broken('Read(/etc/passwd)', ['Read(//etc/**)']), true);
  assert.equal(broken('Read(/srv/x)', ['Read(//etc/**)']), false);
  assert.equal(broken('Write(/x/y)', ['Edit(//x/**)']), true, 'a write is matched against an Edit rule');
  assert.equal(broken('WebFetch', ['WebFetch']), true);
});

test('a try whose denials were not measured keeps and breaks nothing; one denied nothing keeps every rule', () => {
  assert.equal(rulesOfTry(null, declared), null);
  assert.deepEqual(
    rulesOfTry([], declared)?.map((r) => [r.rule, r.broken]),
    [
      ['read-with-read', false],
      ['no-push', false],
    ],
  );
  assert.deepEqual(rulesOfTry(['Bash(cat)'], new Map()), [], 'a step given no skill that declares a rule');
});

test('the rows total each skill and rule over the measured tries, most broken first, then by skill and rule', () => {
  const declaredTwo = new Map([
    ['b-skill', [{ id: 'z', says: 'z', breaks: ['Bash(cat:*)'] }]],
    ['a-skill', [{ id: 'y', says: 'y', breaks: ['Bash(rm:*)'] }]],
  ]);
  const tries = [
    { rules: rulesOfTry(['Bash(rm)'], declaredTwo) },
    { rules: rulesOfTry(['Bash(rm)', 'Bash(cat)'], declaredTwo) },
    { rules: rulesOfTry([], declaredTwo) },
    { rules: null },
  ];
  assert.deepEqual(ruleRowsOf(tries), [
    { skill: 'a-skill', rule: 'y', says: 'y', kept: 1, broken: 2 },
    { skill: 'b-skill', rule: 'z', says: 'z', kept: 2, broken: 1 },
  ]);
  const even = [{ rules: rulesOfTry([], declaredTwo) }];
  assert.deepEqual(
    ruleRowsOf(even).map((r) => r.skill),
    ['a-skill', 'b-skill'],
    'as broken as each other, by skill: the declaration lists b-skill first',
  );
  const oneSkill = new Map([['s', [noPush, readWithRead]]]);
  assert.deepEqual(
    ruleRowsOf([{ rules: rulesOfTry([], oneSkill) }]).map((r) => r.rule),
    ['no-push', 'read-with-read'],
    'by rule within a skill, whatever order the file has',
  );
  assert.deepEqual(
    ruleRowsOf([{ rules: rulesOfTry([], new Map([['s', [readWithRead, noPush]]])) }]).map((r) => r.rule),
    ['no-push', 'read-with-read'],
  );
  assert.deepEqual(ruleRowsOf([{ rules: null }, { rules: [] }]), [], 'nothing measured or declared is no row, never a row of zeros');
});
