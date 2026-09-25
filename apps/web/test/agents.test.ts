import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentListing, KeyForm } from '../src/lib/api.ts';
import { choicesOf, draftOf, edited, formOf, hasKey, KEY_LABELS, ROLE_KEYS, schemaFileFor, cardFileFor, SYSTEM_PROMPTS } from '../src/lib/agents.ts';

const listing = (fields: Partial<AgentListing> = {}): AgentListing => ({
  name: 'scribe',
  from: 'yours',
  dir: '/store/agents',
  file: '/store/agents/scribe.md',
  description: 'Use this when a change needs its notes written.',
  keys: { model: 'sonnet', effort: 'low' },
  body: 'You write the notes.\n',
  schema: null,
  card: null,
  skills: null,
  systemPrompt: null,
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
  assert.equal(draft.card, null, 'an agent that names no card says so');
  assert.equal('cardText' in draft, false, 'and sends no text to write to a file it does not name');
  assert.equal(draft.skills, null, 'nor skills');
  assert.equal(draft.systemPrompt, null, 'and no system prompt, which is the default');
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

test("each harness has its own fence on the form: Claude Code a permission mode, codex a sandbox, and neither the other's", () => {
  const form = {
    defaultHarness: 'claude',
    keys: [
      { key: 'harness', meaning: '', kind: 'choice', choices: ['claude', 'codex', 'claude-detached'], byHarness: null },
      { key: 'permissionMode', meaning: '', kind: 'harness-word', choices: null, byHarness: { claude: ['dontAsk'], 'claude-detached': ['dontAsk'] } },
      { key: 'sandbox', meaning: '', kind: 'harness-word', choices: null, byHarness: { codex: ['read-only', 'workspace-write'] } },
      { key: 'remote', meaning: '', kind: 'choice', choices: ['true', 'false'], byHarness: null },
    ],
    roleKeys: [],
    agents: {},
  } as unknown as KeyForm;
  assert.deepEqual([hasKey(form, 'sandbox', 'codex'), hasKey(form, 'permissionMode', 'codex')], [true, false]);
  assert.deepEqual([hasKey(form, 'sandbox', ''), hasKey(form, 'permissionMode', '')], [false, true], 'an agent that names no harness runs on the default, Claude Code');
  assert.deepEqual([hasKey(form, 'sandbox', 'claude-detached'), hasKey(form, 'permissionMode', 'claude-detached')], [false, true]);
  assert.equal(hasKey(form, 'remote', 'codex'), true, 'a key that is not a harness word is every harness\'s');
  assert.equal(hasKey(form, 'sandbox', 'nowhere'), true, 'a harness the form does not know is judged on save, not here');
  assert.equal(hasKey(undefined, 'sandbox', 'claude'), true, 'and nothing is hidden before the form is read');
  assert.deepEqual(choicesOf(form, 'sandbox', 'codex'), ['read-only', 'workspace-write']);
  assert.ok(ROLE_KEYS.includes('sandbox') && KEY_LABELS.sandbox === 'Sandbox');
});

const SAID = '[{ "id": "write-a-note", "name": "Write a note", "description": "Writes the notes of a change.", "tags": ["note"] }]\n';
const saying = () => listing({ card: { file: 'scribe.skills.json', text: SAID, list: [{ id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note'] }] } });

test("an agent's card read into the form is the file it names and that file's text, and sent back unchanged they do not travel", () => {
  const form = formOf(saying());
  assert.equal(form.cardFile, 'scribe.skills.json');
  assert.equal(form.cardText, SAID);
  const draft = draftOf(form);
  assert.equal(draft.card, 'scribe.skills.json', 'the line travels with every save, as the description does');
  assert.equal('cardText' in draft, false, 'the file does not, until it changes');
  assert.equal(edited(form, saying()), false);
});

test('a card pasted with no file is named after the agent, and travel', () => {
  const form = formOf(listing());
  form.cardText = SAID;
  const draft = draftOf(form);
  assert.equal(draft.card, 'scribe.skills.json');
  assert.equal(draft.cardText, SAID);
  assert.equal(cardFileFor('  '), 'agent.skills.json');
  assert.equal(edited(form, listing()), true);
});

test('a card read with the agent travels only once its text or its file changes — one shared with another agent is otherwise left alone', () => {
  const read = saying();
  const moved = formOf(read);
  moved.cardFile = 'notes.skills.json';
  assert.equal(draftOf(moved).cardText, SAID, 'the file named otherwise is written where it now points');
  assert.equal(draftOf(moved).card, 'notes.skills.json');
  const typed = formOf(read);
  typed.cardText = `${SAID.trimEnd()} `;
  assert.equal('cardText' in draftOf(typed), false, 'spaces round it are not a change');
  typed.cardText = '[]';
  assert.equal(draftOf(typed).cardText, '[]', 'what the package then refuses, in its own words');
});

test('the card line emptied is sent unset, and the text emptied with it', () => {
  const form = formOf(saying());
  form.cardFile = '';
  form.cardText = '';
  const draft = draftOf(form);
  assert.equal(draft.card, null);
  assert.equal('cardText' in draft, false, 'there is no file to write it to');
  assert.equal(edited(form, saying()), true);
});

test("the skills an agent gives and its system prompt are its own lines: read as written, sent trimmed, and emptied sent unset", () => {
  const read = listing({ skills: 'review-a-change, write-a-note', systemPrompt: 'no-coding', keys: { tools: 'Read, Skill' } });
  const form = formOf(read);
  assert.equal(form.skills, 'review-a-change, write-a-note');
  assert.equal(form.systemPrompt, 'no-coding');
  assert.equal(edited(form, read), false);
  assert.equal(draftOf(form).skills, 'review-a-change, write-a-note');
  assert.equal(draftOf(form).systemPrompt, 'no-coding');
  assert.equal('skills' in draftOf(form).keys, false, 'no role key: a step that names the agent does not inherit it');
  form.skills = '  write-a-note ';
  form.systemPrompt = '';
  assert.equal(draftOf(form).skills, 'write-a-note');
  assert.equal(draftOf(form).systemPrompt, null);
  assert.equal(edited(form, read), true);
  form.skills = ' ';
  assert.equal(draftOf(form).skills, null);
});

test('no key that describes the agent itself is a role key the form sends among its keys', () => {
  for (const own of ['description', 'card', 'skills', 'systemPrompt']) assert.equal((ROLE_KEYS as readonly string[]).includes(own), false, own);
  assert.deepEqual(SYSTEM_PROMPTS, ['default', 'no-coding', 'own']);
});
