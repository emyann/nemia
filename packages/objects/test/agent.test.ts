/**
 * The Agent (`src/agent.ts`): an agent and a page of them decoded from JSON and encoded back equal; its origin and a given skill's one of
 * the four words; and the write, try and card bodies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Agent, AgentCard, AgentList, AgentTry, AgentWrite } from 'objects';

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

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('an agent and a page of them decode from JSON and encode back the same', () => {
  assert.deepEqual(roundTrip(Agent, agent), agent);
  const page = { apiVersion: API_VERSION, kind: 'AgentList', metadata: { continue: 'c' }, items: [agent] };
  assert.deepEqual(roundTrip(AgentList, page), page);
});

test('REFUSED: an origin outside the four words, and a given skill found in a place no origin names', () => {
  const decode = Schema.decodeUnknownSync(Agent);
  assert.throws(() => decode({ ...agent, status: { ...agent.status, origin: 'tree' } }));
  assert.throws(() => decode({ ...agent, status: { ...agent.status, given: [{ ...agent.status.given[0], from: 'shipped' }] } }));
});

test('the write, the try and the card', () => {
  const write = { metadata: { name: 'architect', resourceVersion: 'sha256:a' }, spec: { description: null, instructions: 'x' } };
  assert.deepEqual(roundTrip(AgentWrite, write), write);
  assert.deepEqual(roundTrip(AgentTry, { brief: 'go' }), { brief: 'go' });
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
  assert.deepEqual(roundTrip(AgentCard, card), card);
  assert.throws(() => Schema.decodeUnknownSync(AgentCard)({ ...card, servedOverA2A: true }), 'never served over A2A');
});
