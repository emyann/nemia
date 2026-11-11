/** `workflowSpecOf`: a workflow folder's text files read as the spec a Workflow carries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowSpecOf } from './workflow-spec.ts';

test("a folder's files as a spec: its steps by name, its README, and its other text files sorted, none of them markdown", () => {
  const spec = workflowSpecOf([
    { name: 'route.schema.json', text: '{}' },
    { name: 'b.md', text: '---\nagent: x\n---\nDo b.\n' },
    { name: 'README.md', text: '# Flow\n' },
    { name: 'check.ts', text: 'export {};\n' },
    { name: 'a.md', text: 'Do a.\n' },
  ]);
  assert.equal(spec.readme, '# Flow\n');
  assert.deepEqual(
    spec.steps.map((s) => [s.name, s.keys]),
    [
      ['a', {}],
      ['b', { agent: 'x' }],
    ],
  );
  assert.deepEqual(
    spec.files.map((f) => f.path),
    ['check.ts', 'route.schema.json'],
  );
  assert.equal('readme' in workflowSpecOf([{ name: 'a.md', text: '' }]), false, 'a folder with no README says none');
});

test("a step's keys in the form the spec carries them: a list a file writes `a, b` as its names", () => {
  const [step] = workflowSpecOf([{ name: 'b.md', text: '---\nafter: a, c\nagent: x\n---\nDo b.\n' }]).steps;
  assert.deepEqual(step?.keys, { after: ['a', 'c'], agent: 'x' });
});

test('markdown in capitals is markdown: a README.MD is the README, and no .MD is among the other files', () => {
  const spec = workflowSpecOf([
    { name: 'README.MD', text: '# Flow\n' },
    { name: 'NOTES.MD', text: 'notes\n' },
    { name: 'a.md', text: 'Do a.\n' },
  ]);
  assert.equal(spec.readme, '# Flow\n');
  assert.deepEqual(spec.files, []);
});
