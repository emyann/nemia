/**
 * The person's rules for `auto`, pure: the rule that ships allows an approval where all agree and asks where any one condition fails, so
 * a default weakened by one condition fails a case; it is pinned whole, with its words; a confirmed list replaces it; a rule matches its
 * answer, its steps and its line; and a rule that is none is refused, naming what is wrong.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedBy, CONDITIONS, DEFAULT_AUTO, listInForce, NO_FACTS, ruleRefusal, ruleWords, type AutoRule, type Facts } from './index.ts';

/** A run where all agree: every condition holds, and it has cost $3. */
const ALL_AGREE: Facts = { recommends: true, checked: true, accepted: true, withinBudget: true, nothingOpen: true, spend: 3 };

test('the default allows an approval at any step where all agree, and nothing else', () => {
  assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, ALL_AGREE), DEFAULT_AUTO);
  assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'land' }, ALL_AGREE), DEFAULT_AUTO);
  assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'retry', step: 'design' }, ALL_AGREE), undefined, 'a try is no approval');
  assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, NO_FACTS), undefined, 'a run that does not read');
  assert.equal(allowedBy([], { answer: 'approve', step: 'design' }, ALL_AGREE), undefined, 'an empty list allows nothing');
});

for (const condition of CONDITIONS)
  test(`REFUSED: the default asks when ${condition} fails`, () => {
    assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, { ...ALL_AGREE, [condition]: false }), undefined);
  });

test('the default is pinned whole: approve, every step, all five conditions in order, from the default', () => {
  assert.deepEqual(CONDITIONS, ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen']);
  assert.deepEqual(DEFAULT_AUTO, {
    id: 'default',
    answer: 'approve',
    when: ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'],
    from: 'default',
  });
});

test("a rule's words are made from its fields, each condition's phrase once", () => {
  const rule = ruleWords(DEFAULT_AUTO);
  assert.equal(
    rule,
    'Approve any step unasked when the agent recommends it, its check passed, every reviewer accepted, no step is past its budget and ' +
      'nothing is left open.',
  );
  for (const phrase of ['the agent recommends it', 'its check passed', 'every reviewer accepted', 'no step is past its budget'])
    assert.equal(rule.split(phrase).length, 2, phrase);
  assert.equal(
    ruleWords({ id: 'tries', answer: 'retry', steps: ['implement', 'review'], when: ['recommends'], under: 20 }),
    'Try again the steps implement and review unasked when the agent recommends it and the run has cost under $20.',
  );
  assert.equal(
    ruleWords({ id: 'open', answer: 'approve', steps: ['design'], when: [] }),
    'Approve the step design unasked, whatever the run’s state.',
  );
});

test('a confirmed list replaces the default; the default is in force only while none is confirmed', () => {
  const tries: AutoRule = { id: 'tries', answer: 'retry', when: ['recommends'] };
  assert.deepEqual(listInForce(undefined), [DEFAULT_AUTO]);
  assert.deepEqual(listInForce([tries]), [tries]);
  assert.deepEqual(listInForce([]), [], 'a list with the default dropped holds none');
});

test("a rule covers only its answer, its steps and the run's spend under its line", () => {
  const rule: AutoRule = { id: 'gate', answer: 'approve', steps: ['design'], when: ['recommends'], under: 10 };
  const facts = { ...NO_FACTS, recommends: true, spend: 9.99 };
  assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, facts), rule);
  assert.equal(allowedBy([rule], { answer: 'approve', step: 'review' }, facts), undefined, 'a step it does not name');
  assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, { ...facts, spend: 10 }), undefined, 'at its line');
  assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, { ...facts, recommends: false }), undefined, 'its condition');
});

test('REFUSED: a rule with no id, the default id, an answer or condition that is none, a condition twice, steps or a line that are none', () => {
  const good = { id: 'gate', answer: 'approve', when: ['checked'] };
  assert.equal(ruleRefusal(good, 'rule 1'), undefined);
  assert.equal(ruleRefusal({ ...good, steps: ['design'], under: 5 }, 'rule 1'), undefined);
  const refused = (rule: unknown): string => ruleRefusal(rule, 'rule 1') ?? '';
  assert.ok(refused('approve').startsWith('rule 1 is no rule'), refused('approve'));
  assert.ok(refused('approve').includes('{ "id", "answer", "steps"?, "when", "under"? }'), refused('approve'));
  assert.match(refused({ ...good, id: 'Gate one' }), /^rule 1: id is a name of lowercase letters/);
  assert.match(refused({ ...good, id: 'default' }), /^rule 1: the id default is the rule that ships/);
  assert.match(refused({ ...good, answer: 'cancel' }), /^rule 1: answer is one of approve, retry; "cancel" is not/);
  assert.match(refused({ ...good, when: ['cheap'] }), /^rule 1: when /);
  assert.ok(refused({ ...good, when: ['cheap'] }).includes('recommends, checked'));
  assert.match(refused({ ...good, when: 'checked' }), /^rule 1: when is a list of the conditions/);
  assert.match(refused({ ...good, when: ['checked', 'checked'] }), /^rule 1: when names a condition twice/);
  assert.match(refused({ ...good, steps: [] }), /^rule 1: steps is a list of step names/);
  assert.match(refused({ ...good, steps: ['design', 3] }), /^rule 1: steps is a list of step names/);
  assert.match(refused({ ...good, under: -1 }), /^rule 1: under is the dollars/);
  assert.match(refused({ ...good, under: '5' }), /^rule 1: under is the dollars/);
});
