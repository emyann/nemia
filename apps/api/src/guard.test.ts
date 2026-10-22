/**
 * The guard on the board's writes, read as the pure function it is (`refusedBeforeReading`): the near misses of each of its three
 * headers, which the walk over every writing route (`src/commands/routes.test.ts`) reads one value of. The walk owns the enumeration
 * of routes, from the command table; this file owns the values of a header. A refusal's words are nobody's to check (root
 * CLAUDE.md), so each case says the status alone.
 */
import '../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusedBeforeReading, type Guarded } from './guard.ts';

/** A write as its refusals say it: the words stand for any route's. */
const WRITE: Guarded = {
  route: 'POST /api/runs',
  does: 'starts a run',
  forAnother: 'start one',
  why: 'a run acts on this repository',
  reach: 'start it with `nemia start`',
  instead: 'Start it from the board',
  shape: '`{ "workflow": "<name>" }`',
};

/** `refusedBeforeReading` over `WRITE`, as the board sends a write but for what each case names. */
const refused = (host: string | undefined, site: string | undefined, type: string | undefined) =>
  refusedBeforeReading(WRITE, host, site, type);

test('a write the board sends is refused on none of the three: JSON, same-origin, and this machine under any of its names and ports', () => {
  for (const host of [undefined, 'localhost', 'localhost:8787', '127.0.0.1', '127.0.0.1:8787', '[::1]', '[::1]:8787', ' localhost '])
    assert.equal(refused(host, 'same-origin', 'application/json'), null, String(host));
  for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', ' application/json '])
    assert.equal(refused('127.0.0.1:8787', 'same-origin', type), null, type);
  assert.equal(refused('127.0.0.1:8787', undefined, 'application/json'), null, 'a client outside a browser sends no Sec-Fetch-Site');
});

test('REFUSED 403: a name that is not this machine — another site, a site whose name points here, a port of one, and an address of this machine on the network', () => {
  for (const host of ['evil.example', 'evil.example:8787', 'localhost.evil.example:8787', '172.23.196.168:8787', '127.0.0.1.evil.example'])
    assert.deepEqual(refused(host, 'same-origin', 'application/json')?.status, 403, host);
});

test('REFUSED 403: a page on another site — anything the browser says but same-origin, another port on localhost included', () => {
  for (const site of ['cross-site', 'same-site', 'none', 'Same-Origin'])
    assert.deepEqual(refused('127.0.0.1:8787', site, 'application/json')?.status, 403, site);
});

test("REFUSED 415: a body not sent as application/json — what a page's fetch sends, a form's, a multipart's, a near miss, and none at all", () => {
  for (const type of [
    'text/plain;charset=UTF-8',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=x',
    'application/jsonp',
    'application/json+x',
    undefined,
    '',
  ])
    assert.deepEqual(refused('127.0.0.1:8787', 'same-origin', type)?.status, 415, String(type));
});

test('the name is read before the site, and the site before the body: a request wrong in all three is refused on its name', () => {
  assert.equal(refused('evil.example', 'cross-site', 'text/plain')?.status, 403);
  assert.equal(refused('evil.example', 'cross-site', 'text/plain')?.error.includes('addressed to evil.example'), true);
  assert.equal(refused('127.0.0.1', 'cross-site', 'text/plain')?.error.includes('another site'), true);
});
