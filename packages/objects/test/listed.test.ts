/**
 * What a list leaves out (`src/listed.ts`): `filesLeftOut` names each path of `LISTED_WITHOUT` an object lacks where it holds the path's
 * parent, so an object a list served is told apart from one a read of one served, and a parent that is null or absent names nothing.
 * That each kind's list serves its items without those paths, every other key kept, is held by each kind's own test.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { KINDS, LISTED_WITHOUT, filesLeftOut } from 'objects';

const whole = {
  spec: { role: 'Architect', output: { file: 'a.schema.json', text: '{}' }, instructions: 'Design.' },
  status: { source: '---\n---\nDesign.\n' },
};

test('an agent a read of one served lacks nothing; one a list served lacks each of its files', () => {
  assert.deepEqual(filesLeftOut(LISTED_WITHOUT.Agent, whole), []);
  const listed = { spec: { role: 'Architect', output: { file: 'a.schema.json' } }, status: {} };
  assert.deepEqual(filesLeftOut(LISTED_WITHOUT.Agent, listed), ['spec.instructions', 'spec.output.text', 'status.source']);
});

test('a parent that is null or absent names nothing beneath it', () => {
  assert.deepEqual(filesLeftOut(['spec.output.text'], { spec: { output: null } }), []);
  assert.deepEqual(filesLeftOut(['spec.output.text'], { spec: {} }), []);
  assert.deepEqual(filesLeftOut(['spec.instructions'], {}), []);
});

test('a path through an array names a key any of its items lacks, and none where every item holds it', () => {
  const paths = ['spec.steps[].body'];
  assert.deepEqual(
    filesLeftOut(paths, {
      spec: {
        steps: [
          { name: 'a', body: '' },
          { name: 'b', body: 'x' },
        ],
      },
    }),
    [],
  );
  assert.deepEqual(filesLeftOut(paths, { spec: { steps: [{ name: 'a', body: '' }, { name: 'b' }] } }), paths);
  assert.deepEqual(filesLeftOut(paths, { spec: { steps: [] } }), []);
});

test('every kind says what its list leaves out, each path under its spec or its status', () => {
  assert.deepEqual(Object.keys(LISTED_WITHOUT).sort(), [...KINDS].sort());
  for (const paths of Object.values(LISTED_WITHOUT))
    for (const path of paths) assert.ok(path.startsWith('spec.') || path.startsWith('status.'), path);
});
