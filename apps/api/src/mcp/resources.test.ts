/**
 * The feed's resources (resources.ts): one template per Event list of `objects`' `Api`, found here by reading the `Api` itself, so an
 * Event list added to it and not offered fails; which URIs name a view, and why the others name none; and a read past the bound left
 * a whole `EventList`, its oldest events out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema, SchemaAST } from 'effect';
import { Api, type Event, EventList } from 'objects';
import { FEED_TEMPLATES, readAnswer, viewOf } from './resources.ts';

/** Whether a success schema of the `Api` is an `EventList`, read off its AST: an object whose `kind` is the literal `EventList`. */
const isEventList = (ast: SchemaAST.AST): boolean => {
  if (!SchemaAST.isObjects(ast)) return false;
  const kind = ast.propertySignatures.find((p) => p.name === 'kind')?.type;
  return kind !== undefined && SchemaAST.isLiteral(kind) && kind.literal === 'EventList';
};

/** Every GET path of the `Api` that answers an `EventList`, read off it here, apart from the endpoints the port reads. */
const eventLists = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints))
  .filter((endpoint) => endpoint.method === 'GET' && [...endpoint.success].some((schema) => isEventList(schema.ast)))
  .map((endpoint) => endpoint.path);

test("a template for each Event list of the Api, and none for any other: the feed's own two, under nemia:///, taking labelSelector", () => {
  assert.deepEqual(
    FEED_TEMPLATES.map((t) => t.endpoint.path).sort((a, b) => a.localeCompare(b)),
    [...eventLists].sort((a, b) => a.localeCompare(b)),
    'one template per GET of the Api answering an EventList',
  );
  assert.deepEqual(
    [...eventLists].sort((a, b) => a.localeCompare(b)),
    ['/api/events', '/api/namespaces/:namespace/events'],
    'the Api lists the feed at its two paths',
  );
  assert.deepEqual(
    FEED_TEMPLATES.map((t) => t.uriTemplate).sort((a, b) => a.localeCompare(b)),
    ['nemia:///api/events{?labelSelector*}', 'nemia:///api/namespaces/{namespace}/events{?labelSelector*}'],
  );
  for (const t of FEED_TEMPLATES) assert.equal(t.mimeType, 'application/json', t.name);
});

test('a URI of the feed names its view: every event, one selector or several in order, a namespace', () => {
  for (const [uri, path, selectors] of [
    ['nemia:///api/events', '/api/events', []],
    ['nemia:///api/events?labelSelector=a&labelSelector=b', '/api/events', ['a', 'b']],
    ['nemia:///api/namespaces/x/events?labelSelector=run%3Dr-1', '/api/namespaces/x/events', ['run=r-1']],
  ] as const) {
    const named = viewOf(uri);
    assert.equal(named.kind, 'view', uri);
    if (named.kind !== 'view') continue;
    assert.deepEqual(named.view, { uri, path, selectors: [...selectors] }, uri);
  }
});

test('REFUSED: another path, another query key, another scheme, a host, no URI at all; each answer names the templates', () => {
  for (const uri of [
    'nemia:///api/runs',
    'nemia:///api/events/12',
    'nemia:///api/events?limit=5',
    'nemia:///api/events?labelSelector=a&fieldSelector=b',
    'http:///api/events',
    'nemia://host/api/events',
    'not a uri',
  ]) {
    const named = viewOf(uri);
    assert.equal(named.kind, 'none', uri);
    if (named.kind !== 'none') continue;
    for (const t of FEED_TEMPLATES) assert.ok(named.message.includes(t.uriTemplate), `${uri}: the refusal names ${t.uriTemplate}`);
  }
});

/** An Event of the feed, its message `size` characters long, at byte `at`. */
const eventAt = (at: number, size: number): Event => ({
  apiVersion: 'nemia/v1',
  kind: 'Event',
  metadata: { name: String(at), creationTimestamp: '2026-11-12T10:00:00.000Z', resourceVersion: String(at + 1) },
  involved: { kind: 'Run', name: `r-${at}` },
  reason: 'Running',
  type: 'Normal',
  message: 'x'.repeat(size),
  source: 'tick',
});

test('a read within the bound answers every event; past it, the oldest left out, a whole EventList at its resourceVersion', () => {
  const events = [0, 1, 2, 3, 4].map((at) => eventAt(at, 1_000));
  const all = Schema.decodeUnknownSync(EventList)(JSON.parse(readAnswer(events, '99')));
  assert.equal(all.items.length, 5, 'within the bound, every event');
  assert.equal(all.metadata.resourceVersion, '99');
  const bound = 2_600;
  const text = readAnswer(events, '99', bound);
  assert.ok(text.length <= bound, `${text.length} characters, at most ${bound}`);
  const cut = Schema.decodeUnknownSync(EventList)(JSON.parse(text));
  assert.ok(cut.items.length > 0 && cut.items.length < 5, `${cut.items.length} events kept`);
  assert.deepEqual(
    cut.items.map((e) => e.metadata.name),
    events.slice(5 - cut.items.length).map((e) => e.metadata.name),
    'the newest kept, the oldest left out',
  );
});
