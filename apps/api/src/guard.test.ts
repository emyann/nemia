/**
 * The guard on every write, read as the pure function it is (`writeRefused`): the near misses of each of its three headers. Which
 * refusal a request meets, and in what order, is the contract's (`apps/api/contracts/write-guard.contract.ts`), proved; which spellings
 * of a name or a media type the two patterns take (`loopback`, `saysJson`), which the contract declares and does not read, is held here.
 * The middleware that applies it to every write is held by `test/guarded.test.ts`, over every endpoint of the `Api`.
 */
import '../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeRefused } from './guard.ts';

/** `writeRefused` of a POST, as the board sends a write but for what each case names. */
const refused = (host: string | undefined, site: string | undefined, type: string | undefined) =>
  writeRefused({ method: 'POST', host, site, contentType: type });

test('writeRefused: which of its three headers refuses a write, and in what order', async (t) => {
  await t.test(
    'a write the board sends is refused on none of the three: JSON, same-origin, and this machine under any of its names and ports',
    () => {
      for (const host of [undefined, 'localhost', 'localhost:8787', '127.0.0.1', '127.0.0.1:8787', '[::1]', '[::1]:8787', ' localhost '])
        assert.equal(refused(host, 'same-origin', 'application/json'), null, String(host));
      for (const type of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', ' application/json '])
        assert.equal(refused('127.0.0.1:8787', 'same-origin', type), null, type);
      assert.equal(refused('127.0.0.1:8787', undefined, 'application/json'), null, 'a client outside a browser sends no Sec-Fetch-Site');
    },
  );

  await t.test(
    'REFUSED 403: a name that is not this machine — another site, a site whose name points here, a port of one, and an address of this machine on the network',
    () => {
      for (const host of [
        'evil.example',
        'evil.example:8787',
        'localhost.evil.example:8787',
        '172.23.196.168:8787',
        '127.0.0.1.evil.example',
      ])
        assert.equal(refused(host, 'same-origin', 'application/json'), 'host', host);
    },
  );

  await t.test(
    'REFUSED 403: a page on another site — anything the browser says but same-origin, another port on localhost included',
    () => {
      for (const site of ['cross-site', 'same-site', 'none', 'Same-Origin'])
        assert.equal(refused('127.0.0.1:8787', site, 'application/json'), 'site', site);
    },
  );

  await t.test(
    "REFUSED 415: a body not sent as application/json — what a page's fetch sends, a form's, a multipart's, a near miss, and none at all",
    () => {
      for (const type of [
        'text/plain;charset=UTF-8',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=x',
        'application/jsonp',
        'application/json+x',
        undefined,
        '',
      ])
        assert.equal(refused('127.0.0.1:8787', 'same-origin', type), 'media', String(type));
    },
  );

  await t.test(
    'the name is read before the site, and the site before the body: a request wrong in all three is refused on its name, and a read on none',
    () => {
      assert.equal(refused('evil.example', 'cross-site', 'text/plain'), 'host');
      assert.equal(refused('127.0.0.1', 'cross-site', 'text/plain'), 'site');
      for (const method of ['GET', 'HEAD'])
        assert.equal(writeRefused({ method, host: 'evil.example', site: 'cross-site', contentType: undefined }), null, method);
    },
  );
});
