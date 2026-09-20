/**
 * What an agent says it can do, printed in the A2A protocol's terms (`agentCard`): a card-shaped description, and **not** an Agent Card.
 *
 * The required fields below are written out as a literal from the protocol's own definition — `specification/a2a.proto` in a2aproject/A2A,
 * protocol 1.0, read at the source on 2026-09-19 — so the omission this slice makes on purpose is pinned rather than assumed. A later slice
 * that serves a card over A2A deletes the omission deliberately, and this test is where it says so.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { agentCard, agentVersion, loadAgents, parseAgent, WorkflowError, type Agent } from '../src/workflow.ts';

const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'agents');

/** Every field `AgentCard` marks REQUIRED, in the proto's order, spelled as the specification's sample card spells them in JSON. */
const REQUIRED = ['name', 'description', 'supportedInterfaces', 'version', 'capabilities', 'defaultInputModes', 'defaultOutputModes', 'skills'];
/** Every field `AgentSkill` marks REQUIRED. */
const SKILL_REQUIRED = ['id', 'name', 'description', 'tags'];
/** The fields a card carries that nothing here can fill honestly: no provider, no address, no scheme, no signature. */
const UNFILLED = ['supportedInterfaces', 'provider', 'documentationUrl', 'iconUrl', 'securitySchemes', 'security', 'securityRequirements', 'signatures'];

const of = (text: string, skills: string): Agent =>
  parseAgent('scribe', text, (file) => (file === 'scribe.skills.json' ? skills : undefined));

const SKILLS = '[{"id":"write-a-note","name":"Write a note","description":"Write the notes of a change.","tags":["note"],"examples":["Use this when a change needs its notes written."]}]';
const SCRIBE = '---\ndescription: Use this when a change needs its notes written.\nskills: scribe.skills.json\n---\nWrite the notes.\n';

test('a card carries every field A2A marks REQUIRED but the interfaces, which nothing here serves', () => {
  const card = agentCard(of(SCRIBE, SKILLS), 'abc123');
  for (const key of REQUIRED) {
    if (key === 'supportedInterfaces') continue;
    assert.ok(Object.hasOwn(card, key), `a card gives ${key}, which the protocol marks REQUIRED`);
  }
  // The one omission, on purpose: `supported_interfaces` is the list of URLs a client would call, and there is none to give.
  assert.equal(Object.hasOwn(card, 'supportedInterfaces'), false, 'no interface is offered for an agent nothing serves');
  for (const key of UNFILLED) assert.equal(Object.hasOwn(card, key), false, `${key} is left out rather than filled with a placeholder`);
  assert.deepEqual(Object.keys(card).filter((k) => !REQUIRED.includes(k)), [], 'and it carries nothing the protocol does not name');
});

test("a card says what the agent is, how it is versioned, and what it takes and hands back", () => {
  const card = agentCard(of(SCRIBE, SKILLS), 'abc123');
  assert.equal(card.name, 'scribe');
  assert.equal(card.description, 'Use this when a change needs its notes written.');
  // A2A's own example is semver; ours is the content digest a save carries, which changes when the agent's files change.
  assert.equal(card.version, 'abc123');
  assert.deepEqual(card.defaultInputModes, ['text/plain'], 'a step is handed a composed brief, and nothing else');
  assert.deepEqual(card.defaultOutputModes, ['application/json'], 'every closeout is a JSON object');
  // A2A capabilities are protocol features, never what an agent may reach: none of the three exists here.
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, extendedAgentCard: false });
  assert.deepEqual(card.skills, [{
    id: 'write-a-note',
    name: 'Write a note',
    description: 'Write the notes of a change.',
    tags: ['note'],
    examples: ['Use this when a change needs its notes written.'],
  }]);
  assert.equal(JSON.parse(JSON.stringify(card)).skills[0].id, 'write-a-note', 'and the whole of it is JSON');
});

test('REFUSED at shipped defaults: a card for an agent with no skills, or with no description', () => {
  const noSkills = '---\ndescription: Use this when a change needs its notes written.\n---\nWrite the notes.\n';
  assert.throws(() => agentCard(of(noSkills, SKILLS), 'abc123'), (e: Error) => {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.match(e.message, /^agents\/scribe\.md has no `skills:`, and the A2A protocol marks a card's skills REQUIRED/);
    assert.match(e.message, /skills: scribe\.skills\.json/);
    return true;
  });
  const noDescription = '---\nskills: scribe.skills.json\n---\nWrite the notes.\n';
  assert.throws(() => agentCard(of(noDescription, SKILLS), 'abc123'), (e: Error) => /^agents\/scribe\.md has no `description:`/.test(e.message));
});

test('every shipped agent has a card, and every skill on it the fields A2A marks REQUIRED', () => {
  const agents = loadAgents(SHIPPED);
  assert.ok(agents.size >= 6);
  const ids = new Set<string>();
  for (const [name, agent] of agents) {
    assert.ok(!(agent instanceof Error), `${name} reads: ${agent instanceof Error ? agent.message : ''}`);
    const card = agentCard(agent as Agent, agentVersion(SHIPPED, name)!);
    assert.ok(card.skills.length, `${name} says at least one thing it can do`);
    for (const skill of card.skills) {
      for (const key of SKILL_REQUIRED) assert.ok(Object.hasOwn(skill, key), `${name}/${skill.id} gives ${key}`);
      assert.ok(skill.tags.length, `${name}/${skill.id} has tags, which the protocol marks REQUIRED`);
      assert.ok(skill.examples?.length, `${name}/${skill.id} gives an example a person would type`);
      ids.add(`${name}/${skill.id}`);
    }
    // The card's version is the agent's files, so a change to the skills file alone moves it.
    assert.match(card.version, /^[0-9a-f]{16}$/);
  }
  assert.ok(ids.size >= 10, 'the shipped agents say what they can do');
});

test("a shipped agent's skills file is JSON beside it, named by its `skills:` line", () => {
  for (const [name, agent] of loadAgents(SHIPPED)) {
    const file = (agent as Agent).skills!.file;
    assert.equal(file, `${name}.skills.json`, `${name} names its skills after itself`);
    const text = fs.readFileSync(path.join(SHIPPED, file), 'utf8');
    assert.ok(Array.isArray(JSON.parse(text)), `${file} is a JSON array`);
  }
});
