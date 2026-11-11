/**
 * What a remote agent's client says of another party's content, bounded: the address of a request that did not answer, whose path
 * a served card chose, and a missing secret's fix, which names a scheme the card chose. The card's own refusals are `card.test.ts`'s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentCard } from '@a2a-js/sdk';
import { WORDS_QUOTE } from '../core/index.ts';
import { authOf, MISSING_QUOTE, shownUrl } from './remote-client.ts';

const flood = 'k'.repeat(10_000);

/** A card that asks for a bearer token under the scheme `name`. */
const cardAsking = (name: string): AgentCard =>
  AgentCard.fromJSON({
    supportedInterfaces: [{ url: 'https://a.example/a2a', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    securitySchemes: { [name]: { httpAuthSecurityScheme: { scheme: 'Bearer' } } },
    securityRequirements: [{ schemes: { [name]: { list: [] } } }],
  });

/** Each row: what was shown, and the most characters it may be. */
const ROWS: Array<{ name: string; got: () => string; most: number }> = [
  {
    name: 'an address whose path a card served at 10,000 characters is shown with that path quoted, and never its query',
    got: () => shownUrl(`https://a.example/${flood}?key=secret`),
    most: 'https://a.example'.length + WORDS_QUOTE + 1,
  },
  {
    name: "a missing secret for a scheme a card named at 10,000 characters is refused in the caller's fix, quoted",
    got: () => {
      const auth = authOf(
        cardAsking(flood),
        'https://a.example',
        'remote',
        () => undefined,
        (scheme) => `set ${scheme} and retry`,
      );
      return 'refusal' in auth ? auth.refusal : '';
    },
    most: 2 * MISSING_QUOTE,
  },
];

test('the remote client: an address and a missing secret are said with what another party chose quoted', async (t) => {
  for (const row of ROWS) {
    await t.test(row.name, () => {
      const got = row.got();
      assert.ok(got.length > 0, 'something is said');
      assert.ok(got.length <= row.most, `${got.length} characters`);
      assert.ok(!got.includes('key=secret'), 'the query is never shown');
    });
  }
});
