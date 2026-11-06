/**
 * What a person's rules for `auto` reach, as one table (`gateRows`): the builtin rule misses an ending approved before it runs, naming
 * the first condition that cannot hold there and why, and a step with no check, naming its check; a rule for other steps or one that
 * tries again says so; the rule suggested for each reaches its gates, passes `ruleRefusal` and is taken by `proposalOf` as it is; one
 * step gated at two sites gets one suggestion that reaches both; the reach of the whole list; what keeps a rule from a gate now, its
 * dollar line named; and a proposed rule that would reach a gate. No word a person reads holds a condition's id, JSON or a file. The
 * laws of what can and cannot hold are the contract's (`contracts/reach.contract.ts`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { proposalOf } from '../auto/auto.verb.ts';
import {
  CONDITION_WORDS,
  CONDITIONS,
  DEFAULT_POLICY,
  NO_FACTS,
  ruleRefusal,
  type Facts,
  type GateRule as PolicyRule,
} from '../auto/index.ts';
import { type GateSite, gateRows, missWords, NEVER_WORDS, ruleReaches, unmetWords } from './index.ts';

/** An ending approved before it runs, with a check. */
const ENDING: GateSite = { workflow: 'ship', step: 'merge', approvedFirst: true, hasCheck: true };
/** A step run before its gate, with no check. */
const NO_CHECK: GateSite = { workflow: 'ship', step: 'draft', approvedFirst: false, hasCheck: false };
/** A step run before its gate, with a check: every condition can hold there. */
const CHECKED: GateSite = { workflow: 'ship', step: 'build', approvedFirst: false, hasCheck: true };

/** Every word a person reads in a table: each miss, each suggestion's own words, and what keeps a rule now. */
const wordsOf = (table: ReturnType<typeof gateRows>): string[] =>
  table.rows.flatMap((row) => [...row.misses.map((m) => m.words), ...(row.now ?? []).map((n) => n.words)]);

/** Whether `words` hold a condition's id outside the phrase a rule says it in, a brace, or a file's name. */
const readsAsCode = (words: string): boolean => {
  const prose = Object.values(CONDITION_WORDS).reduce((rest, phrase) => rest.split(phrase).join(' '), words);
  return CONDITIONS.some((c) => new RegExp(`\\b${c}\\b`).test(prose)) || /[{}]/.test(words) || /\w\/\w|\.(ts|md|json|ya?ml)\b/.test(words);
};

test('`gateRows`: what each rule in force reaches, why it misses, and the rule that would reach a gate', async (t) => {
  await t.test('REFUSED: the default misses an ending approved before it runs, on the agent recommending it', () => {
    const { rows } = gateRows([DEFAULT_POLICY], [], [ENDING]);
    const row = rows.at(0);
    assert.deepEqual(row?.reachedBy, []);
    assert.equal(row?.misses.length, 1);
    assert.deepEqual(
      { ...row?.misses.at(0), words: undefined },
      { rule: 'default', why: 'never-holds', condition: 'recommends', because: 'approved-before-it-runs', words: undefined },
    );
    assert.match(row?.misses.at(0)?.words ?? '', new RegExp(CONDITION_WORDS.recommends));
    assert.match(row?.misses.at(0)?.words ?? '', new RegExp(NEVER_WORDS['approved-before-it-runs']));
  });

  await t.test('REFUSED: the default misses a step with no check, on its check', () => {
    const miss = gateRows([DEFAULT_POLICY], [], [NO_CHECK]).rows.at(0)?.misses.at(0);
    assert.deepEqual(
      { ...miss, words: undefined },
      { rule: 'default', why: 'never-holds', condition: 'checked', because: 'no-check', words: undefined },
    );
    assert.match(miss?.words ?? '', new RegExp(CONDITION_WORDS.checked));
    assert.match(miss?.words ?? '', new RegExp(NEVER_WORDS['no-check']));
  });

  await t.test('REFUSED: a rule for other steps covers other steps, and a rule that tries again approves none', () => {
    const other: PolicyRule = { id: 'elsewhere', answer: 'approve', steps: ['other'], when: [] };
    const retry: PolicyRule = { id: 'again', answer: 'retry', when: [] };
    const misses = gateRows([other, retry], [], [CHECKED]).rows.at(0)?.misses;
    assert.deepEqual(
      misses?.map(({ rule, why }) => ({ rule, why })),
      [
        { rule: 'elsewhere', why: 'other-steps' },
        { rule: 'again', why: 'answers-retry' },
      ],
    );
    assert.match(missWords({ rule: 'again', why: 'answers-retry' }), /tries a step again/);
    assert.match(missWords({ rule: 'elsewhere', why: 'other-steps' }), /covers other steps/);
  });

  await t.test('the rule suggested for each miss reaches it, is a rule, and is proposed as it is', () => {
    const { suggested } = gateRows([DEFAULT_POLICY], [], [ENDING, NO_CHECK]);
    assert.equal(suggested.length, 2);
    for (const [rule, site] of [
      [suggested.at(0), ENDING],
      [suggested.at(1), NO_CHECK],
    ] as const) {
      assert.ok(rule && ruleReaches(rule, site), `${rule?.id} reaches ${site.step}`);
      assert.equal(ruleRefusal(rule, 'suggested'), undefined);
      assert.deepEqual(proposalOf(JSON.stringify({ rules: [rule] })).rules, [rule]);
    }
  });

  await t.test('no word a person reads holds a condition id, a brace, or a file', () => {
    const rules: PolicyRule[] = [
      DEFAULT_POLICY,
      { id: 'elsewhere', answer: 'approve', steps: ['other'], when: [] },
      { id: 'again', answer: 'retry', when: [] },
      { id: 'capped', answer: 'approve', when: ['accepted', 'withinBudget', 'nothingOpen'], under: 5 },
    ];
    const table = gateRows(rules, [], [ENDING, NO_CHECK, CHECKED], () => NO_FACTS);
    const words = [
      ...wordsOf(table),
      ...Object.values(NEVER_WORDS),
      unmetWords({ conditions: [...CONDITIONS], overLine: true }, { id: 'x', answer: 'approve', when: [], under: 5 }, 7),
    ];
    assert.ok(words.length > 8);
    for (const w of words) assert.ok(w.trim() !== '' && !readsAsCode(w), w);
  });

  await t.test('one step gated at two sites, one with a check and one without: one suggestion, asking no check, reaching both', () => {
    const twin: GateSite = { ...NO_CHECK, workflow: 'other', hasCheck: true };
    const { suggested } = gateRows([DEFAULT_POLICY], [], [NO_CHECK, twin]);
    assert.equal(suggested.length, 1);
    const rule = suggested.at(0);
    assert.ok(rule && !rule.when.includes('checked'));
    assert.ok(rule && ruleReaches(rule, NO_CHECK) && ruleReaches(rule, twin));
  });

  await t.test('the reach of a list: none, some, all', () => {
    assert.equal(gateRows([DEFAULT_POLICY], [], [ENDING, NO_CHECK]).reach, 'none');
    assert.equal(gateRows([DEFAULT_POLICY], [], [ENDING, CHECKED]).reach, 'some');
    assert.equal(gateRows([DEFAULT_POLICY], [], [CHECKED]).reach, 'all');
    assert.equal(gateRows([DEFAULT_POLICY], [], []).reach, 'all', 'no gate is missed');
    assert.deepEqual(gateRows([DEFAULT_POLICY], [], [CHECKED]).suggested, [], 'nothing to suggest');
  });

  await t.test("what keeps a rule from a gate now names its dollar line and the run's cost", () => {
    const capped: PolicyRule = { id: 'capped', answer: 'approve', when: ['accepted'], under: 10 };
    const facts: Facts = { ...NO_FACTS, accepted: true, spend: 12 };
    const now = gateRows([capped], [], [CHECKED], () => facts).rows.at(0)?.now;
    assert.deepEqual(
      now?.map(({ rule, unmet }) => ({ rule, unmet })),
      [{ rule: 'capped', unmet: { conditions: [], overLine: true } }],
    );
    assert.match(now?.at(0)?.words ?? '', /\$12\b/);
    assert.match(now?.at(0)?.words ?? '', /\$10\b/);
    const allHold = gateRows([capped], [], [CHECKED], () => ({ ...facts, spend: 3 })).rows.at(0)?.now;
    assert.deepEqual(allHold, [], 'nothing keeps it');
    assert.equal(gateRows([capped], [], [CHECKED]).rows.at(0)?.now, undefined, 'no facts given');
  });

  await t.test('a proposed rule that would reach a gate is named, and one already in force is not', () => {
    const proposed: PolicyRule = { id: 'approve-merge', answer: 'approve', steps: ['merge'], when: ['accepted'] };
    const inForce: PolicyRule = { id: 'approve-merge', answer: 'approve', steps: ['merge'], when: ['accepted'] };
    assert.deepEqual(gateRows([DEFAULT_POLICY], [proposed], [ENDING]).rows.at(0)?.proposedBy, ['approve-merge']);
    assert.deepEqual(gateRows([inForce], [proposed], [ENDING]).rows.at(0)?.proposedBy, []);
    assert.deepEqual(gateRows([inForce], [proposed], [ENDING]).rows.at(0)?.reachedBy, ['approve-merge']);
  });
});
