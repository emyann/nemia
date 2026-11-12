/**
 * A bind's text parsed and told by its kind (`addressParsed`, `kindOfBind`, src/service/address.ts) — the ranges are the contract's,
 * proved by tsverify; this table holds the parse of the texts a person types — and this machine's addresses listed with theirs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressParsed, kindOfBind, machineAddresses } from './address.ts';

test('a bind text is told by its kind, a name or a malformed text the safe side', async (t) => {
  const rows: readonly [string, string][] = [
    ['127.0.0.1', 'loopback'],
    ['localhost', 'loopback'],
    ['::1', 'loopback'],
    ['[::1]', 'loopback'],
    ['0.0.0.0', 'wildcard'],
    ['::', 'wildcard'],
    ['192.168.1.20', 'private'],
    ['172.31.0.1', 'private'],
    ['172.32.0.1', 'public'],
    ['100.100.1.2', 'shared'],
    ['169.254.3.4', 'link-local'],
    ['fe80::1%eth0', 'link-local'],
    ['fd7a:115c:a1e0::1', 'unique-local'],
    ['::ffff:10.0.0.1', 'public'],
    ['203.0.113.9', 'public'],
    ['my-server.example', 'public'],
    ['256.1.1.1', 'public'],
    ['1::2::3', 'public'],
  ];
  for (const [text, kind] of rows) await t.test(text, () => assert.equal(kindOfBind(text), kind));
});

test('a text that is no address parses to nothing; an IPv6 text to its eight groups', () => {
  assert.equal(addressParsed('example.com'), undefined);
  assert.equal(addressParsed('1.2.3'), undefined);
  assert.deepEqual(addressParsed('fe80::1'), { v: 6, groups: [0xfe80, 0, 0, 0, 0, 0, 0, 1] });
});

test("this machine's addresses come with their kinds, loopback first", () => {
  const listed = machineAddresses({
    eth0: [{ address: '192.168.1.20', family: 'IPv4' }],
    lo: [{ address: '127.0.0.1', family: 'IPv4' }],
  });
  assert.deepEqual(
    listed.map((a) => [a.interface, a.kind]),
    [
      ['lo', 'loopback'],
      ['eth0', 'private'],
    ],
  );
});
