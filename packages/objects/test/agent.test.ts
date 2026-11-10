/**
 * The Agent (`src/agent.ts`): an agent and a page of them as the Api's endpoints answer them, every key kept; its origin and a given
 * skill's one of the four words; and the write and try bodies the Api takes, and the card it answers.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Agent, AgentCard } from 'objects';
import { answered, taken } from './served.ts';

const entry = { id: 'git', name: 'git', description: 'Keep your work.', tags: ['git'] };

const agent = {
  apiVersion: API_VERSION,
  kind: 'Agent',
  metadata: { name: 'architect', namespace: 'default', creationTimestamp: '2026-11-05T00:00:00.000Z', resourceVersion: 'sha256:a' },
  spec: {
    role: 'Architect',
    description: 'Designs.',
    keys: { model: 'opus' },
    skills: 'git',
    mcp: null,
    output: null,
    instructions: 'Design.',
  },
  status: {
    origin: 'yours',
    shadowedBy: 'repo',
    revision: 1,
    dir: '/store/workflows/agents',
    file: '/store/workflows/agents/architect.md',
    source: '---\nrole: Architect\n---\nDesign.\n',
    usedBy: [{ from: 'yours', workflow: 'build', step: 'design' }],
    fills: [{ from: 'yours', workflow: 'build', step: 'design', hired: false }],
    factories: ['mill'],
    given: [{ name: 'git', from: 'builtin', foundIn: null, entry, error: null, preload: false, cost: null }],
    copied: { source: '/repo/workflows/agents/architect.md', version: 'v', now: 'same' },
    untried: null,
    card: [entry],
    cardError: null,
    error: null,
  },
} as const;

test("the Api's get answers an agent and its list a page of them, every key kept; another kind refused", () => {
  assert.deepEqual(answered('agents', 'get', agent), agent);
  assert.equal(answered('agents', 'get', { ...agent, kind: 'Skill' }), undefined);
  const page = { apiVersion: API_VERSION, kind: 'AgentList', metadata: { continue: 'c' }, items: [agent] };
  assert.deepEqual(answered('agents', 'list', page), page);
  assert.equal(answered('agents', 'list', { ...page, kind: 'SkillList' }), undefined);
});

test('REFUSED: an origin outside the four words, and a given skill found in a place no origin names', () => {
  const decode = Schema.decodeUnknownSync(Agent);
  assert.throws(() => decode({ ...agent, status: { ...agent.status, origin: 'tree' } }));
  assert.throws(() => decode({ ...agent, status: { ...agent.status, given: [{ ...agent.status.given[0], from: 'shipped' }] } }));
});

test('the write and the try the Api takes, each refused without its spec or its brief, and the card it answers', () => {
  const write = { metadata: { name: 'architect', resourceVersion: 'sha256:a' }, spec: { description: null, instructions: 'x' } };
  assert.deepEqual(taken('agents', 'replace', write), write);
  assert.deepEqual(taken('agents', 'create', write), write);
  assert.equal(taken('agents', 'replace', { metadata: write.metadata }), undefined);
  assert.deepEqual(taken('agents', 'try', { brief: 'go' }), { brief: 'go' });
  assert.equal(taken('agents', 'try', {}), undefined);
  const card = {
    card: {
      name: 'architect',
      description: 'Designs.',
      version: 'v',
      capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['application/json'],
      skills: [entry],
    },
    servedOverA2A: false,
    why: 'not served',
  };
  assert.deepEqual(answered('agents', 'card', card), card);
  assert.throws(() => Schema.decodeUnknownSync(AgentCard)({ ...card, servedOverA2A: true }), 'never served over A2A');
});
