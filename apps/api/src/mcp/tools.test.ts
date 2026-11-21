/**
 * The tools of the MCP port, generated (`portTools`): one per link of the command table and of the verbs the CLI runs by hand, each link
 * an endpoint of `objects`' `Api` read by reflection and none a stream; each tool's input a JSON Schema object of the endpoint's path,
 * query and payload; its hints its verb's class and its endpoint's method (`toolHints`, whose laws the contract proves); and no name
 * twice. Read off the tables as they are, so a link the table gains is held here with nothing to list.
 */
import '../../test/harness.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Context, Option, Schema } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { CLI_VERBS, TABLE, toolsOf } from 'agent-orchestrator';
import { Api, type ApiEndpointName, portInstructions, toolDescriptionOf, toolWordsOf } from 'objects';
import { classWordOf, toolHints } from './hints.ts';
import { PORT_INSTRUCTIONS } from './instructions.ts';
import { portTools } from './tools.ts';

/** Every endpoint of the `Api` by its `<group>.<endpoint>` name. */
const ENDPOINTS = new Map(
  Object.values(Api.groups).flatMap((group) =>
    Object.values(group.endpoints).map((endpoint) => [`${group.identifier}.${endpoint.identifier}`, endpoint] as const),
  ),
);

/** Whether `schema`, or the schema it carries headers on, is a stream of server-sent events. */
const streams = (schema: unknown) => {
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

test('factory_add and factory_apply are tools that POST their volumes, each a path or a git URL the server clones', () => {
  for (const name of ['factory_add', 'factory_apply']) {
    const t = tool(name);
    assert.equal(t.method, 'POST', name);
    assert.ok('volumes' in t.inputSchema.properties, `${name} takes volumes`);
    assert.ok(t.description.includes('--volume <path|url>:ro|:rw'), `${name}'s description names a --volume by its URL`);
  }
});

test("inbox_edit PUTs a card's text to its source, the card's path and its text required", () => {
  const edit = tool('inbox_edit');
  assert.equal(edit.method, 'PUT');
  assert.deepEqual([...(edit.inputSchema.required ?? [])].sort(), ['name', 'namespace', 'source']);
  assert.ok('resourceVersion' in edit.inputSchema.properties, 'the payload key resourceVersion');
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
    }).annotate(OpenApi.Description, 'A probe.'),
  ),
);

test('REFUSED: a link to an endpoint that streams, and a key the path, the query and the payload say twice', () => {
  const entry = { name: 'probe', usage: '', help: ['a probe'], class: 'read' as const };
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'server.feed' }] }], Api), /stream/);
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'probe.twice' as ApiEndpointName }] }], TWICE), /name/);
});

test('every list tool answers a Table, ls_run, a read of one, does not; inbox, closeout, try and decide send their narrowing defaults', () => {
  for (const list of ['ls', 'inbox', 'agents', 'skills', 'factory', 'factory_servers'])
    assert.equal(tool(list).table, true, `${list} answers a Table`);
  assert.equal(tool('ls_run').table, false);
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

/** The keys a tool's description says, each the word before a key line's first colon, read off the lines `keysSaid` writes. */
const keysSaidBy = (description: string, keys: readonly string[]) =>
  new Set(
    description
      .split('\n')
      .map((line) => line.split(':')[0] ?? '')
      .filter((key) => keys.includes(key)),
  );

/** Every key of a tool's input: its own, and each key of a member of its `anyOf`. */
const inputKeys = (input: (typeof TOOLS)[number]['inputSchema']) => [
  ...new Set([
    ...Object.keys(input.properties),
    ...(input.anyOf ?? []).flatMap((member) => Object.keys((member.properties ?? {}) as Record<string, unknown>)),
  ]),
];

test('every tool says every key of its input, with its words', () => {
  for (const each of TOOLS) {
    const keys = inputKeys(each.inputSchema);
    assert.deepEqual([...keysSaidBy(each.description, keys)].sort(), [...keys].sort(), `${each.name} says each key it takes`);
  }
});

test('inbox_add says its body keys, and agents_custom_put its path, query and body keys', () => {
  const inbox = tool('inbox_add');
  assert.deepEqual([...keysSaidBy(inbox.description, inputKeys(inbox.inputSchema))].sort(), [
    'body',
    'factory',
    'from',
    'label',
    'namespace',
    'repo',
    'workflow',
  ]);
  const put = tool('agents_custom_put');
  const said = keysSaidBy(put.description, inputKeys(put.inputSchema));
  for (const key of [...put.pathKeys, ...put.queryKeys, ...inputKeys(put.inputSchema)])
    assert.ok(said.has(key), `agents_custom_put says ${key}`);
  assert.ok(put.queryKeys.includes('repo'), 'agents_custom_put takes a query key');
});

const Weight = Schema.Struct({ grams: Schema.String }).annotate({ identifier: 'Weight', description: 'How heavy it is.' });
const PLANTED = HttpApi.make('planted').add(
  HttpApiGroup.make('probe').add(
    HttpApiEndpoint.post('weigh', '/api/probe/weigh', {
      payload: Schema.Struct({ weight: Weight }),
      success: Schema.Struct({}),
    }).annotate(OpenApi.Description, 'A probe.'),
    HttpApiEndpoint.post('either', '/api/probe/either', {
      payload: Schema.Union([
        Schema.Struct({ left: Schema.String.annotate({ description: 'The left way.' }) }),
        Schema.Struct({ right: Schema.String.annotate({ description: 'The right way.' }) }),
      ]),
      success: Schema.Struct({}),
    }).annotate(OpenApi.Description, 'A probe.'),
  ),
);

test('a key that is an identified schema whole is said by its words, and each member of a union payload by its own', () => {
  const entry = { usage: '', help: ['a probe'], class: 'read' as const };
  const [weigh, either] = portTools(
    [],
    [
      { ...entry, name: 'weigh', served: [{ endpoint: 'probe.weigh' as ApiEndpointName }] },
      { ...entry, name: 'either', served: [{ endpoint: 'probe.either' as ApiEndpointName }] },
    ],
    PLANTED,
  );
  assert.ok(weigh && either, 'both planted tools are served');
  assert.deepEqual([...keysSaidBy(weigh.description, ['weight'])], ['weight']);
  assert.deepEqual([...keysSaidBy(either.description, ['left', 'right'])].sort(), ['left', 'right']);
});

/** The description `name` carries on its endpoint (`OpenApi.Description`), read off the `Api` as the API page reads it. */
const saidOfEndpoint = (name: ApiEndpointName) => {
  const endpoint = ENDPOINTS.get(name);
  assert.ok(endpoint, `${name} is an endpoint of the Api`);
  const said = Context.getOption(endpoint.annotations, OpenApi.Description);
  assert.ok(Option.isSome(said), `${name} says what it does`);
  return said.value;
};

test("every tool says its endpoint's description as a paragraph of its own, after its verb's help and before its usage line", () => {
  const entries = new Map([...TABLE, ...CLI_VERBS].map((e) => [e.name, e] as const));
  for (const t of TOOLS) {
    const entry = entries.get(t.entry);
    assert.ok(entry, t.name);
    const lines = t.description.split('\n');
    const at = entry.help.length;
    assert.deepEqual(lines.slice(0, at), [...entry.help], `${t.name} opens with its verb's help`);
    assert.deepEqual(
      lines.slice(at, at + 3),
      ['', saidOfEndpoint(t.endpoint), ''],
      `${t.name} says ${t.endpoint}'s description between blank lines after the help`,
    );
    assert.ok(lines[at + 3]?.startsWith('nemia '), `${t.name}'s usage line follows the description`);
  }
});

test('a tool of an endpoint two tools link carries the sentence of its own endpoint', () => {
  assert.equal(tool('hold').endpoint, 'runs.hold');
  assert.equal(tool('unhold').endpoint, 'runs.unhold');
  assert.ok(tool('hold').description.includes(`\n\n${saidOfEndpoint('runs.hold')}\n\n`), "hold says runs.hold's sentence");
  assert.ok(tool('unhold').description.includes(`\n\n${saidOfEndpoint('runs.unhold')}\n\n`), "unhold says runs.unhold's sentence");
  assert.ok(!tool('hold').description.includes(saidOfEndpoint('runs.unhold')), "hold says not runs.unhold's sentence");
  for (const name of ['factory', 'factory_ls']) {
    assert.equal(tool(name).endpoint, 'factories.listAll', name);
    assert.ok(tool(name).description.includes(`\n\n${saidOfEndpoint('factories.listAll')}\n\n`), `${name} says factories.listAll's`);
  }
});

/** An api of one endpoint that says nothing of what it does. */
const UNSAID = HttpApi.make('unsaid').add(
  HttpApiGroup.make('probe').add(HttpApiEndpoint.get('mute', '/api/probe/mute', { success: Schema.Struct({}) })),
);

test('REFUSED: a link to an endpoint with no description, naming the endpoint', () => {
  const entry = { name: 'mute', usage: '', help: ['a probe'], class: 'read' as const };
  assert.throws(() => portTools([], [{ ...entry, served: [{ endpoint: 'probe.mute' as ApiEndpointName }] }], UNSAID), /probe\.mute/);
});

test("the port says nothing of a tool, nor of itself, beyond the words objects writes once for both of Nemia's seats", () => {
  const words = toolWordsOf(TABLE, CLI_VERBS, Api);
  assert.deepEqual(
    TOOLS.map((t) => [t.name, t.description]),
    words.map(({ verb, words: w }) => [w.name, toolDescriptionOf(verb, w)]),
  );
  assert.equal(PORT_INSTRUCTIONS, portInstructions());
});
