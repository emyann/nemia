/**
 * A judge (`route: judge`): filed as a step, its signed closeout's `route` routes the nodes after it, and a closeout without one is
 * unsigned (`owedFields`); its closeout schema owes `route` over its routes (`closeoutSchemaOf`); its brief names each route's targets
 * (`judgeSection`); and a start refuses one that nothing hired, which load left to a hire (`stepSetRefusal`). Pure: the engine's view of
 * each task is handed in.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../src/tick/assess.ts';
import { runWords } from '../src/route/routed/routed-words.ts';
import { closeoutSchemaOf, type Closeout } from '../src/closeout/closeout.ts';
import { composeBrief } from '../src/brief/brief.ts';
import { stepSetRefusal, validate } from '../src/workflow/validate.ts';
import type { TaskPhase } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import { aRead, phases, run, step } from './assessed.ts';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { workflowTargets } from '../src/tick/told.verb.ts';

const READER = { name: 'reviewer', keys: [], body: 'Read the change and choose.', given: {} };

/** plan → triage (a judge on a read-only agent; docs ends the run) → build-web | to-backend (a card for backend). */
const JUDGED: Workflow[] = [
  step('plan'),
  {
    ...step('triage', ['plan']),
    routes: ['web', 'backend', 'docs'],
    route: { kind: 'judge' },
    ends: ['docs'],
    agent: READER,
    permissionMode: 'dontAsk',
  },
  { ...step('build-web', ['triage']), body: 'Build the web change.\n\nThen test it.', when: ['web'] },
  { ...step('to-backend', ['triage']), body: 'Hand the backend change on.', when: ['backend'], workflow: 'backend' },
];

const NAMES = JUDGED.map((s) => s.name);

/** One pass: plan and triage filed in `filed`, triage signed with `output` when it succeeded. */
const passOf = (filed: Record<string, TaskPhase>, output?: Record<string, unknown>) => {
  const r = run(Object.fromEntries(NAMES.map((n) => [n, n in filed ? `t-${n}` : null])));
  const phaseOf = phases(Object.fromEntries(Object.entries(filed).map(([n, p]) => [`t-${n}`, p])));
  const said = (name: string): Closeout | undefined =>
    filed[name] === 'succeeded'
      ? { outcome: 'done', summary: `did ${name}`, artifacts: [], ...(name === 'triage' && output ? { output } : {}) }
      : undefined;
  const asked = () => true;
  return {
    a: assess(aRead(JUDGED, r, { phaseOf, signedOff: said, asked })),
    words: Object.fromEntries(runWords(JUDGED, r, phaseOf, said, asked)),
  };
};

test('a judge is filed as a step, and its signed route routes the nodes after it', async (t) => {
  await t.test('the workflow loads', () => validate(JUDGED));
  await t.test('plan signed: the judge is filed, as a step is', () => {
    assert.deepEqual(passOf({ plan: 'succeeded' }).a.ready, ['triage']);
  });
  await t.test('the judge signed route web: build-web is filed, the card for backend is skipped', () => {
    const { a, words } = passOf({ plan: 'succeeded', triage: 'succeeded' }, { route: 'web' });
    assert.deepEqual(a.ready, ['build-web']);
    assert.deepEqual(a.send, []);
    assert.equal(words['to-backend'], 'skipped');
  });
  await t.test('the judge signed route backend: the card is due, build-web skipped', () => {
    const { a, words } = passOf({ plan: 'succeeded', triage: 'succeeded' }, { route: 'backend' });
    assert.deepEqual([a.ready, a.send], [[], ['to-backend']]);
    assert.equal(words['build-web'], 'skipped');
  });
  await t.test('a closeout with no route is unsigned, and nothing after the judge starts', () => {
    const { a, words } = passOf({ plan: 'succeeded', triage: 'succeeded' }, {});
    assert.equal(words.triage, 'unsigned');
    assert.deepEqual([a.ready, a.send], [[], []]);
  });

  await t.test('a closeout naming a route the judge does not declare is unsigned, never a route', () => {
    const { a, words } = passOf({ plan: 'succeeded', triage: 'succeeded' }, { route: 'mobile' });
    assert.equal(words.triage, 'unsigned');
    assert.deepEqual([a.ready, a.send], [[], []]);
  });
});

test("a judge's closeout schema owes route, one of its routes; no other step's does", () => {
  const [plan, triage] = JUDGED;
  assert.ok(plan && triage);
  const schema = closeoutSchemaOf(triage, JUDGED);
  assert.deepEqual(schema.properties.route, { type: 'string', enum: ['web', 'backend', 'docs'] });
  assert.ok(schema.required.includes('route'));
  assert.equal(closeoutSchemaOf(plan, JUDGED).properties.route, undefined);
});

test("a judge's brief names each route's targets, and the route it ends on", () => {
  const [plan, triage] = JUDGED;
  assert.ok(plan && triage);
  const brief = composeBrief(triage, run({ plan: 't-plan', triage: null }), JUDGED);
  assert.match(brief, /`web`: the step build-web: Build the web change\./);
  assert.match(brief, /`backend`: a card for the workflow backend \(to-backend: Hand the backend change on\.\)/);
  assert.match(brief, /`docs`: ends the run/);
  assert.doesNotMatch(composeBrief(plan, run({ plan: null }), JUDGED), /routes you choose between/);
});

test("a judge's brief describes a workflow it routes to by that workflow's README, read beside the run's own", () => {
  const [, triage] = JUDGED;
  assert.ok(triage);
  const team = scratch('judge-targets');
  fs.mkdirSync(path.join(team, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(team, 'backend', 'README.md'), '# backend\n\nBuild a backend change to main.\n');
  const r = { ...run({ plan: 't-plan', triage: null }), workflowDir: path.join(team, 'triage') };
  const targets = workflowTargets(r, JUDGED, triage);
  assert.deepEqual(Object.keys(targets), ['backend']);
  const none = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const;
  const brief = composeBrief(triage, r, JUDGED, ...none, { targets });
  assert.match(brief, /a card for the workflow backend \(to-backend: Build a backend change to main\.\)/);
});

test('a judge load left to a hire is refused at start while nothing hired it, and taken once a read-only agent is', () => {
  const unhired = JUDGED.map((s) => (s.name === 'triage' ? { ...s, agent: undefined, permissionMode: undefined } : s));
  validate(unhired);
  assert.notEqual(stepSetRefusal(unhired, true), undefined);
  assert.equal(stepSetRefusal(JUDGED, true), undefined);
});
