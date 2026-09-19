import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentListing, KeyForm } from '../src/lib/api.ts';
import { choicesOf, draftOf, edited, formOf, ROLE_KEYS, schemaFileFor } from '../src/lib/agents.ts';

const listing = (fields: Partial<AgentListing> = {}): AgentListing => ({
  name: 'scribe',
  from: 'yours',
  dir: '/store/agents',
  file: '/store/agents/scribe.md',
  description: 'Use this when a change needs its notes written.',
  keys: { model: 'sonnet', effort: 'low' },
  body: 'You write the notes.\n',
  schema: null,
  source: '',
  version: 'v1',
  usedBy: [],
  error: null,
  ...fields,
});

test('an agent read into the form and sent back unchanged is the draft it was: its keys, nothing unset sent as set, and no schema', () => {
  const form = formOf(listing());
  assert.deepEqual(Object.keys(form.keys), [...ROLE_KEYS]);
  const draft = draftOf(form);
  assert.equal(draft.name, 'scribe');
  assert.equal(draft.description, 'Use this when a change needs its notes written.');
  assert.equal(draft.keys.model, 'sonnet');
  assert.equal(draft.keys.effort, 'low');
  assert.equal(draft.keys.tools, null, 'a key the file does not set is sent unset');
  assert.equal('schema' in draft, false, 'a schema not touched does not travel');
  assert.equal(edited(form, listing()), false);
});

test('a field emptied is unset, and a field typed with spaces round it is trimmed', () => {
  const form = formOf(listing());
  form.keys.model = '   ';
  form.keys.tools = ' Read, Grep ';
  form.description = '  ';
  const draft = draftOf(form);
  assert.equal(draft.keys.model, null);
  assert.equal(draft.keys.tools, 'Read, Grep');
  assert.equal(draft.description, null);
  assert.equal(edited(form, listing()), true);
});

test('a schema pasted with no file is named after the agent, and travels', () => {
  const form = formOf(listing());
  form.schemaText = '{ "type": "object" }';
  const draft = draftOf(form);
  assert.equal(draft.keys.output, 'scribe.schema.json');
  assert.deepEqual(draft.schema, { file: 'scribe.schema.json', text: '{ "type": "object" }' });
  assert.equal(schemaFileFor('  '), 'agent.schema.json');
});

test('a schema read with the agent travels only once its text or its file changes — one shared with another agent is otherwise left alone', () => {
  const read = listing({ keys: { output: 'notes.schema.json' }, schema: { file: 'notes.schema.json', text: '{ "type": "object" }\n' } });
  assert.equal('schema' in draftOf(formOf(read)), false);
  const moved = formOf(read);
  moved.keys.output = 'other.schema.json';
  assert.deepEqual(draftOf(moved).schema, { file: 'other.schema.json', text: '{ "type": "object" }\n' });
  const typed = formOf(read);
  typed.schemaText = '{ "type": "object", "required": [] }';
  assert.equal(draftOf(typed).schema?.file, 'notes.schema.json');
});

test("a key's choices are its harness's words, the default harness's when the agent names none, and none for a key typed freely", () => {
  const form = {
    defaultHarness: 'claude',
    keys: [
      { key: 'effort', meaning: '', kind: 'choice', choices: null, byHarness: { claude: ['low', 'high'], codex: ['minimal'] } },
      { key: 'remote', meaning: '', kind: 'choice', choices: ['true', 'false'], byHarness: null },
    ],
    roleKeys: [],
    agents: {},
  } as unknown as KeyForm;
  assert.deepEqual(choicesOf(form, 'effort', ''), ['low', 'high']);
  assert.deepEqual(choicesOf(form, 'effort', 'codex'), ['minimal']);
  assert.equal(choicesOf(form, 'effort', 'nowhere'), null, 'a harness the form does not know has no words: the field is typed');
  assert.deepEqual(choicesOf(form, 'remote', 'codex'), ['true', 'false']);
  assert.equal(choicesOf(form, 'model', ''), null);
  assert.equal(choicesOf(undefined, 'effort', ''), null);
});
