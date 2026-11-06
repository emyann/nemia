/**
 * The durable half of the measurement of SSE under HttpApi (its numbers and verdict in docs/, named in apps/api/CLAUDE.md): the
 * watch's events served by an HttpApi endpoint whose success is `HttpApiSchema.StreamSse({ data: watchEventOf(WatchedObject) })`
 * frame byte for byte as the Hono route writes them (`frameOf`, watch.ts), so moving the watch under HttpApi changes no client; an
 * abort of the HttpApi stream ends its fiber; and `OpenApi.fromApi` documents the endpoint's answer as `text/event-stream`.
 */
import '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer, Stream } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from 'effect/http-api';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { API_VERSION, WatchedObject, watchEventOf } from 'objects';
import { frameOf } from './watch.ts';

const WatchEvent = watchEventOf(WatchedObject);

const card = (name: string) => ({
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: { name, namespace: 'default', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: '1' },
  spec: { body: `Do ${name}.` },
});

const events: (typeof WatchEvent.Type)[] = [
  { type: 'ADDED', object: card('a') },
  { type: 'ADDED', object: card('b') },
  { type: 'BOOKMARK', object: { apiVersion: API_VERSION, kind: 'Card', metadata: { resourceVersion: '42' } } },
  { type: 'MODIFIED', object: card('a') },
  { type: 'DELETED', object: card('b') },
];

/** An HttpApi serving `stream` as the watch's events, and what it hands its handler's fiber ends to. */
const sseApi = (stream: () => Stream.Stream<typeof WatchEvent.Type>) => {
  const Api = HttpApi.make('watch').add(
    HttpApiGroup.make('watch').add(HttpApiEndpoint.get('watch', '/watch', { success: HttpApiSchema.StreamSse({ data: WatchEvent }) })),
  );
  const handlers = HttpApiBuilder.group(Api, 'watch', (h) => h.handle('watch', () => Effect.succeed(stream())));
  const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(Api).pipe(Layer.provide(handlers), Layer.provide(HttpServer.layerServices)), {
    disableLogger: true,
  });
  return { Api, web };
};

/** The same events as the Hono route writes them. */
const hono = new Hono().get('/watch', (c) =>
  streamSSE(c, async (stream) => {
    for (const event of events) await stream.writeSSE(frameOf(event));
  }),
);

test('HttpApi StreamSse({ data }) frames the watch events byte for byte as the Hono route does', async () => {
  const { web } = sseApi(() => Stream.fromIterable(events));
  const fromHttpApi = await web.handler(new Request('http://x/watch'));
  const fromHono = await hono.request('/watch');
  assert.match(fromHttpApi.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(await fromHttpApi.text(), await fromHono.text());
  await web.dispose();
});

test('an abort of the HttpApi stream ends its fiber', async () => {
  let end = (): void => undefined;
  const ended = new Promise<void>((resolve) => (end = resolve));
  const { web } = sseApi(() =>
    Stream.concat(Stream.fromIterable(events.slice(0, 1)), Stream.never).pipe(Stream.ensuring(Effect.sync(() => end()))),
  );
  const gone = new AbortController();
  const res = await web.handler(new Request('http://x/watch', { signal: gone.signal }));
  const reader = res.body?.getReader();
  assert.ok(reader);
  await reader.read();
  gone.abort();
  await reader.cancel().catch(() => undefined);
  await ended;
  await web.dispose();
});

test('OpenApi.fromApi documents the StreamSse answer as text/event-stream', () => {
  const { Api } = sseApi(() => Stream.empty);
  const doc = OpenApi.fromApi(Api);
  const answer = doc.paths['/watch']?.get?.responses?.['200'];
  assert.ok(answer && 'content' in answer && answer.content && 'text/event-stream' in answer.content, JSON.stringify(answer));
});
