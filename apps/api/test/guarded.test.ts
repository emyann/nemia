/**
 * Every write of `objects`' `Api` meets the write guard before its handler runs (`writeGuard`, src/guard.ts), read off the `Api` itself:
 * each endpoint but a GET, asked by a page on another site, answers 403 with `Forbidden`'s reason `site`; addressed to another host, 403
 * with `host`; and sent `text/plain`, a body any page can send without asking, 415. Each is asked with names no object has, so the handler,
 * had it run, would answer its own 404 or 400: the status says the guard answered. Which request meets which refusal, and in what order,
 * is `writeRefused`'s contract (`apps/api/contracts/write-guard.contract.ts`); this file holds that every write is behind it.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Api } from 'objects';
import { app } from '../src/app.ts';

/** Every endpoint of the `Api` that writes: each but a GET. */
const WRITES = Object.values(Api.groups)
  .flatMap((group) => Object.values(group.endpoints).map((e) => ({ at: `${group.identifier}.${e.name}`, method: e.method, path: e.path })))
  .filter((e) => e.method !== 'GET');

/** `path` with every name filled in by one no object has. */
const filled = (path: string): string => path.replace(/:[A-Za-z]+/g, 'nothing-here');

/** What `method` on `path` answers with `headers`, a JSON `{}` body but where `headers` says otherwise: its status and its body. */
const asked = async (method: string, path: string, headers: Record<string, string>) => {
  const res = await app.request(filled(path), { method, headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  return { status: res.status, body: (await res.json()) as { error?: string; reason?: string } };
};

test('every write of the Api is refused before its handler runs: 403 for another site or another host, 415 for a body not JSON', async () => {
  assert.ok(WRITES.length >= 40, `${WRITES.length} writes read off the Api`);
  const open: string[] = [];
  for (const { at, method, path } of WRITES) {
    const site = await asked(method, path, { 'sec-fetch-site': 'cross-site' });
    if (site.status !== 403 || site.body.reason !== 'site') open.push(`${at}: another site answered ${site.status}`);
    const host = await asked(method, path, { host: 'evil.example' });
    if (host.status !== 403 || host.body.reason !== 'host') open.push(`${at}: another host answered ${host.status}`);
    const media = await asked(method, path, { 'content-type': 'text/plain;charset=UTF-8' });
    if (media.status !== 415 || typeof media.body.error !== 'string') open.push(`${at}: text/plain answered ${media.status}`);
  }
  assert.deepEqual(open, []);
});

test('a read is never refused by the guard, from another site or another host', async () => {
  for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { host: 'evil.example' }])
    assert.equal((await app.request('/api/cards', { headers })).status, 200, JSON.stringify(headers));
});
