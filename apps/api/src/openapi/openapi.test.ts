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
import { SUB_RESOURCES } from './openapi.ts';
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
  const back = SchemaRepresentation.fromJsonSchemaDocument(
    JsonSchema.fromSchemaOpenApi3_1({ $ref: '#/components/schemas/Run', $defs: doc.components.schemas }),
  ) as Schema.Decoder<unknown>;
  const object = await runWith(engine(), runObject(runStore.runs.read(R), { filings: { filed: new Map(), cursor: 0 } }));
  assert.ok(!('unjudged' in object), 'the run is judged');
  assert.deepEqual(Schema.decodeUnknownSync(back)(object), object, "the imported Schema decodes the package's object of the run");
  assert.ok(
    object.status.graph.edges.some((e) => e.kind === 'input'),
    'the object carries the `input` edge the record declares',
  );
  assert.equal(Schema.decodeUnknownResult(back)({ ...object, kind: 'Step' })._tag, 'Failure', 'the imported Schema keeps the kind closed');
});

test("the document's paths are the sub-resources' routes as the command table says them, each in OpenAPI's spelling", async () => {
  const doc = (await (await app().request('/openapi/v3/nemia/v1')).json()) as { paths: Record<string, { get?: unknown }> };
  const routes = COMMANDS.filter((c) => (SUB_RESOURCES as readonly string[]).includes(c.name))
    .flatMap((c) => routeList(c))
    .filter((r) => r.method === 'GET')
    .map((r) => r.path.replace(/:(\w+)/g, '{$1}'));
  assert.equal(routes.length, SUB_RESOURCES.length, 'each sub-resource has its route in the table');
  assert.deepEqual(Object.keys(doc.paths).sort(), routes.sort(), 'the paths are those routes, and only those');
  for (const path of routes) assert.ok(doc.paths[path]?.get, `${path} is read with GET`);
});
