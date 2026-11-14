/**
 * What the served objects say of their own fields: each property of each schema the api's document holds (`OpenApi.fromApi(Api)`, the
 * document a client, the reference page and the MCP port's tools read) carries a `description`, set on its Schema
 * (`.annotate({ description })`), since a comment above a Schema reaches none of them. The properties still said nowhere are counted
 * per schema in `described.baseline.json`, which only shrinks: a schema with more than its count is refused, one the baseline does
 * not name owes none, and a count above today's is refused too, so a change that describes a field lowers its count in the same
 * commit. Today's counts, as the baseline's text: `node test/described.test.ts --print`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OpenApi } from 'effect/http-api';
import { Api } from 'objects';

const BASELINE = 'packages/objects/test/described.baseline.json';

/** A property of a schema, as far as this reads it: its own description, or the schema it is, whole, by reference. */
type Property = { readonly description?: string; readonly $ref?: string };

/** A schema of the document, as far as this reads it: what it says of itself, and its properties. */
type Component = { readonly description?: string; readonly properties?: Readonly<Record<string, Property | boolean>> };

/**
 * Whether a property says what it is: by its own description, or, where it is another schema whole (a bare `$ref`, on which the
 * document keeps no word of its own), by that schema's.
 */
const described = (property: Property | boolean, schemas: Readonly<Record<string, Component>>): boolean => {
  if (typeof property !== 'object') return false;
  if (property.description?.trim()) return true;
  const referred = property.$ref === undefined ? undefined : schemas[property.$ref.split('/').at(-1) ?? ''];
  return Boolean(referred?.description?.trim());
};

/** How many properties of each schema among `schemas` carry no description: a schema with none owed is left out. */
export const undescribed = (schemas: Readonly<Record<string, Component>>): Record<string, number> =>
  Object.fromEntries(
    Object.entries(schemas)
      .map(([name, schema]) => {
        const owed = Object.values(schema.properties ?? {}).filter((p) => !described(p, schemas)).length;
        return [name, owed] as const;
      })
      .filter(([, owed]) => owed > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/** What today's counts and `baseline` disagree on, each a sentence naming the fix. */
export const breaks = (today: Readonly<Record<string, number>>, baseline: Readonly<Record<string, number>>): string[] => [
  ...Object.entries(today)
    .filter(([name, owed]) => owed > (baseline[name] ?? 0))
    .map(
      ([name, owed]) =>
        `${name} has ${owed} propert${owed === 1 ? 'y' : 'ies'} with no description, and ${BASELINE} allows ${baseline[name] ?? 0}: ` +
        'say what each is on its Schema, `.annotate({ description: "…" })`, as a client reads the schema alone; never raise the count',
    ),
  ...Object.entries(baseline)
    .filter(([name, held]) => held > (today[name] ?? 0))
    .map(([name, held]) => `${name} owes ${today[name] ?? 0} now, and ${BASELINE} holds ${held}: lower it there, which only shrinks`),
];

const today = (): Record<string, number> => undescribed(OpenApi.fromApi(Api).components?.schemas ?? {});

if (process.argv.includes('--print')) process.stdout.write(`${JSON.stringify(today(), null, 2)}\n`);
else {
  test('every property of a served object is described, but those the baseline counts, which only shrinks', () => {
    const baseline = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'described.baseline.json'), 'utf8')) as Record<
      string,
      number
    >;
    assert.deepEqual(breaks(today(), baseline), []);
  });

  test('REFUSED: a schema with a property said nowhere that the baseline does not count, and a count above what is owed', () => {
    const planted = {
      Parcel: { properties: { id: { description: 'Its id.' }, weight: {}, lost: { description: ' ' } } },
      Kept: { properties: {} },
    };
    assert.deepEqual(undescribed(planted), { Parcel: 2 });
    const referred = {
      Parcel: { properties: { owner: { $ref: '#/components/schemas/Owner' }, carrier: { $ref: '#/components/schemas/Carrier' } } },
      Owner: { description: 'Who it belongs to.', properties: {} },
      Carrier: { properties: {} },
    };
    assert.deepEqual(undescribed(referred), { Parcel: 1 }, 'a property that is another schema whole is said by that schema');
    assert.equal(breaks({ Parcel: 2 }, {}).length, 1, 'a schema the baseline does not name');
    assert.equal(breaks({ Parcel: 2 }, { Parcel: 1 }).length, 1, 'more than its count');
    assert.equal(breaks({ Parcel: 2 }, { Parcel: 2 }).length, 0);
    assert.equal(breaks({ Parcel: 1 }, { Parcel: 2 }).length, 1, 'a count above what is owed');
    assert.equal(breaks({}, { Parcel: 2 }).length, 1, 'a count for a schema that owes none');
  });
}
