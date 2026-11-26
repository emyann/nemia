/**
 * sdlc's label values as a factory gets them: applied with `labelValues` set, its tree's wiring holds the values each key takes, which
 * filing then judges a card's labels by (the orchestrator's doors, tested there); applied with none, the wiring names none, and filing
 * refuses nothing.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyOf, rendered, SDLC } from './template.ts';

const COPY = copyOf(SDLC);
const TREES = await rendered([
  { name: 'valued', template: COPY, sets: ['labelValues=work=feature work=fix area=cli'] },
  { name: 'plain', template: COPY },
]);

/** The wiring the render wrote into the tree of the factory `name`. */
const wiringOf = (name: string) => {
  const tree = TREES[name]?.tree;
  assert.ok(tree, `${name} was rendered: ${JSON.stringify(TREES[name]?.conditions)}`);
  return JSON.parse(fs.readFileSync(path.join(tree, 'factory.json'), 'utf8')) as { labelValues?: Record<string, string[]> };
};

test('labelValues set renders the values each key takes into the wiring, each key its values in the order written', () => {
  assert.deepEqual(wiringOf('valued').labelValues, { work: ['feature', 'fix'], area: ['cli'] });
});

test('labelValues left empty, the default, renders none', () => {
  assert.equal('labelValues' in wiringOf('plain'), false);
});
