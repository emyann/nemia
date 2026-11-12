/**
 * The tools of the MCP port, generated (`portTools`): one per link of the command table and of the verbs the CLI runs by hand, each link
 * an endpoint of `objects`' `Api` read by reflection and none a stream; each tool's input a JSON Schema object of the endpoint's path,
 * query and payload; its hints its verb's class and its endpoint's method (`toolHints`, whose laws the contract proves); and no name
 * twice. Read off the tables as they are, so a link the table gains is held here with nothing to list.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';
import { CLI_VERBS, TABLE, toolsOf } from 'agent-orchestrator';
import { Api, type ApiEndpointName } from 'objects';
import { classWordOf, toolHints } from './hints.ts';
import { portTools } from './tools.ts';

/** Every endpoint of the `Api` by its `<group>.<endpoint>` name. */
const ENDPOINTS = new Map(
  Object.values(Api.groups).flatMap((group) =>
    Object.values(group.endpoints).map((endpoint) => [`${group.identifier}.${endpoint.identifier}`, endpoint] as const),
  ),
);

/** Whether `schema`, or the schema it carries headers on, is a stream of server-sent events. */
const streams = (schema: unknown): boolean => {
  const inner = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema;
  return typeof inner === 'object' && inner !== null && '_tag' in inner && inner._tag === 'StreamSse';
};

/** The tools, as the port serves them. */
const TOOLS = portTools(TABLE, CLI_VERBS, Api);
const tool = (name: string) => {
  const found = TOOLS.find((t) => t.name === name);
  assert.ok(found, `the port serves a tool ${name}`);
  return found;
};

test('every link of the command table and of the verbs the CLI runs by hand is an endpoint of the Api, and none is a stream', () => {
  const links = [...TABLE, ...CLI_VERBS].flatMap((entry) => toolsOf(entry));
  assert.ok(links.length > 50, `${links.length} links read off the tables`);
  for (const link of links) {
    const endpoint = ENDPOINTS.get(link.endpoint);
    assert.ok(endpoint, `${link.tool}'s link ${link.endpoint} is an endpoint of the Api`);
    assert.ok(![...endpoint.success].some(streams), `${link.tool}'s endpoint ${link.endpoint} answers no stream`);
  }
  assert.deepEqual(
    TOOLS.map((t) => t.name),
    links.map((l) => l.tool),
    'one tool per link, in the tables order',
  );
});

test('no tool name is served twice', () => {
  const names = TOOLS.map((t) => t.name);
  assert.deepEqual(
    names.filter((n, i) => names.indexOf(n) !== i),
    [],
  );
});

test("every tool's input is a JSON Schema object, and it says what it calls and how the CLI says it", () => {
  for (const t of TOOLS) {
    assert.equal(t.inputSchema.type, 'object', t.name);
    assert.equal(typeof t.inputSchema.properties, 'object', t.name);
    assert.ok(t.description.includes('nemia '), `${t.name}'s description names its CLI usage`);
    assert.ok(!('watch' in t.inputSchema.properties), `${t.name} takes no watch: a call answers once`);
  }
});

test("hold takes the run's path, required, and the payload's until", () => {
  const hold = tool('hold');
  assert.deepEqual([...(hold.inputSchema.required ?? [])].sort(), ['name', 'namespace']);
  assert.ok('until' in hold.inputSchema.properties, 'the payload key until');
  assert.equal(hold.method, 'POST');
});

test('wait takes the query of GET /api/feed/wait', () => {
  const wait = tool('wait');
  for (const key of ['labelSelector', 'from', 'for']) assert.ok(key in wait.inputSchema.properties, key);
  assert.equal(wait.method, 'GET');
});

test('the hints: ls is read-only, cancel is destructive, each tool its class and method as toolHints says', () => {
  assert.equal(tool('ls').annotations.readOnlyHint, true);
  assert.equal(tool('ls').annotations.destructiveHint, false);
  assert.equal(tool('cancel').annotations.destructiveHint, true);
  assert.equal(tool('cancel').annotations.readOnlyHint, false);
  const entries = new Map([...TABLE, ...CLI_VERBS].map((e) => [e.name, e] as const));
  for (const t of TOOLS) {
    const entry = entries.get(t.entry);
    assert.ok(entry, t.name);
    assert.deepEqual(t.annotations, toolHints(classWordOf(entry.class), t.method), t.name);
  }
});

/** An api of one endpoint whose path and payload both say `name`. */
const TWICE = HttpApi.make('twice').add(
  HttpApiGroup.make('probe').add(
    HttpApiEndpoint.post('twice', '/api/probe/:name', {
      params: Schema.Struct({ name: Schema.String }),
      payload: Schema.Struct({ name: Schema.String }),
      success: Schema.Struct({}),
    }),
  ),
);

test('REFUSED: a link to an endpoint that streams, and a key the path, the query and the payload say twice', () => {
  const entry = { name: 'probe', usage: '', help: ['a probe'], class: 'read' as const };
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'server.feed' }] }], Api), /stream/);
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'probe.twice' as ApiEndpointName }] }], TWICE), /name/);
});

test('ls and inbox answer a Table, ls_run and factory_servers do not; inbox, closeout, try and decide send their narrowing defaults', () => {
  assert.equal(tool('ls').table, true);
  assert.equal(tool('inbox').table, true);
  assert.equal(tool('ls_run').table, false);
  assert.equal(tool('factory_servers').table, false);
  assert.deepEqual(tool('inbox').defaults, { fieldSelector: 'status.inPlay=true' });
  assert.deepEqual(tool('ls').defaults, {});
  for (const narrow of ['closeout', 'try']) assert.deepEqual(tool(narrow).defaults, { fields: '' }, `${narrow} reads a closeout narrowly`);
  assert.deepEqual(tool('decide').defaults, { diffs: '' }, "decide answers each diff's path and counts");
  assert.ok(tool('inbox_card').pathKeys.includes('name'), 'inbox_card reads one card by its name');
});

test('REFUSED: a link that sends by default a key its endpoint’s query does not take', () => {
  const entry = { name: 'probe', usage: '', help: ['a probe'], class: 'read' as const };
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'cards.getAll', query: { fieldSelector: 'x' } }] }], Api), Error);
  assert.doesNotThrow(() => portTools([], [{ ...entry, served: [{ endpoint: 'cards.listAll', query: { fieldSelector: 'x' } }] }], Api));
});
