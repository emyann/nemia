/**
 * An agent written from a draft (`renderAgent`, `writeAgent`, `removeAgent`): what the board's Agents page saves.
 *
 * The render is the inverse of `parseAgent`, held over every agent of the tests' team (`team.ts`). Each refusal of the writer is made
 * to refuse, at shipped defaults, asserted on its message and with the folder as it was.
 *
 * `WF_ROOT` is set before the modules are imported, since they read it as they load. What the tests hold, beyond their names:
 * - with `repo`, a version read one way and checked the other is refused as stale though nothing changed, and an edit of the SKILL.md
 *   between the read and the write is a change, and refused;
 * - a card sent as an own `undefined` is refused too: a caller that still passes the key is told, rather than obeyed by nobody.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { agentNameRefusal, parseAgent, renderAgent, WorkflowError, type Agent, type AgentDraft } from '../src/workflow.ts';
import { agentUsers, agentVersion, loadAgents, loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { TEAM } from './team.ts';

const ROOT = scratch('wf-agent-');
process.env.WF_ROOT = ROOT;
const { AgentWriteError, agentSkillsFound, removeAgent, writeAgent } = await import('../src/runner.ts');

const STORE = path.join(ROOT, 'workflows');
const AGENTS = path.join(STORE, 'agents');

/** A store whose agents are the tests' team's, with `dev` beside them: its steps name them. */
function fresh(): void {
  fs.rmSync(STORE, { recursive: true, force: true });
  fs.cpSync(path.join(TEAM, 'agents'), AGENTS, { recursive: true });
  fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });
  fs.cpSync(path.join(TEAM, 'dev'), path.join(STORE, 'dev'), { recursive: true });
}

function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() || e.isSymbolicLink())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), e.isSymbolicLink() ? `-> ${fs.readlinkSync(at)}` : fs.readFileSync(at, 'utf8')];
      }),
  );
}

/** `fn` refused with a message `pattern` matches, and the store as it was. */
function refused(fn: () => unknown, pattern: RegExp, why?: string): InstanceType<typeof AgentWriteError> {
  const before = snapshot(STORE);
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(
    caught instanceof WorkflowError,
    `expected a refusal matching ${pattern}, got ${caught === undefined ? 'none' : String(caught)}`,
  );
  assert.match(caught.message, pattern);
  if (why !== undefined) assert.equal((caught as InstanceType<typeof AgentWriteError>).why, why);
  assert.deepEqual(snapshot(STORE), before, 'a refused write leaves the store as it was');
  return caught as InstanceType<typeof AgentWriteError>;
}

/** An agent's draft: `skills:` is the agent's own line, carried as the file writes it; what the agent can do is generated from it. */
const draftOf = (agent: Agent): AgentDraft => ({
  name: agent.name,
  description: agent.description,
  skills: agent.skills?.join(', '),
  keys: agent.keys,
  body: agent.body,
});
const plain = (agent: Agent) => ({
  name: agent.name,
  description: agent.description,
  skills: agent.skills,
  keys: agent.keys,
  body: agent.body,
});
const scribe: AgentDraft = {
  name: 'scribe',
  description: 'Use this when a change needs its notes written.',
  keys: { model: 'sonnet', effort: 'low', tools: 'Read, Write' },
  body: 'Write the notes.',
};

test("every agent of the tests' team renders to a file that reads back as the same agent", () => {
  const agents = loadAgents(path.join(TEAM, 'agents'));
  assert.ok(agents.size >= 3);
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
  assert.deepEqual(
    parseAgent('a', renderAgent({ name: 'a', keys: {}, body: '---\nlooks like frontmatter' })).body,
    '---\nlooks like frontmatter',
  );
});

test('a render refuses a key no agent has, agent:, wiring, description among the keys and a line break, by name', () => {
  const r = (keys: Record<string, string>, description?: string) => () => renderAgent({ name: 'a', description, keys: keys, body: 'x' });
  assert.throws(r({ agent: 'b' }), (e: Error) => e.message.startsWith("agents/a.md: `agent` is a step's key"));
  assert.throws(r({ check: 'npm test' }), (e: Error) => e.message.startsWith('agents/a.md: `check` is wiring, and belongs on the step'));
  assert.throws(r({ modle: 'opus' }), (e: Error) => e.message.startsWith('agents/a.md: `modle` is not a key an agent has'));
  assert.throws(r({ description: 'x' }), (e: Error) => e.message.startsWith("agents/a.md: `description` is the agent's own line"));
  assert.throws(r({ model: 'opus\ncheck: rm -rf /' }), (e: Error) => e.message.startsWith('agents/a.md: `model` holds a line break'));
  assert.throws(r({}, 'one\ntwo'), (e: Error) => e.message.startsWith('agents/a.md: `description` holds a line break'));
});

test('a name is refused unless it is one file of the agents folder that a step can name', () => {
  assert.equal(agentNameRefusal('scribe'), undefined);
  for (const [name, pattern] of [
    ['', /^An agent has no name/],
    ['a/b', /a slash names a file in another folder/],
    ['..', /a hidden file/],
    ['.x', /a hidden file/],
    [' x', /trimmed as it is read/],
    ['x.md', /named without its \.md: `x`/],
    ['README', /the folder's README/],
    ['x'.repeat(260), /255 bytes/],
    ['a' + String.fromCharCode(7), /control character/],
  ] as const)
    assert.match(agentNameRefusal(name) ?? '', pattern, JSON.stringify(name));
});

test('a new agent is written, reads back, and changes no workflow beside it', () => {
  fresh();
  const dev = snapshot(path.join(STORE, 'dev'));
  const done = writeAgent(AGENTS, scribe, { version: null });
  assert.deepEqual(done.written, ['scribe.md']);
  assert.equal(done.version, agentVersion(AGENTS, 'scribe'));
  assert.deepEqual(plain(loadAgents(AGENTS).get('scribe') as Agent), {
    name: 'scribe',
    description: scribe.description,
    skills: undefined,
    keys: scribe.keys,
    body: scribe.body,
  });
  assert.deepEqual(snapshot(path.join(STORE, 'dev')), dev);
});

test('an edit carries the version it read, and a stale one is refused', () => {
  fresh();
  const { version } = writeAgent(AGENTS, scribe, { version: null });
  const edited = writeAgent(AGENTS, { ...scribe, keys: { ...scribe.keys, effort: 'high' } }, { version });
  assert.notEqual(edited.version, version);
  assert.equal((loadAgents(AGENTS).get('scribe') as Agent).keys.effort, 'high');
  refused(
    () => writeAgent(AGENTS, scribe, { version }),
    /^agents\/scribe\.md changed since it was read \(version [0-9a-f]{16}, now [0-9a-f]{16}\)/,
    'stale',
  );
  refused(() => removeAgent(AGENTS, 'scribe', { version }), /^agents\/scribe\.md changed since it was read/, 'stale');
});

test("with `repo`, a write's and a removal's version is read with the skills a start there finds, as the board lists it", () => {
  fresh();
  const repo = scratch('wf-agent-repo-');
  const skill = path.join(repo, '.claude', 'skills', 'pass-a-note');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: pass-a-note\ndescription: Hands a note on.\n---\nHand it on.\n');
  const courier: AgentDraft = {
    name: 'courier',
    description: 'Carries notes.',
    skills: 'pass-a-note',
    keys: { tools: 'Read, Skill' },
    body: 'Carry it.',
  };
  const made = writeAgent(AGENTS, courier, { version: null, repo });
  const listed = agentVersion(AGENTS, 'courier', agentSkillsFound(AGENTS, repo));
  assert.equal(made.version, listed, 'the version a write answers is the one the listing reads');
  assert.notEqual(listed, agentVersion(AGENTS, 'courier'), 'the skill is found only in the repository, so the two readings differ');
  refused(
    () => writeAgent(AGENTS, courier, { version: agentVersion(AGENTS, 'courier')!, repo }),
    /^agents\/courier\.md changed since it was read/,
    'stale',
  );
  const saved = writeAgent(AGENTS, { ...courier, description: 'Carries notes on.' }, { version: listed!, repo });
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '---\nname: pass-a-note\ndescription: Hands a note along.\n---\nHand it on.\n');
  refused(
    () => removeAgent(AGENTS, 'courier', { version: saved.version, repo }),
    /^agents\/courier\.md changed since it was read/,
    'stale',
  );
  const now = agentVersion(AGENTS, 'courier', agentSkillsFound(AGENTS, repo))!;
  assert.deepEqual(removeAgent(AGENTS, 'courier', { version: now, repo }).removed, ['courier.md']);
});

test('a new agent over one that is there, and an edit of one that is not, are refused', () => {
  fresh();
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'reviewer' }, { version: null }), /^agents\/reviewer\.md is there already/, 'exists');
  refused(() => writeAgent(AGENTS, scribe, { version: '0123456789abcdef' }), /^agents\/scribe\.md is not there/, 'missing');
  refused(() => removeAgent(AGENTS, 'scribe', { version: '0123456789abcdef' }), /^agents\/scribe\.md is not there/, 'missing');
});

test("a write refuses what the parser refuses, in the parser's words", () => {
  fresh();
  refused(
    () => writeAgent(AGENTS, { ...scribe, keys: { effort: 'enormous' } }, { version: null }),
    /^agents\/scribe\.md: `effort: enormous`/,
  );
  refused(
    () => writeAgent(AGENTS, { ...scribe, keys: { output: 'nothing.schema.json' } }, { version: null }),
    /^agents\/scribe\.md: `output: nothing\.schema\.json` is not there/,
  );
  refused(
    () => writeAgent(AGENTS, { ...scribe, keys: { check: 'npm test' } as AgentDraft['keys'] }, { version: null }),
    /^agents\/scribe\.md: `check` is wiring, and belongs on the step/,
  );
  refused(
    () => writeAgent(AGENTS, { ...scribe, keys: { agent: 'reviewer' } as AgentDraft['keys'] }, { version: null }),
    /^agents\/scribe\.md: `agent` is a step's key/,
  );
  refused(() => writeAgent(AGENTS, { ...scribe, name: 'x.md' }, { version: null }), /^`x\.md` is not an agent's name/);
  refused(
    () => writeAgent(AGENTS, { ...scribe, name: '../dev/plan' }, { version: null }),
    /is not an agent's name: an agent is a file in agents\//,
  );
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
  refused(
    () => writeAgent(AGENTS, withSchema, { version: null, schema }),
    /^\S*scribe\.schema\.json is a link, and a result schema is its agent's own/,
  );
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
  const err = refused(
    () => removeAgent(AGENTS, 'reviewer', { version: reviewer }),
    /^agents\/reviewer\.md is named by a step beside it — dev\/review — and removing it would leave it naming an agent that is not there/,
    'in-use',
  );
  assert.deepEqual(err.users, ['dev/review']);
  const reviewerAgent = loadAgents(AGENTS).get('reviewer') as Agent;
  refused(
    () => writeAgent(AGENTS, { ...draftOf(reviewerAgent), name: 'critic' }, { version: reviewer, from: 'reviewer' }),
    /^agents\/reviewer\.md is named by a step beside it — dev\/review — and renaming it to critic would/,
    'in-use',
  );
  fs.mkdirSync(path.join(STORE, 'broken'));
  fs.writeFileSync(path.join(STORE, 'broken', 'a.md'), '---\n  agent : reviewer\nafter: nowhere\n---\nx\n');
  assert.deepEqual(
    agentUsers(STORE, 'reviewer'),
    ['broken/a', 'dev/review'],
    "a folder that does not load still counts: its step is broken by the agent's going all the same, and `agent : x` names x",
  );
  refused(() => removeAgent(AGENTS, 'reviewer', { version: reviewer }), /named by 2 steps beside it — broken\/a, dev\/review/, 'in-use');
});

test('a rename writes the new file and removes the old; onto another agent it is refused', () => {
  fresh();
  const { version } = writeAgent(AGENTS, scribe, { version: null });
  refused(
    () => writeAgent(AGENTS, { ...scribe, name: 'reviewer' }, { version, from: 'scribe' }),
    /^agents\/reviewer\.md is there already, and renaming scribe to it/,
    'exists',
  );
  refused(
    () => writeAgent(AGENTS, { ...scribe, name: 'x' }, { version: null, from: 'scribe' }),
    /^a new agent is not renamed from another/,
  );
  const done = writeAgent(AGENTS, { ...scribe, name: 'notary' }, { version, from: 'scribe' });
  assert.deepEqual([done.written, done.removed], [['notary.md'], ['scribe.md']]);
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false);
  assert.equal((loadAgents(AGENTS).get('notary') as Agent).body, scribe.body);
});

test('a result schema travels with its agent: written with it, refused when not its own, removed with it', () => {
  fresh();
  const text = JSON.stringify(
    { type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false },
    null,
    2,
  );
  const withOutput = { ...scribe, keys: { ...scribe.keys, output: 'scribe.schema.json' } };
  refused(
    () => writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'other.schema.json', text } }),
    /^the result schema is other\.schema\.json, and agents\/scribe\.md names scribe\.schema\.json/,
  );
  refused(
    () => writeAgent(AGENTS, withOutput, { version: null, schema: { file: '../x.json', text } }),
    /^`\.\.\/x\.json` is not a result schema's name/,
  );
  refused(
    () =>
      writeAgent(
        AGENTS,
        { ...scribe, keys: { output: 'review.schema.json' } },
        { version: null, schema: { file: 'review.schema.json', text } },
      ),
    /^review\.schema\.json is the result schema of reviewer too/,
  );
  refused(
    () => writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'scribe.schema.json', text: '{"type":"object"}' } }),
    /^agents\/scribe\.md: `output: scribe\.schema\.json` is not a schema of fields/,
  );
  const done = writeAgent(AGENTS, withOutput, { version: null, schema: { file: 'scribe.schema.json', text } });
  assert.deepEqual(done.written, ['scribe.schema.json', 'scribe.md']);
  assert.deepEqual((loadAgents(AGENTS).get('scribe') as Agent).read('scribe.schema.json'), text);
  fs.writeFileSync(path.join(AGENTS, 'scribe.schema.json'), text + '\n');
  assert.notEqual(
    agentVersion(AGENTS, 'scribe'),
    done.version,
    "the schema is part of the agent's version: a change to it moves the version",
  );
  writeAgent(AGENTS, { ...withOutput, name: 'notary' }, { version: null });
  assert.deepEqual(
    removeAgent(AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed,
    ['scribe.md'],
    'a schema another agent names too stays when one of them goes',
  );
  assert.deepEqual(
    removeAgent(AGENTS, 'notary', { version: agentVersion(AGENTS, 'notary')! }).removed,
    ['notary.md', 'scribe.schema.json'],
    'and goes with the last',
  );
});

test('REFUSED at shipped defaults: a card sent with its agent, which is generated from its skills', () => {
  fresh();
  const text = '[{"id":"write-a-note","name":"Write a note","description":"Write the notes of a change.","tags":["note"]}]';
  refused(
    () => writeAgent(AGENTS, scribe, { version: null, card: { file: 'scribe.skills.json', text } } as never),
    /^`card` is not written with an agent: its card is generated from its skills\./,
  );
  refused(
    () => writeAgent(AGENTS, scribe, { version: null, card: undefined } as never),
    /^`card` is not written with an agent: its card is generated from its skills/,
  );
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.md')), false, 'and nothing of it is written');
  assert.equal(fs.existsSync(path.join(AGENTS, 'scribe.skills.json')), false);
});

test('an agent writes the file it names, and a write that fails leaves it not behind', () => {
  fresh();
  const schema = {
    file: 'scribe.schema.json',
    text: JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false }),
  };
  const withSchema = { ...scribe, keys: { ...scribe.keys, output: schema.file } };
  const done = writeAgent(AGENTS, withSchema, { version: null, schema });
  assert.deepEqual(done.written, ['scribe.schema.json', 'scribe.md']);
  fresh();
  fs.mkdirSync(path.join(AGENTS, 'scribe.md'));
  assert.throws(() => writeAgent(AGENTS, withSchema, { version: null, schema }));
  assert.equal(
    fs.existsSync(path.join(AGENTS, 'scribe.schema.json')),
    false,
    "the schema it wrote is taken back when a folder where the agent's file would go stops its write",
  );
});

test("a key's line taken off leaves the file it named: a save never deletes what a person wrote", () => {
  fresh();
  const schema = {
    file: 'scribe.schema.json',
    text: JSON.stringify({ type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'], additionalProperties: false }),
  };
  const withSchema = { ...scribe, keys: { ...scribe.keys, output: schema.file } };
  const made = writeAgent(AGENTS, withSchema, { version: null, schema });
  const bare = writeAgent(AGENTS, scribe, { version: made.version });
  assert.deepEqual(bare.removed, [], 'the line taken off — a field cleared on the board and saved — removes nothing');
  assert.equal(fs.readFileSync(path.join(AGENTS, 'scribe.schema.json'), 'utf8'), schema.text, 'the file is still there, as written');
  assert.equal(
    parseAgent('scribe', fs.readFileSync(path.join(AGENTS, 'scribe.md'), 'utf8')).keys.output,
    undefined,
    'and the agent no longer names it',
  );

  fresh();
  writeAgent(AGENTS, withSchema, { version: null, schema });
  const moved = writeAgent(
    AGENTS,
    { ...withSchema, keys: { ...withSchema.keys, output: 'scribe.notes.json' } },
    { version: agentVersion(AGENTS, 'scribe')!, schema: { ...schema, file: 'scribe.notes.json' } },
  );
  assert.deepEqual(moved.removed, [], 'a line pointed at another file leaves the one it pointed at before');
  assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.notes.json')), 'and writes the new one');
  assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), 'the file it named before is still there');
  const gone = removeAgent(AGENTS, 'scribe', { version: agentVersion(AGENTS, 'scribe')! }).removed.sort();
  assert.deepEqual(gone, ['scribe.md', 'scribe.notes.json'], 'removing the agent takes its files: the one it names now goes with it');
  assert.ok(fs.existsSync(path.join(AGENTS, 'scribe.schema.json')), 'and the one it no longer names is not its to take');
});

test('the workflows beside the agents still load after every write', () => {
  fresh();
  writeAgent(AGENTS, scribe, { version: null });
  assert.ok(loadWorkflows(path.join(STORE, 'dev')).length > 0);
});
