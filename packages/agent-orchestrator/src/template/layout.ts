/**
 * A factory template's folder, as draft 3 lays it out: its documents' types, the canonical layout as rules over its files' paths
 * (`layoutRefusals`), and what each YAML document must hold, key by key (`documentRefusals`). Pure: the store reads the folder and hands
 * in its paths and each document's data; a refusal points into a document by the keys and indexes that lead to it (`Refusal.at`), and the
 * store turns that into a line.
 */
import { HARNESS_KNOBS } from 'agent-runtime/vocabulary';
import { SKILL_NAME } from '../keys/index.ts';

/** The schema every document of a template is written in. */
export const API_VERSION = 'nemia.dev/v1alpha1';

/** A problem of a template: the file, the keys and indexes leading to the value in its document (none for the file), and the words. */
export type Refusal = { file: string; at: ReadonlyArray<string | number>; message: string };

/**
 * A template's folder as read: its name, each file by its path from the folder with `/` between parts, and each document that parsed, by
 * its file, as plain data.
 */
export type ReadFolder = { name: string; files: readonly string[]; documents: ReadonlyMap<string, unknown> };

/** A value given when the template is applied. */
export type ParamRef = { param: string };

/** A value written, or the parameter that gives it. */
export type Value<T> = T | ParamRef;

/** Text: the words themselves, a file of the folder (`{ path }`), or a parameter's value. A git or url source is not read yet. */
export type Text = string | { path: string } | ParamRef;

/** A value the person gives when the template is applied: its type, what it is for, and the value taken when they give none. */
export type Parameter = { type: 'string' | 'number' | 'boolean'; description: string; default?: string | number | boolean };

/** What a harness's block fences: the word of its fence key, and the tool lists of a harness that takes them. */
export type Fence = Readonly<Record<string, string | readonly string[]>>;

/** One harness's block, in its own words: its model, effort, context window, fence, and the flags handed to it as they are. */
export type Profile = {
  model?: Value<string>;
  effort?: Value<string>;
  context?: Value<string>;
  fence?: Fence;
  options?: Readonly<Record<string, string | number | true | readonly string[]>>;
};

/** A document's name, and what a person reads of it. */
export type Metadata = { name: string; description?: string };

/** Every YAML file of a template but its lock: one document. */
export type Document<K extends string, S> = { apiVersion: typeof API_VERSION; kind: K; metadata: Metadata; spec: S };

/**
 * The manifest's spec: the content's version, the factory's instruction and its rules, its parameters and who fills each
 * `<workflow>/<step>`.
 */
export type FactorySpec = {
  version: string;
  instruction?: Text;
  rules?: Text;
  parameters?: Readonly<Record<string, Parameter>>;
  hires: Readonly<Record<string, string>>;
};

/** An agent's spec: its portable part, and one block per harness under the harness's name (`Profile`). */
export type AgentSpec = {
  role: string;
  description: string;
  instructions?: Text;
  skills?: readonly string[];
  output?: { path: string };
  harness?: string;
} & { readonly [harness: string]: unknown };

/** What a step changes of the agent it hires: its harness, skills added, and one block per harness (`Profile`). */
export type Overrides = { harness?: string; skills?: readonly string[] } & { readonly [harness: string]: unknown };

/** A step of a workflow, in order: its wiring, what it reads of the store, what is tallied of its closeout, and its overrides. */
export type Step = {
  name: string;
  instruction?: Text;
  after?: readonly string[];
  input?: readonly string[];
  place?: string;
  workspace?: string;
  gate?: boolean;
  budget?: Value<number>;
  check?: Value<string>;
  loop?: string;
  rounds?: number;
  retries?: number;
  deadlineSeconds?: number;
  reads?: readonly string[];
  tally?: readonly string[];
  overrides?: Overrides;
};

/** What each of a template's YAML files is, and the name its document must carry: its folder's, or the template's for the manifest. */
export type DocumentFile = { kind: 'FactoryTemplate' | 'Workflow' | 'Agent' | 'Skill' | 'Lock'; name: string | undefined };

/** The kind of document `file` holds and the name it must carry, or undefined for a file that is not one of the layout's documents. */
export function documentFile(file: string, template: string): DocumentFile | undefined {
  const parts = file.split('/');
  if (file === 'nemia.yaml') return { kind: 'FactoryTemplate', name: template };
  if (file === 'nemia.lock.yaml') return { kind: 'Lock', name: undefined };
  if (parts.length !== 3) return undefined;
  const [holder, name, leaf] = parts;
  if (holder === 'workflows' && leaf === 'workflow.yaml') return { kind: 'Workflow', name };
  if (holder === 'agents' && leaf === 'agent.yaml') return { kind: 'Agent', name };
  if (holder === 'skills' && leaf === 'skill.yaml') return { kind: 'Skill', name };
  return undefined;
}

/** The files an agent's folder may hold. */
const AGENT_FILES = ['agent.yaml', 'instructions.md', 'output.schema.json'];

/** The files a template's root may hold. */
const ROOT_FILES = ['nemia.yaml', 'NEMIA.md', 'RULES.md', 'nemia.lock.yaml'];

/** The layout, said once for every refusal of a file outside it. */
const LAYOUT =
  "A template holds nemia.yaml, NEMIA.md, RULES.md and nemia.lock.yaml at its root; workflows/<workflow>/workflow.yaml, its steps' <step>.md, " +
  'README.md and any file that is not .md or .yaml; agents/<agent>/agent.yaml, instructions.md and output.schema.json; ' +
  'skills/<skill>/SKILL.md and anything beside it; and a file a {path:} names';

/** Whether `file`, in a workflow's folder (`rest`, the parts after its name), is one the layout gives it. */
const inWorkflow = (rest: readonly string[]): boolean =>
  (rest.length === 1 && (rest[0] === 'workflow.yaml' || rest[0].endsWith('.md'))) || !/\.(md|yaml)$/.test(rest[rest.length - 1]);

/** Whether the layout gives `file` a place; `named` are the files a `{ path }` of a document names. */
function inLayout(file: string, named: ReadonlySet<string>): boolean {
  if (named.has(file) || ROOT_FILES.includes(file)) return true;
  const [holder, name, ...rest] = file.split('/');
  if (name === undefined || rest.length === 0) return false;
  if (holder === 'workflows') return inWorkflow(rest);
  if (holder === 'agents') return rest.length === 1 && AGENT_FILES.includes(rest[0]);
  return holder === 'skills';
}

/** The file each folder of a kind must hold, and what the folder is. */
const HOLDS = { workflows: ['workflow.yaml', 'a workflow'], agents: ['agent.yaml', 'an agent'], skills: ['SKILL.md', 'a skill'] } as const;

/** What the folders of `files` lack or are misnamed: a folder of workflows/, agents/ or skills/ without its file, or not named a Name. */
function folderRefusals(files: readonly string[]): Refusal[] {
  const folders = new Set(
    files.flatMap((file) => {
      const [holder, name, ...rest] = file.split('/');
      return holder in HOLDS && name !== undefined && rest.length > 0 ? [`${holder}/${name}`] : [];
    }),
  );
  return [...folders].flatMap((folder) => {
    const [holder, name] = folder.split('/') as [keyof typeof HOLDS, string];
    const [file, what] = HOLDS[holder];
    const refusals: Refusal[] = [];
    if (!SKILL_NAME.test(name))
      refusals.push({ file: folder, at: [], message: `${folder} is not a name: ${what}'s folder is lowercase words joined by dashes.` });
    if (!files.includes(`${folder}/${file}`))
      refusals.push({
        file: folder,
        at: [],
        message: `${folder} holds no ${file}, and ${what} is its ${file}: write it, or remove the folder.`,
      });
    return refusals;
  });
}

/**
 * What the layout refuses of `folder`'s files: one outside it, a folder of workflows/, agents/ or skills/ without its file or not a name,
 * and a template with no nemia.yaml. `named` are the files a `{ path }` names, each in the layout.
 */
export function layoutRefusals(folder: Pick<ReadFolder, 'files'>, named: ReadonlySet<string>): Refusal[] {
  const outside = folder.files
    .filter((file) => !inLayout(file, named))
    .map((file) => ({ file, at: [], message: `${file} is outside the template's layout. ${LAYOUT}. Move it there, or remove it.` }));
  const manifest = folder.files.includes('nemia.yaml')
    ? []
    : [{ file: 'nemia.yaml', at: [], message: 'the template has no nemia.yaml, its manifest: write one, of kind FactoryTemplate.' }];
  return [...manifest, ...outside, ...folderRefusals(folder.files)];
}

/** A value's leaf kinds: what it must be, a `{ param }` allowed for `words` and `count`, and `not-yet` for a git or url source. */
type Leaf = 'string' | 'number' | 'boolean' | 'strings' | 'text' | 'words' | 'count' | 'option' | 'any' | 'not-yet';

/** A document's shape: a leaf, a list of one shape, or named fields, some required, and the shape of any other key (`rest`). */
type Shape =
  | Leaf
  | { readonly list: Shape }
  | { readonly fields: Readonly<Record<string, Shape>>; readonly required?: readonly string[]; readonly rest?: Shape };

/** The fence keys of every harness: each one's own key and its tool lists. */
export const FENCE_KEYS: readonly string[] = [
  ...new Set(Object.values(HARNESS_KNOBS).flatMap((knobs) => [knobs.fence.key, ...knobs.fence.lists])),
];

/** The keys a harness's block holds. */
export const PROFILE_KEYS = ['model', 'effort', 'context', 'fence', 'options'] as const;

const PROFILE: Shape = {
  fields: {
    model: 'words',
    effort: 'words',
    context: 'words',
    fence: { fields: Object.fromEntries(FENCE_KEYS.map((key) => [key, isList(key) ? 'strings' : 'string'])) },
    options: { fields: {}, rest: 'option' },
  },
};

/** Whether the fence key `key` is a tool list of the harness that takes it. */
function isList(key: string): boolean {
  return Object.values(HARNESS_KNOBS).some((knobs) => knobs.fence.lists.includes(key));
}

/** One block per harness, named as the harness. */
const BLOCKS: Readonly<Record<string, Shape>> = Object.fromEntries(Object.keys(HARNESS_KNOBS).map((harness) => [harness, PROFILE]));

const METADATA: Shape = {
  fields: { name: 'string', description: 'string', labels: { fields: {}, rest: 'string' }, annotations: { fields: {}, rest: 'string' } },
  required: ['name'],
};

const OVERRIDES: Shape = { fields: { harness: 'string', skills: 'strings', ...BLOCKS } };

const STEP: Shape = {
  fields: {
    name: 'string',
    instruction: 'text',
    after: 'strings',
    input: 'strings',
    place: 'string',
    workspace: 'string',
    gate: 'boolean',
    budget: 'count',
    check: 'words',
    loop: 'string',
    rounds: 'number',
    retries: 'number',
    deadlineSeconds: 'number',
    reads: 'strings',
    tally: 'strings',
    overrides: OVERRIDES,
  },
  required: ['name'],
};

/** Each kind's spec. */
const SPECS: Readonly<Record<Exclude<DocumentFile['kind'], 'Lock'>, Shape>> = {
  FactoryTemplate: {
    fields: {
      version: 'string',
      instruction: 'text',
      rules: 'text',
      parameters: {
        fields: {},
        rest: { fields: { type: 'string', description: 'string', default: 'any' }, required: ['type', 'description'] },
      },
      hires: { fields: {}, rest: 'string' },
      imports: { list: 'not-yet' },
    },
    required: ['version', 'hires'],
  },
  Workflow: { fields: { steps: { list: STEP } }, required: ['steps'] },
  Agent: {
    fields: {
      role: 'string',
      description: 'string',
      instructions: 'text',
      skills: 'strings',
      output: { fields: { path: 'string' }, required: ['path'] },
      harness: 'string',
      ...BLOCKS,
    },
    required: ['role', 'description'],
  },
  Skill: { fields: { fetch: { fields: {}, rest: 'not-yet' } } },
};

/** The shape of a whole document of `kind`. */
const documentShape = (kind: DocumentFile['kind']): Shape =>
  kind === 'Lock'
    ? { fields: { apiVersion: 'string', kind: 'string', resolved: { list: 'not-yet' } }, required: ['apiVersion', 'kind'] }
    : {
        fields: { apiVersion: 'string', kind: 'string', metadata: METADATA, spec: SPECS[kind] },
        required: ['apiVersion', 'kind', 'metadata', 'spec'],
      };

/** Whether `value` is a map, as YAML's data model has one: an object that is no list. */
export const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `value` is a `{ param }` and nothing more. */
export const isParam = (value: unknown): value is ParamRef =>
  isMap(value) && Object.keys(value).length === 1 && typeof value.param === 'string';

/** A key path as a person reads it: `spec.steps[1].budget`. */
export const spelled = (at: ReadonlyArray<string | number>): string =>
  at.map((part, i) => (typeof part === 'number' ? `[${part}]` : i === 0 ? part : `.${part}`)).join('') || 'the document';

/** Why a source at `at` is not read: v1 carries every file in the folder. */
const notYet = (at: ReadonlyArray<string | number>): string =>
  `${spelled(at)} is a git or url source, and a template reads none yet: not yet. Carry the file in the template's folder, and name it {path: <file>}.`;

/** What a text is: words, `{ path: <file> }` or `{ param: <name> }`; a git or url source is not yet. */
function textRefusal(value: unknown, at: ReadonlyArray<string | number>): string | undefined {
  if (typeof value === 'string' || isParam(value)) return undefined;
  if (isMap(value) && ('git' in value || 'url' in value)) return notYet(at);
  if (isMap(value) && Object.keys(value).length === 1 && typeof value.path === 'string') return undefined;
  return `${spelled(at)} is text: the words themselves, {path: <file>} or {param: <name>}.`;
}

/** Whether `value` is a list of strings. */
const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** What each plain leaf must be, and how it is said. */
const LEAVES: Readonly<Record<string, [(value: unknown) => boolean, string]>> = {
  string: [(v) => typeof v === 'string', 'a string'],
  number: [(v) => typeof v === 'number', 'a number'],
  boolean: [(v) => typeof v === 'boolean', 'true or false'],
  strings: [isStrings, 'a list of strings'],
  words: [(v) => typeof v === 'string' || isParam(v), 'a string or {param: <name>}'],
  count: [(v) => typeof v === 'number' || isParam(v), 'a number or {param: <name>}'],
  option: [(v) => ['string', 'number'].includes(typeof v) || v === true || isStrings(v), 'a string, a number, true or a list of strings'],
  any: [() => true, 'anything'],
};

/** Why the leaf at `at` is not what `leaf` says, or undefined. */
function leafRefusal(leaf: Leaf, value: unknown, at: ReadonlyArray<string | number>): string | undefined {
  if (leaf === 'not-yet') return notYet(at);
  if (leaf === 'text') return textRefusal(value, at);
  const [holds, what] = LEAVES[leaf];
  return holds(value) ? undefined : `${spelled(at)} is ${what}, and here it is ${JSON.stringify(value)}.`;
}

/** What a map at `at` breaks of its `fields` shape: a required key missing, a key it has no place for, and each value's own breaks. */
function fieldsRefusals(
  file: string,
  shape: Extract<Shape, { fields: unknown }>,
  value: unknown,
  at: ReadonlyArray<string | number>,
): Refusal[] {
  if (!isMap(value)) return [{ file, at, message: `${spelled(at)} is a map of keys, and here it is ${JSON.stringify(value)}.` }];
  const known = Object.keys(shape.fields);
  const missing = (shape.required ?? [])
    .filter((key) => !(key in value))
    .map((key) => ({ file, at, message: `${spelled(at)} has no \`${key}\`, which it requires: write it.` }));
  const each = Object.entries(value).flatMap(([key, held]): Refusal[] => {
    const inner = shape.fields[key] ?? shape.rest;
    if (inner !== undefined) return shapeRefusals(file, inner, held, [...at, key]);
    const message = `${spelled([...at, key])} is no key of ${spelled(at)}, which holds ${known.join(', ')}: rename it, or remove it.`;
    return [{ file, at: [...at, key], message }];
  });
  return [...missing, ...each];
}

/** What `value`, at `at` in `file`, breaks of `shape`. */
function shapeRefusals(file: string, shape: Shape, value: unknown, at: ReadonlyArray<string | number>): Refusal[] {
  if (typeof shape === 'string') {
    const message = leafRefusal(shape, value, at);
    return message === undefined ? [] : [{ file, at, message }];
  }
  if ('fields' in shape) return fieldsRefusals(file, shape, value, at);
  if (!Array.isArray(value)) return [{ file, at, message: `${spelled(at)} is a list, and here it is ${JSON.stringify(value)}.` }];
  return value.flatMap((item, i) => shapeRefusals(file, shape.list, item, [...at, i]));
}

/** What the envelope of `doc`, a document of `kind` in `file`, breaks: its apiVersion, its kind, and its name, its folder's. */
function envelopeRefusals(file: string, expected: DocumentFile, doc: Record<string, unknown>): Refusal[] {
  const refusals: Refusal[] = [];
  if (doc.apiVersion !== API_VERSION)
    refusals.push({ file, at: ['apiVersion'], message: `apiVersion is ${JSON.stringify(doc.apiVersion)}: write ${API_VERSION}.` });
  if (doc.kind !== expected.kind)
    refusals.push({
      file,
      at: ['kind'],
      message: `kind is ${JSON.stringify(doc.kind)}, and ${file} holds a ${expected.kind}: write kind: ${expected.kind}.`,
    });
  const name = isMap(doc.metadata) ? doc.metadata.name : undefined;
  if (expected.name === undefined || typeof name !== 'string') return refusals;
  if (!SKILL_NAME.test(name))
    refusals.push({ file, at: ['metadata', 'name'], message: `metadata.name ${name} is not a name: lowercase words joined by dashes.` });
  else if (name !== expected.name)
    refusals.push({
      file,
      at: ['metadata', 'name'],
      message: `metadata.name is ${name}, and a document's name is its folder's: write ${expected.name}, or rename the folder.`,
    });
  return refusals;
}

/**
 * What the document `doc` of `file` breaks, in a template named `template`: a wrong apiVersion or kind, a name not its folder's or not a
 * name, a key the kind has no place for at any level, a value of the wrong type, and a git or url source, refused as not yet.
 */
export function documentRefusals(file: string, doc: unknown, template: string): Refusal[] {
  const expected = documentFile(file, template);
  if (expected === undefined) return [];
  if (!isMap(doc)) return [{ file, at: [], message: `${file} is not a map of keys: write the document, ${expected.kind}.` }];
  return [...envelopeRefusals(file, expected, doc), ...shapeRefusals(file, documentShape(expected.kind), doc, [])];
}
