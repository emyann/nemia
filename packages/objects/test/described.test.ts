/**
 * What the served objects say of their own fields: each field the api's document holds (`OpenApi.fromApi(Api)`, the document a client,
 * the reference page and the MCP port's tools read) carries a `description`, set on its Schema (`.annotate({ description })`), since a
 * comment above a Schema reaches none of them. A field is a property of a schema, at any depth: a component's, an inline request
 * body's or answer's, one nested under another property, under an array's `items` or `prefixItems`, a record's
 * `additionalProperties` or a branch of an `anyOf`, `oneOf` or `allOf`; and an operation's path or query parameter. A field that is
 * another schema whole (a bare `$ref`) is said by that schema's description, and counted under that schema's name. The fields still
 * said nowhere are counted per component, by its name, and per operation, by its `operationId`, in `described.baseline.json`, which
 * only shrinks: a key with more than its count is refused, one the baseline does not name owes none, and a count above today's is
 * refused too, so a change that describes a field lowers its count in the same commit. Today's counts, as the baseline's text: `node
 * test/described.test.ts --print`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OpenApi } from 'effect/http-api';
import { Api } from 'objects';

const BASELINE = 'packages/objects/test/described.baseline.json';

/** A schema of the document, as far as this reads it: what it says of itself, the schema it is by reference, and what it holds. */
type Node = {
  readonly description?: string;
  readonly $ref?: string;
  readonly properties?: Readonly<Record<string, Node | boolean>>;
  readonly items?: Node | boolean;
  readonly prefixItems?: readonly (Node | boolean)[];
  readonly additionalProperties?: Node | boolean;
  readonly anyOf?: readonly (Node | boolean)[];
  readonly oneOf?: readonly (Node | boolean)[];
  readonly allOf?: readonly (Node | boolean)[];
};

/** A parameter of an operation, as far as this reads it: its own description, and its schema, which may carry one instead. */
type Parameter = { readonly description?: string; readonly schema?: Node };

/** A media type's content, as far as this reads it: its schema, never effect's `x-effect-stream` beside it. */
type Content = Readonly<Record<string, { readonly schema?: Node }>>;

/** An operation of the document, as far as this reads it. */
type Operation = {
  readonly operationId?: string;
  readonly parameters?: readonly Parameter[];
  readonly requestBody?: { readonly content?: Content };
  readonly responses?: Readonly<Record<string, { readonly content?: Content }>>;
};

/** The document, as far as this reads it: its operations by path and method, and its components. */
export type Document = {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, Operation>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, Node>> };
};

/**
 * Whether a field says what it is: by its own description, or, where it is another schema whole (a bare `$ref`, on which the document
 * keeps no word of its own), by that schema's.
 */
const described = (field: Node | boolean | undefined, schemas: Readonly<Record<string, Node>>) => {
  if (typeof field !== 'object') return false;
  if (field.description?.trim()) return true;
  const referred = field.$ref === undefined ? undefined : schemas[field.$ref.split('/').at(-1) ?? ''];
  return Boolean(referred?.description?.trim());
};

/** The schemas a node holds that are no field of their own: an array's items, a record's values, a union's branches. */
const held = (node: Node) =>
  [
    node.items,
    ...(node.prefixItems ?? []),
    node.additionalProperties,
    ...(node.anyOf ?? []),
    ...(node.oneOf ?? []),
    ...(node.allOf ?? []),
  ] satisfies (Node | boolean | undefined)[];

/** How many fields under `node`, at any depth, say nothing: a `$ref` is counted under its component, never walked into here. */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
const owedUnder = (node: Node | boolean | undefined, schemas: Readonly<Record<string, Node>>): number => {
  if (typeof node !== 'object' || node.$ref !== undefined) return 0;
  const fields = Object.values(node.properties ?? {});
  return (
    fields.filter((field) => !described(field, schemas)).length +
    [...fields, ...held(node)].reduce((sum: number, inner) => sum + owedUnder(inner, schemas), 0)
  );
};

/** How many fields of an operation say nothing: its parameters, and the fields of its inline request body and answers. */
const owedBy = (operation: Operation, schemas: Readonly<Record<string, Node>>) => {
  const parameters = (operation.parameters ?? []).filter(
    (parameter) => !parameter.description?.trim() && !described(parameter.schema, schemas),
  ).length;
  const contents = [operation.requestBody?.content, ...Object.values(operation.responses ?? {}).map((answer) => answer.content)];
  const bodies = contents.flatMap((content) => Object.values(content ?? {}).map((media) => media.schema));
  return parameters + bodies.reduce((sum: number, body) => sum + owedUnder(body, schemas), 0);
};

/**
 * How many fields of `document` carry no description, per component by its name and per operation by its `operationId`: a key with
 * none owed is left out.
 * @param document The api's document, `OpenApi.fromApi(Api)`, or a planted one.
 */
export const undescribed = (document: Document) => {
  const schemas = document.components?.schemas ?? {};
  const operations = Object.values(document.paths ?? {}).flatMap((methods) => Object.values(methods));
  return Object.fromEntries(
    [
      ...Object.entries(schemas).map(([name, schema]) => [name, owedUnder(schema, schemas)] as const),
      ...operations.map((operation) => [operation.operationId ?? '?', owedBy(operation, schemas)] as const),
    ]
      .filter(([, owed]) => owed > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  ) satisfies Record<string, number>;
};

/**
 * What today's counts and `baseline` disagree on, each a sentence naming the fix.
 * @param today The counts of the document as it is, from `undescribed`.
 * @param baseline The counts `described.baseline.json` holds.
 */
export const breaks = (today: Readonly<Record<string, number>>, baseline: Readonly<Record<string, number>>) =>
  [
    ...Object.entries(today)
      .filter(([name, owed]) => owed > (baseline[name] ?? 0))
      .map(
        ([name, owed]) =>
          `${name} has ${owed} field${owed === 1 ? '' : 's'} with no description, and ${BASELINE} allows ${baseline[name] ?? 0}: ` +
          'say what each is on its Schema, `.annotate({ description: "…" })`, as a client reads the schema alone; never raise the count',
      ),
    ...Object.entries(baseline)
      .filter(([name, kept]) => kept > (today[name] ?? 0))
      .map(([name, kept]) => `${name} owes ${today[name] ?? 0} now, and ${BASELINE} holds ${kept}: lower it there, which only shrinks`),
  ] satisfies string[];

const today = () => undescribed(OpenApi.fromApi(Api) as Document) satisfies Record<string, number>;

if (process.argv.includes('--print')) process.stdout.write(`${JSON.stringify(today(), null, 2)}\n`);
else {
  test('every field of the api is described, but those the baseline counts, which only shrinks', () => {
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
    assert.deepEqual(undescribed({ components: { schemas: planted } }), { Parcel: 2 });
    const referred = {
      Parcel: { properties: { owner: { $ref: '#/components/schemas/Owner' }, carrier: { $ref: '#/components/schemas/Carrier' } } },
      Owner: { description: 'Who it belongs to.', properties: {} },
      Carrier: { properties: {} },
    };
    assert.deepEqual(undescribed({ components: { schemas: referred } }), { Parcel: 1 }, 'a property that is another schema whole');
    assert.equal(breaks({ Parcel: 2 }, {}).length, 1, 'a schema the baseline does not name');
    assert.equal(breaks({ Parcel: 2 }, { Parcel: 1 }).length, 1, 'more than its count');
    assert.equal(breaks({ Parcel: 2 }, { Parcel: 2 }).length, 0);
    assert.equal(breaks({ Parcel: 1 }, { Parcel: 2 }).length, 1, 'a count above what is owed');
    assert.equal(breaks({}, { Parcel: 2 }).length, 1, 'a count for a schema that owes none');
    assert.equal(breaks({ 'parcels.send': 1 }, {}).length, 1, 'an operation the baseline does not name');
  });

  const schemas = {
    Owner: { description: 'Who it belongs to.', properties: {} },
    Carrier: { properties: { name: {} } },
  };
  const said = { description: 'Said.' };
  const owner = { $ref: '#/components/schemas/Owner' };
  const carrier = { $ref: '#/components/schemas/Carrier' };
  const nested = (inner: Node) => ({ description: 'Holds.', properties: { inner } }) satisfies Node;
  const operation = (op: Operation) => ({ paths: { '/parcels': { post: { operationId: 'parcels.send', ...op } } } }) satisfies Document;
  const body = (schema: Node) => ({ requestBody: { content: { 'application/json': { schema } } } }) satisfies Operation;
  const answer = (schema: Node) => ({ responses: { '200': { content: { 'application/json': { schema } } } } }) satisfies Operation;
  const cases: readonly { readonly kind: string; readonly bare: Document; readonly said: readonly Document[] }[] = [
    {
      kind: 'a path parameter',
      bare: operation({ parameters: [{ schema: { type: 'string' } as Node }] }),
      said: [operation({ parameters: [{ description: 'Said.' }] }), operation({ parameters: [{ schema: said }] })],
    },
    {
      kind: 'a query parameter',
      bare: operation({ parameters: [{}] }),
      said: [operation({ parameters: [{ schema: owner }] })],
    },
    {
      kind: 'an inline request body',
      bare: operation(body({ properties: { weight: {} } })),
      said: [operation(body({ properties: { weight: said } })), operation(body({ properties: { owner } }))],
    },
    {
      kind: 'an inline answer',
      bare: operation(answer({ properties: { weight: {} } })),
      said: [operation(answer({ properties: { weight: said } })), operation(answer({ properties: { owner } }))],
    },
    {
      kind: 'a nested property',
      bare: { components: { schemas: { Parcel: { properties: { box: nested({}) } } } } },
      said: [
        { components: { schemas: { Parcel: { properties: { box: nested(said) } } } } },
        { components: { schemas: { Parcel: { properties: { box: nested(owner) } } } } },
      ],
    },
    {
      kind: "an array's items",
      bare: operation(answer({ properties: { boxes: { description: 'Boxes.', items: { properties: { weight: {} } } } } })),
      said: [operation(answer({ properties: { boxes: { description: 'Boxes.', items: { properties: { weight: said } } } } }))],
    },
    {
      kind: 'a branch of a union',
      bare: operation(body({ anyOf: [owner, { oneOf: [{ properties: { weight: {} } }] }] })),
      said: [operation(body({ anyOf: [owner, { oneOf: [{ properties: { weight: said } }] }] }))],
    },
    {
      kind: "a record's values",
      bare: operation(body({ additionalProperties: { properties: { weight: {} } } })),
      said: [operation(body({ additionalProperties: { properties: { weight: owner } } }))],
    },
  ];
  for (const planted of cases)
    test(`REFUSED: ${planted.kind} said nowhere is counted; one described or a bare $ref to a described schema is not`, () => {
      const count = (document: Document) =>
        undescribed({ ...document, components: { schemas: { ...schemas, ...document.components?.schemas } } }) satisfies Record<
          string,
          number
        >;
      assert.equal(
        Object.values(count(planted.bare)).reduce((a, b) => a + b, 0),
        2,
        'the planted field, beside the one Carrier owes',
      );
      for (const document of planted.said) assert.deepEqual(count(document), { Carrier: 1 });
    });

  test('REFUSED: a $ref to a schema said nowhere is counted, and walked into only under its own name', () => {
    assert.deepEqual(undescribed({ ...operation(body({ properties: { carrier } })), components: { schemas } }), {
      Carrier: 1,
      'parcels.send': 1,
    });
  });

  test("an array's element, a union's branch and effect's stream schema ask nothing of themselves", () => {
    const streamed: Document = {
      paths: {
        '/feed': {
          get: {
            operationId: 'feed.read',
            responses: {
              '200': {
                content: {
                  'text/event-stream': {
                    schema: { items: { type: 'string' } as Node },
                    'x-effect-stream': { properties: { cause: {} } },
                  } as never,
                },
              },
            },
          },
        },
      },
    };
    assert.deepEqual(undescribed(streamed), {});
  });
}
