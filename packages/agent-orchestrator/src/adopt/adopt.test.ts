/**
 * A takeover's plan, row by row: the workflows the template adds and drops, each hire it changes, the revisions policy before and after,
 * the store's rules it leaves unread with the line that writes them into the tree, the runs waiting or in flight by the policy after,
 * and the cards and schedules it would strand. Its refusals are laws of `contracts/adopt.contract.ts`, not rows here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Factory } from '../factory/factory.ts';
import { adoptLines, adoptPlan, type Adoption } from './adopt.ts';

/** A hand-made factory offering `a` and `b`, hiring `p` into `a/x`, scheduling `a`. */
const made: Factory = {
  name: 'f',
  repos: ['/r'],
  workflows: ['a', 'b'],
  hires: { 'a/x': 'p' },
  schedules: { a: { cron: '0 9 * * *', brief: 'daily', since: '2026-11-03T00:00:00.000Z' } },
};

/** A template's render offering `a` and `c`, hiring `q` into `a/x` and `r` into `c/y`. */
const adoption = (over: Partial<Adoption> = {}): Adoption => ({
  wiring: { workflows: ['a', 'c'], hires: { 'a/x': 'q', 'c/y': 'r' } },
  cards: [],
  leftovers: { base: null, tree: null },
  render: 'sha256:r',
  ...over,
});

test("a takeover's plan, row by row", async (t) => {
  await t.test('the workflows added and dropped, and each hire added, dropped or changed', () => {
    const plan = adoptPlan(made, adoption(), [], null);
    assert.deepEqual(plan.workflows, { added: ['c'], dropped: ['b'], kept: ['a'] });
    assert.deepEqual(plan.hires, [
      { step: 'a/x', kind: 'changed', was: 'p', now: 'q' },
      { step: 'c/y', kind: 'added', now: 'r' },
    ]);
    assert.deepEqual(adoptPlan(made, adoption({ wiring: { workflows: ['a'], hires: {} } }), [], null).hires, [
      { step: 'a/x', kind: 'dropped', was: 'p' },
    ]);
  });

  await t.test('what stays: the repositories, the schedules and whether it keeps an instruction', () => {
    const plan = adoptPlan({ ...made, instruction: { store: true } }, adoption(), [], null);
    assert.deepEqual(plan.kept, { repos: ['/r'], schedules: ['a'], instruction: true });
  });

  await t.test('the revisions policy before and after: pinned by default, follow where the wiring says it', () => {
    const plan = adoptPlan(made, adoption({ wiring: { workflows: ['a'], hires: {}, revisions: 'follow' } }), [], null);
    assert.deepEqual(plan.revisions, { was: 'pinned', now: 'follow' });
    assert.ok(adoptLines(plan, 'sha256:d', 'adopt').some((l) => l.includes('pinned → follow')));
  });

  await t.test("the store's rules are said unread, with the line that writes them into the tree", () => {
    const lines = adoptLines(adoptPlan(made, adoption(), [], '/s/factories/f/RULES.md'), 'sha256:d', 'adopt');
    assert.ok(lines.some((l) => l.includes('nemia factory rules f --file /s/factories/f/RULES.md')));
    assert.ok(!adoptLines(adoptPlan(made, adoption(), [], null), 'sha256:d', 'adopt').some((l) => l.includes('nemia factory rules')));
  });

  await t.test('the runs waiting or in flight are counted under the policy after', () => {
    const plan = adoptPlan(made, adoption({ wiring: { workflows: ['a'], hires: {}, revisions: 'follow' } }), ['r2', 'r1'], null);
    assert.deepEqual(plan.runs, { ids: ['r1', 'r2'], policy: 'follow' });
  });

  await t.test('a started card is not stranded, nor one naming no workflow; one filed for a dropped workflow is', () => {
    const cards = [
      { name: 'done', workflow: 'b', started: true },
      { name: 'loose', workflow: null, started: false },
      { name: 'kept', workflow: 'a', started: false },
      { name: 'left', workflow: 'b', started: false },
    ];
    const plan = adoptPlan({ ...made, schedules: {} }, adoption({ cards }), [], null);
    assert.deepEqual(
      plan.stranded.cards.map((c) => c.name),
      ['left'],
    );
    assert.deepEqual(plan.stranded.schedules, []);
  });

  await t.test('a schedule of a dropped workflow is stranded, and the plan then offers no adopt line', () => {
    const plan = adoptPlan({ ...made, schedules: { b: { cron: '0 9 * * *', brief: 'b', since: 'x' } } }, adoption(), [], null);
    assert.deepEqual(plan.stranded.schedules, ['b']);
    const lines = adoptLines(plan, 'sha256:d', 'nemia factory adopt f');
    assert.ok(!lines.some((l) => l.includes('nemia factory adopt f')));
    assert.ok(lines.some((l) => l.includes('nemia factory unschedule f b')));
  });

  await t.test('a plan that strands nothing carries its digest and the adopt line', () => {
    const lines = adoptLines(adoptPlan(made, adoption(), [], null), 'sha256:d', 'nemia factory adopt f --plan sha256:d');
    assert.ok(lines.some((l) => l.includes('sha256:d')));
    assert.ok(lines.some((l) => l.includes('nemia factory adopt f --plan sha256:d')));
  });
});
