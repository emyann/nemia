/**
 * The Workflow (`src/workflow.ts`): a workflow and a page of them as the Api's endpoints answer them, every key kept; its graph typed,
 * every node with its kind, its nodes always there; its origin one of the four words; and the write bodies the Api takes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, DEFINITION_ORIGINS, EDGE_KINDS, GraphEdge, Workflow, WorkflowCreate } from 'objects';
import { answered, taken } from './served.ts';

const step = {
  name: 'design',
  spec: { harness: 'claude', after: [], agent: 'architect', routes: null },
  body: 'Write the spec.',
  own: { keys: ['agent'], body: '' },
  hired: null,
  layers: null,
  mcp: [],
};

const workflow = {
  apiVersion: API_VERSION,
  kind: 'Workflow',
  metadata: { name: 'dev', namespace: 'acme', creationTimestamp: '2026-11-05T00:00:00.000Z', resourceVersion: 'sha256:1' },
  spec: { description: 'An intent to main.', readme: null, steps: [{ name: 'design', keys: { agent: 'architect' }, body: '' }] },
  status: {
    origin: 'factory',
    revision: 3,
    dir: '/store/factories/acme/tree/workflows/dev',
    graph: {
      roots: ['triage'],
      edges: [{ from: 'triage', to: 'design', kind: 'route', route: 'dev' }],
      nodes: [
        { name: 'triage', kind: 'condition', ends: ['drop'] },
        { name: 'design', kind: 'step' },
        { name: 'handoff', kind: 'workflow', workflow: 'dev' },
      ],
    },
    steps: [step],
    schemas: ['design.json'],
    folderTeam: false,
    error: null,
    unfilled: null,
  },
} as const;

const shadowed = { ...workflow, status: { ...workflow.status, origin: 'yours', shadowedBy: 'repo' } };

test("the Api's get answers a workflow and its list a page of them, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('workflows', 'get', workflow), workflow);
  assert.deepEqual(answered('workflows', 'get', shadowed), shadowed);
  const page = { apiVersion: API_VERSION, kind: 'WorkflowList', metadata: {}, items: [workflow, shadowed] };
  assert.deepEqual(answered('workflows', 'list', page), page);
  assert.equal(answered('workflows', 'get', { ...workflow, kind: 'Agent' }), undefined);
  assert.equal(answered('workflows', 'list', { ...page, kind: 'AgentList' }), undefined);
});

test('REFUSED: a node without its kind, a kind outside the words, a graph without nodes, an origin outside the four words', () => {
  const graph = workflow.status.graph;
  const withGraph = (g: unknown) => ({ ...workflow, status: { ...workflow.status, graph: g } });
  const decode = Schema.decodeUnknownSync(Workflow);
  assert.throws(() => decode(withGraph({ ...graph, nodes: [{ name: 'design' }] })), 'a node says its kind');
  assert.throws(() => decode(withGraph({ ...graph, nodes: [{ name: 'design', kind: 'gate' }] })), 'a kind is one of NODE_KINDS');
  assert.throws(() => decode(withGraph({ roots: graph.roots, edges: graph.edges })), "a workflow's graph always has its nodes");
  assert.throws(() => decode({ ...workflow, status: { ...workflow.status, origin: 'tree' } }), 'the tree is the origin `factory`');
  assert.deepEqual(DEFINITION_ORIGINS, ['factory', 'repo', 'yours', 'builtin']);
});

test('every edge kind of EDGE_KINDS is one GraphEdge reads, and no other', () => {
  const edge = (kind: string) => ({ from: 'a', to: 'b', kind, rounds: 2, route: 'r' });
  for (const kind of EDGE_KINDS) assert.doesNotThrow(() => Schema.decodeUnknownSync(GraphEdge)(edge(kind)), kind);
  assert.throws(() => Schema.decodeUnknownSync(GraphEdge)(edge('gate')));
});

test('the write bodies: a whole spec with the version it was read at, and a create of one step by its name', () => {
  const write = { metadata: { resourceVersion: 'sha256:1' }, spec: workflow.spec, schemas: [{ file: 'design.json', text: '{}' }] };
  assert.deepEqual(taken('workflows', 'replace', write), write);
  const create = { metadata: { name: 'mine' }, spec: { steps: [{ name: 'only', keys: { harness: 'claude' }, body: 'Do it.' }] } };
  assert.deepEqual(taken('workflows', 'create', create), create);
  assert.throws(() => Schema.decodeUnknownSync(WorkflowCreate)({ spec: create.spec }), 'a create names its workflow');
  assert.equal(taken('workflows', 'create', write), undefined, 'a whole write is no create');
});
