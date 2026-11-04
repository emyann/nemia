/**
 * The run object's OpenAPI 3.1 document on its route: an OpenAPI 3.1.0 document whose `components.schemas` hold `Run`, which imports back
 * through Effect's own JSON Schema into a Schema that decodes the object the package builds of a run — the route a client generator
 * of the board's mirror rests on.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, JsonSchema, Schema, SchemaRepresentation } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { COMMANDS, routeList, runObject, runStore } from 'agent-orchestrator';
import { ANSWERS, LABEL_WRITES, RUN_READS } from './openapi.ts';
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

test("the document's paths are the run's and its sub-resources' routes as the command table says them, each in OpenAPI's spelling", async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as { paths: Record<string, { get?: unknown }> };
  const routes = COMMANDS.filter((c) => (RUN_READS as readonly string[]).includes(c.name))
    .flatMap((c) => routeList(c))
    .filter((r) => r.method === 'GET')
    .map((r) => r.path.replace(/:(\w+)/g, '{$1}'));
  assert.equal(routes.length, RUN_READS.length, 'each read has its route in the table');
  const writes = COMMANDS.filter((c) => (LABEL_WRITES as readonly string[]).includes(c.name))
    .flatMap((c) => routeList(c))
    .filter((r) => r.method === 'POST')
    .map((r) => r.path.replace(/:(\w+)/g, '{$1}'));
  assert.equal(writes.length, LABEL_WRITES.length, 'each label write has its route in the table');
  assert.deepEqual(Object.keys(doc.paths).sort(), [...routes, ...writes].sort(), 'the paths are those routes, and only those');
  for (const path of routes) assert.ok(doc.paths[path]?.get, `${path} is read with GET`);
});

test("the two label writes are POSTs whose body is a LabelEdit and whose answer a Labelled, and a run's labels an object of strings", async () => {
  type Op = {
    parameters: { name: string; in: string }[];
    requestBody: { content: { 'application/json': { schema: unknown } } };
    responses: Record<string, { content: { 'application/json': { schema: unknown } } }>;
  };
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { post?: Op }>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  for (const [path, param] of [
    ['/api/runs/{runId}/labels', 'runId'],
    ['/api/inbox/{name}/labels', 'name'],
  ] as const) {
    const post = doc.paths[path]?.post;
    assert.ok(post, `${path} is written with POST`);
    assert.deepEqual(
      post.parameters.map((p) => [p.name, p.in]),
      [[param, 'path']],
      `${path} names its path's parameter`,
    );
    assert.deepEqual(
      post.requestBody.content['application/json'].schema,
      { $ref: '#/components/schemas/LabelEdit' },
      `${path} is sent a LabelEdit`,
    );
    assert.deepEqual(
      post.responses['200']?.content['application/json'].schema,
      { $ref: '#/components/schemas/Labelled' },
      `${path} answers a Labelled`,
    );
  }
  for (const name of ['LabelEdit', 'Labelled']) assert.ok(doc.components.schemas[name], `${name} is a component`);
  assert.deepEqual(
    doc.components.schemas['RunMetadata']?.properties?.['labels'],
    { type: 'object', additionalProperties: { type: 'string' } },
    "a run's labels are a map of strings, the one index of extra keys the document allows",
  );
});

test("each read's path names its answer's component, which imports back and decodes what the route answers", async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as {
    paths: Record<string, { get?: { operationId: (typeof RUN_READS)[number]; responses: Record<string, unknown> } }>;
    components: { schemas: Record<string, JsonSchema.JsonSchema> };
  };
  const asked = { runId: R, step: 'design', try: '1' };
  for (const [path, { get }] of Object.entries(doc.paths)) {
    if (get === undefined) continue;
    const name = ANSWERS[get.operationId];
    assert.deepEqual(
      get.responses['200'],
      {
        description: (get.responses['200'] as { description: string }).description,
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
      },
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
