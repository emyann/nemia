/** `agentSpecOf`: an agent as it parses read as the spec an Agent carries, its result schema beside it where one is given. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentSpecOf } from './agent-spec.ts';
import { parseAgent } from '../agents/agents.ts';

const TEXT =
  '---\nrole: Reviewer\ndescription: Reviews a change.\nskills: git, look\nmcp: docs\nmodel: opus\noutput: review.schema.json\n---\nReview it.\n';

test("an agent's spec: its lines, its keys, its skills and servers joined as a line writes them, its instructions and its schema", () => {
  const text = JSON.stringify({
    type: 'object',
    properties: { verdict: { type: 'string' } },
    required: ['verdict'],
    additionalProperties: false,
  });
  const schema = { file: 'review.schema.json', text };
  const read = (file: string) => (file === schema.file ? schema.text : undefined);
  const spec = agentSpecOf(parseAgent('reviewer', TEXT, read), schema);
  assert.equal(spec.role, 'Reviewer');
  assert.equal(spec.description, 'Reviews a change.');
  assert.equal(spec.skills, 'git, look');
  assert.equal(spec.mcp, 'docs');
  assert.equal(spec.keys.model, 'opus');
  assert.equal(spec.keys.output, 'review.schema.json');
  assert.equal(spec.instructions.trim(), 'Review it.');
  assert.deepEqual(spec.output, schema);
});

test('no schema given, none carried: `output` left out, for none and for null alike, and a line the agent has not left out', () => {
  const plain = parseAgent('plain', '---\nmodel: sonnet\n---\nDo it.\n');
  for (const schema of [undefined, null]) {
    const spec = agentSpecOf(plain, schema);
    assert.equal('output' in spec, false);
    assert.equal('role' in spec || 'skills' in spec || 'mcp' in spec || 'description' in spec, false);
  }
});
