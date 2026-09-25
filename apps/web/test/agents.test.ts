import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentListing, KeyForm } from '../src/lib/api.ts';
import { choicesOf, deniedWithoutSkill, draftOf, edited, formKeyOf, formOf, hasKey, keptAfterCopy, KEY_LABELS, pickSystemPrompt, ROLE_KEYS, schemaFileFor, skillLine, skillList, skillToolGap, SYSTEM_PROMPT_CHOICES, SYSTEM_PROMPTS, systemPromptShown, toolsWithSkill, withoutSkill, withSkill } from '../src/lib/agents.ts';

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
  cardError: null,
  skills: null,
  systemPrompt: null,
  given: [],
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

const saying = () => listing({ skills: 'write-a-note', card: [{ id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note'] }] });

test("an agent's card is generated, never sent: no draft carries it, or any name a card file travelled under, and it is no edit of the form", () => {
  const draft = draftOf(formOf(saying()));
  for (const retired of ['card', 'cardText', 'skillsText']) assert.equal(Object.hasOwn(draft, retired), false, retired);
  assert.equal(draft.skills, 'write-a-note', 'what it is generated from travels: the skills it gives');
  assert.equal(edited(formOf(saying()), saying()), false);
  assert.equal(edited(formOf(saying()), { ...saying(), card: [] }), false, 'a card generated otherwise since is not something typed');
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
  for (const own of ['description', 'skills', 'systemPrompt']) assert.equal((ROLE_KEYS as readonly string[]).includes(own), false, own);
  assert.deepEqual(SYSTEM_PROMPTS, ['default', 'no-coding', 'own']);
});

test("the skills line is edited as a list and sent as the line the package reads: in its order, each once, trimmed", () => {
  assert.deepEqual(skillList(' review-a-change,, write-a-note ,'), ['review-a-change', 'write-a-note']);
  assert.equal(skillLine(['a', 'b']), 'a, b');
  assert.equal(withSkill('', 'write-a-note'), 'write-a-note');
  assert.equal(withSkill('review-a-change', 'write-a-note'), 'review-a-change, write-a-note', 'added last');
  assert.equal(withSkill('write-a-note ', 'write-a-note'), 'write-a-note ', 'a name given already leaves the line as it was: no edit');
  assert.equal(withoutSkill('review-a-change, write-a-note', 'review-a-change'), 'write-a-note');
  assert.equal(withoutSkill('write-a-note', 'write-a-note'), '');
  // Added and removed through the form, the draft is what the typed line was.
  const form = formOf(listing());
  form.skills = withSkill(withSkill(form.skills, 'review-a-change'), 'write-a-note');
  assert.equal(draftOf(form).skills, 'review-a-change, write-a-note');
  form.skills = withoutSkill(withoutSkill(form.skills, 'write-a-note'), 'review-a-change');
  assert.equal(draftOf(form).skills, null, 'every skill removed is the line unset');
  assert.equal(edited(form, listing()), false);
});

test("REFUSED before the save is: skills given with tools that leave out Skill, or deny it, as the package reads a tool list", () => {
  const form = (skills: string, tools = '', disallowedTools = '') => ({ skills, keys: { ...formOf(listing()).keys, tools, disallowedTools } });
  assert.equal(skillToolGap(form('write-a-note', 'Read, Grep')), 'tools');
  assert.equal(skillToolGap(form('write-a-note', 'Read, Skill(look)')), 'tools', 'a Skill rule is not the Skill tool: the package wants the entry itself');
  assert.equal(skillToolGap(form('write-a-note', '', 'Bash, Skill')), 'disallowedTools');
  assert.equal(skillToolGap(form('write-a-note', 'Read, Skill')), null);
  assert.equal(skillToolGap(form('write-a-note')), null, 'tools unset: the harness decides');
  assert.equal(skillToolGap(form('', 'Read')), null, 'no skills, nothing to load');
  assert.equal(toolsWithSkill('Read, Grep '), 'Read, Grep, Skill');
  assert.equal(deniedWithoutSkill('Bash, Skill'), 'Bash');
});

test("the system prompt drawn unset is the default, and picking the default writes it only where the file said it", () => {
  assert.deepEqual(SYSTEM_PROMPT_CHOICES.map((c) => c.value), [...SYSTEM_PROMPTS], "one choice for each word, in the package's order");
  assert.deepEqual(SYSTEM_PROMPT_CHOICES.filter((c) => c.expert).map((c) => c.value), ['own'], 'only the one that drops the safety rules is for experts');
  assert.equal(systemPromptShown(''), 'default');
  assert.equal(systemPromptShown('no-coding'), 'no-coding');
  assert.equal(pickSystemPrompt('no-coding', ''), 'no-coding');
  assert.equal(pickSystemPrompt('default', ''), '', 'unset and back is unset: no systemPrompt: default is written');
  assert.equal(pickSystemPrompt('default', 'default'), 'default', 'a file that said default keeps saying it');
  assert.equal(pickSystemPrompt('default', 'own'), '', 'moved to the default, the line is left out');
  const read = listing();
  const form = formOf(read);
  form.systemPrompt = pickSystemPrompt('own', '');
  assert.equal(draftOf(form).systemPrompt, 'own');
  form.systemPrompt = pickSystemPrompt('default', '');
  assert.equal(edited(form, read), false, 'picked and put back is no edit');
});

test("a copy that moves only the version keeps the form's key for that version alone, and anything else read after it remounts the form", () => {
  const was = listing({ source: 'scribe file', version: 'v1', schema: { type: 'object' } });
  const kept = keptAfterCopy(was, { ...was, version: 'v2' }, 'v1');
  assert.deepEqual(kept, { key: 'v1', version: 'v2' }, 'the file is the same: the draft stays, and the save sends v2');
  assert.equal(formKeyOf('v2', kept), 'v1', 'the version the copy moved to keeps the mounted form');
  assert.equal(formKeyOf('v3', kept), 'v3', 'a version moved again, by a save or an edit elsewhere, remounts');
  assert.equal(formKeyOf('v1', null), 'v1', 'with nothing kept the key is the version');
});

test("REFUSED to keep the draft over a copy: the agent's file or its schema changed meanwhile, as another writer's edit would", () => {
  const was = listing({ source: 'scribe file', version: 'v1', schema: { type: 'object' } });
  assert.equal(keptAfterCopy(was, { ...was, source: 'edited elsewhere', version: 'v2' }, 'v1'), null, 'the file changed: the form is read again');
  assert.equal(keptAfterCopy(was, { ...was, schema: { type: 'string' }, version: 'v2' }, 'v1'), null, 'the schema changed: the form is read again');
  assert.equal(keptAfterCopy(was, { ...was, schema: null, version: 'v2' }, 'v1'), null, 'the schema went: the form is read again');
});
