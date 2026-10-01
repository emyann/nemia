/**
 * The rules a try kept and broke (`rules.ts`): a rule is broken by a call the try was denied that one of its `breaks` matches, as a
 * `disallowedTools:` rule matches a call, kept otherwise, and counted on no try whose denials were not measured.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleRowsOf, rulesOfTry } from './rules.ts';
import type { SkillRule } from '../skills/skills.ts';

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
  assert.equal(broken('Read(/home/x)', ['Read(//etc/**)']), false);
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
