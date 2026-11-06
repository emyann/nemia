/**
 * `proposalRuleReach`'s two full laws, which its contract states narrowed (tsverify card p25m: each answered `bounded` at the default
 * budget): a rule every pair of which its delegation covers reaches past nothing, whatever the number of its verbs; and a rule that covers
 * any pair its delegation does not reaches past it, not only by its first pair. Held here over every rule and delegation a seeded walk
 * draws from a small world of resources, names and verbs, and on the fixtures the confirm refuses and lets through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChangeVerb, Grant, ProposalRule } from '../../contracts/proposal-approval.contract.ts';
import { proposalRuleReach } from './rule.ts';

const RESOURCES = ['workflows', 'agents', 'skills'];
const NAMES = ['build', 'review', 'implementer'];
const VERBS: readonly ChangeVerb[] = ['create', 'update', 'delete'];

/** A seeded generator, so a failure is the same input on every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Some of `all`, each kept with even odds, at least `least` of them. */
const someOf = <T>(all: readonly T[], next: () => number, least: number): T[] => {
  const kept = all.filter(() => next() < 0.5);
  return kept.length >= least ? kept : all.slice(0, least);
};

const grantOf = (next: () => number): Grant => ({
  resources: someOf(RESOURCES, next, 1),
  resourceNames: someOf(NAMES, next, 0),
  verbs: someOf(VERBS, next, 1),
});

const ruleOf = (next: () => number): ProposalRule => ({
  id: 'r',
  ...grantOf(next),
  widens: next() < 0.5,
  proposedBy: [],
});

/** The contract's own reading of a grant covering a rule's pair, for every name the rule covers. */
const coveredFor = (grants: readonly Grant[], rule: ProposalRule, resource: string, verb: ChangeVerb): boolean =>
  grants.some(
    (g) =>
      g.resources.includes(resource) &&
      g.verbs.includes(verb) &&
      (g.resourceNames.length === 0 || (rule.resourceNames.length > 0 && rule.resourceNames.every((n) => g.resourceNames.includes(n)))),
  );

test('the full laws: a rule wholly covered reaches past nothing, and a rule uncovered at any pair reaches past it', () => {
  const next = seeded(7);
  let covered = 0;
  let uncovered = 0;
  for (let i = 0; i < 4000; i++) {
    const rule = ruleOf(next);
    const grants = Array.from({ length: Math.floor(next() * 3) }, () => grantOf(next));
    const pairs = rule.resources.flatMap((r) => rule.verbs.map((v) => [r, v] as const));
    const past = proposalRuleReach(rule, grants);
    if (pairs.every(([r, v]) => coveredFor(grants, rule, r, v))) {
      covered++;
      assert.deepEqual(past, [], JSON.stringify({ rule, grants }));
    } else {
      uncovered++;
      assert.ok(past.length > 0, JSON.stringify({ rule, grants }));
      for (const [r, v] of pairs.filter(([r, v]) => !coveredFor(grants, rule, r, v)))
        assert.ok(
          past.some((p) => p.resource === r && p.verb === v),
          `${v} ${r} is named past: ${JSON.stringify({ rule, grants })}`,
        );
    }
  }
  assert.ok(covered > 100 && uncovered > 100, `both sides drawn: ${covered} covered, ${uncovered} not`);
});

test('REFUSED past its delegation: a rule over agents where the delegation grants workflows/update alone, and a rule of every name over a grant of some', () => {
  const grants: Grant[] = [{ resources: ['workflows'], resourceNames: [], verbs: ['update'] }];
  const rule: ProposalRule = {
    id: 'r',
    resources: ['workflows', 'agents'],
    resourceNames: [],
    verbs: ['update'],
    widens: false,
    proposedBy: [],
  };
  assert.deepEqual(proposalRuleReach(rule, grants), [{ resource: 'agents', verb: 'update' }]);
  const someNames: Grant[] = [{ resources: ['workflows'], resourceNames: ['build'], verbs: ['update'] }];
  const everyName: ProposalRule = { ...rule, resources: ['workflows'] };
  assert.deepEqual(proposalRuleReach(everyName, someNames), [{ resource: 'workflows', verb: 'update' }]);
  assert.deepEqual(proposalRuleReach({ ...everyName, resourceNames: ['build'] }, someNames), []);
  assert.deepEqual(proposalRuleReach({ ...rule, resources: ['workflows'] }, grants), []);
});
