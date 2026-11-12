/**
 * The command line forwarded to another machine's api, as the table holds it: every key an entry's input says reaches the endpoint the
 * link it calls names — its path, its query or its payload — where the link sends the input as it is (`unsentOf`), so no word a person
 * typed is dropped on the way; which link an input calls (`linkOf`); how a request is split (`partsOf`); and where the environment
 * forwards it (`forwardedOf`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { CLI_VERBS } from './command.ts';
import { TABLE } from './commands.verb.ts';
import { forwardedOf, linkOf, partsOf, refusalOfStatus, unsentOf } from './forward.verb.ts';
import { Api, endpointKeysOf } from 'objects';

/** The entries a command line runs, so forwards: every one but those the api alone serves, which no line reaches. */
const RUN_HERE = [...TABLE.filter((c) => c.only?.side !== 'api'), ...CLI_VERBS];

test('every key of an entry linked with no request reaches the endpoint the link calls: its path, its query or its payload', () => {
  const unsent = RUN_HERE.flatMap(unsentOf);
  assert.deepEqual(
    unsent.map((u) => `${u.entry} -> ${u.endpoint}: ${u.keys.join(', ')}`),
    [],
    'give the link a request that maps the input to the keys its endpoint takes',
  );
});

test('REFUSED: an entry whose input says runId, linked with no request to an endpoint whose path says name, as the key it drops', () => {
  const input = Schema.Struct({ runId: Schema.String });
  const planted = { name: 'cancel planted', input, served: [{ endpoint: 'runs.cancel' }] } as const;
  assert.deepEqual(unsentOf(planted), [{ entry: 'cancel planted', endpoint: 'runs.cancel', keys: ['runId'] }]);
  const mapped = { ...planted, served: [{ endpoint: 'runs.cancel', request: () => null as never }] } as const;
  assert.deepEqual(unsentOf(mapped), []);
});

test('an input calls the first link whose takes holds, else the last', () => {
  const links = [
    { endpoint: 'runs.hold', takes: (i: Readonly<Record<string, unknown>>) => i.off !== true },
    { endpoint: 'runs.unhold', as: 'unhold' },
  ] as const;
  assert.equal(linkOf(links, {}).endpoint, 'runs.hold');
  assert.equal(linkOf(links, { off: true }).endpoint, 'runs.unhold');
});

test("a request is split by where its endpoint takes each key, a link's query default sent where the request gives none", () => {
  const keys = endpointKeysOf(Api, 'steps.try');
  assert.deepEqual(partsOf(keys, { runId: 'r', step: 's', try: 2, unknown: 'x' }, { fields: '' }), {
    params: { runId: 'r', step: 's', try: 2 },
    query: { fields: '' },
    payload: {},
  });
  assert.deepEqual(partsOf(keys, { runId: 'r', step: 's', try: 2, fields: 'a' }, { fields: '' }).query, { fields: 'a' });
});

test('the environment forwards the command line where NEMIA_SERVER names a daemon, and not where it is unset or empty', () => {
  assert.equal(forwardedOf({}), undefined);
  assert.equal(forwardedOf({ NEMIA_SERVER: '' }), undefined);
  assert.deepEqual(forwardedOf({ NEMIA_SERVER: 'http://host:8787/', NEMIA_SERVER_TOKEN: 't' }), { server: 'http://host:8787', token: 't' });
  assert.deepEqual(forwardedOf({ NEMIA_SERVER: 'http://host:8787' }), { server: 'http://host:8787', token: undefined });
});

test("an answered status is the package's refusal of its kind, exit 2, as the api's map answers it", () => {
  const kinds = [400, 401, 403, 404, 409, 422].map((status) => refusalOfStatus(status, 'w'));
  assert.deepEqual(
    kinds.map((k) => k?._tag),
    ['Invalid', 'Forbidden', 'Forbidden', 'Missing', 'Conflict', 'Invalid'],
  );
  for (const k of kinds) assert.equal(k?.exitCode, 2);
  assert.equal(refusalOfStatus(500, 'w'), undefined);
});
