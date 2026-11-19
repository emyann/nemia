/**
 * The steps each agent fills (`stepsFilled`), and the factories that fill them (`factoriesFilling`): a step credited to the file a start
 * would run it with (`agentFileOf`), never to every agent of that name.
 *
 * The repository `repo` has the workflow `alpha`, whose `implement` names no agent and whose `review` names `iris`, and `gamma`, whose
 * `plan` names `ada` and whose `stray` names `../agents/ada`; its `agents/` has `iris` and `ada`. The store `home` has `ada` and `zed`, and
 * the workflow `omega`, whose `step` names `zed`. A factory made from a template has a tree of its own, with `alpha` and `proof`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import type { Factory, FactoryListing } from '../factory/factory.ts';
import { agentFileOf, factoriesFilling, stepsFilled } from './fills.store.ts';

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const repo = scratch('wf-fills-repo-');
const home = scratch('wf-fills-home-');
write(path.join(repo, 'workflows', 'alpha', 'implement.md'), 'Implement it.\n');
write(path.join(repo, 'workflows', 'alpha', 'review.md'), '---\nagent: iris\n---\nReview it.\n');
write(path.join(repo, 'workflows', 'gamma', 'plan.md'), '---\nagent: ada\n---\nPlan it.\n');
write(path.join(repo, 'workflows', 'gamma', 'stray.md'), '---\nagent: ../agents/ada\n---\nDo it.\n');
for (const name of ['iris', 'ada']) write(path.join(repo, 'workflows', 'agents', `${name}.md`), `You are ${name}.\n`);
for (const name of ['ada', 'zed']) write(path.join(home, 'workflows', 'agents', `${name}.md`), `You are your ${name}.\n`);
write(path.join(home, 'workflows', 'omega', 'step.md'), '---\nagent: zed\n---\nStep it.\n');

const theirs = (name: string): string => path.resolve(repo, 'workflows', 'agents', `${name}.md`);
const yours = (name: string): string => path.resolve(home, 'workflows', 'agents', `${name}.md`);
const factory = (name: string, workflows: string[], hires: Factory['hires'] = {}): Factory => ({
  name,
  volumes: [{ path: repo, readOnly: false }],
  workflows,
  hires,
  schedules: {},
});

test("every step of both places, credited to the file a start runs: the workflow's own agents/ before yours", () => {
  assert.deepEqual(stepsFilled(repo, home), [
    { from: 'repo', workflow: 'alpha', step: 'review', hired: false, file: theirs('iris') },
    { from: 'repo', workflow: 'gamma', step: 'plan', hired: false, file: theirs('ada') },
    { from: 'user', workflow: 'omega', step: 'step', hired: false, file: yours('zed') },
  ]);
});

test("REFUSED: a name holding a path separator names no agent's file, not even the one the path reaches", () => {
  assert.equal(agentFileOf(path.join(repo, 'workflows', 'gamma'), '../agents/ada', { repo, home }), undefined);
  assert.equal(agentFileOf(path.join(repo, 'workflows', 'gamma'), 'ada', { repo, home }), theirs('ada'));
});

test('in a factory, only the workflows it attaches, with its hires credited as hired', () => {
  const hired = factory('hired', ['alpha'], { 'alpha/implement': 'ada', 'gamma/plan': 'iris' });
  assert.deepEqual(stepsFilled(repo, home, hired), [
    { from: 'repo', workflow: 'alpha', step: 'implement', hired: true, file: theirs('ada') },
    { from: 'repo', workflow: 'alpha', step: 'review', hired: false, file: theirs('iris') },
  ]);
});

test('each agent file the factories fill a step with, their names sorted; a factory that does not read fills nothing', () => {
  const listings: FactoryListing[] = [
    { ...factory('zeta', ['gamma']), file: 'zeta.json' },
    { ...factory('alpha', ['gamma', 'alpha']), file: 'alpha.json' },
    { name: 'broken', file: 'broken.json', error: 'it does not read' },
  ];
  assert.deepEqual(
    factoriesFilling(listings, home),
    new Map([
      [theirs('ada'), ['alpha', 'zeta']],
      [theirs('iris'), ['alpha']],
    ]),
  );
});

test("a factory made from a template fills the steps of its tree's workflows with its tree's agents, a workflow read once, as a start reads it", () => {
  const tree = scratch('wf-fills-tree-');
  write(path.join(tree, 'workflows', 'alpha', 'review.md'), 'Review it.\n');
  write(path.join(tree, 'workflows', 'agents', 'proof.md'), 'You are proof.\n');
  const treed: Factory = { ...factory('treed', ['alpha', 'omega'], { 'alpha/review': 'proof', 'omega/step': 'proof' }), tree };
  const own = path.resolve(tree, 'workflows', 'agents', 'proof.md');
  assert.deepEqual(stepsFilled(repo, home, treed), [
    { from: 'factory', workflow: 'alpha', step: 'review', hired: true, file: own },
    { from: 'user', workflow: 'omega', step: 'step', hired: false, file: yours('zed') },
  ]);
  assert.deepEqual(factoriesFilling([{ ...treed, file: 'treed.json' }], home).get(own), ['treed']);
  assert.deepEqual(factoriesFilling([{ ...treed, volumes: [], file: 'treed.json' }], home).get(own), ['treed'], 'on its tree alone');
});
