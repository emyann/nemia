/**
 * The tools of the MCP port, generated, never listed by hand: one for each endpoint a verb of the command table links (`served`, read by
 * the package's `toolsOf`, which names it), described by the verb's help and its CLI usage, its input the JSON Schema of the endpoint's
 * path, query and payload joined into one object (`objects`' `Api`, read by reflection), its hints its verb's class and its endpoint's
 * method (`toolHints`), and what the port needs to call it: the endpoint's method and path, which keys of the input fill the path
 * and the query, whether the endpoint answers a `Table` (`objects`' server-side printing, which the port asks for and answers as its
 * lines), and the query values its link sends where a call gives none (`defaults`, the link's `query`). A link to a stream, a method that
 * is not a call, a key two of the three say, or a default for a key the query has not is thrown as the tools are built.
 */
import { Schema } from 'effect';
import { HttpApiSchema } from 'effect/http-api';
import { type CommandSpec, toolsOf } from 'agent-orchestrator';
import { type ApiEndpointName, Table } from 'objects';
import type { ToolHints, ToolMethod } from '../../contracts/tool-hints.contract.ts';
import { PORT_PAGE } from './bound.ts';
import { classWordOf, toolHints } from './hints.ts';

/** A verb of a table as the port reads it: its name, its usage and help, its class, and the endpoints it links. */
export type PortVerb = Pick<CommandSpec, 'name' | 'usage' | 'help' | 'class' | 'served'>;

/** An endpoint of an `Api`, as the port reads it off by reflection. */
type EndpointRead = {
  readonly identifier: string;
  readonly method: string;
  readonly path: string;
  readonly params: Schema.Top | undefined;
  readonly query: Schema.Top | undefined;
  readonly payload: ReadonlyMap<string, { readonly schemas: readonly Schema.Top[] }>;
  readonly success: ReadonlySet<Schema.Top>;
};

/** An `Api`, as the port reads it: its groups, each its endpoints. */
export type ApiRead = {
  readonly groups: Readonly<Record<string, { readonly identifier: string; readonly endpoints: Readonly<Record<string, EndpointRead>> }>>;
};

/** A JSON Schema, as `Schema.toJsonSchemaDocument` writes it. */
type JsonSchema = Readonly<Record<string, unknown>>;

/** A tool's input: a JSON Schema object, its keys, those it requires, and the definitions its keys refer to. */
export type ToolInput = {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly anyOf?: readonly JsonSchema[];
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
};

/** A tool of the port: what `tools/list` says of it, and what a call of it asks of the api. */
export type PortTool = {
  readonly name: string;
  readonly entry: string;
  readonly description: string;
  readonly inputSchema: ToolInput;
  readonly annotations: ToolHints;
  readonly endpoint: ApiEndpointName;
  readonly method: ToolMethod;
  readonly path: string;
  readonly pathKeys: readonly string[];
  readonly queryKeys: readonly string[];
  readonly table: boolean;
  readonly defaults: Readonly<Record<string, string>>;
};

/** The query key a call never takes: a watch answers a stream, and a tool's call answers once. */
const UNTAKEN_QUERY = ['watch'];

/** The methods a tool calls by: every one but those that answer no body to read. */
const METHODS: readonly ToolMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** `method` as a tool's, or thrown where it is none: the port reads an answer's body. */
const methodOf = (endpoint: string, method: string): ToolMethod => {
  const found = METHODS.find((m) => m === method);
  if (found === undefined)
    throw new Error(`${endpoint} answers ${method}, which no tool calls: link a GET, POST, PUT, PATCH or DELETE endpoint`);
  return found;
};

/** Whether `schema`, or the one it carries headers on, is a stream of server-sent events. */
const streams = (schema: Schema.Top): boolean => {
  const inner: object = HttpApiSchema.isWithHeaders(schema) ? schema.schema : schema;
  return '_tag' in inner && inner._tag === 'StreamSse';
};

/**
 * Whether a success of an endpoint is `objects`' `Table`, or a union holding it among its members: read through the schema the endpoint
 * carries it on (its status or headers), as `HttpApiEndpoint` keeps each success.
 */
const printsTable = (success: Schema.Top): boolean => {
  const schema: unknown = 'schema' in success ? success.schema : success;
  return (
    schema === Table ||
    ((typeof schema === 'object' || typeof schema === 'function') &&
      schema !== null &&
      'members' in schema &&
      Array.isArray(schema.members) &&
      schema.members.includes(Table))
  );
};

/** A JSON Schema's object part: its keys and those it requires, resolved through a root `$ref` into `definitions`. */
type ObjectPart = { readonly properties: Record<string, JsonSchema>; readonly required: readonly string[] };

/** Whether `value` is a record of JSON Schemas, as a document writes one. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** `schema` with a root `$ref` into `definitions` taken to what it refers to. */
function resolved(schema: JsonSchema, definitions: Readonly<Record<string, unknown>>): JsonSchema {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return schema;
  const target = definitions[ref.slice('#/$defs/'.length)];
  return isRecord(target) ? target : schema;
}

/** The object part of `schema`, or none where it is no object of named keys (a union, a scalar). */
function objectPart(schema: JsonSchema): ObjectPart | undefined {
  const properties = schema.properties;
  if (schema.type !== 'object' || !isRecord(properties)) return undefined;
  const required = Array.isArray(schema.required) ? schema.required.filter((k): k is string => typeof k === 'string') : [];
  return { properties: Object.fromEntries(Object.entries(properties).filter((e): e is [string, JsonSchema] => isRecord(e[1]))), required };
}

/** One document of `schema`: its root schema, and its definitions merged into `defs`, thrown where one name means two schemas. */
function documentOf(schema: Schema.Top, defs: Record<string, JsonSchema>, endpoint: string): JsonSchema {
  const doc = Schema.toJsonSchemaDocument(schema);
  for (const [name, definition] of Object.entries(doc.definitions)) {
    const had = defs[name];
    if (had !== undefined && JSON.stringify(had) !== JSON.stringify(definition))
      throw new Error(`${endpoint} defines ${name} twice, as two schemas: give one of them another identifier in objects`);
    defs[name] = definition;
  }
  return resolved(doc.schema, doc.definitions);
}

/**
 * The input of `endpoint`: the keys of its path and its query (but `watch`) and its JSON payload's, in one object, each required as its
 * part requires it; a payload that is a union of objects is the input's `anyOf`, each member's keys beside the path's and the query's.
 * Thrown where a key is said by two parts, since a call could not tell where it goes.
 */
function inputOf(endpoint: EndpointRead, name: string): Pick<PortTool, 'inputSchema' | 'pathKeys' | 'queryKeys'> {
  const defs: Record<string, JsonSchema> = {};
  const partOf = (schema: Schema.Top | undefined, what: string): ObjectPart => {
    if (schema === undefined) return { properties: {}, required: [] };
    const part = objectPart(documentOf(schema, defs, name));
    if (part === undefined) throw new Error(`${name}'s ${what} is no object of named keys: declare it a Struct in objects`);
    return part;
  };
  const path = partOf(endpoint.params, 'path');
  const query = partOf(endpoint.query, 'query');
  const queryKeys = Object.keys(query.properties).filter((k) => !UNTAKEN_QUERY.includes(k));
  const payloads = [...endpoint.payload.values()].flatMap((p) => p.schemas).map((s) => documentOf(s, defs, name));
  const members = payloads.flatMap((p) => {
    const anyOf = p.anyOf ?? p.oneOf;
    return Array.isArray(anyOf) ? anyOf.filter(isRecord).map((m) => resolved(m, defs)) : [p];
  });
  const parts = members.map((m) => {
    const part = objectPart(m);
    if (part === undefined)
      throw new Error(`${name}'s payload is no object of named keys: declare it a Struct, or a union of them, in objects`);
    return part;
  });
  const said = new Map<string, string>();
  const say = (keys: readonly string[], where: string) => {
    for (const key of keys) {
      const before = said.get(key);
      if (before !== undefined && before !== where)
        throw new Error(`${name}'s input says ${key} in its ${before} and its ${where}: rename one of them in objects' Api`);
      said.set(key, where);
    }
  };
  say(Object.keys(path.properties), 'path');
  say(queryKeys, 'query');
  for (const part of parts) say(Object.keys(part.properties), 'payload');
  const own = (part: ObjectPart, keys: readonly string[]) =>
    Object.fromEntries(
      keys.flatMap((k) => {
        const value = part.properties[k];
        return value === undefined ? [] : [[k, value] as const];
      }),
    );
  const single = parts.length === 1 ? parts[0] : undefined;
  const required = [...path.required, ...query.required.filter((k) => queryKeys.includes(k)), ...(single?.required ?? [])];
  return {
    inputSchema: {
      type: 'object',
      properties: { ...path.properties, ...own(query, queryKeys), ...single?.properties },
      ...(required.length > 0 ? { required } : {}),
      ...(parts.length > 1 ? { anyOf: members } : {}),
      ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
    },
    pathKeys: Object.keys(path.properties),
    queryKeys,
  };
}

/**
 * A tool's description: its verb's help, how the CLI says it, and the endpoint it calls; then how the port answers it — a `Table` as its
 * lines, a page of `PORT_PAGE` where a call gives no `limit`, and each default its link sends where the call gives none.
 */
const describe = (verb: PortVerb, method: string, path: string, how: Pick<PortTool, 'table' | 'defaults' | 'queryKeys'>): string => {
  const usage = `nemia ${[verb.name, verb.usage].filter(Boolean).join(' ')}`;
  return [
    ...verb.help,
    '',
    usage,
    `${method} ${path}`,
    ...(how.table ? [`Answers a line per item, as \`${verb.name} -o wide\` prints them.`] : []),
    ...(how.queryKeys.includes('limit')
      ? [`Answers ${PORT_PAGE} at most unless limit is given; a last line or metadata.continue names the token for the next page.`]
      : []),
    ...Object.entries(how.defaults).map(
      ([key, value]) => `Sends ${key}=${value} where the call gives no ${key}: give it to ask otherwise.`,
    ),
  ].join('\n');
};

/** The defaults `link` sends, thrown where one names a key `queryKeys` has not: a call could never send it. */
const defaultsOf = (tool: string, query: Readonly<Record<string, string>>, queryKeys: readonly string[]): Record<string, string> => {
  for (const key of Object.keys(query))
    if (!queryKeys.includes(key))
      throw new Error(`${tool}'s link sends ${key} by default, which its endpoint's query does not take: drop it from the link's query`);
  return { ...query };
};

/**
 * The port's tools: one per link of `table`'s verbs then of `verbs`' (the verbs the CLI runs by hand, `CLI_VERBS`), in their order, each
 * its endpoint of `api` read by reflection. Thrown where a link names no endpoint of `api`, or one that streams.
 */
export function portTools(table: readonly PortVerb[], verbs: readonly PortVerb[], api: ApiRead): PortTool[] {
  const endpoints = new Map(
    Object.values(api.groups).flatMap((group) =>
      Object.values(group.endpoints).map((endpoint) => [`${group.identifier}.${endpoint.identifier}`, endpoint] as const),
    ),
  );
  return [...table, ...verbs].flatMap((verb) =>
    toolsOf(verb).map((link): PortTool => {
      const endpoint = endpoints.get(link.endpoint);
      if (endpoint === undefined) throw new Error(`${link.tool} links ${link.endpoint}, no endpoint of the Api: link one it declares`);
      if ([...endpoint.success].some(streams))
        throw new Error(`${link.tool} links ${link.endpoint}, which answers a stream: a tool answers once, so link an endpoint that does`);
      const method = methodOf(link.endpoint, endpoint.method);
      const input = inputOf(endpoint, link.tool);
      const how = {
        table: [...endpoint.success].some(printsTable),
        defaults: defaultsOf(link.tool, link.query, input.queryKeys),
        queryKeys: input.queryKeys,
      };
      return {
        name: link.tool,
        entry: verb.name,
        description: describe(verb, method, endpoint.path, how),
        annotations: toolHints(classWordOf(verb.class), method),
        endpoint: link.endpoint,
        method,
        path: endpoint.path,
        ...input,
        table: how.table,
        defaults: how.defaults,
      };
    }),
  );
}
