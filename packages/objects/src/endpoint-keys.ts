/**
 * Where a call's input goes on an endpoint of an `HttpApi`, read off its Schemas: the keys of its path, of its query (all but `watch`,
 * which turns an answer into a stream) and of its JSON payload, whether its payload is a form of parts instead, its method and path, and
 * whether it answers a stream. One reading for
 * every caller that joins an endpoint's parts into one input and splits it again: the api's MCP port. Pure, over the Schemas.
 */
import { Schema } from 'effect';
import { HttpApiSchema } from 'effect/http-api';

/** An endpoint of an `HttpApi`, as it is read by reflection: its parts' Schemas. */
export type EndpointShape = {
  readonly identifier: string;
  readonly method: string;
  readonly path: string;
  readonly params: Schema.Top | undefined;
  readonly query: Schema.Top | undefined;
  readonly payload: ReadonlyMap<string, { readonly schemas: readonly Schema.Top[] }>;
  readonly success: ReadonlySet<Schema.Top>;
};

/** An `HttpApi`, as it is read by reflection: its groups, each its endpoints. */
export type ApiShape = {
  readonly groups: Readonly<Record<string, { readonly identifier: string; readonly endpoints: Readonly<Record<string, EndpointShape>> }>>;
};

/** Where an endpoint takes a call's input, and how it answers. */
export type EndpointKeys = {
  readonly method: string;
  readonly path: string;
  readonly pathKeys: readonly string[];
  readonly queryKeys: readonly string[];
  readonly payloadKeys: readonly string[];
  readonly form: boolean;
  readonly streams: boolean;
};

/** The query key a call never takes: a watch answers a stream. */
export const UNTAKEN_QUERY: readonly string[] = ['watch'];

/** Whether `value` is an object of string keys. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** `schema`, a JSON Schema, with a root `$ref` into `definitions` taken to what it refers to. */
function resolved(schema: Readonly<Record<string, unknown>>, definitions: Readonly<Record<string, unknown>>) {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return schema;
  const target = definitions[ref.slice('#/$defs/'.length)];
  return isRecord(target) ? target : schema;
}

/** The keys of `schema`'s object, each member's where it is a union of objects; none where it is no object. */
function keysOf(schema: Schema.Top | undefined) {
  if (schema === undefined) return [];
  const doc = Schema.toJsonSchemaDocument(schema);
  const root = resolved(doc.schema, doc.definitions);
  const anyOf = root.anyOf ?? root.oneOf;
  const members = Array.isArray(anyOf) ? anyOf.filter(isRecord).map((m) => resolved(m, doc.definitions)) : [root];
  return [...new Set(members.flatMap((m) => (isRecord(m.properties) ? Object.keys(m.properties) : [])))];
}

/** Whether `schema` is sent as a form of parts (`multipart/form-data`), as HttpApi marks a multipart payload, buffered or streamed. */
const formOf = (schema: Schema.Top) => {
  const encoding: unknown = schema.ast.annotations?.['~httpApiEncoding'];
  return isRecord(encoding) && encoding._tag === 'Multipart';
};

/**
 * Whether `schema`, or the one it carries headers on, is a stream of server-sent events.
 * @param schema An endpoint's success schema.
 */
export const streamsOf = (schema: Schema.Top) => {
  const inner: object = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema;
  return '_tag' in inner && inner._tag === 'StreamSse';
};

/**
 * Where `endpoint` takes a call's input, and whether it answers a stream.
 * @param endpoint The endpoint, as the Api declares it.
 */
export function keysOfEndpoint(endpoint: EndpointShape) {
  return {
    method: endpoint.method,
    path: endpoint.path,
    pathKeys: keysOf(endpoint.params),
    queryKeys: keysOf(endpoint.query).filter((k) => !UNTAKEN_QUERY.includes(k)),
    payloadKeys: [...new Set([...endpoint.payload.values()].flatMap((p) => p.schemas).flatMap((s) => keysOf(s)))],
    form: [...endpoint.payload.values()].flatMap((p) => p.schemas).some(formOf),
    streams: [...endpoint.success].some(streamsOf),
  };
}

/**
 * The endpoint `<group>.<endpoint>` of `api`, or none where it declares no such endpoint.
 * @param api The Api whose groups are searched.
 * @param name The endpoint's group and name, joined by a dot.
 */
export function endpointOf(api: ApiShape, name: string) {
  const dot = name.indexOf('.');
  const group = Object.values(api.groups).find((g) => g.identifier === name.slice(0, dot));
  return group === undefined ? undefined : Object.values(group.endpoints).find((e) => e.identifier === name.slice(dot + 1));
}

/**
 * Where the endpoint `<group>.<endpoint>` of `api` takes a call's input; thrown where `api` declares none of that name.
 * @param api The Api whose groups are searched.
 * @param name The endpoint's group and name, joined by a dot.
 */
export function endpointKeysOf(api: ApiShape, name: string) {
  const endpoint = endpointOf(api, name);
  if (endpoint === undefined) throw new Error(`${name} is no endpoint of the Api: name one it declares, as <group>.<endpoint>`);
  return keysOfEndpoint(endpoint);
}
