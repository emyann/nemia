/**
 * The objects' OpenAPI 3.1 document on its route, `OpenApi.fromApi(Api)`: an OpenAPI 3.1.0 document whose `components.schemas` hold
 * `Run`, which imports back through Effect's own JSON Schema into a Schema that decodes the object the package builds of a run — the
 * route a client generator of the board's mirror rests on — and each of KINDS its get path and its component, each kind's List, the
 * builtin servers and a factory's commands.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, JsonSchema, Schema, SchemaRepresentation } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { runObject, runStore } from 'agent-orchestrator';
import { OpenApi } from 'effect/http-api';
import { Api, KINDS } from 'objects';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const app = eachTest(() => appOver(standIn(), stand()));
const runWith = runOver(() => stand().layer);

const R = 'r-openapi';
fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'runs', `${R}.json`),
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'The document',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: '2026-11-02T06:00:00.000Z',
    workflow: [
      { name: 'design', after: [], body: 'Design it.', harness: 'claude' },
      { name: 'implement', after: ['design'], input: ['design'], body: 'Implement it.', harness: 'claude' },
    ],
    steps: { design: { taskId: 't-design' } },
  }),
);
beforeEachTest(() => {
  Effect.runSync(engine().file({ id: 't-design', brief: 'Do it.', cwd: '/code/app', harness: 'claude' }));
  standIn().settle('t-design', 'succeeded', {
    exitCode: 0,
    closeout: { outcome: 'done', summary: 'Designed it.', needs: null, artifacts: [] },
  });
});

test('the OpenAPI document is 3.1.0, defines `Run`, and imports back into a Schema that decodes a run object', async () => {
  const res = await app().request('/openapi/v3/nemia/v1');
  assert.equal(res.status, 200);
  const doc = (await res.json()) as {
    openapi: string;
    paths: Record<string, unknown>;
    components: { schemas: Record<string, JsonSchema.JsonSchema> };
  };
  assert.equal(doc.openapi, '3.1.0');
  assert.ok(doc.components.schemas.Run, 'the document defines Run');
  assert.ok(doc.paths['/api/runs/{runId}/steps/{step}/tries/{try}/closeout'], "it names the closeout's route");
  assert.deepEqual(
    (doc.paths['/api/runs/{name}'] as { get?: { responses: Record<string, { content: unknown }> } } | undefined)?.get?.responses['200']
      ?.content,
    { 'application/json': { schema: { $ref: '#/components/schemas/Run' } } },
    "the run's own path answers the run object",
  );
  const back = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaOpenApi3_1({ $ref: '#/components/schemas/Run', $defs: doc.components.schemas }),
  ) as Schema.Decoder<unknown>;
  const object = await runWith(engine(), runObject(runStore.runs.read(R), { memo: { said: new Map() } }));
  assert.ok(!('unjudged' in object), 'the run is judged');
  assert.deepEqual(Schema.decodeUnknownSync(back)(object), object, "the imported Schema decodes the package's object of the run");
  assert.ok(
    object.status.graph.edges.some((e) => e.kind === 'input'),
    'the object carries the `input` edge the record declares',
  );
  assert.equal(Schema.decodeUnknownResult(back)({ ...object, kind: 'Step' })._tag, 'Failure', 'the imported Schema keeps the kind closed');
});

test('the document is the one Effect writes of the Api, and holds, for each of KINDS, its get path and its component', async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { get?: unknown; post?: unknown; put?: unknown }>;
    components: { schemas: Record<string, unknown> };
  };
  assert.deepEqual(doc, JSON.parse(JSON.stringify(OpenApi.fromApi(Api))), 'the document is OpenApi.fromApi(Api), as JSON');
  const GET_PATHS = {
    Run: '/api/runs/{name}',
    Card: '/api/namespaces/{namespace}/cards/{name}',
    Factory: '/api/factories/{name}',
    McpServer: '/api/namespaces/{namespace}/mcpservers/{name}',
    Schedule: '/api/namespaces/{namespace}/schedules/{name}',
    Hire: '/api/namespaces/{namespace}/hires/{name}',
    Volume: '/api/namespaces/{namespace}/volumes/{name}',
    Workflow: '/api/namespaces/{namespace}/workflows/{name}',
    Agent: '/api/namespaces/{namespace}/agents/{name}',
    Skill: '/api/namespaces/{namespace}/skills/{name}',
    Template: '/api/templates/{name}',
    Subscription: '/api/subscriptions/{name}',
    Event: '/api/events/{name}',
    Proposal: '/api/namespaces/{namespace}/proposals/{name}',
    Delegation: '/api/namespaces/{namespace}/delegations/{name}',
  } as const;
  for (const kind of KINDS) {
    assert.ok(doc.paths[GET_PATHS[kind]]?.get, `${kind} is got at ${GET_PATHS[kind]}`);
    assert.ok(doc.components.schemas[kind], `${kind} is a component`);
  }
  assert.ok(doc.paths['/api/cards']?.get, 'the cards are listed across namespaces');
  assert.ok(doc.paths['/api/namespaces/{namespace}/cards']?.get, 'and in one');
  assert.ok(doc.paths['/api/namespaces/{namespace}/cards/{name}']?.put, 'a card is written whole');
  assert.ok(doc.paths['/api/cards/{name}']?.get, 'and read by its name in any namespace');
  assert.ok(doc.components.schemas['CardList'], 'CardList is a component');
  for (const kind of ['Factory', 'McpServer', 'Schedule', 'Hire', 'Volume', 'Workflow', 'Agent', 'Skill', 'Proposal', 'Delegation'])
    assert.ok(doc.components.schemas[`${kind}List`], `${kind}List is a component`);
  assert.ok(doc.paths['/api/factories']?.get, 'the factories are listed, cluster-scoped');
  for (const plural of ['mcpservers', 'schedules', 'hires', 'volumes', 'workflows', 'agents', 'skills', 'proposals', 'delegations'])
    assert.ok(doc.paths[`/api/namespaces/{namespace}/${plural}`]?.get, `the ${plural} are listed in a factory's namespace`);
  assert.ok(doc.paths['/api/builtin/mcpservers']?.get, "Nemia's builtin servers are listed");
  assert.ok(doc.paths['/api/namespaces/{namespace}/agents/{name}/try']?.post, 'an agent is tried');
  assert.ok(doc.paths['/api/namespaces/{namespace}/agents/{name}/card']?.get, 'and its card read');
  assert.ok(doc.paths['/api/namespaces/{namespace}/skills/{name}/copy']?.post, 'a builtin skill is copied');
  assert.ok(doc.paths['/api/namespaces/{namespace}/proposals']?.post, 'a proposal is filed');
  assert.ok(doc.paths['/api/namespaces/{namespace}/proposals/{name}/approve']?.post, 'and approved');
  assert.ok(doc.paths['/api/namespaces/{namespace}/proposals/{name}/decline']?.post, 'or declined');
  assert.ok(doc.paths['/api/namespaces/{namespace}/delegations/{name}']?.put, 'a delegation is written whole');
  assert.ok(doc.paths['/api/namespaces/{namespace}/skills/{name}/files']?.get, "and a skill's files listed");
  assert.ok(doc.paths['/api/factories/{name}/commands']?.get, "a factory's command lines are got");
  assert.ok(doc.components.schemas['FactoryCommands'], 'FactoryCommands is a component');
  assert.match(JSON.stringify(doc.paths['/api']?.get), /APIResourceList/, 'GET /api is discovery, answering the APIResourceList');
  assert.ok(doc.components.schemas['APIResourceList'], 'APIResourceList is a component');
  assert.match(JSON.stringify(doc.paths['/api/cards']?.get), /"name":"watch"/, 'a list takes `watch`');
});

test("the card's labels are a POST whose body is a LabelEdit and whose answer a Labelled, and a run's labels an object of strings", async () => {
  type Op = {
    requestBody: { content: { 'application/json': { schema: unknown } } };
    responses: Record<string, { content: { 'application/json': { schema: unknown } } }>;
  };
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { post?: Op }>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  const post = doc.paths['/api/namespaces/{namespace}/cards/{name}/labels']?.post;
  assert.ok(post, "a card's labels are written with POST");
  assert.deepEqual(post.requestBody.content['application/json'].schema, { $ref: '#/components/schemas/LabelEdit' }, 'sent a LabelEdit');
  assert.deepEqual(
    post.responses['200']?.content['application/json'].schema,
    { $ref: '#/components/schemas/Labelled' },
    'answers a Labelled',
  );
  assert.deepEqual(
    doc.components.schemas['RunMetadata']?.properties?.['labels'],
    { type: 'object', additionalProperties: { type: 'string' } },
    "a run's labels are a map of strings, the one index of extra keys the document allows",
  );
});

/** Each of the run's named actions in the document: its method on its path, the status it answers, and the component its body is. */
const RUN_ACTIONS = [
  ['post', '/api/namespaces/{namespace}/runs', '201', 'RunStart'],
  ['delete', '/api/namespaces/{namespace}/runs/{name}', '200', null],
  ['post', '/api/namespaces/{namespace}/runs/{name}/refresh', '202', 'RunRefresh'],
  ['post', '/api/namespaces/{namespace}/runs/{name}/prune', '200', 'RunPrune'],
  ['post', '/api/namespaces/{namespace}/runs/{name}/labels', '200', 'LabelEdit'],
  ['post', '/api/namespaces/{namespace}/runs/{name}/hold', '200', 'RunHold'],
  ['delete', '/api/namespaces/{namespace}/runs/{name}/hold', '200', null],
  ['post', '/api/namespaces/{namespace}/runs/{name}/steps/{step}/retry', '202', 'RunRetry'],
  ['post', '/api/namespaces/{namespace}/runs/{name}/steps/{step}/approve', '202', 'RunApprove'],
  ['post', '/api/namespaces/{namespace}/runs/{name}/steps/{step}/say', '202', 'RunSay'],
] as const;

test("the document holds the RunList, a run in its namespace, and each of the run's named actions with its body and its refusals", async () => {
  type Op = {
    requestBody?: { content: { 'application/json': { schema: unknown } } };
    responses: Record<string, { content?: { 'application/json': { schema: unknown } } }>;
  };
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, Partial<Record<'get' | 'post' | 'delete', Op>>>;
    components: { schemas: Record<string, unknown> };
  };
  assert.ok(doc.components.schemas['RunList'], 'RunList is a component');
  for (const path of ['/api/runs', '/api/namespaces/{namespace}/runs']) {
    const listed = doc.paths[path]?.get?.responses['200']?.content?.['application/json'].schema as
      | { anyOf?: { $ref?: string; properties?: { kind?: { enum?: unknown } } }[] }
      | undefined;
    assert.deepEqual(listed?.anyOf?.[0], { $ref: '#/components/schemas/RunList' }, `${path} answers a RunList`);
    assert.deepEqual(listed?.anyOf?.[1]?.properties?.kind?.enum, ['Table'], `${path} answers a Table where one is asked`);
  }
  const inNamespace = doc.paths['/api/namespaces/{namespace}/runs/{name}']?.get?.responses['200']?.content?.['application/json'].schema;
  assert.deepEqual(inNamespace, { $ref: '#/components/schemas/Run' }, 'the same component as /api/runs/{name} answers');
  for (const [method, path, status, body] of RUN_ACTIONS) {
    const op = doc.paths[path]?.[method];
    assert.ok(op, `${method.toUpperCase()} ${path} is in the document`);
    assert.ok(op.responses[status], `${method.toUpperCase()} ${path} answers ${status}`);
    for (const refused of ['400', '404', '409', '422', '502'])
      assert.ok(op.responses[refused], `${method.toUpperCase()} ${path} says its ${refused}`);
    if (body === null) assert.equal(op.requestBody, undefined, `${method.toUpperCase()} ${path} takes no body`);
    else {
      assert.deepEqual(op.requestBody?.content['application/json'].schema, { $ref: `#/components/schemas/${body}` }, `sent a ${body}`);
      assert.ok(doc.components.schemas[body], `${body} is a component`);
    }
  }
});

/** The component each read of a run and of its steps answers with, by its endpoint's group and name. */
const ANSWERS = {
  'runs.show': 'Run',
  'steps.tries': 'StepTries',
  'steps.try': 'StepTry',
  'steps.closeout': 'TryCloseout',
  'steps.told': 'StepTold',
  'steps.transcript': 'StepTranscript',
} as const;

test("each read of a run's path names its answer's component, which imports back and decodes what the route answers", async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { get?: { operationId: string; responses: Record<string, { content?: unknown }> } }>;
    components: { schemas: Record<string, JsonSchema.JsonSchema> };
  };
  const asked = { name: R, runId: R, step: 'design', try: '1' };
  for (const [operation, name] of Object.entries(ANSWERS)) {
    const found = Object.entries(doc.paths).find(([, { get }]) => get?.operationId === operation);
    assert.ok(found, `the document has ${operation}`);
    const [path, { get }] = found;
    assert.deepEqual(
      get?.responses['200']?.content,
      { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      `${path} answers ${name}`,
    );
    const back = SchemaRepresentation.fromJsonSchemaDocument(
      JsonSchema.fromSchemaOpenApi3_1({ $ref: `#/components/schemas/${name}`, $defs: doc.components.schemas }),
    ) as Schema.Decoder<unknown>;
    const res = await app().request(path.replace(/\{(\w+)\}/g, (_, key: keyof typeof asked) => asked[key]));
    assert.equal(res.status, 200, `${path} answers the fixture run`);
    const body: unknown = await res.json();
    assert.deepEqual(Schema.decodeUnknownSync(back)(body), body, `${name}, imported back, decodes what ${path} answers`);
  }
});
