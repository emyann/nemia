/**
 * Where the api listens (`bindOf`, read off `NEMIA_BIND` and whether the store is marked exposed), proved by
 * `apps/api/contracts/bind.contract.ts`, read here at the values an operator types; the refusal it is thrown as (`hostOf`: exit 2, naming
 * the variable to set); and the address the lease records for a bind (`leaseHostOf`), which a client of the store reaches.
 */
import '../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledgedHost, bindOf, hostOf, isAddress, leaseHostOf, LOOPBACK } from './port.ts';

test('bindOf: unset or blank is the loopback, the loopback is bound, and another address only on a store marked exposed', () => {
  assert.deepEqual(bindOf(undefined, false), { kind: 'bound', host: LOOPBACK });
  assert.deepEqual(bindOf('  ', true), { kind: 'bound', host: LOOPBACK });
  assert.deepEqual(bindOf('127.0.0.1', false), { kind: 'bound', host: '127.0.0.1' });
  assert.deepEqual(bindOf('::1', false), { kind: 'bound', host: '::1' });
  assert.deepEqual(bindOf('100.64.0.1', false), { kind: 'refused', reason: 'unexposed' });
  assert.deepEqual(bindOf(' 100.64.0.1 ', true), { kind: 'bound', host: '100.64.0.1' });
  assert.deepEqual(bindOf('0.0.0.0', true), { kind: 'bound', host: '0.0.0.0' });
  assert.deepEqual(bindOf('0.0.0.0', false), { kind: 'refused', reason: 'unexposed' });
  assert.deepEqual(bindOf('::', true), { kind: 'bound', host: '::' });
  assert.deepEqual(bindOf('nope', true), { kind: 'refused', reason: 'not-an-address' });
  assert.deepEqual(bindOf('localhost', false), { kind: 'refused', reason: 'not-an-address' });
});

test('isAddress: an IP address of either family, and nothing else: a name, a port, a zone, a near miss', () => {
  for (const text of ['127.0.0.1', '100.64.0.1', '0.0.0.0', '::', '::1', 'fd7a:115c:a1e0::1', '::ffff:1.2.3.4'])
    assert.equal(isAddress(text), true, text);
  for (const text of [
    '',
    'nope',
    'localhost',
    '256.0.0.1',
    '01.0.0.1',
    '1.2.3',
    '[::1]',
    '127.0.0.1:8787',
    ':::',
    '1::2::3',
    'fe80::1%eth0',
    '::1]:80/[::1',
  ])
    assert.equal(isAddress(text), false, text);
});

test('REFUSED exit 2: a bind beyond the loopback on a store not marked exposed names WF_EXPOSED=1, one not an address names NEMIA_BIND', () => {
  const refusal = (value: string, exposed: boolean) => {
    try {
      hostOf(value, exposed);
    } catch (err) {
      return err as Error & { exitCode?: number };
    }
    assert.fail(`${value} was bound`);
  };
  const unexposed = refusal('100.64.0.1', false);
  assert.equal(unexposed.exitCode, 2);
  assert.match(unexposed.message, /WF_EXPOSED=1/);
  assert.match(unexposed.message, /NEMIA_BIND/);
  const notAnAddress = refusal('nope', true);
  assert.equal(notAnAddress.exitCode, 2);
  assert.match(notAnAddress.message, /NEMIA_BIND/);
  assert.equal(hostOf('100.64.0.1', true), '100.64.0.1', 'bound where exposed');
});

test('acknowledgedHost: a loopback, private or shared bind listens; a wildcard or public one only acknowledged, else refused exit 2', () => {
  for (const host of ['127.0.0.1', '::1', '10.0.0.4', '192.168.1.20', '100.64.0.1'])
    assert.equal(acknowledgedHost(host, false), host, `${host} listens unacknowledged`);
  for (const host of ['0.0.0.0', '::', '8.8.8.8']) {
    assert.equal(acknowledgedHost(host, true), host, `${host} listens acknowledged`);
    assert.throws(
      () => acknowledgedHost(host, false),
      (err: Error & { exitCode?: number }) => err.exitCode === 2,
      `${host} unacknowledged is refused with exit 2`,
    );
  }
});

test('leaseHostOf: a wildcard bind leases the loopback, an IPv6 address is bracketed, any other is itself', () => {
  assert.equal(`http://${leaseHostOf('0.0.0.0')}:8787`, 'http://127.0.0.1:8787');
  assert.equal(leaseHostOf('::'), '127.0.0.1');
  assert.equal(leaseHostOf('127.0.0.1'), '127.0.0.1');
  assert.equal(leaseHostOf('100.64.0.1'), '100.64.0.1');
  assert.equal(leaseHostOf('::1'), '[::1]');
  assert.equal(leaseHostOf('fd7a:115c:a1e0::1'), '[fd7a:115c:a1e0::1]');
});
