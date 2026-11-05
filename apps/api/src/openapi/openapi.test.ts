/**
 * The objects' OpenAPI 3.1 document on its route, `OpenApi.fromApi(Api)`: an OpenAPI 3.1.0 document whose `components.schemas` hold
 * `Run`, which imports back through Effect's own JSON Schema into a Schema that decodes the object the package builds of a run — the
 * route a client generator of the board's mirror rests on — and each of KINDS its get path and its component.
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
    (doc.paths['/api/runs/{runId}'] as { get?: { responses: Record<string, { content: unknown }> } } | undefined)?.get?.responses['200']
      ?.content,
    { 'application/json': { schema: { $ref: '#/components/schemas/Run' } } },
    "the run's own path answers the run object",
  );
  const back = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaOpenApi3_1({ $ref: '#/components/schemas/Run', $defs: doc.components.schemas }),
  ) as Schema.Decoder<unknown>;
  const object = await runWith(
    engine(),
    runObject(runStore.runs.read(R), { memo: { filings: { filed: new Map(), cursor: 0 }, said: new Map() } }),
  );
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
    paths: Record<string, { get?: unknown }>;
    components: { schemas: Record<string, unknown> };
  };
  assert.deepEqual(doc, JSON.parse(JSON.stringify(OpenApi.fromApi(Api))), 'the document is OpenApi.fromApi(Api), as JSON');
  const GET_PATHS = { Run: '/api/runs/{runId}', Card: '/api/namespaces/{namespace}/cards/{name}' } as const;
  for (const kind of KINDS) {
    assert.ok(doc.paths[GET_PATHS[kind]]?.get, `${kind} is got at ${GET_PATHS[kind]}`);
    assert.ok(doc.components.schemas[kind], `${kind} is a component`);
  }
  assert.ok(doc.paths['/api/cards']?.get, 'the cards are listed across namespaces');
  assert.ok(doc.paths['/api/namespaces/{namespace}/cards']?.get, 'and in one');
  assert.ok(doc.components.schemas['CardList'], 'CardList is a component');
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

/** The component each read of the runs group answers with, by its endpoint's name. */
const ANSWERS = { show: 'Run', tries: 'StepTries', try: 'StepTry', closeout: 'TryCloseout', told: 'StepTold' } as const;

test("each read of a run's path names its answer's component, which imports back and decodes what the route answers", async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { get?: { operationId: string; responses: Record<string, { content?: unknown }> } }>;
    components: { schemas: Record<string, JsonSchema.JsonSchema> };
  };
  const asked = { runId: R, step: 'design', try: '1' };
  for (const [operation, name] of Object.entries(ANSWERS)) {
    const found = Object.entries(doc.paths).find(([, { get }]) => get?.operationId === `runs.${operation}`);
    assert.ok(found, `the document has the runs group's ${operation}`);
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
