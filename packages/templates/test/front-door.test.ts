/**
 * sdlc's front door as a factory gets it: applied with `frontDoorLabel` set, its tree's wiring holds the `front-door` trigger selecting
 * cards by that key, and with it left empty, none; `front-door` loads with Iris hired into its door and its answer — the door a judge
 * whose fence writes nothing, since a judge that writes is refused at load — routing to intake, build and quick by card nodes that file the
 * card as given, to an answer, and to a backlog node that files it back without the label; every hire of the template names an agent of
 * the team.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, parseFolder } from 'agent-orchestrator/workflow';
import { copyOf, rendered, SDLC } from './template.ts';

const COPY = copyOf(SDLC);
const TREES = await rendered([
  { name: 'door', template: COPY, sets: ['frontDoorLabel=ready'] },
  { name: 'none', template: COPY },
]);

/** The tree of the factory `name`, which the controller seeded. */
const treeOf = (name: string) => {
  const tree = TREES[name]?.tree;
  assert.ok(tree, `${name} was rendered: ${JSON.stringify(TREES[name]?.conditions)}`);
  return tree;
};

type Wiring = { hires: Record<string, string>; triggers?: Record<string, { selector: string; target: { kind: string; name: string } }> };

/** The wiring the render wrote into the tree of the factory `name`. */
const wiringOf = (name: string) => JSON.parse(fs.readFileSync(path.join(treeOf(name), 'factory.json'), 'utf8')) as Wiring;

/** The front door of the factory `name`, parsed with Iris hired into its door and its answer, as a run reads it. */
const frontDoorOf = (name: string) => {
  const folder = path.join(treeOf(name), 'workflows', 'front-door');
  const files = fs
    .readdirSync(folder)
    .filter((leaf) => leaf.endsWith('.md') && leaf !== 'README.md')
    .map((leaf) => [leaf.slice(0, -'.md'.length), fs.readFileSync(path.join(folder, leaf), 'utf8')] as const);
  const readIn = (dir: string) => (file: string) => {
    const at = path.join(dir, file);
    return fs.existsSync(at) ? fs.readFileSync(at, 'utf8') : undefined;
  };
  const agents = path.join(treeOf(name), 'workflows', 'agents');
  const iris = parseAgent('iris', fs.readFileSync(path.join(agents, 'iris.md'), 'utf8'), readIn(agents));
  return parseFolder(files, readIn(folder), new Map([['iris', iris]]), undefined, {
    factory: name,
    workflow: 'front-door',
    agents: { door: 'iris', answer: 'iris' },
  });
};

test('with frontDoorLabel set, the factory has the front-door trigger, selecting cards that carry that key, to front-door', () => {
  assert.deepEqual(wiringOf('door').triggers, {
    'front-door': { selector: 'ready', target: { kind: 'Workflow', name: 'front-door' }, since: '' },
  });
});

test('with frontDoorLabel left empty, the factory has no trigger', () => {
  assert.equal(wiringOf('none').triggers, undefined);
});

test("every hire of sdlc names an agent of the team, the front door's among them", () => {
  const agents = fs.readdirSync(path.join(treeOf('door'), 'workflows', 'agents')).map((leaf) => leaf.replace(/\.md$/, ''));
  const hires = wiringOf('door').hires;
  assert.deepEqual([hires['front-door/door'], hires['front-door/answer']], ['iris', 'iris']);
  assert.deepEqual(
    Object.values(hires).filter((agent) => !agents.includes(agent)),
    [],
  );
});

test('front-door loads with Iris as its judge, routing by card nodes, an answer, and a backlog that files the card back unlabelled', () => {
  const steps = frontDoorOf('door');
  const of = (step: string) => steps.find((s) => s.name === step);
  assert.deepEqual(steps.map((s) => s.name).sort(), ['answer', 'backlog', 'door', 'to-build', 'to-intake', 'to-quick']);
  assert.deepEqual([of('door')?.route, of('door')?.gate ?? false], [{ kind: 'judge' }, false]);
  assert.deepEqual(of('door')?.routes, ['intake', 'build', 'quick', 'answer', 'backlog']);
  for (const workflow of ['intake', 'build', 'quick'])
    assert.deepEqual([of(`to-${workflow}`)?.workflow, of(`to-${workflow}`)?.card], [workflow, 'given']);
  assert.deepEqual([of('backlog')?.card, of('backlog')?.workflow, of('backlog')?.unlabel], ['backlog', undefined, ['ready']]);
});

test('with frontDoorLabel left empty, front-door still loads, its backlog removing no label', () => {
  const backlog = frontDoorOf('none').find((s) => s.name === 'backlog');
  assert.deepEqual([backlog?.card, backlog?.unlabel], ['backlog', undefined]);
});
