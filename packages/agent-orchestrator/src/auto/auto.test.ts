/**
 * The person's rules for `auto`, pure: the rule that ships allows an approval where all agree and asks where any one condition fails, so
 * a default weakened by one condition fails a row (`allowedBy`); it is pinned whole, with its words (`ruleWords`); a confirmed list
 * replaces it (`listInForce`); a rule matches its answer, its steps and its line; and a rule that is none is refused, naming what is
 * wrong (`ruleRefusal`). The facts a rule reads are `facts.test.ts`'s; the rules confirmed, dropped and deciding an approval on a store
 * are told in `test/auto-rules.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { names } from '../../test/assessed.ts';
import { allowedBy, CONDITIONS, DEFAULT_AUTO, listInForce, NO_FACTS, ruleRefusal, ruleWords, type AutoRule, type Facts } from './index.ts';

/** A run where all agree: every condition holds, and it has cost $3. */
const ALL_AGREE: Facts = { recommends: true, checked: true, accepted: true, withinBudget: true, nothingOpen: true, spend: 3 };

test('`allowedBy`: the default allows an approval at any step where all agree and nothing else; a rule covers its answer, steps and line', async (t) => {
  await t.test('the default allows an approval at any step where all agree, and nothing else', () => {
    assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, ALL_AGREE), DEFAULT_AUTO);
    assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'land' }, ALL_AGREE), DEFAULT_AUTO);
    assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'retry', step: 'design' }, ALL_AGREE), undefined, 'a try is no approval');
    assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, NO_FACTS), undefined, 'a run that does not read');
    assert.equal(allowedBy([], { answer: 'approve', step: 'design' }, ALL_AGREE), undefined, 'an empty list allows nothing');
  });
  for (const condition of CONDITIONS)
    await t.test(`REFUSED: the default asks when ${condition} fails`, () => {
      assert.equal(allowedBy([DEFAULT_AUTO], { answer: 'approve', step: 'design' }, { ...ALL_AGREE, [condition]: false }), undefined);
    });
  await t.test("a rule covers only its answer, its steps and the run's spend under its line", () => {
    const rule: AutoRule = { id: 'gate', answer: 'approve', steps: ['design'], when: ['recommends'], under: 10 };
    const facts = { ...NO_FACTS, recommends: true, spend: 9.99 };
    assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, facts), rule);
    assert.equal(allowedBy([rule], { answer: 'approve', step: 'review' }, facts), undefined, 'a step it does not name');
    assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, { ...facts, spend: 10 }), undefined, 'at its line');
    assert.equal(allowedBy([rule], { answer: 'approve', step: 'design' }, { ...facts, recommends: false }), undefined, 'its condition');
  });
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

test("`ruleWords`: a rule's words are made from its fields, each condition's phrase once", () => {
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

test('`ruleRefusal`: a rule with no id, the default id, an answer or condition that is none, a condition twice, steps or a line that are none', async (t) => {
  const good = { id: 'gate', answer: 'approve', when: ['checked'] };
  const refused = (rule: unknown): string | undefined => ruleRefusal(rule, 'rule 1');
  await t.test('a rule, with steps and a line or without', () => {
    assert.equal(refused(good), undefined);
    assert.equal(refused({ ...good, steps: ['design'], under: 5 }), undefined);
  });
  for (const [name, rule, facts] of [
    [
      'REFUSED: a word that is no rule, naming its shape',
      'approve',
      ['rule 1 is no rule', '{ "id", "answer", "steps"?, "when", "under"? }'],
    ],
    ['REFUSED: an id that is no name', { ...good, id: 'Gate one' }, ['rule 1: id', 'lowercase letters']],
    ['REFUSED: the id of the rule that ships', { ...good, id: 'default' }, ['rule 1: the id default']],
    ['REFUSED: an answer that is none', { ...good, answer: 'cancel' }, ['rule 1: answer', 'approve, retry', '"cancel"']],
    ['REFUSED: a condition that is none, naming those there are', { ...good, when: ['cheap'] }, ['rule 1: when ', 'recommends, checked']],
    ['REFUSED: conditions that are no list', { ...good, when: 'checked' }, ['rule 1: when is a list']],
    ['REFUSED: a condition twice', { ...good, when: ['checked', 'checked'] }, ['rule 1: when names a condition twice']],
    ['REFUSED: steps that are an empty list', { ...good, steps: [] }, ['rule 1: steps is a list of step names']],
    ['REFUSED: steps that are not names', { ...good, steps: ['design', 3] }, ['rule 1: steps is a list of step names']],
    ['REFUSED: a line below zero', { ...good, under: -1 }, ['rule 1: under is the dollars']],
    ['REFUSED: a line that is no number', { ...good, under: '5' }, ['rule 1: under is the dollars']],
  ] as const)
    await t.test(name, () => {
      const said = refused(rule);
      names(said, ...facts);
      assert.ok(said!.startsWith(facts[0]), said);
    });
});
