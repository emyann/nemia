/**
 * The one surface at a glance, on stdout: each command of the table (`objects`' `COMMAND_WORDS`) on a line with what it is everywhere
 * — `nemia <name>` on the command line, its tool on the MCP port, the endpoint of the api that serves both, what that takes and
 * answers, and who answers for it when an agent calls it — grouped by the api's groups; then the endpoints no command links, the
 * objects served by kind and the refusals. Off the table and the document the api serves (`openapiDocument`), so it needs no daemon,
 * no token and no request: `npm run api`, `npm run api -- <group>` for one group.
 */
import { toolsOf } from 'agent-orchestrator';
import { COMMAND_WORDS } from 'objects';
import { openapiDocument } from './openapi.ts';

/** A schema as the document names one where it is a reference, else how it is said in a word. */
type Shape = {
  readonly $ref?: string;
  readonly type?: string;
  readonly items?: Shape;
  readonly anyOf?: readonly Shape[];
  readonly oneOf?: readonly Shape[];
};

/** A body of the document, by its media type. */
type Content = Readonly<Record<string, { readonly schema?: Shape }>>;

/** An operation of the document, as far as the overview reads it. */
type Operation = {
  readonly tags?: readonly string[];
  readonly operationId?: string;
  readonly requestBody?: { readonly content?: Content };
  readonly responses?: Readonly<Record<string, { readonly content?: Content }>>;
};

/** An operation with where it is served. */
type Served = { readonly verb: string; readonly path: string; readonly group: string; readonly op: Operation };

/** An object's schema, as far as the overview reads it: the kind it names, where it is one of the served objects. */
type ObjectSchema = { readonly properties?: { readonly kind?: { readonly enum?: readonly string[] } } };

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** A schema's name as a person reads it: the document numbers a second schema of one name, and the number says nothing. */
const named = (name: string) => name.replace(/_\d+$/, '');

/**
 * A shape in a word: the schema it refers to, each of those it may be, a list of one, its type, or nothing where the document says
 * none.
 */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
const said = (shape: Shape | undefined): string => {
  if (shape === undefined) return '';
  if (shape.$ref !== undefined) return named(shape.$ref.split('/').at(-1) ?? '');
  const either = shape.anyOf ?? shape.oneOf;
  if (either !== undefined) return [...new Set(either.map(said).filter(Boolean))].join(' | ');
  return shape.type === 'array' ? `${said(shape.items)}[]` : (shape.type ?? '');
};

/** The first body among `content`, in a word: JSON's where there is one, else the media type it is served as. */
const bodyOf = (content: Content | undefined) => {
  const [type, body] = Object.entries(content ?? {})[0] ?? [];
  if (type === undefined) return '';
  return type === 'application/json' ? said(body?.schema) : type;
};

/** What an operation takes and what a success of it answers, as `<body> → <answer>`. */
const takesAndAnswers = (op: Operation) => {
  const ok = Object.entries(op.responses ?? {}).find(([code]) => code.startsWith('2'));
  return [bodyOf(op.requestBody?.content), '→', ok ? bodyOf(ok[1].content) || ok[0] : ''].filter(Boolean).join(' ');
};

/** `rows` as columns, each as wide as its widest cell, the last left ragged. */
const columns = (rows: readonly string[][]) => {
  const widths = rows.reduce<number[]>((w, row) => row.map((cell, i) => Math.max(w[i] ?? 0, cell.length)), []);
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? 0)))
      .join('  ')
      .trimEnd(),
  );
};

const document = openapiDocument() as {
  readonly paths: Readonly<Record<string, Readonly<Record<string, Operation>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, ObjectSchema>> };
};
const served = new Map<string, Served>();
for (const [path, item] of Object.entries(document.paths))
  for (const verb of VERBS) {
    const op = item[verb];
    if (op?.operationId !== undefined)
      served.set(op.operationId, { verb: verb.toUpperCase(), path, group: op.tags?.[0] ?? 'ungrouped', op });
  }

/** Who answers for a command when an agent calls it, in a word: its class, or that it reads bare and asks to set. */
const classOf = (words: (typeof COMMAND_WORDS)[number]) => (typeof words.class === 'string' ? words.class : 'read, ask to set');

const groups = new Map<string, string[][]>();
const linked = new Set<string>();
const machine: string[] = [];
for (const words of COMMAND_WORDS) {
  const tools = toolsOf(words);
  if (tools.length === 0) machine.push(`nemia ${words.name}`);
  tools.forEach((tool, i) => {
    const at = served.get(tool.endpoint);
    if (at === undefined) return;
    linked.add(tool.endpoint);
    const row = [
      i === 0 ? `nemia ${words.name}` : '',
      tool.tool,
      `${at.verb} ${at.path}`,
      takesAndAnswers(at.op),
      i === 0 ? classOf(words) : '',
    ];
    groups.set(at.group, [...(groups.get(at.group) ?? []), row]);
  });
}
const unlinked = new Map<string, string[][]>();
for (const [id, at] of served)
  if (!linked.has(id))
    unlinked.set(at.group, [...(unlinked.get(at.group) ?? []), ['', `· ${id}`, `${at.verb} ${at.path}`, takesAndAnswers(at.op)]]);

const only = process.argv[2];
const every = [...new Set([...groups.keys(), ...unlinked.keys()])];
if (only !== undefined && !every.includes(only)) {
  process.stderr.write(`the api has no group ${only}: its groups are ${every.join(', ')}. Type npm run api -- <group>.\n`);
  process.exit(2);
}

const schemas = Object.entries(document.components?.schemas ?? {});
const kinds = [...new Set(schemas.flatMap(([name, schema]) => (schema.properties?.kind?.enum?.length === 1 ? [named(name)] : [])))];
const refusals = schemas.map(([name]) => name).filter((name) => name.endsWith('Encoded'));
const shown = every.filter((group) => only === undefined || group === only);
const HEAD = ['COMMAND', 'MCP TOOL', 'ENDPOINT', 'TAKES → ANSWERS', 'AN AGENT'];

const out = [
  `nemia/v1, one surface: ${COMMAND_WORDS.length} commands, ${linked.size} of the api's ${served.size} endpoints behind them, ${every.length} groups`,
  ...shown.flatMap((group) => {
    const commands = groups.get(group) ?? [];
    const bare = unlinked.get(group) ?? [];
    return [
      '',
      `${group}: ${commands.filter((row) => row[0] !== '').length} commands, ${bare.length} endpoints no command links`,
      ...columns([HEAD, ...commands, ...bare.map((row) => [...row, ''])]).map((line) => `  ${line}`),
    ];
  }),
  ...(only === undefined
    ? [
        '',
        `commands with no tool on the port: a stream (${machine.length})`,
        `  ${machine.join(', ')}`,
        '',
        `objects served by kind (${kinds.length})`,
        `  ${kinds.join(', ')}`,
        '',
        `refusals (${refusals.length})`,
        `  ${refusals.map((name) => name.replace(/Encoded$/, '')).join(', ')}`,
        '',
        'AN AGENT: read, it reads; act, it acts; ask, the person is asked; answer, the person answers what waits on them; none, out of reach.',
        '· an endpoint no command links: a client reads it directly (the board, a sub-resource, a stream).',
        'the whole document, for a tool: node apps/api/src/openapi/print.ts',
      ]
    : []),
];
process.stdout.write(`${out.join('\n')}\n`);
