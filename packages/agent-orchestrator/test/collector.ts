/**
 * A scratch OTLP collector on loopback for a test that exports (`collector`), and what a body posted to its `/v1/metrics` says of the
 * series it names (`seriesOf`).
 */
import type { TestContext } from 'node:test';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A collector that answers every post with `{}` and keeps it, by path (`posts`), closed after the test: its address (`url`), and a wait
 * for the first post to `path` whose body has `word` (`posted`).
 */
export async function collector(t: TestContext) {
  const posts: { path: string; body: string }[] = [];
  const waiting: { path: string; word: string; found: (body: string) => void }[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
    req.on('end', () => {
      posts.push({ path: req.url ?? '', body });
      for (const w of waiting) if (w.path === req.url && body.includes(w.word)) w.found(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  t.after(() => new Promise<void>((closed) => server.close(() => closed())));
  const posted = (path: string, word: string) =>
    new Promise<string>((found) => {
      const had = posts.find((p) => p.path === path && p.body.includes(word));
      if (had) found(had.body);
      else waiting.push({ path, word, found });
    });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posted, posts };
}

/** A point's attributes as OTLP's JSON writes them. */
export type Attributes = { key: string; value: { stringValue?: string } }[];

type Point = { attributes: Attributes; asDouble?: number; asInt?: number; count?: number | string };
type Posted = {
  resourceMetrics: {
    scopeMetrics: { metrics: { name: string; sum?: { dataPoints: Point[] }; histogram?: { dataPoints: Point[] } }[] }[];
  }[];
};

/**
 * What a body posted to `/v1/metrics` says of the series whose attributes `which` keeps: each by its metric's name, and by
 * `name{key=value,…}` where it has attributes, with its value, a histogram's with its count.
 */
export const seriesOf = (body: string, which: (attributes: Attributes) => boolean, named = false): Record<string, number> =>
  Object.fromEntries(
    (JSON.parse(body) as Posted).resourceMetrics
      .flatMap((r) => r.scopeMetrics.flatMap((s) => s.metrics))
      .flatMap((m) =>
        [...(m.sum?.dataPoints ?? []), ...(m.histogram?.dataPoints ?? [])]
          .filter((p) => which(p.attributes))
          .map((p) => [named ? nameOf(m.name, p.attributes) : m.name, Number(p.asDouble ?? p.asInt ?? p.count)] as const),
      ),
  );

/** A series' name, `name{key=value,…}` where it has attributes. */
const nameOf = (name: string, attributes: Attributes): string =>
  attributes.length ? `${name}{${attributes.map((a) => `${a.key}=${a.value.stringValue ?? ''}`).join(',')}}` : name;
