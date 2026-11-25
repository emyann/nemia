/**
 * What a tool of the MCP port says, written once for both of Nemia's seats: one tool for each endpoint a verb of the command table links
 * (`served`, named by `toolsOf`), its words its verb's help, its endpoint's own description (`OpenApi.Description`), its CLI usage, the
 * call, what each key of its input says it takes and how the port answers it (`toolWordsOf`, `toolLinesOf`); its input the JSON Schema of
 * the endpoint's path, query and payload joined into one object, read off the `Api` by reflection; and what the port needs to call it:
 * the endpoint's method and path, which keys fill the path and the query, whether the endpoint answers a `Table`, and the query values its
 * link sends where a call gives none (`defaults`). The api's MCP port describes each tool by these words (`toolDescriptionOf`), and
 * Nemia's verbs skill says them to her shell seat, so the two cannot drift. A link to a stream, a method that is not a call, a key two of
 * the three say, a default for a key the query has not, or an endpoint that says nothing of what it does is thrown as the words are read,
 * and so is a link's task the port could not answer (`taskOf`).
 * Pure, over the Schemas.
 */
import { Context, Option, Schema } from 'effect';
import { OpenApi } from 'effect/http-api';
import type { ApiEndpointName } from './api.ts';
import { type AskedAgainTask, CLI, type CommandWords, type FollowedTask, type LinkTask } from './command.ts';
import { type EndpointShape, keysOfEndpoint, streamsOf } from './endpoint-keys.ts';
import { READS } from './reads.ts';
import { Table } from './table.ts';

/** The page a list tool asks for where its call gives no `limit`. */
export const PORT_PAGE = 20;

/** A verb of a table as its tools are read: its name, its usage and help, and the endpoints it links. */
export type ToolVerb = Pick<CommandWords, 'name' | 'usage' | 'help' | 'served'>;

/** An endpoint of an `Api`, as it is read by reflection with its annotations, which carry what it does (`OpenApi.Description`). */
export type DescribedEndpoint = EndpointShape & { readonly annotations: Context.Context<never> };

/** An `Api`, as its tools read it: its groups, each its endpoints with their annotations. */
export type DescribedApi = {
  readonly groups: Readonly<
    Record<string, { readonly identifier: string; readonly endpoints: Readonly<Record<string, DescribedEndpoint>> }>
  >;
};

/** The methods a tool calls by: every one but those that answer no body to read. */
export type ToolMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

/** A key of a tool's input that says what it takes, with its words. */
export type KeySaid = { readonly key: string; readonly words: string };

/**
 * How a tool answers as an MCP task, as its link says it (`LinkTask`): a followed task carries, besides, the path of its read and the one
 * key of that path its id fills.
 */
export type ToolTask = AskedAgainTask | (FollowedTask & { readonly path: string; readonly pathKey: string });

/**
 * A tool's words: its name, the entry whose link it is, the endpoint it calls, its method and path, the keys that fill the path and the
 * query, its input, whether it answers a `Table`, the defaults its link sends, what the endpoint says it does (`said`), each key of
 * its input that says what it takes, and how it answers as an MCP task (`task`, null where its link says none).
 */
export type ToolWords = {
  readonly name: string;
  readonly entry: string;
  readonly endpoint: ApiEndpointName;
  readonly method: ToolMethod;
  readonly path: string;
  readonly pathKeys: readonly string[];
  readonly queryKeys: readonly string[];
  readonly inputSchema: ToolInput;
  readonly table: boolean;
  readonly defaults: Readonly<Record<string, string>>;
  readonly said: string;
  readonly keys: readonly KeySaid[];
  readonly task: ToolTask | null;
};

/**
 * A tool of the MCP port: the endpoint it calls, its name, the entry whose link it is, the query its link sends by default, and how it
 * answers as an MCP task (null where its link says none).
 */
export type LinkedTool = {
  readonly endpoint: ApiEndpointName;
  readonly tool: string;
  readonly entry: string;
  readonly query: Readonly<Record<string, string>>;
  readonly task: LinkTask | null;
};

/**
 * The tools of `entry`'s links (`served`), in order: the first named by the verb, each space `_` (`factory ls` is the tool
 * factory_ls), every other by its `as`; a later link with no `as` gives no tool, which the orchestrator's `commandBreaks` refuses.
 * @param entry The entry: its name and its links.
 */
export const toolsOf = (entry: Pick<CommandWords, 'name' | 'served'>) =>
  (entry.served ?? []).flatMap((link, i) => {
    const tool = i === 0 ? entry.name.replaceAll(' ', '_') : link.as;
    return tool === undefined
      ? []
      : [{ endpoint: link.endpoint, tool, entry: entry.name, query: link.query ?? {}, task: link.task ?? null } satisfies LinkedTool];
  });

/** The methods a tool calls by. */
const METHODS: readonly ToolMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** `method` as a tool's, or thrown where it is none: the port reads an answer's body. */
const methodOf = (endpoint: string, method: string) => {
  const found = METHODS.find((m) => m === method);
  if (found === undefined)
    throw new Error(`${endpoint} answers ${method}, which no tool calls: link a GET, POST, PUT, PATCH or DELETE endpoint`);
  return found;
};

/**
 * Whether a success of an endpoint is `Table`, or a union holding it among its members: read through the schema the endpoint carries it
 * on (its status or headers), as `HttpApiEndpoint` keeps each success.
 */
const printsTable = (success: Schema.Top) => {
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
function resolved(schema: JsonSchema, definitions: Readonly<Record<string, unknown>>) {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/$defs/')) return schema;
  const target = definitions[ref.slice('#/$defs/'.length)];
  return isRecord(target) ? target : schema;
}

/** The object part of `schema`, or none where it is no object of named keys (a union, a scalar). */
function objectPart(schema: JsonSchema) {
  const properties = schema.properties;
  if (schema.type !== 'object' || !isRecord(properties)) return undefined;
  const required = Array.isArray(schema.required) ? schema.required.filter((k): k is string => typeof k === 'string') : [];
  return { properties: Object.fromEntries(Object.entries(properties).filter((e): e is [string, JsonSchema] => isRecord(e[1]))), required };
}

/** One document of `schema`: its root schema, and its definitions merged into `defs`, thrown where one name means two schemas. */
function documentOf(schema: Schema.Top, defs: Record<string, JsonSchema>, endpoint: string) {
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
function inputOf(endpoint: EndpointShape, name: string) {
  const defs: Record<string, JsonSchema> = {};
  const partOf = (schema: Schema.Top | undefined, what: string) => {
    if (schema === undefined) return { properties: {}, required: [] };
    const part = objectPart(documentOf(schema, defs, name));
    if (part === undefined) throw new Error(`${name}'s ${what} is no object of named keys: declare it a Struct in objects`);
    return part;
  };
  const path = partOf(endpoint.params, 'path');
  const query = partOf(endpoint.query, 'query');
  const { pathKeys, queryKeys } = keysOfEndpoint(endpoint);
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
    pathKeys,
    queryKeys,
  } satisfies Pick<ToolWords, 'inputSchema' | 'pathKeys' | 'queryKeys'>;
}

/** What `schema` says it takes: its own `description`, or, where it is a definition whole (a bare `$ref` into `$defs`), that one's. */
const saidOf = (schema: JsonSchema, defs: Readonly<Record<string, JsonSchema>>) => {
  const own = schema.description;
  if (typeof own === 'string' && own.trim()) return own;
  const ref = schema.$ref;
  const referred = typeof ref === 'string' ? defs[ref.split('/').at(-1) ?? '']?.description : undefined;
  return typeof referred === 'string' && referred.trim() ? referred : undefined;
};

/**
 * Each key of `input` whose schema says what it takes (its JSON Schema `description`, as `objects` annotates it, or that of the
 * definition it is whole), with that: its own keys, then each key of a member of its `anyOf` it has not, the first member that says it.
 */
const keysSaid = (input: ToolInput) => {
  const defs = input.$defs ?? {};
  const members = (input.anyOf ?? []).flatMap((member) => {
    const properties = member.properties;
    return typeof properties === 'object' && properties !== null ? Object.entries(properties as Record<string, JsonSchema>) : [];
  });
  const said = new Map<string, string>();
  for (const [key, schema] of [...Object.entries(input.properties), ...members]) {
    const words = said.has(key) ? undefined : saidOf(schema, defs);
    if (words !== undefined) said.set(key, words);
  }
  return [...said].map(([key, words]) => ({ key, words }) satisfies KeySaid);
};

/** What `endpoint` says it does (`OpenApi.Description`, as `objects` annotates it), thrown where it says nothing. */
const endpointSaid = (name: string, endpoint: DescribedEndpoint) => {
  const said = Context.getOption(endpoint.annotations, OpenApi.Description).pipe(Option.filter((words) => words.trim().length > 0));
  if (Option.isNone(said))
    throw new Error(
      `${name} says nothing of what it does: describe it in objects, \`.annotate(OpenApi.Description, '…')\` where its group defines it`,
    );
  return said.value;
};

/** The defaults `link` sends, thrown where one names a key `queryKeys` has not: a call could never send it. */
const defaultsOf = (tool: string, query: Readonly<Record<string, string>>, queryKeys: readonly string[]) => {
  for (const key of Object.keys(query))
    if (!queryKeys.includes(key))
      throw new Error(`${tool}'s link sends ${key} by default, which its endpoint's query does not take: drop it from the link's query`);
  return { ...query };
};

/** The endpoints of an `Api`, by their names (`<group>.<endpoint>`). */
type Endpoints = ReadonlyMap<string, DescribedEndpoint>;

/**
 * How `link`'s tool answers as a task, thrown where the port could not answer it: a followed task whose read is no GET of the `Api`, one
 * that streams, or one whose path takes other than one key; a task asked again of a tool that is no GET, or whose `from` its query does
 * not take.
 */
const taskOf = (link: LinkedTool, method: ToolMethod, queryKeys: readonly string[], endpoints: Endpoints) => {
  const task = link.task;
  if (task === null) return null;
  if (task.kind === 'again') {
    if (method !== 'GET')
      throw new Error(`${link.tool}'s link asks its task again, which the port does on a GET alone: drop the task from the link`);
    if (!queryKeys.includes(task.from))
      throw new Error(`${link.tool}'s task reads on from ${task.from}, which its endpoint's query does not take: name a key it takes`);
    return task satisfies ToolTask as ToolTask;
  }
  const read = endpoints.get(task.read);
  if (read === undefined) throw new Error(`${link.tool}'s task reads ${task.read}, no endpoint of the Api: name a GET it declares`);
  if (read.method !== 'GET' || [...read.success].some(streamsOf))
    throw new Error(`${link.tool}'s task reads ${task.read}, which is no GET answered once: name a GET that answers once`);
  const { pathKeys } = keysOfEndpoint(read);
  const [pathKey, ...more] = pathKeys;
  if (pathKey === undefined || more.length > 0)
    throw new Error(`${link.tool}'s task reads ${task.read}, whose path takes other than one key: name a read of one thing by its id`);
  return { ...task, path: read.path, pathKey } satisfies ToolTask as ToolTask;
};

/** The words of the tool `link` names, its endpoint `endpoint` read by reflection; thrown where it streams or says nothing. */
function wordsOfLink(link: LinkedTool, endpoint: DescribedEndpoint, endpoints: Endpoints) {
  if ([...endpoint.success].some(streamsOf))
    throw new Error(`${link.tool} links ${link.endpoint}, which answers a stream: a tool answers once, so link an endpoint that does`);
  const method = methodOf(link.endpoint, endpoint.method);
  const input = inputOf(endpoint, link.tool);
  return {
    name: link.tool,
    entry: link.entry,
    endpoint: link.endpoint,
    method,
    path: endpoint.path,
    ...input,
    table: [...endpoint.success].some(printsTable),
    defaults: defaultsOf(link.tool, link.query, input.queryKeys),
    said: endpointSaid(link.endpoint, endpoint),
    keys: keysSaid(input.inputSchema),
    task: taskOf(link, method, input.queryKeys, endpoints),
  } satisfies ToolWords;
}

/**
 * The tools of the port, each with its words: one per link of `table`'s verbs then of `verbs`', in their order, each its endpoint of
 * `api` read by reflection, beside the verb it is a link of. Thrown where a link names no endpoint of `api`, one that streams, or one
 * that says nothing of what it does.
 * @param table The command table's verbs, each with its links.
 * @param verbs The verbs the CLI runs by hand, listed after the table's.
 * @param api The Api whose endpoints the links name.
 */
export function toolWordsOf<V extends ToolVerb>(table: readonly V[], verbs: readonly V[], api: DescribedApi) {
  const endpoints = new Map(
    Object.values(api.groups).flatMap((group) =>
      Object.values(group.endpoints).map((endpoint) => [`${group.identifier}.${endpoint.identifier}`, endpoint] as const),
    ),
  );
  return [...table, ...verbs].flatMap((verb) =>
    toolsOf(verb).map((link) => {
      const endpoint = endpoints.get(link.endpoint);
      if (endpoint === undefined) throw new Error(`${link.tool} links ${link.endpoint}, no endpoint of the Api: link one it declares`);
      return { verb, words: wordsOfLink(link, endpoint, endpoints) };
    }),
  );
}

/**
 * Whether the port asks a page of `PORT_PAGE` of the endpoint `endpoint` where a call gives no `limit`: a list's, or a read from a
 * cursor's, or a read `READS` does not bound; never a read by part, whose `limit` is its own.
 */
const portPaged = (endpoint: ApiEndpointName) => {
  const shape = Object.entries(READS).find(([name]) => name === endpoint)?.[1].shape;
  return shape === undefined || shape === 'page' || shape === 'cursor';
};

/**
 * A tool's description in its parts: its verb's help, what its endpoint says it does, how the CLI says it, the endpoint it calls, what each
 * key of its input says it takes (since the help is the command line's and its forms are not the input's), and how the port answers it — a
 * `Table` as its lines, a page of `PORT_PAGE` where a call gives no `limit` of a read the port pages (`portPaged`), and each default its
 * link sends.
 * @param verb The verb the tool is a link of.
 * @param tool The tool's words (`toolWordsOf`).
 */
export function toolLinesOf(verb: Pick<ToolVerb, 'name' | 'usage' | 'help'>, tool: ToolWords) {
  return {
    help: verb.help,
    said: tool.said,
    usage: `${CLI} ${[verb.name, verb.usage].filter(Boolean).join(' ')}`,
    call: `${tool.method} ${tool.path}`,
    keys: tool.keys.map(({ key, words }) => `${key}: ${words}`),
    answers: [
      ...(tool.table ? [`Answers a line per item, as \`${verb.name} -o wide\` prints them.`] : []),
      ...(tool.queryKeys.includes('limit') && portPaged(tool.endpoint)
        ? [`Answers ${PORT_PAGE} at most unless limit is given; a last line or metadata.continue names the token for the next page.`]
        : []),
      ...Object.entries(tool.defaults).map(
        ([key, value]) => `Sends ${key}=${value} where the call gives no ${key}: give it to ask otherwise.`,
      ),
    ],
  };
}

/**
 * A tool's description as the port lists it: its parts (`toolLinesOf`), the help, then what the endpoint does as a paragraph of its own,
 * then the usage, the call, each key's words and each answer line.
 * @param verb The verb the tool is a link of.
 * @param tool The tool's words (`toolWordsOf`).
 */
export function toolDescriptionOf(verb: Pick<ToolVerb, 'name' | 'usage' | 'help'>, tool: ToolWords) {
  const lines = toolLinesOf(verb, tool);
  return [...lines.help, '', lines.said, '', lines.usage, lines.call, ...lines.keys, ...lines.answers].join('\n');
}
