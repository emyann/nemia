/**
 * `nemia explain <resource>[.<field>]...`, as `kubectl explain` answers: the resource resolved among those discovery lists (`GET /api`),
 * its kind, version, scope and verbs; its fields read off the package's own OpenAPI document (`OpenApi.fromApi(Api)`, the call the api's
 * document is made by, so this client explains the shape it decodes and sends with), the kind's component flattened into rows
 * (`fieldRowsOf`, resolving each `$ref`), and the field asked for and the fields under it picked by `explained`
 * (`contracts/explain.contract.ts`). A path the kind has no field at is refused, exit 2, naming the fields there are.
 */
import { OpenApi } from 'effect/http-api';
import { API_VERSION, Api, type Kind } from 'objects';
import type { ExplainedOf, FieldRow } from '../../contracts/explain.contract.ts';
import { discovered, resourceFor } from '../objects.ts';
import { Refused } from '../refused.ts';

/** The field at `path` and the fields directly under it, or a refusal where the kind has none there (`contracts/explain.contract.ts`). */
export const explained: ExplainedOf = (rows, path) => {
  const field = rows.find((r) => r.path === path);
  if (path !== '' && field === undefined) return { refused: 'no-field' };
  return { field: path === '' ? null : (field ?? null), fields: rows.filter((r) => r.parent === path) };
};

export const EXPLAIN_HELP = `nemia explain <resource>[.<field>]...

Say what a resource the api serves is: its kind, version, scope and verbs, and its fields, each with its type and what it means; or
one field and the fields under it (nemia explain card.spec.from). The resources are those discovery lists (GET /api).
`;

/** A part of the OpenAPI document, as this walk reads it. */
type Node = { readonly [key: string]: unknown };

const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The document's components, each a kind's or a part's Schema by its name. */
const schemasOf = (): Node => {
  const components: unknown = OpenApi.fromApi(Api).components;
  return isNode(components) && isNode(components.schemas) ? components.schemas : {};
};

/** `node` with its `$ref` followed into `schemas`, as many times as it takes. */
function resolved(node: Node, schemas: Node, seen: ReadonlySet<string> = new Set()): Node {
  const ref = node.$ref;
  if (typeof ref !== 'string') return node;
  const name = ref.split('/').at(-1) ?? '';
  const target = schemas[name];
  if (seen.has(name) || !isNode(target)) return {};
  return resolved(target, schemas, new Set([...seen, name]));
}

/** The members of a union `node` is, where it is one. */
const membersOf = (node: Node): Node[] | undefined =>
  Array.isArray(node.anyOf) ? node.anyOf.filter(isNode) : Array.isArray(node.oneOf) ? node.oneOf.filter(isNode) : undefined;

/** The type `node` says, as `kubectl explain` writes one: `string`, `[]string`, `map[string]string`, `Object`, `a | b`. */
function typeOf(raw: Node, schemas: Node): string {
  const node = resolved(raw, schemas);
  const union = membersOf(node);
  if (union !== undefined) return [...new Set(union.map((n) => typeOf(n, schemas)))].join(' | ');
  if (node.type === 'array') return `[]${isNode(node.items) ? typeOf(node.items, schemas) : 'Object'}`;
  if (node.type === 'object' || isNode(node.properties)) {
    if (!isNode(node.properties) && isNode(node.additionalProperties)) return `map[string]${typeOf(node.additionalProperties, schemas)}`;
    return 'Object';
  }
  if (Array.isArray(node.type)) return node.type.filter((t) => typeof t === 'string').join(' | ');
  return typeof node.type === 'string' ? node.type : 'Object';
}

/** The object `node` holds, past an array's items and a union of one object, where its fields are. */
function fieldsNode(raw: Node, schemas: Node): Node | undefined {
  const node = resolved(raw, schemas);
  if (isNode(node.properties)) return node;
  if (node.type === 'array' && isNode(node.items)) return fieldsNode(node.items, schemas);
  const objects = (membersOf(node) ?? []).map((n) => fieldsNode(n, schemas)).filter((n): n is Node => n !== undefined);
  return objects.length === 1 ? objects[0] : undefined;
}

/** Every field of `node`, under `parent`, and every field under each, as rows, to `depth` levels at most. */
function rowsUnder(node: Node, parent: string, schemas: Node, depth: number): FieldRow[] {
  const object = fieldsNode(node, schemas);
  if (object === undefined || depth === 0 || !isNode(object.properties)) return [];
  const required = Array.isArray(object.required) ? object.required : [];
  return Object.entries(object.properties).flatMap(([key, raw]) => {
    if (!isNode(raw)) return [];
    const path = parent === '' ? key : `${parent}.${key}`;
    const said = typeof raw.description === 'string' ? raw.description : resolved(raw, schemas).description;
    const row: FieldRow = {
      path,
      parent,
      type: typeOf(raw, schemas),
      description: typeof said === 'string' ? said : null,
      required: required.includes(key),
    };
    return [row, ...rowsUnder(raw, path, schemas, depth - 1)];
  });
}

/** The fields of `kind`'s object as rows, flattened from its component in the package's own OpenAPI document. */
export function fieldRowsOf(kind: Kind): FieldRow[] {
  const schemas = schemasOf();
  const component = schemas[kind];
  return isNode(component) ? rowsUnder(component, '', schemas, 12) : [];
}

/** A description, indented under its heading. */
const indented = (text: string, by: string): string[] => text.split('\n').map((line) => `${by}${line}`.trimEnd());

/** A field's own name: the last word of its path. */
const leaf = (row: FieldRow): string => row.path.split('.').at(-1) ?? row.path;

/** One field as FIELDS lists it: its name, its type, whether it is required, and its description under it. */
const fieldLines = (row: FieldRow): string[] => [
  `  ${leaf(row)}\t<${row.type}>${row.required ? ' -required-' : ''}`,
  ...(row.description === null ? [] : indented(row.description, '    ')),
];

export async function explain(args: readonly string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(EXPLAIN_HELP);
    return 0;
  }
  const [typed, ...more] = args;
  if (typed === undefined || typed.startsWith('-') || more.length)
    throw new Refused('nemia explain: name one resource, and a field of it where you ask one: `nemia explain <resource>[.<field>]...`');
  const [word = '', ...fields] = typed.split('.');
  const resource = resourceFor('explain', await discovered('explain'), word);
  const rows = fieldRowsOf(resource.kind);
  const path = fields.join('.');
  const answer = explained(rows, path);
  if ('refused' in answer) {
    const known = fields.slice(0, -1).join('.');
    const at = rows.some((r) => r.path === known) ? known : '';
    const names = rows.filter((r) => r.parent === at).map(leaf);
    throw new Refused(
      `nemia explain: a ${resource.kind} has no field ${path}. The fields there are ${names.join(', ') || 'none'}: see them with \`nemia explain ${[resource.singularName, ...(at === '' ? [] : [at])].join('.')}\``,
    );
  }
  const scope = resource.namespaced ? 'namespaced' : 'cluster';
  const field = answer.field;
  const lines = [
    `KIND:       ${resource.kind}`,
    `VERSION:    ${API_VERSION}`,
    `RESOURCE:   ${resource.name} (${scope}; verbs: ${resource.verbs.join(', ')})`,
    '',
    ...(field === null
      ? []
      : [`FIELD:      ${leaf(field)} <${field.type}>`, '', 'DESCRIPTION:', ...indented(field.description ?? '<empty>', '    '), '']),
    ...(answer.fields.length ? ['FIELDS:', ...answer.fields.flatMap(fieldLines)] : []),
  ];
  for (const line of lines) process.stdout.write(`${line}\n`);
  return 0;
}
