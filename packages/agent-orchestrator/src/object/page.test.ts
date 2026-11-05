/**
 * A list's page as the door cuts it (`pageOf`, page.ts): what the laws of `listPage` (contracts/list-page.contract.ts) leave to the door —
 * the `continue` token, the base64url of the last name answered, read back to that name, and refused `Invalid` where it does not decode;
 * and where a page starts when the object the token names is gone, the first name after it, so no object is skipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Invalid } from '../refusal/refusal.ts';
import { continueToken, continuedAfter, pageOf, type Paged } from './page.ts';

const names = ['a', 'b', 'c', 'd', 'e'];
const same = (n: string): string => n;

/** The refusal's kind an answer is, or `ok`. */
const kindOf = (answer: unknown): string => (answer instanceof Invalid ? answer._tag : 'ok');

/** What an answer holds, failing the test where it is a refusal. */
const ok = <A>(answer: A | Invalid): A => {
  if (answer instanceof Invalid) assert.fail(`refused ${answer._tag}`);
  return answer;
};
const page = (sorted: readonly string[], asked: Parameters<typeof pageOf>[2]): Paged<string> => ok(pageOf(sorted, same, asked));

test('a token reads back to the name it was made of, a name of any letters included', () => {
  for (const name of ['a', 'cache-the-views-k2q9', 'é/ü?+=']) assert.equal(ok(continuedAfter(continueToken(name))), name);
  assert.match(continueToken('a?b/c+d'), /^[A-Za-z0-9_-]*$/);
});

test('five names walked by limit 2 answer each once in order, 3, 1 and 0 left, and no continue on the last', () => {
  const seen: string[] = [];
  const left: number[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    const cut = page(names, { limit: 2, continue: token });
    seen.push(...cut.items);
    left.push(cut.remainingItemCount);
    token = cut.continue;
    pages += 1;
  } while (token !== undefined && pages < 10);
  assert.deepEqual(seen, names);
  assert.deepEqual(left, [3, 1, 0]);
});

test('no limit answers the whole rest after the token', () => {
  const rest = page(names, { limit: null, continue: continueToken('b') });
  assert.deepEqual(rest.items, ['c', 'd', 'e']);
  assert.equal(rest.remainingItemCount, 0);
  assert.equal(rest.continue, undefined);
});

test('an object dropped between two pages is not skipped: the next page starts at the first name after the token', () => {
  const first = page(names, { limit: 2 });
  assert.deepEqual(first.items, ['a', 'b']);
  const next = page(['a', 'c', 'd', 'e'], { limit: 2, continue: first.continue });
  assert.deepEqual(next.items, ['c', 'd']);
});

test('REFUSED: a limit of 0, below 0 or no whole number, and a continue that is not a token, each Invalid', () => {
  for (const limit of [0, -1, 1.5, Number.NaN]) assert.equal(kindOf(pageOf(names, same, { limit })), 'Invalid', `limit ${limit}`);
  for (const token of ['not a token', 'YQ=', '%%', 'Y', '_w']) assert.equal(kindOf(continuedAfter(token)), 'Invalid', token);
  assert.equal(kindOf(pageOf(names, same, { limit: 2, continue: '!!' })), 'Invalid');
  assert.equal(kindOf(pageOf(names, same, { limit: 2 })), 'ok');
});
