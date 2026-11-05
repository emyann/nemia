/**
 * The laws of a namespace's list (`definitionsServed`), which tsverify decides none of today, held here over every list it can be handed
 * up to a size: each of two names at each of the four origins, every order of up to four of those, and every origin asked or none. The
 * per-name decider (`definitionServed`) and the lookup order (`heldOrigins`) are proved, in `contracts/definition-served.contract.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definitionsServed, type DefinitionFound, type DefinitionListed, type DefinitionOrigin } from './served.ts';

const LOOKUP: readonly DefinitionOrigin[] = ['factory', 'repo', 'yours', 'builtin'];
const NAMES = ['a', 'b'];
const ITEMS: DefinitionFound[] = NAMES.flatMap((name) => LOOKUP.map((origin) => ({ name, origin })));
const MOST = 4;

/** Every list of up to `most` distinct items of `items`, in every order. */
function listsOf(items: readonly DefinitionFound[], most: number): DefinitionFound[][] {
  const out: DefinitionFound[][] = [[]];
  const grow = (list: DefinitionFound[]) => {
    if (list.length === most) return;
    for (const item of items)
      if (!list.includes(item)) {
        const next = [...list, item];
        out.push(next);
        grow(next);
      }
  };
  grow([]);
  return out;
}

const holds = (found: readonly DefinitionFound[], name: string, origin: DefinitionOrigin) =>
  found.some((f) => f.name === name && f.origin === origin);
const firstHolder = (found: readonly DefinitionFound[], name: string) => LOOKUP.find((o) => holds(found, name, o));

/** Each law of the list, by its name, as a predicate of what was found, the origin asked and what was served. */
const LAWS: Record<string, (found: readonly DefinitionFound[], asked: DefinitionOrigin | undefined, out: DefinitionListed[]) => boolean> = {
  servedWereFound: (found, _asked, out) => out.every((s) => holds(found, s.name, s.origin)),
  eachNameOnce: (_found, _asked, out) => out.every((s, i) => out.slice(0, i).every((t) => t.name !== s.name)),
  inTheOrderFound: (found, _asked, out) => {
    const firsts = found.map((f) => f.name).filter((name, i, all) => all.indexOf(name) === i);
    return out.every((s, i) => i === 0 || firsts.indexOf(out[i - 1]?.name ?? '') < firsts.indexOf(s.name));
  },
  firstOriginWins: (found, asked, out) =>
    asked !== undefined || found.every((f) => out.some((s) => s.name === f.name && s.origin === firstHolder(found, f.name))),
  originAskedAlone: (found, asked, out) =>
    asked === undefined ||
    (out.every((s) => s.origin === asked) && found.every((f) => f.origin !== asked || out.some((s) => s.name === f.name))),
  shadowedByTheFirst: (found, _asked, out) =>
    out.every((s) => s.shadowedBy === (firstHolder(found, s.name) === s.origin ? null : (firstHolder(found, s.name) ?? null))),
};

test('a namespace lists each name found once, in the order found, its first origin or the one asked, shadowed by the first', () => {
  const lists = listsOf(ITEMS, MOST);
  assert.ok(lists.length > 1000, `every list of up to ${MOST} of ${ITEMS.length} definitions, in every order: ${lists.length}`);
  for (const found of lists)
    for (const asked of [undefined, ...LOOKUP]) {
      const out = definitionsServed(found, asked);
      for (const [law, holdsOf] of Object.entries(LAWS))
        assert.ok(holdsOf(found, asked, out), `${law} broken by ${JSON.stringify({ found, asked })}: served ${JSON.stringify(out)}`);
    }
});

test('REFUSED: a list that serves a name twice, or one not found, breaks its law', () => {
  const found: DefinitionFound[] = [
    { name: 'a', origin: 'repo' },
    { name: 'a', origin: 'yours' },
  ];
  const twice: DefinitionListed[] = [
    { name: 'a', origin: 'repo', shadowedBy: null },
    { name: 'a', origin: 'yours', shadowedBy: 'repo' },
  ];
  assert.equal(LAWS.eachNameOnce?.(found, undefined, twice), false, 'a name served twice');
  assert.equal(LAWS.servedWereFound?.(found, undefined, [{ name: 'a', origin: 'builtin', shadowedBy: 'repo' }]), false, 'one not found');
  assert.equal(LAWS.firstOriginWins?.(found, undefined, [{ name: 'a', origin: 'yours', shadowedBy: 'repo' }]), false, 'not the first');
});
