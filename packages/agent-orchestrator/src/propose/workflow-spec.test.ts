/** `workflowSpecOf`: a workflow folder's text files read as the spec a Workflow carries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workflowSpecOf } from './workflow-spec.ts';
import { Schema } from 'effect';
import { StepKeys } from 'objects';
import { parseWorkflow, renderStep } from '../workflow/index.ts';
import { readKeys } from '../former/former.ts';
import { MAP_KEYS } from '../frontmatter/frontmatter.ts';
import { splitFrontmatter } from '../step/step.ts';

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

test("a key the loader reads as text though it holds a map is carried as readKeys' JSON text, flow or block, and written back loads as it was", async (t) => {
  const policy = { rules: [{ action: 'FailStep', onExitCodes: { operator: 'In', values: [78] } }] };
  const rows: [string, string][] = [
    ['a flow map', 'checkFailurePolicy: { rules: [ { action: FailStep, onExitCodes: { operator: In, values: [78] } } ] }\n'],
    [
      'a block map',
      'checkFailurePolicy:\n  rules:\n    - action: FailStep\n      onExitCodes:\n        operator: In\n        values: [78]\n',
    ],
  ];
  for (const [form, lines] of rows)
    await t.test(form, () => {
      const text = `---\nplace: git\ncheck: npm test\nretries: 2\n${lines}---\nDo it.\n`;
      const [step] = workflowSpecOf([{ name: 'implement.md', text }]).steps;
      const read = readKeys('implement', splitFrontmatter('implement', text).block ?? '', () => undefined, MAP_KEYS).meta;
      assert.equal(step?.keys.checkFailurePolicy, read.checkFailurePolicy, "readKeys' text");
      assert.ok(Schema.is(StepKeys)(step?.keys), "objects' StepKeys, as it stands");
      const written = renderStep({ name: 'implement', body: step?.body ?? '', ...step?.keys } as never);
      assert.deepEqual(parseWorkflow('implement', written).checkFailurePolicy, policy);
    });
  const [routed] = workflowSpecOf([{ name: 'gate.md', text: '---\nroute:\n  script: route.ts\n---\nRoute.\n' }]).steps;
  assert.equal(routed?.keys.route, JSON.stringify({ script: 'route.ts' }), '`route:` as a map is text too');
  const routedBack = renderStep({ name: 'gate', body: routed?.body ?? '', ...routed?.keys, routes: ['a', 'b'] } as never);
  assert.match(routedBack, /^route:\n {2}script: route\.ts$/m, 'and written back, a map again');
});
