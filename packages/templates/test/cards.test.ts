/**
 * The janitor's label rules and a card's labels checked against them (`workflows/janitor/cards.ts`), the pure functions its check runs
 * before it files any card: one row per refusal and per accepting case. The rules are read as the pull request's script reads them
 * (`carried/pull-request.ts`), and a card's labels pass where at least one rule reads them, as that script asks of the run the card
 * starts; a refusal names its kind and the label refused, by its index.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { labelRules, labelsChecked, type LabelRule } from '../sdlc/workflows/janitor/cards.ts';

const RULES: LabelRule[] = [
  { key: 'work', value: 'fix', label: 'fix' },
  { key: 'work', value: 'docs', label: 'docs' },
];

const ruleRows: Array<{ name: string; given: string; is: ReturnType<typeof labelRules> }> = [
  { name: 'nothing given is no rules', given: '', is: { kind: 'rules', rules: [] } },
  { name: 'spaces alone are no rules', given: '  ', is: { kind: 'rules', rules: [] } },
  { name: 'two rules apart by spaces', given: ' work=fix:fix  work=docs:docs ', is: { kind: 'rules', rules: RULES } },
  { name: 'a rule with no = is refused', given: 'work', is: { kind: 'refused', rule: 'work' } },
  { name: 'a rule with no label is refused', given: 'work=fix:fix work=fix', is: { kind: 'refused', rule: 'work=fix' } },
  { name: 'a rule with no key is refused', given: '=fix:fix', is: { kind: 'refused', rule: '=fix:fix' } },
  { name: 'a rule with no value is refused', given: 'work=:fix', is: { kind: 'refused', rule: 'work=:fix' } },
  { name: 'a rule with an empty label is refused', given: 'work=fix:', is: { kind: 'refused', rule: 'work=fix:' } },
];

for (const row of ruleRows) test(`labelRules: ${row.name}`, () => assert.deepEqual(labelRules(row.given), row.is));

const labelRows: Array<{ name: string; labels: string[]; rules: LabelRule[]; is: ReturnType<typeof labelsChecked> }> = [
  { name: 'no labels and no rules pass', labels: [], rules: [], is: { kind: 'labelled', labels: {} } },
  {
    name: 'labels one rule reads pass, by key',
    labels: ['work=fix', 'area=a'],
    rules: RULES,
    is: { kind: 'labelled', labels: { work: 'fix', area: 'a' } },
  },
  { name: 'labels no rule reads are refused', labels: ['area=a'], rules: RULES, is: { kind: 'refused', reason: 'unmatched', label: -1 } },
  { name: 'no labels under rules are refused', labels: [], rules: RULES, is: { kind: 'refused', reason: 'unmatched', label: -1 } },
  {
    name: 'a value no rule takes is refused',
    labels: ['work=feature'],
    rules: RULES,
    is: { kind: 'refused', reason: 'unmatched', label: -1 },
  },
  { name: 'a label with no = is refused', labels: ['work=fix', 'work'], rules: RULES, is: { kind: 'refused', reason: 'form', label: 1 } },
  { name: 'a label with no key is refused', labels: ['=fix'], rules: RULES, is: { kind: 'refused', reason: 'form', label: 0 } },
  { name: 'a label with no value is refused', labels: ['work='], rules: RULES, is: { kind: 'refused', reason: 'form', label: 0 } },
  { name: 'a key-removal edit is no label', labels: ['work-'], rules: [], is: { kind: 'refused', reason: 'form', label: 0 } },
  { name: 'a value with a space is refused', labels: ['work=a fix'], rules: [], is: { kind: 'refused', reason: 'form', label: 0 } },
  {
    name: 'a key past 63 characters is refused',
    labels: [`${'k'.repeat(64)}=v`],
    rules: [],
    is: { kind: 'refused', reason: 'form', label: 0 },
  },
  {
    name: 'a key of 63 characters passes',
    labels: [`${'k'.repeat(63)}=v`],
    rules: [],
    is: { kind: 'labelled', labels: { ['k'.repeat(63)]: 'v' } },
  },
  { name: 'a value ending in a dash is refused', labels: ['work=fix-'], rules: [], is: { kind: 'refused', reason: 'form', label: 0 } },
  {
    name: 'a key given twice is refused',
    labels: ['work=fix', 'work=docs'],
    rules: RULES,
    is: { kind: 'refused', reason: 'twice', label: 1 },
  },
];

for (const row of labelRows) test(`labelsChecked: ${row.name}`, () => assert.deepEqual(labelsChecked(row.labels, row.rules), row.is));
