/**
 * An agent written from a draft (`renderAgent`, `writeAgent`, `removeAgent`): what the board's Agents page saves.
 *
 * The render is the inverse of `parseAgent`, held over every shipped agent. Each refusal of the writer is made to refuse, at shipped
 * defaults, asserted on its message and with the folder as it was.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentNameRefusal, agentUsers, agentVersion, loadAgents, loadWorkflows, parseAgent, renderAgent, WorkflowError, type Agent, type AgentDraft } from '../src/workflow.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-agent-'));
// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { AgentWriteError, removeAgent, writeAgent } = await import('../src/runner.ts');

const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows');
const STORE = path.join(ROOT, 'workflows');
const AGENTS = path.join(STORE, 'agents');

/** A store whose agents are the repository's, with `dev` beside them: its steps name them. */
function fresh(): void {
  fs.rmSync(STORE, { recursive: true, force: true });
  fs.cpSync(path.join(SHIPPED, 'agents'), AGENTS, { recursive: true });
  fs.cpSync(path.join(SHIPPED, 'dev'), path.join(STORE, 'dev'), { recursive: true });
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries((fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isFile() || e.isSymbolicLink())
    .map((e) => {
      const at = path.join(e.parentPath, e.name);
      return [path.relative(dir, at), e.isSymbolicLink() ? `-> ${fs.readlinkSync(at)}` : fs.readFileSync(at, 'utf8')];
    }));
}

/** `fn` refused with a message `pattern` matches, and the store as it was. */
function refused(fn: () => unknown, pattern: RegExp, why?: string): InstanceType<typeof AgentWriteError> {
  const before = snapshot(STORE);
  let caught: unknown;
  try { fn(); } catch (err) { caught = err; }
  assert.ok(caught instanceof WorkflowError, `expected a refusal matching ${pattern}, got ${caught === undefined ? 'none' : String(caught)}`);
  assert.match(caught.message, pattern);
  if (why !== undefined) assert.equal((caught as InstanceType<typeof AgentWriteError>).why, why);
  assert.deepEqual(snapshot(STORE), before, 'a refused write leaves the store as it was');
  return caught as InstanceType<typeof AgentWriteError>;
}

// `skills:` is the agent's own line, and the draft carries the file's name as the file writes it; what it holds is the file's.
const draftOf = (agent: Agent): AgentDraft => ({ name: agent.name, description: agent.description, skills: agent.skills?.file, keys: agent.keys, body: agent.body });
const plain = (agent: Agent) => ({ name: agent.name, description: agent.description, skills: agent.skills, keys: agent.keys, body: agent.body });
const scribe: AgentDraft = { name: 'scribe', description: 'Use this when a change needs its notes written.', keys: { model: 'sonnet', effort: 'low', tools: 'Read, Write' }, body: 'Write the notes.' };

test('every shipped agent renders to a file that reads back as the same agent', () => {
  const agents = loadAgents(path.join(SHIPPED, 'agents'));
  assert.ok(agents.size >= 6);
  for (const [name, agent] of agents) {
    assert.ok(!(agent instanceof Error), `${name} reads`);
    const text = renderAgent(draftOf(agent));
    assert.deepEqual(plain(parseAgent(name, text, agent.read)), plain(agent), name);
    assert.equal(renderAgent(draftOf(parseAgent(name, text, agent.read))), text, `${name} renders the same twice`);
  }
});

test('a render writes the description first, the keys in their order, and an unset key not at all', () => {
  const text = renderAgent({ name: 'a', description: 'Use it.', keys: { tools: 'Read', model: 'opus', effort: null }, body: '  Do it.  ' });
  assert.equal(text, '---\ndescription: Use it.\nmodel: opus\ntools: Read\n---\nDo it.\n');
  assert.equal(renderAgent({ name: 'a', keys: {}, body: '---\nlooks like frontmatter' }), '---\n\n---\n---\nlooks like frontmatter\n');
  assert.deepEqual(parseAgent('a', renderAgent({ name: 'a', keys: {}, body: '---\nlooks like frontmatter' })).body, '---\nlooks like frontmatter');
});

test('a render refuses a key no agent has, agent:, wiring, description among the keys and a line break, by name', () => {
  const r = (keys: Record<string, string>, description?: string) => () => renderAgent({ name: 'a', description, keys: keys as AgentDraft['keys'], body: 'x' });
  assert.throws(r({ agent: 'b' }), (e: Error) => /^agents\/a\.md: `agent` is a step's key/.test(e.message));
  assert.throws(r({ check: 'npm test' }), (e: Error) => /^agents\/a\.md: `check` is wiring, and belongs on the step/.test(e.message));
  assert.throws(r({ modle: 'opus' }), (e: Error) => /^agents\/a\.md: `modle` is not a key an agent has/.test(e.message));
  assert.throws(r({ description: 'x' }), (e: Error) => /^agents\/a\.md: `description` is the agent's own line/.test(e.message));
  assert.throws(r({ model: 'opus\ncheck: rm -rf /' }), (e: Error) => /^agents\/a\.md: `model` holds a line break/.test(e.message));
  assert.throws(r({}, 'one\ntwo'), (e: Error) => /^agents\/a\.md: `description` holds a line break/.test(e.message));
});

test('a name is refused unless it is one file of the agents folder that a step can name', () => {
  assert.equal(agentNameRefusal('scribe'), undefined);
  for (const [name, pattern] of [
    ['', /^An agent has no name/], ['a/b', /a slash names a file in another folder/], ['..', /a hidden file/], ['.x', /a hidden file/],
    [' x', /trimmed as it is read/], ['x.md', /named without its \.md: `x`/], ['README', /the folder's README/], ['x'.repeat(260), /255 bytes/],
    ['a' + String.fromCharCode(7), /control character/],
  ] as const) assert.match(agentNameRefusal(name) ?? '', pattern, JSON.stringify(name));
});

test('a new agent is written, reads back, and changes no workflow beside it', () => {
  fresh();
  const dev = snapshot(path.join(STORE, 'dev'));
  const done = writeAgent(AGENTS, scribe, { version: null });
  assert.deepEqual(done.written, ['scribe.md']);
  assert.equal(done.version, agentVersion(AGENTS, 'scribe'));
  assert.deepEqual(plain(loadAgents(AGENTS).get('scribe') as Agent), { name: 'scribe', description: scribe.description, skills: undefined, keys: scribe.keys, body: scribe.body });
  assert.deepEqual(snapshot(path.join(STORE, 'dev')), dev);
});

test('an edit carries the version it read, and a stale one is refused', () => {
  fresh();
  const { version } = writeAgent(AGENTS, scribe, { version: null });
  const edited = writeAgent(AGENTS, { ...scribe, keys: { ...scribe.keys, effort: 'high' } }, { version });
  assert.notEqual(edited.version, version);
  assert.equal((loadAgents(AGENTS).get('scribe') as Agent).keys.effort, 'high');
  refused(() => writeAgent(AGENTS, scribe, { version }), /^agents\/scribe\.md changed since it was read \(version [0-9a-f]{16}, now [0-9a-f]{16}\)/, 'stale');
  refused(() => removeAgent(AGENTS, 'scribe', { version }), /^agents\/scribe\.md changed since it was read/, 'stale');
});

test('a new agent over one that is there, and an edit of one that is not, are refused', () => {
  fresh();
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'reviewer' }, { version: null }), /^agents\/reviewer\.md is there already/, 'exists');
  refused(() => writeAgent(AGENTS, scribe, { version: '0123456789abcdef' }), /^agents\/scribe\.md is not there/, 'missing');
  refused(() => removeAgent(AGENTS, 'scribe', { version: '0123456789abcdef' }), /^agents\/scribe\.md is not there/, 'missing');
});

test("a write refuses what the parser refuses, in the parser's words", () => {
  fresh();
  refused(() => writeAgent(AGENTS, { ...scribe, keys: { effort: 'enormous' } }, { version: null }), /^agents\/scribe\.md: `effort: enormous`/);
  refused(() => writeAgent(AGENTS, { ...scribe, keys: { output: 'nothing.schema.json' } }, { version: null }), /^agents\/scribe\.md: `output: nothing\.schema\.json` is not there/);
  refused(() => writeAgent(AGENTS, { ...scribe, keys: { check: 'npm test' } as AgentDraft['keys'] }, { version: null }), /^agents\/scribe\.md: `check` is wiring, and belongs on the step/);
  refused(() => writeAgent(AGENTS, { ...scribe, keys: { agent: 'reviewer' } as AgentDraft['keys'] }, { version: null }), /^agents\/scribe\.md: `agent` is a step's key/);
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'x.md' }, { version: null }), /^`x\.md` is not an agent's name/);
  refused(() => writeAgent(AGENTS, { ...scribe, name: '../dev/plan' }, { version: null }), /is not an agent's name: an agent is a file in agents\//);
});

test('a write is refused outside the two places the board lists agents from, and outside a folder of agents', () => {
  fresh();
  const elsewhere = path.join(ROOT, 'elsewhere', 'agents');
  fs.mkdirSync(elsewhere, { recursive: true });
  refused(() => writeAgent(elsewhere, scribe, { version: null }), /elsewhere\/agents is not the store's agents\/ .* nor a repository's/);
  assert.equal(fs.existsSync(path.join(elsewhere, 'scribe.md')), false);
  refused(() => writeAgent(path.join(STORE, 'dev'), scribe, { version: null }), /dev is not a folder of agents/);
  refused(() => removeAgent(elsewhere, 'scribe', { version: 'x' }), /is not the store's agents\//);
  writeAgent(elsewhere, scribe, { version: null, anywhere: true });
  assert.ok(fs.existsSync(path.join(elsewhere, 'scribe.md')));
});

test('a write through a link is refused by name', () => {
  fresh();
  const outside = path.join(ROOT, 'outside.md');
  fs.writeFileSync(outside, 'mine\n');
  fs.symlinkSync(outside, path.join(AGENTS, 'scribe.md'));
  refused(() => writeAgent(AGENTS, scribe, { version: null }), /scribe\.md is a link/);
  refused(() => removeAgent(AGENTS, 'scribe', { version: 'x' }), /scribe\.md is a link/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'mine\n');
});

test('a result schema written through a link is refused by name, and what the link points at is left as it was', () => {
  fresh();
  const outside = path.join(ROOT, 'outside.schema.json');
  fs.writeFileSync(outside, '{"mine":true}\n');
  fs.symlinkSync(outside, path.join(AGENTS, 'scribe.schema.json'));
  const withSchema = { ...scribe, keys: { ...scribe.keys, output: 'scribe.schema.json' } };
  const schema = { file: 'scribe.schema.json', text: '{"type":"object"}\n' };
  refused(() => writeAgent(AGENTS, withSchema, { version: null, schema }), /^\S*scribe\.schema\.json is a link, and a result schema is its agent's own/);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"mine":true}\n');
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
});

test("an agent's version counts a link as where it points, not as what it points at", () => {
  fresh();
  const outside = path.join(ROOT, 'outside-version.md');
  fs.writeFileSync(outside, 'one\n');
  fs.symlinkSync(outside, path.join(AGENTS, 'linked.md'));
  const was = agentVersion(AGENTS, 'linked');
  fs.writeFileSync(outside, 'two\n');
  assert.equal(agentVersion(AGENTS, 'linked'), was);
});

test('a remove or a rename of an agent a step still names is refused, naming the steps', () => {
  fresh();
  const reviewer = agentVersion(AGENTS, 'reviewer')!;
  const err = refused(() => removeAgent(AGENTS, 'reviewer', { version: reviewer }), /^agents\/reviewer\.md is named by a step beside it — dev\/review — and removing it would leave it naming an agent that is not there/, 'in-use');
  assert.deepEqual(err.users, ['dev/review']);
  const reviewerAgent = loadAgents(AGENTS).get('reviewer') as Agent;
  refused(() => writeAgent(AGENTS, { ...draftOf(reviewerAgent), name: 'critic' }, { version: reviewer, from: 'reviewer' }), /^agents\/reviewer\.md is named by a step beside it — dev\/review — and renaming it to critic would/, 'in-use');
  // A folder that does not load still counts: its step is broken by the agent's going all the same, and `agent : x` names x.
  fs.mkdirSync(path.join(STORE, 'broken'));
  fs.writeFileSync(path.join(STORE, 'broken', 'a.md'), '---\n  agent : reviewer\nafter: nowhere\n---\nx\n');
  assert.deepEqual(agentUsers(STORE, 'reviewer'), ['broken/a', 'dev/review']);
  refused(() => removeAgent(AGENTS, 'reviewer', { version: reviewer }), /named by 2 steps beside it — broken\/a, dev\/review/, 'in-use');
});

test('a rename writes the new file and removes the old; onto another agent it is refused', () => {
  fresh();
  const { version } = writeAgent(AGENTS, scribe, { version: null });
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'reviewer' }, { version, from: 'scribe' }), /^agents\/reviewer\.md is there already, and renaming scribe to it/, 'exists');
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'x' }, { version: null, from: 'scribe' }), /^a new agent is not renamed from another/);
  const done = writeAgent(AGENTS, { ...scribe, name: 'notary' }, { version, from: 'scribe' });
  assert.deepEqual([done.written, done.removed], [['notary.md'], ['scribe.md']]);
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
  assert.equal((loadAgents(AGENTS).get('notary') as Agent).body, scribe.body);
});

test('a result schema travels with its agent: written with it, refused when not its own, removed with it', () => {
  fresh();
  const text = JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false }, null, 2);
  const withOutput = { ...scribe, keys: { ...scribe.keys, output: 'scribe.schema.json' } };
  refused(() => writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'other.schema.json', text } }), /^the result schema is other\.schema\.json, and agents\/scribe\.md names scribe\.schema\.json/);
  refused(() => writeAgent(AGENTS, withOutput, { version: null, schema: { file: '../x.json', text } }), /^`\.\.\/x\.json` is not a result schema's name/);
  refused(() => writeAgent(AGENTS, { ...scribe, keys: { output: 'review.schema.json' } }, { version: null, schema: { file: 'review.schema.json', text } }), /^review\.schema\.json is the result schema of reviewer too/);
  refused(() => writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'scribe.schema.json', text: '{"type":"object"}' } }), /^agents\/scribe\.md: `output: scribe\.schema\.json` is not a schema of fields/);
  const done = writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'scribe.schema.json', text } });
  assert.deepEqual(done.written, ['scribe.schema.json', 'scribe.md']);
  assert.deepEqual((loadAgents(AGENTS).get('scribe') as Agent).read('scribe.schema.json'), text);
  // The schema is part of the agent's version: a change to it moves the version.
  fs.writeFileSync(path.join(AGENTS, 'scribe.schema.json'), text + '\n');
  assert.notEqual(agentVersion(AGENTS, 'scribe'), done.version);
  // A schema another agent names too stays when one of them goes, and goes with the last.
  writeAgent(AGENTS, { ...withOutput, name: 'notary' }, { version: null });
  assert.deepEqual(removeAgent(AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed, ['scribe.md']);
  assert.deepEqual(removeAgent(AGENTS, 'notary', { version: agentVersion(AGENTS, 'notary')! }).removed, ['notary.md', 'scribe.schema.json']);
});

test('the skills travel with their agent: written with it, refused when not its own, removed with it', () => {
  fresh();
  const text = JSON.stringify([{ id: 'write-a-note', name: 'Write a note', description: 'Write the notes of a change.', tags: ['note'] }], null, 2);
  const withSkills = { ...scribe, skills: 'scribe.skills.json' };
  refused(() => writeAgent(AGENTS, withSkills, { version: null, skills: { file: 'other.skills.json', text } }), /^the skills file is other\.skills\.json, and agents\/scribe\.md names scribe\.skills\.json/);
  refused(() => writeAgent(AGENTS, withSkills, { version: null, skills: { file: '../x.json', text } }), /^`\.\.\/x\.json` is not a skills file's name/);
  writeAgent(AGENTS, { ...scribe, name: 'archivist', skills: 'archivist.skills.json' }, { version: null, skills: { file: 'archivist.skills.json', text } });
  refused(() => writeAgent(AGENTS, { ...scribe, skills: 'archivist.skills.json' }, { version: null, skills: { file: 'archivist.skills.json', text } }), /^archivist\.skills\.json is the skills file of archivist too/);
  refused(() => writeAgent(AGENTS, withSkills, { version: null, skills: { file: 'scribe.skills.json', text: '[]' } }), /^agents\/scribe\.md: `skills: scribe\.skills\.json` is an empty list/);
  const done = writeAgent(AGENTS, withSkills, { version: null, skills: { file: 'scribe.skills.json', text } });
  assert.deepEqual(done.written, ['scribe.skills.json', 'scribe.md']);
  assert.deepEqual((loadAgents(AGENTS).get('scribe') as Agent).skills?.list.map((s) => s.id), ['write-a-note']);
  // The skills are part of the agent's version, as the result schema is: an edit of the file alone moves it, so the board catches a save over one.
  fs.writeFileSync(path.join(AGENTS, 'scribe.skills.json'), `${text}\n`);
  assert.notEqual(agentVersion(AGENTS, 'scribe'), done.version);
  // A skills file another agent names too stays when one of them goes, and goes with the last.
  writeAgent(AGENTS, { ...withSkills, name: 'notary' }, { version: null });
  assert.deepEqual(removeAgent(AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed, ['scribe.md']);
  assert.deepEqual(removeAgent(AGENTS, 'notary', { version: agentVersion(AGENTS, 'notary')! }).removed, ['notary.md', 'scribe.skills.json']);
});

test('an agent writes both the files it names, and a write that fails leaves neither behind', () => {
  fresh();
  const skills = { file: 'scribe.skills.json', text: '[{"id":"a","name":"A","description":"d","tags":["t"]}]' };
  const schema = { file: 'scribe.schema.json', text: JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false }) };
  const both = { ...scribe, skills: skills.file, keys: { ...scribe.keys, output: schema.file } };
  const done = writeAgent(AGENTS, both, { version: null, skills, schema });
  assert.deepEqual(done.written, ['scribe.skills.json', 'scribe.schema.json', 'scribe.md']);
  // The agent's own file cannot be written: a folder where the file would go. Both sidecars go back to what they were — not there.
  fresh();
  fs.mkdirSync(path.join(AGENTS, 'scribe.md'));
  assert.throws(() => writeAgent(AGENTS, both, { version: null, skills, schema }));
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.skills.json')), false, 'the skills it wrote are taken back');
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), false, 'and the schema');
  // And a write that fails part-way through the files beside the agent: the second of them cannot be written, and the first is taken back
  // all the same, so the folder holds nothing of an agent it does not hold.
  fresh();
  fs.mkdirSync(path.join(AGENTS, schema.file));
  assert.throws(() => writeAgent(AGENTS, both, { version: null, skills, schema }));
  assert.equal(fs.existsSync(path.join(AGENTS, skills.file)), false, 'the skills written before it failed are taken back');
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'and no agent names them');
});

test('a skills file written through a link is refused by name, and what the link points at is left as it was', () => {
  fresh();
  const outside = path.join(ROOT, 'outside.skills.json');
  fs.writeFileSync(outside, '[{"mine":true}]\n');
  fs.symlinkSync(outside, path.join(AGENTS, 'scribe.skills.json'));
  const text = '[{"id":"a","name":"A","description":"d","tags":["t"]}]';
  refused(() => writeAgent(AGENTS, { ...scribe, skills: 'scribe.skills.json' }, { version: null, skills: { file: 'scribe.skills.json', text } }), /^\S*scribe\.skills\.json is a link, and a skills file is its agent's own/);
  assert.equal(fs.readFileSync(outside, 'utf8'), '[{"mine":true}]\n');
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
});

test("a key's line taken off takes the file it named: nothing in agents/ is named by nothing", () => {
  fresh();
  const skills = { file: 'scribe.skills.json', text: '[{"id":"a","name":"A","description":"Does a.","tags":["t"]}]' };
  const schema = { file: 'scribe.schema.json', text: JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false }) };
  const both = { ...scribe, skills: skills.file, keys: { ...scribe.keys, output: schema.file } };
  const made = writeAgent(AGENTS, both, { version: null, skills, schema });
  // Both lines taken off: neither file is named by anything now, so neither is left behind.
  const bare = writeAgent(AGENTS, scribe, { version: made.version });
  assert.deepEqual(bare.removed.sort(), ['scribe.schema.json', 'scribe.skills.json']);
  for (const f of ['scribe.skills.json', 'scribe.schema.json']) assert.equal(fs.existsSync(path.join(AGENTS, f)), false, f);

  // A file another agent names too is not this agent's to remove: it stays, and is not in `removed`.
  fresh();
  writeAgent(AGENTS, both, { version: null, skills, schema });
  const sharing = writeAgent(AGENTS, { ...both, name: 'notary' }, { version: null });
  assert.deepEqual(writeAgent(AGENTS, { ...scribe, name: 'notary' }, { version: sharing.version }).removed, []);
  for (const f of ['scribe.skills.json', 'scribe.schema.json']) assert.ok(fs.existsSync(path.join(AGENTS, f)), f);
  // And a line pointed at another file takes the one it pointed at before.
  const moved = writeAgent(AGENTS, { ...both, skills: 'scribe.can-do.json' }, { version: agentVersion(AGENTS, 'scribe')!, skills: { ...skills, file: 'scribe.can-do.json' } });
  assert.deepEqual(moved.removed, ['scribe.skills.json']);
  assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.can-do.json')));
});

test('the workflows beside the agents still load after every write', () => {
  fresh();
  writeAgent(AGENTS, scribe, { version: null });
  assert.ok(loadWorkflows(path.join(STORE, 'dev')).length > 0);
});
