/**
 * The daemon made ready before a read asks it (`daemon.ts`): a probe of `GET /api/health` tells a daemon that answers (any status), one
 * that took the connection and is silent, and none listening; a start's readiness is polled until the daemon answers, bounded, never a
 * read retried after a refused connection; a lease whose port takes no connection, with the start off, is refused naming `nemia up`.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { probe, readyAt, served } from '../src/daemon.ts';
import { Refused } from '../src/refused.ts';

/** A port free on loopback now, which nothing listens on. */
const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

const answering = http.createServer((_req, res) => {
  res.writeHead(404);
  res.end();
});
const silent = http.createServer(() => {});
for (const server of [answering, silent]) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
after(() => {
  for (const server of [answering, silent]) {
    server.closeAllConnections();
    server.close();
  }
});
const urlOf = (server: http.Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

test('a probe tells a daemon that answers, even a 404, from one silent on the connection and from none listening', async () => {
  assert.equal(await probe(urlOf(answering)), 'answers');
  assert.equal(await probe(urlOf(silent)), 'silent');
  assert.equal(await probe(`http://127.0.0.1:${await freePort()}`), 'refused');
});

test('a start is waited for by its readiness: polled until the daemon at its url answers, and none where none answers in time', async () => {
  const port = await freePort();
  const late = http.createServer((_req, res) => res.end('{}'));
  setTimeout(() => late.listen(port, '127.0.0.1'), 300);
  try {
    assert.equal(await readyAt(() => `http://127.0.0.1:${port}`, 5_000), `http://127.0.0.1:${port}`, 'it waited for the daemon to listen');
  } finally {
    late.close();
  }
  const began = performance.now();
  assert.equal(await readyAt(() => `http://127.0.0.1:${port}`, 400), undefined);
  assert.ok(performance.now() - began >= 390, 'it polled to its bound');
  assert.equal(await readyAt(() => undefined, 200), undefined, 'no url yet is no daemon yet');
});

test('a lease whose daemon listens is served as it is; one whose port takes no connection, the start off, is refused naming nemia up', async () => {
  const root = path.join(scratch('nemia-ready-'), 'store');
  fs.mkdirSync(root, { recursive: true });
  const lease = (url: string) => fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url }));
  const env = { WF_ROOT: root, NEMIA_DAEMON_START: 'off' };
  lease(urlOf(silent));
  assert.equal(await served('ls', env), urlOf(silent), 'a silent daemon holds the port: the read is bounded, no other started');
  lease(`http://127.0.0.1:${await freePort()}`);
  await assert.rejects(served('ls', env), (err: unknown) => {
    assert.ok(err instanceof Refused, String(err));
    assert.equal(err.code, 2);
    assert.match(err.message, /`nemia up`/);
    assert.doesNotMatch(err.message, /--local/);
    return true;
  });
});
