/**
 * A remote agent's card as it enters (`cardOfJson` in `a2a/card.ts`): decoded strictly in the fields the runtime reads, kept
 * whole in the rest, and refused in words that name the first wrong field. Pure, so each rule is a card here; a card served
 * or configured on a real engine is `test/remote-agent.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentCard } from '@a2a-js/sdk';
import { cardOfJson } from './card.ts';

const INTERFACE = { url: 'https://a.example/a2a/jsonrpc', protocolBinding: 'JSONRPC', protocolVersion: '1.0' };

const WIRE = {
  name: 'reviewer',
  supportedInterfaces: [INTERFACE],
  securitySchemes: {
    bearer: { httpAuthSecurityScheme: { scheme: 'Bearer' } },
    key: { apiKeySecurityScheme: { location: 'header', name: 'X-Key' } },
  },
  securityRequirements: [{ schemes: { bearer: {} } }, { schemes: { key: { list: [] } } }],
};

const taken = (json: unknown): AgentCard => {
  const read = cardOfJson(json);
  assert.ok('card' in read, 'wrong' in read ? read.wrong : '');
  return read.card;
};

const wrong = (json: unknown): string => {
  const read = cardOfJson(json);
  assert.ok('wrong' in read, `${JSON.stringify(json)} was taken`);
  return read.wrong;
};

test('cardOfJson: a card is taken with what it declares, kept whole beyond the fields the runtime reads, and refused naming its first wrong field', async (t) => {
  await t.test('a card in A2A 1.0 JSON is read with its schemes and requirements as it declares them', () => {
    const card = taken(WIRE);
    assert.equal(card.name, 'reviewer');
    assert.deepEqual(card.supportedInterfaces, [{ ...INTERFACE, tenant: '' }]);
    assert.equal(card.securitySchemes.bearer?.scheme?.$case, 'httpAuthSecurityScheme');
    assert.equal(card.securitySchemes.key?.scheme?.$case, 'apiKeySecurityScheme');
    assert.deepEqual(
      card.securityRequirements.map((r) => Object.keys(r.schemes)),
      [['bearer'], ['key']],
    );
  });

  await t.test("a card served as the SDK's own objects keeps its schemes whole", () => {
    const sdk = JSON.parse(JSON.stringify(AgentCard.fromJSON(WIRE))) as Record<string, unknown>;
    const card = taken(sdk);
    assert.deepEqual(card.securitySchemes.bearer?.scheme, {
      $case: 'httpAuthSecurityScheme',
      value: { description: '', scheme: 'Bearer', bearerFormat: '' },
    });
    assert.equal(card.securitySchemes.key?.scheme?.$case, 'apiKeySecurityScheme');
  });

  await t.test(
    'a card with nothing but an interface is taken, whatever else A2A asks of it, and a key the runtime does not read is kept',
    () => {
      assert.deepEqual(taken({ supportedInterfaces: [INTERFACE] }).supportedInterfaces, [{ ...INTERFACE, tenant: '' }]);
      const card = taken({ supportedInterfaces: [INTERFACE], 'x-vendor': { a: 1 }, name: 'kept' });
      assert.equal(card.name, 'kept');
    },
  );

  await t.test('a scheme of a kind A2A 1.0 does not define is kept, in either form, as a scheme of no kind the runtime sends', () => {
    const wire = taken({ ...WIRE, securitySchemes: { future: { futureScheme: { flow: 'x' } } } });
    assert.ok('future' in wire.securitySchemes);
    assert.equal(wire.securitySchemes.future?.scheme, undefined);
    const sdk = taken({ ...WIRE, securitySchemes: { future: { scheme: { $case: 'futureScheme', value: {} } } } });
    assert.equal((sdk.securitySchemes.future?.scheme as { $case: string } | undefined)?.$case, 'futureScheme');
  });

  await t.test('a card the runtime cannot read is refused, naming its first wrong field and what is there instead', () => {
    const card = (fields: Record<string, unknown>) => ({ supportedInterfaces: [INTERFACE], ...fields });
    const cases: Array<[unknown, RegExp]> = [
      [{ name: 'no interface' }, /^its `supportedInterfaces` is missing$/],
      [{ supportedInterfaces: [] }, /^its `supportedInterfaces` is \[\], where an A2A 1\.0 card holds at least one interface$/],
      [{ supportedInterfaces: 'x' }, /^its `supportedInterfaces` is "x", where an A2A 1\.0 card holds array$/],
      [
        { supportedInterfaces: [{ url: 3, protocolBinding: 'JSONRPC' }] },
        /^its `supportedInterfaces\.0\.url` is 3, where an A2A 1\.0 card holds string$/,
      ],
      [{ supportedInterfaces: [{ url: 'https://a.example' }] }, /^its `supportedInterfaces\.0\.protocolBinding` is missing$/],
      [{ supportedInterfaces: [{ ...INTERFACE, protocolVersion: 1 }] }, /^its `supportedInterfaces\.0\.protocolVersion` is 1, where/],
      [
        card({ securitySchemes: { bearer: { httpAuthSecurityScheme: {} } } }),
        /^its `securitySchemes\.bearer\.httpAuthSecurityScheme\.scheme` is missing$/,
      ],
      [
        card({ securitySchemes: { key: { apiKeySecurityScheme: { location: 1, name: 'X-Key' } } } }),
        /^its `securitySchemes\.key\.apiKeySecurityScheme\.location` is 1, where/,
      ],
      [
        card({ securitySchemes: { bearer: { scheme: { $case: 'httpAuthSecurityScheme', value: {} } } } }),
        /^its `securitySchemes\.bearer\.scheme\.value\.scheme` is missing$/,
      ],
      [card({ securitySchemes: 'bearer' }), /^its `securitySchemes` is "bearer", where/],
      [
        card({ securityRequirements: { schemes: {} } }),
        /^its `securityRequirements` is \{"schemes":\{\}\}, where an A2A 1\.0 card holds array$/,
      ],
      [card({ securityRequirements: [{ schemes: 'bearer' }] }), /^its `securityRequirements\.0\.schemes` is "bearer", where/],
      [
        card({ securityRequirements: [{ schemes: { bearer: { list: ['a', 2] } } }] }),
        /^its `securityRequirements\.0\.schemes\.bearer\.list\.1` is 2, where/,
      ],
      [[INTERFACE], /^it is \[\{"url":"https:\/\/a\.example\/a2a\/jsonrpc","protocolBinding":"J…, where an A2A 1\.0 card holds object$/],
    ];
    for (const [json, said] of cases) assert.match(wrong(json), said, JSON.stringify(json));
  });

  await t.test('a field the runtime reads, spelled in snake_case, is refused, naming the camelCase key to write', () => {
    const cases: Array<[unknown, RegExp]> = [
      [
        { supported_interfaces: [INTERFACE] },
        /^its `supportedInterfaces` is missing, and `supported_interfaces` is there: write `supportedInterfaces`, as A2A's JSON does$/,
      ],
      [
        { supportedInterfaces: [INTERFACE], supported_interfaces: [INTERFACE] },
        /^its `supportedInterfaces` is also written `supported_interfaces`: write `supportedInterfaces` alone, as A2A's JSON does$/,
      ],
      [
        { supportedInterfaces: [{ url: 'https://a.example', protocol_binding: 'JSONRPC' }] },
        /^its `supportedInterfaces\.0\.protocolBinding` is missing, and `protocol_binding` is there: write `protocolBinding`/,
      ],
      [
        { supportedInterfaces: [{ ...INTERFACE, protocol_version: '1.0' }] },
        /^its `supportedInterfaces\.0\.protocolVersion` is also written `protocol_version`/,
      ],
      [
        { supportedInterfaces: [INTERFACE], security_schemes: {} },
        /^its `securitySchemes` is written `security_schemes`: write `securitySchemes`, as A2A's JSON does$/,
      ],
      [{ supportedInterfaces: [INTERFACE], security_requirements: [] }, /^its `securityRequirements` is written `security_requirements`/],
      [
        { supportedInterfaces: [INTERFACE], securitySchemes: { b: { http_auth_security_scheme: { scheme: 'Bearer' } } } },
        /^its `securitySchemes\.b\.httpAuthSecurityScheme` is written `http_auth_security_scheme`: write `httpAuthSecurityScheme`, as A2A's JSON does$/,
      ],
    ];
    for (const [json, said] of cases) assert.match(wrong(json), said, JSON.stringify(json));
  });
});
