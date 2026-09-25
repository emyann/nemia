/**
 * What an agent says it can do, printed in the A2A protocol's terms (`agentCard`): a card-shaped description, and **not** an Agent Card.
 *
 * The required fields below are written out as a literal from the protocol's own definition — `specification/a2a.proto` in a2aproject/A2A,
 * protocol 1.0, read at the source on 2026-09-19 — so the omission this slice makes on purpose is pinned rather than assumed. A later slice
 * that serves a card over A2A deletes the omission deliberately, and this test is where it says so.
 *
 * Since agents card 2 the card's skills are generated (`cardSkills`): an entry for each skill the agent's `skills:` gives, read off its
 * SKILL.md's frontmatter, or one made from the agent's own description when it gives none. Nothing is written by hand.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { agentCard, ownSkill, parseAgent, WorkflowError, type Agent } from '../src/workflow.ts';
import { agentVersion, cardSkills, loadAgents, skillsFor } from '../src/workflow-store.ts';
import { scratch } from './scratch.ts';

const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows');

/** Every field `AgentCard` marks REQUIRED, in the proto's order, spelled as the specification's sample card spells them in JSON. */
const REQUIRED = ['name', 'description', 'supportedInterfaces', 'version', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills'];
/** Every field `AgentSkill` marks REQUIRED. */
const SKILL_REQUIRED = ['id', 'name', 'description', 'tags'];
/** The fields a card carries that nothing here can fill honestly: no provider, no address, no scheme, no signature. */
const UNFILLED = ['supportedInterfaces', 'provider', 'documentationUrl', 'iconUrl', 'securitySchemes', 'security', 'securityRequirements', 'signatures'];

const SCRIBE = '---\ndescription: Use this when a change needs its notes written.\nskills: write-a-note, file-it, just-an-id\ntools: Read, Edit, Skill\n---\nWrite the notes.\n';

/** A workflows folder holding the scribe and three skills, each giving its card entry in another way. */
function composed(scribe = SCRIBE): { root: string; found: ReturnType<typeof skillsFor>; agent: Agent } {
  const root = path.join(scratch('wf-agent-card-'), 'workflows');
  const skill = (id: string, text: string) => {
    fs.mkdirSync(path.join(root, 'skills', id), { recursive: true });
    fs.writeFileSync(path.join(root, 'skills', id, 'SKILL.md'), text);
  };
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(root, 'agents', 'scribe.md'), scribe);
  // Every key the card reads, and one it does not (`preload`), in each of the forms a value may take.
  skill('write-a-note', [
    '---',
    'name: write-a-note',
    'title: "Write a note"',
    "description: 'Write the notes of a change, with what it''s for.'",
    'tags: ["note", "docs"]',
    'examples: ["Write the notes for the queue change."]',
    'preload: true',
    '---',
    'How to write a note.',
    '',
  ].join('\n'));
  // A frontmatter `name` and no title: the name is the entry's name. No tags: the id is its tag. No examples: none are said.
  skill('file-it', '---\nname: File it away\ndescription: File a finished note where the team reads it. # not part of it\n---\nHow to file.\n');
  // Neither: Claude Code names such a skill by its folder, and so does the card.
  skill('just-an-id', '---\ndescription: Say nothing but the id.\n---\n');
  const agent = parseAgent('scribe', scribe, () => undefined);
  return { root, found: skillsFor(path.join(root, '_')), agent };
}

test('an agent composed from skills has a card entry for each, read off its SKILL.md, in the order its `skills:` gives them', () => {
  const { root, found, agent } = composed();
  const card = agentCard(agent, agentVersion(path.join(root, 'agents'), 'scribe', found)!, cardSkills(agent, found));
  assert.deepEqual(card.skills, [
    {
      id: 'write-a-note',
      name: 'Write a note',
      description: "Write the notes of a change, with what it's for.",
      tags: ['note', 'docs'],
      examples: ['Write the notes for the queue change.'],
    },
    { id: 'file-it', name: 'File it away', description: 'File a finished note where the team reads it.', tags: ['file-it'] },
    { id: 'just-an-id', name: 'just-an-id', description: 'Say nothing but the id.', tags: ['just-an-id'] },
  ]);
  assert.equal(card.description, 'Use this when a change needs its notes written.', "the card's own description is the agent's");
});

test("an agent's card moves with its version when a skill's SKILL.md changes", () => {
  const { root, found, agent } = composed();
  const agents = path.join(root, 'agents');
  const before = agentVersion(agents, 'scribe', found);
  fs.writeFileSync(path.join(root, 'skills', 'file-it', 'SKILL.md'), '---\nname: File it away\ndescription: File it somewhere else.\n---\n');
  assert.notEqual(agentVersion(agents, 'scribe', found), before, 'the version is what a card says it describes');
  assert.equal(cardSkills(agent, found)[1]!.description, 'File it somewhere else.');
});

test('an agent with no skills says one thing it can do: what its own description says', () => {
  const plain = parseAgent('scribe', '---\ndescription: Use this when a change needs its notes written.\n---\nWrite the notes.\n', () => undefined);
  const { found } = composed();
  assert.deepEqual(cardSkills(plain, found), [
    { id: 'scribe', name: 'scribe', description: 'Use this when a change needs its notes written.', tags: ['scribe'] },
  ]);
  assert.deepEqual(ownSkill(plain), cardSkills(plain, found)[0]);
});

test('a card carries every field A2A marks REQUIRED but the interfaces, which nothing here serves', () => {
  const { found, agent } = composed();
  const card = agentCard(agent, 'abc123', cardSkills(agent, found));
  for (const key of REQUIRED) {
    if (key === 'supportedInterfaces') continue;
    assert.ok(Object.hasOwn(card, key), `a card gives ${key}, which the protocol marks REQUIRED`);
  }
  // The one omission, on purpose: `supported_interfaces` is the list of URLs a client would call, and there is none to give.
  assert.equal(Object.hasOwn(card, 'supportedInterfaces'), false, 'no interface is offered for an agent nothing serves');
  for (const key of UNFILLED) assert.equal(Object.hasOwn(card, key), false, `${key} is left out rather than filled with a placeholder`);
  assert.deepEqual(Object.keys(card).filter((k) => !REQUIRED.includes(k)), [], 'and it carries nothing the protocol does not name');
  for (const skill of card.skills) for (const key of SKILL_REQUIRED) assert.ok(Object.hasOwn(skill, key), `${skill.id} gives ${key}`);
});

test("a card says what the agent is, how it is versioned, and what it takes and hands back", () => {
  const { found, agent } = composed();
  const card = agentCard(agent, 'abc123', cardSkills(agent, found));
  assert.equal(card.name, 'scribe');
  // A2A's own example is semver; ours is the content digest a save carries, which changes when the agent's files change.
  assert.equal(card.version, 'abc123');
  assert.deepEqual(card.defaultInputModes, ['text/plain'], 'a step is handed a composed brief, and nothing else');
  assert.deepEqual(card.defaultOutputModes, ['application/json'], 'every closeout is a JSON object');
  // A2A capabilities are protocol features, never what an agent may reach: none of the three exists here.
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
  assert.equal(JSON.parse(JSON.stringify(card)).skills[0].id, 'write-a-note', 'and the whole of it is JSON');
});

test('REFUSED at shipped defaults: a card with no skills, or for an agent with no description', () => {
  const { found, agent } = composed();
  assert.throws(() => agentCard(agent, 'abc123', []), (e: Error) => {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.match(e.message, /^agents\/scribe\.md: its card has no skills, and the A2A protocol marks a card's skills REQUIRED/);
    return true;
  });
  const bare = parseAgent('scribe', '---\neffort: low\n---\nWrite the notes.\n', () => undefined);
  assert.throws(() => agentCard(bare, 'abc123', cardSkills(agent, found)), (e: Error) => /^agents\/scribe\.md has no `description:`/.test(e.message));
  assert.throws(() => cardSkills(bare, found), (e: Error) => /^agents\/scribe\.md has no `description:`/.test(e.message), 'nor is an entry made of nothing');
});

test("REFUSED: a card from a skill no folder has, or whose SKILL.md says nothing it can be listed by", () => {
  const { root, found, agent } = composed();
  const lost = { ...agent, skills: ['write-a-note', 'no-such-skill'] };
  assert.throws(() => cardSkills(lost, found), (e: Error) => {
    assert.match(e.message, /^agents\/scribe\.md gives the skill `no-such-skill`, and no skills folder has it — looked in /);
    assert.ok(e.message.includes(path.join(root, 'skills')), e.message);
    return true;
  });
  fs.writeFileSync(path.join(root, 'skills', 'file-it', 'SKILL.md'), '---\nname: File it away\n---\nHow to file.\n');
  assert.throws(() => cardSkills(agent, found), (e: Error) => /SKILL\.md has no `description:`, and the A2A protocol marks a skill's description REQUIRED/.test(e.message));
});

test('every shipped agent has a generated card, and every entry on it the fields A2A marks REQUIRED, tags and examples', () => {
  const agents = loadAgents(path.join(SHIPPED, 'agents'));
  const found = skillsFor(path.join(SHIPPED, 'dev'));
  assert.ok(agents.size >= 6);
  const ids = new Set<string>();
  for (const [name, agent] of agents) {
    assert.ok(!(agent instanceof Error), `${name} reads: ${agent instanceof Error ? agent.message : ''}`);
    const card = agentCard(agent as Agent, agentVersion(path.join(SHIPPED, 'agents'), name, found)!, cardSkills(agent as Agent, found));
    assert.deepEqual(card.skills.map((s) => s.id), (agent as Agent).skills, `${name}'s card lists its skills, and nothing else`);
    for (const skill of card.skills) {
      for (const key of SKILL_REQUIRED) assert.ok(Object.hasOwn(skill, key), `${name}/${skill.id} gives ${key}`);
      assert.notEqual(skill.name, skill.id, `${name}/${skill.id} has a title a person reads`);
      assert.ok(skill.tags.length, `${name}/${skill.id} has tags, which the protocol marks REQUIRED`);
      assert.ok(skill.examples?.length, `${name}/${skill.id} gives an example a person would type`);
      ids.add(`${name}/${skill.id}`);
    }
    assert.match(card.version, /^[0-9a-f]{16}$/);
  }
  assert.ok(ids.size >= 10, 'the shipped agents say what they can do');
});

test('no shipped agent names a card file, and none lies beside it', () => {
  for (const dir of [path.join(SHIPPED, 'agents'), path.join(import.meta.dirname, '..', 'workflows', 'agents')]) {
    const files = fs.readdirSync(dir);
    assert.deepEqual(files.filter((f) => f.endsWith('.skills.json')), [], `${dir} holds no card file`);
    for (const file of files.filter((f) => f.endsWith('.md') && f !== 'README.md')) {
      assert.doesNotMatch(fs.readFileSync(path.join(dir, file), 'utf8'), /^card:/m, `${file} has no \`card:\` line`);
    }
  }
});
